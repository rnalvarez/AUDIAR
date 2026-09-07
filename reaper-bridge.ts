// Habla con bridge/index.ts, que corre local en tu máquina (puerto 8765).
// Las descargas directas usan el servicio local en el puerto 8766.
import type { Layer, SoundtrackElement } from "./types";
import { ELEMENTS } from "./types";

const BRIDGE_URL = "http://localhost:8765";
const DOWNLOAD_BRIDGE_URL = "http://localhost:8766";

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

function safeDownloadFilename(sound: SendableSound): string {
  const raw = sound.originalFilename?.trim() || sound.name.trim() || `sound-${sound.freesoundId ?? sound.id}`;
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || `sound-${sound.freesoundId ?? sound.id}`;
}

export interface DownloadProgress {
  current: number;
  total: number;
  failed: number;
}

async function downloadOneToDirectory(sound: SendableSound, directoryHandle: any, usedNames: Set<string>): Promise<void> {
  const res = await fetch(`${DOWNLOAD_BRIDGE_URL}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sound }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `error ${res.status}`);
  }

  let filename = safeDownloadFilename(sound);
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let suffix = 2;
  while (usedNames.has(filename.toLowerCase())) {
    filename = `${stem} (${suffix})${ext}`;
    suffix += 1;
  }
  usedNames.add(filename.toLowerCase());

  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    if (res.body) {
      await res.body.pipeTo(writable);
    } else {
      await writable.write(await res.blob());
      await writable.close();
    }
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function downloadSoundsToFolder(
  sounds: SendableSound[],
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ completed: number; failed: number }> {
  const picker = (window as any).showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new Error("La selección de carpetas requiere Chrome o Edge actualizado.");
  }

  const directoryHandle = await picker({ mode: "readwrite" });
  const usedNames = new Set<string>();
  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  const workerCount = Math.min(3, sounds.length);

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= sounds.length) return;
      try {
        await downloadOneToDirectory(sounds[index], directoryHandle, usedNames);
      } catch (error) {
        failed += 1;
        console.error(`[AUDIAR] Error descargando ${sounds[index].name}:`, error);
      } finally {
        completed += 1;
        onProgress?.({ current: completed, total: sounds.length, failed });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { completed, failed };
}

export async function getFreesoundOAuthStatus(): Promise<{ connected: boolean; configured: boolean; expiresAt?: number }> {
  const res = await fetch(`${BRIDGE_URL}/oauth/status`);
  if (!res.ok) throw new Error("No se pudo consultar el estado de Freesound.");
  return res.json();
}
