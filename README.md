# AUDIAR

AUDIAR es una herramienta experimental de pre-diseño sonoro para cine y video. En esta versión el punto de partida es **un fotograma**: la imagen se analiza con IA, se transforma en una propuesta de diseño sonoro y luego se buscan sonidos concretos para Ambientes, Efectos, Foley y Diálogos.

## Flujo actual

```text
Fotograma
   ↓
Análisis visual orientado al sonido (Groq Vision)
   ↓
SceneAnalysis
   ↓
Propuesta de diseño sonoro
   ↓
Ambientes / Efectos / Foley / Diálogos
   ↓
Búsqueda de sonidos en Freesound
   ↓
Layers editables
```

## GitHub Pages

La aplicación está preparada para publicarse en:

`https://rnalvarez.github.io/AUDIAR/`

GitHub Pages sirve el frontend. El análisis de imagen y las búsquedas pasan por el Cloudflare Worker. La configuración detallada está en `GITHUB_PAGES_SETUP.md`.

## Estructura

- `App.tsx`, `main.tsx`, `component-*.tsx`: frontend React.
- `style-app.css`, `style-tokens.css`: interfaz.
- `api.ts`: resolución de la URL del backend.
- `index.ts`: Cloudflare Worker.
- `provider-*.ts`: providers y lógica de IA/búsqueda.
- `.github/workflows/deploy-pages.yml`: publicación automática en GitHub Pages.

## Desarrollo local

```bash
npm install
npm run worker:dev
```

En otra terminal:

```bash
npm run dev
```

Vite usa un proxy local `/api -> http://localhost:8787`.

## Variables del Worker

Configurá los secretos en Cloudflare:

```bash
npx wrangler secret put FREESOUND_API_KEY
npx wrangler secret put GROQ_API_KEY
```

Opcionalmente, podés fijar `ALLOWED_ORIGIN` en `wrangler.toml` para limitar CORS.

## Variables de GitHub Actions

En GitHub: Settings → Secrets and variables → Actions → Variables.

Definí:

`VITE_API_BASE_URL=https://TU-WORKER.workers.dev`

Esto se incorpora durante el build de GitHub Pages; no contiene una API key.

## Estado

✅ Fotograma y preview local

✅ Análisis visual con IA en español

✅ Propuesta de diseño sonoro editable

✅ Búsqueda Freesound

✅ Filtrado defensivo de licencias comerciales

🚧 Soundly

🚧 Generación Stable Audio

🚧 TTS para diálogos

⬜ Timeline

⬜ Export / stems WAV

⬜ Integración directa con REAPER
