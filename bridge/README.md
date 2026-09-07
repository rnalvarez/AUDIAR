# AUDIAR REAPER Bridge

Deja enviar sonidos desde AUDIAR directo a un proyecto de REAPER. Corre
100% en tu máquina — el bridge y el script de REAPER no exponen un servidor
público.

## Cómo funciona

Una app web no puede escribir dentro de un proyecto de REAPER directamente.
El bridge es el intermediario: recibe el pedido de AUDIAR, descarga los
audios y deja jobs en una carpeta que un ReaScript dentro de REAPER vigila.

## Instalación

### 1. Instalar o actualizar el bridge

```bash
cd bridge
npm install
```

En Windows también podés ejecutar `Instalar-AUDIAR-Bridge-Windows-x64.bat`.

### 2. Cargar el script en REAPER

1. Abrí REAPER.
2. Menú **Actions → Show action list**.
3. **New action... → Load ReaScript...**.
4. Elegí `bridge/audiar-bridge.lua`.
5. Ejecutalo.
6. Para dejarlo permanente: click derecho → **Run on startup**.

La consola de REAPER debería mostrar:

```text
[AUDIAR Bridge] Activo. Escuchando trabajos en: <tu carpeta>/audiar-bridge/jobs
```

### 3. Ejecutar el bridge

```bash
cd bridge
npm start
```

Dejá la ventana abierta mientras uses AUDIAR.

## Uso

En AUDIAR podés enviar un sonido individual o una selección. Cada sonido
crea **su propia pista** en REAPER. El nombre de la pista es el nombre del
sonido.

Las pistas se colorean automáticamente según la categoría:

- **Ambientes:** azul.
- **SFX:** naranja.
- **Foley:** verde.

El volumen y paneo configurados en AUDIAR se aplican al ítem importado.

## Preview vs archivo original de Freesound

Por defecto AUDIAR reproduce y, al no haber OAuth2, exporta el preview MP3.
Los previews están pensados por Freesound para ser rápidos y no requieren
OAuth2.

El endpoint de descarga del archivo original de Freesound requiere OAuth2.
Cuando AUDIAR tiene configurado un **Freesound OAuth access token**, el bridge
intenta obtener los metadatos del sonido y descargar el archivo original a la
carpeta `cache`, preservando su formato original (WAV, AIFF, FLAC, MP3, etc.).

El original se usa solo si está disponible y autorizado; si falla la descarga
original, el bridge conserva el preview como respaldo para no cortar el flujo.

Los tokens OAuth de Freesound tienen una duración limitada; Freesound indica
una validez de 24 horas para los access tokens y permite renovarlos mediante
refresh token. Consultá la documentación de autenticación de Freesound para
obtenerlos y renovarlos.

## Qué NO hace esta versión

Sin timeline, sincronización automática con video, fades, automatización,
render o stems. REAPER sigue siendo donde se edita y mezcla de verdad.

## Solución de problemas

- **"No se encontró REAPER Bridge"**: el bridge no está corriendo o no está en `localhost:8765`.
- **Hay archivos en `cache` pero no aparecen en REAPER**: verificá que `audiar-bridge.lua` esté ejecutándose.
- **REAPER recibe un preview MP3**: comprobá que el OAuth access token de Freesound esté configurado y vigente en AUDIAR.
- **El original no es WAV 24-bit/48 kHz**: AUDIAR no puede mejorar la calidad de un archivo que originalmente fue subido en otro formato o resolución; conserva la fuente original disponible en Freesound.
