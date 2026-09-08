import { useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import {
  layerToSendableSound,
  sendToReaperBridge,
  type SendableSound,
} from "./reaper-bridge";

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

interface Props {
  selectedLayers: { layer: Layer; element: SoundtrackElement }[];
  onSent: () => void;
  onDownloadQueued: (sounds: SendableSound[]) => Promise<void>;
}

const LABEL: Record<SendState, string> = {
  idle: "Enviar selección a REAPER",
  connecting: "Enviando al bridge...",
  sent: "Enviado · esperando a REAPER ✓",
  "not-found": "No se encontró REAPER Bridge",
  error: "No se pudo enviar",
};

export function SendSelectionBar({ selectedLayers, onSent, onDownloadQueued }: Props) {
  const [state, setState] = useState<SendState>("idle");
  const [downloadQueued, setDownloadQueued] = useState(false);

  const hasSelection = selectedLayers.length > 0;
  if (!hasSelection) return null;

  async function handleSend() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    setState("connecting");

    try {
      // La misma selección que se envía a REAPER queda además archivada
      // en el siguiente grupo de escena de la cola de descargas.
      await onDownloadQueued(sounds);
      setDownloadQueued(true);

      const result = await sendToReaperBridge(sounds);
      if (result.ok) {
        setState("sent");
        onSent();
      } else if (result.notFound) {
        setState("not-found");
      } else {
        setState("error");
      }
    } catch (error) {
      setState("error");
      console.error("[AUDIAR] No se pudo crear el grupo para REAPER:", error);
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
