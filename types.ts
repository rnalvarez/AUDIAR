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
  // true una vez que este resultado puntual se agregó como Layer — no
  // implica que la SoundIdea "esté resuelta": pueden agregarse varias
  // alternativas de la misma idea.
  added?: boolean;
}

/**
 * La intención de diseño sonoro ANTES de elegir un sonido concreto — no se
 * convierte en Layer por sí sola. Solo un resultado de búsqueda puntual,
 * agregado explícitamente ("Agregar a diseño"), se vuelve Layer.
 */
export interface SoundIdea {
  id: string;
  category: ProposalCategory;
  description: string; // en español — lo que ve y edita el usuario
  rationale: string;
  certainty: Certainty;
  priority: Priority;
  spatialPerspective?: string;
  searchQuery: string; // en inglés — editable, usado por "Buscar sonidos"
  // Estado de búsqueda — client-side only, por idea.
  searching?: boolean;
  searchError?: string;
  searchResults?: FreesoundResultItem[];
  // Colapsado por defecto para que la tarjeta no se vea como un formulario;
  // "editar" lo pone en true.
  expanded?: boolean;
}

export interface SoundDesignProposal {
  ambientes: SoundIdea[];
  efectos: SoundIdea[];
  foley: SoundIdea[];
  dialogos: SoundIdea[];
}
