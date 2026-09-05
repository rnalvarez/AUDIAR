# AUDIAR — versión GitHub Pages sin Worker

Esta carpeta contiene la versión simplificada de AUDIAR para uso personal.

## Qué cambió

- Se eliminó la dependencia funcional de Cloudflare Worker.
- AUDIAR llama directamente desde el navegador a Groq y Freesound.
- Se eliminó el campo “URL del Worker” de Configuración.
- Se mantiene GitHub Pages como publicación del sitio.
- Las API keys se guardan únicamente en `localStorage` del navegador.
- Se actualizó el provider de Freesound al endpoint actual de APIv2.

## Archivos eliminados

- `index.ts`
- `wrangler.toml`
- `tsconfig.worker.json`
- `.dev.vars.example`

## Para subir a GitHub

Reemplazá los archivos existentes por los de este paquete en la rama `main`.

El repositorio puede conservar un `package-lock.json` existente; el workflow usa `npm install`, que puede actualizar ese lockfile al instalar las dependencias actuales.

Después del deploy, abrí:

`https://rnalvarez.github.io/AUDIAR/`

y entrá en **⚙ Configuración** para cargar la API key de Groq y la API key de Freesound.

## Importante sobre las claves

Este diseño es adecuado para una instancia personal. No pongas las claves dentro del código ni las publiques en GitHub. No reutilices esta arquitectura para distribuir AUDIAR a terceros con tus propias credenciales.
