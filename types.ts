export type SoundtrackElement = "ambientes" | "efectos" | "foley" | "dialogos";
export type LayerSource = "freesound" | "soundly" | "stable-audio" | "groq-tts";
export const ELEMENTS: { id: SoundtrackElement; label: string; hint: string }[] = [
  { id: "ambientes", label: "Ambientes", hint: "fondo continuo" },
  { id: "efectos", label: "Efectos", hint: "sonidos puntuales" },
  { id: "foley", label: "Foley", hint: "acciones y superficies" },
  { id: "dialogos", label: "Diálogos", hint: "voces" },
];
export type { Certainty, SoundCue, SceneAnalysis } from "./provider-vision.ts";
export type { ProposalCategory, SoundProposal, SoundDesignProposal } from "./provider-sound-design.ts";
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
  ALLOWED_ORIGIN?: string;
}
