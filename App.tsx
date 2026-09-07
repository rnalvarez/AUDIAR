import { useState } from "react";
import { ELEMENTS, type Layer, type SceneAnalysis, type SoundtrackElement } from "./types";
import { loadApiKeys, saveApiKeys, type ApiKeys } from "./api-keys";
import { Settings } from "./component-Settings";
import { FramePanel } from "./component-FramePanel";
import { SoundDesignProposalPanel } from "./component-SoundDesignProposal";
import { PromptBar } from "./component-PromptBar";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { SendSelectionBar } from "./component-SendSelectionBar";

type LayersByElement = Record<SoundtrackElement, Layer[]>;
type QueryByElement = Record<SoundtrackElement, string>;

const emptyLayers = (): LayersByElement => ({
  ambientes: [],
  efectos: [],
  foley: [],
  dialogos: [],
});

export default function App() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadApiKeys());
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [queries, setQueries] = useState<QueryByElement>({
    ambientes: "",
    efectos: "",
    foley: "",
    dialogos: "",
  });

  function handleSaveApiKeys(keys: ApiKeys) {
    setApiKeys(keys);
    saveApiKeys(keys);
  }

  function applyPromptToAll(prompt: string) {
    setQueries({ ambientes: prompt, efectos: prompt, foley: prompt, dialogos: prompt });
  }

  function addLayer(element: SoundtrackElement, layer: Layer) {
    setLayers((prev) =>
      prev[element].some((l) => l.id === layer.id) ? prev : { ...prev, [element]: [...prev[element], layer] }
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedLayers = ELEMENTS.flatMap(({ id }) =>
    layers[id].filter((l) => selectedIds.has(l.id)).map((layer) => ({ layer, element: id }))
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1>AUDIAR</h1>
        <span className="app__tagline">diseño sonoro a partir de un fotograma, en capas</span>
      </header>

      <Settings apiKeys={apiKeys} onSave={handleSaveApiKeys} />

      <FramePanel analysis={analysis} onAnalysisChange={setAnalysis} apiKeys={apiKeys} />
      <SoundDesignProposalPanel analysis={analysis} onAddLayer={addLayer} apiKeys={apiKeys} />
      <PromptBar onApply={applyPromptToAll} />
      <SendSelectionBar selectedLayers={selectedLayers} onSent={() => setSelectedIds(new Set())} />

      <div className="app__grid">
        {ELEMENTS.map(({ id, label, hint }) => (
          <SoundtrackPanel
            key={id}
            elementId={id}
            label={label}
            hint={hint}
            query={queries[id]}
            layers={layers[id]}
            onLayersChange={(next) => setLayers((prev) => ({ ...prev, [id]: next }))}
            apiKeys={apiKeys}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
