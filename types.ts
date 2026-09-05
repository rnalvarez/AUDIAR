export type SoundtrackElement = "ambientes" | "efectos" | "foley" | "dialogos";

export const ELEMENTS: { id: SoundtrackElement; label: string; hint: string }[] = [
  { id: "ambientes", label: "Ambientes", hint: "fondo continuo" },
  { id: "efectos", label: "Efectos", hint: "sonidos puntuales" },
  { id: "foley", label: "Foley", hint: "sincronizado a imagen" },
  { id: "dialogos", label: "Diálogos", hint: "voces" },
];

export interface Layer {
  id: string;
  name: string;
  license: string;
  commerciallySafe: boolean;
  durationSeconds: number;
  audioUrl: string;
  freesoundUrl?: string;
  tags?: string[];
  // Editor state (channel strip) — client-side only for now.
  gainDb: number;
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
}

// Mirrors worker/provider-vision.ts's SceneAnalysis exactly (same
// duplication pattern as the rest of this file vs worker/types.ts).
export type Certainty = "observed" | "probable" | "possible";

export interface SoundCue {
  text: string;
  certainty: Certainty;
}

export interface SceneAnalysis {
  sceneDescription: string;
  place: SoundCue;
  indoorOutdoor: SoundCue;
  timeOfDay: SoundCue;
  weather: SoundCue;
  materialsAndSurfaces: SoundCue[];
  humanPresence: SoundCue;
  potentialSoundSources: SoundCue[];
  observedActions: SoundCue[];
  offScreenSources: SoundCue[];
  ambience: SoundCue[];
  effects: SoundCue[];
  foley: SoundCue[];
  dialogue: SoundCue[];
  narrativeIdeas: SoundCue[];
}

// Mirrors worker/provider-sound-design.ts's shapes exactly.
export type ProposalCategory = "ambientes" | "efectos" | "foley" | "dialogos";

export interface SoundProposal {
  id: string;
  category: ProposalCategory;
  description: string;
  rationale: string;
  certainty: Certainty;
}

export interface SoundDesignProposal {
  ambientes: SoundProposal[];
  efectos: SoundProposal[];
  foley: SoundProposal[];
  dialogos: SoundProposal[];
}
