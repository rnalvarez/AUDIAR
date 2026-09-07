import { useEffect, useRef, useState } from "react";
import type { Layer, ProposalCategory, SceneAnalysis } from "./types";
import type { ApiKeys } from "./api-keys";
import { analyzeFrameSceneDirect } from "./direct-vision-v2";
import { searchFreesoundDiverse } from "./scene-freesound";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_AUTO_LAYERS = 3;
const AUTO_CATEGORIES = ["ambientes", "efectos", "foley"] as const;
type AutoCategory = (typeof AUTO_CATEGORIES)[number];
type FreesoundItem = Awaited<ReturnType<typeof searchFreesoundDiverse>>[number];

interface Props {
  apiKeys: ApiKeys;
  onDesignGenerated: (layers: Partial<Record<ProposalCategory, Layer[]>>) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function resultToLayer(category: ProposalCategory, searchQuery: string, result: FreesoundItem): Layer {
  return {
    id: `freesound-${category}-${result.id}-${crypto.randomUUID()}`,
    name: result.name,
    license: result.license,
    commerciallySafe: result.commerciallySafe,
    durationSeconds: result.durationSeconds,
    audioUrl: result.previewUrl,
    freesoundUrl: result.freesoundUrl,
    freesoundId: result.id,
    originalFilename: result.originalFilename,
    originalType: result.originalType,
    sampleRate: result.sampleRate,
    bitDepth: result.bitDepth,
    fileSize: result.fileSize,
    tags: result.tags,
    searchQuery,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
  };
}

function uniqueCues(cues: SceneAnalysis["ambience"]): { text: string; searchQuery: string }[] {
  const seen = new Set<string>();
  const result: { text: string; searchQuery: string }[] = [];
  for (const cue of cues) {
    const searchQuery = cue.searchQuery?.trim();
    const text = cue.text.trim();
    const value = searchQuery || text;
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ text, searchQuery: value });
  }
  return result.slice(0, MAX_AUTO_LAYERS);
}

function fallbackQueries(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  const unique = [...new Set(words)];
  const variants = [query.trim()];
  if (unique.length >= 4) variants.push(unique.slice(0, 4).join(" "));
  if (unique.length >= 3) variants.push(unique.slice(0, 3).join(" "));
  if (unique.length >= 2) variants.push(unique.slice(0, 2).join(" "));
  if (unique.length >= 1) variants.push(unique[0]);
  return [...new Set(variants)].filter(Boolean);
}

export function FramePanel({ apiKeys, onDesignGenerated }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generationPageRef = useRef(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`La imagen pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB — el máximo es 20MB. Probá con una versión más liviana.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploadError(null);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setImageFile(file);
    setFileName(file.name);
    setAnalysisError(null);
  }

  function handleRemove() {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
    setFileName(null);
    setUploadError(null);
    setAnalysisError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function findFirstFreesoundResult(
    query: string,
    apiKey: string,
    page: number,
    excludeIds: Set<number>,
  ): Promise<{ query: string; result: FreesoundItem } | null> {
    let lastError: unknown = null;
    for (const variant of fallbackQueries(query)) {
      try {
        const results = await searchFreesoundDiverse(variant, apiKey, page, 8, excludeIds);
        if (results[0]) return { query: variant, result: results[0] };
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  async function buildAutomaticDesign(dataUrl: string) {
    const analysis = await analyzeFrameSceneDirect(dataUrl, apiKeys.groq!);
    const generated: Partial<Record<ProposalCategory, Layer[]>> = {};
    const cuesByCategory: Record<AutoCategory, SceneAnalysis["ambience"]> = {
      ambientes: analysis.ambience,
      efectos: analysis.effects,
      foley: analysis.foley,
    };

    generationPageRef.current += 1;
    const page = generationPageRef.current;

    for (const category of AUTO_CATEGORIES) {
      const cues = uniqueCues(cuesByCategory[category]);
      const layers: Layer[] = [];
      const usedIds = new Set<number>();
      for (const cue of cues) {
        try {
          const found = await findFirstFreesoundResult(cue.searchQuery, apiKeys.freesound!, page, usedIds);
          if (found && !usedIds.has(found.result.id)) {
            usedIds.add(found.result.id);
            layers.push(resultToLayer(category, found.query, found.result));
          }
        } catch {
          // Una búsqueda fallida no bloquea las demás capas.
        }
      }
      generated[category] = layers;
    }

    onDesignGenerated(generated);
  }

  async function handleAnalyze() {
    if (!imageFile) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      if (!apiKeys.groq?.trim()) throw new Error("Configurá la API key de Groq antes de analizar.");
      if (!apiKeys.freesound?.trim()) throw new Error("Configurá la API key de Freesound antes de componer el diseño.");
      const dataUrl = await fileToDataUrl(imageFile);
      await buildAutomaticDesign(dataUrl);
    } catch (e: any) {
      setAnalysisError(e.message ?? "no se pudo componer el diseño sonoro");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="frame-panel">
      <h2 className="section-title">Fotograma</h2>
      <p className="section-subtitle">cargá un fotograma y AUDIAR construye una primera propuesta sonora</p>

      {imageUrl ? (
        <img className="frame-panel__preview" src={imageUrl} alt="Fotograma de referencia de la escena" />
      ) : (
        <button className="frame-panel__dropzone" onClick={() => inputRef.current?.click()}>
          cargar fotograma de la escena
        </button>
      )}
      {uploadError && <p className="frame-panel__analysis-error">{uploadError}</p>}

      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} hidden onChange={(e) => handleFile(e.target.files?.[0])} />

      {fileName && (
        <div className="frame-panel__filename">
          <span className="frame-panel__filename-text">{fileName}</span>
          <div className="frame-panel__actions">
            <button className="frame-panel__replace" onClick={() => inputRef.current?.click()}>cambiar</button>
            <button className="frame-panel__remove" onClick={handleRemove}>eliminar</button>
          </div>
        </div>
      )}

      {imageUrl && (
        <div className="frame-panel__analysis-zone">
          <button className="frame-panel__analyze-btn" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "Analizando y componiendo..." : "Analizar y componer"}
          </button>
          {analysisError && <p className="frame-panel__analysis-error">{analysisError}</p>}
        </div>
      )}
    </div>
  );
}
