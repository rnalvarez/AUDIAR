import { useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import { layerToSendableSound, sendToReaperBridge } from "./reaper-bridge";

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

interface Props {
  selectedLayers: { layer: Layer; element: SoundtrackElement }[];
  onSent: () => void;
}

const LABEL: Record<SendState, string> = {
  idle: "Enviar selección a REAPER",
  connecting: "Enviando al bridge...",
  sent: "Enviado · esperando a REAPER ✓",
  "not-found": "No se encontró REAPER Bridge",
  error: "No se pudo enviar",
};

export function SendSelectionBar({ selectedLayers, onSent }: Props) {
  const [state, setState] = useState<SendState>("idle");

  if (selectedLayers.length === 0) return null;

  async function handleSend() {
    setState("connecting");
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    const result = await sendToReaperBridge(sounds);
    if (result.ok) {
      setState("sent");
      onSent();
    } else if (result.notFound) {
      setState("not-found");
    } else {
      setState("error");
    }
  }

  return (
    <div className="send-selection-bar">
      <span className="send-selection-bar__count">{selectedLayers.length} sonido(s) seleccionado(s)</span>
      <button className={`send-selection-bar__btn reaper-state-${state}`} onClick={handleSend} disabled={state === "connecting"}>
        {LABEL[state]}
      </button>
    </div>
  );
}
