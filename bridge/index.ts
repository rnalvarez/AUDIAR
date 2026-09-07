// AUDIAR REAPER Bridge — servidor local, corre en tu máquina, nunca en internet.
// Recibe pedidos de AUDIAR, descarga los audios y deja jobs para el ReaScript.
// Con OAuth2 de Freesound intenta descargar el archivo ORIGINAL; sin OAuth usa el preview.

import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 8765;
const FREESOUND_API = "https://freesound.org/apiv2";

function defaultReaperResourcePath(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "REAPER");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? home, "REAPER");
  return path.join(home, ".config", "REAPER");
}

const REAPER_RESOURCE_PATH = process.env.AUDIAR_REAPER_RESOURCE_PATH ?? defaultReaperResourcePath();
const BRIDGE_DIR = path.join(REAPER_RESOURCE_PATH, "audiar-bridge");
const JOBS_DIR = path.join(BRIDGE_DIR, "jobs");
const CACHE_DIR = path.join(BRIDGE_DIR, "cache");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface IncomingSound {
  id: string;
  name: string;
  element: string;
  audioUrl: string;
  freesoundId?: number;
  gainDb?: number;
  pan?: number;
  license?: string;
  source?: string;
}

interface DownloadedSound {
  path: string;
  track: string;
  name: string;
  gainDb?: number;
  pan?: number;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

function luaStringLiteral(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function safeBaseName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function extensionFromUrl(url: string): string {
  try {
    return path.extname(new URL(url).pathname) || ".mp3";
  } catch {
    return ".mp3";
  }
}

function extensionFromOriginal(type: unknown, originalFilename: unknown): string {
  if (typeof originalFilename === "string") {
    const ext = path.extname(originalFilename);
    if (ext) return ext.toLowerCase();
  }
  const value = String(type ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const extensions: Record<string, string> = {
    wav: ".wav", wave: ".wav", aif: ".aif", aiff: ".aiff", flac: ".flac",
    ogg: ".ogg", mp3: ".mp3", m4a: ".m4a",
  };
  return extensions[value] ?? ".wav";
}

async function fetchOriginalInfo(
  sound: IncomingSound,
  apiKey: string,
): Promise<{ downloadUrl: string; extension: string } | null> {
  if (sound.freesoundId == null) return null;
  const url = new URL(`${FREESOUND_API}/sounds/${sound.freesoundId}/`);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("fields", "download,type,original_filename");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data: any = await res.json();
  if (typeof data?.download !== "string" || !data.download) return null;
  return {
    downloadUrl: data.download,
    extension: extensionFromOriginal(data?.type, data?.original_filename),
  };
}

async function downloadUrlToCache(id: string, url: string, extension: string, headers?: HeadersInit): Promise<string> {
  const localPath = path.join(CACHE_DIR, `${safeBaseName(id)}${extension}`);
  if (existsSync(localPath)) return localPath;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
}

async function downloadAudio(
  sound: IncomingSound,
  freesoundApiKey?: string,
  freesoundAccessToken?: string,
): Promise<{ path: string; originalUsed: boolean }> {
  if (sound.source === "freesound" && freesoundApiKey?.trim() && freesoundAccessToken?.trim()) {
    try {
      const original = await fetchOriginalInfo(sound, freesoundApiKey.trim());
      if (original) {
        const path = await downloadUrlToCache(
          `${sound.id}-original`,
          original.downloadUrl,
          original.extension,
          { Authorization: `Bearer ${freesoundAccessToken.trim()}` },
        );
        return { path, originalUsed: true };
      }
    } catch (error) {
      console.warn(`[AUDIAR Bridge] No se pudo obtener el original de ${sound.name}; uso preview.`, error);
    }
  }

  return {
    path: await downloadUrlToCache(sound.id, sound.audioUrl, extensionFromUrl(sound.audioUrl)),
    originalUsed: false,
  };
}

async function writeJobFile(sound: DownloadedSound): Promise<string> {
  const fields = [
    `path = ${luaStringLiteral(sound.path)}`,
    `track = ${luaStringLiteral(sound.track)}`,
    `name = ${luaStringLiteral(sound.name)}`,
  ];
  if (typeof sound.gainDb === "number") fields.push(`gainDb = ${sound.gainDb}`);
  if (typeof sound.pan === "number") fields.push(`pan = ${sound.pan}`);
  const lua = `return {\n  { ${fields.join(", ")} },\n}\n`;
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `job_${uniqueSuffix}.lua`;
  await writeFile(path.join(JOBS_DIR, fileName), lua, "utf-8");
  return fileName;
}

async function ensureDirs() {
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
}

async function downloadAndQueueSound(
  sound: IncomingSound,
  freesoundApiKey?: string,
  freesoundAccessToken?: string,
): Promise<void> {
  try {
    const local = await downloadAudio(sound, freesoundApiKey, freesoundAccessToken);
    await writeJobFile({
      path: local.path,
      track: sound.element,
      name: sound.name,
      gainDb: sound.gainDb,
      pan: sound.pan,
    });
    console.log(`[AUDIAR Bridge] Listo para REAPER: ${sound.name}${local.originalUsed ? " [ORIGINAL]" : " [preview]"}`);
  } catch (err: any) {
    console.error(`[AUDIAR Bridge] Error descargando ${sound.name}:`, err?.message ?? err);
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.url === "/ping" && req.method === "GET") {
    json(res, 200, { ok: true, bridge: "audiar-reaper-bridge" });
    return;
  }

  if (req.url === "/send" && req.method === "POST") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      const sounds: IncomingSound[] = Array.isArray(body?.sounds) ? body.sounds : [];
      if (sounds.length === 0) {
        json(res, 400, { error: "no se recibieron sonidos" });
        return;
      }

      const freesoundApiKey = typeof body?.freesoundApiKey === "string" ? body.freesoundApiKey : undefined;
      const freesoundAccessToken = typeof body?.freesoundAccessToken === "string" ? body.freesoundAccessToken : undefined;

      // El navegador no espera a que terminen las descargas. Cada sonido genera
      // su job apenas termina y REAPER lo recoge independientemente.
      json(res, 202, { ok: true, queued: sounds.length });
      void Promise.all(sounds.map((sound) => downloadAndQueueSound(sound, freesoundApiKey, freesoundAccessToken)));
    } catch (err: any) {
      if (!res.headersSent) json(res, 500, { error: err?.message ?? "error inesperado en el bridge" });
    }
    return;
  }

  json(res, 404, { error: "not found" });
});

ensureDirs().then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`AUDIAR REAPER Bridge escuchando en http://localhost:${PORT}`);
    console.log(`Carpeta de trabajos: ${JOBS_DIR}`);
    console.log(`Asegurate de tener audiar-bridge.lua cargado y corriendo en REAPER.`);
  });
});
