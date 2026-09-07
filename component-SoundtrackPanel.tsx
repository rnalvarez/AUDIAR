import { useState } from "react";
import type { FreesoundResultItem, Layer, SoundtrackElement } from "./types";
import type { ApiKeys } from "./api-keys";
import { searchFreesoundDirect } from "./direct-providers";
import { LayerStrip } from "./component-LayerStrip";
import { SourceSelector, type Source } from "./component-SourceSelector";

interface Props {
  elementId: SoundtrackElement;
  label: string;
  hint: string;
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
  apiKeys: ApiKeys;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onSetCategorySelection: (selectAll: boolean) => void;
  globalSoloActive: boolean;
}

export function SoundtrackPanel({
  elementId,
  label,
  hint,
  layers,
  onLayersChange,
  apiKeys,
  selectedIds,
  onToggleSelect,
  onSelectIds,
  onSetCategorySelection,
  globalSoloActive,
}: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("freesound");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (source !== "freesound") {
        setError(source === "soundly" ? "Soundly todavía no está conectado." : "Generado todavía no está conectado.");
        return;
      }
      if (!apiKeys.freesound?.trim()) throw new Error("Configurá la API key de Freesound antes de buscar sonidos.");
      const results = await searchFreesoundDirect(search, apiKeys.freesound);
      addResults(results, search.trim());
    } catch (e: any) {
      setError(e.message ?? "no se pudo buscar");
    } finally {
      setLoading(false);
    }
  }

  function createLayer(result: FreesoundResultItem, searchQuery = search.trim()): Layer {
    return {
      id: `freesound-${elementId}-${result.id}-${crypto.randomUUID()}`,
      name: result.name,
      license: result.license,
      commerciallySafe: result.commerciallySafe,
      durationSeconds: result.durationSeconds,
      audioUrl: result.previewUrl,
      freesoundUrl: result.freesoundUrl,
      freesoundId: result.id,
      originalFilename: result.originalFilename,
      originalType: result.originalType,
      sampleRate: result.sampleRate,
      bitDepth: result.bitDepth,
      fileSize: result.fileSize,
      tags: result.tags,
      searchQuery,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
    };
  }

  function addResults(results: FreesoundResultItem[], searchQuery = search.trim()): string[] {
    const existingSourceIds = new Set(
      layers.map((layer) => layer.freesoundUrl?.match(/sound\\/(\\d+)\\//)?.[1]).filter(Boolean)
    );
    const newLayers = results.filter((result) => !existingSourceIds.has(String(result.id))).map((result) => createLayer(result, searchQuery));
    if (newLayers.length > 0) onLayersChange([...layers, ...newLayers]);
    return newLayers.map((layer) => layer.id);
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLayer(id: string) {
    onLayersChange(layers.filter((l) => l.id !== id));
  }

  const selectedCount = layers.filter((layer) => selectedIds.has(layer.id)).length;
  const allSelected = layers.length > 0 && selectedCount === layers.length;

  return (
    <section className="panel" aria-labelledby={`panel-${elementId}`}>
      <header className="panel__header">
        <div className="panel__header-main">
          <div><h2 id={`panel-${elementId}`}>{label}</h2><span className="panel__hint">{hint}</span></div>
          <button className={`panel__select-all ${allSelected ? "is-active" : ""}`} type="button" onClick={() => onSetCategorySelection(!allSelected)} disabled={layers.length === 0} aria-pressed={allSelected}>{allSelected ? "deseleccionar todos" : "seleccionar todos"}</button>
        </div>
      </header>
      <SourceSelector value={source} onChange={setSource} />
      <div className="panel__search">
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="describí el sonido..." />
        <button onClick={handleSearch} disabled={loading}>{loading ? "..." : "buscar"}</button>
      </div>
      {error && <p className="panel__error">{error}</p>}
      <div className="panel__layers">
        {layers.length === 0 && !loading && <p className="panel__empty">sin capas todavía</p>}
        {layers.map((layer) => (
          <LayerStrip key={layer.id} layer={layer} element={elementId} selected={selectedIds.has(layer.id)} otherSoloActive={globalSoloActive && !layer.solo} onToggleSelect={() => onToggleSelect(layer.id)} onChange={(patch) => updateLayer(layer.id, patch)} onRemove={() => removeLayer(layer.id)} onAddResults={addResults} onSelectIds={onSelectIds} apiKeys={apiKeys} />
        ))}
      </div>
    </section>
  );
}
