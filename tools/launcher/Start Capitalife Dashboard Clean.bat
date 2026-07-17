@echo off
setlocal
set "LAUNCHER_DIR=%~dp0"
cd /d "%LAUNCHER_DIR%"
echo.
echo  Capitalife Dashboard -- CLEAN START
echo  Loescht .next und startet neu. Dauert laenger als normaler Start.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER_DIR%start-capitalife-dashboard.ps1" -Clean
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Launcher beendet mit Fehlercode %EXITCODE%.
  pause
)
exit /b %EXITCODE%
