@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

if not exist "package.json" (
  echo Error: package.json not found in: %CD%
  echo Place run.bat in the repo root ^(same folder as package.json^) and re-run.
  exit /b 1
)

rem -------------------------
rem Node/npm presence checks
rem -------------------------
where node >nul 2>nul
if errorlevel 1 (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Node.js is not installed or not on PATH.
    goto :install_help
  )
  echo Node.js not found. Attempting to install Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo winget install failed.
    goto :install_help
  )
  set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was installed but is still not on PATH in this terminal.
    echo Please re-open your terminal and re-run: run.bat
    exit /b 1
  )
)

where npm >nul 2>nul
if errorlevel 1 (
  set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
  where npm >nul 2>nul
  if errorlevel 1 (
    echo npm is not installed or not on PATH.
    goto :install_help
  )
)

rem Recommend Node >= 18
for /f "usebackq delims=" %%v in (`node -p "process.versions.node" 2^>nul`) do set "NODE_VER=%%v"
for /f "tokens=1 delims=." %%m in ("%NODE_VER%") do set "NODE_MAJOR=%%m"
if "%NODE_MAJOR%"=="" set "NODE_MAJOR=0"
for /f "delims=0123456789" %%x in ("%NODE_MAJOR%") do set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 18 (
  echo Warning: Node.js ^>= 18 is recommended. Detected: %NODE_VER%
)

set "npm_config_package_lock=false"
set "npm_config_fund=false"
set "npm_config_audit=false"

echo Installing dependencies (no lockfile)...
call npm install --no-package-lock
if errorlevel 1 exit /b 1

if "%PORT%"=="" set "PORT=3001"
echo Building ^+ serving the static app on http://localhost:%PORT% ...
echo (Set PORT/HOST env vars to customize.)
call npm run preview
exit /b %errorlevel%

:install_help
echo.
echo Node.js + npm are required to run Neuradventure.
echo.
echo Install options:
echo   - Windows (winget): winget install -e --id OpenJS.NodeJS.LTS
echo   - Manual:           https://nodejs.org/en/download
echo.
echo After installing, re-open your terminal and re-run: run.bat
echo.
exit /b 1
