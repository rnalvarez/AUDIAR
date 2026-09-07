// Guarda solamente las credenciales que son seguras para mantener en el navegador.
// El Client Secret y los tokens OAuth de Freesound se guardan exclusivamente
// en el bridge local, nunca en GitHub Pages ni en localStorage.
export interface ApiKeys {
  freesound?: string;
  freesoundClientId?: string;
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
      freesoundClientId: typeof parsed?.freesoundClientId === "string" ? parsed.freesoundClientId : undefined,
      groq: typeof parsed?.groq === "string" ? parsed.groq : undefined,
    };
  } catch {
    return {};
  }
}

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
