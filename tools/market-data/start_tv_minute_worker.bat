@echo off
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python tv_minute_worker.py --symbols SPY SPMO QQQ GLD NAS100USD --interval 1m --history-interval 1D --poll-seconds 60
