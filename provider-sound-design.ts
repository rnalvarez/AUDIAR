import { coerceCertainty, type Certainty, type SceneAnalysis } from "./provider-vision.ts";

const MODEL = "qwen/qwen3.6-27b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MAX = 6;

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

const PROMPT = `Sos un diseñador de sonido profesional para cine y video.
A partir del análisis de una escena, proponé una selección pequeña y útil de sonidos para el diseño sonoro.
No hagas una lista exhaustiva.
Máximo ${MAX} propuestas por categoría, idealmente entre 2 y 4.

Las categorías son:
- ambientes: fondos y sonidos continuos del espacio
- efectos: sonidos puntuales producidos por objetos, eventos o acciones
- foley: acciones humanas, pasos, manipulación y contacto con superficies
- dialogos: voces presentes, sugeridas o ausencia significativa de voz

Cada propuesta debe contener exactamente estos campos:
- description: descripción breve del sonido
- rationale: por qué encaja en la escena
- certainty: uno de estos valores exactos: observed, probable, possible

Usá observed solo para información directamente visible en el análisis.
Usá probable para inferencias razonables.
Usá possible para propuestas creativas o sonidos fuera de campo no confirmados.

Respondé únicamente con un objeto JSON válido con esta estructura:
{"ambientes":[],"efectos":[],"foley":[],"dialogos":[]}
No agregues explicaciones, markdown ni texto fuera del JSON.
Todo debe estar en español.`;

function coerce(v: any, c: ProposalCategory, i: number): SoundProposal | null {
  const d = typeof v?.description === "string" ? v.description.trim() : "";
  if (!d) return null;
  return {
    id: `${c}-${i}`,
    category: c,
    description: d,
    rationale: typeof v?.rationale === "string" ? v.rationale.trim() : "",
    certainty: coerceCertainty(v?.certainty),
  };
}

function arr(v: any, c: ProposalCategory): SoundProposal[] {
  return (Array.isArray(v) ? v : [])
    .map((x, i) => coerce(x, c, i))
    .filter((x): x is SoundProposal => !!x)
    .slice(0, MAX);
}

export function normalizeProposal(raw: any): SoundDesignProposal {
  return {
    ambientes: arr(raw?.ambientes, "ambientes"),
    efectos: arr(raw?.efectos, "efectos"),
    foley: arr(raw?.foley, "foley"),
    dialogos: arr(raw?.dialogos, "dialogos"),
  };
}

export async function generateSoundDesignProposal({ analysis, apiKey }: GenerateProposalParams): Promise<SoundDesignProposal> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: PROMPT + "\n\nANÁLISIS DE LA ESCENA:\n" + JSON.stringify(analysis),
        },
      ],
      temperature: 0.4,
      max_completion_tokens: 2048,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Groq proposal request failed (${res.status}): ${t.slice(0, 500)}`);
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
    throw new Error("La propuesta no llegó en JSON válido");
  }

  return normalizeProposal(parsed);
}
