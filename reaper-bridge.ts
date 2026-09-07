// Habla con bridge/index.ts, que corre local en tu máquina (puerto 8765).
// AUDIAR nunca habla con REAPER directamente — no hay forma confiable de
// que una app web escriba dentro de un proyecto de REAPER. El bridge es
// el único que sabe cómo hacerlo (ver bridge/README.md).
import type { Layer, SoundtrackElement } from "./types";
import { ELEMENTS } from "./types";

const BRIDGE_URL = "http://localhost:8765";

export interface SendableSound {
  id: string;
  name: string;
  element: string; // "Ambientes" etc. — mismo texto que se usa como nombre de pista en REAPER
  audioUrl: string;
  gainDb?: number;
  pan?: number;
  license?: string;
  source?: string;
}

function elementLabel(element: SoundtrackElement): string {
  return ELEMENTS.find((e) => e.id === element)?.label ?? element;
}

export function layerToSendableSound(layer: Layer, element: SoundtrackElement): SendableSound {
  return {
    id: layer.id,
    name: layer.name,
    element: elementLabel(element),
    audioUrl: layer.audioUrl,
    gainDb: layer.gainDb,
    pan: layer.pan,
    license: layer.license,
    source: layer.id.split("-")[0],
  };
}

export type SendResult = { ok: true; count: number } | { ok: false; notFound: true } | { ok: false; notFound: false; error: string };

export async function sendToReaperBridge(sounds: SendableSound[]): Promise<SendResult> {
  try {
    const res = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sounds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, notFound: false, error: data.error ?? `error ${res.status}` };
    }
    return { ok: true, count: data.count ?? sounds.length };
  } catch {
    // fetch a localhost que falla por completo (no solo un status de error)
    // es la señal más confiable de que el bridge no está corriendo.
    return { ok: false, notFound: true };
  }
}
