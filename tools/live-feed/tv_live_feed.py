#!/usr/bin/env python3
"""
tools/live-feed/tv_live_feed.py
TradingView WebSocket → Supabase live_quotes

Uses the raw TV WebSocket protocol (single connection, multi-symbol) instead of
the single-symbol tradingview-ws wrapper.

Install:  pip install websocket-client requests supabase python-dotenv
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
import pickle
import random
import re
import string
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
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

TV_USERNAME   = os.environ.get("TV_USERNAME", "")
TV_PASSWORD   = os.environ.get("TV_PASSWORD", "")
TV_AUTH_TOKEN = os.environ.get("TV_AUTH_TOKEN", "")   # set this to skip reCAPTCHA login
SUPABASE_URL  = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

UNIVERSE_PATH = ROOT / "public/generated/monitoring/config/monitoring_asset_universe.json"
SESSION_FILE  = Path(__file__).parent / ".tv_session.pkl"

MAX_SUBSCRIPTIONS  = 50
FAST_FLUSH_SECS    = 5
SLOW_FLUSH_SECS    = 30
BACKOFF_STEPS      = [30, 60, 120, 300]

# requestSymbol keys that need 5-second resolution
FAST_SYMBOLS: set[str] = {
    "DE30EUR_1H", "DE30EUR_2H",
    "EURUSD_30M", "GBPUSD_30M",
    "NQ1!", "ES1!", "YM1!",
    "GC1!", "GLD", "FDAX1!",
}

TV_WS_URL  = "wss://data.tradingview.com/socket.io/websocket"
TV_API_URL = "https://www.tradingview.com/accounts/signin/"

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

def get_auth_token(ua: str) -> str:
    # 1. Explicit env var (recommended — avoids reCAPTCHA)
    if TV_AUTH_TOKEN:
        log.info("Using TV_AUTH_TOKEN from env")
        return TV_AUTH_TOKEN

    # 2. Disk cache from previous successful login
    cached = _load_cached_token()
    if cached:
        log.info("Reusing cached auth token")
        return cached

    # 3. Username/password login (fails if reCAPTCHA required)
    if not TV_USERNAME or not TV_PASSWORD:
        raise RuntimeError(
            "No auth method available. Set TV_AUTH_TOKEN in .env.local.\n"
            "Get token: tradingview.com → DevTools → Console → "
            "JSON.parse(localStorage.getItem('tv_user')).auth_token"
        )
    log.info("Authenticating with TradingView (username/password) …")
    resp = requests.post(
        TV_API_URL,
        data={"username": TV_USERNAME, "password": TV_PASSWORD, "remember": "on"},
        headers={"Referer": "https://www.tradingview.com", "User-Agent": ua},
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json()
    if "user" not in body:
        raise RuntimeError(f"TV login failed: {body.get('error', body)}")
    token = body["user"]["auth_token"]
    _save_cached_token(token)
    log.info("Auth token obtained and cached")
    return token


def _load_cached_token() -> str | None:
    try:
        if SESSION_FILE.exists():
            data = pickle.loads(SESSION_FILE.read_bytes())
            if isinstance(data, dict) and data.get("expires_at", 0) > time.time() + 60:
                return data["token"]
    except Exception:
        pass
    return None


def _save_cached_token(token: str) -> None:
    try:
        SESSION_FILE.write_bytes(
            pickle.dumps({"token": token, "expires_at": time.time() + 3600 * 8})
        )
    except Exception:
        pass

# ── TV WebSocket protocol helpers ─────────────────────────────────────────────

def _rand_session_id(prefix: str) -> str:
    return prefix + "".join(random.choices(string.ascii_lowercase, k=12))


def _wrap(msg: str) -> str:
    return f"~m~{len(msg)}~m~{msg}"


def _send(ws, func: str, params: list) -> None:
    msg = json.dumps({"m": func, "p": params}, separators=(",", ":"))
    ws.send(_wrap(msg))

# ── Quote buffer ──────────────────────────────────────────────────────────────

def _store_quote(req_sym: str, v: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "symbol":     req_sym,
        "open":       float(v.get("open_price",  v.get("open",  0)) or 0),
        "high":       float(v.get("high_price",  v.get("high",  0)) or 0),
        "low":        float(v.get("low_price",   v.get("low",   0)) or 0),
        "close":      float(v.get("lp", v.get("last_price", v.get("close", 0))) or 0),
        "volume":     float(v.get("volume", 0) or 0),
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
    token = get_auth_token(ua)

    ws_headers = {
        "Origin": "https://data.tradingview.com",
        "User-Agent": ua,
    }
    log.info("Opening WebSocket …")
    ws = create_connection(TV_WS_URL, headers=ws_headers, timeout=20)

    # Auth + quote session
    _send(ws, "set_auth_token", [token])
    q_session = _rand_session_id("qs_")
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

    log.info(f"Connected — {len(subscribed_sources)} TV sources subscribed")

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
            # Invalidate cached token on auth errors
            if "auth" in str(e).lower() or "token" in str(e).lower():
                try:
                    SESSION_FILE.unlink(missing_ok=True)
                    log.info("Cleared cached token")
                except Exception:
                    pass
            time.sleep(delay)
            backoff_idx += 1


if __name__ == "__main__":
    main()
