export type SoundtrackElement = "ambientes" | "efectos" | "foley" | "dialogos";

// La interfaz pública de AUDIAR trabaja con tres familias sonoras.
// "dialogos" se mantiene en los tipos internos para compatibilidad con
// el motor de propuestas anterior, pero no se muestra ni se genera como capa.
export const ELEMENTS: { id: SoundtrackElement; label: string; hint: string }[] = [
  { id: "ambientes", label: "Ambientes", hint: "hasta 3 capas" },
  { id: "efectos", label: "SFX", hint: "hasta 3 capas" },
  { id: "foley", label: "Foley", hint: "hasta 3 capas" },
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
  searchQuery?: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

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

export type ProposalCategory = SoundtrackElement;
export type Priority = "primary" | "secondary" | "accent";

export interface FreesoundResultItem {
  id: number;
  name: string;
  license: string;
  commerciallySafe: boolean;
  durationSeconds: number;
  previewUrl: string;
  freesoundUrl?: string;
  tags?: string[];
  added?: boolean;
}

export interface SoundIdea {
  id: string;
  category: ProposalCategory;
  description: string;
  rationale: string;
  certainty: Certainty;
  priority: Priority;
  spatialPerspective?: string;
  searchQuery: string;
  searching?: boolean;
  searchError?: string;
  searchResults?: FreesoundResultItem[];
  expanded?: boolean;
}

export interface SoundDesignProposal {
  ambientes: SoundIdea[];
  efectos: SoundIdea[];
  foley: SoundIdea[];
  dialogos: SoundIdea[];
}
