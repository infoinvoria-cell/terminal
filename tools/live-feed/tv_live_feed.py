#!/usr/bin/env python3
"""
tools/live-feed/tv_live_feed.py
TradingView WebSocket → Supabase live_quotes

Install:  pip install tradingview-ws supabase python-dotenv
Run:      python tools/live-feed/tv_live_feed.py

Env vars (from .env.local or shell):
  TV_USERNAME                — TradingView username
  TV_PASSWORD                — TradingView password
  NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key
"""

import json
import logging
import os
import time
import random
import pickle
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=ROOT / ".env.local")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

TV_USERNAME = os.environ["TV_USERNAME"]
TV_PASSWORD = os.environ["TV_PASSWORD"]
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

UNIVERSE_PATH = ROOT / "public/generated/monitoring/config/monitoring_asset_universe.json"
SESSION_FILE  = Path(__file__).parent / ".tv_session.pkl"

MAX_SUBSCRIPTIONS = 50          # TradingView Free limit
FAST_FLUSH_INTERVAL = 5         # seconds — intraday + anomaly assets
SLOW_FLUSH_INTERVAL = 30        # seconds — standard daily assets
BACKOFF_STEPS = [30, 60, 120, 300]  # reconnect delays (seconds)

# Symbols that need 5s resolution
FAST_SYMBOLS: set[str] = {
    "DE30EUR_1H", "DE30EUR_2H",
    "EURUSD_30M", "GBPUSD_30M",
    "NQ1!", "ES1!", "YM1!",
    "GC1!", "GLD", "FDAX1!",
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

# ── State ─────────────────────────────────────────────────────────────────────

fast_buffer: dict[str, dict] = {}  # intraday + anomaly
slow_buffer: dict[str, dict] = {}  # standard assets
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Symbols ───────────────────────────────────────────────────────────────────

def load_symbols() -> tuple[list[str], list[str]]:
    """
    Returns (fast_syms, slow_syms) read from monitoring_asset_universe.json.
    Total capped at MAX_SUBSCRIPTIONS.
    """
    try:
        data = json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))
        all_syms: list[str] = [
            a["requestSymbol"]
            for a in data.get("assets", [])
            if a.get("requestSymbol")
        ]
    except Exception as e:
        log.warning(f"Universe load failed ({e}) — using hardcoded fallback")
        all_syms = [
            "ZC1!", "ZW1!", "CC1!", "OJ1!", "SB1!", "CT1!", "KC1!", "ZS1!",
            "GC1!", "SI1!", "PA1!", "PL1!", "CL1!", "NG1!", "RB1!", "HG1!",
            "NQ1!", "ES1!", "YM1!", "FDAX1!", "UKX!",
            "EURUSD_30M", "GBPUSD_30M", "DE30EUR_1H", "DE30EUR_2H",
            "ZARUSD", "BRLUSD", "SEKUSD", "GBPJPY", "CLPUSD", "NOKUSD",
            "MXNUSD", "EURGBP",
            "AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA",
            "GLD", "6S1!",
        ]

    # Split into fast/slow, then cap total
    fast: list[str] = [s for s in all_syms if s in FAST_SYMBOLS]
    slow: list[str] = [s for s in all_syms if s not in FAST_SYMBOLS]

    # Cap — prioritise fast slots
    remaining = MAX_SUBSCRIPTIONS - len(fast)
    if remaining < 0:
        fast = fast[:MAX_SUBSCRIPTIONS]
        slow = []
    else:
        slow = slow[:remaining]

    log.info(f"Symbols: {len(fast)} fast (5s) + {len(slow)} slow (30s) = {len(fast)+len(slow)} total")
    return fast, slow

# ── Quote buffer ──────────────────────────────────────────────────────────────

def on_quote(symbol: str, data: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "symbol":     symbol,
        "open":       float(data.get("open_price",  data.get("open",  0)) or 0),
        "high":       float(data.get("high_price",  data.get("high",  0)) or 0),
        "low":        float(data.get("low_price",   data.get("low",   0)) or 0),
        "close":      float(data.get("lp", data.get("close", data.get("last_price", 0))) or 0),
        "volume":     float(data.get("volume", 0) or 0),
        "timestamp":  now,
        "updated_at": now,
    }
    if symbol in FAST_SYMBOLS:
        fast_buffer[symbol] = row
    else:
        slow_buffer[symbol] = row

# ── Supabase flush ────────────────────────────────────────────────────────────

def flush_batch(buffer: dict, label: str) -> None:
    if not buffer:
        return
    rows = list(buffer.values())
    buffer.clear()
    try:
        supabase.table("live_quotes").upsert(rows, on_conflict="symbol").execute()
        log.info(f"[flush:{label}] {len(rows)} quotes written")
    except Exception as e:
        log.error(f"[flush:{label}] Supabase error: {e}")

# ── Session cache ─────────────────────────────────────────────────────────────

def load_session() -> dict | None:
    try:
        if SESSION_FILE.exists():
            data = pickle.loads(SESSION_FILE.read_bytes())
            if isinstance(data, dict) and data.get("expires_at", 0) > time.time():
                return data
    except Exception:
        pass
    return None

def save_session(data: dict) -> None:
    try:
        SESSION_FILE.write_bytes(pickle.dumps(data))
    except Exception:
        pass

# ── Core session loop ─────────────────────────────────────────────────────────

def run_session(fast_syms: list[str], slow_syms: list[str]) -> None:
    """Single connected session. Raises on disconnect."""
    from tradingview_ws import TradingViewWS

    ua = random.choice(USER_AGENTS)
    log.info(f"Connecting as {TV_USERNAME!r} (UA: {ua[:40]}…)")

    # Try session token first; fall back to password auth
    session = load_session()
    if session and session.get("token"):
        try:
            tv = TradingViewWS(token=session["token"], headers={"User-Agent": ua})
            log.info("Reusing cached session token")
        except TypeError:
            tv = TradingViewWS(username=TV_USERNAME, password=TV_PASSWORD, headers={"User-Agent": ua})
    else:
        try:
            tv = TradingViewWS(username=TV_USERNAME, password=TV_PASSWORD, headers={"User-Agent": ua})
        except TypeError:
            tv = TradingViewWS(username=TV_USERNAME, password=TV_PASSWORD)

    all_syms = fast_syms + slow_syms
    for sym in all_syms:
        tv.subscribe(sym, callback=lambda d, s=sym: on_quote(s, d))
    log.info(f"Subscribed {len(all_syms)} symbols — streaming")

    # Try to persist session token for next restart
    try:
        token = getattr(tv, "auth_token", None) or getattr(tv, "token", None)
        if token:
            save_session({"token": token, "expires_at": time.time() + 3600 * 12})
    except Exception:
        pass

    tv.connect()  # blocks until disconnect or error

    last_slow_flush = time.time()
    last_fast_flush = time.time()

    # If connect() is blocking, this runs after it returns — so we need a
    # background tick approach. Use a thread for the flush cycle.
    import threading

    stop_event = threading.Event()

    def flush_loop():
        nonlocal last_slow_flush, last_fast_flush
        while not stop_event.is_set():
            now = time.time()
            if now - last_fast_flush >= FAST_FLUSH_INTERVAL:
                flush_batch(fast_buffer, "fast")
                last_fast_flush = now
            if now - last_slow_flush >= SLOW_FLUSH_INTERVAL:
                flush_batch(slow_buffer, "slow")
                last_slow_flush = now
            time.sleep(1)

    flush_thread = threading.Thread(target=flush_loop, daemon=True)
    flush_thread.start()

    try:
        # If connect() returned immediately (non-blocking), drive our own loop
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        raise
    finally:
        stop_event.set()
        flush_batch(fast_buffer, "fast-final")
        flush_batch(slow_buffer, "slow-final")
        try:
            tv.disconnect()
        except Exception:
            pass

# ── Main with reconnect backoff ───────────────────────────────────────────────

def main() -> None:
    fast_syms, slow_syms = load_symbols()
    backoff_idx = 0

    while True:
        try:
            run_session(fast_syms, slow_syms)
            # Clean exit (KeyboardInterrupt propagates, normal return → reconnect)
        except KeyboardInterrupt:
            log.info("Stopped by user.")
            break
        except Exception as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.error(f"Session ended: {e}. Reconnect in {delay}s …")
            time.sleep(delay)
            backoff_idx += 1
        else:
            # Unexpected clean return without error → short delay
            delay = BACKOFF_STEPS[0]
            log.warning(f"Session ended unexpectedly. Reconnect in {delay}s …")
            time.sleep(delay)
            backoff_idx = max(0, backoff_idx - 1)  # partial reset on clean exit


if __name__ == "__main__":
    main()
