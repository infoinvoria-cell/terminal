@echo off
cd /d "%~dp0"
python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo Worker-Umgebung installiert. Start mit start_tv_minute_worker.bat
