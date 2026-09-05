const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
function isGitHubPagesHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname.endsWith("github.io");
}
function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (configuredBaseUrl) return `${configuredBaseUrl}${normalizedPath}`;
  if (isGitHubPagesHost()) throw new Error("AUDIAR está en GitHub Pages pero no tiene configurado VITE_API_BASE_URL.");
  return normalizedPath;
}
export function apiFetch(path: string, init?: RequestInit): Promise<Response> { return fetch(resolveApiUrl(path), init); }
