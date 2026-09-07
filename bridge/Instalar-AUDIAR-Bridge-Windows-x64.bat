@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: AUDIAR REAPER Bridge - Windows x64 one-click installer
:: Installs Node.js LTS, downloads the current bridge, installs npm dependencies,
:: copies the ReaScript to the user's REAPER Scripts folder, and creates a launcher.

title AUDIAR REAPER Bridge - Instalador

set "INSTALL_DIR=%LOCALAPPDATA%\AUDIAR\REAPER-Bridge"
set "ZIP_FILE=%TEMP%\AUDIAR-main.zip"
set "NODE_VERSION=24.20.0"
set "NODE_MSI=%TEMP%\node-v%NODE_VERSION%-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x64.msi"
set "REPO_ZIP=https://github.com/rnalvarez/AUDIAR/archive/refs/heads/main.zip"
set "REAPER_SCRIPTS=%APPDATA%\REAPER\Scripts\AUDIAR"

:: ---- Require Windows x64 ----
if /I not "%PROCESSOR_ARCHITECTURE%"=="AMD64" if /I not "%PROCESSOR_IDENTIFIER%"=="AMD64 Family 23 Model 1 Stepping 2, AuthenticAMD" (
  echo.
  echo Este instalador es exclusivamente para Windows x64.
  echo Arquitectura detectada: %PROCESSOR_ARCHITECTURE%
  pause
  exit /b 1
)

:: ---- Require elevation ----
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permisos de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

color 0B
cls
echo ============================================================
echo              AUDIAR REAPER Bridge - Windows x64
echo ============================================================
echo.
echo Este instalador va a:
echo   1. Instalar Node.js %NODE_VERSION% LTS si hace falta.
echo   2. Descargar la version actual del Bridge de AUDIAR.
echo   3. Instalar sus dependencias npm.
echo   4. Copiar el script de REAPER.
echo   5. Crear un acceso directo para iniciar el Bridge.
echo.

:: ---- Check Node ----
where node >nul 2>&1
if "%errorlevel%"=="0" (
  for /f "delims=" %%V in ('node -v') do set "NODE_INSTALLED=%%V"
  echo Node.js detectado: !NODE_INSTALLED!
) else (
  echo Node.js no esta instalado. Descargando Node.js %NODE_VERSION% LTS...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%'"
  if not exist "%NODE_MSI%" (
    echo ERROR: no se pudo descargar Node.js.
    pause
    exit /b 1
  )
  echo Instalando Node.js...
  msiexec /i "%NODE_MSI%" /qn /norestart
  if not "%errorlevel%"=="0" (
    echo ERROR: la instalacion de Node.js devolvio el codigo %errorlevel%.
    pause
    exit /b 1
  )
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  echo Node.js instalado correctamente.
)

:: ---- Download current AUDIAR repository ----
echo.
echo Descargando AUDIAR desde GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%REPO_ZIP%' -OutFile '%ZIP_FILE%'"
if not exist "%ZIP_FILE%" (
  echo ERROR: no se pudo descargar AUDIAR.
  pause
  exit /b 1
)

:: ---- Clean/install bridge ----
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%"

set "EXTRACT_DIR=%TEMP%\AUDIAR-extract-%RANDOM%"
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"
if not exist "%EXTRACT_DIR%" (
  echo ERROR: no se pudo descomprimir AUDIAR.
  pause
  exit /b 1
)

for /d %%D in ("%EXTRACT_DIR%\AUDIAR-main*") do set "REPO_DIR=%%~fD"
if not defined REPO_DIR (
  echo ERROR: no se encontro la carpeta del repositorio descargado.
  pause
  exit /b 1
)

xcopy "%REPO_DIR%\bridge\*" "%INSTALL_DIR%\" /E /I /Y >nul
if not exist "%INSTALL_DIR%\package.json" (
  echo ERROR: no se encontro bridge\package.json.
  pause
  exit /b 1
)

:: ---- npm dependencies ----
echo Instalando dependencias del Bridge...
cd /d "%INSTALL_DIR%"
call npm install
if not "%errorlevel%"=="0" (
  echo ERROR: npm install fallo.
  pause
  exit /b 1
)

:: ---- REAPER Lua script ----
echo.
echo Instalando script de REAPER...
mkdir "%REAPER_SCRIPTS%" 2>nul
copy /Y "%INSTALL_DIR%\audiar-bridge.lua" "%REAPER_SCRIPTS%\audiar-bridge.lua" >nul
if not exist "%REAPER_SCRIPTS%\audiar-bridge.lua" (
  echo AVISO: no se pudo copiar automaticamente el script de REAPER.
  echo Podras cargarlo manualmente desde:
  echo %INSTALL_DIR%\audiar-bridge.lua
)

:: ---- Launcher ----
set "LAUNCHER=%INSTALL_DIR%\Iniciar-AUDIAR-Bridge.bat"
>\"%LAUNCHER%" echo @echo off
>>"%LAUNCHER%" echo title AUDIAR REAPER Bridge
>>"%LAUNCHER%" echo cd /d "%INSTALL_DIR%"
>>"%LAUNCHER%" echo set "PATH=%ProgramFiles%\nodejs;%%PATH%%"
>>"%LAUNCHER%" echo echo.
>>"%LAUNCHER%" echo echo AUDIAR REAPER Bridge escuchando en http://localhost:8765
>>"%LAUNCHER%" echo echo Deja esta ventana abierta mientras uses AUDIAR.
>>"%LAUNCHER%" echo echo.
>>"%LAUNCHER%" echo call npm start
>>"%LAUNCHER%" echo pause

:: ---- Desktop shortcut ----
echo Creando acceso directo en el escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AUDIAR REAPER Bridge.lnk'); $sc.TargetPath='%LAUNCHER%'; $sc.WorkingDirectory='%INSTALL_DIR%'; $sc.IconLocation='%SystemRoot%\System32\SHELL32.dll,137'; $sc.Save()"

:: ---- Optional README ----
copy /Y "%REPO_DIR%\bridge\README.md" "%INSTALL_DIR%\README.md" >nul 2>&1

:: ---- Cleanup ----
del /q "%ZIP_FILE%" >nul 2>&1
rmdir /s /q "%EXTRACT_DIR%" >nul 2>&1
del /q "%NODE_MSI%" >nul 2>&1

cls
echo ============================================================
echo                 INSTALACION COMPLETADA
 echo ============================================================
echo.
echo Bridge instalado en:
echo %INSTALL_DIR%
echo.
echo Script de REAPER:
echo %REAPER_SCRIPTS%\audiar-bridge.lua
echo.
echo En el escritorio se creo:
echo AUDIAR REAPER Bridge.lnk
echo.
echo PROXIMO PASO:
echo 1. Abri REAPER.
echo 2. Actions - Show action list.
echo 3. New action - Load ReaScript.
echo 4. Carga audiar-bridge.lua desde:
echo    %REAPER_SCRIPTS%\audiar-bridge.lua
echo 5. Ejecutalo una vez.
echo 6. Inicia el Bridge desde el acceso directo del escritorio.
echo.
echo Cuando la consola muestre:
echo   AUDIAR REAPER Bridge escuchando en http://localhost:8765
echo ya podes usar "Enviar seleccion a REAPER" desde AUDIAR.
echo.
pause
exit /b 0
