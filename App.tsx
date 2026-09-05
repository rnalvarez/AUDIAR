import { useState } from "react";
import { ELEMENTS, type Layer, type SceneAnalysis, type SoundtrackElement } from "./types";
import { FramePanel } from "./component-FramePanel";
import { SoundDesignProposalPanel } from "./component-SoundDesignProposal";
import { PromptBar } from "./component-PromptBar";
import { SoundtrackPanel } from "./component-SoundtrackPanel";
import { Settings } from "./component-Settings";
import { hasApiSettings } from "./api";

type LayersByElement = Record<SoundtrackElement, Layer[]>;
type QueryByElement = Record<SoundtrackElement, string>;

const emptyLayers = (): LayersByElement => ({ ambientes: [], efectos: [], foley: [], dialogos: [] });

export default function App() {
  const [layers, setLayers] = useState<LayersByElement>(emptyLayers());
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [showSettings, setShowSettings] = useState(() => !hasApiSettings());
  const [settingsReady, setSettingsReady] = useState(() => hasApiSettings());
  const [queries, setQueries] = useState<QueryByElement>({
    ambientes: "", efectos: "", foley: "", dialogos: "",
  });

  function applyPromptToAll(prompt: string) {
    setQueries({ ambientes: prompt, efectos: prompt, foley: prompt, dialogos: prompt });
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>AUDIAR</h1>
          <span className="app__tagline">diseño sonoro a partir de un fotograma, en capas</span>
        </div>
        <div className="app__header-actions">
          <div className={`app__status ${settingsReady ? "is-ready" : "is-warning"}`}>{settingsReady ? "CONECTADO" : "CONFIGURAR"}</div>
          <button className="settings-button" onClick={() => setShowSettings(true)} aria-label="Abrir configuración">⚙</button>
        </div>
      </header>

      <main>
        <section className="stage">
          <div className="stage__eyebrow">01 · OBSERVAR</div>
          <h2 className="stage__title">Fotograma de referencia</h2>
          <p className="stage__description">Cargá una imagen de la escena para analizarla desde el punto de vista del diseño sonoro.</p>
          <FramePanel analysis={analysis} onAnalysisChange={setAnalysis} />
        </section>

        <section className="stage">
          <div className="stage__eyebrow">02 · DISEÑAR</div>
          <h2 className="stage__title">Propuesta de diseño sonoro</h2>
          <p className="stage__description">La IA propone ideas sonoras; vos podés editarlas, eliminarlas o agregar otras.</p>
          <SoundDesignProposalPanel analysis={analysis} />
        </section>

        <section className="stage">
          <div className="stage__eyebrow">03 · BUSCAR</div>
          <h2 className="stage__title">Búsqueda y selección</h2>
          <p className="stage__description">Explorá sonidos por categoría y agregalos a las capas del diseño.</p>
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
        </section>
      </main>

      <footer className="app__footer">AUDIAR · herramienta experimental de pre-diseño sonoro</footer>
      <Settings open={showSettings} onClose={() => setShowSettings(false)} onSaved={() => { setSettingsReady(hasApiSettings()); }} />
    </div>
  );
}
