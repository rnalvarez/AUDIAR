// Freesound.org search provider.
//
// Freesound's own API terms are free for NON-commercial use only; commercial
// use of the API itself requires contacting MTG-UPF for a separate license
// (see https://freesound.org/help/tos_api/). On top of that, every sound in
// the database carries its own Creative Commons license, and only CC0 and
// plain CC-BY sounds are safe to use commercially without extra permission.
//
// This module does NOT try to be clever about the server-side `filter`
// syntax (Freesound's Solr-style filter strings for license names aren't
// documented precisely enough to trust blindly). Instead it sends a
// best-effort filter as an optimization, then ALWAYS re-checks the license
// of every result client-side before calling anything "commercial safe".
// That second check is the one this module's correctness actually depends
// on — treat isCommerciallySafe() as the source of truth, not the filter.

const SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";

export interface FreesoundLayer {
  id: number;
  name: string;
  tags: string[];
  durationSeconds: number;
  license: string;
  commerciallySafe: boolean;
  // HQ MP3 preview — available via API-key auth alone. Full-quality WAV
  // download needs OAuth2 (a logged-in Freesound user), not just an API
  // key — that's a follow-up, not implemented here yet.
  previewUrl: string;
  freesoundUrl: string;
}

export interface FreesoundSearchParams {
  query: string;
  apiKey: string;
  /** Soundtrack element this layer is meant for — carried through for the UI, not sent to Freesound. */
  element: "ambientes" | "efectos" | "foley" | "dialogos";
  maxResults?: number;
  /** If true (default), only commercially-safe results are returned at all. */
  commercialOnly?: boolean;
}

export interface FreesoundSearchResult {
  element: FreesoundSearchParams["element"];
  query: string;
  results: FreesoundLayer[];
}

/**
 * True only for CC0 ("public domain") and plain CC-BY ("Attribution")
 * licenses — the two Creative Commons licenses that unambiguously allow
 * commercial use with no extra permission. Everything else (Attribution-
 * NonCommercial, Attribution-ShareAlike, Sampling+, ...) returns false.
 *
 * Deliberately substring-based but slash-anchored, so "licenses/by-nc/..."
 * does not accidentally match the "licenses/by/" check meant for plain CC-BY.
 */
export function isCommerciallySafe(licenseUrlOrName: string): boolean {
  const l = licenseUrlOrName.toLowerCase();
  if (l.includes("publicdomain/zero")) return true; // CC0
  if (l.includes("licenses/by/")) return true; // CC-BY, exact — not by-nc, by-sa, by-nd
  if (l === "attribution") return true; // some API responses use bare names instead of URLs
  if (l === "creative commons 0" || l === "cc0") return true;
  return false;
}

function normalizeResult(raw: any, element: FreesoundSearchParams["element"]): FreesoundLayer {
  const license = String(raw.license ?? "");
  return {
    id: raw.id,
    name: raw.name,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    durationSeconds: typeof raw.duration === "number" ? raw.duration : 0,
    license,
    commerciallySafe: isCommerciallySafe(license),
    previewUrl: raw.previews?.["preview-hq-mp3"] ?? raw.previews?.["preview-lq-mp3"] ?? "",
    freesoundUrl: `https://freesound.org/s/${raw.id}/`,
  };
}

export async function searchFreesound(params: FreesoundSearchParams): Promise<FreesoundSearchResult> {
  const { query, apiKey, element, maxResults = 12, commercialOnly = true } = params;

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("fields", "id,name,tags,duration,license,previews");
  url.searchParams.set("page_size", String(Math.min(maxResults * 2, 50))); // over-fetch; we filter after
  // Best-effort server-side narrowing. Harmless if Freesound ignores or
  // errors on the exact syntax — isCommerciallySafe() is what actually gates the response.
  if (commercialOnly) {
    url.searchParams.set("filter", 'license:("Creative Commons 0" OR "Attribution")');
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Freesound search failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const rawResults: any[] = Array.isArray(data.results) ? data.results : [];

  let results = rawResults.map((r) => normalizeResult(r, element));
  if (commercialOnly) {
    results = results.filter((r) => r.commerciallySafe);
  }
  results = results.slice(0, maxResults);

  return { element, query, results };
}
