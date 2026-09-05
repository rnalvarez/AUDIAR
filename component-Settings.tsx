import { useEffect, useState } from "react";
import { clearApiSettings, getApiSettings, saveApiSettings, type ApiSettings } from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function Settings({ open, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<ApiSettings>(getApiSettings());
  const [showGroq, setShowGroq] = useState(false);
  const [showFreesound, setShowFreesound] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSettings(getApiSettings());
      setMessage(null);
    }
  }, [open]);

  if (!open) return null;

  function update<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  function handleSave() {
    if (!settings.groqApiKey.trim()) {
      setMessage("Falta la API key de Groq.");
      return;
    }
    if (!settings.freesoundApiKey.trim()) {
      setMessage("Falta la API key de Freesound.");
      return;
    }
    saveApiSettings(settings);
    setMessage("Configuración guardada en este navegador.");
    onSaved();
  }

  function handleClear() {
    clearApiSettings();
    setSettings(getApiSettings());
    setMessage("Configuración eliminada de este navegador.");
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-panel__header">
          <div>
            <div className="settings-panel__eyebrow">CONFIGURACIÓN LOCAL</div>
            <h2 id="settings-title">Conectar AUDIAR</h2>
          </div>
          <button className="settings-panel__close" onClick={onClose} aria-label="Cerrar configuración">×</button>
        </header>

        <p className="settings-panel__intro">
          AUDIAR se conecta directamente desde este navegador con Groq y Freesound. No necesitás Cloudflare, un Worker ni una URL intermedia.
        </p>

        <label className="settings-field">
          <span>Groq API key</span>
          <div className="settings-secret">
            <input
              type={showGroq ? "text" : "password"}
              placeholder="gsk_..."
              value={settings.groqApiKey}
              onChange={(e) => update("groqApiKey", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setShowGroq((v) => !v)}>{showGroq ? "ocultar" : "mostrar"}</button>
          </div>
        </label>

        <label className="settings-field">
          <span>Freesound API key</span>
          <div className="settings-secret">
            <input
              type={showFreesound ? "text" : "password"}
              placeholder="tu clave de Freesound"
              value={settings.freesoundApiKey}
              onChange={(e) => update("freesoundApiKey", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setShowFreesound((v) => !v)}>{showFreesound ? "ocultar" : "mostrar"}</button>
          </div>
        </label>

        <div className="settings-panel__note">
          Las claves se guardan solamente en el almacenamiento local de este navegador y no se escriben en GitHub. Esta arquitectura es apropiada para uso personal; no compartas esta instancia si contiene tus credenciales.
        </div>

        {message && <p className="settings-panel__message">{message}</p>}

        <footer className="settings-panel__footer">
          <button className="settings-panel__clear" onClick={handleClear}>borrar configuración</button>
          <div className="settings-panel__buttons">
            <button className="settings-panel__cancel" onClick={onClose}>cancelar</button>
            <button className="settings-panel__save" onClick={handleSave}>guardar y usar AUDIAR</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
