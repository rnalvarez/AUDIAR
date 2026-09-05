// Second stage of the pipeline: SceneAnalysis -> SoundDesignProposal.
//
// Deliberately NOT a Freesound-query generator. This asks the model to
// reason like a sound designer first — pick a small, well-justified set of
// ideas per element — before anything gets turned into a search term.
// That wiring is a later stage, on purpose.
//
// Text-only reasoning over the already-extracted SceneAnalysis, so this
// reuses the same model as provider-vision.ts (qwen/qwen3.6-27b handles
// both vision and strong agentic/reasoning tasks per Groq's own docs) and
// the same certainty vocabulary, imported rather than redefined.

import { coerceCertainty, type Certainty, type SceneAnalysis } from "./provider-vision.ts";

const PROPOSAL_MODEL = "qwen/qwen3.6-27b"; // verificar vigencia en console.groq.com/docs/models
const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Defensive cap, independent of the prompt's own "don't overload" instruction —
// models don't always follow that instruction exactly, and RAM was explicit
// that a 40-sound list is a failure of this feature, not a quirk to tolerate.
const MAX_PROPOSALS_PER_CATEGORY = 6;

export type ProposalCategory = "ambientes" | "efectos" | "foley" | "dialogos";

export interface SoundProposal {
  id: string;
  category: ProposalCategory;
  description: string;
  rationale: string;
  certainty: Certainty;
}

export interface SoundDesignProposal {
  ambientes: SoundProposal[];
  efectos: SoundProposal[];
  foley: SoundProposal[];
  dialogos: SoundProposal[];
}

export interface GenerateProposalParams {
  analysis: SceneAnalysis;
  apiKey: string;
}

const PROPOSAL_PROMPT = `Sos un diseñador de sonido profesional para cine y video. A partir del siguiente análisis de una escena (ya extraído de una imagen), proponé un diseño sonoro — no una lista exhaustiva de todo lo que podría sonar, sino una selección profesional y razonable de lo más significativo.

Para cada propuesta asigná un nivel de certeza:
- "observed": un sonido directamente sugerido por lo que el análisis marcó como observado en la imagen.
- "probable": un sonido plausible en esta escena aunque no sea visible directamente.
- "possible": una posibilidad creativa de diseño sonoro — una idea interpretativa, no una inferencia directa.

Nunca presentes una idea "possible" como si fuera "observed". Priorizá calidad sobre cantidad: como máximo ${MAX_PROPOSALS_PER_CATEGORY} propuestas por categoría, idealmente menos — entre 2 y 4 suele ser lo profesional. No propongas algo solo para llenar la lista.

Cada propuesta necesita una razón breve (rationale) de por qué encaja en esta escena, no solo el nombre del sonido.

Categorías: ambientes (fondo continuo), efectos (sonidos puntuales), foley (sincronizados a una acción o superficie), diálogos (voces, o la ausencia de una fuente evidente).

Todo el texto de tu respuesta debe estar en español, salvo las claves del JSON. Respondé ÚNICAMENTE con un objeto JSON con esta forma exacta (sin texto antes ni después):

{
  "ambientes": [{"description": string, "rationale": string, "certainty": "observed"|"probable"|"possible"}],
  "efectos": [{"description": string, "rationale": string, "certainty": "..."}],
  "foley": [{"description": string, "rationale": string, "certainty": "..."}],
  "dialogos": [{"description": string, "rationale": string, "certainty": "..."}]
}

Análisis de la escena (JSON):
`;

function coerceProposal(value: any, category: ProposalCategory, index: number): SoundProposal | null {
  const description = typeof value?.description === "string" ? value.description.trim() : "";
  if (!description) return null;
  return {
    id: `${category}-${index}`,
    category,
    description,
    rationale: typeof value?.rationale === "string" ? value.rationale.trim() : "",
    certainty: coerceCertainty(value?.certainty),
  };
}

function coerceProposalArray(value: any, category: ProposalCategory): SoundProposal[] {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((v, i) => coerceProposal(v, category, i))
    .filter((p): p is SoundProposal => p !== null)
    .slice(0, MAX_PROPOSALS_PER_CATEGORY);
}

/**
 * Same philosophy as provider-vision.ts's normalizeAnalysis: JSON mode
 * guarantees valid JSON syntax, not this exact shape, so nothing here
 * trusts the raw response. IDs are always generated here (not trusted from
 * the model), and the per-category cap is enforced regardless of whether
 * the model honored the prompt's own limit.
 */
export function normalizeProposal(raw: any): SoundDesignProposal {
  return {
    ambientes: coerceProposalArray(raw?.ambientes, "ambientes"),
    efectos: coerceProposalArray(raw?.efectos, "efectos"),
    foley: coerceProposalArray(raw?.foley, "foley"),
    dialogos: coerceProposalArray(raw?.dialogos, "dialogos"),
  };
}

export async function generateSoundDesignProposal(params: GenerateProposalParams): Promise<SoundDesignProposal> {
  const { analysis, apiKey } = params;

  const res = await fetch(GROQ_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PROPOSAL_MODEL,
      messages: [{ role: "user", content: PROPOSAL_PROMPT + JSON.stringify(analysis) }],
      temperature: 0.6,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq proposal request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Groq no devolvió contenido de propuesta");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("La propuesta no llegó en formato JSON válido");
  }

  return normalizeProposal(parsed);
}
