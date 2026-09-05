import { useRef, useState } from "react";
import type { SceneAnalysis } from "./types";
import { SceneAnalysisView } from "./component-SceneAnalysis";
import { apiFetch } from "./api";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("no se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

interface Props {
  analysis: SceneAnalysis | null;
  onAnalysisChange: (analysis: SceneAnalysis | null) => void;
}

export function FramePanel({ analysis, onAnalysisChange }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;

    if (!ACCEPTED_TYPES.split(",").includes(file.type)) {
      setAnalysisError("Formato no compatible. Usá JPG, PNG o WebP.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setAnalysisError("La imagen supera los 12 MB. Elegí un fotograma más liviano.");
      return;
    }

    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setImageFile(file);
    setFileName(file.name);
    onAnalysisChange(null);
    setAnalysisError(null);
  }

  function handleRemove() {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
    setFileName(null);
    onAnalysisChange(null);
    setAnalysisError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleAnalyze() {
    if (!imageFile) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const dataUrl = await fileToDataUrl(imageFile);
      const res = await apiFetch("/api/analyze/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
      onAnalysisChange(data as SceneAnalysis);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "no se pudo analizar la imagen");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="frame-panel">
      {imageUrl ? (
        <img className="frame-panel__preview" src={imageUrl} alt="Fotograma de referencia de la escena" />
      ) : (
        <button className="frame-panel__dropzone" onClick={() => inputRef.current?.click()}>
          cargar fotograma de la escena
        </button>
      )}

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
            {analyzing ? "analizando..." : analysis ? "volver a analizar" : "analizar escena con IA"}
          </button>
          {analysisError && <p className="frame-panel__analysis-error">{analysisError}</p>}
        </div>
      )}

      {analysis && <SceneAnalysisView analysis={analysis} />}
    </div>
  );
}
