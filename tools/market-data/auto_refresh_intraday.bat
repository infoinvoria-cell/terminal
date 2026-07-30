@echo off
REM ============================================================================
REM  auto_refresh_intraday.bat
REM  Scrape + seed intraday futures every run (schedule via Windows Task Scheduler)
REM  Recommended schedule: every 30 minutes, Mon-Fri 07:00-22:00
REM ============================================================================
cd /d "%~dp0"

echo [%DATE% %TIME%] Starting intraday refresh...

REM 1. Scrape FDAX1! 2H + 1H
call .venv\Scripts\activate.bat
python tv_datafeed_collector.py --symbols "FDAX1!" --intervals 2h 1h --n-bars 5000 --search --once

REM 2. Scrape 6E1! + 6B1! 30M
python tv_datafeed_collector.py --symbols "6E1!" "6B1!" --intervals 30m --n-bars 5000 --search --once

REM 3. Run bridge -> Supabase monitoring_ohlc
cd /d "%~dp0\..\.."
node tools\market-data\bridge_intraday_mt.mjs

REM 4. Regenerate strategy events (entry/exit signals)
cd /d "%~dp0"
python gen_intraday_events.py

REM 5. Copy updated events to src/data (so git diff shows changes)
echo [%DATE% %TIME%] Refresh complete.
