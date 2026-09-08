import { useEffect, useRef, useState } from "react";
import type { FreesoundResultItem, Layer, SoundtrackElement } from "./types";
import { searchFreesoundDiverse } from "./scene-freesound";
import { layerToSendableSound } from "./reaper-bridge";
import type { ApiKeys } from "./api-keys";
import { stopAllAudioPreviews } from "./audio-preview-control";

interface Props {
  layer: Layer;
  element: SoundtrackElement;
  selected: boolean;
  otherSoloActive: boolean;
  onToggleSelect: () => void;
  onChange: (patch: Partial<Layer>) => void;
  onRemove: () => void;
  onAddResults: (results: FreesoundResultItem[], searchQuery?: string) => string[];
  onSelectIds: (ids: string[]) => void;
  apiKeys: ApiKeys;
  onSendToReaper: (sound: ReturnType<typeof layerToSendableSound>) => Promise<void>;
}

type SendState = "idle" | "connecting" | "sent" | "not-found" | "error";

function dbToLinear(db: number): number { return Math.pow(10, db / 20); }
function extractFreesoundId(id: string): number | null {
  const match = id.match(/(?:^|-)(?:freesound-(?:ambientes-|efectos-|foley-)?)(\d+)(?:-|$)/);
  return match ? Number(match[1]) : null;
}

export function LayerStrip({ layer, element, selected, otherSoloActive, onToggleSelect, onChange, onRemove, onAddResults, onSelectIds, apiKeys, onSendToReaper }: Props) {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [alternatives, setAlternatives] = useState<FreesoundResultItem[] | null>(null);
  const [searchingAlternatives, setSearchingAlternatives] = useState(false);
  const [alternativeError, setAlternativeError] = useState<string | null>(null);
  const [selectedAlternatives, setSelectedAlternatives] = useState<Set<number>>(new Set());
  const alternativePageRef = useRef(0);
  const shownAlternativeIdsRef = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    audio.crossOrigin = "anonymous";
    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.connect(gain); gain.connect(panner); panner.connect(context.destination);
    contextRef.current = context; gainRef.current = gain; pannerRef.current = panner;
    const resumeContext = () => { if (context.state === "suspended") void context.resume(); };
    audio.addEventListener("play", resumeContext);
    return () => {
      audio.removeEventListener("play", resumeContext);
      try { source.disconnect(); gain.disconnect(); panner.disconnect(); } catch {}
      void context.close(); contextRef.current = null; gainRef.current = null; pannerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const gain = gainRef.current; if (!gain) return;
    const shouldMute = layer.muted || (otherSoloActive && !layer.solo);
    gain.gain.value = shouldMute ? 0 : dbToLinear(layer.gainDb);
  }, [layer.gainDb, layer.muted, layer.solo, otherSoloActive]);
  useEffect(() => { const panner = pannerRef.current; if (panner) panner.pan.value = layer.pan; }, [layer.pan]);

  async function handleSendToReaper() {
    stopAllAudioPreviews();
    setSendState("connecting");
    try {
      await onSendToReaper(layerToSendableSound(layer, element));
      setSendState("sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar";
      setSendState(message.toLowerCase().includes("bridge") ? "not-found" : "error");
    }
  }

  async function handleAlternatives() {
    if (alternatives !== null) { setAlternatives(null); setAlternativeError(null); setSelectedAlternatives(new Set()); return; }
    if (!apiKeys.freesound?.trim()) { setAlternativeError("Configurá la API key de Freesound."); return; }
    setSearchingAlternatives(true); setAlternativeError(null);
    try {
      const query = layer.searchQuery?.trim() || layer.name;
      alternativePageRef.current += 1;
      const currentLayerId = extractFreesoundId(layer.id);
      if (currentLayerId !== null) shownAlternativeIdsRef.current.add(currentLayerId);
      let results = await searchFreesoundDiverse(query, apiKeys.freesound, alternativePageRef.current, 6, shownAlternativeIdsRef.current);
      let attempts = 0;
      while (results.length < 3 && attempts < 2) {
        alternativePageRef.current += 1; attempts += 1;
        const more = await searchFreesoundDiverse(query, apiKeys.freesound, alternativePageRef.current, 6, new Set([...shownAlternativeIdsRef.current, ...results.map((item) => item.id)]));
        results = [...results, ...more];
      }
      results.forEach((result) => shownAlternativeIdsRef.current.add(result.id));
      setAlternatives(results.slice(0, 6)); setSelectedAlternatives(new Set());
    } catch (e: any) { setAlternativeError(e.message ?? "no se pudieron buscar otros sonidos"); }
    finally { setSearchingAlternatives(false); }
  }

  function toggleAlternative(id: number) { setSelectedAlternatives((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function addSelectedAlternatives() {
    if (!alternatives) return;
    const selected = alternatives.filter((result) => selectedAlternatives.has(result.id));
    if (selected.length === 0) return;
    const addedIds = onAddResults(selected, layer.searchQuery?.trim() || layer.name);
    onSelectIds(addedIds); setAlternatives(null); setSelectedAlternatives(new Set());
  }

  const sendLabel: Record<SendState, string> = { idle: "Enviar a REAPER", connecting: "Enviando al bridge...", sent: "Enviado al grupo ✓", "not-found": "No se encontró REAPER Bridge", error: "No se pudo enviar" };
  return (
    <div className="layer-strip">
      <div className="layer-strip__top">
        <input type="checkbox" className="layer-strip__select" checked={selected} onChange={onToggleSelect} aria-label={`Seleccionar ${layer.name}`} />
        <audio ref={audioRef} className="layer-strip__preview" src={layer.audioUrl} controls loop preload="none" />
        <button className="layer-strip__remove" onClick={onRemove} aria-label={`Quitar ${layer.name}`}>×</button>
      </div>
      <div className="layer-strip__name" title={layer.name}>{layer.name}</div>
      <span className={`layer-strip__badge ${layer.commerciallySafe ? "is-safe" : "is-unsafe"}`} title={layer.license}>{layer.commerciallySafe ? "uso comercial OK" : "solo no comercial"}</span>
      <div className="layer-strip__controls" aria-label={`Controles de ${layer.name}`}>
        <label className="layer-strip__row"><span>vol</span><input type="range" min={-60} max={6} step={0.5} value={layer.gainDb} onChange={(e) => onChange({ gainDb: Number(e.target.value) })} /><span className="layer-strip__value">{layer.gainDb.toFixed(1)}dB</span></label>
        <label className="layer-strip__row"><span>pan</span><input type="range" min={-1} max={1} step={0.1} value={layer.pan} onChange={(e) => onChange({ pan: Number(e.target.value) })} /><span className="layer-strip__value">{layer.pan === 0 ? "C" : layer.pan < 0 ? `${Math.abs(layer.pan * 100).toFixed(0)}L` : `${(layer.pan * 100).toFixed(0)}R`}</span></label>
        <div className="layer-strip__row layer-strip__mute-solo"><button className={layer.muted ? "is-active" : ""} onClick={() => onChange({ muted: !layer.muted })} aria-pressed={layer.muted}>M</button><button className={layer.solo ? "is-active" : ""} onClick={() => onChange({ solo: !layer.solo })} aria-pressed={layer.solo}>S</button></div>
      </div>
      <div className="layer-strip__alternatives">
        <div className="layer-strip__alternatives-head"><button className="layer-strip__alternatives-btn" onClick={handleAlternatives} disabled={searchingAlternatives}>{searchingAlternatives ? "Buscando..." : alternatives ? "ocultar otros" : "otros sonidos"}</button>{alternatives && <button className="layer-strip__alternatives-close" onClick={handleAlternatives} aria-label="Cerrar otros sonidos">×</button>}</div>
        {alternativeError && <p className="layer-strip__alternative-error">{alternativeError}</p>}
        {alternatives && <div className="layer-strip__alternative-list">
          {alternatives.length === 0 && <p className="layer-strip__alternative-empty">sin otras opciones</p>}
          {alternatives.map((result) => { const checked = selectedAlternatives.has(result.id); return <div key={result.id} className={`layer-strip__alternative ${checked ? "is-selected" : ""}`}><input type="checkbox" checked={checked} onChange={() => toggleAlternative(result.id)} aria-label={`Seleccionar ${result.name}`} /><audio src={result.previewUrl} controls loop preload="none" /><span title={result.name}>{result.name}</span></div>; })}
          {selectedAlternatives.size > 0 && <button className="layer-strip__add-selected" onClick={addSelectedAlternatives}>sumar seleccionados al diseño ({selectedAlternatives.size})</button>}
        </div>}
      </div>
      <button className={`layer-strip__reaper-btn reaper-state-${sendState}`} onClick={() => void handleSendToReaper()} disabled={sendState === "connecting"}>{sendLabel[sendState]}</button>
    </div>
  );
}
