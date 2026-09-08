// Habla con bridge/index.ts, que corre local en tu máquina (puerto 8765).
// Las descargas directas usan el servicio local en el puerto 8766.
import type { Layer, SoundtrackElement } from "./types";
import { ELEMENTS } from "./types";

const BRIDGE_URL = "http://localhost:8765";
const DOWNLOAD_BRIDGE_URL = "http://localhost:8766";

const ROOT_DB_NAME = "audiar-settings";
const ROOT_DB_STORE = "handles";
const ROOT_DB_KEY = "download-root";

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
  handle: any;
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

function openRootDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROOT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ROOT_DB_STORE)) {
        request.result.createObjectStore(ROOT_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
  });
}

async function loadSavedRootHandle(): Promise<any | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openRootDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(ROOT_DB_STORE, "readonly").objectStore(ROOT_DB_STORE).get(ROOT_DB_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function saveRootHandle(handle: any): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openRootDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(ROOT_DB_STORE, "readwrite").objectStore(ROOT_DB_STORE).put(handle, ROOT_DB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Si el navegador no permite persistir el handle, seguimos funcionando durante la sesión.
  }
}

async function directoryPermission(handle: any): Promise<"granted" | "prompt" | "denied"> {
  if (typeof handle?.queryPermission !== "function") return "granted";
  return handle.queryPermission({ mode: "readwrite" });
}

async function ensureDirectoryPermission(handle: any): Promise<boolean> {
  let permission = await directoryPermission(handle);
  if (permission === "granted") return true;
  if (permission === "denied") return false;
  if (typeof handle?.requestPermission !== "function") return false;
  permission = await handle.requestPermission({ mode: "readwrite" });
  return permission === "granted";
}

export async function getOrChooseDownloadRoot(): Promise<DownloadRootHandle> {
  const saved = await loadSavedRootHandle();
  if (saved && await ensureDirectoryPermission(saved)) {
    return { handle: saved, name: saved.name ?? "AUDIAR" };
  }

  const picker = (window as any).showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new Error("La selección de carpetas requiere Chrome o Edge actualizado.");
  }
  const handle = await picker({ mode: "readwrite" });
  await saveRootHandle(handle);
  return { handle, name: handle.name ?? "AUDIAR" };
}

async function nextGroupNumber(root: any): Promise<number> {
  let max = 0;
  try {
    if (typeof root?.entries !== "function") return 1;
    for await (const [name, value] of root.entries()) {
      if (value?.kind !== "directory") continue;
      const match = String(name).match(/^GRUPO\s+(\d+)\b/i);
      if (match) max = Math.max(max, Number(match[1]));
    }
  } catch {
    // Ante cualquier limitación del navegador, empezamos en 1 y evitamos sobrescribir abajo.
  }
  return max + 1;
}

function sanitizeSceneName(value: string): string {
  return value
    .trim()
    .replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

export async function createSceneGroupDirectory(root: any, sceneName = ""): Promise<{ handle: any; name: string; number: number }> {
  const number = await nextGroupNumber(root);
  const baseName = `GRUPO ${String(number).padStart(2, "0")} - Escena ${String(number).padStart(2, "0")}`;
  const cleanSceneName = sanitizeSceneName(sceneName);
  const name = cleanSceneName ? `${baseName} - ${cleanSceneName}` : baseName;
  const handle = await root.getDirectoryHandle(name, { create: true });
  return { handle, name, number };
}

function safeDownloadFilename(sound: SendableSound): string {
  const raw = sound.originalFilename?.trim() || sound.name.trim() || `sound-${sound.freesoundId ?? sound.id}`;
  return raw
    .replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || `sound-${sound.freesoundId ?? sound.id}`;
}

export type DownloadItemState = "queued" | "downloading" | "done" | "error";

export interface DownloadItemProgress {
  id: string;
  name: string;
  state: DownloadItemState;
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
  items: DownloadItemProgress[];
}

function createInitialProgress(sounds: SendableSound[]): DownloadProgress {
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
    items: sounds.map((sound) => ({
      id: sound.id,
      name: sound.name,
      state: "queued",
      loadedBytes: 0,
      totalBytes: sound.fileSize ?? 0,
      speedBytesPerSecond: 0,
    })),
  };
}

function contentLength(response: Response): number {
  const value = Number(response.headers.get("content-length") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function filenameExists(directoryHandle: any, filename: string): Promise<boolean> {
  try {
    await directoryHandle.getFileHandle(filename, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function resolveDownloadFilename(sound: SendableSound, directoryHandle: any, usedNames: Set<string>): Promise<string> {
  const initial = safeDownloadFilename(sound);
  const dot = initial.lastIndexOf(".");
  const stem = dot > 0 ? initial.slice(0, dot) : initial;
  const ext = dot > 0 ? initial.slice(dot) : "";
  let filename = initial;
  let suffix = 2;
  while (usedNames.has(filename.toLowerCase()) || await filenameExists(directoryHandle, filename)) {
    filename = `${stem} (${suffix})${ext}`;
    suffix += 1;
  }
  usedNames.add(filename.toLowerCase());
  return filename;
}

async function downloadOneToDirectory(sound: SendableSound, index: number, directoryHandle: any, usedNames: Set<string>, progress: DownloadProgress, emit: () => void): Promise<void> {
  const item = progress.items[index];
  item.state = "downloading";
  progress.active += 1;
  emit();

  const res = await fetch(`${DOWNLOAD_BRIDGE_URL}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sound }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `error ${res.status}`);
  }

  const responseBytes = contentLength(res);
  if (responseBytes > 0 && item.totalBytes !== responseBytes) {
    progress.totalBytes += responseBytes - item.totalBytes;
    item.totalBytes = responseBytes;
  }

  const filename = await resolveDownloadFilename(sound, directoryHandle, usedNames);
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    if (!res.body) {
      const blob = await res.blob();
      await writable.write(blob);
      item.loadedBytes = blob.size;
    } else {
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          item.loadedBytes += value.byteLength;
          emit();
        }
      } finally {
        reader.releaseLock();
      }
    }
    await writable.close();
    item.state = "done";
    progress.current += 1;
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function downloadSoundsToDirectory(sounds: SendableSound[], directoryHandle: any, onProgress?: (progress: DownloadProgress) => void): Promise<{ completed: number; failed: number }> {
  const progress = createInitialProgress(sounds);
  if (sounds.length === 0) {
    onProgress?.(progress);
    return { completed: 0, failed: 0 };
  }

  const usedNames = new Set<string>();
  let nextIndex = 0;
  const startedAt = performance.now();
  let lastSpeedAt = startedAt;
  let lastSpeedBytes = 0;
  let lastEmitAt = 0;

  const emit = (force = false) => {
    const now = performance.now();
    progress.downloadedBytes = progress.items.reduce((sum, item) => sum + item.loadedBytes, 0);
    progress.remainingBytes = Math.max(0, progress.totalBytes - progress.downloadedBytes);

    if (now - lastSpeedAt >= 250 || force) {
      const elapsed = (now - lastSpeedAt) / 1000;
      const delta = progress.downloadedBytes - lastSpeedBytes;
      if (elapsed > 0) progress.speedBytesPerSecond = Math.max(0, delta / elapsed);
      lastSpeedAt = now;
      lastSpeedBytes = progress.downloadedBytes;
    }

    progress.items.forEach((item) => {
      if (item.state === "downloading" && progress.speedBytesPerSecond > 0) item.speedBytesPerSecond = progress.speedBytesPerSecond;
      else if (item.state !== "downloading") item.speedBytesPerSecond = 0;
    });

    progress.etaSeconds = progress.speedBytesPerSecond > 0 && progress.remainingBytes > 0
      ? progress.remainingBytes / progress.speedBytesPerSecond
      : undefined;

    const shouldEmit = force || now - lastEmitAt >= 100;
    if (shouldEmit) {
      lastEmitAt = now;
      onProgress?.({ ...progress, items: progress.items.map((item) => ({ ...item })) });
    }
  };

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= sounds.length) return;
      try {
        await downloadOneToDirectory(sounds[index], index, directoryHandle, usedNames, progress, () => emit(false));
      } catch (error: any) {
        progress.failed += 1;
        progress.items[index].state = "error";
        progress.items[index].error = error?.message ?? "Error de descarga";
      } finally {
        progress.active = Math.max(0, progress.active - 1);
        if (progress.items[index].state === "error") progress.current += 1;
        emit(true);
      }
    }
  };

  const workerCount = Math.min(3, sounds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  emit(true);
  return { completed: sounds.length - progress.failed, failed: progress.failed };
}

export async function getFreesoundOAuthStatus(): Promise<{ connected: boolean; configured: boolean; expiresAt?: number }> {
  const res = await fetch(`${BRIDGE_URL}/oauth/status`);
  if (!res.ok) throw new Error("No se pudo consultar el estado de Freesound.");
  return res.json();
}
