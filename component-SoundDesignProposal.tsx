import { useState } from "react";
import type { Certainty, ProposalCategory, SceneAnalysis, SoundDesignProposal, SoundProposal } from "./types";

const CATEGORY_LABEL: Record<ProposalCategory, string> = {
  ambientes: "Ambientes",
  efectos: "Efectos",
  foley: "Foley",
  dialogos: "Diálogos",
};

const CATEGORIES: ProposalCategory[] = ["ambientes", "efectos", "foley", "dialogos"];

function emptyProposal(category: ProposalCategory): SoundProposal {
  return {
    id: `${category}-manual-${crypto.randomUUID()}`,
    category,
    description: "",
    rationale: "",
    certainty: "possible",
  };
}

interface Props {
  analysis: SceneAnalysis | null;
}

/**
 * Segunda etapa del pipeline: SceneAnalysis -> SoundDesignProposal.
 * A propósito NO llama a Freesound ni a ningún generador de audio todavía
 * — el resultado queda como estado editable en el cliente hasta que esa
 * conexión se sume en una etapa aparte.
 */
export function SoundDesignProposalPanel({ analysis }: Props) {
  const [proposal, setProposal] = useState<SoundDesignProposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!analysis) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/design/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
      setProposal(data as SoundDesignProposal);
    } catch (e: any) {
      setError(e.message ?? "no se pudo generar la propuesta");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(category: ProposalCategory, id: string, patch: Partial<SoundProposal>) {
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
      return { ...base, [category]: [...base[category], emptyProposal(category)] };
    });
  }

  if (!analysis) return null;

  return (
    <div className="proposal-panel">
      <button className="proposal-panel__generate-btn" onClick={handleGenerate} disabled={generating}>
        {generating ? "pensando el diseño sonoro..." : proposal ? "volver a generar" : "generar propuesta de diseño sonoro"}
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
                <div key={item.id} className="proposal-item">
                  <div className="proposal-item__row">
                    <input
                      className="proposal-item__description"
                      value={item.description}
                      placeholder="descripción del sonido"
                      onChange={(e) => updateItem(category, item.id, { description: e.target.value })}
                    />
                    <select
                      className={`proposal-item__certainty certainty-${item.certainty}`}
                      value={item.certainty}
                      onChange={(e) => updateItem(category, item.id, { certainty: e.target.value as Certainty })}
                    >
                      <option value="observed">observado</option>
                      <option value="probable">probable</option>
                      <option value="possible">posible</option>
                    </select>
                    <button
                      className="proposal-item__remove"
                      onClick={() => removeItem(category, item.id)}
                      aria-label="Eliminar propuesta"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    className="proposal-item__rationale"
                    value={item.rationale}
                    placeholder="por qué encaja en la escena..."
                    onChange={(e) => updateItem(category, item.id, { rationale: e.target.value })}
                  />
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
