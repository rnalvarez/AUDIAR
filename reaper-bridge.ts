// Habla con bridge/index.ts, que corre local en tu máquina (puerto 8765).
// Todas las descargas persistentes las gestiona el Bridge en la carpeta
// elegida por el usuario. REAPER utiliza exactamente esos mismos archivos.
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

export interface DownloadRootHandle {
  handle: null;
  name: string;
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
  | { ok: true; count: number; groupName: string; reusedCount: number }
  | { ok: false; notFound: true; error?: string }
  | { ok: false; notFound: false; error: string };

export async function getOrChooseDownloadRoot(): Promise<DownloadRootHandle> {
  const statusRes = await fetch(`${BRIDGE_URL}/storage/status`);
  const status = await statusRes.json().catch(() => ({}));
  if (statusRes.ok && status?.configured) return { handle: null, name: String(status.name ?? "") };

  const chooseRes = await fetch(`${BRIDGE_URL}/storage/choose`, { method: "POST" });
  const chooseData = await chooseRes.json().catch(() => ({}));
  if (!chooseRes.ok) throw new Error(chooseData?.error ?? "No se pudo seleccionar la carpeta raíz.");
  return { handle: null, name: String(chooseData?.name ?? "") };
}

export async function changeDownloadRoot(): Promise<DownloadRootHandle> {
  const chooseRes = await fetch(`${BRIDGE_URL}/storage/choose`, { method: "POST" });
  const chooseData = await chooseRes.json().catch(() => ({}));
  if (!chooseRes.ok) throw new Error(chooseData?.error ?? "No se pudo cambiar la carpeta raíz.");
  return { handle: null, name: String(chooseData?.name ?? "") };
}

export async function createSceneGroupDirectory(_root: null, sceneName = ""): Promise<{ handle: null; name: string; number: number }> {
  const res = await fetch(`${BRIDGE_URL}/storage/group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sceneName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.groupName) throw new Error(data?.error ?? "No se pudo crear la carpeta de la escena.");
  const match = String(data.groupName).match(/^GRUPO\s+(\d+)\b/i);
  return { handle: null, name: String(data.groupName), number: match ? Number(match[1]) : 0 };
}

export interface DownloadItemState {
  id: string;
  name: string;
  state: "queued" | "downloading" | "done" | "error";
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  error?: string;
}

export interface DownloadProgress {
  current: number;
  total: number;
  failed: number;
  downloadedBytes: number;
  totalBytes: number;
  remainingBytes: number;
  speedBytesPerSecond: number;
  etaSeconds?: number;
  active: number;
  items: DownloadItemState[];
}

function initialProgress(sounds: SendableSound[]): DownloadProgress {
  const totalBytes = sounds.reduce((sum, sound) => sum + (sound.fileSize ?? 0), 0);
  return {
    current: 0,
    total: sounds.length,
    failed: 0,
    downloadedBytes: 0,
    totalBytes,
    remainingBytes: totalBytes,
    speedBytesPerSecond: 0,
    active: 0,
    items: sounds.map((sound) => ({ id: sound.id, name: sound.name, state: "queued", loadedBytes: 0, totalBytes: sound.fileSize ?? 0, speedBytesPerSecond: 0 })),
  };
}

export async function downloadSoundsToDirectory(
  sounds: SendableSound[],
  _directoryHandle: null,
  onProgress?: (progress: DownloadProgress) => void,
  groupName?: string,
): Promise<{ completed: number; failed: number; reused: number }> {
  if (!groupName) throw new Error("Falta el grupo de escena para la descarga.");
  const progress = initialProgress(sounds);
  const startedAt = performance.now();
  let nextIndex = 0;
  let lastEmit = 0;
  let lastSpeedAt = startedAt;
  let lastSpeedBytes = 0;
  let reused = 0;

  const emit = (force = false) => {
    const now = performance.now();
    progress.downloadedBytes = progress.items.reduce((sum, item) => sum + item.loadedBytes, 0);
    progress.remainingBytes = Math.max(0, progress.totalBytes - progress.downloadedBytes);
    if (force || now - lastSpeedAt >= 250) {
      const elapsed = (now - lastSpeedAt) / 1000;
      const delta = progress.downloadedBytes - lastSpeedBytes;
      if (elapsed > 0) progress.speedBytesPerSecond = Math.max(0, delta / elapsed);
      lastSpeedAt = now;
      lastSpeedBytes = progress.downloadedBytes;
    }
    progress.items.forEach((item) => { item.speedBytesPerSecond = item.state === "downloading" ? progress.speedBytesPerSecond : 0; });
    progress.etaSeconds = progress.speedBytesPerSecond > 0 && progress.remainingBytes > 0 ? progress.remainingBytes / progress.speedBytesPerSecond : undefined;
    if (force || now - lastEmit >= 100) {
      lastEmit = now;
      onProgress?.({ ...progress, items: progress.items.map((item) => ({ ...item })) });
    }
  };

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= sounds.length) return;
      const item = progress.items[index];
      item.state = "downloading";
      progress.active += 1;
      emit(true);
      try {
        const res = await fetch(`${BRIDGE_URL}/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sound: sounds[index], groupName }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? `error ${res.status}`);
        }
        const reusedHeader = res.headers.get("x-audiar-reused");
        if (reusedHeader === "1") reused += 1;
        const responseBytes = Number(res.headers.get("content-length") ?? item.totalBytes ?? 0);
        if (responseBytes > 0 && item.totalBytes !== responseBytes) {
          progress.totalBytes += responseBytes - item.totalBytes;
          item.totalBytes = responseBytes;
        }
        if (res.body) {
          const reader = res.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              item.loadedBytes += value.byteLength;
              emit(false);
            }
          } finally {
            reader.releaseLock();
          }
        } else {
          const blob = await res.blob();
          item.loadedBytes = blob.size;
        }
        item.loadedBytes = Math.max(item.loadedBytes, item.totalBytes);
        item.state = "done";
        progress.current += 1;
      } catch (error: any) {
        item.state = "error";
        item.error = error?.message ?? "Error de descarga";
        progress.failed += 1;
        progress.current += 1;
      } finally {
        progress.active = Math.max(0, progress.active - 1);
        emit(true);
      }
    }
  };

  if (!sounds.length) {
    onProgress?.(progress);
    return { completed: 0, failed: 0, reused: 0 };
  }
  await Promise.all(Array.from({ length: Math.min(3, sounds.length) }, () => worker()));
  emit(true);
  return { completed: sounds.length - progress.failed, failed: progress.failed, reused };
}

export async function sendToReaperBridge(sounds: SendableSound[], sceneName = "", groupName = ""): Promise<SendResult> {
  try {
    const res = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sounds, sceneName, groupName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, notFound: false, error: data?.error ?? `error ${res.status}` };
    return { ok: true, count: data.queued ?? sounds.length, groupName: String(data.groupName ?? groupName), reusedCount: Number(data.reusedCount ?? 0) };
  } catch (error: any) {
    return { ok: false, notFound: true, error: error?.message ?? "No se encontró REAPER Bridge" };
  }
}

export async function getFreesoundOAuthStatus(): Promise<{ connected: boolean; configured: boolean; expiresAt?: number }> {
  const res = await fetch(`${BRIDGE_URL}/oauth/status`);
  if (!res.ok) throw new Error("No se pudo consultar el estado de Freesound.");
  return res.json();
}
