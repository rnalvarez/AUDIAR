import type { Layer } from "./types";

interface Props {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  onRemove: () => void;
}

export function LayerStrip({ layer, onChange, onRemove }: Props) {
  return (
    <div className="layer-strip">
      <div className="layer-strip__top">
        <audio
          className="layer-strip__preview"
          src={layer.audioUrl}
          controls
          preload="none"
        />
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
        <button
          className={layer.muted ? "is-active" : ""}
          onClick={() => onChange({ muted: !layer.muted })}
        >
          M
        </button>
        <button
          className={layer.solo ? "is-active" : ""}
          onClick={() => onChange({ solo: !layer.solo })}
        >
          S
        </button>
      </div>
    </div>
  );
}
