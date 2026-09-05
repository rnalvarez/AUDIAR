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

GitHub Pages sirve directamente el frontend. AUDIAR se conecta desde el navegador con las APIs de Groq y Freesound; no requiere Cloudflare Worker ni una URL de backend propia.

## Configuración

Al abrir AUDIAR por primera vez, entrá en **⚙ Configuración** y cargá:

- `Groq API key`
- `Freesound API key`

Las claves se guardan solamente en el almacenamiento local de ese navegador y no forman parte del repositorio.

Esta arquitectura está pensada para **uso personal**. GitHub Pages es público y el navegador puede acceder a las claves configuradas, por lo que esta modalidad no debe reutilizarse para una aplicación pública o compartida.

## Estructura

- `App.tsx`, `main.tsx`, `component-*.tsx`: frontend React.
- `style-app.css`, `style-tokens.css`: interfaz.
- `api.ts`: puente local que conecta la interfaz directamente con los providers.
- `provider-*.ts`: providers y lógica de IA/búsqueda.
- `.github/workflows/deploy-pages.yml`: publicación automática en GitHub Pages.

No se necesita `index.ts`, `wrangler.toml` ni `tsconfig.worker.json`.

## Desarrollo local

```bash
npm install
npm run dev
```

Luego abrí la URL que indique Vite y configurá las dos API keys desde **⚙ Configuración**.

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
