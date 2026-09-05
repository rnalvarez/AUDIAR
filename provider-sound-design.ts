```ts
import { coerceCertainty, type Certainty, type SceneAnalysis } from "./provider-vision.ts";

const MODEL = "qwen/qwen3.6-27b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MAX = 6;

export type ProposalCategory =
  | "ambientes"
  | "efectos"
  | "foley"
  | "dialogos";

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

const PROMPT = `
Sos un diseñador de sonido profesional para cine y video.

A partir del análisis de una escena, proponé una selección pequeña y útil
de sonidos para su diseño sonoro.

No hagas una lista exhaustiva.
Proponé idealmente entre 2 y 4 sonidos por categoría y nunca más de 6.

Las categorías son:

- ambientes: sonidos de fondo o atmósferas continuas
- efectos: sonidos puntuales producidos por objetos o eventos
- foley: acciones humanas, movimientos y sonidos de superficies
- dialogos: voces humanas o elementos relacionados con la presencia de voces

Cada propuesta debe contener exactamente estas propiedades:

- description: descripción breve del sonido
- rationale: explicación breve de por qué encaja en la escena
- certainty: uno de estos tres valores:
  "observed", "probable" o "possible"

Usá:

"observed" cuando el sonido se deriva directamente de algo visible.
"probable" cuando es una inferencia razonable.
"possible" cuando es una posibilidad creativa.

Nunca presentes una posibilidad creativa como un hecho observado.

Todo debe estar escrito en español.

Respondé ÚNICAMENTE con un objeto JSON válido.
No uses Markdown.
No agregues explicaciones antes ni después del JSON.

El objeto debe tener exactamente esta estructura:

{
  "ambientes": [],
  "efectos": [],
  "foley": [],
  "dialogos": []
}

Cada elemento de esos arrays debe tener esta estructura:

{
  "description": "descripción del sonido",
  "rationale": "por qué encaja",
  "certainty": "observed"
}
`.trim();

function coerce(
  value: any,
  category: ProposalCategory,
  index: number
): SoundProposal | null {
  const description =
    typeof value?.description === "string"
      ? value.description.trim()
      : "";

  if (!description) {
    return null;
  }

  return {
    id: `${category}-${index}`,
    category,
    description,
    rationale:
      typeof value?.rationale === "string"
        ? value.rationale.trim()
        : "",
    certainty: coerceCertainty(value?.certainty),
  };
}

function arr(
  value: unknown,
  category: ProposalCategory
): SoundProposal[] {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => coerce(item, category, index))
    .filter((item): item is SoundProposal => item !== null)
    .slice(0, MAX);
}

export function normalizeProposal(
  raw: any
): SoundDesignProposal {
  return {
    ambientes: arr(raw?.ambientes, "ambientes"),
    efectos: arr(raw?.efectos, "efectos"),
    foley: arr(raw?.foley, "foley"),
    dialogos: arr(raw?.dialogos, "dialogos"),
  };
}

export async function generateSoundDesignProposal({
  analysis,
  apiKey,
}: GenerateProposalParams): Promise<SoundDesignProposal> {
  const body = {
    model: MODEL,

    messages: [
      {
        role: "user",
        content:
          PROMPT +
          "\n\nANÁLISIS DE LA ESCENA:\n" +
          JSON.stringify(analysis),
      },
    ],

    temperature: 0.6,

    max_completion_tokens: 2048,

    reasoning_effort: "none",

    reasoning_format: "hidden",

    response_format: {
      type: "json_object",
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },

    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");

    throw new Error(
      `Groq proposal request failed (${res.status}): ${text.slice(
        0,
        500
      )}`
    );
  }

  const data: any = await res.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error(
      "Groq no devolvió contenido de propuesta"
    );
  }

  let parsed: any;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      "La propuesta de diseño sonoro no llegó en JSON válido"
    );
  }

  return normalizeProposal(parsed);
}
```
