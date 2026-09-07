import { useEffect, useRef, useState } from "react";
import type { Layer, ProposalCategory } from "./types";
import type { ApiKeys } from "./api-keys";
import {
  analyzeFrameDirect,
  generateSoundDesignProposalDirect,
  searchFreesoundDirect,
} from "./direct-providers";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_AUTO_LAYERS = 3;
const AUTO_CATEGORIES: ProposalCategory[] = ["ambientes", "efectos", "foley"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface Props {
  apiKeys: ApiKeys;
  onDesignGenerated: (layers: Partial<Record<ProposalCategory, Layer[]>>) => void;
}

type FreesoundItem = Awaited<ReturnType<typeof searchFreesoundDirect>>[number];

function resultToLayer(category: ProposalCategory, idea: { searchQuery: string }, result: FreesoundItem): Layer {
  return {
    id: `freesound-${category}-${result.id}-${crypto.randomUUID()}`,
    name: result.name,
    license: result.license,
    commerciallySafe: result.commerciallySafe,
    durationSeconds: result.durationSeconds,
    audioUrl: result.previewUrl,
    freesoundUrl: result.freesoundUrl,
    tags: result.tags,
    searchQuery: idea.searchQuery,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
  };
}

export function FramePanel({ apiKeys, onDesignGenerated }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function buildAutomaticDesign(dataUrl: string) {
    const analysis = await analyzeFrameDirect(dataUrl, apiKeys.groq!);
    const proposal = await generateSoundDesignProposalDirect(analysis, apiKeys.groq!);

    const generated: Partial<Record<ProposalCategory, Layer[]>> = {};

    for (const category of AUTO_CATEGORIES) {
      const ideas = proposal[category]
        .filter((idea) => idea.searchQuery.trim())
        .slice(0, MAX_AUTO_LAYERS);

      const searched = await Promise.all(
        ideas.map(async (idea) => {
          try {
            const results = await searchFreesoundDirect(idea.searchQuery, apiKeys.freesound!, 5);
            const first = results[0];
            return first ? resultToLayer(category, idea, first) : null;
          } catch {
            return null;
          }
        })
      );

      generated[category] = searched.filter((layer): layer is Layer => Boolean(layer));
    }

    onDesignGenerated(generated);
  }

  async function handleAnalyze() {
    if (!imageFile) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      if (!apiKeys.groq?.trim()) {
        throw new Error("Configurá la API key de Groq antes de analizar.");
      }
      if (!apiKeys.freesound?.trim()) {
        throw new Error("Configurá la API key de Freesound antes de componer el diseño.");
      }
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

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {fileName && (
        <div className="frame-panel__filename">
          <span className="frame-panel__filename-text">{fileName}</span>
          <div className="frame-panel__actions">
            <button className="frame-panel__replace" onClick={() => inputRef.current?.click()}>
              cambiar
            </button>
            <button className="frame-panel__remove" onClick={handleRemove}>
              eliminar
            </button>
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
