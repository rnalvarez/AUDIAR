import type { Certainty, SceneAnalysis } from "./types";

const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "qwen/qwen3.6-27b";
const MAX_OUTPUT_TOKENS = 900;

function coerceCertainty(value: unknown): Certainty {
  return value === "observed" || value === "probable" || value === "possible" ? value : "possible";
}

function coerceCue(value: any) {
  return {
    text: typeof value?.text === "string" ? value.text.trim() : "",
    certainty: coerceCertainty(value?.certainty),
    searchQuery: typeof value?.searchQuery === "string" ? value.searchQuery.trim().toLowerCase() : "",
  };
}

function coerceCueArray(value: any) {
  return Array.isArray(value)
    ? value.map(coerceCue).filter((cue: any) => cue.text.length > 0).slice(0, 3)
    : [];
}

const SCENE_ANALYSIS_PROMPT = `Sos un diseñador de sonido cinematográfico. Mirá el fotograma y construí una propuesta sonora REALISTA para buscar sonidos en Freesound.

REGLA FUNDAMENTAL: primero fijá el contexto visual y temporal de la escena. No inventes condiciones. Si es de día, no sugieras noche. Si está seco y soleado, no sugieras lluvia, tormenta, agua o suelo mojado. Si no hay bosque, no uses selva/bosque. Cada sonido debe ser compatible con lo visible.

Separá estrictamente las categorías:

AMBIENTES = sonidos continuos, sostenidos o fácilmente utilizables como cama/loop. Ejemplos: room tone, city ambience, distant traffic bed, wind bed, HVAC, crowd bed. NUNCA pongas acá pasos, puertas, bocinas aisladas, golpes, motores individuales, objetos cayendo ni otros eventos puntuales.

EFECTOS = sonidos puntuales o eventos discretos que ocurren en un momento concreto: puerta, claxon, vehículo pasando, motor arrancando, golpe, objeto, maquinaria, etc. NUNCA pongas acá un ambiente continuo.

FOLEY = sonidos sincronizables con una acción visible de una persona o del manejo de un objeto: footsteps, cloth, handling, keys, chair movement, etc. Deben corresponder a una acción o superficie visible. Si no hay una acción adecuada, no inventes una.

Intentá devolver hasta 3 sonidos RELEVANTES en cada categoría; no rellenes por obligación. Es preferible 1 o 2 sonidos correctos que 3 incorrectos.

Para CADA sonido generá searchQuery: una consulta MUY CORTA EN INGLÉS (2 a 6 palabras), pensada para Freesound. Debe describir el sonido y conservar las restricciones importantes de la escena: lugar/contexto, día/noche si realmente importa, seco/mojado si realmente importa, interior/exterior y distancia cuando aporte. No uses frases narrativas.

Ejemplo para una calle urbana seca de día:
ambiente: "urban city street ambience", "distant traffic bed", "daytime city background"
efectos: "car pass by", "car horn", "bus brake"
foley: "urban footsteps asphalt", "cloth movement", "keys handling"

En searchQuery NO uses atributos incompatibles con la imagen. No escribas "night", "rain", "wet", "forest", etc. salvo que realmente correspondan al fotograma.

Respondé SOLO JSON, sin texto adicional, con exactamente estas claves:
{
  "sceneDescription": string,
  "place": {"text": string, "certainty": "observed|probable|possible", "searchQuery": string},
  "indoorOutdoor": {"text": string, "certainty": "observed|probable|possible", "searchQuery": string},
  "timeOfDay": {"text": string, "certainty": "observed|probable|possible", "searchQuery": string},
  "weather": {"text": string, "certainty": "observed|probable|possible", "searchQuery": string},
  "materialsAndSurfaces": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "humanPresence": {"text": string, "certainty": "observed|probable|possible", "searchQuery": string},
  "potentialSoundSources": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "observedActions": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "offScreenSources": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "ambience": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "effects": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "foley": [{"text": string, "certainty": "observed|probable|possible", "searchQuery": string}],
  "dialogue": [],
  "narrativeIdeas": []
}`;

export async function analyzeFrameSceneDirect(image: string, apiKey: string): Promise<SceneAnalysis> {
  const res = await fetch(GROQ_CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SCENE_ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.2,
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
    place: coerceCue(parsed?.place),
    indoorOutdoor: coerceCue(parsed?.indoorOutdoor),
    timeOfDay: coerceCue(parsed?.timeOfDay),
    weather: coerceCue(parsed?.weather),
    materialsAndSurfaces: coerceCueArray(parsed?.materialsAndSurfaces),
    humanPresence: coerceCue(parsed?.humanPresence),
    potentialSoundSources: coerceCueArray(parsed?.potentialSoundSources),
    observedActions: coerceCueArray(parsed?.observedActions),
    offScreenSources: coerceCueArray(parsed?.offScreenSources),
    ambience: coerceCueArray(parsed?.ambience),
    effects: coerceCueArray(parsed?.effects),
    foley: coerceCueArray(parsed?.foley),
    dialogue: [],
    narrativeIdeas: [],
  };
}
