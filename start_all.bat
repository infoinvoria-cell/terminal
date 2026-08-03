@echo off
title Capitalife System
color 0A

echo === CAPITALIFE SYSTEM START ===

set "ROOT=C:\Users\joris\Documents\Capitalife Terminal"
set "ENGINE_ROOT=C:\Users\joris\Documents\Capitalife Engine"
set "APP_URL=http://localhost:3000"

REM Prüfe ob bereits läuft
netstat -an | findstr ":3000" >nul 2>&1
if %errorlevel%==0 (
    echo Terminal laeuft bereits.
    start "" chrome "%APP_URL%"
    exit /b 0
)

REM Alte Prozesse beenden
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Obsidian
set "OBSIDIAN_EXE="
if exist "%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe"
if not defined OBSIDIAN_EXE if exist "%LOCALAPPDATA%\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%LOCALAPPDATA%\Obsidian\Obsidian.exe"
if defined OBSIDIAN_EXE (
    start "" "%OBSIDIAN_EXE%" >nul 2>&1
    echo Obsidian gestartet.
) else (
    echo Obsidian nicht gefunden.
)
timeout /t 2 /nobreak >nul

REM Flask Bridge
netstat -an | findstr ":5000" >nul 2>&1
if not %errorlevel%==0 (
    start "Flask" /min cmd /k "cd /d %ENGINE_ROOT%\bridge && python app.py"
    echo Flask gestartet.
    timeout /t 4 /nobreak >nul
) else (
    echo Flask laeuft bereits.
)

REM Sentinel Proxy
netstat -an | findstr ":8080" >nul 2>&1
if not %errorlevel%==0 (
    start "Proxy" /min cmd /k "cd /d %ENGINE_ROOT%\sentinel_proxy && python proxy.py"
    echo Sentinel Proxy gestartet.
    timeout /t 2 /nobreak >nul
) else (
    echo Sentinel Proxy laeuft bereits.
)

REM Signal Loop
start "Signals" /min cmd /k "cd /d %ENGINE_ROOT% && python signal_loop.py"
echo Signal Loop gestartet.
timeout /t 2 /nobreak >nul

REM Terminal
start "Terminal" /min cmd /k "cd /d %ROOT% && npm run dev"
echo Terminal gestartet. Warte auf Port 3000...
timeout /t 10 /nobreak >nul

REM Browser
start "" chrome "%APP_URL%"

echo === ALLE SERVICES GESTARTET ===
exit /b 0
