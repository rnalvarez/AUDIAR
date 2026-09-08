-- AUDIAR REAPER Bridge — ReaScript (Lua)
--
-- Corre DENTRO de REAPER, en loop (reaper.defer), y revisa la carpeta de
-- trabajos que escribe bridge/index.ts. Cada sonido se inserta en SU PROPIA
-- PISTA, con color según categoría. Todos los jobs pendientes del mismo
-- ciclo de polling se consideran un único bloque y comparten el mismo
-- timecode de inserción.

local SEP = package.config:sub(1, 1)
local resource_path = reaper.GetResourcePath()
local JOBS_DIR = resource_path .. SEP .. "audiar-bridge" .. SEP .. "jobs"
local POLL_INTERVAL_SEC = 0.25
local POSITION_EPSILON = 0.000001

local function log(msg)
  reaper.ShowConsoleMsg("[AUDIAR Bridge] " .. tostring(msg) .. "\n")
end

local function sanitizeTrackName(name)
  name = tostring(name or "Sonido")
  name = name:gsub("[%c]", " ")
  name = name:gsub("%s+", " ")
  name = name:gsub("^%s+", ""):gsub("%s+$", "")
  return name ~= "" and name or "Sonido"
end

local CATEGORY_COLORS = {
  Ambientes = reaper.ColorToNative(78, 116, 179) | 0x1000000,
  SFX = reaper.ColorToNative(179, 116, 78) | 0x1000000,
  Efectos = reaper.ColorToNative(179, 116, 78) | 0x1000000,
  Foley = reaper.ColorToNative(106, 160, 91) | 0x1000000,
  Dialogos = reaper.ColorToNative(150, 110, 170) | 0x1000000,
  ["Diálogos"] = reaper.ColorToNative(150, 110, 170) | 0x1000000,
}

local function createTrack(sound)
  local trackName = sanitizeTrackName(sound.name)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, true)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", trackName, true)

  local color = CATEGORY_COLORS[sound.track]
  if color then
    reaper.SetMediaTrackInfo_Value(track, "I_CUSTOMCOLOR", color)
  end
  return track
end

local function dbToLinear(db)
  return 10 ^ (db / 20)
end

local function normalizePath(value)
  return tostring(value or ""):gsub("/", "\\"):lower()
end

-- Comprueba si REAPER ya tiene exactamente este archivo en este timecode.
-- El mismo sonido puede volver a insertarse en otro timecode, pero no se
-- duplica en la misma posición.
local function mediaItemExistsAtPosition(soundPath, insertPosition)
  local wanted = normalizePath(soundPath)
  for trackIndex = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, trackIndex)
    for itemIndex = 0, reaper.CountTrackMediaItems(track) - 1 do
      local item = reaper.GetTrackMediaItem(track, itemIndex)
      local position = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
      if math.abs(position - insertPosition) <= POSITION_EPSILON then
        local take = reaper.GetActiveTake(item)
        if take then
          local source = reaper.GetMediaItemTake_Source(take)
          if source then
            local sourcePath = reaper.GetMediaSourceFileName(source, "")
            if normalizePath(sourcePath) == wanted then
              return true
            end
          end
        end
      end
    end
  end
  return false
end

local function insertSound(sound, insertPosition)
  local ok, err = pcall(function()
    if mediaItemExistsAtPosition(sound.path, insertPosition) then
      log("Omitido (ya existe en ese timecode): " .. tostring(sound.name))
      return
    end

    local track = createTrack(sound)

    -- Importación nativa de REAPER para conservar la generación normal de peaks.
    -- Se recoloca el cursor ANTES de cada importación para que InsertMedia no
    -- arrastre al siguiente sonido a una posición posterior.
    reaper.SetOnlyTrackSelected(track)
    reaper.SetEditCurPos(insertPosition, false, false)
    reaper.InsertMedia(sound.path, 0)

    local item = reaper.GetTrackMediaItem(track, reaper.CountTrackMediaItems(track) - 1)
    if not item then
      log("REAPER no pudo insertar el archivo: " .. tostring(sound.path))
      return
    end

    local take = reaper.GetActiveTake(item)
    if not take then
      log("REAPER insertó el archivo pero no creó un take: " .. tostring(sound.path))
      return
    end

    reaper.SetMediaItemInfo_Value(item, "D_POSITION", insertPosition)

    if type(sound.gainDb) == "number" then
      reaper.SetMediaItemInfo_Value(item, "D_VOL", dbToLinear(sound.gainDb))
    end
    if type(sound.pan) == "number" then
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
    if fn:match("%.lua$") then table.insert(files, fn) end
    i = i + 1
  end
  table.sort(files)
  return files
end

local function loadJob(filename)
  local fullPath = JOBS_DIR .. SEP .. filename
  local chunk, loadErr = loadfile(fullPath)
  if not chunk then
    log("No se pudo leer el trabajo " .. filename .. ": " .. tostring(loadErr))
    os.remove(fullPath)
    return nil
  end

  local ok, job = pcall(chunk)
  if not ok or type(job) ~= "table" then
    log("Trabajo con formato inválido: " .. filename)
    os.remove(fullPath)
    return nil
  end

  os.remove(fullPath)
  return job
end

local function processPendingJobs()
  local files = listJobFiles()
  if #files == 0 then return end

  -- MUY IMPORTANTE: todos los jobs pendientes se reúnen antes de capturar
  -- el cursor. Así, aunque el Bridge haya escrito un .lua por sonido,
  -- todos los archivos de un mismo envío quedan verticalmente alineados.
  local insertPosition = reaper.GetCursorPosition()
  local sounds = {}

  for _, filename in ipairs(files) do
    local job = loadJob(filename)
    if job then
      for _, sound in ipairs(job) do
        table.insert(sounds, sound)
      end
    end
  end

  if #sounds == 0 then return end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)

  for _, sound in ipairs(sounds) do
    insertSound(sound, insertPosition)
  end

  reaper.PreventUIRefresh(-1)
  reaper.SetEditCurPos(insertPosition, false, false)
  reaper.Undo_EndBlock("AUDIAR: insertar bloque de sonidos", -1)
  reaper.UpdateArrange()

  log("Procesados " .. tostring(#sounds) .. " sonido/s como bloque en " .. string.format("%.3f s", insertPosition))
end

local function ensureJobsDir()
  reaper.RecursiveCreateDirectory(JOBS_DIR, 0)
end

local lastPollTime = 0
local function poll()
  local now = reaper.time_precise()
  if now - lastPollTime >= POLL_INTERVAL_SEC then
    lastPollTime = now
    processPendingJobs()
  end
  reaper.defer(poll)
end

ensureJobsDir()
log("Activo. Escuchando trabajos en: " .. JOBS_DIR)
poll()
