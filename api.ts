import { analyzeFrame } from "./provider-vision.ts";
import { generateSoundDesignProposal } from "./provider-sound-design.ts";
import { searchFreesound } from "./provider-freesound.ts";

const STORAGE_KEY = "audiar.settings.v2";

export interface ApiSettings {
  groqApiKey: string;
  freesoundApiKey: string;
}

const EMPTY_SETTINGS: ApiSettings = {
  groqApiKey: "",
  freesoundApiKey: "",
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getApiSettings(): ApiSettings {
  if (!isBrowser()) return { ...EMPTY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    return {
      groqApiKey: typeof parsed.groqApiKey === "string" ? parsed.groqApiKey.trim() : "",
      freesoundApiKey: typeof parsed.freesoundApiKey === "string" ? parsed.freesoundApiKey.trim() : "",
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    groqApiKey: settings.groqApiKey.trim(),
    freesoundApiKey: settings.freesoundApiKey.trim(),
  }));
  window.dispatchEvent(new CustomEvent("audiar-settings-changed"));
}

export function clearApiSettings(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem("audiar.settings.v1");
  window.dispatchEvent(new CustomEvent("audiar-settings-changed"));
}

export function hasApiSettings(): boolean {
  const settings = getApiSettings();
  return Boolean(settings.groqApiKey && settings.freesoundApiKey);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: unknown, status = 500): Response {
  const message = error instanceof Error ? error.message : "Error inesperado";
  return jsonResponse({ error: message }, status);
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const settings = getApiSettings();

  try {
    if (normalizedPath === "/api/analyze/frame") {
      if (!settings.groqApiKey) return errorResponse(new Error("Falta la API key de Groq en ⚙ Configuración."), 400);
      const body = JSON.parse(String(init?.body ?? "{}")) as { image?: string };
      if (!body.image) return errorResponse(new Error("No se recibió el fotograma."), 400);
      const result = await analyzeFrame({ image: body.image, apiKey: settings.groqApiKey });
      return jsonResponse(result);
    }

    if (normalizedPath === "/api/design/proposal") {
      if (!settings.groqApiKey) return errorResponse(new Error("Falta la API key de Groq en ⚙ Configuración."), 400);
      const body = JSON.parse(String(init?.body ?? "{}")) as { analysis?: Parameters<typeof generateSoundDesignProposal>[0]["analysis"] };
      if (!body.analysis) return errorResponse(new Error("Falta el análisis de la escena."), 400);
      const result = await generateSoundDesignProposal({ analysis: body.analysis, apiKey: settings.groqApiKey });
      return jsonResponse(result);
    }

    if (normalizedPath.startsWith("/api/search/freesound")) {
      if (!settings.freesoundApiKey) return errorResponse(new Error("Falta la API key de Freesound en ⚙ Configuración."), 400);
      const url = new URL(normalizedPath, "https://audiar.local");
      const query = url.searchParams.get("query")?.trim() ?? "";
      const element = url.searchParams.get("element") as "ambientes" | "efectos" | "foley" | "dialogos" | null;
      if (!query) return errorResponse(new Error("Falta la consulta de búsqueda."), 400);
      if (!element || !["ambientes", "efectos", "foley", "dialogos"].includes(element)) {
        return errorResponse(new Error("Categoría de sonido no válida."), 400);
      }
      const result = await searchFreesound({ query, apiKey: settings.freesoundApiKey, element });
      return jsonResponse(result);
    }

    if (normalizedPath.startsWith("/api/search/soundly")) {
      return errorResponse(new Error("Soundly todavía no está conectado: no hay una API pública configurada en este proyecto."), 501);
    }

    return errorResponse(new Error(`Ruta no disponible en esta versión sin Worker: ${normalizedPath}`), 404);
  } catch (error) {
    return errorResponse(error);
  }
}
