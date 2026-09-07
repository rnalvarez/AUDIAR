// AUDIAR REAPER Bridge — servidor local, corre en tu máquina, nunca en
// internet. Recibe pedidos de AUDIAR (navegador), descarga los audios, y
// deja archivos de "trabajo" en la carpeta que audiar-bridge.lua vigila
// desde adentro de REAPER. No habla con REAPER directamente.
//
// Ver bridge/README.md para instalación completa.

import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 8765;

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

function safeFileName(id: string, url: string): string {
  const ext = path.extname(new URL(url).pathname) || ".mp3";
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe}${ext}`;
}

async function downloadAudio(sound: IncomingSound): Promise<string> {
  const fileName = safeFileName(sound.id, sound.audioUrl);
  const localPath = path.join(CACHE_DIR, fileName);
  if (existsSync(localPath)) return localPath;

  const res = await fetch(sound.audioUrl);
  if (!res.ok) throw new Error(`No se pudo descargar ${sound.name}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
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

async function downloadAndQueueSound(sound: IncomingSound): Promise<{ ok: true; job: string } | { ok: false; error: string }> {
  try {
    const localPath = await downloadAudio(sound);
    const job = await writeJobFile({
      path: localPath,
      track: sound.element,
      name: sound.name,
      gainDb: sound.gainDb,
      pan: sound.pan,
    });
    console.log(`[AUDIAR Bridge] Listo para REAPER: ${sound.name}`);
    return { ok: true, job };
  } catch (err: any) {
    const message = err?.message ?? `error descargando ${sound.name}`;
    console.error(`[AUDIAR Bridge] ${message}`);
    return { ok: false, error: message };
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

      // Respondemos inmediatamente: las descargas continúan en paralelo en
      // segundo plano. Cada archivo que termina genera su propio job y puede
      // ser importado por REAPER sin esperar al resto del lote.
      json(res, 202, { ok: true, queued: sounds.length });

      void Promise.all(sounds.map(downloadAndQueueSound));
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? "error inesperado en el bridge" });
    }
    return;
  }

  if (req.url !== "/ping") {
    json(res, 404, { error: "not found" });
  }
});

ensureDirs().then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`AUDIAR REAPER Bridge escuchando en http://localhost:${PORT}`);
    console.log(`Carpeta de trabajos: ${JOBS_DIR}`);
    console.log(`Asegurate de tener audiar-bridge.lua cargado y corriendo en REAPER (ver README.md).`);
  });
});
