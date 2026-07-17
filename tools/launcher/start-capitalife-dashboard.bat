@echo off
setlocal
set "LAUNCHER_DIR=%~dp0"
cd /d "%LAUNCHER_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER_DIR%start-capitalife-dashboard.ps1"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Launcher failed with exit code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
