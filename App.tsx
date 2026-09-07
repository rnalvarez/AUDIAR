import { useState } from "react";
import { ELEMENTS, type Layer, type SoundtrackElement } from "./types";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "./api-keys";
import { Settings } from "./component-Settings";
import { FramePanel } from "./component-FramePanel";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { SendSelectionBar } from "./component-SendSelectionBar";

type LayersByElement = Record<SoundtrackElement, Layer[]>;

const emptyLayers = (): LayersByElement => ({
  ambientes: [],
  efectos: [],
  foley: [],
  dialogos: [],
});

export default function App() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadApiKeys());
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const selectedLayers = ELEMENTS.flatMap(({ id }) =>
    layers[id].filter((layer) => selectedIds.has(layer.id)).map((layer) => ({ layer, element: id }))
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
      />

      <SendSelectionBar selectedLayers={selectedLayers} onSent={() => setSelectedIds(new Set())} />

      <div className="app__grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
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
