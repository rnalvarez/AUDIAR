-- AUDIAR REAPER Bridge — ReaScript (Lua)
--
-- Corre DENTRO de REAPER, en loop (reaper.defer), y revisa la carpeta de
-- trabajos que escribe bridge/index.ts. Por cada trabajo: busca o crea la
-- pista correspondiente (Ambientes/Efectos/Foley/Diálogos), inserta cada
-- sonido como Media Item al final de lo que ya haya en esa pista (nunca
-- se pisan entre sí — no hay sincronización por tiempo en esta versión,
-- solo evita solapamientos), y aplica gain/pan.
--
-- Funciones de REAPER usadas acá, todas verificadas contra documentación
-- oficial y ReaScripts publicados (no inventadas):
--   InsertTrackAtIndex, GetTrack, GetSetMediaTrackInfo_String,
--   CountTracks, AddMediaItemToTrack, AddTakeToMediaItem,
--   PCM_Source_CreateFromFileEx, GetMediaSourceLength,
--   SetMediaItemTake_Source, GetSetMediaItemTakeInfo_String,
--   SetMediaItemInfo_Value, SetMediaItemTakeInfo_Value,
--   GetMediaTrackInfo_Value, CountTrackMediaItems, GetTrackMediaItem,
--   UpdateArrange, defer.
--
-- Instalación: ver bridge/README.md.

local SEP = package.config:sub(1, 1) -- "\\" en Windows, "/" en Mac/Linux
local resource_path = reaper.GetResourcePath()
local JOBS_DIR = resource_path .. SEP .. "audiar-bridge" .. SEP .. "jobs"
local POLL_INTERVAL_SEC = 1.0

local TRACK_ORDER = { "Ambientes", "Efectos", "Foley", "Diálogos" }

local function log(msg)
  reaper.ShowConsoleMsg("[AUDIAR Bridge] " .. tostring(msg) .. "\n")
end

-- Busca una pista por nombre exacto; si no existe, la crea al final del
-- orden esperado (Ambientes/Efectos/Foley/Diálogos) para mantener el
-- proyecto organizado igual que en AUDIAR.
local function findOrCreateTrack(name)
  local count = reaper.CountTracks(0)
  for i = 0, count - 1 do
    local tr = reaper.GetTrack(0, i)
    local _, trName = reaper.GetSetMediaTrackInfo_String(tr, "P_NAME", "", false)
    if trName == name then
      return tr
    end
  end
  -- No existe: se crea al final.
  local newIndex = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(newIndex, true)
  local tr = reaper.GetTrack(0, newIndex)
  reaper.GetSetMediaTrackInfo_String(tr, "P_NAME", name, true)
  return tr
end

-- Posición al final de lo que ya haya en la pista, para que los items
-- nunca se solapen. Sin sincronización por tiempo: es solo "un lugar
-- claramente definido", como pidió RAM para esta primera versión.
local function nextFreePosition(track)
  local itemCount = reaper.CountTrackMediaItems(track)
  if itemCount == 0 then
    return 0.0
  end
  local lastItem = reaper.GetTrackMediaItem(track, itemCount - 1)
  local pos = reaper.GetMediaItemInfo_Value(lastItem, "D_POSITION")
  local len = reaper.GetMediaItemInfo_Value(lastItem, "D_LENGTH")
  return pos + len
end

local function dbToLinear(db)
  return 10 ^ (db / 20)
end

-- sound = { path=string, track=string, name=string, gainDb=number|nil, pan=number|nil }
local function insertSound(sound)
  local ok, err = pcall(function()
    local track = findOrCreateTrack(sound.track)
    local pos = nextFreePosition(track)

    local src = reaper.PCM_Source_CreateFromFileEx(sound.path, false)
    if not src then
      log("No se pudo leer el archivo: " .. tostring(sound.path))
      return
    end
    local srcLen = reaper.GetMediaSourceLength(src)

    local item = reaper.AddMediaItemToTrack(track)
    local take = reaper.AddTakeToMediaItem(item)
    reaper.SetMediaItemTake_Source(take, src)
    reaper.SetMediaItemInfo_Value(item, "D_POSITION", pos)
    reaper.SetMediaItemInfo_Value(item, "D_LENGTH", srcLen)

    if sound.gainDb then
      reaper.SetMediaItemInfo_Value(item, "D_VOL", dbToLinear(sound.gainDb))
    end
    if sound.pan then
      reaper.SetMediaItemTakeInfo_Value(take, "D_PAN", sound.pan)
    end
    if sound.name then
      reaper.GetSetMediaItemTakeInfo_String(take, "P_NAME", sound.name, true)
    end
  end)
  if not ok then
    log("Error insertando sonido: " .. tostring(err))
  end
end

local function listJobFiles()
  local files = {}
  local i = 0
  while true do
    local fn = reaper.EnumerateFiles(JOBS_DIR, i)
    if not fn then break end
    if fn:match("%.lua$") then
      table.insert(files, fn)
    end
    i = i + 1
  end
  return files
end

local function processJobFile(filename)
  local fullPath = JOBS_DIR .. SEP .. filename
  local chunk, loadErr = loadfile(fullPath)
  if not chunk then
    log("No se pudo leer el trabajo " .. filename .. ": " .. tostring(loadErr))
    os.remove(fullPath)
    return
  end
  local ok, job = pcall(chunk)
  if not ok or type(job) ~= "table" then
    log("Trabajo con formato inválido: " .. filename)
    os.remove(fullPath)
    return
  end

  reaper.Undo_BeginBlock()
  for _, sound in ipairs(job) do
    insertSound(sound)
  end
  reaper.Undo_EndBlock("AUDIAR: insertar sonidos enviados", -1)
  reaper.UpdateArrange()

  os.remove(fullPath)
  log("Procesado: " .. filename .. " (" .. #job .. " sonido/s)")
end

local function ensureJobsDir()
  reaper.RecursiveCreateDirectory(JOBS_DIR, 0)
end

local lastPollTime = 0

local function poll()
  local now = os.clock()
  if now - lastPollTime >= POLL_INTERVAL_SEC then
    lastPollTime = now
    local files = listJobFiles()
    for _, fn in ipairs(files) do
      processJobFile(fn)
    end
  end
  -- reaper.defer nunca debe bloquear: se reprograma de una en cada ciclo,
  -- y el chequeo de arriba es lo único que decide si toca trabajar o no.
  reaper.defer(poll)
end

ensureJobsDir()
log("Activo. Escuchando trabajos en: " .. JOBS_DIR)
poll()
