@echo off
REM ============================================================================
REM  Intraday MT futures scrape + seed  (Monitoring "Intraday" tab)
REM  Charts: DAX 2H, DAX 1H, Euro 30M, GBP 30M  ->  FDAX1! / 6E1! / 6B1!
REM
REM  Requires TradingView login in .env.local (repo root):
REM     TRADINGVIEW_USERNAME=...
REM     TRADINGVIEW_PASSWORD=...
REM  (no-login mode cannot fetch EUREX/CME futures)
REM
REM  Steps:
REM    1. Scrape FDAX1! at 2h + 1h   (TradingView datafeed -> local cache)
REM    2. Scrape 6E1! + 6B1! at 30m
REM    3. Bridge cache -> public cache + manifest + Supabase monitoring_ohlc
REM
REM  Run once:      start_intraday_mt.bat
REM  Loop (cron):   schedule this .bat every N minutes on the TV-logged-in host.
REM ============================================================================
cd /d "%~dp0"
call .venv\Scripts\activate.bat

echo [1/3] Scraping FDAX1! (2h, 1h) ...
python tv_datafeed_collector.py --symbols "FDAX1!" --intervals 2h 1h --n-bars 5000 --search --once

echo [2/3] Scraping 6E1!, 6B1! (30m) ...
python tv_datafeed_collector.py --symbols "6E1!" "6B1!" --intervals 30m --n-bars 5000 --search --once

echo [3/3] Bridging to public cache + manifest + monitoring_ohlc ...
cd /d "%~dp0\..\.."
node tools\market-data\bridge_intraday_mt.mjs

echo Done.
