import { useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import {
  downloadSoundsToFolder,
  layerToSendableSound,
  sendToReaperBridge,
  type DownloadProgress,
} from "./reaper-bridge";

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";
type DownloadState = "idle" | "starting" | "downloading" | "done" | "error";

export interface DownloadStatus {
  state: DownloadState;
  current: number;
  total: number;
  failed: number;
  error?: string;
}

interface Props {
  selectedLayers: { layer: Layer; element: SoundtrackElement }[];
  onSent: () => void;
  downloadStatus?: DownloadStatus;
  onDownloadStatusChange?: (status: DownloadStatus) => void;
}

const LABEL: Record<SendState, string> = {
  idle: "Enviar selección a REAPER",
  connecting: "Enviando al bridge...",
  sent: "Enviado · esperando a REAPER ✓",
  "not-found": "No se encontró REAPER Bridge",
  error: "No se pudo enviar",
};

export function SendSelectionBar({
  selectedLayers,
  onSent,
  downloadStatus = { state: "idle", current: 0, total: 0, failed: 0 },
  onDownloadStatusChange,
}: Props) {
  const [state, setState] = useState<SendState>("idle");

  const hasSelection = selectedLayers.length > 0;
  const hasDownloadActivity = downloadStatus.state !== "idle";
  if (!hasSelection && !hasDownloadActivity) return null;

  async function handleSend() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    setState("connecting");
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

  async function handleDownloadAll() {
    const sounds = selectedLayers.map(({ layer, element }) => layerToSendableSound(layer, element));
    if (sounds.length === 0) return;

    onDownloadStatusChange?.({ state: "starting", current: 0, total: sounds.length, failed: 0 });
    try {
      const result = await downloadSoundsToFolder(sounds, (progress: DownloadProgress) => {
        onDownloadStatusChange?.({
          state: "downloading",
          ...progress,
        });
      });
      onDownloadStatusChange?.({
        state: result.failed > 0 ? "error" : "done",
        current: result.completed,
        total: sounds.length,
        failed: result.failed,
        error: result.failed > 0 ? `${result.failed} descarga(s) no pudieron completarse.` : undefined,
      });
    } catch (error) {
      onDownloadStatusChange?.({
        state: "error",
        current: 0,
        total: sounds.length,
        failed: sounds.length,
        error: error instanceof Error ? error.message : "No se pudo iniciar la descarga.",
      });
    }
  }

  return (
    <div className="send-selection-bar">
      <div className="send-selection-bar__info">
        {hasSelection && (
          <span className="send-selection-bar__count">
            {selectedLayers.length} sonido(s) seleccionado(s)
          </span>
        )}
        {downloadStatus.state === "starting" && (
          <span className="send-selection-bar__download-status">Preparando descarga…</span>
        )}
        {downloadStatus.state === "downloading" && (
          <span className="send-selection-bar__download-status">
            Descargando {downloadStatus.current}/{downloadStatus.total}
            {downloadStatus.failed > 0 ? ` · ${downloadStatus.failed} error(es)` : ""}
          </span>
        )}
        {downloadStatus.state === "done" && (
          <span className="send-selection-bar__download-status is-done">
            Descarga completada · {downloadStatus.total} archivo(s)
          </span>
        )}
        {downloadStatus.state === "error" && downloadStatus.error && (
          <span className="send-selection-bar__download-status is-error">{downloadStatus.error}</span>
        )}
      </div>

      <div className="send-selection-bar__actions">
        {hasSelection && (
          <>
            <button
              className={`send-selection-bar__btn send-selection-bar__download-btn download-state-${downloadStatus.state}`}
              onClick={() => void handleDownloadAll()}
              disabled={downloadStatus.state === "starting" || downloadStatus.state === "downloading"}
            >
              {downloadStatus.state === "starting" || downloadStatus.state === "downloading" ? "Descargando…" : "Descargar todo"}
            </button>
            <button
              className={`send-selection-bar__btn reaper-state-${state}`}
              onClick={() => void handleSend()}
              disabled={state === "connecting"}
            >
              {LABEL[state]}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
