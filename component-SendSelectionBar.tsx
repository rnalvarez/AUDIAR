import { useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import { layerToSendableSound, sendToReaperBridge, type SendableSound } from "./reaper-bridge";

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

interface Props {
  selectedLayers: { layer: Layer; element: SoundtrackElement }[];
  onSent: () => void;
  onDownloadQueued: (sounds: SendableSound[]) => Promise<string>;
  sceneName: string;
  onEnsureSceneGroup: () => Promise<{ groupName: string }>;
}

const LABEL: Record<SendState, string> = {
  idle: "Enviar selección a REAPER",
  connecting: "Descargando e importando...",
  sent: "Enviado · esperando a REAPER ✓",
  "not-found": "No se encontró REAPER Bridge",
  error: "No se pudo enviar",
};

export function SendSelectionBar({ selectedLayers, onSent, onDownloadQueued, sceneName, onEnsureSceneGroup }: Props) {
  const [state, setState] = useState<SendState>("idle");
  const [savedStatus, setSavedStatus] = useState(false);
  const hasSelection = selectedLayers.length > 0;
  if (!hasSelection) return null;

  async function handleSend() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    setState("connecting");
    try {
      const group = await onEnsureSceneGroup();
      const result = await sendToReaperBridge(sounds, sceneName, group.groupName);
      setSavedStatus(Boolean(result.ok));
      if (result.ok) {
        setState("sent");
        onSent();
      } else {
        setState(result.notFound ? "not-found" : "error");
      }
    } catch (error) {
      setState("error");
      console.error("[AUDIAR] No se pudo enviar:", error);
    }
  }

  async function handleDownloadAll() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    if (!sounds.length) return;
    try {
      await onDownloadQueued(sounds);
      setSavedStatus(true);
      window.setTimeout(() => setSavedStatus(false), 4500);
    } catch {}
  }

  return (
    <div className="send-selection-bar">
      <div className="send-selection-bar__info">
        <span className="send-selection-bar__count">{selectedLayers.length} sonido(s) seleccionado(s)</span>
        {savedStatus && <span className="send-selection-bar__download-status is-done">Guardado en la carpeta de escena</span>}
      </div>
      <div className="send-selection-bar__actions">
        <button className="send-selection-bar__btn send-selection-bar__download-btn" onClick={() => void handleDownloadAll()}>Descargar todo</button>
        <button className={`send-selection-bar__btn reaper-state-${state}`} onClick={() => void handleSend()} disabled={state === "connecting"}>{LABEL[state]}</button>
      </div>
    </div>
  );
}
