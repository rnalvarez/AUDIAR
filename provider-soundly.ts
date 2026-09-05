// TODO — not implemented, and unlike the other three providers this one
// is blocked on a real open question, not just "pick a hosting option."
//
// Public research (KVR, Soundly's own site, Freesound's own blog confirming
// the integration) only turns up Soundly as a macOS/Windows DESKTOP app,
// with drag-and-drop into DAWs (Pro Tools, Reaper, Premiere, ...) and
// automation integrations (SoundFlow, Stream Deck). Nothing indicates a
// public REST API for a third-party web app to query — which is a real gap
// versus Freesound, ElevenLabs, and Stability, all of which publish one.
//
// It's very possible there's a partner/private API not indexed publicly —
// worth checking Soundly's account settings or asking their support
// directly, given there's already a paid account to ask from. Once there's
// a real endpoint + auth scheme, this should mirror provider-freesound.ts:
// search, then normalize results into the same Layer shape, and apply the
// same commercial-license check before anything reaches the UI (Soundly's
// own library and its Freesound results carry their own licenses — a
// Soundly account being paid doesn't by itself make redistribution of every
// result commercially clear, so don't skip that check when this gets filled in).

import type { SoundtrackElement } from "./types.ts";

export interface SoundlySearchParams {
  query: string;
  element: SoundtrackElement;
}

export interface SoundlyLayer {
  id: string;
  name: string;
  license: string;
  commerciallySafe: boolean;
  durationSeconds: number;
  audioUrl: string;
}

export interface SoundlySearchResult {
  element: SoundtrackElement;
  query: string;
  results: SoundlyLayer[];
}

// Same wrapped {element, query, results} shape as provider-freesound.ts's
// FreesoundSearchResult on purpose — the frontend treats both search
// sources identically once this is filled in.
export async function searchSoundly(_params: SoundlySearchParams): Promise<SoundlySearchResult> {
  throw new Error(
    "Soundly provider not implemented — no public API found in research. Confirm with Soundly (account settings or support) whether a partner API exists, then fill in searchSoundly()."
  );
}
