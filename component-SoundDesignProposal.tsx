import { useState } from "react";
import type {
  Certainty,
  FreesoundResultItem,
  Layer,
  Priority,
  ProposalCategory,
  SceneAnalysis,
  SoundDesignProposal,
  SoundIdea,
} from "./types";
import type { ApiKeys } from "./api-keys";
import { generateSoundDesignProposalDirect, searchFreesoundDirect } from "./direct-providers";

const CATEGORY_LABEL: Record<ProposalCategory, string> = {
  ambientes: "Ambientes",
  efectos: "Efectos",
  foley: "Foley",
  dialogos: "Diálogos",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  primary: "primario",
  secondary: "secundario",
  accent: "acento",
};

const CERTAINTY_LABEL: Record<Certainty, string> = {
  observed: "observado",
  probable: "probable",
  possible: "creativo",
};

const CATEGORIES: ProposalCategory[] = ["ambientes", "efectos", "foley", "dialogos"];

function emptyIdea(category: ProposalCategory): SoundIdea {
  return {
    id: `${category}-manual-${crypto.randomUUID()}`,
    category,
    description: "",
    rationale: "",
    certainty: "possible",
    priority: "secondary",
    searchQuery: "",
    expanded: true,
  };
}

function resultToLayer(result: FreesoundResultItem): Layer {
  return {
    id: `freesound-${result.id}`,
    name: result.name,
    license: result.license,
    commerciallySafe: result.commerciallySafe,
    durationSeconds: result.durationSeconds,
    audioUrl: result.previewUrl,
    freesoundUrl: result.freesoundUrl,
    tags: result.tags,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
  };
}

function hasWorkWorthKeeping(proposal: SoundDesignProposal | null): boolean {
  if (!proposal) return false;
  return CATEGORIES.some((c) => proposal[c].some((idea) => idea.id.includes("-manual-") || !!idea.searchResults));
}

interface Props {
  analysis: SceneAnalysis | null;
  onAddLayer: (category: ProposalCategory, layer: Layer) => void;
  apiKeys: ApiKeys;
}

export function SoundDesignProposalPanel({ analysis, onAddLayer, apiKeys }: Props) {
  const [proposal, setProposal] = useState<SoundDesignProposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!analysis) return;
    if (
      hasWorkWorthKeeping(proposal) &&
      !window.confirm("Esto reemplaza la propuesta actual, incluyendo búsquedas ya hechas y propuestas agregadas a mano. ¿Continuar?")
    ) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      if (!apiKeys.groq?.trim()) {
        throw new Error("Configurá la API key de Groq antes de generar la propuesta.");
      }
      setProposal(await generateSoundDesignProposalDirect(analysis, apiKeys.groq));
    } catch (e: any) {
      setError(e.message ?? "no se pudo generar la propuesta");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(category: ProposalCategory, id: string, patch: Partial<SoundIdea>) {
    setProposal((prev) => {
      if (!prev) return prev;
      return { ...prev, [category]: prev[category].map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    });
  }

  function removeItem(category: ProposalCategory, id: string) {
    setProposal((prev) => {
      if (!prev) return prev;
      return { ...prev, [category]: prev[category].filter((p) => p.id !== id) };
    });
  }

  function addItem(category: ProposalCategory) {
    setProposal((prev) => {
      const base = prev ?? { ambientes: [], efectos: [], foley: [], dialogos: [] };
      return { ...base, [category]: [...base[category], emptyIdea(category)] };
    });
  }

  async function handleSearch(category: ProposalCategory, idea: SoundIdea) {
    if (!idea.searchQuery.trim()) return;
    updateItem(category, idea.id, { searching: true, searchError: undefined });
    try {
      if (!apiKeys.freesound?.trim()) {
        throw new Error("Configurá la API key de Freesound antes de buscar sonidos.");
      }
      const results = await searchFreesoundDirect(idea.searchQuery, apiKeys.freesound);
      updateItem(category, idea.id, { searchResults: results, searching: false });
    } catch (e: any) {
      updateItem(category, idea.id, { searchError: e.message ?? "no se pudo buscar", searching: false });
    }
  }

  function handleAddToDesign(category: ProposalCategory, idea: SoundIdea, result: FreesoundResultItem) {
    onAddLayer(category, resultToLayer(result));
    setProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [category]: prev[category].map((p) =>
          p.id === idea.id
            ? { ...p, searchResults: p.searchResults?.map((r) => (r.id === result.id ? { ...r, added: true } : r)) }
            : p
        ),
      };
    });
  }

  if (!analysis) return null;

  return (
    <div className="proposal-panel">
      <h2 className="section-title">Propuesta de diseño sonoro</h2>

      <button className="proposal-panel__generate-btn" onClick={handleGenerate} disabled={generating}>
        {generating ? "Pensando..." : proposal ? "Proponer de nuevo" : "Proponer sonidos"}
      </button>
      {error && <p className="proposal-panel__error">{error}</p>}

      {proposal && (
        <div className="proposal-panel__categories">
          {CATEGORIES.map((category) => (
            <div key={category} className="proposal-panel__category">
              <div className="proposal-panel__category-title">{CATEGORY_LABEL[category]}</div>

              {proposal[category].length === 0 && (
                <p className="proposal-panel__empty">sin propuestas todavía</p>
              )}

              {proposal[category].map((item) => (
                <div key={item.id} className={`proposal-item priority-${item.priority}`}>
                  {item.expanded ? (
                    <>
                      <div className="proposal-item__row">
                        <input
                          className="proposal-item__description"
                          value={item.description}
                          placeholder="descripción del sonido"
                          autoFocus={!item.description}
                          onChange={(e) => updateItem(category, item.id, { description: e.target.value })}
                        />
                        <button
                          className="proposal-item__remove"
                          onClick={() => removeItem(category, item.id)}
                          aria-label="Eliminar propuesta"
                        >
                          ×
                        </button>
                      </div>

                      <div className="proposal-item__row">
                        <select
                          className={`proposal-item__priority priority-${item.priority}`}
                          value={item.priority}
                          onChange={(e) => updateItem(category, item.id, { priority: e.target.value as Priority })}
                        >
                          <option value="primary">{PRIORITY_LABEL.primary}</option>
                          <option value="secondary">{PRIORITY_LABEL.secondary}</option>
                          <option value="accent">{PRIORITY_LABEL.accent}</option>
                        </select>
                        <select
                          className={`proposal-item__certainty certainty-${item.certainty}`}
                          value={item.certainty}
                          onChange={(e) => updateItem(category, item.id, { certainty: e.target.value as Certainty })}
                        >
                          <option value="observed">{CERTAINTY_LABEL.observed}</option>
                          <option value="probable">{CERTAINTY_LABEL.probable}</option>
                          <option value="possible">{CERTAINTY_LABEL.possible}</option>
                        </select>
                      </div>

                      <input
                        className="proposal-item__rationale"
                        value={item.rationale}
                        placeholder="por qué encaja en la escena..."
                        onChange={(e) => updateItem(category, item.id, { rationale: e.target.value })}
                      />
                      <input
                        className="proposal-item__perspective"
                        value={item.spatialPerspective ?? ""}
                        placeholder="perspectiva espacial (opcional)"
                        onChange={(e) => updateItem(category, item.id, { spatialPerspective: e.target.value })}
                      />
                      <input
                        className="proposal-item__search-query"
                        value={item.searchQuery}
                        placeholder="search query (inglés)"
                        onChange={(e) => updateItem(category, item.id, { searchQuery: e.target.value })}
                      />

                      <div className="proposal-item__row proposal-item__row--end">
                        <button
                          className="proposal-item__collapse-btn"
                          onClick={() => updateItem(category, item.id, { expanded: false })}
                        >
                          listo
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="proposal-item__row">
                      <button
                        className="proposal-item__description-text"
                        onClick={() => updateItem(category, item.id, { expanded: true })}
                      >
                        {item.description || "sin descripción"}
                      </button>
                      <span className={`proposal-item__tag certainty-${item.certainty}`}>
                        {CERTAINTY_LABEL[item.certainty]}
                      </span>
                    </div>
                  )}

                  {!item.expanded && (
                    <div className="proposal-item__row">
                      <button
                        className="proposal-item__edit-btn"
                        onClick={() => updateItem(category, item.id, { expanded: true })}
                      >
                        editar
                      </button>
                      <button
                        className="proposal-item__search-btn"
                        onClick={() => handleSearch(category, item)}
                        disabled={item.searching || !item.searchQuery.trim()}
                      >
                        {item.searching ? "..." : "Buscar sonidos"}
                      </button>
                    </div>
                  )}

                  {item.searchError && <p className="proposal-item__search-error">{item.searchError}</p>}

                  {item.searchResults && (
                    <div className="proposal-item__results">
                      {item.searchResults.length === 0 && (
                        <p className="proposal-panel__empty">sin resultados</p>
                      )}
                      {item.searchResults.map((r) => (
                        <div key={r.id} className="proposal-item__result">
                          <audio src={r.previewUrl} controls preload="none" />
                          <span className="proposal-item__result-name" title={r.name}>
                            {r.name}
                          </span>
                          <span className={`layer-strip__badge ${r.commerciallySafe ? "is-safe" : "is-unsafe"}`}>
                            {r.commerciallySafe ? "uso comercial OK" : "solo no comercial"}
                          </span>
                          <button
                            className="proposal-item__add-layer-btn"
                            disabled={r.added}
                            onClick={() => handleAddToDesign(category, item, r)}
                          >
                            {r.added ? `Agregada a ${CATEGORY_LABEL[category]} ✓` : "Agregar a diseño"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button className="proposal-panel__add-btn" onClick={() => addItem(category)}>
                + agregar propuesta
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
