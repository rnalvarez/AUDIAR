export type SoundtrackElement = "ambientes" | "efectos" | "foley" | "dialogos";

export type LayerSource = "freesound" | "soundly" | "stable-audio" | "groq-tts";

/**
 * One generated/retrieved sound, already normalized to a common shape
 * regardless of which provider produced it. This is what the editor
 * (channel strip: vol/pan/mute/solo/reverb, timeline position) attaches to.
 */
export interface Layer {
  id: string;
  element: SoundtrackElement;
  source: LayerSource;
  name: string;
  /** Playable URL — a Freesound preview, or a generated-audio URL/blob. */
  audioUrl: string;
  durationSeconds: number;
  license?: string;
  commerciallySafe?: boolean;
  attribution?: string;
  // Editor state — set by the frontend, not the providers.
  startTime?: number;
  gainDb?: number;
  pan?: number; // -1 (L) .. 1 (R)
  muted?: boolean;
  solo?: boolean;
  loop?: boolean;
}

export interface Env {
  FREESOUND_API_KEY: string;
  STABILITY_API_KEY?: string; // for Stable Audio, once wired up
  GROQ_API_KEY?: string; // for Orpheus TTS (Diálogos), once wired up
}
