# AUDIAR

AUDIAR es una herramienta experimental de pre-diseño sonoro para cine y video.

## Flujo

```text
Fotograma
   ↓
Análisis visual orientado al sonido — Groq
   ↓
Propuesta de diseño sonoro
   ↓
Sound Ideas: Ambientes / Efectos / Foley / Diálogos
   ↓
Búsqueda en Freesound
   ↓
Selección de sonidos
   ↓
Layers editables
   ↓
REAPER (opcional, bridge local)
```

## Arquitectura

AUDIAR se publica como frontend estático en GitHub Pages y llama directamente a Groq y Freesound desde el navegador. No utiliza Cloudflare Worker ni Wrangler.

Las API keys se guardan únicamente en `localStorage` para esta instalación personal. No incluyas claves reales en el repositorio.

El bridge de REAPER es opcional y corre solamente en `localhost:8765`.

## GitHub Pages

La publicación automática está en `.github/workflows/deploy-pages.yml`.

URL esperada: `https://rnalvarez.github.io/AUDIAR/`

En GitHub: **Settings → Pages → Source → GitHub Actions**.

No hace falta configurar `VITE_API_BASE_URL`, Cloudflare ni ningún Worker.

## REAPER Bridge

Para transferir Layers a REAPER: `cd bridge`, luego `npm install` y `npm start`. Después cargá `bridge/audiar-bridge.lua` en REAPER como ReaScript..
