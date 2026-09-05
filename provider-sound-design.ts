import {
  coerceCertainty,
  type Certainty,
  type SceneAnalysis,
} from "./provider-vision.ts";

const MODEL = "qwen/qwen3.6-27b";
const ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";

const MAX_PROPOSALS = 6;

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

const PROMPT = [
  "Sos un diseñador de sonido profesional para cine y video.",
  "",
  "A partir del análisis de una escena, proponé una selección pequeña y útil de sonidos para su diseño sonoro.",
  "",
  "No hagas una lista exhaustiva.",
  "Proponé idealmente entre 2 y 4 sonidos por categoría y nunca más de 6.",
  "",
  "Las categorías son:",
  "",
  "ambientes: sonidos de fondo o atmósferas continuas.",
  "efectos: sonidos puntuales producidos por objetos o eventos.",
  "foley: acciones humanas, movimientos y sonidos de superficies.",
  "dialogos: voces humanas o elementos relacionados con la presencia de voces.",
  "",
  "Cada propuesta debe contener estas propiedades:",
  "",
  "description: descripción breve del sonido.",
  "rationale: explicación breve de por qué encaja en la escena.",
  "certainty: debe ser exactamente uno de estos valores: observed, probable, possible.",
  "",
  "Usá observed cuando el sonido se deriva directamente de algo visible.",
  "Usá probable cuando es una inferencia razonable.",
  "Usá possible cuando es una posibilidad creativa.",
  "",
  "Nunca presentes una posibilidad creativa como un hecho observado.",
  "",
  "Todo debe estar escrito en español.",
  "",
  "Respondé únicamente con un objeto JSON válido.",
  "No uses Markdown.",
  "No agregues explicaciones antes ni después del JSON.",
  "",
  "La estructura obligatoria es:",
  "",
  "{",
  '  "ambientes": [],',
  '  "efectos": [],',
  '  "foley": [],',
  '  "dialogos": []',
  "}",
  "",
  "Cada elemento de los arrays debe tener esta estructura:",
  "",
  "{",
  '  "description": "descripción del sonido",',
  '  "rationale": "por qué encaja",',
  '  "certainty": "observed"',
  "}",
].join("\n");

function coerce(
  value: unknown,
  category: ProposalCategory,
  index: number
): SoundProposal | null {
  const item = value as {
    description?: unknown;
    rationale?: unknown;
    certainty?: unknown;
  } | null;

  const description =
    typeof item?.description === "string"
      ? item.description.trim()
      : "";

  if (!description) {
    return null;
  }

  const rationale =
    typeof item?.rationale === "string"
      ? item.rationale.trim()
      : "";

  return {
    id: category + "-" + index,
    category,
    description,
    rationale,
    certainty: coerceCertainty(item?.certainty),
  };
}

function normalizeArray(
  value: unknown,
  category: ProposalCategory
): SoundProposal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => coerce(item, category, index))
    .filter(
      (item): item is SoundProposal => item !== null
    )
    .slice(0, MAX_PROPOSALS);
}

export function normalizeProposal(
  raw: unknown
): SoundDesignProposal {
  const value = raw as {
    ambientes?: unknown;
    efectos?: unknown;
    foley?: unknown;
    dialogos?: unknown;
  } | null;

  return {
    ambientes: normalizeArray(
      value?.ambientes,
      "ambientes"
    ),
    efectos: normalizeArray(
      value?.efectos,
      "efectos"
    ),
    foley: normalizeArray(
      value?.foley,
      "foley"
    ),
    dialogos: normalizeArray(
      value?.dialogos,
      "dialogos"
    ),
  };
}

export async function generateSoundDesignProposal({
  analysis,
  apiKey,
}: GenerateProposalParams): Promise<SoundDesignProposal> {
  if (!apiKey.trim()) {
    throw new Error("Falta la API key de Groq.");
  }

  const userMessage =
    PROMPT +
    "\n\nANÁLISIS DE LA ESCENA:\n" +
    JSON.stringify(analysis);

  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: userMessage,
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

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    throw new Error(
      "Groq proposal request failed (" +
        response.status +
        "): " +
        text.slice(0, 500)
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content =
    data.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error(
      "Groq no devolvió contenido de propuesta."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      "La propuesta de diseño sonoro no llegó en JSON válido."
    );
  }

  return normalizeProposal(parsed);
}
```
