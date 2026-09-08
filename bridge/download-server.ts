// AUDIAR — servidor local de descargas.
// Entrega el archivo original de Freesound al navegador y reutiliza la misma
// caché local que usa el REAPER Bridge para evitar descargas duplicadas.

import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { get as httpsGet } from "node:https";
import type { IncomingMessage } from "node:http";

const PORT = 8766;
const FREESOUND_API = "https://freesound.org/apiv2";
const OAUTH_FILE = "freesound-oauth.json";
const MAX_REDIRECTS = 5;

function defaultReaperResourcePath(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "REAPER");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? home, "REAPER");
  return path.join(home, ".config", "REAPER");
}

const REAPER_RESOURCE_PATH = process.env.AUDIAR_REAPER_RESOURCE_PATH ?? defaultReaperResourcePath();
const BRIDGE_DIR = path.join(REAPER_RESOURCE_PATH, "audiar-bridge");
const CACHE_DIR = path.join(BRIDGE_DIR, "cache");
const OAUTH_PATH = path.join(BRIDGE_DIR, OAUTH_FILE);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface IncomingSound {
  id: string;
  name: string;
  audioUrl: string;
  freesoundId?: number;
  source?: string;
  originalFilename?: string;
  originalType?: string;
}

interface OAuthStore {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

async function loadOAuthStore(): Promise<OAuthStore> {
  try {
    const raw = await readFile(OAUTH_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveOAuthStore(store: OAuthStore): Promise<void> {
  const tmpPath = `${OAUTH_PATH}.tmp`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  await rename(tmpPath, OAUTH_PATH);
}

async function refreshAccessToken(store: OAuthStore): Promise<OAuthStore> {
  if (!store.clientId || !store.clientSecret || !store.refreshToken) {
    throw new Error("No hay refresh token de Freesound disponible.");
  }
  const body = new URLSearchParams({
    client_id: store.clientId,
    client_secret: store.clientSecret,
    grant_type: "refresh_token",
    refresh_token: store.refreshToken,
  });
  const res = await fetch(`${FREESOUND_API}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `OAuth refresh failed (${res.status})`);
  }
  const next: OAuthStore = {
    ...store,
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : store.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in ?? 86400) * 1000,
  };
  await saveOAuthStore(next);
  return next;
}

async function getValidAccessToken(): Promise<string | null> {
  let store = await loadOAuthStore();
  if (!store.accessToken) return null;
  if (store.expiresAt && store.expiresAt > Date.now() + 60_000) return store.accessToken;
  if (!store.refreshToken) return null;
  store = await refreshAccessToken(store);
  return store.accessToken ?? null;
}

function requestStream(url: string, headers: Record<string, string> = {}, redirectCount = 0): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error(`Demasiadas redirecciones (${MAX_REDIRECTS})`));
      return;
    }

    const request = httpsGet(url, { headers }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const location = new URL(response.headers.location, url).toString();
        requestStream(location, {}, redirectCount + 1).then(resolve, reject);
        return;
      }
      resolve(response);
    });

    request.on("error", (error) => {
      reject(new Error(`HTTPS ${new URL(url).hostname}: ${error.message}`));
    });
  });
}

function safeFilename(sound: IncomingSound): string {
  const raw = sound.originalFilename?.trim() || `${sound.name.trim() || `sound-${sound.freesoundId}`}.wav`;
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || `sound-${sound.freesoundId}.wav`;
}

function safeCacheId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function contentType(sound: IncomingSound): string {
  if (sound.originalType?.startsWith("audio/")) return sound.originalType;
  if (sound.originalType) return `audio/${sound.originalType}`;
  return "application/octet-stream";
}

async function prepareOriginal(sound: IncomingSound): Promise<{
  filename: string;
  localPath: string;
  response?: IncomingMessage;
}> {
  if (sound.source !== "freesound" || sound.freesoundId == null) {
    throw new Error("El sonido no contiene un ID válido de Freesound.");
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("No hay una conexión OAuth válida con Freesound.");

  const filename = safeFilename(sound);
  const ext = path.extname(filename) || ".wav";
  // El nombre coincide con el caché del REAPER Bridge:
  // <sound.id>-original.<ext>
  const localPath = path.join(CACHE_DIR, `${safeCacheId(sound.id)}-original${ext.toLowerCase()}`);

  if (existsSync(localPath)) return { filename, localPath };

  const url = `${FREESOUND_API}/sounds/${sound.freesoundId}/download/`;
  let response = await requestStream(url, { Authorization: `Bearer ${accessToken}` });
  let status = response.statusCode ?? 0;

  if (status === 401) {
    response.resume();
    const refreshed = await refreshAccessToken(await loadOAuthStore());
    if (!refreshed.accessToken) throw new Error("No se pudo renovar la conexión con Freesound.");
    response = await requestStream(url, { Authorization: `Bearer ${refreshed.accessToken}` });
    status = response.statusCode ?? 0;
  }

  if (status < 200 || status >= 300) {
    response.resume();
    throw new Error(`HTTP ${status}`);
  }

  return { filename, localPath, response };
}

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function serveCached(res: import("node:http").ServerResponse, localPath: string, filename: string, sound: IncomingSound) {
  const fileInfo = await stat(localPath);
  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": contentType(sound),
    "Content-Length": String(fileInfo.size),
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  createReadStream(localPath).pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.url !== "/download" || req.method !== "POST") {
    json(res, 404, { error: "not found" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const sound = body?.sound as IncomingSound | undefined;
    if (!sound || typeof sound !== "object") {
      json(res, 400, { error: "no se recibió un sonido válido" });
      return;
    }

    const prepared = await prepareOriginal(sound);
    if (!prepared.response) {
      await serveCached(res, prepared.localPath, prepared.filename, sound);
      return;
    }

    const upstream = prepared.response;
    const total = Number(upstream.headers["content-length"] ?? 0);
    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      "Content-Type": contentType(sound),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(prepared.filename)}`,
    };
    if (Number.isFinite(total) && total > 0) headers["Content-Length"] = String(total);

    res.writeHead(200, headers);

    const cachePart = `${prepared.localPath}.part`;
    const cacheStream = createWriteStream(cachePart);
    let cacheFailed = false;

    cacheStream.on("error", (error) => {
      cacheFailed = true;
      console.warn(`[AUDIAR Download] No se pudo guardar caché: ${error.message}`);
      cacheStream.destroy();
    });
    cacheStream.on("finish", async () => {
      if (cacheFailed) return;
      try {
        await rename(cachePart, prepared.localPath);
      } catch (error: any) {
        await unlink(cachePart).catch(() => undefined);
        console.warn(`[AUDIAR Download] No se pudo finalizar caché: ${error?.message ?? error}`);
      }
    });

    upstream.on("error", (error) => {
      cacheStream.destroy(error);
      if (!res.destroyed) res.destroy(error);
    });

    upstream.pipe(cacheStream);
    upstream.pipe(res);
  } catch (error: any) {
    if (!res.headersSent) json(res, 500, { error: error?.message ?? "No se pudo descargar el archivo original." });
    else res.destroy(error);
  }
});

mkdir(CACHE_DIR, { recursive: true }).then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`AUDIAR Download Server escuchando en http://localhost:${PORT}`);
  });
});
