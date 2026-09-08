import { useEffect, useRef, useState } from "react";
import { ELEMENTS, type Layer, type SoundtrackElement } from "./types";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "./api-keys";
import { Settings } from "./component-Settings";
import { FramePanel } from "./component-FramePanel";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { SendSelectionBar } from "./component-SendSelectionBar";
import { DownloadQueue, makeInitialDownloadProgress, type DownloadBatch } from "./component-DownloadQueue";
import { changeDownloadRoot, createDownloadController, createSceneGroupDirectory, downloadSoundsToDirectory, getDownloadRootStatus, getOrChooseDownloadRoot, sendToReaperBridge, type DownloadController, type SendableSound } from "./reaper-bridge";

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
  const downloadControllerRef = useRef<Map<string, DownloadController>>(new Map());

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
    const controller = createDownloadController();
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
    downloadControllerRef.current.set(batchId, controller);
    if (onCompleted) batchCompletionRef.current.set(batchId, onCompleted);
    setDownloadQueue((prev) => [...prev, batch]);
    return batchId;
  }

  function updateBatch(id: string, updater: (batch: DownloadBatch) => DownloadBatch) {
    setDownloadQueue((prev) => prev.map((batch) => (batch.id === id ? updater(batch) : batch)));
  }

  function markQueuedBatchCancelled(id: string) {
    updateBatch(id, (batch) => ({ ...batch, state: "cancelled", progress: { ...batch.progress, current: batch.progress.total, cancelled: batch.progress.total, active: 0, remainingBytes: 0, items: batch.progress.items.map((item) => item.state === "done" ? item : { ...item, state: "cancelled" as const, speedBytesPerSecond: 0 }) }, error: "Grupo cancelado por el usuario." }));
    batchCompletionRef.current.delete(id);
    downloadControllerRef.current.delete(id);
  }

  function cancelDownloadBatch(id: string) {
    const batch = downloadQueue.find((candidate) => candidate.id === id);
    const controller = downloadControllerRef.current.get(id);
    if (!batch || !controller) return;
    controller.cancelBatch();
    if (batch.state === "queued") markQueuedBatchCancelled(id);
  }

  function cancelDownloadItem(batchId: string, itemId: string) {
    const batch = downloadQueue.find((candidate) => candidate.id === batchId);
    const controller = downloadControllerRef.current.get(batchId);
    if (!batch || !controller) return;
    controller.cancelItem(itemId);
    if (batch.state === "queued") {
      updateBatch(batchId, (current) => {
        const items = current.progress.items.map((item) => item.id === itemId ? { ...item, state: "cancelled" as const, speedBytesPerSecond: 0, error: undefined } : item);
        const allCancelled = items.every((item) => item.state === "cancelled");
        return { ...current, state: allCancelled ? "cancelled" : current.state, error: allCancelled ? "Grupo cancelado porque todos sus archivos fueron cancelados." : current.error, progress: { ...current.progress, current: allCancelled ? current.progress.total : current.progress.current, cancelled: items.filter((item) => item.state === "cancelled").length, items } };
      });
      if (batch.progress.items.filter((item) => item.id !== itemId).every((item) => item.state === "cancelled")) {
        batchCompletionRef.current.delete(batchId);
        downloadControllerRef.current.delete(batchId);
      }
    }
  }

  async function sendSingleSoundToReaper(sound: SendableSound) {
    const group = await ensureSceneGroup();
    const batchId = await enqueueDownloadBatch([sound]);
    await new Promise<void>((resolve, reject) => {
      const originalCompletion = batchCompletionRef.current.get(batchId);
      batchCompletionRef.current.set(batchId, async () => {
        try {
          const result = await sendToReaperBridge([sound], sceneName, group.groupName);
          if (!result.ok) throw new Error(result.error ?? "No se pudo enviar a REAPER.");
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          await originalCompletion?.();
        }
      });
    });
  }

  async function importBatchToReaper(batchId: string) {
    const batch = downloadQueue.find((candidate) => candidate.id === batchId);
    if (!batch || batch.state !== "done" || batch.progress.failed > 0 || batch.progress.cancelled > 0) return;
    const result = await sendToReaperBridge(batch.sounds, sceneName, batch.groupName);
    if (!result.ok) {
      updateBatch(batchId, (current) => ({ ...current, error: result.error ?? "No se pudo preparar la importación a REAPER." }));
    }
  }

  useEffect(() => {
    if (activeBatchRef.current) return;
    const nextBatch = downloadQueue.find((batch) => batch.state === "queued");
    if (!nextBatch) return;
    const controller = downloadControllerRef.current.get(nextBatch.id) ?? createDownloadController();
    downloadControllerRef.current.set(nextBatch.id, controller);
    activeBatchRef.current = nextBatch.id;
    updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "downloading" }));

    void (async () => {
      try {
        const result = await downloadSoundsToDirectory(nextBatch.sounds, null, (progress) => updateBatch(nextBatch.id, (batch) => ({ ...batch, progress })), nextBatch.groupName, controller);
        const completedSuccessfully = result.failed === 0 && result.cancelled === 0;
        const wasCancelled = result.cancelled > 0;
        updateBatch(nextBatch.id, (batch) => ({ ...batch, state: wasCancelled ? "cancelled" : completedSuccessfully ? "done" : "error", progress: { ...batch.progress, current: result.completed + result.failed + result.cancelled, total: nextBatch.sounds.length, failed: result.failed, cancelled: result.cancelled }, error: wasCancelled ? (result.failed > 0 ? `Cancelado: ${result.failed} archivo(s) también fallaron.` : "Cancelado por el usuario.") : result.failed > 0 ? `${result.failed} archivo(s) no pudieron descargarse.` : undefined }));
        const completion = batchCompletionRef.current.get(nextBatch.id);
        if (completion && completedSuccessfully) {
          try { await completion(); } finally { batchCompletionRef.current.delete(nextBatch.id); }
        } else {
          batchCompletionRef.current.delete(nextBatch.id);
        }
      } catch (error) {
        batchCompletionRef.current.delete(nextBatch.id);
        updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "error", error: error instanceof Error ? error.message : "No se pudo completar la descarga." }));
      } finally {
        downloadControllerRef.current.delete(nextBatch.id);
        activeBatchRef.current = null;
      }
    })();
  }, [downloadQueue]);

  async function queueSelectedSoundsForReaper(sounds: SendableSound[]): Promise<string> {
    const group = await ensureSceneGroup();
    let resolveCompletion!: () => void;
    let rejectCompletion!: (reason?: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
    const batchId = await enqueueDownloadBatch(sounds, async () => {
      const result = await sendToReaperBridge(sounds, sceneName, group.groupName);
      if (result.ok) resolveCompletion(); else rejectCompletion(new Error(result.error ?? "No se pudo enviar a REAPER."));
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
      {downloadQueue.length > 0 && <DownloadQueue batches={downloadQueue} onCancelBatch={cancelDownloadBatch} onCancelItem={cancelDownloadItem} onImportBatch={importBatchToReaper} />}
      <div className="app__grid">
        {ELEMENTS.map(({ id, label, hint }) => <SoundtrackPanel key={id} elementId={id} label={label} hint={hint} layers={layers[id]} onLayersChange={(next: Layer[]) => setLayers((prev) => ({ ...prev, [id]: next }))} apiKeys={apiKeys} selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectIds={selectIds} onSetCategorySelection={(selectAll: boolean) => setCategorySelection(id, selectAll)} globalSoloActive={globalSoloActive} onSendToReaper={sendSingleSoundToReaper} />)}
      </div>
    </div>
  );
}
