import type { SoundtrackElement } from "./types.ts";
export interface GroqTTSParams { text:string; element:Extract<SoundtrackElement,"dialogos">; voice?:string; }
export interface GroqTTSResult { element:SoundtrackElement; text:string; audioUrl:string; durationSeconds:number; }
export async function generateGroqTTS(_params:GroqTTSParams):Promise<GroqTTSResult>{ throw new Error("Groq/Orpheus TTS todavía no está conectado."); }
