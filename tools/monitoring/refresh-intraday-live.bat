@echo off
:: Intraday Live Refresh — runs refresh-tvc-cache.py --live every 5 minutes
:: Schedule via Windows Task Scheduler: every 5 min, Mon-Fri 08:00-23:00

setlocal
set "SCRIPT_DIR=%~dp0"
set "FUND_MGR=%SCRIPT_DIR%..\..\"
cd /d "%FUND_MGR%"

python tools\monitoring\refresh-tvc-cache.py --live --delay 1.0
