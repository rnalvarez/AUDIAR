import { useState } from "react";
import type { ApiKeys } from "./api-keys";

interface Props {
  apiKeys: ApiKeys;
  onSave: (keys: ApiKeys) => void;
}

/**
 * "Al comienzo" de la app, como pediste. Guardar acá hace que FramePanel,
 * SoundDesignProposalPanel y SoundtrackPanel llamen a Freesound/Groq
 * directo desde el navegador (ver direct-providers.ts) en vez de pegarle
 * al Worker — pensado para uso personal, con las keys guardadas solo en
 * este navegador (localStorage), nunca en un servidor propio.
 */
export function Settings({ apiKeys, onSave }: Props) {
  const [open, setOpen] = useState(!apiKeys.freesound && !apiKeys.groq);
  const [freesound, setFreesound] = useState(apiKeys.freesound ?? "");
  const [groq, setGroq] = useState(apiKeys.groq ?? "");

  const configured = !!apiKeys.freesound || !!apiKeys.groq;

  function handleSave() {
    onSave({ freesound: freesound.trim() || undefined, groq: groq.trim() || undefined });
    setOpen(false);
  }

  function handleClear() {
    setFreesound("");
    setGroq("");
    onSave({});
  }

  return (
    <div className="settings">
      <button className="settings__toggle" onClick={() => setOpen((v) => !v)}>
        {configured ? "API keys: configuradas ⚙" : "Configurar API keys"}
      </button>

      {open && (
        <div className="settings__panel">
          <p className="settings__hint">
            Cargá tus propias claves para usar AUDIAR directo desde el navegador, sin correr ni desplegar el Worker.
            Quedan guardadas solo en este navegador — pensado para uso personal, no para compartir el link con otras
            personas.
          </p>

          <label className="settings__field">
            <span>Freesound API key</span>
            <input
              type="password"
              value={freesound}
              onChange={(e) => setFreesound(e.target.value)}
              placeholder="pegar acá"
              autoComplete="off"
            />
          </label>

          <label className="settings__field">
            <span>Groq API key</span>
            <input
              type="password"
              value={groq}
              onChange={(e) => setGroq(e.target.value)}
              placeholder="pegar acá"
              autoComplete="off"
            />
          </label>

          <div className="settings__actions">
            <button className="settings__save-btn" onClick={handleSave}>
              Guardar
            </button>
            {configured && (
              <button className="settings__clear-btn" onClick={handleClear}>
                Olvidar claves
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
