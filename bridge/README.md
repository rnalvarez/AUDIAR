# AUDIAR REAPER Bridge

Este componente permite que AUDIAR envíe los sonidos seleccionados directamente a REAPER.

## Instalación y actualización

En Windows ejecutá:

```text
Instalar-AUDIAR-Bridge-Windows-x64.bat
```

El instalador actualiza el Bridge y el script de REAPER. No elimina la conexión OAuth de Freesound ni la cache de archivos ya descargados.

Después iniciá **AUDIAR REAPER Bridge** desde el acceso directo creado en el escritorio.

En REAPER cargá una vez:

```text
%APPDATA%\REAPER\Scripts\AUDIAR\audiar-bridge.lua
```

Desde **Actions → Show action list → Load ReaScript...**.

Podés usar **Run on startup** para ejecutarlo automáticamente al iniciar REAPER.

## Freesound y archivos originales

Para buscar sonidos, AUDIAR necesita una **Freesound API key**.

Para enviar el archivo original a REAPER, además necesitás autorizar Freesound mediante OAuth desde **Configurar API keys** en AUDIAR.

La conexión OAuth utiliza:

- Freesound Client ID
- Freesound Client Secret
- autorización de tu cuenta de Freesound

El Client Secret y los tokens OAuth se guardan solamente en el Bridge local.

La Callback URL de la aplicación AUDIAR en Freesound es:

```text
https://rnalvarez.github.io/AUDIAR/freesound-oauth.html
```

Una vez conectado, el Bridge intenta descargar el archivo original. Se conserva el formato original del sonido.

## Cache

Los sonidos descargados se guardan localmente. Si el original ya está en cache, vuelve a REAPER sin necesidad de conectarse nuevamente a Freesound.

Los archivos grandes tardan lo que tarde su descarga. El Bridge descarga varios sonidos en paralelo y escribe los datos directamente en disco.

## REAPER

Cada sonido enviado crea una pista independiente.

- Ambientes: azul
- SFX: naranja
- Foley: verde

El volumen y paneo configurados en AUDIAR se aplican al ítem importado.

## Problemas habituales

**AUDIAR no encuentra el Bridge:** iniciá **AUDIAR REAPER Bridge**.

**Los archivos llegan al Bridge pero no aparecen en REAPER:** verificá que `audiar-bridge.lua` esté ejecutándose.

**Se usa una preview en lugar del original:** revisá que Freesound figure como conectado en AUDIAR y que el original esté disponible para descarga.
