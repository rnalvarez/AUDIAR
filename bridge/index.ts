// AUDIAR REAPER Bridge — servidor local, corre en tu máquina, nunca en internet.
// La carpeta de proyecto es persistente y configurable localmente.
// Los audios definitivos se guardan allí y REAPER usa exactamente esos mismos archivos.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, readFile, rename, unlink, readdir, stat, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";

const execFileAsync = promisify(execFile);

const PORT = 8765;
const FREESOUND_API = "https://freesound.org/apiv2";
const OAUTH_REDIRECT_URI = "https://rnalvarez.github.io/AUDIAR/freesound-oauth.html";
const OAUTH_FILE = "freesound-oauth.json";
const OAUTH_STATE_FILE = "freesound-oauth-state.json";
const DOWNLOAD_ROOT_FILE = "download-root.json";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_REDIRECTS = 5;

function defaultReaperResourcePath(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "REAPER");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? home, "REAPER");
  return path.join(home, ".config", "REAPER");
}

const REAPER_RESOURCE_PATH = process.env.AUDIAR_REAPER_RESOURCE_PATH ?? defaultReaperResourcePath();
const BRIDGE_DIR = path.join(REAPER_RESOURCE_PATH, "audiar-bridge");
const JOBS_DIR = path.join(BRIDGE_DIR, "jobs");
const OAUTH_PATH = path.join(BRIDGE_DIR, OAUTH_FILE);
const OAUTH_STATE_PATH = path.join(BRIDGE_DIR, OAUTH_STATE_FILE);
const DOWNLOAD_ROOT_PATH = path.join(BRIDGE_DIR, DOWNLOAD_ROOT_FILE);

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
  originalFilename?: string;
  originalType?: string;
  sampleRate?: number;
  bitDepth?: number;
  fileSize?: number;
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

interface OAuthStateStore {
  state: string;
  createdAt: number;
}

interface DownloadRootStore {
  path: string;
  updatedAt: number;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
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
  await mkdir(BRIDGE_DIR, { recursive: true });
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

async function saveOAuthState(state: string): Promise<void> {
  await mkdir(BRIDGE_DIR, { recursive: true });
  const tmpPath = `${OAUTH_STATE_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify({ state, createdAt: Date.now() }, null, 2), "utf-8");
  await rename(tmpPath, OAUTH_STATE_PATH);
}

async function loadOAuthState(): Promise<OAuthStateStore | null> {
  try {
    const raw = await readFile(OAUTH_STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.state !== "string" || typeof parsed.createdAt !== "number") return null;
    if (Date.now() - parsed.createdAt > OAUTH_STATE_TTL_MS) {
      await unlink(OAUTH_STATE_PATH).catch(() => undefined);
      return null;
    }
    return { state: parsed.state, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

async function clearOAuthState(): Promise<void> {
  await unlink(OAUTH_STATE_PATH).catch(() => undefined);
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
    const detail = data?.error_description || data?.detail || data?.error || `OAuth token exchange failed (${res.status})`;
    throw new Error(`Freesound OAuth: ${detail}`);
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
  if (!res.ok || !data?.access_token) {
    const detail = data?.error_description || data?.detail || data?.error || `OAuth refresh failed (${res.status})`;
    throw new Error(`Freesound OAuth refresh: ${detail}`);
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

function luaStringLiteral(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
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

function safeFilename(sound: IncomingSound): string {
  const raw = sound.originalFilename?.trim() || sound.name.trim() || `sound-${sound.freesoundId ?? sound.id}${extensionFromOriginal(sound.originalType, "")}`;
  return raw
    .replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || `sound-${sound.freesoundId ?? sound.id}.wav`;
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

async function loadDownloadRoot(): Promise<string | null> {
  try {
    const raw = await readFile(DOWNLOAD_ROOT_PATH, "utf-8");
    const parsed = JSON.parse(raw) as DownloadRootStore;
    if (!parsed?.path || typeof parsed.path !== "string") return null;
    await access(parsed.path);
    return parsed.path;
  } catch {
    return null;
  }
}

async function saveDownloadRoot(rootPath: string): Promise<void> {
  await mkdir(BRIDGE_DIR, { recursive: true });
  const tmpPath = `${DOWNLOAD_ROOT_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify({ path: rootPath, updatedAt: Date.now() }, null, 2), "utf-8");
  await rename(tmpPath, DOWNLOAD_ROOT_PATH);
}

async function chooseDownloadRootWindows(): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("La selección nativa de carpeta está implementada para Windows en esta versión del Bridge.");
  }
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$d.Description = 'Elegí la carpeta raíz donde AUDIAR guardará las escenas'",
    "$d.ShowNewFolderButton = $true",
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
  const selected = stdout.trim();
  if (!selected) throw new Error("No se seleccionó ninguna carpeta.");
  await access(selected);
  return selected;
}

async function getOrChooseDownloadRootPath(): Promise<string> {
  const saved = await loadDownloadRoot();
  if (saved) return saved;
  const selected = await chooseDownloadRootWindows();
  await saveDownloadRoot(selected);
  return selected;
}

async function nextGroupNumber(rootPath: string): Promise<number> {
  let max = 0;
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^GRUPO\s+(\d+)\b/i);
      if (match) max = Math.max(max, Number(match[1]));
    }
  } catch {
    return 1;
  }
  return max + 1;
}

async function createSceneGroup(sceneName = ""): Promise<{ rootPath: string; path: string; name: string; number: number }> {
  const rootPath = await getOrChooseDownloadRootPath();
  const number = await nextGroupNumber(rootPath);
  const baseName = `GRUPO ${String(number).padStart(2, "0")} - Escena ${String(number).padStart(2, "0")}`;
  const cleanSceneName = sanitizeSceneName(sceneName);
  const name = cleanSceneName ? `${baseName} - ${cleanSceneName}` : baseName;
  const groupPath = path.join(rootPath, name);
  await mkdir(groupPath, { recursive: true });
  return { rootPath, path: groupPath, name, number };
}

async function resolveUniquePath(directoryPath: string, sound: IncomingSound): Promise<{ path: string; filename: string }> {
  const initial = safeFilename(sound);
  const dot = initial.lastIndexOf(".");
  const stem = dot > 0 ? initial.slice(0, dot) : initial;
  const ext = dot > 0 ? initial.slice(dot) : "";
  let candidate = initial;
  let suffix = 2;
  while (existsSync(path.join(directoryPath, candidate))) {
    candidate = `${stem} (${suffix})${ext}`;
    suffix += 1;
  }
  return { path: path.join(directoryPath, candidate), filename: candidate };
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
    request.on("error", (error) => reject(new Error(`HTTPS ${new URL(url).hostname}: ${error.message}`)));
  });
}

async function downloadToPath(url: string, localPath: string, headers: Record<string, string> = {}): Promise<void> {
  const response = await requestStream(url, headers);
  const status = response.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    response.resume();
    throw new Error(`HTTP ${status}`);
  }
  const tmpPath = `${localPath}.part`;
  try {
    await new Promise<void>((resolve, reject) => {
      const output = (await import("node:fs")).createWriteStream(tmpPath);
      response.on("error", reject);
      output.on("error", reject);
      output.on("finish", resolve);
      response.pipe(output);
    });
    await rename(tmpPath, localPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

async function obtainAudioFile(sound: IncomingSound, directoryPath: string): Promise<{ path: string; filename: string; originalUsed: boolean }> {
  const target = await resolveUniquePath(directoryPath, sound);
  if (existsSync(target.path)) return { ...target, originalUsed: true };

  if (sound.source === "freesound" && sound.freesoundId != null) {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      const url = `${FREESOUND_API}/sounds/${sound.freesoundId}/download/`;
      try {
        await downloadToPath(url, target.path, { Authorization: `Bearer ${accessToken}` });
        return { ...target, originalUsed: true };
      } catch (error: any) {
        if (String(error?.message ?? "").startsWith("HTTP 401")) {
          const refreshed = await refreshAccessToken(await loadOAuthStore());
          if (refreshed.accessToken) {
            await downloadToPath(url, target.path, { Authorization: `Bearer ${refreshed.accessToken}` });
            return { ...target, originalUsed: true };
          }
        }
        console.warn(`[AUDIAR Bridge] No se pudo obtener original: ${sound.name} — ${error?.message ?? error}`);
      }
    }
  }

  await downloadToPath(sound.audioUrl, target.path);
  return { ...target, originalUsed: false };
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
  const fileName = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.lua`;
  await writeFile(path.join(JOBS_DIR, fileName), lua, "utf-8");
  return fileName;
}

async function ensureDirs() {
  await mkdir(JOBS_DIR, { recursive: true });
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function streamSavedFile(res: import("node:http").ServerResponse, localPath: string, filename: string, sound: IncomingSound) {
  const info = await stat(localPath);
  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": sound.originalType?.startsWith("audio/") ? sound.originalType : "application/octet-stream",
    "Content-Length": String(info.size),
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

  try {
    if (req.url === "/ping" && req.method === "GET") {
      json(res, 200, { ok: true, bridge: "audiar-reaper-bridge" });
      return;
    }

    if (req.url === "/storage/status" && req.method === "GET") {
      const rootPath = await loadDownloadRoot();
      json(res, 200, { configured: Boolean(rootPath), name: rootPath ? path.basename(rootPath) : null });
      return;
    }

    if (req.url === "/storage/choose" && req.method === "POST") {
      const rootPath = await chooseDownloadRootWindows();
      await saveDownloadRoot(rootPath);
      json(res, 200, { ok: true, configured: true, name: path.basename(rootPath) });
      return;
    }

    if (req.url === "/storage/group" && req.method === "POST") {
      const body = await readJsonBody(req);
      const group = await createSceneGroup(typeof body?.sceneName === "string" ? body.sceneName : "");
      json(res, 200, { ok: true, groupName: group.name });
      return;
    }

    if (req.url === "/download" && req.method === "POST") {
      const body = await readJsonBody(req);
      const sound = body?.sound as IncomingSound | undefined;
      const groupName = typeof body?.groupName === "string" ? body.groupName : "";
      if (!sound || typeof sound !== "object" || !groupName) {
        json(res, 400, { error: "Faltan el sonido o el grupo de escena." });
        return;
      }
      const rootPath = await getOrChooseDownloadRootPath();
      const groupPath = path.join(rootPath, groupName);
      await access(groupPath);
      const saved = await obtainAudioFile(sound, groupPath);
      await streamSavedFile(res, saved.path, saved.filename, sound);
      return;
    }

    if (req.url === "/send" && req.method === "POST") {
      const body = await readJsonBody(req);
      const sounds = Array.isArray(body?.sounds) ? body.sounds as IncomingSound[] : [];
      const sceneName = typeof body?.sceneName === "string" ? body.sceneName : "";
      if (!sounds.length) {
        json(res, 400, { error: "No se recibieron sonidos." });
        return;
      }
      await ensureDirs();
      const group = await createSceneGroup(sceneName);
      let queued = 0;
      for (const sound of sounds) {
        try {
          const saved = await obtainAudioFile(sound, group.path);
          await writeJobFile({
            path: saved.path,
            track: sound.element,
            name: sound.name,
            gainDb: sound.gainDb,
            pan: sound.pan,
          });
          queued += 1;
          console.log(`[AUDIAR Bridge] Listo para REAPER: ${sound.name}${saved.originalUsed ? " [ORIGINAL]" : " [preview]"}`);
        } catch (error: any) {
          console.error(`[AUDIAR Bridge] Error con ${sound.name}:`, error?.message ?? error);
        }
      }
      json(res, 200, { ok: true, queued, groupName: group.name });
      return;
    }

    if (req.url === "/oauth/status" && req.method === "GET") {
      const store = await loadOAuthStore();
      const connected = Boolean(store.accessToken && store.expiresAt && store.expiresAt > Date.now());
      json(res, 200, {
        configured: Boolean(store.clientId && store.clientSecret),
        connected,
        expiresAt: store.expiresAt,
      });
      return;
    }

    if (req.url === "/oauth/configure" && req.method === "POST") {
      const body = await readJsonBody(req);
      const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
      const clientSecret = typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
      if (!clientId) {
        json(res, 400, { error: "Se requiere el Client ID de Freesound." });
        return;
      }
      const current = await loadOAuthStore();
      const clientChanged = Boolean(current.clientId && current.clientId !== clientId);
      if (clientChanged && !clientSecret) {
        json(res, 400, { error: "Cambió el Client ID: también hace falta el Client Secret de esa credencial." });
        return;
      }
      if (!current.clientId && !clientSecret) {
        json(res, 400, { error: "En la primera conexión hacen falta Client ID y Client Secret de Freesound." });
        return;
      }
      const next: OAuthStore = {
        clientId,
        clientSecret: clientSecret || current.clientSecret,
      };
      if (!clientChanged) {
        next.accessToken = current.accessToken;
        next.refreshToken = current.refreshToken;
        next.expiresAt = current.expiresAt;
      }
      await saveOAuthStore(next);
      if (clientChanged) await clearOAuthState();
      json(res, 200, { ok: true, configured: true, credentialsChanged: clientChanged });
      return;
    }

    if (req.url === "/oauth/start" && req.method === "GET") {
      const store = await loadOAuthStore();
      if (!store.clientId || !store.clientSecret) {
        json(res, 400, { error: "Configurá primero el Client ID y Client Secret de Freesound." });
        return;
      }
      const state = randomBytes(24).toString("hex");
      await saveOAuthState(state);
      const url = new URL(`${FREESOUND_API}/oauth2/authorize/`);
      url.searchParams.set("client_id", store.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
      json(res, 200, { authorizationUrl: url.toString(), redirectUri: OAUTH_REDIRECT_URI });
      return;
    }

    if (req.url === "/oauth/callback" && req.method === "POST") {
      const body = await readJsonBody(req);
      const code = typeof body?.code === "string" ? body.code : "";
      const state = typeof body?.state === "string" ? body.state : "";
      const expected = await loadOAuthState();
      if (!code || !state || !expected || state !== expected.state) {
        await clearOAuthState();
        json(res, 400, { error: "Estado OAuth inválido o autorización incompleta. Iniciá nuevamente la conexión con Freesound." });
        return;
      }
      await clearOAuthState();
      const store = await exchangeCode(code);
      json(res, 200, { ok: true, expiresAt: store.expiresAt });
      return;
    }

    if (req.url === "/oauth/disconnect" && req.method === "POST") {
      await clearOAuthTokens();
      const current = await loadOAuthStore();
      json(res, 200, { ok: true, configured: Boolean(current.clientId && current.clientSecret) });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err: any) {
    console.error("[AUDIAR Bridge] Error:", err?.message ?? err);
    if (!res.headersSent) json(res, 500, { error: err?.message ?? "Error interno del Bridge." });
    else res.destroy(err);
  }
});

ensureDirs()
  .then(() => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`[AUDIAR Bridge] escuchando en http://localhost:${PORT}`);
      console.log(`[AUDIAR Bridge] El audio persistente se guarda en la carpeta elegida por el usuario.`);
    });
  })
  .catch((err) => {
    console.error("[AUDIAR Bridge] No se pudo iniciar:", err);
    process.exitCode = 1;
  });
