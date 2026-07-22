#!/usr/bin/env python3
"""
tools/live-feed/tv_live_feed.py
TradingView WebSocket → Supabase live_quotes

Install:  pip install tradingview-ws supabase python-dotenv
Run:      python tools/live-feed/tv_live_feed.py

Env vars (from .env.local or shell):
  TV_USERNAME                — TradingView account username
  TV_PASSWORD                — TradingView account password
  NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key
"""
import os
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env.local")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TV_USERNAME = os.environ["TV_USERNAME"]
TV_PASSWORD = os.environ["TV_PASSWORD"]
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
FLUSH_INTERVAL = 5  # seconds between Supabase upserts

UNIVERSE_PATH = (
    Path(__file__).resolve().parents[2]
    / "public/generated/monitoring/config/monitoring_asset_universe.json"
)


def load_tv_symbols() -> list[str]:
    """Load requestSymbol values from the monitoring asset universe."""
    try:
        data = json.loads(UNIVERSE_PATH.read_text())
        syms = [
            a["requestSymbol"]
            for a in data.get("assets", [])
            if a.get("requestSymbol") and a.get("source") == "tradingview"
        ]
        log.info(f"Loaded {len(syms)} TradingView symbols from universe")
        return syms
    except Exception as e:
        log.warning(f"Universe load failed ({e}). Using default symbols.")
        return [
            "NASDAQ:QQQ", "AMEX:GLD", "NASDAQ:SPMO", "AMEX:SPY",
            "COMEX:HG1!", "CME:6S1!",
        ]


supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
quote_buffer: dict[str, dict] = {}


def on_quote(symbol: str, data: dict) -> None:
    """Update quote buffer on every TradingView tick."""
    now = datetime.now(timezone.utc).isoformat()
    quote_buffer[symbol] = {
        "symbol":     symbol,
        "open":       float(data.get("open_price",  data.get("open",  0)) or 0),
        "high":       float(data.get("high_price",  data.get("high",  0)) or 0),
        "low":        float(data.get("low_price",   data.get("low",   0)) or 0),
        "close":      float(
            data.get("lp", data.get("close", data.get("last_price", 0))) or 0
        ),
        "volume":     float(data.get("volume", 0) or 0),
        "timestamp":  now,
        "updated_at": now,
    }


def flush() -> None:
    """Upsert all buffered quotes to Supabase."""
    if not quote_buffer:
        return
    rows = list(quote_buffer.values())
    try:
        supabase.table("live_quotes").upsert(rows, on_conflict="symbol").execute()
        log.info(f"Flushed {len(rows)} quotes to Supabase")
    except Exception as e:
        log.error(f"Supabase upsert failed: {e}")


def main() -> None:
    try:
        from tradingview_ws import TradingViewWS
    except ImportError:
        log.error("tradingview-ws not installed. Run: pip install tradingview-ws")
        raise

    symbols = load_tv_symbols()
    log.info(f"Connecting to TradingView WebSocket as {TV_USERNAME!r} ...")
    tv = TradingViewWS(username=TV_USERNAME, password=TV_PASSWORD)

    for sym in symbols:
        tv.subscribe(sym, callback=lambda d, s=sym: on_quote(s, d))
        log.info(f"  Subscribed: {sym}")

    log.info(f"Streaming. Flush every {FLUSH_INTERVAL}s. Ctrl+C to stop.")
    try:
        tv.connect()
        while True:
            time.sleep(FLUSH_INTERVAL)
            flush()
    except KeyboardInterrupt:
        log.info("Stopped by user.")
    finally:
        try:
            tv.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    main()
