const STORAGE_KEY = "audiar.settings.v1";

export interface ApiSettings {
  apiBaseUrl: string;
  groqApiKey: string;
  freesoundApiKey: string;
}

const EMPTY_SETTINGS: ApiSettings = {
  apiBaseUrl: "",
  groqApiKey: "",
  freesoundApiKey: "",
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getApiSettings(): ApiSettings {
  if (!isBrowser()) return { ...EMPTY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    return {
      apiBaseUrl: normalizeBaseUrl(typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : ""),
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
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl),
    groqApiKey: settings.groqApiKey.trim(),
    freesoundApiKey: settings.freesoundApiKey.trim(),
  }));
  window.dispatchEvent(new CustomEvent("audiar-settings-changed"));
}

export function clearApiSettings(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("audiar-settings-changed"));
}

export function hasApiSettings(): boolean {
  const settings = getApiSettings();
  return Boolean(settings.apiBaseUrl && settings.groqApiKey && settings.freesoundApiKey);
}

function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const settings = getApiSettings();
  const configuredBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "") || settings.apiBaseUrl;
  if (!configuredBaseUrl) {
    throw new Error("Primero configurá AUDIAR en ⚙ Configuración: indicá la URL del Worker y tus claves API.");
  }
  return `${configuredBaseUrl}${normalizedPath}`;
}

function addCredentialHeaders(path: string, init: RequestInit | undefined): RequestInit {
  const settings = getApiSettings();
  const headers = new Headers(init?.headers ?? {});
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes("/search/freesound") && settings.freesoundApiKey) {
    headers.set("X-AUDIAR-FREESOUND-KEY", settings.freesoundApiKey);
  }

  if (lowerPath.includes("/analyze/frame") || lowerPath.includes("/design/proposal") || lowerPath.includes("/generate/groq-tts")) {
    if (settings.groqApiKey) headers.set("X-AUDIAR-GROQ-KEY", settings.groqApiKey);
  }

  return { ...init, headers };
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveApiUrl(path), addCredentialHeaders(path, init));
}
