// AUDIAR REAPER Bridge — servidor local, corre en tu máquina, nunca en internet.
// Recibe pedidos de AUDIAR, descarga los audios y deja jobs para el ReaScript.
// También gestiona OAuth2 de Freesound y descarga el archivo original cuando está autorizado.

import { createServer } from "node:http";
import { mkdir, writeFile, readFile, rename, unlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

const PORT = 8765;
const FREESOUND_API = "https://freesound.org/apiv2";
const OAUTH_REDIRECT_URI = "https://rnalvarez.github.io/AUDIAR/freesound-oauth.html";
const OAUTH_FILE = "freesound-oauth.json";

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
const OAUTH_PATH = path.join(BRIDGE_DIR, OAUTH_FILE);

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

interface OAuthStore {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

let oauthState: string | null = null;

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
  await writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  await rename(tmpPath, OAUTH_PATH);
}

async function clearOAuthTokens(): Promise<void> {
  const store = await loadOAuthStore();
  delete store.accessToken;
  delete store.refreshToken;
  delete store.expiresAt;
  await saveOAuthStore(store);
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

async function findCachedOriginal(sound: IncomingSound): Promise<string | null> {
  const prefix = `${safeBaseName(sound.id)}-original.`;
  try {
    const entries = await readdir(CACHE_DIR);
    const match = entries.find((entry) => entry.startsWith(prefix));
    return match ? path.join(CACHE_DIR, match) : null;
  } catch {
    return null;
  }
}

async function exchangeCode(code: string): Promise<OAuthStore> {
  const store = await loadOAuthStore();
  if (!store.clientId || !store.clientSecret) throw new Error("Faltan Client ID/Secret de Freesound.");
  const body = new URLSearchParams({
    client_id: store.clientId,
    client_secret: store.clientSecret,
    grant_type: "authorization_code",
    code,
  });
  const res = await fetch(`${FREESOUND_API}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `OAuth token exchange failed (${res.status})`);
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
  if (!res.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `OAuth refresh failed (${res.status})`);
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

async function downloadOriginalFromFreesound(sound: IncomingSound): Promise<string | null> {
  if (sound.source !== "freesound" || sound.freesoundId == null) return null;
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const infoRes = await fetch(`${FREESOUND_API}/sounds/${sound.freesoundId}/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) return null;
  const info: any = await infoRes.json().catch(() => ({}));
  const extension = extensionFromOriginal(info?.type, info?.original_filename);
  const filename = `${safeBaseName(sound.id)}-original${extension}`;
  const localPath = path.join(CACHE_DIR, filename);

  if (!existsSync(localPath)) {
    let downloadRes = await fetch(`${FREESOUND_API}/sounds/${sound.freesoundId}/download/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (downloadRes.status === 401) {
      const refreshed = await refreshAccessToken(await loadOAuthStore());
      if (!refreshed.accessToken) return null;
      downloadRes = await fetch(`${FREESOUND_API}/sounds/${sound.freesoundId}/download/`, {
        headers: { Authorization: `Bearer ${refreshed.accessToken}` },
      });
    }
    if (!downloadRes.ok) return null;
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    await writeFile(localPath, buffer);
  }
  return localPath;
}

async function downloadPreview(sound: IncomingSound): Promise<string> {
  const localPath = path.join(CACHE_DIR, `${safeBaseName(sound.id)}${extensionFromUrl(sound.audioUrl)}`);
  if (existsSync(localPath)) return localPath;
  const res = await fetch(sound.audioUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
}

async function downloadAudio(sound: IncomingSound): Promise<{ path: string; originalUsed: boolean }> {
  // 1) Never hit the network for a sound whose original is already cached.
  const cachedOriginal = await findCachedOriginal(sound);
  if (cachedOriginal) return { path: cachedOriginal, originalUsed: true };

  // 2) No original cached: try to obtain the original from Freesound.
  try {
    const original = await downloadOriginalFromFreesound(sound);
    if (original) return { path: original, originalUsed: true };
  } catch (error) {
    console.warn(`[AUDIAR Bridge] No se pudo obtener original: ${sound.name}`, error);
  }

  // 3) Fall back to the preview; downloadPreview() itself is cache-aware.
  return { path: await downloadPreview(sound), originalUsed: false };
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

async function downloadAndQueueSound(sound: IncomingSound): Promise<void> {
  try {
    const local = await downloadAudio(sound);
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

  if (req.url === "/oauth/status" && req.method === "GET") {
    const store = await loadOAuthStore();
    json(res, 200, {
      configured: Boolean(store.clientId && store.clientSecret),
      connected: Boolean(store.accessToken),
      expiresAt: store.expiresAt,
    });
    return;
  }

  if (req.url === "/oauth/configure" && req.method === "POST") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
      const clientSecret = typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
      if (!clientId || !clientSecret) {
        json(res, 400, { error: "Se requieren Client ID y Client Secret." });
        return;
      }
      const current = await loadOAuthStore();
      await saveOAuthStore({ clientId, clientSecret, accessToken: current.accessToken, refreshToken: current.refreshToken, expiresAt: current.expiresAt });
      json(res, 200, { ok: true });
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? "No se pudieron guardar las credenciales." });
    }
    return;
  }

  if (req.url === "/oauth/start" && req.method === "GET") {
    const store = await loadOAuthStore();
    if (!store.clientId) {
      json(res, 400, { error: "Configurá primero el Client ID y Client Secret de Freesound." });
      return;
    }
    oauthState = randomBytes(24).toString("hex");
    const url = new URL(`${FREESOUND_API}/oauth2/authorize/`);
    url.searchParams.set("client_id", store.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", oauthState);
    url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
    json(res, 200, { authorizationUrl: url.toString(), redirectUri: OAUTH_REDIRECT_URI });
    return;
  }

  if (req.url === "/oauth/callback" && req.method === "POST") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      const code = typeof body?.code === "string" ? body.code : "";
      const state = typeof body?.state === "string" ? body.state : "";
      if (!code || !state || !oauthState || state !== oauthState) {
        json(res, 400, { error: "Estado OAuth inválido o autorización incompleta." });
        return;
      }
      oauthState = null;
      const store = await exchangeCode(code);
      json(res, 200, { ok: true, expiresAt: store.expiresAt });
    } catch (err: any) {
      json(res, 400, { error: err?.message ?? "No se pudo completar OAuth con Freesound." });
    }
    return;
  }

  if (req.url === "/oauth/disconnect" && req.method === "POST") {
    try {
      await clearOAuthTokens();
      json(res, 200, { ok: true, configured: Boolean((await loadOAuthStore()).clientId) });
    } catch (err: any) {
      json(res, 500, { error: err?.message ?? "No se pudo desconectar Freesound." });
    }
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
      json(res, 202, { ok: true, queued: sounds.length });
      void Promise.all(sounds.map(downloadAndQueueSound));
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
    console.log(`OAuth redirect: ${OAUTH_REDIRECT_URI}`);
    console.log(`Asegurate de tener audiar-bridge.lua cargado y corriendo en REAPER.`);
  });
});