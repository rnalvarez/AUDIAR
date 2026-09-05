// Multimodal scene analysis, via Groq's vision-capable models — same
// account/key as provider-groq-tts.ts once that's filled in.
//
// Confirmed against https://console.groq.com/docs/vision directly before
// writing this (not assumed): OpenAI-compatible chat.completions endpoint,
// images passed as a data: URL in an image_url content block, JSON mode
// supported via response_format. Groq's own docs note their multimodal
// lineup changes fairly often — if VISION_MODEL below ever 404s, check
// that page for the current model id and swap it here; nothing else in
// this file should need to change.

const VISION_MODEL = "qwen/qwen3.6-27b"; // verificar vigencia en console.groq.com/docs/vision
const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type Certainty = "observed" | "probable" | "possible";

export interface SoundCue {
  text: string;
  certainty: Certainty;
}

/**
 * Sound-design-oriented reading of a scene frame — not a generic caption.
 * Every claim carries its own certainty so the UI (and eventually the
 * generation step) never treats a speculative idea as an observed fact.
 */
export interface SceneAnalysis {
  sceneDescription: string;
  place: SoundCue;
  indoorOutdoor: SoundCue;
  timeOfDay: SoundCue;
  weather: SoundCue;
  materialsAndSurfaces: SoundCue[];
  humanPresence: SoundCue;
  potentialSoundSources: SoundCue[]; // objetos, vehículos, animales, maquinaria
  observedActions: SoundCue[];
  offScreenSources: SoundCue[];
  ambience: SoundCue[];
  effects: SoundCue[];
  foley: SoundCue[];
  dialogue: SoundCue[];
  narrativeIdeas: SoundCue[]; // sonidos subjetivos/narrativos, más allá de lo literal
}

export interface AnalyzeFrameParams {
  /** Full data URL ("data:image/jpeg;base64,...") — exactly what FileReader.readAsDataURL() produces, and exactly what Groq's image_url.url expects. No re-encoding in between. */
  image: string;
  apiKey: string;
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

export function coerceCertainty(value: unknown): Certainty {
  return value === "observed" || value === "probable" || value === "possible" ? value : "possible";
}

export function coerceCue(value: any): SoundCue {
  return {
    text: typeof value?.text === "string" ? value.text.trim() : "",
    certainty: coerceCertainty(value?.certainty),
  };
}

export function coerceCueArray(value: any): SoundCue[] {
  return Array.isArray(value) ? value.map(coerceCue).filter((c) => c.text.length > 0) : [];
}

/**
 * Normalizes whatever JSON the model returns into a valid SceneAnalysis.
 * JSON mode guarantees valid JSON syntax — it does NOT guarantee the
 * response matches this exact shape, so nothing here trusts it blindly.
 * Anything missing or malformed becomes an empty array/cue rather than
 * throwing, and any unrecognized certainty value falls back to "possible"
 * (the most cautious label) — never to "observed". That fallback is the
 * one piece of this file's correctness that actually matters: it's what
 * stops a malformed response from silently reading as a confirmed fact.
 */
export function normalizeAnalysis(raw: any): SceneAnalysis {
  return {
    sceneDescription: typeof raw?.sceneDescription === "string" ? raw.sceneDescription.trim() : "",
    place: coerceCue(raw?.place),
    indoorOutdoor: coerceCue(raw?.indoorOutdoor),
    timeOfDay: coerceCue(raw?.timeOfDay),
    weather: coerceCue(raw?.weather),
    materialsAndSurfaces: coerceCueArray(raw?.materialsAndSurfaces),
    humanPresence: coerceCue(raw?.humanPresence),
    potentialSoundSources: coerceCueArray(raw?.potentialSoundSources),
    observedActions: coerceCueArray(raw?.observedActions),
    offScreenSources: coerceCueArray(raw?.offScreenSources),
    ambience: coerceCueArray(raw?.ambience),
    effects: coerceCueArray(raw?.effects),
    foley: coerceCueArray(raw?.foley),
    dialogue: coerceCueArray(raw?.dialogue),
    narrativeIdeas: coerceCueArray(raw?.narrativeIdeas),
  };
}

export async function analyzeFrame(params: AnalyzeFrameParams): Promise<SceneAnalysis> {
  const { image, apiKey } = params;

  const res = await fetch(GROQ_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.4,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq vision request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Groq no devolvió contenido de análisis");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("El análisis no llegó en formato JSON válido");
  }

  return normalizeAnalysis(parsed);
}
