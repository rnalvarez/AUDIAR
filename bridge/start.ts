// Arranca los dos servicios locales del AUDIAR Bridge.
// index.ts: comunicación con REAPER y cola de importación.
// download-server.ts: descargas directas a la carpeta elegida en AUDIAR.
//
// El OAuth de Freesound pasa por Node. En algunas instalaciones de Windows,
// el fetch() nativo (Undici) puede fallar a nivel de red/TLS y devolver solo
// "fetch failed". Interceptamos exclusivamente el endpoint OAuth de Freesound
// con https.request, dejando el resto de fetch() intacto.

import { request } from "node:https";

type FetchLike = typeof globalThis.fetch;

const originalFetch: FetchLike = globalThis.fetch.bind(globalThis);
const FREESOUND_TOKEN_URL = "https://freesound.org/apiv2/oauth2/access_token/";

function fetchFreesoundToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(String(input));
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = new Headers(init?.headers);
      headers.set("User-Agent", "AUDIAR-Freesound-OAuth/1.0");
      headers.set("Accept", "application/json");
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      headers.set("Content-Length", String(Buffer.byteLength(body, "utf8")));

      const req = request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: init?.method ?? "POST",
          headers: Object.fromEntries(headers.entries()),
          timeout: 20000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const payload = Buffer.concat(chunks).toString("utf8");
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
              else if (value != null) responseHeaders.set(key, value);
            }
            resolve(new Response(payload, {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              headers: responseHeaders,
            }));
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error("Tiempo de espera agotado conectando con freesound.org."));
      });
      req.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        reject(new Error(`No se pudo conectar con freesound.org${code ? ` (${code})` : ""}: ${error.message}`));
      });

      if (body) req.write(body);
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = new URL(String(input));
    if (url.toString() === FREESOUND_TOKEN_URL && (init?.method ?? "GET").toUpperCase() === "POST") {
      return fetchFreesoundToken(input, init);
    }
  } catch {
    // Para cualquier URL no válida, dejamos que el fetch original produzca su error normal.
  }
  return originalFetch(input, init);
}) as FetchLike;

await import("./index.ts");
await import("./download-server.ts");
