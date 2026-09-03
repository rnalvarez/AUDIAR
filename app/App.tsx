import { useState } from "react";
import { ELEMENTS, type Layer, type SoundtrackElement } from "./types";
import { VideoPanel } from "./component-VideoPanel";
import { PromptBar } from "./component-PromptBar";
import { SoundtrackPanel } from "./component-SoundtrackPanel";

type LayersByElement = Record<SoundtrackElement, Layer[]>;
type QueryByElement = Record<SoundtrackElement, string>;

const emptyLayers = (): LayersByElement => ({
  ambientes: [],
  efectos: [],
  foley: [],
  dialogos: [],
});

export default function App() {
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [queries, setQueries] = useState<QueryByElement>({
    ambientes: "",
    efectos: "",
    foley: "",
    dialogos: "",
  });

  function applyPromptToAll(prompt: string) {
    setQueries({ ambientes: prompt, efectos: prompt, foley: prompt, dialogos: prompt });
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>AUDIAR</h1>
        <span className="app__tagline">diseño sonoro para video, en capas</span>
      </header>

      <VideoPanel />
      <PromptBar onApply={applyPromptToAll} />

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
          />
        ))}
      </div>
    </div>
  );
}
