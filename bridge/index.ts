// AUDIAR REAPER Bridge — servidor local, corre en tu máquina, nunca en
// internet. Recibe pedidos de AUDIAR (navegador), descarga los audios, y
// deja un archivo de "trabajo" en la carpeta que audiar-bridge.lua vigila
// desde adentro de REAPER. No habla con REAPER directamente — ni falta
// que hace, porque no existe una forma confiable de que un proceso externo
// escriba directo en la memoria/proyecto de REAPER. El archivo de trabajo
// es la posta.
//
// Ver bridge/README.md para instalación completa.

import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 8765;

// Ubicación estándar del resource path de REAPER por sistema operativo —
// no es una función de la API de REAPER, es la carpeta donde REAPER guarda
// sus datos de siempre. Si tu instalación es "portable" o no está en el
// lugar de siempre, sobreescribí con la variable de entorno de abajo (en
// REAPER: Options > Show REAPER resource path in explorer/finder, para
// confirmar cuál es la tuya).
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
  "Access-Control-Allow-Origin": "*", // solo escucha en localhost; no hay nada que proteger de otros orígenes acá
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface IncomingSound {
  id: string;
  name: string;
  element: string; // Ambientes/Efectos/Foley/Diálogos, ya en mayúscula inicial desde AUDIAR
  audioUrl: string;
  gainDb?: number;
  pan?: number;
  license?: string;
  source?: string;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

// Escapa un string para insertarlo como literal Lua entre comillas dobles
// — la tabla de trabajo se escribe como código Lua real (no JSON) para que
// el propio dofile() de Lua la parsee sin que este bridge tenga que
// implementar un parser JSON del lado de REAPER.
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
  if (existsSync(localPath)) return localPath; // ya descargado antes, no lo pide de nuevo

  const res = await fetch(sound.audioUrl);
  if (!res.ok) throw new Error(`No se pudo descargar ${sound.name}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
}

function writeJobFile(sounds: { path: string; track: string; name: string; gainDb?: number; pan?: number }[]) {
  const entries = sounds
    .map((s) => {
      const fields = [
        `path = ${luaStringLiteral(s.path)}`,
        `track = ${luaStringLiteral(s.track)}`,
        `name = ${luaStringLiteral(s.name)}`,
      ];
      if (typeof s.gainDb === "number") fields.push(`gainDb = ${s.gainDb}`);
      if (typeof s.pan === "number") fields.push(`pan = ${s.pan}`);
      return `  { ${fields.join(", ")} },`;
    })
    .join("\n");
  const lua = `return {\n${entries}\n}\n`;
  const fileName = `job_${Date.now()}.lua`;
  return writeFile(path.join(JOBS_DIR, fileName), lua, "utf-8").then(() => fileName);
}

async function ensureDirs() {
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
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

      const downloaded = [];
      for (const sound of sounds) {
        const localPath = await downloadAudio(sound);
        downloaded.push({ path: localPath, track: sound.element, name: sound.name, gainDb: sound.gainDb, pan: sound.pan });
      }
      const jobFile = await writeJobFile(downloaded);
      json(res, 200, { ok: true, job: jobFile, count: downloaded.length });
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? "error inesperado en el bridge" });
    }
  } else if (req.url !== "/send" && req.url !== "/ping") {
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
