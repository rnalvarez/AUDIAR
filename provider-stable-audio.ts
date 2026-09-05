import type { SoundtrackElement } from "./types.ts";
export interface StableAudioParams { prompt:string; element:SoundtrackElement; durationSeconds:number; }
export interface StableAudioResult { element:SoundtrackElement; prompt:string; audioUrl:string; durationSeconds:number; }
export async function generateStableAudio(_params:StableAudioParams):Promise<StableAudioResult>{ throw new Error("Stable Audio todavía no está conectado."); }
