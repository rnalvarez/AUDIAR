# AUDIAR en GitHub Pages

La aplicación está preparada para publicarse en:

`https://rnalvarez.github.io/AUDIAR/`

## 1. GitHub Pages

En GitHub:

Settings → Pages → Source → **GitHub Actions**

Después de subir `.github/workflows/deploy-pages.yml` y hacer commit, el workflow `Deploy AUDIAR to GitHub Pages` construye y publica la aplicación automáticamente.

## 2. Backend de AUDIAR

GitHub Pages solo sirve el frontend. Las funciones que usan API (`/api/analyze/frame`, `/api/design/proposal`, `/api/search/freesound`, etc.) siguen ejecutándose en el Cloudflare Worker.

El repositorio contiene el Worker (`index.ts`, providers y `wrangler.toml`), pero GitHub Pages no lo ejecuta.

Primero desplegá el Worker, por ejemplo:

```bash
npm install
npm run worker:deploy
```

Eso te dará una URL pública del Worker, por ejemplo:

`https://audiar-worker.<tu-subdominio>.workers.dev`

## 3. Conectar GitHub Pages con el Worker

En GitHub:

Settings → Secrets and variables → Actions → Variables → New repository variable

Nombre:

`VITE_API_BASE_URL`

Valor:

`https://TU-WORKER.workers.dev`

No hace falta que sea un secret: es una URL pública.

Al volver a ejecutar el workflow, AUDIAR Pages utilizará esa URL para las llamadas al backend.

## 4. Desarrollo local

Para trabajar localmente, ejecutá el frontend y el Worker por separado:

Terminal 1:

```bash
npm run worker:dev
```

Terminal 2:

```bash
npm run dev
```

Vite mantiene el proxy `/api → http://localhost:8787`, por lo que no es necesario definir `VITE_API_BASE_URL` en desarrollo local.
