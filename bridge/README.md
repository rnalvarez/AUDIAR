# AUDIAR REAPER Bridge

Deja enviar sonidos desde AUDIAR directo a un proyecto de REAPER. Corre
100% en tu máquina — ni el bridge ni el script de REAPER hablan con
internet.

## Cómo funciona

Una app web no puede escribir dentro de un proyecto de REAPER directamente.
El bridge es el intermediario: recibe el pedido de AUDIAR, descarga los
audios, y deja un archivo de trabajo en una carpeta que un script corriendo
dentro de REAPER vigila. Ese script (Lua, ReaScript) es el que efectivamente
crea las pistas e inserta los sonidos.

**Importante:** cuando AUDIAR muestra "Enviado a REAPER", significa que el
bridge aceptó el pedido y dejó el trabajo listo. La inserción final la hace
el script Lua que corre dentro de REAPER.

## Instalación

### 1. Instalar el bridge

```bash
cd bridge
npm install
```

### 2. Cargar el script en REAPER

1. Abrí REAPER.
2. Menú **Actions → Show action list**.
3. Botón **New action... → Load ReaScript...**.
4. Elegí `bridge/audiar-bridge.lua`.
5. Con el script seleccionado en la lista, click **Run**.
6. Para que quede corriendo siempre que abrís REAPER: click derecho sobre
   el script → **Run on startup**.

La consola de REAPER debería mostrar:

```text
[AUDIAR Bridge] Activo. Escuchando trabajos en: <tu carpeta>/audiar-bridge/jobs
```

El script revisa la carpeta de trabajos varias veces por segundo.

### 3. Correr el bridge

```bash
cd bridge
npm start
```

Deja esta terminal abierta mientras usás AUDIAR. Vas a ver:

```text
AUDIAR REAPER Bridge escuchando en http://localhost:8765
Carpeta de trabajos: <tu carpeta de REAPER>/audiar-bridge/jobs
```

### 4. Confirmar carpetas

El bridge usa el resource path de REAPER. En Windows normalmente es:

```text
%APPDATA%\REAPER
```

Para confirmar la ubicación exacta: en REAPER, **Options → Show REAPER
resource path in explorer/finder**.

## Uso

En AUDIAR podés enviar:

- **Por sonido:** botón "Enviar a REAPER" dentro de cada layer.
- **Varios juntos:** tildá los sonidos y usá "Enviar selección a REAPER".

### Organización en REAPER

Cada sonido enviado crea **su propia pista**. El nombre de la pista es el
nombre del sonido.

Las pistas se colorean automáticamente según la categoría:

- **Ambientes:** azul.
- **SFX:** naranja.
- **Foley:** verde.

Los sonidos del mismo lote se insertan juntos en una única operación de
REAPER, para que una selección grande sea más rápida de importar.

El volumen y paneo configurados en AUDIAR se aplican al ítem importado.

## Qué NO hace esta versión

Sin timeline, sin sincronización con video, sin fades, sin automatización,
sin render y sin stems — REAPER sigue siendo donde se edita y mezcla de
verdad.

## Solución de problemas

- **"No se encontró REAPER Bridge"**: el bridge (`npm start`) no está
  corriendo, o corre en otro puerto.
- **El bridge dice "Enviado" pero no aparece nada en REAPER**: verificá que
  `audiar-bridge.lua` esté cargado y ejecutándose en REAPER.
- **Los archivos están en `cache` pero no aparecen en REAPER**: revisá la
  consola de REAPER. Los trabajos pendientes quedan momentáneamente en
  `audiar-bridge/jobs`.
- **Los sonidos aparecen pero con un volumen/pan inesperados**: revisá los
  valores configurados en AUDIAR antes de enviar.
