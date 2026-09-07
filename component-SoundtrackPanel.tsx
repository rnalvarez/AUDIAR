import { useEffect, useState } from "react";
import type { Layer, SoundtrackElement } from "./types";
import type { ApiKeys } from "./api-keys";
import { searchFreesoundDirect } from "./direct-providers";
import { LayerStrip } from "./component-LayerStrip";
import { SourceSelector, type Source } from "./component-SourceSelector";

interface Props {
  elementId: SoundtrackElement;
  label: string;
  hint: string;
  query: string;
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
  apiKeys: ApiKeys;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function SoundtrackPanel({
  elementId,
  label,
  hint,
  query,
  layers,
  onLayersChange,
  apiKeys,
  selectedIds,
  onToggleSelect,
}: Props) {
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
      if (source !== "freesound") {
        setError(
          source === "soundly"
            ? "Soundly todavía no está conectado."
            : "Generado todavía no está conectado."
        );
        return;
      }

      if (!apiKeys.freesound?.trim()) {
        throw new Error("Configurá la API key de Freesound antes de buscar sonidos.");
      }

      const results = await searchFreesoundDirect(search, apiKeys.freesound);

      const newLayers: Layer[] = results.map((r) => ({
        id: `${source}-${r.id}`,
        name: r.name,
        license: r.license,
        commerciallySafe: r.commerciallySafe,
        durationSeconds: r.durationSeconds,
        audioUrl: r.previewUrl,
        freesoundUrl: r.freesoundUrl,
        tags: r.tags,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
      }));
      const existingIds = new Set(layers.map((l) => l.id));
      onLayersChange([...layers, ...newLayers.filter((l) => !existingIds.has(l.id))]);
    } catch (e: any) {
      setError(e.message ?? "no se pudo buscar");
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
            element={elementId}
            selected={selectedIds.has(layer.id)}
            onToggleSelect={() => onToggleSelect(layer.id)}
            onChange={(patch) => updateLayer(layer.id, patch)}
            onRemove={() => removeLayer(layer.id)}
          />
        ))}
      </div>
    </section>
  );
}
