# AUDIAR

AUDIAR es una herramienta para crear un primer diseño sonoro a partir de un fotograma de una escena.

Analiza la imagen con IA, propone sonidos y los busca directamente en Freesound. Después podés escuchar, ajustar y seleccionar las capas que quieras llevar a REAPER.

## Qué hace

AUDIAR trabaja con tres categorías:

- **Ambientes**: camas y fondos sonoros.
- **SFX**: efectos y eventos puntuales.
- **Foley**: sonidos asociados a acciones visibles.

Cada categoría puede tener hasta tres capas en la propuesta inicial. También podés pedir **Otros sonidos** para agregar alternativas sin reemplazar las capas originales.

Cada capa permite ajustar:

- volumen
- paneo
- mute
- solo
- reproducción en loop

## Antes de usar AUDIAR

Necesitás tres datos:

1. **Freesound API key** — permite buscar sonidos.
2. **Freesound Client ID + Client Secret** — permiten autorizar la descarga del archivo original.
3. **Groq API key** — permite analizar el fotograma.

Las claves que se usan en el navegador quedan guardadas en ese navegador. El **Client Secret** y los tokens OAuth de Freesound se guardan únicamente en el Bridge local de REAPER.

## Configurar Freesound

### 1. Crear las credenciales de la aplicación

En Freesound creá una nueva API credential para AUDIAR.

Usá estos datos:

**Name**

```text
AUDIAR
```

**URL**

```text
https://rnalvarez.github.io/AUDIAR/
```

**Callback URL**

```text
https://rnalvarez.github.io/AUDIAR/freesound-oauth.html
```

Al crearla, Freesound te proporciona el **API key**, **Client ID** y **Client Secret**.

### 2. Cargar las claves en AUDIAR

Abrí **Configurar API keys** y completá:

- **Freesound API key**
- **Freesound Client ID**
- **Groq API key**

Para la primera conexión de Freesound también ingresá el **Client Secret**.

Después presioná **Conectar con Freesound** y autorizá AUDIAR en la ventana de Freesound.

Una vez autorizada la cuenta, AUDIAR muestra el estado **conectado**. El Bridge guarda localmente el acceso OAuth y lo renueva cuando hace falta.

No es necesario volver a pegar el access token manualmente.

## Uso básico

### 1. Cargar un fotograma

Subí una imagen JPEG, PNG o WebP de hasta 20 MB.

### 2. Analizar y componer

Presioná **Analizar y componer**.

AUDIAR analiza la escena y genera una primera selección de:

- Ambientes
- SFX
- Foley

Las búsquedas se hacen automáticamente en Freesound.

### 3. Escuchar y ajustar

Cada resultado puede escucharse desde AUDIAR. Podés modificar volumen y paneo, activar mute o solo y escuchar el sonido en loop.

### 4. Buscar alternativas

**Otros sonidos** agrega nuevas opciones para esa capa. La propuesta original permanece intacta hasta que decidas agregar una alternativa.

### 5. Enviar a REAPER

Seleccioná las capas que quieras y presioná **Enviar selección a REAPER**.

También podés enviarlas individualmente desde cada capa.

## Archivos originales y calidad

AUDIAR utiliza una preview de Freesound para escuchar rápidamente los resultados.

Cuando la conexión OAuth está autorizada, el envío a REAPER intenta descargar el **archivo original** de Freesound.

AUDIAR no convierte ese archivo a un formato determinado. Se conserva el formato que subió el usuario a Freesound: por ejemplo WAV, AIFF, FLAC, MP3 u otro formato disponible.

Por eso un original puede ser WAV 24-bit/48 kHz, pero no todos los sonidos de Freesound tienen necesariamente esa calidad.

## Instalar el Bridge de REAPER en Windows

Para enviar sonidos desde AUDIAR a REAPER necesitás el **AUDIAR REAPER Bridge**.

Ejecutá:

```text
bridge/Instalar-AUDIAR-Bridge-Windows-x64.bat
```

El instalador actualiza el Bridge y el script que usa REAPER.

Después:

1. Iniciá **AUDIAR REAPER Bridge** desde el acceso directo que crea el instalador.
2. En REAPER cargá una vez el script `audiar-bridge.lua` desde **Actions → Show action list → Load ReaScript...**.
3. Si querés que REAPER lo ejecute automáticamente al iniciar, usá **Run on startup** en ese script.

El Bridge funciona solamente en tu computadora.

## Cómo se organiza en REAPER

Cada sonido enviado desde AUDIAR crea su propia pista.

Las pistas se identifican por categoría:

- **Ambientes**: azul
- **SFX**: naranja
- **Foley**: verde

El volumen y el paneo configurados en AUDIAR se trasladan al ítem importado.

## Cache local

Los archivos descargados se guardan en la cache local del Bridge.

Cuando un original ya está en cache, AUDIAR no necesita volver a descargarlo y puede enviarlo a REAPER inmediatamente.

Los originales nuevos, especialmente los WAV o FLAC largos, necesitan terminar de descargarse antes de que REAPER pueda importarlos como archivo definitivo.

## Problemas habituales

**AUDIAR dice que no encuentra el REAPER Bridge**

Comprobá que **AUDIAR REAPER Bridge** esté ejecutándose.

**Freesound aparece conectado pero se descarga un preview**

Revisá la conexión OAuth en **Configurar API keys** y volvé a conectar Freesound. Si el original no puede descargarse, AUDIAR usa la preview como respaldo.

**Los archivos llegan al Bridge pero no aparecen en REAPER**

Comprobá que `audiar-bridge.lua` esté ejecutándose en REAPER.

**Un archivo largo tarda en aparecer**

El original tiene que descargarse completamente antes de ser importado en REAPER. El Bridge descarga varios sonidos en paralelo y escribe el archivo directamente en disco para evitar procesamiento innecesario.

## Acceso a AUDIAR

```text
https://rnalvarez.github.io/AUDIAR/
```
