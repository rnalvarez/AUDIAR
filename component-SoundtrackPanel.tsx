import { useEffect, useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import { LayerStrip } from "./component-LayerStrip";
import { SourceSelector, type Source } from "./component-SourceSelector";
import { apiFetch } from "./api";

interface Props {
  elementId: SoundtrackElement;
  label: string;
  hint: string;
  query: string;
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
}

interface SearchApiLayer {
  id: number | string;
  name: string;
  license: string;
  commerciallySafe: boolean;
  durationSeconds: number;
  previewUrl?: string;
  audioUrl?: string;
  freesoundUrl?: string;
  tags?: string[];
}

const SEARCH_ENDPOINT: Record<Extract<Source, "freesound" | "soundly">, string> = {
  freesound: "/api/search/freesound",
  soundly: "/api/search/soundly",
};

export function SoundtrackPanel({ elementId, label, hint, query, layers, onLayersChange }: Props) {
  const [search, setSearch] = useState(query);
  const [source, setSource] = useState<Source>("freesound");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(query);
  }, [query]);

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (source === "generado") {
        throw new Error("Generado todavía no está conectado.");
      }

      const params = new URLSearchParams({ query: search, element: elementId });
      const res = await apiFetch(`${SEARCH_ENDPOINT[source]}?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);

      const newLayers: Layer[] = (data.results as SearchApiLayer[]).map((r) => ({
        id: `${source}-${r.id}`,
        element: elementId,
        source,
        name: r.name,
        license: r.license,
        commerciallySafe: r.commerciallySafe,
        durationSeconds: r.durationSeconds,
        audioUrl: r.previewUrl ?? r.audioUrl ?? "",
        freesoundUrl: r.freesoundUrl,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
      }));
      const existingIds = new Set(layers.map((l) => l.id));
      onLayersChange([...layers, ...newLayers.filter((l) => !existingIds.has(l.id))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo buscar");
    } finally {
      setLoading(false);
    }
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLayer(id: string) {
    onLayersChange(layers.filter((l) => l.id !== id));
  }

  return (
    <section className="panel" aria-labelledby={`panel-${elementId}`}>
      <header className="panel__header">
        <h2 id={`panel-${elementId}`}>{label}</h2>
        <span className="panel__hint">{hint}</span>
      </header>

      <SourceSelector value={source} onChange={setSource} />

      <div className="panel__search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="describí el sonido..."
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? "..." : "buscar"}
        </button>
      </div>
      {error && <p className="panel__error">{error}</p>}

      <div className="panel__layers">
        {layers.length === 0 && !loading && <p className="panel__empty">sin capas todavía</p>}
        {layers.map((layer) => (
          <LayerStrip
            key={layer.id}
            layer={layer}
            onChange={(patch) => updateLayer(layer.id, patch)}
            onRemove={() => removeLayer(layer.id)}
          />
        ))}
      </div>
    </section>
  );
}
