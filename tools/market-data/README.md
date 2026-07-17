# TradingView Market Data Tools

## Zweck

Lokaler Python-Collector fuer TradingView Historical- und Near-Live-Bar-Daten.
Nur Market Data. Keine Orders. Keine Broker-Anbindung. Keine Live-Trading-Freigabe.

## Setup

```powershell
cd "<REPO_ROOT>\tools\market-data"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Env

Credentials nur lokal in `.env.local` oder `.env` im Projektroot setzen:

```env
TRADINGVIEW_USERNAME=
TRADINGVIEW_PASSWORD=
TRADINGVIEW_DATA_MODE=cache
TRADINGVIEW_CACHE_DIR=<ABSOLUTE_PATH_TO>\.capitalife-cache\market-data\tradingview
TRADINGVIEW_DEFAULT_N_BARS=5000
TRADINGVIEW_ENABLE_LIVE=true
TRADINGVIEW_POLL_SECONDS=60
TRADINGVIEW_STALE_AFTER_SECONDS=180
TRADINGVIEW_DEFAULT_INTERVAL=1m
TRADINGVIEW_HISTORY_INTERVALS=1m,1D
```

## Beispiele

```powershell
python tv_datafeed_collector.py --symbols SPY SPMO QQQ GLD NAS100USD --intervals 1m 1D --n-bars 5000 --search --no-login --once
python tv_minute_worker.py --symbols SPY SPMO QQQ GLD NAS100USD --interval 1m --history-interval 1D --poll-seconds 60
start_tv_minute_worker.bat
python tv_symbol_search.py --symbol SPY
```

## Output

- Cache: `TRADINGVIEW_CACHE_DIR` (Fallback: `.capitalife-cache\market-data\tradingview` neben dem Repo)
- Fallback example manifest: `src/data/capitalife/market-data/tradingview/manifest.json`
- Shared files: `manifest.json`, `status.json`, `latest\*.json`, `history\*_1m.json`, `history\*_1D.json`

## Hinweise

- No-login ist moeglich, kann aber Symbole limitieren.
- UI und APIs muessen die Daten als delayed / near-live / latest bar labeln, nicht als Broker-Realtime.
- Das Next.js-Dashboard liest nur Caches und darf ohne Python weiter starten.
