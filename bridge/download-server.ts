// AUDIAR — servidor local de descargas.
// Corre junto al Bridge principal y entrega el archivo original de Freesound
// al navegador para guardarlo en la carpeta que eligió el usuario.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
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
  await import("node:fs/promises").then(({ writeFile }) => writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8"));
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

async function downloadOriginal(sound: IncomingSound): Promise<{ path: string; filename: string }> {
  if (sound.source !== "freesound" || sound.freesoundId == null) {
    throw new Error("El sonido no contiene un ID válido de Freesound.");
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("No hay una conexión OAuth válida con Freesound.");
  }

  const originalFilename = sound.originalFilename?.trim() || `${sound.name.trim() || `sound-${sound.freesoundId}`}.wav`;
  const filename = originalFilename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || `sound-${sound.freesoundId}.wav`;
  const ext = path.extname(filename) || ".wav";
  const cacheFilename = `${sound.freesoundId}-${Buffer.from(filename).toString("base64url").slice(0, 48)}${ext.toLowerCase()}`;
  const localPath = path.join(CACHE_DIR, `download-${cacheFilename}`);

  if (!existsSync(localPath)) {
    const url = `${FREESOUND_API}/sounds/${sound.freesoundId}/download/`;
    const response = await requestStream(url, { Authorization: `Bearer ${accessToken}` });
    const status = response.statusCode ?? 0;

    if (status === 401) {
      response.resume();
      const refreshed = await refreshAccessToken(await loadOAuthStore());
      if (!refreshed.accessToken) throw new Error("No se pudo renovar la conexión con Freesound.");
      const retry = await requestStream(url, { Authorization: `Bearer ${refreshed.accessToken}` });
      const retryStatus = retry.statusCode ?? 0;
      if (retryStatus < 200 || retryStatus >= 300) {
        retry.resume();
        throw new Error(`HTTP ${retryStatus}`);
      }
      await pipeline(retry, createWriteStream(`${localPath}.part`));
    } else {
      if (status < 200 || status >= 300) {
        response.resume();
        throw new Error(`HTTP ${status}`);
      }
      await pipeline(response, createWriteStream(`${localPath}.part`));
    }

    await rename(`${localPath}.part`, localPath).catch(async (error) => {
      await unlink(`${localPath}.part`).catch(() => undefined);
      throw error;
    });
  }

  return { path: localPath, filename };
}

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
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

    const local = await downloadOriginal(sound);
    res.writeHead(200, {
      ...CORS_HEADERS,
      "Content-Type": sound.originalType?.startsWith("audio/")
        ? sound.originalType
        : sound.originalType
          ? `audio/${sound.originalType}`
          : "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(local.filename)}`,
    });
    createReadStream(local.path).pipe(res);
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
