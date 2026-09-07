// Providers que se ejecutan directamente en el navegador.
// AUDIAR usa estas funciones desde GitHub Pages sin backend intermedio.

import type { Certainty, FreesoundResultItem, SceneAnalysis, SoundDesignProposal, SoundIdea } from "./types";

const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "qwen/qwen3.6-27b"; // verificar vigencia en console.groq.com/docs/vision
const PROPOSAL_MODEL = "qwen/qwen3.6-27b"; // compatibilidad con el motor anterior
const FREESOUND_SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROPOSALS_PER_CATEGORY = 6;
const MAX_OUTPUT_TOKENS = 900;
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,/;

export function isCommerciallySafeDirect(licenseUrlOrName: string): boolean {
  const l = licenseUrlOrName.toLowerCase();
  if (l.includes("publicdomain/zero")) return true;
  if (l.includes("licenses/by/")) return true;
  if (l === "attribution") return true;
  if (l === "creative commons 0" || l === "cc0") return true;
  return false;
}

export async function searchFreesoundDirect(
  query: string,
  apiKey: string,
  maxResults = 12
): Promise<FreesoundResultItem[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const url = new URL(FREESOUND_SEARCH_ENDPOINT);
  url.searchParams.set("query", trimmedQuery);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("fields", "id,name,tags,duration,license,previews");
  url.searchParams.set("page_size", String(Math.min(maxResults * 3, 50)));
  url.searchParams.set("filter", 'license:("Creative Commons 0" OR "Attribution")');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Freesound search failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const rawResults: any[] = Array.isArray(data.results) ? data.results : [];

  return rawResults
    .map((r): FreesoundResultItem => {
      const license = String(r.license ?? "");
      return {
        id: r.id,
        name: r.name,
        license,
        commerciallySafe: isCommerciallySafeDirect(license),
        durationSeconds: typeof r.duration === "number" ? r.duration : 0,
        previewUrl: r.previews?.["preview-hq-mp3"] ?? r.previews?.["preview-lq-mp3"] ?? "",
        freesoundUrl: `https://freesound.org/s/${r.id}/`,
        tags: Array.isArray(r.tags) ? r.tags.map((tag: unknown) => String(tag)) : [],
      };
    })
    .filter((r) => r.commerciallySafe && Boolean(r.previewUrl))
    .sort((a, b) => scoreFreesoundMatch(b, trimmedQuery) - scoreFreesoundMatch(a, trimmedQuery))
    .slice(0, maxResults);
}

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "background", "close", "distant", "far", "field", "for", "from",
  "in", "inside", "interior", "near", "of", "on", "outdoor", "outside", "room", "sound", "the",
  "to", "very", "wide", "with",
]);

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ ]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function scoreFreesoundMatch(result: FreesoundResultItem, query: string): number {
  const tokens = [...new Set(queryTokens(query))];
  if (tokens.length === 0) return 0;
  const haystack = `${result.name} ${(result.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 3 : 2;
  }
  if (haystack.includes(query.toLowerCase())) score += 6;
  return score;
}

function coerceCertaintyDirect(value: unknown): Certainty {
  return value === "observed" || value === "probable" || value === "possible" ? value : "possible";
}

function coerceCueDirect(value: any) {
  return {
    text: typeof value?.text === "string" ? value.text.trim() : "",
    certainty: coerceCertaintyDirect(value?.certainty),
    searchQuery: typeof value?.searchQuery === "string" ? value.searchQuery.trim() : "",
  };
}

function coerceCueArrayDirect(value: any) {
  return Array.isArray(value) ? value.map(coerceCueDirect).filter((c: any) => c.text.length > 0) : [];
}

function validateImageDataUrlDirect(image: string): string | null {
  if (!DATA_URL_PATTERN.test(image)) {
    return "La imagen no tiene un formato válido (se esperaba jpeg, png o webp).";
  }
  const base64 = image.slice(image.indexOf(",") + 1);
  const approxBytes = (base64.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    const mb = (approxBytes / (1024 * 1024)).toFixed(1);
    return `La imagen es demasiado grande (~${mb}MB, máximo 20MB). Probá con una versión más liviana.`;
  }
  return null;
}

const ANALYSIS_PROMPT = `Sos diseñador de sonido para cine. Mirá el fotograma y prepará una base MUY CONCRETA para buscar sonidos en Freesound.

No hagas una descripción visual larga. Identificá primero el contexto acústico real de la imagen: lugar, interior/exterior, escala, superficies, presencia humana, acciones visibles y fuentes sonoras plausibles. Nunca inventes una selva si la imagen muestra una ciudad, ni agregues sonidos incompatibles con el contexto visual.

Para CADA categoría (ambientes, efectos y foley) entregá EXACTAMENTE 3 sonidos útiles, salvo que una categoría sea realmente imposible; en ese caso podés usar menos. Los sonidos deben ser diferentes entre sí y directamente relacionados con la escena.

Cada sonido debe tener:
- text: nombre corto en español.
- certainty: observed, probable o possible.
- searchQuery: término MUY CORTO EN INGLÉS para Freesound, normalmente 2 a 5 palabras. Debe describir el sonido y mantener los elementos esenciales del contexto (por ejemplo, "urban traffic ambience", "wet asphalt footsteps", "metal door slam"). No escribas frases narrativas ni "audio recording of...".

El searchQuery es MUY IMPORTANTE: debe ser una consulta de biblioteca sonora, no una traducción literal de una frase larga. Conservá el contexto que evita resultados absurdos: si es ciudad, usá "urban", "city", "street", "traffic" cuando corresponda; si es bosque, "forest", etc.

Todo el texto salvo searchQuery debe estar en español. Respondé SOLO JSON válido, sin texto adicional:
{
  "sceneDescription": string,
  "place": {"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string},
  "indoorOutdoor": {"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string},
  "timeOfDay": {"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string},
  "weather": {"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string},
  "materialsAndSurfaces": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "humanPresence": {"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string},
  "potentialSoundSources": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "observedActions": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "offScreenSources": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "ambience": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "effects": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "foley": [{"text": string, "certainty": "observed"|"probable"|"possible", "searchQuery": string}],
  "dialogue": [],
  "narrativeIdeas": []
}`;

export async function analyzeFrameDirect(image: string, apiKey: string): Promise<SceneAnalysis> {
  const validationError = validateImageDataUrlDirect(image);
  if (validationError) throw new Error(validationError);

  const res = await fetch(GROQ_CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: "user", content: [{ type: "text", text: ANALYSIS_PROMPT }, { type: "image_url", image_url: { url: image } }] },
      ],
      temperature: 0.3,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq vision request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq no devolvió contenido de análisis");
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("El análisis no llegó en formato JSON válido");
  }

  const emptyCue = { text: "", certainty: "possible" as Certainty, searchQuery: "" };
  const emptyArray: any[] = [];

  return {
    sceneDescription: typeof parsed?.sceneDescription === "string" ? parsed.sceneDescription.trim() : "",
    place: coerceCueDirect(parsed?.place ?? emptyCue),
    indoorOutdoor: coerceCueDirect(parsed?.indoorOutdoor ?? emptyCue),
    timeOfDay: coerceCueDirect(parsed?.timeOfDay ?? emptyCue),
    weather: coerceCueDirect(parsed?.weather ?? emptyCue),
    materialsAndSurfaces: coerceCueArrayDirect(parsed?.materialsAndSurfaces ?? emptyArray),
    humanPresence: coerceCueDirect(parsed?.humanPresence ?? emptyCue),
    potentialSoundSources: coerceCueArrayDirect(parsed?.potentialSoundSources ?? emptyArray),
    observedActions: coerceCueArrayDirect(parsed?.observedActions ?? emptyArray),
    offScreenSources: coerceCueArrayDirect(parsed?.offScreenSources ?? emptyArray),
    ambience: coerceCueArrayDirect(parsed?.ambience ?? emptyArray),
    effects: coerceCueArrayDirect(parsed?.effects ?? emptyArray),
    foley: coerceCueArrayDirect(parsed?.foley ?? emptyArray),
    dialogue: [],
    narrativeIdeas: [],
  };
}

// --- Groq proposal: compatibilidad con el motor anterior ---

function coercePriorityDirect(value: unknown) {
  return value === "primary" || value === "secondary" || value === "accent" ? value : "secondary";
}

const PROPOSAL_PROMPT = `Sos un diseñador de sonido profesional para cine y video. Proponé sonidos útiles para una escena a partir del análisis recibido.

Para cada propuesta asigná certainty (observed/probable/possible), priority (primary/secondary/accent), una rationale breve, spatialPerspective cuando aporte algo y un searchQuery EN INGLÉS corto y útil para Freesound.

Priorizá pertinencia sobre cantidad. Respondé SOLO JSON válido.`;

function coerceIdeaDirect(value: any, category: SoundIdea["category"], index: number): SoundIdea | null {
  const description = typeof value?.description === "string" ? value.description.trim() : "";
  if (!description) return null;
  const spatialPerspective = typeof value?.spatialPerspective === "string" ? value.spatialPerspective.trim() : "";
  return {
    id: `${category}-${index}-${crypto.randomUUID()}`,
    category,
    description,
    rationale: typeof value?.rationale === "string" ? value.rationale.trim() : "",
    certainty: coerceCertaintyDirect(value?.certainty),
    priority: coercePriorityDirect(value?.priority),
    spatialPerspective,
    searchQuery: typeof value?.searchQuery === "string" ? value.searchQuery.trim() : "",
    searching: false,
    expanded: false,
  };
}

function coerceProposalArrayDirect(value: any, category: SoundIdea["category"]): SoundIdea[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => coerceIdeaDirect(item, category, index)).filter((x): x is SoundIdea => Boolean(x)).slice(0, MAX_PROPOSALS_PER_CATEGORY);
}

export async function generateSoundDesignProposalDirect(
  analysis: SceneAnalysis,
  apiKey: string
): Promise<SoundDesignProposal> {
  const res = await fetch(GROQ_CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: PROPOSAL_MODEL,
      messages: [{ role: "user", content: `${PROPOSAL_PROMPT}\n${JSON.stringify(analysis)}` }],
      temperature: 0.5,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq proposal request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq no devolvió contenido de propuesta sonora");
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("La propuesta sonora no llegó en formato JSON válido");
  }
  return {
    ambientes: coerceProposalArrayDirect(parsed?.ambientes, "ambientes"),
    efectos: coerceProposalArrayDirect(parsed?.efectos, "efectos"),
    foley: coerceProposalArrayDirect(parsed?.foley, "foley"),
    dialogos: coerceProposalArrayDirect(parsed?.dialogos, "dialogos"),
  };
}
