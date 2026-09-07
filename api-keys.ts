// Guarda las credenciales de Freesound y Groq en localStorage del navegador,
// para uso personal. El access token OAuth de Freesound es opcional y permite
// al bridge local descargar el archivo original en vez del preview.
export interface ApiKeys {
  freesound?: string;
  freesoundAccessToken?: string;
  groq?: string;
}

const STORAGE_KEY = "audiar:api-keys";

export function loadApiKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      freesound: typeof parsed?.freesound === "string" ? parsed.freesound : undefined,
      freesoundAccessToken: typeof parsed?.freesoundAccessToken === "string" ? parsed.freesoundAccessToken : undefined,
      groq: typeof parsed?.groq === "string" ? parsed.groq : undefined,
    };
  } catch {
    return {};
  }
}

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
