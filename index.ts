import { searchFreesound } from "./provider-freesound.ts";
import { generateStableAudio } from "./provider-stable-audio.ts";
import { generateGroqTTS } from "./provider-groq-tts.ts";
import { searchSoundly } from "./provider-soundly.ts";
import { analyzeFrame } from "./provider-vision.ts";
import { generateSoundDesignProposal } from "./provider-sound-design.ts";
import type { Env, SoundtrackElement } from "./types.ts";

const DEFAULT_CORS = "*";
function corsHeaders(origin: string | null, env: Env) {
  const allowed = env.ALLOWED_ORIGIN?.trim() || DEFAULT_CORS;
  const value = allowed === "*" ? "*" : origin === allowed ? allowed : "null";
  return {
    "Access-Control-Allow-Origin": value,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } as Record<string,string>;
}
function json(body: unknown, status = 200, env?: Env, request?: Request): Response {
  const cors = env && request ? corsHeaders(request.headers.get("Origin"), env) : {};
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}
const VALID_ELEMENTS: SoundtrackElement[] = ["ambientes", "efectos", "foley", "dialogos"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request.headers.get("Origin"), env) });
    try {
      if (url.pathname === "/api/search/freesound" && request.method === "GET") {
        const query = url.searchParams.get("query");
        const element = url.searchParams.get("element") as SoundtrackElement | null;
        if (!query) return json({ error: "missing 'query'" }, 400, env, request);
        if (!element || !VALID_ELEMENTS.includes(element)) return json({ error: `'element' must be one of ${VALID_ELEMENTS.join(", ")}` }, 400, env, request);
        if (!env.FREESOUND_API_KEY) return json({ error: "FREESOUND_API_KEY no está configurada" }, 500, env, request);
        const commercialOnly = url.searchParams.get("commercialOnly") !== "false";
        return json(await searchFreesound({ query, element, apiKey: env.FREESOUND_API_KEY, commercialOnly }), 200, env, request);
      }
      if (url.pathname === "/api/search/soundly" && request.method === "GET") {
        const query = url.searchParams.get("query");
        const element = url.searchParams.get("element") as SoundtrackElement | null;
        if (!query) return json({ error: "missing 'query'" }, 400, env, request);
        if (!element || !VALID_ELEMENTS.includes(element)) return json({ error: `'element' must be one of ${VALID_ELEMENTS.join(", ")}` }, 400, env, request);
        return json(await searchSoundly({ query, element }), 200, env, request);
      }
      if (url.pathname === "/api/analyze/frame" && request.method === "POST") {
        if (!env.GROQ_API_KEY) return json({ error: "GROQ_API_KEY no está configurada" }, 500, env, request);
        const body = await request.json() as { image?: unknown };
        if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) return json({ error: "missing 'image' (expected a data URL)" }, 400, env, request);
        return json(await analyzeFrame({ image: body.image, apiKey: env.GROQ_API_KEY }), 200, env, request);
      }
      if (url.pathname === "/api/design/proposal" && request.method === "POST") {
        if (!env.GROQ_API_KEY) return json({ error: "GROQ_API_KEY no está configurada" }, 500, env, request);
        const body = await request.json() as { analysis?: unknown };
        if (!body.analysis || typeof body.analysis !== "object") return json({ error: "missing 'analysis'" }, 400, env, request);
        return json(await generateSoundDesignProposal({ analysis: body.analysis as never, apiKey: env.GROQ_API_KEY }), 200, env, request);
      }
      if (url.pathname === "/api/generate/stable-audio" && request.method === "POST") return json(await generateStableAudio(await request.json() as never), 200, env, request);
      if (url.pathname === "/api/generate/groq-tts" && request.method === "POST") return json(await generateGroqTTS(await request.json() as never), 200, env, request);
      return json({ error: "not found" }, 404, env, request);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "unexpected error" }, 500, env, request);
    }
  },
};
