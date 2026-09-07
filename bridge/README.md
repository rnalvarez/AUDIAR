# AUDIAR REAPER Bridge

Deja enviar sonidos desde AUDIAR directo a un proyecto de REAPER. Corre
100% en tu máquina — ni el bridge ni el script de REAPER hablan con
internet.

## Por qué existe esto

Una app web no puede escribir dentro de un proyecto de REAPER
directamente. El bridge es el intermediario: recibe el pedido de AUDIAR,
descarga los audios, y dejan un archivo de "trabajo" en una carpeta que un
script corriendo dentro de REAPER vigila. Ese script (Lua, ReaScript) es
el que efectivamente crea las pistas e inserta los sonidos.

**Limitación de esta primera versión:** cuando AUDIAR dice "Enviado a
REAPER", significa que el bridge dejó el pedido listo — no hay
confirmación de que REAPER ya lo insertó. Si el script de REAPER no está
corriendo, el archivo va a quedar esperando en la carpeta de trabajos
hasta que lo actives.

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
5. Con el script seleccionado en la lista, click **Run**. La consola de
   REAPER (se abre sola) debería mostrar:
   ```
   [AUDIAR Bridge] Activo. Escuchando trabajos en: <tu carpeta de REAPER>/audiar-bridge/jobs
   ```
6. Para que quede corriendo siempre que abrís REAPER: en el Action List,
   click derecho sobre el script → **Run on startup** (o agregalo a un
   toolbar/atajo si preferís activarlo manualmente cada vez).

El script queda corriendo en segundo plano (no abre ninguna ventana) y
revisa la carpeta de trabajos una vez por segundo.

### 3. Correr el bridge

```bash
cd bridge
npm start
```

Deja esta terminal abierta mientras usás AUDIAR. Vas a ver:

```
AUDIAR REAPER Bridge escuchando en http://localhost:8765
Carpeta de trabajos: <tu carpeta de REAPER>/audiar-bridge/jobs
```

### 4. Confirmar que las carpetas coinciden

El bridge asume la ubicación estándar del resource path de REAPER según
tu sistema operativo (macOS: `~/Library/Application Support/REAPER`,
Windows: `%APPDATA%\REAPER`, Linux: `~/.config/REAPER`). Para confirmar
cuál es la tuya: en REAPER, **Options → Show REAPER resource path in
explorer/finder**. Si no coincide con lo que imprimió el bridge al
arrancar, corré el bridge así:

```bash
AUDIAR_REAPER_RESOURCE_PATH="/ruta/que/te/mostró/REAPER" npm start
```

## Uso

Con el bridge corriendo y el script activo en REAPER, en AUDIAR:

- Por sonido: botón "Enviar a REAPER" en cada `Layer`.
- Varios juntos: tildá el checkbox de cada uno y usá "Enviar selección a
  REAPER" (aparece arriba de la grilla cuando hay algo tildado).

Cada sonido enviado crea (o reutiliza, si ya existe) la pista
Ambientes/Efectos/Foley/Diálogos correspondiente, e inserta el audio al
final de lo que ya haya en esa pista — sin sincronizar por tiempo todavía,
solo evitando que se pisen entre sí.

## Qué NO hace esta primera versión

Sin timeline, sin sincronización con video, sin fades, sin automatización,
sin render, sin stems — a propósito. AUDIAR sigue siendo la herramienta de
análisis/diseño/búsqueda; REAPER es donde se edita y mezcla de verdad.

## Solución de problemas

- **"No se encontró REAPER Bridge"**: el bridge (`npm start`) no está
  corriendo, o corre en otro puerto. Confirmá que la terminal siga abierta.
- **El bridge dice "Enviado" pero no aparece nada en REAPER**: el script
  Lua no está corriendo. Volvé al paso 2 y confirmá que la consola de
  REAPER muestre el mensaje "Activo".
- **Aparece en una pista pero suena distinto/corrupto**: revisá que el
  archivo se haya descargado bien en la carpeta `cache` (junto a `jobs`,
  dentro de `audiar-bridge`).
