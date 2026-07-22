#!/usr/bin/env python3
"""
tools/live-feed/tv_live_feed.py
TradingView WebSocket → Supabase live_quotes

Uses the raw TV WebSocket protocol (single connection, multi-symbol).
Runs anonymous (unauthorized_user_token) — data is ~15 min delayed on Free.
For real-time: set TV_AUTH_TOKEN to a JWT from a logged-in TV session.

Install:  pip install websocket-client supabase python-dotenv
Run:      python tools/live-feed/tv_live_feed.py

Env vars (from .env.local or shell):
  TV_AUTH_TOKEN              — (optional) TV JWT for real-time data
                               Get: tradingview.com → DevTools → Network →
                               any request → Authorization: Bearer <token>
  NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key
"""

import json
import logging
import os
import random
import re
import string
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client
from websocket import create_connection, WebSocketException

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=ROOT / ".env.local")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

TV_AUTH_TOKEN = os.environ.get("TV_AUTH_TOKEN", "")   # JWT for real-time; empty = anonymous (15min delay)
SUPABASE_URL  = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

UNIVERSE_PATH = ROOT / "public/generated/monitoring/config/monitoring_asset_universe.json"

MAX_SUBSCRIPTIONS  = 50
FAST_FLUSH_SECS    = 5
SLOW_FLUSH_SECS    = 30
BACKOFF_STEPS      = [30, 60, 120, 300]

# requestSymbol keys that need 5-second resolution.
# NOTE: intraday assets carry the plain requestSymbol (DE30EUR/EURUSD/GBPUSD),
# the 1H/2H/30M distinction lives in `timeframe`, not the symbol key.
FAST_SYMBOLS: set[str] = {
    "DE30EUR", "EURUSD", "GBPUSD",   # intraday MT (1H/2H/30M)
    "NQ1!", "ES1!", "YM1!",          # index futures
    "GC1!", "GLD", "FDAX1!",         # anomaly assets
}

# Core-Invest + comparison symbols NOT present in the monitoring universe.
# From src/data/capitalife/core-invest.config.json:
#   required_ohlc_symbols:      QQQ, GLD, SPMO, SPY, HG1!, 6S1!
#   required_pine2_comparison:  DXY, GC1!, ZB1!
# HG1! / GC1! already come from the universe; the rest are added here.
# Key = requestSymbol (what we store in live_quotes.symbol), value = TV source.
EXTRA_SYMBOLS: dict[str, str] = {
    "QQQ":  "NASDAQ:QQQ",     # Core ETF (QQQ_PASSIVE sleeve)
    "GLD":  "AMEX:GLD",       # Core ETF + anomaly asset
    "SPMO": "AMEX:SPMO",      # Core ETF (momentum)
    "SPY":  "AMEX:SPY",       # Core ETF + benchmark
    "6S1!": "CME:6S1!",       # CHF futures (CHF_6S sleeve)
    "DXY":  "TVC:DXY",        # Pine2 comparison — dollar index
    "ZB1!": "CBOT:ZB1!",      # Pine2 comparison — 30Y T-Bond
}

TV_WS_URL = "wss://data.tradingview.com/socket.io/websocket"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

# ── State ─────────────────────────────────────────────────────────────────────

fast_buffer: dict[str, dict] = {}
slow_buffer: dict[str, dict] = {}
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Symbol loading ────────────────────────────────────────────────────────────

def load_symbol_map() -> tuple[dict[str, str], dict[str, list[str]]]:
    """
    Returns:
      req_to_src:  {requestSymbol → tv_source}   e.g. "EURUSD_30M" → "OANDA:EURUSD"
      src_to_reqs: {tv_source → [requestSymbol]} e.g. "OANDA:EURUSD" → ["EURUSD_30M"]
    """
    try:
        data = json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))
        assets = data.get("assets", [])
    except Exception as e:
        log.error(f"Universe load failed: {e}")
        return {}, {}

    req_to_src: dict[str, str] = {}
    src_to_reqs: dict[str, list[str]] = defaultdict(list)

    for a in assets:
        req = a.get("requestSymbol", "").strip()
        src = a.get("source", "").strip()
        if req and src:
            req_to_src[req] = src
            if req not in src_to_reqs[src]:
                src_to_reqs[src].append(req)

    # Merge Core-Invest + comparison symbols not covered by the universe
    added = 0
    for req, src in EXTRA_SYMBOLS.items():
        if req not in req_to_src:
            req_to_src[req] = src
            if req not in src_to_reqs[src]:
                src_to_reqs[src].append(req)
            added += 1
    if added:
        log.info(f"Added {added} Core-Invest/comparison symbols not in universe")

    return req_to_src, dict(src_to_reqs)


def select_subscriptions(req_to_src: dict[str, str]) -> tuple[list[str], list[str]]:
    """
    Splits requestSymbols into fast/slow, deduplicates TV sources,
    caps total at MAX_SUBSCRIPTIONS.
    Returns (fast_reqs, slow_reqs) — the requestSymbol keys we care about.
    """
    all_reqs = list(req_to_src.keys())

    # Unique TV sources (deduplicated — multiple reqs can share one source)
    seen_sources: set[str] = set()
    fast_reqs: list[str] = []
    slow_reqs: list[str] = []

    # Fast first
    for req in all_reqs:
        if req in FAST_SYMBOLS:
            src = req_to_src[req]
            seen_sources.add(src)
            fast_reqs.append(req)

    # Slow — skip if same source already in fast
    for req in all_reqs:
        if req not in FAST_SYMBOLS:
            src = req_to_src[req]
            if src not in seen_sources:
                seen_sources.add(src)
                slow_reqs.append(req)

    # Cap
    total = len(fast_reqs) + len(slow_reqs)
    if total > MAX_SUBSCRIPTIONS:
        remaining = MAX_SUBSCRIPTIONS - len(fast_reqs)
        slow_reqs = slow_reqs[:max(0, remaining)]

    unique_src_count = len({req_to_src[r] for r in fast_reqs + slow_reqs})
    log.info(
        f"Symbols: {len(fast_reqs)} fast + {len(slow_reqs)} slow = "
        f"{len(fast_reqs)+len(slow_reqs)} reqs / {unique_src_count} unique TV sources"
    )
    return fast_reqs, slow_reqs

# ── Auth ──────────────────────────────────────────────────────────────────────

def get_auth_token() -> str:
    """
    Returns the token passed to set_auth_token on the TV WebSocket.
    - With TV_AUTH_TOKEN set: uses that JWT (real-time data).
    - Without: uses 'unauthorized_user_token' (anonymous, ~15 min delayed).

    To get a real JWT: tradingview.com → DevTools → Network → any XHR →
    Request Headers → Authorization: Bearer <token>  → set TV_AUTH_TOKEN=<token>
    """
    if TV_AUTH_TOKEN:
        log.info("Auth: using TV_AUTH_TOKEN (real-time)")
        return TV_AUTH_TOKEN
    log.info("Auth: anonymous (unauthorized_user_token) — data ~15 min delayed")
    return "unauthorized_user_token"



# ── TV WebSocket protocol helpers ─────────────────────────────────────────────

def _rand_session_id(prefix: str) -> str:
    return prefix + "".join(random.choices(string.ascii_lowercase, k=12))


def _wrap(msg: str) -> str:
    return f"~m~{len(msg)}~m~{msg}"


def _send(ws, func: str, params: list) -> None:
    msg = json.dumps({"m": func, "p": params}, separators=(",", ":"))
    ws.send(_wrap(msg))

# ── Quote buffer ──────────────────────────────────────────────────────────────

# Persistent per-symbol OHLCV state — TV sends PARTIAL updates (one tick may
# carry only `lp`, the next only OHLC), so we merge instead of overwrite.
latest_state: dict[str, dict] = {}


def _pick(v: dict, *keys) -> float | None:
    """First present, non-None numeric value among keys; None if absent."""
    for k in keys:
        if k in v and v[k] is not None:
            try:
                return float(v[k])
            except (TypeError, ValueError):
                continue
    return None


def _store_quote(req_sym: str, v: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    state = latest_state.setdefault(
        req_sym,
        {"open": 0.0, "high": 0.0, "low": 0.0, "close": 0.0, "volume": 0.0},
    )

    # Merge only the fields present in this tick
    o  = _pick(v, "open_price", "open")
    hi = _pick(v, "high_price", "high")
    lo = _pick(v, "low_price", "low")
    cl = _pick(v, "lp", "last_price", "close")
    vol = _pick(v, "volume")

    if o  is not None: state["open"]   = o
    if hi is not None: state["high"]   = hi
    if lo is not None: state["low"]    = lo
    if cl is not None: state["close"]  = cl
    if vol is not None: state["volume"] = vol

    # Don't emit a row until we have a usable close price
    if state["close"] <= 0:
        return

    row = {
        "symbol":     req_sym,
        "open":       state["open"],
        "high":       state["high"],
        "low":        state["low"],
        "close":      state["close"],
        "volume":     state["volume"],
        "timestamp":  now,
        "updated_at": now,
    }
    if req_sym in FAST_SYMBOLS:
        fast_buffer[req_sym] = row
    else:
        slow_buffer[req_sym] = row

# ── Supabase flush ────────────────────────────────────────────────────────────

def flush_batch(buffer: dict, label: str) -> None:
    if not buffer:
        return
    rows = list(buffer.values())
    buffer.clear()
    try:
        supabase.table("live_quotes").upsert(rows, on_conflict="symbol").execute()
        log.info(f"[{label}] flushed {len(rows)} rows")
    except Exception as e:
        log.error(f"[{label}] Supabase error: {e}")

# ── Core session ──────────────────────────────────────────────────────────────

def run_session(
    fast_reqs: list[str],
    slow_reqs: list[str],
    req_to_src: dict[str, str],
    src_to_reqs: dict[str, list[str]],
) -> None:
    ua = random.choice(USER_AGENTS)
    token = get_auth_token()

    ws_headers = {
        "Origin": "https://data.tradingview.com",
        "User-Agent": ua,
    }
    log.info("Opening WebSocket …")
    ws = create_connection(TV_WS_URL, headers=ws_headers, timeout=20)
    debug_until = time.time() + 10  # log ALL raw frames for first 10s

    _send(ws, "set_auth_token", [token])
    q_session = _rand_session_id("qs_")
    log.info(f"[debug] quote_create_session → {q_session}")
    _send(ws, "quote_create_session", [q_session])
    _send(ws, "quote_set_fields", [q_session, "lp", "open_price", "high_price", "low_price", "volume"])

    # Subscribe all unique TV sources
    all_reqs = fast_reqs + slow_reqs
    subscribed_sources: set[str] = set()
    for req in all_reqs:
        src = req_to_src.get(req)
        if src and src not in subscribed_sources:
            _send(ws, "quote_add_symbols", [q_session, src])
            subscribed_sources.add(src)

    log.info(f"Connected — {len(subscribed_sources)} TV sources subscribed — debug window 10s")

    # Flush thread
    stop_evt = threading.Event()
    last_fast = time.time()
    last_slow = time.time()

    def flush_loop():
        nonlocal last_fast, last_slow
        while not stop_evt.is_set():
            now = time.time()
            if now - last_fast >= FAST_FLUSH_SECS:
                flush_batch(fast_buffer, "fast")
                last_fast = now
            if now - last_slow >= SLOW_FLUSH_SECS:
                flush_batch(slow_buffer, "slow")
                last_slow = now
            time.sleep(1)

    t = threading.Thread(target=flush_loop, daemon=True)
    t.start()

    try:
        while True:
            raw = ws.recv()
            if not raw:
                continue

            if time.time() < debug_until:
                log.info(f"[raw] {raw[:300]}")

            # Ping/pong
            ping = re.findall(r"~m~\d+~m~(~h~\d+)", raw)
            if ping:
                ws.send(_wrap(ping[0]))
                continue

            # Parse JSON payload
            match = re.search(r"\{.*\}", raw)
            if not match:
                continue
            try:
                msg = json.loads(match.group())
            except json.JSONDecodeError:
                continue

            if msg.get("m") != "qsd":
                continue

            p = msg.get("p", [])
            if len(p) < 2:
                continue

            payload = p[1]
            tv_sym: str = payload.get("n", "")
            v: dict = payload.get("v", {})

            if not tv_sym or not v:
                continue

            # Map TV source → all requestSymbols that use it
            for req in src_to_reqs.get(tv_sym, []):
                _store_quote(req, v)

    except KeyboardInterrupt:
        raise
    except WebSocketException as e:
        raise RuntimeError(f"WebSocket error: {e}") from e
    finally:
        stop_evt.set()
        flush_batch(fast_buffer, "fast-final")
        flush_batch(slow_buffer, "slow-final")
        try:
            ws.close()
        except Exception:
            pass

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    req_to_src, src_to_reqs = load_symbol_map()
    if not req_to_src:
        log.error("No symbols loaded — aborting")
        return

    fast_reqs, slow_reqs = select_subscriptions(req_to_src)
    backoff_idx = 0

    while True:
        try:
            run_session(fast_reqs, slow_reqs, req_to_src, src_to_reqs)
            # Clean return → soft reconnect
            delay = BACKOFF_STEPS[0]
            log.warning(f"Session ended cleanly — reconnect in {delay}s")
            time.sleep(delay)
            backoff_idx = max(0, backoff_idx - 1)
        except KeyboardInterrupt:
            log.info("Stopped by user.")
            break
        except Exception as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.error(f"Session error: {e} — reconnect in {delay}s")
            time.sleep(delay)
            backoff_idx += 1


if __name__ == "__main__":
    main()
