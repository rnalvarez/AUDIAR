# Publicar AUDIAR en GitHub Pages

## 1. Subir el repositorio

La rama `main` contiene todo lo necesario para publicar AUDIAR como sitio estático en GitHub Pages. No hace falta Cloudflare ni un Worker.

## 2. Activar Pages

En GitHub:

**Settings → Pages → Source → GitHub Actions**

El workflow `.github/workflows/deploy-pages.yml` se ejecutará en cada push a `main`.

## 3. Configurar las API keys

Abrí AUDIAR en:

`https://rnalvarez.github.io/AUDIAR/`

Entrá en **⚙ Configuración** y cargá:

- `Groq API key`
- `Freesound API key`

Las claves se almacenan solamente en el navegador mediante `localStorage`; no se suben a GitHub.

## 4. Uso

Cargá un fotograma, analizalo y generá la propuesta de diseño sonoro. Las búsquedas de Freesound se realizan directamente desde el navegador.

No hace falta configurar `VITE_API_BASE_URL`, una URL de Worker, secretos de Cloudflare ni Wrangler.

## 5. Desarrollo local

```bash
npm install
npm run dev
```

Luego abrí la URL indicada por Vite y configurá las claves desde **⚙ Configuración**.

## Nota de seguridad

Esta arquitectura está pensada para uso personal. GitHub Pages es público y las claves introducidas en el navegador son accesibles por esa instancia de AUDIAR. No reutilices esta modalidad para distribuir la aplicación con credenciales compartidas.
