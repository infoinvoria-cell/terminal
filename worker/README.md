# Capitalife Master Data Worker (Railway)

Provider API → this worker → Supabase → Terminal. **No Yahoo Finance.**

Writes to the real schema:
- `monitoring_ohlc(asset, timeframe, date, open, high, low, close, volume)` — charts (all tabs/timeframes). Daily `date=YYYY-MM-DD`, intraday `date=full ISO`.
- `live_quotes(symbol, open, high, low, close, volume, timestamp, updated_at)` — Globe/watchlist live prices (latest per symbol).

The Terminal reads these via `/api/monitoring/ohlc` (existing) and `/api/monitoring/live` (new).

## Deploy (separate Railway service)

Root directory: `worker/`. Start command: `node index.mjs` (see `railway.json`).

## Env vars (Railway)

Required:
```
SUPABASE_URL              (or NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_SERVICE_KEY      (or SUPABASE_SERVICE_ROLE_KEY)
```

Provider keys (all free tier; the worker runs and skips a provider whose key is a
placeholder, so you can deploy first and add keys incrementally):
```
BARCHART_API_KEY     barchart.com/ondemand   — CME commodities + index futures
FINNHUB_API_KEY      finnhub.io              — FX (6E/6B/…)
TWELVE_DATA_KEY      twelvedata.com          — EUREX (FDAX/FESX/FGBL)
ALPACA_API_KEY       alpaca.markets          — US ETFs + stocks
ALPACA_SECRET        alpaca.markets
FRED_API_KEY         fred.stlouisfed.org     — VIX/DXY/TNX/… macro
```

Phase 2 (optional): `DATABENTO_KEY` (databento.com, $125 credits) for tick-accurate CME/EUREX.

## Manual first seed

`node index.mjs --once` runs a full daily sync + globe refresh once, then keeps the
scheduler running.

## Schedule (Mon–Fri)

Intraday pre/post bar-close (6E/6B 30M, FDAX 1H/2H, GC 60M), White Swan & Core
Invest daily, Globe every 5 min during market hours, FRED macro daily, full sync 06:00.
See `index.mjs` `startScheduler()`.
