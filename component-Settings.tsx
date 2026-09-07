import { useEffect, useState } from "react";
import type { ApiKeys } from "./api-keys";

const BRIDGE_URL = "http://localhost:8765";

interface Props {
  apiKeys: ApiKeys;
  onSave: (keys: ApiKeys) => void;
}

type OAuthStatus = { connected: boolean; configured: boolean; expiresAt?: number; error?: string };

export function Settings({ apiKeys, onSave }: Props) {
  const [open, setOpen] = useState(!apiKeys.freesound && !apiKeys.groq);
  const [freesound, setFreesound] = useState(apiKeys.freesound ?? "");
  const [freesoundClientId, setFreesoundClientId] = useState(apiKeys.freesoundClientId ?? "");
  const [freesoundClientSecret, setFreesoundClientSecret] = useState("");
  const [groq, setGroq] = useState(apiKeys.groq ?? "");
  const [oauth, setOauth] = useState<OAuthStatus>({ connected: false, configured: false });
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  const configured = !!apiKeys.freesound || !!apiKeys.groq || !!apiKeys.freesoundClientId || oauth.connected;

  useEffect(() => {
    let active = true;
    fetch(`${BRIDGE_URL}/oauth/status`)
      .then((res) => res.json())
      .then((data) => {
        if (active) setOauth(data);
      })
      .catch(() => {
        // El bridge puede no estar iniciado todavía.
      });
    return () => {
      active = false;
    };
  }, []);

  function handleSave() {
    onSave({
      freesound: freesound.trim() || undefined,
      freesoundClientId: freesoundClientId.trim() || undefined,
      groq: groq.trim() || undefined,
    });
    setOpen(false);
  }

  async function connectFreesound() {
    setOauthBusy(true);
    setOauthMessage(null);
    try {
      const clientId = freesoundClientId.trim();
      const clientSecret = freesoundClientSecret.trim();
      if (!clientId || !clientSecret) {
        throw new Error("Cargá Client ID y Client Secret de Freesound.");
      }

      onSave({
        freesound: freesound.trim() || undefined,
        freesoundClientId: clientId,
        groq: groq.trim() || undefined,
      });

      const configuredResponse = await fetch(`${BRIDGE_URL}/oauth/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const configuredData = await configuredResponse.json().catch(() => ({}));
      if (!configuredResponse.ok) throw new Error(configuredData.error ?? "No se pudieron guardar las credenciales OAuth en el bridge.");

      const startResponse = await fetch(`${BRIDGE_URL}/oauth/start`);
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !startData.authorizationUrl) {
        throw new Error(startData.error ?? "No se pudo iniciar la conexión con Freesound.");
      }

      const popup = window.open(startData.authorizationUrl, "freesound-oauth", "width=700,height=800,resizable=yes,scrollbars=yes");
      if (!popup) {
        window.location.href = startData.authorizationUrl;
        return;
      }

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.source !== "audiar-freesound-oauth") return;
        window.removeEventListener("message", onMessage);
        if (event.data.ok) {
          setOauth({ connected: true, configured: true, expiresAt: event.data.expiresAt });
          setOauthMessage("Freesound conectado. Los originales estarán disponibles al enviar a REAPER.");
        } else {
          setOauthMessage(event.data.error ?? "No se pudo completar la autorización.");
        }
        setOauthBusy(false);
        setFreesoundClientSecret("");
      };
      window.addEventListener("message", onMessage);

      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        setOauthBusy(false);
        void fetch(`${BRIDGE_URL}/oauth/status`)
          .then((res) => res.json())
          .then((data) => setOauth(data))
          .catch(() => undefined);
      }, 120000);
      void timeout;
    } catch (error: any) {
      setOauthMessage(error?.message ?? "No se pudo conectar con Freesound.");
      setOauthBusy(false);
    }
  }

  async function disconnectFreesound() {
    setOauthBusy(true);
    setOauthMessage(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/oauth/disconnect`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo desconectar Freesound.");
      setOauth({ connected: false, configured: data.configured ?? Boolean(freesoundClientId) });
      setOauthMessage("Freesound desconectado.");
    } catch (error: any) {
      setOauthMessage(error?.message ?? "No se pudo desconectar Freesound.");
    } finally {
      setOauthBusy(false);
    }
  }

  function handleClear() {
    setFreesound("");
    setFreesoundClientId("");
    setFreesoundClientSecret("");
    setGroq("");
    onSave({});
    void disconnectFreesound();
  }

  const expiryLabel = oauth.expiresAt
    ? new Date(oauth.expiresAt).toLocaleString()
    : "";

  return (
    <div className="settings">
      <button className="settings__toggle" onClick={() => setOpen((v) => !v)}>
        {configured ? "API keys: configuradas ⚙" : "Configurar API keys"}
      </button>

      {open && (
        <div className="settings__panel">
          <p className="settings__hint">
            La API key de Freesound y la de Groq se guardan en este navegador. El Client Secret y los tokens OAuth de
            Freesound quedan únicamente en el bridge local.
          </p>

          <label className="settings__field">
            <span>Freesound API key</span>
            <input type="password" value={freesound} onChange={(e) => setFreesound(e.target.value)} placeholder="pegar acá" autoComplete="off" />
          </label>

          <div className="settings__oauth">
            <div className="settings__oauth-title">Freesound: archivo original</div>
            <label className="settings__field">
              <span>Freesound Client ID</span>
              <input type="text" value={freesoundClientId} onChange={(e) => setFreesoundClientId(e.target.value)} placeholder="Client ID" autoComplete="off" />
            </label>
            <label className="settings__field">
              <span>Freesound Client Secret</span>
              <input type="password" value={freesoundClientSecret} onChange={(e) => setFreesoundClientSecret(e.target.value)} placeholder="solo para conectar" autoComplete="off" />
            </label>
            <div className="settings__actions">
              <button className="settings__save-btn" onClick={connectFreesound} disabled={oauthBusy}>
                {oauthBusy ? "Conectando..." : oauth.connected ? "Reconectar con Freesound" : "Conectar con Freesound"}
              </button>
              {oauth.connected && (
                <button className="settings__clear-btn" onClick={disconnectFreesound} disabled={oauthBusy}>Desconectar</button>
              )}
            </div>
            <p className="settings__hint">
              Estado: {oauth.connected ? `conectado${expiryLabel ? ` · token válido hasta ${expiryLabel}` : ""}` : oauth.configured ? "credenciales configuradas, falta autorizar" : "no conectado"}
            </p>
            {oauthMessage && <p className="settings__hint">{oauthMessage}</p>}
          </div>

          <label className="settings__field">
            <span>Groq API key</span>
            <input type="password" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="pegar acá" autoComplete="off" />
          </label>

          <div className="settings__actions">
            <button className="settings__save-btn" onClick={handleSave}>Guardar</button>
            {configured && <button className="settings__clear-btn" onClick={handleClear}>Olvidar claves</button>}
          </div>
        </div>
      )}
    </div>
  );
}
