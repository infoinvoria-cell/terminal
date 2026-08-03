@echo off
setlocal
title Capitalife System
color 0A

echo === CAPITALIFE SYSTEM START ===

set "ROOT=C:\Users\joris\Documents\Capitalife Terminal"
set "ENGINE_ROOT=C:\Users\joris\Documents\Capitalife Engine"
set "APP_URL=http://localhost:3000"
set "OBSIDIAN_EXE="

rem Check if terminal already runs
netstat -an | findstr ":3000" >nul 2>&1
if %errorlevel%==0 (
    echo Terminal laeuft bereits.
    start "" "%APP_URL%"
    exit /b 0
)

rem Stop old processes
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

rem Obsidian
if exist "%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe"
if not defined OBSIDIAN_EXE if exist "%LOCALAPPDATA%\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%LOCALAPPDATA%\Obsidian\Obsidian.exe"
if not defined OBSIDIAN_EXE if exist "%ProgramFiles%\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%ProgramFiles%\Obsidian\Obsidian.exe"
if not defined OBSIDIAN_EXE if exist "%ProgramFiles(x86)%\Obsidian\Obsidian.exe" set "OBSIDIAN_EXE=%ProgramFiles(x86)%\Obsidian\Obsidian.exe"
if defined OBSIDIAN_EXE (
    start "" "%OBSIDIAN_EXE%" >nul 2>&1
    echo Obsidian gestartet.
) else (
    echo Obsidian nicht gefunden.
)
timeout /t 2 /nobreak >nul

rem Flask bridge
netstat -an | findstr ":5000" >nul 2>&1
if not %errorlevel%==0 (
    start "Flask" /min cmd /k "cd /d %ENGINE_ROOT%\bridge && python app.py"
    echo Flask gestartet.
    timeout /t 4 /nobreak >nul
) else (
    echo Flask laeuft bereits.
)

rem Sentinel proxy
netstat -an | findstr ":8080" >nul 2>&1
if not %errorlevel%==0 (
    start "Proxy" /min cmd /k "cd /d %ENGINE_ROOT%\sentinel_proxy && python proxy.py"
    echo Sentinel Proxy gestartet.
    timeout /t 2 /nobreak >nul
) else (
    echo Sentinel Proxy laeuft bereits.
)

rem Signal loop
if exist "%ENGINE_ROOT%\signal_loop.py" (
    start "Signals" /min cmd /k "cd /d %ENGINE_ROOT% && python signal_loop.py"
    echo Signal Loop gestartet.
    timeout /t 2 /nobreak >nul
) else (
    echo Signal Loop nicht gefunden, ueberspringe.
)

rem Terminal
start "Terminal" /min cmd /k "cd /d %ROOT% && npm run dev"
echo Terminal gestartet. Warte auf Port 3000...
set /a WAIT_COUNT=0

:wait_for_terminal
netstat -an | findstr ":3000" >nul 2>&1
if %errorlevel%==0 goto terminal_ready
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 30 goto terminal_timeout
timeout /t 2 /nobreak >nul
goto wait_for_terminal

:terminal_ready
echo Port 3000 erreichbar.
goto open_browser

:terminal_timeout
echo WARNUNG: Port 3000 wurde nicht rechtzeitig erreichbar.

:open_browser
start "" "%APP_URL%"

echo === ALLE SERVICES GESTARTET ===
exit /b 0
