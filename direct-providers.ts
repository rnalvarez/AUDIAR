// Providers que se ejecutan directamente en el navegador.
// AUDIAR usa estas funciones desde GitHub Pages sin backend intermedio.

import type { Certainty, FreesoundResultItem, SceneAnalysis, SoundDesignProposal, SoundIdea } from "./types";

const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "qwen/qwen3.6-27b"; // verificar vigencia en console.groq.com/docs/vision
const PROPOSAL_MODEL = "qwen/qwen3.6-27b"; // verificar vigencia en console.groq.com/docs/models
const FREESOUND_SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROPOSALS_PER_CATEGORY = 6;
const MAX_OUTPUT_TOKENS = 900;
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,/;

// --- Freesound: mismo isCommerciallySafe que provider-freesound.ts ---

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
  const url = new URL(FREESOUND_SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("fields", "id,name,tags,duration,license,previews");
  url.searchParams.set("page_size", String(Math.min(maxResults * 2, 50)));
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
    .filter((r) => r.commerciallySafe)
    .slice(0, maxResults);
}

// --- Groq vision: mismo prompt y coerción que provider-vision.ts ---

function coerceCertaintyDirect(value: unknown): Certainty {
  return value === "observed" || value === "probable" || value === "possible" ? value : "possible";
}

function coerceCueDirect(value: any) {
  return {
    text: typeof value?.text === "string" ? value.text.trim() : "",
    certainty: coerceCertaintyDirect(value?.certainty),
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

const ANALYSIS_PROMPT = `Sos un asistente de diseño sonoro para cine y video. Tu tarea es mirar la imagen de un fotograma y extraer información ÚTIL PARA DISEÑAR SONIDO — no una descripción visual genérica del tipo "una mujer está sentada en una habitación".

Para cada observación asigná un nivel de certeza:
- "observed": algo directamente visible en la imagen.
- "probable": una inferencia razonable a partir de lo visible.
- "possible": una sugerencia creativa o especulativa, útil para el diseño pero no verificable desde la imagen.

Nunca presentes una sugerencia "possible" como si fuera un hecho "observed". Ante la duda, preferí "probable" o "possible" antes que "observed".

Cubrí, cuando sea relevante: lugar, interior/exterior, momento del día, clima, materiales y superficies visibles, presencia humana, fuentes sonoras potenciales (objetos, vehículos, animales, maquinaria), acciones observables, fuentes fuera de campo plausibles, y sonidos posibles agrupados en ambiente, efectos, foley, diálogo, y sonidos subjetivos/narrativos (ideas creativas más allá de lo literal).

Ejemplo de estilo (persona caminando por una calle mojada de noche): ambiente → "calle urbana nocturna" (observed), "tráfico lejano" (probable); efectos → "agua desplazada por vehículos pasando" (probable), "semáforo sonoro" (possible); foley → "pasos sobre asfalto mojado" (observed); diálogo → "ninguna fuente evidente" (observed).

Todo el texto de tu respuesta debe estar en español, salvo las claves del JSON. Respondé ÚNICAMENTE con un objeto JSON con esta forma exacta (sin texto antes ni después):

{
  "sceneDescription": string,
  "place": {"text": string, "certainty": "observed"|"probable"|"possible"},
  "indoorOutdoor": {"text": string, "certainty": "..."},
  "timeOfDay": {"text": string, "certainty": "..."},
  "weather": {"text": string, "certainty": "..."},
  "materialsAndSurfaces": [{"text": string, "certainty": "..."}],
  "humanPresence": {"text": string, "certainty": "..."},
  "potentialSoundSources": [{"text": string, "certainty": "..."}],
  "observedActions": [{"text": string, "certainty": "..."}],
  "offScreenSources": [{"text": string, "certainty": "..."}],
  "ambience": [{"text": string, "certainty": "..."}],
  "effects": [{"text": string, "certainty": "..."}],
  "foley": [{"text": string, "certainty": "..."}],
  "dialogue": [{"text": string, "certainty": "..."}],
  "narrativeIdeas": [{"text": string, "certainty": "..."}]
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
      temperature: 0.4,
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
  return {
    sceneDescription: typeof parsed?.sceneDescription === "string" ? parsed.sceneDescription.trim() : "",
    place: coerceCueDirect(parsed?.place),
    indoorOutdoor: coerceCueDirect(parsed?.indoorOutdoor),
    timeOfDay: coerceCueDirect(parsed?.timeOfDay),
    weather: coerceCueDirect(parsed?.weather),
    materialsAndSurfaces: coerceCueArrayDirect(parsed?.materialsAndSurfaces),
    humanPresence: coerceCueDirect(parsed?.humanPresence),
    potentialSoundSources: coerceCueArrayDirect(parsed?.potentialSoundSources),
    observedActions: coerceCueArrayDirect(parsed?.observedActions),
    offScreenSources: coerceCueArrayDirect(parsed?.offScreenSources),
    ambience: coerceCueArrayDirect(parsed?.ambience),
    effects: coerceCueArrayDirect(parsed?.effects),
    foley: coerceCueArrayDirect(parsed?.foley),
    dialogue: coerceCueArrayDirect(parsed?.dialogue),
    narrativeIdeas: coerceCueArrayDirect(parsed?.narrativeIdeas),
  };
}

// --- Groq proposal: mismo prompt y coerción que provider-sound-design.ts ---

function coercePriorityDirect(value: unknown) {
  return value === "primary" || value === "secondary" || value === "accent" ? value : "secondary";
}

const PROPOSAL_PROMPT = `Sos un diseñador de sonido profesional para cine y video. Tu trabajo NO es identificar objetos en una imagen — es pensar en términos de diseño sonoro.

Antes de proponer nada, razoná para vos mismo (no hace falta mostrar las respuestas) sobre esta escena:
1. ¿Dónde estamos?
2. ¿Qué espacio acústico sugiere la imagen?
3. ¿Qué sonidos son indispensables?
4. ¿Qué sonidos son secundarios?
5. ¿Qué sonidos podrían ocurrir fuera de campo?
6. ¿Qué acciones pueden tener Foley?
7. ¿Qué sonidos ayudan a establecer escala y distancia?
8. ¿Qué sonidos pueden aportar narrativa?
9. ¿Qué elementos conviene NO sonorizar?
10. ¿Qué podría resolverse con ambiente continuo en lugar de múltiples efectos?

Dejá que estas ideas de diseño sonoro influyan en qué elegís y en qué prioridad les asignás — sin nombrarlas como texto académico en las propuestas: proximidad, profundidad, fuera de campo, continuidad, contraste, silencio, perspectiva, subjetividad.

Para cada propuesta asigná:
- certainty: "observed" (directamente sugerido por lo que el análisis marcó como observado), "probable" (plausible en esta escena aunque no sea visible), o "possible" (posibilidad creativa de diseño, no una inferencia directa).
- priority: "primary" (indispensable — sin este sonido la escena suena incompleta o incorrecta), "secondary" (refuerza y da riqueza, pero la escena funciona sin él), o "accent" (detalle puntual u ocasional, textura, no estructural).

Nunca presentes una idea "possible" como si fuera "observed". Priorizá calidad sobre cantidad: como máximo ${MAX_PROPOSALS_PER_CATEGORY} propuestas por categoría, idealmente menos — entre 2 y 4 suele ser lo profesional, y no todas necesitan ser "primary" (de hecho, la mayoría de una escena bien diseñada NO lo es). No propongas algo solo para llenar la lista.

Cada propuesta necesita una razón breve (rationale) de por qué encaja en esta escena y en esa prioridad — no solo el nombre del sonido.

Cuando aporte algo real (no siempre hace falta), agregá spatialPerspective: una frase corta en español sobre proximidad, distancia o perspectiva de ese sonido — ej. "cercano y directo", "lejano, fuera de campo", "envolvente de fondo". Si no aporta nada, dejalo como string vacío.

Además, para cada propuesta generá un searchQuery EN INGLÉS — el término que se usaría para buscar ese sonido en una biblioteca como Freesound. El searchQuery debe:
- ser conciso, sin frases narrativas ni explicaciones
- describir el sonido en sí, priorizando características acústicas
- incluir material o superficie, distancia, perspectiva, intensidad, e interior/exterior cuando sea relevante
- no incluir palabras inútiles

Ejemplo malo: "an audio recording of a person walking in a city"
Ejemplo bueno: "wet asphalt footsteps adult walking urban street"

Si la propuesta describe la AUSENCIA de una fuente sonora (por ejemplo "ninguna fuente evidente" en diálogos), dejá searchQuery como string vacío — no hay nada que buscar.

Ejemplo de estilo, con prioridad (persona sola en una cocina de noche):
- ambientes: "room tone interior" (observed, primary), "zumbido de heladera" (observed, secondary), "tráfico lejano" (probable, secondary, spatialPerspective "lejano, fuera de campo")
- foley: "pasos" (observed, primary), "roce de ropa" (probable, secondary), "cajón abriéndose" (possible, accent)
- efectos: "click del motor de la heladera" (probable, accent)

Categorías: ambientes (fondo continuo), efectos (sonidos puntuales), foley (sincronizados a una acción o superficie), diálogos (voces, o la ausencia de una fuente evidente).

Todo el texto de tu respuesta debe estar en español, salvo las claves del JSON y el searchQuery (en inglés). Respondé ÚNICAMENTE con un objeto JSON con esta forma exacta (sin texto antes ni después):

{
  "ambientes": [{"description": string, "rationale": string, "certainty": "observed"|"probable"|"possible", "priority": "primary"|"secondary"|"accent", "spatialPerspective": string, "searchQuery": string}],
  "efectos": [{"description": string, "rationale": string, "certainty": "...", "priority": "...", "spatialPerspective": string, "searchQuery": string}],
  "foley": [{"description": string, "rationale": string, "certainty": "...", "priority": "...", "spatialPerspective": string, "searchQuery": string}],
  "dialogos": [{"description": string, "rationale": string, "certainty": "...", "priority": "...", "spatialPerspective": string, "searchQuery": string}]
}

Análisis de la escena (JSON):
`;

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
      messages: [
        { role: "user", content: `${PROPOSAL_PROMPT}\n${JSON.stringify(analysis)}` },
      ],
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
