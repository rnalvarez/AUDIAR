import { useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import {
  layerToSendableSound,
  sendToReaperBridge,
  type SendableSound,
} from "./reaper-bridge";

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

type QueueDownloadOptions = { deferStart?: boolean };

interface Props {
  selectedLayers: { layer: Layer; element: SoundtrackElement }[];
  onSent: () => void;
  onDownloadQueued: (sounds: SendableSound[], options?: QueueDownloadOptions) => Promise<string>;
  onDownloadStart: (batchId: string) => void;
}

const LABEL: Record<SendState, string> = {
  idle: "Enviar selección a REAPER",
  connecting: "Preparando y enviando...",
  sent: "Enviado · esperando a REAPER ✓",
  "not-found": "No se encontró REAPER Bridge",
  error: "No se pudo enviar",
};

export function SendSelectionBar({ selectedLayers, onSent, onDownloadQueued, onDownloadStart }: Props) {
  const [state, setState] = useState<SendState>("idle");
  const [downloadQueued, setDownloadQueued] = useState(false);

  const hasSelection = selectedLayers.length > 0;
  if (!hasSelection) return null;

  async function handleSend() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    setState("connecting");
    let batchId: string | null = null;

    try {
      // Primero creamos la carpeta y dejamos el lote en espera. Esto permite
      // abrir el selector de carpeta desde el clic del usuario y, a la vez,
      // evita que la descarga al directorio empiece antes que REAPER Bridge.
      batchId = await onDownloadQueued(sounds, { deferStart: true });

      const result = await sendToReaperBridge(sounds);
      if (result.ok) {
        // El Bridge ya dejó el audio en su caché compartida. La descarga al
        // directorio usa esa misma copia y no vuelve a consultar Freesound.
        onDownloadStart(batchId);
        setDownloadQueued(true);
        setState("sent");
        onSent();
      } else {
        // Aunque REAPER no esté disponible, conservamos la descarga manual.
        onDownloadStart(batchId);
        setDownloadQueued(true);
        setState(result.notFound ? "not-found" : "error");
      }
    } catch (error) {
      if (batchId) onDownloadStart(batchId);
      setState("error");
      console.error("[AUDIAR] No se pudo preparar el envío:", error);
    }
  }

  async function handleDownloadAll() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    if (!sounds.length) return;
    try {
      await onDownloadQueued(sounds);
      setDownloadQueued(true);
      window.setTimeout(() => setDownloadQueued(false), 4500);
    } catch {
      // El componente padre muestra el error correspondiente.
    }
  }

  return (
    <div className="send-selection-bar">
      <div className="send-selection-bar__info">
        <span className="send-selection-bar__count">
          {selectedLayers.length} sonido(s) seleccionado(s)
        </span>
        {downloadQueued && (
          <span className="send-selection-bar__download-status is-done">
            Grupo agregado a la cola · podés seguir trabajando
          </span>
        )}
      </div>

      <div className="send-selection-bar__actions">
        <button
          className="send-selection-bar__btn send-selection-bar__download-btn"
          onClick={() => void handleDownloadAll()}
        >
          Descargar todo
        </button>
        <button
          className={`send-selection-bar__btn reaper-state-${state}`}
          onClick={() => void handleSend()}
          disabled={state === "connecting"}
        >
          {LABEL[state]}
        </button>
      </div>
    </div>
  );
}
