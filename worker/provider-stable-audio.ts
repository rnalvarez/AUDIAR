// TODO — not implemented yet.
//
// Stable Audio Open is open-weights, not a hosted commercial API: there's no
// single official endpoint to call the way there is for Freesound. Free
// commercial use applies (<US$1M annual revenue — registration at
// stability.ai), but running it means picking one of:
//
//   1. A hosted-inference provider (Hugging Face Inference Endpoints,
//      Replicate, fal.ai, ...) — pay-per-second/generation, zero infra to
//      manage. Fastest to wire up.
//   2. Self-hosting the weights on your own GPU box — no per-generation
//      cost, but you run and pay for the server.
//
// Whichever we pick, this function's shape should stay the same: given a
// prompt + target duration, return a playable audio URL. Swap the fetch
// call inside for the chosen provider once that decision is made.

import type { SoundtrackElement } from "./types.ts";

export interface StableAudioParams {
  prompt: string;
  element: SoundtrackElement;
  durationSeconds: number;
}

export interface StableAudioResult {
  element: SoundtrackElement;
  prompt: string;
  audioUrl: string;
  durationSeconds: number;
}

export async function generateStableAudio(_params: StableAudioParams): Promise<StableAudioResult> {
  throw new Error(
    "Stable Audio Open provider not wired up yet — pick a hosting route (Hugging Face Inference, Replicate, or self-hosted) and fill in generateStableAudio()."
  );
}
