export type SoundtrackElement = "ambientes" | "efectos" | "foley";

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
  freesoundId?: number;
  originalFilename?: string;
  originalType?: string;
  sampleRate?: number;
  bitDepth?: number;
  fileSize?: number;
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
  searchQuery?: string;
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

export interface FreesoundResultItem {
  id: number;
  name: string;
  license: string;
  commerciallySafe: boolean;
  durationSeconds: number;
  previewUrl: string;
  freesoundUrl?: string;
  originalFilename?: string;
  originalType?: string;
  sampleRate?: number;
  bitDepth?: number;
  fileSize?: number;
  tags?: string[];
  added?: boolean;
}
