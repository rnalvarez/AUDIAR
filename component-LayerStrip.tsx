import { useState } from "react";
import type { FreesoundResultItem, Layer, SoundtrackElement } from "./types";
import { searchFreesoundDirect } from "./direct-providers";
import { layerToSendableSound, sendToReaperBridge } from "./reaper-bridge";
import type { ApiKeys } from "./api-keys";

interface Props {
  layer: Layer;
  element: SoundtrackElement;
  selected: boolean;
  onToggleSelect: () => void;
  onChange: (patch: Partial<Layer>) => void;
  onRemove: () => void;
  apiKeys: ApiKeys;
}

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

export function LayerStrip({ layer, element, selected, onToggleSelect, onChange, onRemove, apiKeys }: Props) {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [alternatives, setAlternatives] = useState<FreesoundResultItem[] | null>(null);
  const [searchingAlternatives, setSearchingAlternatives] = useState(false);
  const [alternativeError, setAlternativeError] = useState<string | null>(null);

  async function handleSendToReaper() {
    setSendState("connecting");
    const result = await sendToReaperBridge([layerToSendableSound(layer, element)]);
    if (result.ok) {
      setSendState("sent");
    } else if (result.notFound) {
      setSendState("not-found");
    } else {
      setSendState("error");
    }
  }

  async function handleAlternatives() {
    if (!apiKeys.freesound?.trim()) {
      setAlternativeError("Configurá la API key de Freesound.");
      return;
    }
    setSearchingAlternatives(true);
    setAlternativeError(null);
    try {
      const query = layer.searchQuery?.trim() || layer.name;
      const results = await searchFreesoundDirect(query, apiKeys.freesound, 5);
      setAlternatives(results.filter((result) => result.previewUrl && result.id !== extractFreesoundId(layer.id)));
    } catch (e: any) {
      setAlternativeError(e.message ?? "no se pudieron buscar alternativas");
    } finally {
      setSearchingAlternatives(false);
    }
  }

  function extractFreesoundId(id: string): number | null {
    const match = id.match(/(?:^|-)freesound-(?:ambientes-|efectos-|foley-)?(\d+)(?:-|$)/);
    return match ? Number(match[1]) : null;
  }

  function replaceWithAlternative(result: FreesoundResultItem) {
    onChange({
      name: result.name,
      license: result.license,
      commerciallySafe: result.commerciallySafe,
      durationSeconds: result.durationSeconds,
      audioUrl: result.previewUrl,
      freesoundUrl: result.freesoundUrl,
      tags: result.tags,
    });
    setAlternatives(null);
  }

  const sendLabel: Record<SendState, string> = {
    idle: "Enviar a REAPER",
    connecting: "Conectando con REAPER...",
    sent: "Enviado a REAPER ✓",
    "not-found": "No se encontró REAPER Bridge",
    error: "No se pudo enviar",
  };

  return (
    <div className="layer-strip">
      <div className="layer-strip__top">
        <input
          type="checkbox"
          className="layer-strip__select"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Seleccionar ${layer.name}`}
        />
        <audio className="layer-strip__preview" src={layer.audioUrl} controls preload="none" />
        <button className="layer-strip__remove" onClick={onRemove} aria-label={`Quitar ${layer.name}`}>
          ×
        </button>
      </div>

      <div className="layer-strip__name" title={layer.name}>
        {layer.name}
      </div>

      <span
        className={`layer-strip__badge ${layer.commerciallySafe ? "is-safe" : "is-unsafe"}`}
        title={layer.license}
      >
        {layer.commerciallySafe ? "uso comercial OK" : "solo no comercial"}
      </span>

      <div className="layer-strip__alternatives">
        <button className="layer-strip__alternatives-btn" onClick={handleAlternatives} disabled={searchingAlternatives}>
          {searchingAlternatives ? "Buscando..." : alternatives ? "ocultar otros" : "otros sonidos"}
        </button>
        {alternativeError && <p className="layer-strip__alternative-error">{alternativeError}</p>}
        {alternatives && (
          <div className="layer-strip__alternative-list">
            {alternatives.length === 0 && <p className="layer-strip__alternative-empty">sin otras opciones</p>}
            {alternatives.map((result) => (
              <div key={result.id} className="layer-strip__alternative">
                <audio src={result.previewUrl} controls preload="none" />
                <span title={result.name}>{result.name}</span>
                <button onClick={() => replaceWithAlternative(result)}>usar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="layer-strip__row">
        <span>vol</span>
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={layer.gainDb}
          onChange={(e) => onChange({ gainDb: Number(e.target.value) })}
        />
        <span className="layer-strip__value">{layer.gainDb.toFixed(1)}dB</span>
      </label>

      <label className="layer-strip__row">
        <span>pan</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.1}
          value={layer.pan}
          onChange={(e) => onChange({ pan: Number(e.target.value) })}
        />
        <span className="layer-strip__value">{layer.pan === 0 ? "C" : layer.pan < 0 ? `${Math.abs(layer.pan * 100).toFixed(0)}L` : `${(layer.pan * 100).toFixed(0)}R`}</span>
      </label>

      <div className="layer-strip__row layer-strip__mute-solo">
        <button className={layer.muted ? "is-active" : ""} onClick={() => onChange({ muted: !layer.muted })}>M</button>
        <button className={layer.solo ? "is-active" : ""} onClick={() => onChange({ solo: !layer.solo })}>S</button>
      </div>

      <button
        className={`layer-strip__reaper-btn reaper-state-${sendState}`}
        onClick={handleSendToReaper}
        disabled={sendState === "connecting"}
      >
        {sendLabel[sendState]}
      </button>
    </div>
  );
}
