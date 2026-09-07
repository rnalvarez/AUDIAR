import { useEffect, useRef, useState } from "react";
import type { SceneAnalysis } from "./types";
import type { ApiKeys } from "./api-keys";
import { analyzeFrameDirect } from "./direct-providers";
import { SceneAnalysisView } from "./component-SceneAnalysis";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
// Límite local de imagen que se envía a Groq.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface Props {
  analysis: SceneAnalysis | null;
  onAnalysisChange: (analysis: SceneAnalysis | null) => void;
  apiKeys: ApiKeys;
}

/**
 * Fotograma de referencia de la escena — reemplaza a VideoPanel por ahora.
 * Mismo patrón de Object URL en cliente para la preview; el análisis usa
 * una conversión aparte a data URL (base64) solo al analizar, que es lo
 * que espera Groq — no se sube nada a ningún servidor hasta que
 * el usuario aprieta "analizar".
 *
 * El resultado del análisis vive en App (via analysis/onAnalysisChange)
 * porque la etapa 2 (component-SoundDesignProposal.tsx) también lo
 * necesita — analyzing/error se quedan locales, son solo del botón.
 */
export function FramePanel({ analysis, onAnalysisChange, apiKeys }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Reemplazar/eliminar ya revocan el Object URL anterior explícitamente;
  // esto cubre además el caso de que el componente se desmonte con uno activo.
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
    setUploadError(null);
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
      if (!apiKeys.groq?.trim()) {
        throw new Error("Configurá la API key de Groq antes de analizar.");
      }
      onAnalysisChange(await analyzeFrameDirect(dataUrl, apiKeys.groq));
    } catch (e: any) {
      setAnalysisError(e.message ?? "no se pudo analizar la imagen");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="frame-panel">
      <h2 className="section-title">Fotograma</h2>
      <p className="section-subtitle">¿Qué ves y qué podría sonar?</p>

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
            {analyzing ? "Analizando..." : analysis ? "Volver a analizar" : "Analizar escena"}
          </button>
          {analysisError && <p className="frame-panel__analysis-error">{analysisError}</p>}
        </div>
      )}

      {analysis && (
        <>
          <h2 className="section-title section-title--spaced">Análisis de escena</h2>
          <SceneAnalysisView analysis={analysis} />
        </>
      )}
    </div>
  );
}
