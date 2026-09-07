import { useState } from "react";
import type { ApiKeys } from "./api-keys";

interface Props {
  apiKeys: ApiKeys;
  onSave: (keys: ApiKeys) => void;
}

export function Settings({ apiKeys, onSave }: Props) {
  const [open, setOpen] = useState(!apiKeys.freesound && !apiKeys.groq);
  const [freesound, setFreesound] = useState(apiKeys.freesound ?? "");
  const [freesoundAccessToken, setFreesoundAccessToken] = useState(apiKeys.freesoundAccessToken ?? "");
  const [groq, setGroq] = useState(apiKeys.groq ?? "");

  const configured = !!apiKeys.freesound || !!apiKeys.groq || !!apiKeys.freesoundAccessToken;

  function handleSave() {
    onSave({
      freesound: freesound.trim() || undefined,
      freesoundAccessToken: freesoundAccessToken.trim() || undefined,
      groq: groq.trim() || undefined,
    });
    setOpen(false);
  }

  function handleClear() {
    setFreesound("");
    setFreesoundAccessToken("");
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
            Las credenciales quedan guardadas solo en este navegador. El token OAuth de Freesound es opcional: sin él,
            AUDIAR usa el preview MP3; con él, al enviar a REAPER el bridge local intenta descargar el archivo original.
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
            <span>Freesound OAuth access token (opcional)</span>
            <input
              type="password"
              value={freesoundAccessToken}
              onChange={(e) => setFreesoundAccessToken(e.target.value)}
              placeholder="pegar token OAuth"
              autoComplete="off"
            />
          </label>

          <p className="settings__hint">
            El acceso al archivo original de Freesound requiere OAuth2. Los tokens tienen una duración limitada.
          </p>

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
