import { searchFreesound } from "./provider-freesound.ts";
import { generateStableAudio } from "./provider-stable-audio.ts";
import { generateGroqTTS } from "./provider-groq-tts.ts";
import { searchSoundly } from "./provider-soundly.ts";
import type { Env, SoundtrackElement } from "./types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your app's origin before shipping
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const VALID_ELEMENTS: SoundtrackElement[] = ["ambientes", "efectos", "foley", "dialogos"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      // GET /api/search/freesound?query=door+creak&element=foley
      if (url.pathname === "/api/search/freesound" && request.method === "GET") {
        const query = url.searchParams.get("query");
        const element = url.searchParams.get("element") as SoundtrackElement | null;

        if (!query) return json({ error: "missing 'query'" }, 400);
        if (!element || !VALID_ELEMENTS.includes(element)) {
          return json({ error: `'element' must be one of ${VALID_ELEMENTS.join(", ")}` }, 400);
        }
        if (!env.FREESOUND_API_KEY) {
          return json({ error: "FREESOUND_API_KEY is not configured on this worker" }, 500);
        }

        const commercialOnly = url.searchParams.get("commercialOnly") !== "false";
        const result = await searchFreesound({
          query,
          element,
          apiKey: env.FREESOUND_API_KEY,
          commercialOnly,
        });
        return json(result);
      }

      // GET /api/search/soundly?query=door+creak&element=foley  (stub — see provider-soundly.ts)
      if (url.pathname === "/api/search/soundly" && request.method === "GET") {
        const query = url.searchParams.get("query");
        const element = url.searchParams.get("element") as SoundtrackElement | null;
        if (!query) return json({ error: "missing 'query'" }, 400);
        if (!element || !VALID_ELEMENTS.includes(element)) {
          return json({ error: `'element' must be one of ${VALID_ELEMENTS.join(", ")}` }, 400);
        }
        const result = await searchSoundly({ query, element });
        return json(result);
      }

      // POST /api/generate/stable-audio  { prompt, element, durationSeconds }
      if (url.pathname === "/api/generate/stable-audio" && request.method === "POST") {
        const body = await request.json();
        const result = await generateStableAudio(body as any);
        return json(result);
      }

      // POST /api/generate/groq-tts  { text, element, voice? }
      if (url.pathname === "/api/generate/groq-tts" && request.method === "POST") {
        const body = await request.json();
        const result = await generateGroqTTS(body as any);
        return json(result);
      }

      return json({ error: "not found" }, 404);
    } catch (err: any) {
      // Stub providers throw plain Errors on purpose — surface the message
      // as-is so the frontend can show "not implemented yet" instead of a
      // generic failure.
      return json({ error: err?.message ?? "unexpected error" }, 501);
    }
  },
};
