export type Source = "freesound" | "soundly" | "generado";
export const SOURCES: { id: Source; label: string; ready: boolean; note?: string }[] = [
  { id: "freesound", label: "Freesound", ready: true },
  { id: "soundly", label: "Soundly", ready: false, note: "falta confirmar API" },
  { id: "generado", label: "Generado", ready: false, note: "falta conectar generador" },
];
interface Props { value: Source; onChange: (source: Source) => void; }
export function SourceSelector({ value, onChange }: Props) {
  return <div className="source-selector" role="radiogroup" aria-label="fuente de sonido">
    {SOURCES.map((s) => <button key={s.id} role="radio" aria-checked={value === s.id} disabled={!s.ready} className={value === s.id ? "is-active" : ""} title={s.note ?? s.label} onClick={() => s.ready && onChange(s.id)}>
      {s.label}{!s.ready && <span className="source-selector__soon">pronto</span>}
    </button>)}
  </div>;
}
