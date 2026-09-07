@echo off
setlocal EnableExtensions EnableDelayedExpansion
title AUDIAR REAPER Bridge - Instalador Windows x64

set "LOG=%TEMP%\AUDIAR-Bridge-Install.log"
set "INSTALL_DIR=%LOCALAPPDATA%\AUDIAR\REAPER-Bridge"
set "ZIP_FILE=%TEMP%\AUDIAR-main.zip"
set "EXTRACT_DIR=%TEMP%\AUDIAR-extract-%RANDOM%"
set "NODE_VERSION=24.20.0"
set "NODE_MSI=%TEMP%\node-v%NODE_VERSION%-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x64.msi"
set "REPO_ZIP=https://github.com/rnalvarez/AUDIAR/archive/refs/heads/main.zip"
set "REAPER_SCRIPTS=%APPDATA%\REAPER\Scripts\AUDIAR"
set "LAUNCHER=%INSTALL_DIR%\Iniciar-AUDIAR-Bridge.bat"

> "%LOG%" echo [AUDIAR] Actualizacion/instalacion iniciada %date% %time%
call :main
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (
  echo ============================================================
  echo INSTALACION / ACTUALIZACION COMPLETADA
  echo ============================================================
  echo.
  echo Bridge instalado en:
  echo   %INSTALL_DIR%
  echo.
  echo Script actualizado de REAPER:
  echo   %REAPER_SCRIPTS%\audiar-bridge.lua
  echo.
  echo Se actualizo el Bridge para:
  echo   - importar cada sonido en su propia pista
  echo   - colorear las pistas por categoria
  echo   - procesar el polling de REAPER con mayor rapidez
  echo.
  echo IMPORTANTE:
  echo   Si REAPER ya tenia cargado el Lua anterior, detenelo y volve a
  echo   cargar/ejecutar la nueva copia desde Actions ^> Show action list.
  echo.
) else (
  echo ============================================================
  echo LA INSTALACION NO TERMINO CORRECTAMENTE
  echo ============================================================
  echo.
  echo Codigo de error: %RC%
  echo.
  echo El instalador NO se va a cerrar para que puedas leer el error.
  echo Registro:
  echo   %LOG%
)
echo.
pause
exit /b %RC%

:main
set "ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "ARCH=%PROCESSOR_ARCHITEW6432%"
if /I not "%ARCH%"=="AMD64" (
  call :fail 10 "Este instalador requiere Windows x64 (AMD64). Arquitectura detectada: %ARCH%"
  exit /b 10
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  call :fail 11 "No se encontro PowerShell."
  exit /b 11
)

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo Se necesitan permisos de administrador para instalar Node.js.
  echo Se abrira una segunda ventana elevada.
  echo.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/c','\"\"%~f0\"\" --elevated' -Wait"
  if errorlevel 1 (
    call :fail 12 "No se pudo solicitar permisos de administrador o la instalacion elevada fue cancelada."
    exit /b 12
  )
  exit /b 0
)

echo [AUDIAR] Ejecutando como administrador.
>> "%LOG%" echo [AUDIAR] Ejecutando como administrador.

set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
)

if defined NODE_EXE (
  for /f "delims=" %%V in ('"%NODE_EXE%" -v 2^>nul') do set "NODE_INSTALLED=%%V"
  echo Node.js detectado: !NODE_INSTALLED!
  >> "%LOG%" echo [AUDIAR] Node.js detectado: !NODE_INSTALLED!
) else (
  echo.
  echo Node.js no esta instalado.
  echo Descargando Node.js %NODE_VERSION% LTS...
  >> "%LOG%" echo [AUDIAR] Descargando %NODE_URL%

  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%NODE_URL%' -OutFile '%NODE_MSI%'"
  if errorlevel 1 (
    call :fail 20 "No se pudo descargar Node.js. Revisa tu conexion a Internet."
    exit /b 20
  )

  if not exist "%NODE_MSI%" (
    call :fail 21 "La descarga de Node.js no produjo el archivo MSI."
    exit /b 21
  )

  echo Instalando Node.js...
  >> "%LOG%" echo [AUDIAR] Instalando Node.js
  msiexec.exe /i "%NODE_MSI%" /passive /norestart
  if errorlevel 1 (
    call :fail 22 "La instalacion de Node.js fallo. Codigo MSI: %errorlevel%"
    exit /b 22
  )

  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

  if not exist "%NODE_EXE%" (
    call :fail 23 "Node.js termino de instalarse pero node.exe no aparece en Program Files."
    exit /b 23
  )

  for /f "delims=" %%V in ('"%NODE_EXE%" -v 2^>nul') do set "NODE_INSTALLED=%%V"
  echo Node.js instalado: !NODE_INSTALLED!
)

echo.
echo Descargando AUDIAR...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%REPO_ZIP%' -OutFile '%ZIP_FILE%'"
if errorlevel 1 (
  call :fail 30 "No se pudo descargar AUDIAR desde GitHub."
  exit /b 30
)
if not exist "%ZIP_FILE%" (
  call :fail 31 "No se encontro el ZIP descargado de AUDIAR."
  exit /b 31
)

if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
mkdir "%EXTRACT_DIR%" >nul 2>&1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"
if errorlevel 1 (
  call :fail 32 "No se pudo descomprimir AUDIAR."
  exit /b 32
)

set "REPO_DIR="
for /d %%D in ("%EXTRACT_DIR%\AUDIAR-main*") do if not defined REPO_DIR set "REPO_DIR=%%~fD"

if not defined REPO_DIR (
  call :fail 33 "No se encontro la carpeta AUDIAR-main despues de descomprimir."
  exit /b 33
)

if not exist "%REPO_DIR%\bridge\package.json" (
  call :fail 34 "No se encontro bridge\package.json."
  exit /b 34
)
if not exist "%REPO_DIR%\bridge\index.ts" (
  call :fail 35 "No se encontro bridge\index.ts."
  exit /b 35
)
if not exist "%REPO_DIR%\bridge\audiar-bridge.lua" (
  call :fail 36 "No se encontro bridge\audiar-bridge.lua."
  exit /b 36
)

rem --- Reemplazar la copia local por la version actual del repositorio ---
echo.
echo Actualizando AUDIAR REAPER Bridge...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%" >nul 2>&1
xcopy "%REPO_DIR%\bridge\*" "%INSTALL_DIR%\" /E /I /Y >nul
if errorlevel 1 (
  call :fail 40 "No se pudieron copiar los archivos del Bridge."
  exit /b 40
)

cd /d "%INSTALL_DIR%"

echo Instalando dependencias npm...
call "%ProgramFiles%\nodejs\npm.cmd" install
if errorlevel 1 (
  call :fail 41 "npm install fallo. Revisa el registro: %LOG%"
  exit /b 41
)

rem --- Instalar ReaScript actualizado ---
echo.
echo Actualizando script de REAPER...
mkdir "%REAPER_SCRIPTS%" >nul 2>&1
copy /Y "%INSTALL_DIR%\audiar-bridge.lua" "%REAPER_SCRIPTS%\audiar-bridge.lua" >nul
if errorlevel 1 (
  call :fail 51 "No se pudo copiar el ReaScript a la carpeta de REAPER."
  exit /b 51
)

rem --- Crear lanzador ---
(
  echo @echo off
  echo title AUDIAR REAPER Bridge
  echo cd /d "%INSTALL_DIR%"
  echo set "PATH=%ProgramFiles%\nodejs;%%PATH%%"
  echo echo.
  echo echo ============================================================
  echo echo AUDIAR REAPER Bridge
  echo echo Escuchando en http://localhost:8765
  echo echo Deja esta ventana abierta mientras uses AUDIAR.
  echo echo ============================================================
  echo echo.
  echo call npm start
  echo echo.
  echo echo El Bridge termino. Presiona una tecla para cerrar.
  echo pause
) > "%LAUNCHER%"

if not exist "%LAUNCHER%" (
  call :fail 60 "No se pudo crear el lanzador del Bridge."
  exit /b 60
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AUDIAR REAPER Bridge.lnk'); $sc.TargetPath='%LAUNCHER%'; $sc.WorkingDirectory='%INSTALL_DIR%'; $sc.IconLocation='%SystemRoot%\System32\SHELL32.dll,137'; $sc.Save()"
if errorlevel 1 (
  echo AVISO: no se pudo crear el acceso directo. El Bridge igualmente quedo instalado.
  >> "%LOG%" echo [AUDIAR] Aviso: no se pudo crear acceso directo.
)

if exist "%REPO_DIR%\bridge\README.md" copy /Y "%REPO_DIR%\bridge\README.md" "%INSTALL_DIR%\README.md" >nul

del /q "%ZIP_FILE%" >nul 2>&1
del /q "%NODE_MSI%" >nul 2>&1
rmdir /s /q "%EXTRACT_DIR%" >nul 2>&1

>> "%LOG%" echo [AUDIAR] Instalacion/actualizacion completada %date% %time%
exit /b 0

:fail
echo.
echo ERROR %~1:
echo %~2
>> "%LOG%" echo [ERROR %~1] %~2
exit /b %~1
