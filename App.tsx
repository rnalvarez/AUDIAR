import { useEffect, useRef, useState } from "react";
import { ELEMENTS, type Layer, type SoundtrackElement } from "./types";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "./api-keys";
import { Settings } from "./component-Settings";
import { FramePanel } from "./component-FramePanel";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { SendSelectionBar } from "./component-SendSelectionBar";
import { DownloadQueue, makeInitialDownloadProgress, type DownloadBatch } from "./component-DownloadQueue";
import { createSceneGroupDirectory, downloadSoundsToDirectory, getOrChooseDownloadRoot, type SendableSound } from "./reaper-bridge";

type LayersByElement = Record<SoundtrackElement, Layer[]>;
const emptyLayers = (): LayersByElement => ({ ambientes: [], efectos: [], foley: [] });

type DownloadQueueOptions = { deferStart?: boolean };

export default function App() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadApiKeys());
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadQueue, setDownloadQueue] = useState<DownloadBatch[]>([]);
  const [sceneName, setSceneName] = useState("");
  const activeBatchRef = useRef<string | null>(null);

  function handleSaveApiKeys(keys: ApiKeys) {
    setApiKeys(keys);
    saveApiKeys(keys);
  }

  function replaceLayers(next: Partial<LayersByElement>) {
    setLayers((prev) => ({ ...prev, ...next }));
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectIds(ids: string[]) {
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function setCategorySelection(elementId: SoundtrackElement, selectAll: boolean) {
    const ids = layers[elementId].map((layer) => layer.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (selectAll ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function enqueueDownloadBatch(sounds: SendableSound[], options: DownloadQueueOptions = {}): Promise<string> {
    if (!sounds.length) throw new Error("No hay sonidos para descargar.");

    try {
      const root = await getOrChooseDownloadRoot();
      const group = await createSceneGroupDirectory(root.handle, sceneName);
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const batch: DownloadBatch = {
        id: batchId,
        title: group.name,
        folderName: root.name,
        directoryHandle: group.handle,
        sounds,
        state: options.deferStart ? "waiting" : "queued",
        progress: makeInitialDownloadProgress(sounds),
        createdAt: Date.now(),
      };
      setDownloadQueue((prev) => [...prev, batch]);
      return batchId;
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        window.alert(error instanceof Error ? error.message : "No se pudo seleccionar la carpeta raíz.");
      }
      throw error;
    }
  }

  function startDownloadBatch(id: string) {
    setDownloadQueue((prev) => prev.map((batch) => (
      batch.id === id && batch.state === "waiting" ? { ...batch, state: "queued" } : batch
    )));
  }

  function updateBatch(id: string, updater: (batch: DownloadBatch) => DownloadBatch) {
    setDownloadQueue((prev) => prev.map((batch) => (batch.id === id ? updater(batch) : batch)));
  }

  function clearCompletedDownloads() {
    setDownloadQueue((prev) => prev.filter((batch) => batch.state !== "done"));
  }

  useEffect(() => {
    if (activeBatchRef.current) return;
    const nextBatch = downloadQueue.find((batch) => batch.state === "queued");
    if (!nextBatch) return;

    activeBatchRef.current = nextBatch.id;
    updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "downloading" }));

    void (async () => {
      try {
        const result = await downloadSoundsToDirectory(
          nextBatch.sounds,
          nextBatch.directoryHandle,
          (progress) => {
            updateBatch(nextBatch.id, (batch) => ({ ...batch, progress }));
          },
        );
        updateBatch(nextBatch.id, (batch) => ({
          ...batch,
          state: result.failed > 0 ? "error" : "done",
          progress: {
            ...batch.progress,
            current: result.completed + result.failed,
            total: nextBatch.sounds.length,
            failed: result.failed,
          },
          error: result.failed > 0 ? `${result.failed} archivo(s) no pudieron descargarse.` : undefined,
        }));
      } catch (error) {
        updateBatch(nextBatch.id, (batch) => ({
          ...batch,
          state: "error",
          error: error instanceof Error ? error.message : "No se pudo completar la descarga.",
        }));
      } finally {
        activeBatchRef.current = null;
      }
    })();
  }, [downloadQueue]);

  const selectedLayers = ELEMENTS.flatMap(({ id }) =>
    layers[id]
      .filter((layer) => selectedIds.has(layer.id))
      .map((layer) => ({ layer, element: id }))
  );

  const globalSoloActive = ELEMENTS.some(({ id }) => layers[id].some((layer) => layer.solo));

  return (
    <div className="app">
      <header className="app__header">
        <h1>AUDIAR</h1>
        <span className="app__tagline">diseño sonoro a partir de un fotograma, en capas</span>
      </header>

      <Settings apiKeys={apiKeys} onSave={handleSaveApiKeys} />
      <FramePanel
        apiKeys={apiKeys}
        onDesignGenerated={replaceLayers}
        onSceneNameChange={setSceneName}
      />
      <SendSelectionBar
        selectedLayers={selectedLayers}
        onSent={() => setSelectedIds(new Set())}
        onDownloadQueued={enqueueDownloadBatch}
        onDownloadStart={startDownloadBatch}
      />

      {downloadQueue.length > 0 && (
        <DownloadQueue batches={downloadQueue} onClearCompleted={clearCompletedDownloads} />
      )}

      <div className="app__grid">
        {ELEMENTS.map(({ id, label, hint }) => (
          <SoundtrackPanel
            key={id}
            elementId={id}
            label={label}
            hint={hint}
            layers={layers[id]}
            onLayersChange={(next) => setLayers((prev) => ({ ...prev, [id]: next }))}
            apiKeys={apiKeys}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectIds={selectIds}
            onSetCategorySelection={(selectAll) => setCategorySelection(id, selectAll)}
            globalSoloActive={globalSoloActive}
          />
        ))}
      </div>
    </div>
  );
}
