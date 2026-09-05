# Publicar AUDIAR en GitHub Pages

## 1. Subir todo el repositorio

Copiá todos los archivos de este paquete a la rama `main` de tu repositorio `rnalvarez/AUDIAR`.

## 2. Activar Pages

En GitHub:

**Settings → Pages → Source → GitHub Actions**

El workflow `.github/workflows/deploy-pages.yml` se ejecutará en cada push a `main`.

## 3. Desplegar el Worker

Desde una instalación local de Node:

```bash
npm install
npx wrangler login
npx wrangler secret put FREESOUND_API_KEY
npx wrangler secret put GROQ_API_KEY
npm run worker:deploy
```

Guardá la URL pública que entregue Cloudflare.

## 4. Conectar Pages con el Worker

En GitHub:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

Nombre:

`VITE_API_BASE_URL`

Valor:

`https://TU-WORKER.workers.dev`

No uses una API key como variable de Vite. La clave de Groq y la de Freesound deben permanecer en Cloudflare.

## 5. Comprobar la publicación

Después del workflow, la aplicación debería quedar disponible en:

`https://rnalvarez.github.io/AUDIAR/`

Si la interfaz abre pero el botón de IA devuelve un error de backend, comprobá primero `VITE_API_BASE_URL` y después los secretos del Worker.

## Configuración desde AUDIAR

La aplicación puede funcionar sin `VITE_API_BASE_URL` en GitHub Actions. Al abrir AUDIAR por primera vez, el panel de configuración permite introducir la URL pública del Worker y las claves de Groq y Freesound. Se guardan en el almacenamiento local del navegador para uso personal.

Las claves se envían al Worker en headers HTTPS y el Worker las usa solo para esa solicitud. Para uso compartido o público, no uses esta modalidad: mantené las claves exclusivamente como secrets del Worker.
