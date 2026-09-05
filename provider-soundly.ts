import type { SoundtrackElement } from "./types.ts";
export interface SoundlySearchParams { query:string; element:SoundtrackElement; }
export interface SoundlyLayer { id:string; name:string; license:string; commerciallySafe:boolean; durationSeconds:number; audioUrl:string; }
export interface SoundlySearchResult { element:SoundtrackElement; query:string; results:SoundlyLayer[]; }
export async function searchSoundly(_params:SoundlySearchParams):Promise<SoundlySearchResult>{ throw new Error("Soundly todavía no está conectado: no hay una API pública configurada en este proyecto."); }
