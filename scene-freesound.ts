import type { FreesoundResultItem } from "./types";

const FREESOUND_SEARCH_ENDPOINT = "https://freesound.org/apiv2/search/text/";

function isCommerciallySafe(license: string): boolean {
  const value = license.toLowerCase();
  return value.includes("publicdomain/zero") || value.includes("licenses/by/") || value === "attribution" || value === "creative commons 0" || value === "cc0";
}

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "background", "close", "distant", "far", "field", "for", "from",
  "in", "inside", "interior", "near", "of", "on", "outdoor", "outside", "room", "sound", "the",
  "to", "very", "wide", "with",
]);

function queryTokens(query: string): string[] {
  return [...new Set(
    query.toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  )];
}

function score(result: FreesoundResultItem, query: string): number {
  const haystack = `${result.name} ${(result.tags ?? []).join(" ")}`.toLowerCase();
  let value = 0;
  for (const token of queryTokens(query)) {
    if (haystack.includes(token)) value += token.length >= 6 ? 3 : 2;
  }
  return value;
}

export async function searchFreesoundDiverse(
  query: string,
  apiKey: string,
  page: number,
  maxResults = 6,
  excludeIds: Set<number> = new Set(),
): Promise<FreesoundResultItem[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const url = new URL(FREESOUND_SEARCH_ENDPOINT);
  url.searchParams.set("query", trimmedQuery);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("fields", "id,name,tags,duration,license,previews");
  url.searchParams.set("page_size", String(Math.min(Math.max(maxResults * 4, 12), 50)));
  url.searchParams.set("page", String(Math.max(1, page)));
  url.searchParams.set("filter", 'license:("Creative Commons 0" OR "Attribution")');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Freesound search failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const raw: any[] = Array.isArray(data.results) ? data.results : [];
  return raw
    .map((item): FreesoundResultItem => {
      const license = String(item.license ?? "");
      return {
        id: Number(item.id),
        name: String(item.name ?? "Untitled"),
        license,
        commerciallySafe: isCommerciallySafe(license),
        durationSeconds: typeof item.duration === "number" ? item.duration : 0,
        previewUrl: item.previews?.["preview-hq-mp3"] ?? item.previews?.["preview-lq-mp3"] ?? "",
        freesoundUrl: `https://freesound.org/s/${item.id}/`,
        tags: Array.isArray(item.tags) ? item.tags.map((tag: unknown) => String(tag)) : [],
      };
    })
    .filter((item) => item.commerciallySafe && Boolean(item.previewUrl) && !excludeIds.has(item.id))
    .sort((a, b) => score(b, trimmedQuery) - score(a, trimmedQuery))
    .slice(0, maxResults);
}
