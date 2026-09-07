// Habla con bridge/index.ts, que corre local en tu máquina (puerto 8765).
import type { Layer, SoundtrackElement } from "./types";
import { ELEMENTS } from "./types";

const BRIDGE_URL = "http://localhost:8765";

export interface SendableSound {
  id: string;
  name: string;
  element: string;
  audioUrl: string;
  freesoundId?: number;
  gainDb?: number;
  pan?: number;
  license?: string;
  source?: string;
  originalFilename?: string;
  originalType?: string;
  sampleRate?: number;
  bitDepth?: number;
  fileSize?: number;
}

function elementLabel(element: SoundtrackElement): string {
  return ELEMENTS.find((e) => e.id === element)?.label ?? element;
}

function extractFreesoundId(layer: Layer): number | undefined {
  const urlMatch = layer.freesoundUrl?.match(/\/s\/(\d+)\/?$/);
  if (urlMatch) return Number(urlMatch[1]);
  const idMatch = layer.id.match(/freesound-(?:ambientes-|efectos-|foley-)?(\d+)(?:-|$)/);
  return idMatch ? Number(idMatch[1]) : undefined;
}

export function layerToSendableSound(layer: Layer, element: SoundtrackElement): SendableSound {
  return {
    id: layer.id,
    name: layer.name,
    element: elementLabel(element),
    audioUrl: layer.audioUrl,
    freesoundId: extractFreesoundId(layer),
    gainDb: layer.gainDb,
    pan: layer.pan,
    license: layer.license,
    source: layer.id.split("-")[0],
    originalFilename: layer.originalFilename,
    originalType: layer.originalType,
    sampleRate: layer.sampleRate,
    bitDepth: layer.bitDepth,
    fileSize: layer.fileSize,
  };
}

export type SendResult =
  | { ok: true; count: number }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; error: string };

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
    return { ok: true, count: data.queued ?? data.count ?? sounds.length };
  } catch {
    return { ok: false, notFound: true };
  }
}

export async function getFreesoundOAuthStatus(): Promise<{ connected: boolean; configured: boolean; expiresAt?: number }> {
  const res = await fetch(`${BRIDGE_URL}/oauth/status`);
  if (!res.ok) throw new Error("No se pudo consultar el estado de Freesound.");
  return res.json();
}
