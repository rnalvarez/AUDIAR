import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FramePanel from "./component-FramePanel";
import SoundtrackPanel from "./component-SoundtrackPanel";
import SendSelectionBar from "./component-SendSelectionBar";
import DownloadQueue, { type DownloadBatch } from "./component-DownloadQueue";
import Settings from "./component-Settings";
import { ELEMENTS, type ElementId, type SoundLayer, type SoundtrackElement } from "./types";
import { downloadSoundsToDirectory, createSceneGroupDirectory, getOrChooseDownloadRoot, type SendableSound } from "./reaper-bridge";
import { saveSettings, loadSettings } from "./settings";
import { analyzeFrame } from "./gemini";

const emptyLayers = (): Record<ElementId, SoundLayer[]> => ({
  ambiente: [],
  efectos: [],
  foley: [],
});

export default function App() {
  const [layers, setLayers] = useState<Record<ElementId, SoundLayer[]>>(emptyLayers);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sceneName, setSceneName] = useState("");
  const [apiKeys, setApiKeys] = useState(loadSettings());
  const [downloadQueue, setDownloadQueue] = useState<DownloadBatch[]>([]);
  const sceneGroupRef = useRef<string | null>(null);
  const sceneGroupCreationRef = useRef<Promise<{ groupName: string }> | null>(null);
  const activeBatchRef = useRef<string | null>(null);

  const handleSaveApiKeys = useCallback((next: typeof apiKeys) => {
    setApiKeys(next);
    saveSettings(next);
  }, []);

  const replaceLayers = useCallback((next: Record<ElementId, SoundLayer[]>) => {
    setLayers(next);
    setSelectedIds(new Set());
  }, []);

  const handleNewScene = useCallback(() => {
    sceneGroupRef.current = null;
    sceneGroupCreationRef.current = null;
  }, []);

  const ensureSceneGroup = useCallback(async () => {
    if (sceneGroupRef.current) return { groupName: sceneGroupRef.current };

    if (!sceneGroupCreationRef.current) {
      sceneGroupCreationRef.current = (async () => {
        await getOrChooseDownloadRoot();
        const group = await createSceneGroupDirectory(null, sceneName);
        sceneGroupRef.current = group.name;
        return { groupName: group.name };
      })().finally(() => {
        sceneGroupCreationRef.current = null;
      });
    }

    return sceneGroupCreationRef.current;
  }, [sceneName]);

  const enqueueDownloadBatch = useCallback(async (sounds: SendableSound[]) => {
    if (!sounds.length) return "";
    const group = await ensureSceneGroup();
    const batch: DownloadBatch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: sceneName.trim() || "Descarga de escena",
      folderName: group.groupName,
      groupName: group.groupName,
      sounds,
      state: "queued",
      progress: { current: 0, total: sounds.length, bytesDownloaded: 0, bytesTotal: 0, bytesPerSecond: 0, etaSeconds: 0, failed: 0 },
      createdAt: Date.now(),
    };
    setDownloadQueue((prev) => [...prev, batch]);
    return group.groupName;
  }, [ensureSceneGroup, sceneName]);

  const updateBatch = useCallback((id: string, updater: (batch: DownloadBatch) => DownloadBatch) => {
    setDownloadQueue((prev) => prev.map((batch) => batch.id === id ? updater(batch) : batch));
  }, []);

  const clearCompletedDownloads = useCallback(() => {
    setDownloadQueue((prev) => prev.filter((batch) => batch.state !== "done"));
  }, []);

  useEffect(() => {
    const nextBatch = downloadQueue.find((batch) => batch.state === "queued");
    if (!nextBatch || activeBatchRef.current) return;
    activeBatchRef.current = nextBatch.id;
    updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "downloading" }));
    void (async () => {
      try {
        const result = await downloadSoundsToDirectory(nextBatch.sounds, null, (progress) => updateBatch(nextBatch.id, (batch) => ({ ...batch, progress })), nextBatch.groupName);
        updateBatch(nextBatch.id, (batch) => ({ ...batch, state: result.failed > 0 ? "error" : "done", progress: { ...batch.progress, current: result.completed + result.failed, total: nextBatch.sounds.length, failed: result.failed }, error: result.failed > 0 ? `${result.failed} archivo(s) no pudieron descargarse.` : undefined }));
      } catch (error) {
        updateBatch(nextBatch.id, (batch) => ({ ...batch, state: "error", error: error instanceof Error ? error.message : "No se pudo completar la descarga." }));
      } finally {
        activeBatchRef.current = null;
      }
    })();
  }, [downloadQueue, updateBatch]);

  const selectedLayers = useMemo(() => ELEMENTS.flatMap(({ id }) => layers[id].filter((layer) => selectedIds.has(layer.id)).map((layer) => ({ layer, element: id as SoundtrackElement }))), [layers, selectedIds]);
  const globalSoloActive = ELEMENTS.some(({ id }) => layers[id].some((layer) => layer.solo));

  return (
    <div className="app">
      <header className="app__header"><h1>AUDIAR</h1><span className="app__tagline">diseño sonoro a partir de un fotograma, en capas</span></header>
      <Settings apiKeys={apiKeys} onSave={handleSaveApiKeys} />
      <FramePanel apiKeys={apiKeys} onDesignGenerated={replaceLayers} onSceneNameChange={setSceneName} onNewScene={handleNewScene} />
      <SendSelectionBar selectedLayers={selectedLayers} onSent={() => setSelectedIds(new Set())} sceneName={sceneName} onDownloadQueued={enqueueDownloadBatch} onEnsureSceneGroup={ensureSceneGroup} />
      {downloadQueue.length > 0 && <DownloadQueue batches={downloadQueue} onClearCompleted={clearCompletedDownloads} />}
      <div className="app__grid">{ELEMENTS.map(({ id, label, hint }) => <SoundtrackPanel key={id} elementId={id} label={label} hint={hint} layers={layers[id]} onLayersChange={(next) => setLayers((prev) => ({ ...prev, [id]: next }))} apiKeys={apiKeys} selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectIds={selectIds} onSetCategorySelection={(selectAll) => setCategorySelection(id, selectAll)} globalSoloActive={globalSoloActive} />)}</div>
    </div>
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectIds(ids: string[]) {
    setSelectedIds(new Set(ids));
  }

  function setCategorySelection(id: ElementId, selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const layer of layers[id]) {
        if (selectAll) next.add(layer.id); else next.delete(layer.id);
      }
      return next;
    });
  }
}
