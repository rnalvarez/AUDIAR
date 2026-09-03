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
