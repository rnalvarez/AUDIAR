// TODO — not implemented yet, but the simplest of the three providers to
// finish: Groq is a normal hosted API (same pattern as CHIONIA/SonIA),
// just needs GROQ_API_KEY and a call to an Orpheus TTS model for the
// Diálogos element. Voice selection / direction (tone, pacing) should be
// exposed as params once there's a concrete script line to test with.

import type { SoundtrackElement } from "./types.ts";

export interface GroqTTSParams {
  text: string;
  element: Extract<SoundtrackElement, "dialogos">;
  voice?: string;
}

export interface GroqTTSResult {
  element: SoundtrackElement;
  text: string;
  audioUrl: string;
  durationSeconds: number;
}

export async function generateGroqTTS(_params: GroqTTSParams): Promise<GroqTTSResult> {
  throw new Error("Groq Orpheus TTS provider not wired up yet — needs GROQ_API_KEY and a model call in generateGroqTTS().");
}
