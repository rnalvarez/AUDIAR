# AUDIAR

AUDIAR es una herramienta para crear un primer diseño sonoro a partir de un fotograma de una escena.

Analiza la imagen con IA, propone sonidos y los busca directamente en Freesound. Después podés escuchar, ajustar y seleccionar las capas que quieras llevar a REAPER.

> **Sitio:** https://rnalvarez.github.io/AUDIAR/

## Qué hace

AUDIAR trabaja con tres categorías:

- **Ambientes**: camas y fondos sonoros.
- **SFX**: efectos y eventos puntuales.
- **Foley**: sonidos asociados a acciones visibles.

Cada categoría puede tener hasta tres capas en la propuesta inicial. También podés pedir **Otros sonidos** para agregar alternativas sin reemplazar las capas originales.

Cada capa permite:

- escuchar el preview en loop
- ajustar volumen
- ajustar paneo
- mute
- solo
- enviar individualmente a REAPER

## Flujo de trabajo recomendado

1. **Cargá o pegá un fotograma.** Podés seleccionar un archivo JPEG, PNG o WebP, o copiar una captura de pantalla y pegarla con **Ctrl+V** directamente en AUDIAR.
2. **Nombrá la escena** de forma opcional. Ese nombre se conserva en la carpeta del grupo.
3. Presioná **Analizar y componer**.
4. Revisá y escuchá las propuestas de Ambientes, SFX y Foley.
5. Enviá sonidos individuales o seleccioná varios para incorporarlos a la **Cola de descargas**.
6. Podés seguir analizando otras escenas mientras las descargas continúan en segundo plano mediante el Bridge local.
7. Cuando un grupo termine de descargarse, usá **Importar grupo a REAPER** y colocá el cursor de REAPER en el timecode donde querés insertar ese grupo.

Los grupos de escena se mantienen separados y los sonidos de un mismo grupo reutilizan el archivo local cuando ya existe.

## Antes de usar AUDIAR

Necesitás tres datos:

1. **Freesound API key** — permite buscar sonidos.
2. **Freesound Client ID + Client Secret** — permiten autorizar la descarga del archivo original mediante OAuth.
3. **Groq API key** — permite analizar el fotograma.

Las claves usadas por la interfaz quedan guardadas en ese navegador. El **Client Secret** y los tokens OAuth de Freesound se guardan únicamente en el Bridge local de REAPER.

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

## Freesound, licencias y uso responsable

AUDIAR **no cambia la licencia de los sonidos**. Cada sonido conserva la licencia indicada en Freesound por su autor.

La búsqueda automática de AUDIAR está filtrada actualmente a sonidos bajo **Creative Commons 0 (CC0)** y **Creative Commons Attribution (CC BY)**, excluyendo resultados **Attribution-NonCommercial (CC BY-NC)** de la selección automática.

- **CC0:** normalmente permite reutilizar el sonido sin obligación de atribución.
- **CC BY:** permite usos comerciales, pero requiere atribución al autor.
- **CC BY-NC:** no debe utilizarse para fines comerciales sin el permiso correspondiente del titular de derechos.

La interfaz muestra la licencia de cada sonido y ofrece un enlace directo a su página en Freesound para que puedas revisar la licencia y la procedencia antes de utilizarlo.

**Importante para compartir o explotar AUDIAR comercialmente:** las condiciones de la **Freesound API** establecen que su uso gratuito está destinado a fines no comerciales. Para un uso comercial de la API, Freesound indica que hay que contactar al Music Technology Group de la Universitat Pompeu Fabra para las opciones de licencia correspondientes. El hecho de que un sonido individual tenga licencia CC0 o CC BY no elimina esta condición aplicable al uso de la API. citeturn153781search0turn153781search1

Por ese motivo, antes de desplegar AUDIAR como servicio comercial o incorporarlo a un producto comercial, revisá las condiciones vigentes de Freesound y obtené la autorización correspondiente cuando sea necesaria.

Esto no constituye asesoramiento jurídico. La licencia individual y las circunstancias de cada producción deben verificarse antes de publicar o comercializar una obra.

## Archivos originales y calidad

AUDIAR utiliza una preview de Freesound para escuchar rápidamente los resultados.

Cuando la conexión OAuth está autorizada, el envío a REAPER intenta descargar el **archivo original** de Freesound.

AUDIAR no convierte ese archivo a un formato determinado. Se conserva el formato disponible del archivo original: por ejemplo WAV, AIFF, FLAC, MP3 u otro formato admitido por Freesound.

Por eso un original puede ser WAV 24-bit/48 kHz, pero no todos los sonidos de Freesound tienen necesariamente esa calidad.

## Cola de descargas e importación a REAPER

La **Cola de descargas** centraliza los archivos que se están descargando. Esto permite trabajar por escenas sin esperar a que cada descarga termine antes de continuar con la siguiente.

Cada grupo conserva:

- nombre de escena
- carpeta de almacenamiento
- lista de sonidos
- progreso individual
- estado de descarga

Un envío individual desde una capa también entra en la cola como un elemento asociado al grupo de la escena actual.

Cuando el grupo está completo aparece **Importar grupo a REAPER**. El Bridge utiliza los mismos archivos descargados y REAPER inserta los sonidos del grupo como pistas independientes alineadas en el cursor seleccionado.

## Instalar el Bridge de REAPER en Windows

Para enviar sonidos desde AUDIAR a REAPER necesitás el **AUDIAR REAPER Bridge**.

Ejecutá:

```text
bridge/Instalar-AUDIAR-Bridge-Windows-x64.bat
```

El instalador:

- comprueba la arquitectura Windows x64
- instala Node.js si es necesario
- instala/actualiza el Bridge
- actualiza el ReaScript de REAPER
- crea un acceso directo **AUDIAR REAPER Bridge** en el escritorio

El acceso directo utiliza un icono de audio/volumen de Windows. Un archivo `.bat` no puede llevar un icono personalizado propio; el icono se aplica al acceso directo que crea el instalador.

Después:

1. Iniciá **AUDIAR REAPER Bridge** desde el acceso directo.
2. En REAPER cargá una vez el script `audiar-bridge.lua` desde **Actions → Show action list → Load ReaScript...**.
3. Si querés que REAPER lo ejecute automáticamente al iniciar, usá **Run on startup** en ese script.

El Bridge funciona solamente en tu computadora y expone su servicio en `http://localhost:8765`.

## Cómo se organiza el almacenamiento

La primera vez que hace falta guardar un archivo, AUDIAR solicita una carpeta raíz de almacenamiento. Dentro de ella crea grupos como:

```text
GRUPO 01 - Escena 01
GRUPO 02 - EXT. PLAZA — NOCHE
...
```

Los audios se guardan directamente dentro de la carpeta final de su grupo. No se utiliza un cache persistente separado para los archivos finales.

Cuando un archivo ya existe en el grupo, AUDIAR lo reutiliza en lugar de descargarlo otra vez.

## Cómo se organiza en REAPER

Cada sonido enviado desde AUDIAR crea su propia pista.

Las pistas se identifican por categoría:

- **Ambientes**
- **SFX**
- **Foley**

El volumen y el paneo configurados en AUDIAR se trasladan al ítem importado.

Los sonidos de un mismo grupo se importan verticalmente alineados en el mismo timecode de REAPER.

## Problemas habituales

**AUDIAR dice que no encuentra el REAPER Bridge**

Comprobá que **AUDIAR REAPER Bridge** esté ejecutándose.

**Freesound aparece conectado pero se descarga un preview**

Revisá la conexión OAuth en **Configurar API keys** y volvé a conectar Freesound. Si el original no puede descargarse, AUDIAR usa la preview como respaldo.

**Los archivos llegan al Bridge pero no aparecen en REAPER**

Comprobá que `audiar-bridge.lua` esté ejecutándose en REAPER. Si acabás de actualizar el Bridge, volvé a cargar/ejecutar la copia actual del ReaScript.

**Un archivo largo tarda en aparecer**

El original tiene que descargarse completamente antes de ser importado en REAPER. El Bridge puede descargar varios sonidos en paralelo y utiliza archivos temporales durante la transferencia para no dejar archivos finales incompletos.

## Privacidad y seguridad

AUDIAR funciona principalmente desde el navegador. Las claves que se cargan en la interfaz se guardan localmente en ese navegador.

El Bridge se ejecuta localmente en Windows y se comunica con AUDIAR a través de `localhost`.

No compartas tus API keys, Client Secret ni archivos de credenciales del Bridge.

## Autoría

AUDIAR fue diseñado y creado por **Ramiro N. Alvarez**, utilizando también herramientas de inteligencia artificial durante su desarrollo.

## Acceso

```text
https://rnalvarez.github.io/AUDIAR/
```

## Referencias oficiales de Freesound

- Freesound API — términos de uso: https://freesound.org/help/tos_api/
- Freesound — FAQ sobre licencias: https://freesound.org/help/faq/
- Freesound API — documentación de recursos: https://freesound.org/docs/api/resources_apiv2/
