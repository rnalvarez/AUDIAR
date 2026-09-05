# AUDIAR

Herramienta de diseño sonoro: cargás un fotograma de la escena, AUDIAR lo
analiza con IA (observado / probable / posible — nunca inventa un sonido
como hecho), y la banda sonora se organiza en cuatro elementos —**Ambientes**,
**Efectos**, **Foley**, **Diálogos**— cada uno compuesto por varias capas,
editables después de generadas. Inspirada en [fmffmf.studio/machines](https://fmffmf.studio/machines).

## Subir esto a GitHub desde la web (sin git, sin GitHub Desktop)

La estructura de este zip está aplanada a propósito — **sin subcarpetas
dentro de `worker/` ni de `app/`** — porque el drag-and-drop de GitHub no
sabe crear subcarpetas nuevas a partir de una carpeta arrastrada. Sí sabe
subir archivos sueltos mientras estás parado dentro de una carpeta que ya
existe. Con eso alcanza:

1. En tu repo en GitHub, **Add file → Create new file**.
2. En el campo de nombre, escribí `worker/wrangler.toml` (la barra crea la
   carpeta `worker/` sola). Pegá el contenido de ese archivo. Commit.
3. Navegá a la carpeta `worker/` que acabás de crear. **Add file → Upload
   files** y arrastrá TODOS los demás archivos de `worker/` de una — ya son
   todos sueltos, sin subcarpetas, así que entran bien. Commit.
4. Repetí el mismo truco para `app/`: **Create new file**, escribí
   `app/index.html`, pegá su contenido, commit. Navegá a `app/`, subí el
   resto de los archivos de esa carpeta de una. Commit.
5. En la raíz del repo, subí `README.md` y `.gitignore` directo (son
   sueltos, no hay problema ahí).

Si en algún momento volvés a git por terminal o GitHub Desktop, esta misma
estructura funciona igual — no hace falta deshacer nada.

## Estado actual

| Pieza | Estado |
|---|---|
| Búsqueda en Freesound (con filtro de licencia comercial) | ✅ funcionando, con test |
| Editor de capas (vol/pan/mute/solo por capa) | ✅ funcionando, client-side |
| Carga y preview de un fotograma (imagen) | ✅ funcionando |
| Análisis visual automático (Groq vision → `SceneAnalysis` con observado/probable/posible) | ✅ funcionando, con test |
| Propuesta de diseño sonoro (`SceneAnalysis` → `SoundDesignProposal` editable, Ambientes/Efectos/Foley/Diálogos) | ✅ funcionando, con test — todavía sin conectar a Freesound a propósito |
| Menú de plataforma/fuente por elemento (Freesound / Soundly / Generado) | ✅ UI funcionando — Soundly y Generado quedan marcados "pronto" hasta que sus providers estén listos |
| Soundly | 🚧 bloqueado — no encontré API pública documentada (solo app de escritorio con integraciones a DAWs). Revisá tu cuenta o escribiles para confirmar si existe API de partner |
| Decomposición de un prompt único en sub-prompts por elemento | 🚧 simplificado — hoy copia el mismo texto a las 4 categorías; falta el paso de IA (Groq) que lo divida de verdad |
| Generación con Stable Audio Open (Ambientes, y Foley/Efectos sin match) | 🚧 stub — falta elegir hosting (`worker/provider-stable-audio.ts`) |
| Generación de voces con Groq/Orpheus (Diálogos) | 🚧 stub — solo falta la key y la llamada (`worker/provider-groq-tts.ts`) |
| Export final (mezcla / stems WAV) | ⬜ no arrancado |

## Por qué estos límites de licencia

Freesound API: gratis solo para uso no comercial (para comercial hay que
escribirle a MTG-UPF). Además, cada sonido tiene su propia licencia CC —
solo CC0 y CC-BY permiten uso comercial sin permiso extra.
`worker/provider-freesound.ts` filtra por esto en el cliente del worker (no
confía en el filtro del lado de Freesound), y cada capa muestra su licencia
en la UI. `provider-soundly.ts` está pensado para seguir la misma lógica en
cuanto haya una API real a la que pegarle.

Stable Audio Open es la opción pensada para lo generativo: pesos abiertos,
gratis para uso comercial si facturás menos de US$1M/año.

## Arquitectura

```
Fotograma (imagen)
      │
      ▼
Análisis con IA (Groq vision) → SceneAnalysis
      observado / probable / posible, por ítem
      │
      ▼
Propuesta de diseño sonoro (Groq, razona como diseñador) → SoundDesignProposal
      Ambientes / Efectos / Foley / Diálogos, editable (agregar/editar/eliminar)
      máx. 6 propuestas por categoría — prioriza, no lista todo
      │
      ┆ (todavía no conectada a la búsqueda/generación de abajo)
      ┆
      ▼
Banda sonora (4 elementos: Ambientes / Efectos / Foley / Diálogos)
      cada panel elige su fuente: Freesound / Soundly / Generado
      ├─ Foley / Efectos → Freesound o Soundly (buscar, filtrar licencia)
      ├─ Ambientes        → Stable Audio Open (generar)
      └─ Diálogos         → Groq / Orpheus TTS (generar)
      │
      ▼
Editor de capas (vol/pan/mute/solo) → Export (mezcla / stems)
```

- `worker/` — Cloudflare Worker. Guarda las API keys del lado servidor.
  Todos los archivos están al mismo nivel (sin `src/`), a propósito, para
  que entren en un solo drag-and-drop web una vez creada la carpeta.
- `app/` — React + Vite. Layout de 4 columnas (Ambientes/Efectos/Foley/Diálogos),
  cada capa con su channel strip (vol, pan, mute, solo), badge de licencia,
  y selector de fuente. Mismo criterio: todo al mismo nivel dentro de `app/`.

## Setup local (para seguir desarrollando)

### Worker

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # completá FREESOUND_API_KEY y GROQ_API_KEY
npm run dev                       # wrangler dev, puerto 8787
npm test                          # corre el test de provider-freesound.ts
```

Conseguir una key de Freesound: <https://freesound.org/apiv2/apply/> (gratis, al toque).
Conseguir una key de Groq (para el análisis visual): <https://console.groq.com/keys>.

### App

```bash
cd app
npm install
npm run dev   # vite, con /api proxeado a localhost:8787
```

## Próximos pasos sugeridos

1. Conectar la propuesta editada (`SoundDesignProposal`) con la búsqueda/generación
   de sonido — hoy son cosas separadas a propósito.
2. Confirmar si Soundly tiene API de partner (cuenta o soporte) y completar `provider-soundly.ts`.
3. Elegir hosting para Stable Audio Open y completar `provider-stable-audio.ts`.
4. Completar `provider-groq-tts.ts`.
5. Sumar el paso de decomposición del prompt único (Groq) en `component-PromptBar.tsx`,
   usando el análisis de la escena como contexto adicional.
6. Export final a WAV (mezcla y stems por elemento).
