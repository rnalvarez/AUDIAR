export type SoundtrackElement = "ambientes" | "efectos" | "foley" | "dialogos";

export type LayerSource = "freesound" | "soundly" | "stable-audio" | "groq-tts";

/** Tipos usados por el análisis visual multimodal. */
export type { Certainty, SoundCue, SceneAnalysis } from "./provider-vision.ts";

/** Tipos usados por la propuesta de diseño sonoro. */
export type { ProposalCategory, SoundProposal, SoundDesignProposal } from "./provider-sound-design.ts";

/**
 * Un sonido concreto seleccionado desde un provider.
 * La dimensión temporal queda preparada, pero no es necesaria todavía para
 * esta versión basada en fotogramas.
 */
export interface Layer {
  id: string;
  element: SoundtrackElement;
  source: LayerSource;
  name: string;
  audioUrl: string;
  durationSeconds: number;
  license?: string;
  commerciallySafe?: boolean;
  attribution?: string;
  startTime?: number;
  gainDb?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  loop?: boolean;
  freesoundUrl?: string;
  tags?: string[];
}

export interface Env {
  FREESOUND_API_KEY: string;
  STABILITY_API_KEY?: string;
  GROQ_API_KEY?: string;
}
