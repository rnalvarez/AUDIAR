import { useEffect, useRef, useState } from "react";
import { ELEMENTS, type Layer, type SoundtrackElement } from "./types";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "./api-keys";
import { Settings } from "./component-Settings";
import { FramePanel } from "./component-FramePanel";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { SendSelectionBar } from "./component-SendSelectionBar";
import { DownloadQueue, makeInitialDownloadProgress, type DownloadBatch } from "./component-DownloadQueue";
import { changeDownloadRoot, createSceneGroupDirectory, downloadSoundsToDirectory, getDownloadRootStatus, getOrChooseDownloadRoot, sendToReaperBridge, type SendableSound } from "./reaper-bridge";

type LayersByElement = Record<SoundtrackElement, Layer[]>;
const emptyLayers = (): LayersByElement => ({ ambientes: [], efectos: [], foley: [] });
type BatchCompletion = () => Promise<void>;

export default function App() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadApiKeys());
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadQueue, setDownloadQueue] = useState<DownloadBatch[]>([]);
  const [sceneName, setSceneName] = useState("");
  const [downloadRootName, setDownloadRootName] = useState("");
  const [changingDownloadRoot, setChangingDownloadRoot] = useState(false);
  const [downloadRootError, setDownloadRootError] = useState<string | null>(null);
  const sceneGroupRef = useRef<string | null>(null);
  const sceneGroupCreationRef = useRef<Promise<{ rootName: string; groupName: string }> | null>(null);
  const activeBatchRef = useRef<string | null>(null);
  const batchCompletionRef = useRef<Map<string, BatchCompletion>>(new Map());

  useEffect(() => {
    void getDownloadRootStatus().then((root) => setDownloadRootName(root?.name ?? "")).catch(() => {});
  }, []);

  function handleSaveApiKeys(keys: ApiKeys) {
    setApiKeys(keys);
    saveApiKeys(keys);
  }

  function replaceLayers(next: Partial<LayersByElement>) {
    setLayers((prev) => ({ ...prev, ...next }));
    setSelectedIds(new Set());
  }

  function handleNewScene() {
    sceneGroupRef.current = null;
    sceneGroupCreationRef.current = null;
  }

  async function handleChangeDownloadRoot() {
    if (changingDownloadRoot) return;
    setChangingDownloadRoot(true);
    setDownloadRootError(null);
    try {
      const root = await changeDownloadRoot();
      setDownloadRootName(root.name);
      sceneGroupRef.current = null;
      sceneGroupCreationRef.current = null;
    } catch (error) {
      setDownloadRootError(error instanceof Error ? error.message : "No se pudo cambiar la carpeta raíz.");
    } finally {
      setChangingDownloadRoot(false);
    }
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
    if (!ids.length) return;
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

  async function ensureSceneGroup(): Promise<{ rootName: string; groupName: string }> {
    const root = await getOrChooseDownloadRoot();
    setDownloadRootName(root.name);
    if (sceneGroupRef.current) return { rootName: root.name, groupName: sceneGroupRef.current };

    if (!sceneGroupCreationRef.current) {
      sceneGroupCreationRef.current = (async () => {
        const group = await createSceneGroupDirectory(null, sceneName);
        sceneGroupRef.current = group.name;
        return { rootName: root.name, groupName: group.name };
      })().finally(() => {
        sceneGroupCreationRef.current = null;
      });
    }

    return sceneGroupCreationRef.current;
  }

  async function enqueueDownloadBatch(sounds: SendableSound[], onCompleted?: BatchCompletion): Promise<string> {
    if (!sounds.length) throw new Error("No hay sonidos para descargar.");
    const group = await ensureSceneGroup();
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const batch: DownloadBatch = {
      id: batchId,
      title: group.groupName,
      folderName: group.rootName,
      groupName: group.groupName,
      sounds,
      state: "queued",
      progress: makeInitialDownloadProgress(sounds),
      createdAt: Date.now(),
    };
    if (onCompleted) batchCompletionRef.current.set(batchId, onCompleted);
    setDownloadQueue((prev) => [...prev, batch]);
    return batchId;
  }

  function updateBatch(id: string, updater: (batch: DownloadBatch) => DownloadBatch) {
    setDownloadQueue((prev) => prev.map((batch) => (batch.id === id ? updater(batch) : batch)));
  }

  function clearCompletedDownloads() {
    // La cola es también un historial visible de las operaciones realizadas.
    // Las descargas completadas no deben desaparecer al pulsar este botón.
    setDownloadQueue((prev) => [...prev]);
  }

  useEffect(() => {
    if (activeBatchRef.current) return;
    const nextBatch = downloadQueue.find((batch) => batch.state === "queued");
    if (!nextBatch) return;
    activeBatchRef.current = nextBatch.id;
    updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "downloading" }));

    void (async () => {
      try {
        const result = await downloadSoundsToDirectory(nextBatch.sounds, null, (progress) => updateBatch(nextBatch.id, (batch) => ({ ...batch, progress })), nextBatch.groupName);
        const completedSuccessfully = result.failed === 0;
        updateBatch(nextBatch.id, (batch) => ({
          ...batch,
          state: completedSuccessfully ? "done" : "error",
          progress: { ...batch.progress, current: result.completed + result.failed, total: nextBatch.sounds.length, failed: result.failed },
          error: result.failed > 0 ? `${result.failed} archivo(s) no pudieron descargarse.` : undefined,
        }));
        const completion = batchCompletionRef.current.get(nextBatch.id);
        if (completion && completedSuccessfully) {
          try {
            await completion();
          } finally {
            batchCompletionRef.current.delete(nextBatch.id);
          }
        } else {
          batchCompletionRef.current.delete(nextBatch.id);
        }
      } catch (error) {
        batchCompletionRef.current.delete(nextBatch.id);
        updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "error", error: error instanceof Error ? error.message : "No se pudo completar la descarga." }));
      } finally {
        activeBatchRef.current = null;
      }
    })();
  }, [downloadQueue]);

  async function queueSelectedSoundsForReaper(sounds: SendableSound[]): Promise<string> {
    const group = await ensureSceneGroup();
    let resolveCompletion!: () => void;
    let rejectCompletion!: (reason?: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const batchId = await enqueueDownloadBatch(sounds, async () => {
      const result = await sendToReaperBridge(sounds, sceneName, group.groupName);
      if (result.ok) resolveCompletion();
      else rejectCompletion(new Error(result.error ?? "No se pudo enviar a REAPER."));
    });
    return completion.then(() => batchId);
  }

  const selectedLayers = ELEMENTS.flatMap(({ id }) => layers[id].filter((layer) => selectedIds.has(layer.id)).map((layer) => ({ layer, element: id })));
  const globalSoloActive = ELEMENTS.some(({ id }) => layers[id].some((layer) => layer.solo));

  return (
    <div className="app">
      <header className="app__header"><h1>AUDIAR</h1><span className="app__tagline">diseño sonoro a partir de un fotograma, en capas</span></header>
      <Settings apiKeys={apiKeys} onSave={handleSaveApiKeys} />
      <FramePanel apiKeys={apiKeys} onDesignGenerated={replaceLayers} onSceneNameChange={setSceneName} onNewScene={handleNewScene} />
      <div className="frame-storage" aria-live="polite">
        <div className="frame-storage__main"><div className="frame-storage__label">Carpeta de almacenamiento</div><div className="frame-storage__path" title={downloadRootName || "No seleccionada"}>{downloadRootName || "No seleccionada"}</div><div className="frame-storage__help">Los grupos y archivos nuevos se guardarán aquí.</div>{downloadRootError && <div className="frame-storage__error">{downloadRootError}</div>}</div>
        <button type="button" className="frame-storage__change" onClick={() => void handleChangeDownloadRoot()} disabled={changingDownloadRoot}>{changingDownloadRoot ? "Seleccionando…" : "Cambiar carpeta"}</button>
      </div>
      <SendSelectionBar selectedLayers={selectedLayers} onSent={() => setSelectedIds(new Set())} sceneName={sceneName} onDownloadQueued={enqueueDownloadBatch} onSendQueued={queueSelectedSoundsForReaper} onEnsureSceneGroup={ensureSceneGroup} />
      {downloadQueue.length > 0 && <DownloadQueue batches={downloadQueue} onClearCompleted={clearCompletedDownloads} />}
      <div className="app__grid">
        {ELEMENTS.map(({ id, label, hint }) => <SoundtrackPanel key={id} elementId={id} label={label} hint={hint} layers={layers[id]} onLayersChange={(next: Layer[]) => setLayers((prev) => ({ ...prev, [id]: next }))} apiKeys={apiKeys} selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectIds={selectIds} onSetCategorySelection={(selectAll: boolean) => setCategorySelection(id, selectAll)} globalSoloActive={globalSoloActive} />)}
      </div>
    </div>
  );
}
