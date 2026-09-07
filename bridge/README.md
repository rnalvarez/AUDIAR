# AUDIAR REAPER Bridge

Deja enviar sonidos desde AUDIAR directo a un proyecto de REAPER. Corre 100% en tu máquina — el bridge y el script de REAPER son locales.

## Cómo funciona

AUDIAR envía un pedido al bridge local. El bridge descarga los audios y deja jobs en una carpeta que `audiar-bridge.lua` vigila desde REAPER. El script Lua crea las pistas e inserta los sonidos.

## Instalación / actualización

Ejecutá el instalador de Windows `Instalar-AUDIAR-Bridge-Windows-x64.bat`. En una actualización, el instalador reemplaza también el ReaScript dentro de la carpeta de REAPER.

Después, en REAPER: **Actions → Show action list → New action... → Load ReaScript...** y elegí:

```text
%APPDATA%\REAPER\Scripts\AUDIAR\audiar-bridge.lua
```

Si ya había una instancia anterior cargada, detenela y ejecutá la nueva versión. Para dejarla permanente, usá **Run on startup**.

El bridge se inicia desde el acceso directo **AUDIAR REAPER Bridge** que crea el instalador.

## Freesound: archivo original

AUDIAR usa los previews MP3 para escuchar rápidamente. Para enviar el archivo original a REAPER, la conexión OAuth2 de Freesound debe estar autorizada.

En la pantalla **API keys** de AUDIAR:

1. Colocá tu **Freesound API key**.
2. Colocá el **Freesound Client ID** de tu aplicación.
3. En la primera conexión, colocá también el **Freesound Client Secret**.
4. Presioná **Conectar con Freesound** y autorizá la aplicación en Freesound.

La Redirect URI que debe estar registrada en la aplicación de Freesound es:

```text
https://rnalvarez.github.io/AUDIAR/freesound-oauth.html
```

Después de la primera autorización, el Client Secret y los tokens OAuth quedan guardados únicamente en el bridge local. AUDIAR Pages no los persiste. El bridge renueva automáticamente el access token usando el refresh token cuando es necesario.

Freesound usa el flujo OAuth2 authorization-code: el código es temporal y se intercambia una sola vez por `access_token` y `refresh_token`. El endpoint de descarga OAuth entrega el sonido en su formato/calidad original. Ver documentación oficial de Freesound: https://freesound.org/docs/api/authentication.html

## Organización en REAPER

Cada sonido enviado crea **su propia pista**. El nombre de la pista es el nombre del sonido.

Colores automáticos:

- **Ambientes:** azul.
- **SFX:** naranja.
- **Foley:** verde.

El volumen y paneo configurados en AUDIAR se aplican al ítem importado.

## Rendimiento

Las descargas de un lote se ejecutan en paralelo. Cada sonido genera su propio job apenas termina de descargarse, por lo que REAPER no necesita esperar al archivo más largo del lote.

## Qué NO hace esta versión

Sin timeline, sin sincronización con video, sin fades, sin automatización, sin render y sin stems — REAPER sigue siendo donde se edita y mezcla de verdad.

## Solución de problemas

- **"No se encontró REAPER Bridge"**: el bridge no está corriendo.
- **Los archivos están en `cache` pero no aparecen en REAPER**: verificá que `audiar-bridge.lua` esté ejecutándose y mirá la consola de REAPER.
- **Todos los archivos son MP3 aunque OAuth esté configurado**: mirá la consola del bridge. Cada descarga informa `[ORIGINAL]` o `[preview]`. Si aparece `[preview]`, la autorización OAuth no está disponible o el original no pudo descargarse.
