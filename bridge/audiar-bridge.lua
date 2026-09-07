-- AUDIAR REAPER Bridge — ReaScript (Lua)
--
-- Corre DENTRO de REAPER, en loop (reaper.defer), y revisa la carpeta de
-- trabajos que escribe bridge/index.ts. Cada sonido se inserta en SU PROPIA
-- PISTA, con color según categoría.

local SEP = package.config:sub(1, 1)
local resource_path = reaper.GetResourcePath()
local JOBS_DIR = resource_path .. SEP .. "audiar-bridge" .. SEP .. "jobs"
local POLL_INTERVAL_SEC = 0.25

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

local function insertSound(sound)
  local ok, err = pcall(function()
    local track = createTrack(sound)
    local src = reaper.PCM_Source_CreateFromFileEx(sound.path, false)
    if not src then
      log("No se pudo leer el archivo: " .. tostring(sound.path))
      return
    end

    local srcLen = reaper.GetMediaSourceLength(src)
    local item = reaper.AddMediaItemToTrack(track)
    local take = reaper.AddTakeToMediaItem(item)
    reaper.SetMediaItemTake_Source(take, src)
    reaper.SetMediaItemInfo_Value(item, "D_POSITION", 0.0)
    reaper.SetMediaItemInfo_Value(item, "D_LENGTH", srcLen)

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
  reaper.PreventUIRefresh(1)
  for _, sound in ipairs(job) do
    insertSound(sound)
  end
  reaper.PreventUIRefresh(-1)
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
  local now = reaper.time_precise()
  if now - lastPollTime >= POLL_INTERVAL_SEC then
    lastPollTime = now
    for _, fn in ipairs(listJobFiles()) do
      processJobFile(fn)
    end
  end
  reaper.defer(poll)
end

ensureJobsDir()
log("Activo. Escuchando trabajos en: " .. JOBS_DIR)
poll()
