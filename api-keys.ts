// Guarda las API keys de Freesound y Groq en localStorage del navegador,
// para poder usar AUDIAR sin correr/desplegar el Worker. Uso personal
// explícito (RAM: "las claves son de uso personal y no está expuesto a
// otras personas") — por eso viven en el cliente en vez de detrás de un
// backend. Si en algún momento esto se comparte con otras personas, esto
// deja de ser lo correcto y hay que volver al Worker como único camino.

export interface ApiKeys {
  freesound?: string;
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
      groq: typeof parsed?.groq === "string" ? parsed.groq : undefined,
    };
  } catch {
    return {};
  }
}

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
