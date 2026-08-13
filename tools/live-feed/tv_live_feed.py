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
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client
from websocket import create_connection, WebSocketException

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent
# On Railway env vars come from the dashboard; locally .env works as fallback
load_dotenv(dotenv_path=ROOT / ".env")
load_dotenv(dotenv_path=ROOT / ".env.local")
# Also check project root (two levels up from tools/live-feed/)
_proj_root = ROOT.parent.parent
load_dotenv(dotenv_path=_proj_root / ".env.local", override=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

TV_AUTH_TOKEN = os.environ.get("TV_AUTH_TOKEN", "")   # JWT for real-time; empty = anonymous (15min delay)
SUPABASE_URL  = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Optional: full monitoring universe JSON (not available on Railway — falls back to EXTRA_SYMBOLS)
UNIVERSE_PATH = ROOT / "monitoring_asset_universe.json"
CONTRACT_PATH = _proj_root / ".runtime" / "market-data" / "terminal-universe.json"
RUNTIME_DIR = _proj_root / ".runtime" / "market-data"
QUOTE_STATE_PATH = RUNTIME_DIR / "live-quote-state.json"
RUNTIME_STATUS_PATH = RUNTIME_DIR / "tv-live-feed-runtime.json"

MAX_SUBSCRIPTIONS  = 50
FAST_FLUSH_SECS    = 5
SLOW_FLUSH_SECS    = 30
BACKOFF_STEPS      = [30, 60, 120, 300]

# requestSymbol keys that need 5-second resolution.
# NOTE: intraday assets carry the plain requestSymbol (DE30EUR/EURUSD/GBPUSD),
# the 1H/2H/30M distinction lives in `timeframe`, not the symbol key.
FAST_SYMBOLS: set[str] = {
    "DE30EUR", "EURUSD", "GBPUSD",   # intraday MT FX/CFD proxies (1H/2H/30M)
    "FDAX1!", "6E1!", "6B1!",        # intraday MT real futures (DAX / Euro FX / GBP FX)
    "NQ1!", "ES1!", "YM1!",          # index futures
    "GC1!", "GLD",                   # anomaly assets
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
    # Intraday MT real futures — needed so live_quotes covers the actual futures
    # the Monitoring "Intraday" charts display (not just the OANDA FX/CFD proxies).
    # On Railway (no universe file) these sources come ONLY from here.
    "FDAX1!": "EUREX:FDAX1!",  # DAX future (charts: FDAX1! 2H + 1H)
    "6E1!":   "CME:6E1!",      # Euro FX future (chart: 6E1! 30M)
    "6B1!":   "CME:6B1!",      # British Pound FX future (chart: 6B1! 30M)
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
quote_runtime_state: dict[str, dict] = {}
contract_live_meta: dict[str, dict] = {}
subscription_runtime_metrics: dict[str, dict] = {}

# ── Intraday bar building via TV chart series ──────────────────────────────────
# Real OHLC bars come from the TradingView chart series protocol (timescale_update /
# du messages), NOT from quote-field snapshots. Quote fields high_price/low_price are
# the DAY session extremes and must NEVER be used for intraday bar H/L.
#
# Bar buffer: keyed by (req_sym, tf, bucket_str) — later writes overwrite earlier
# ones for the same period. Flushed to monitoring_ohlc via flush_bars() every 5s.
bar_buffer: dict[tuple[str, str, str], dict] = {}

# ── Open bar runtime state ─────────────────────────────────────────────────────
# Tracks the current forming bar per (req_sym, tf).  Written to open_bars.json
# after every flush so Flask can serve it without a competing bar engine.
_OPEN_BARS: dict[tuple[str, str], dict] = {}
_OPEN_BARS_PATH = (
    _proj_root.parent / "Capitalife Engine" / ".runtime" / "engine" / "open_bars.json"
)


def _write_open_bars() -> None:
    try:
        _OPEN_BARS_PATH.parent.mkdir(parents=True, exist_ok=True)
        persist_time = datetime.now(timezone.utc).isoformat()
        for state in _OPEN_BARS.values():
            state["lastOpenBarPersistUtc"] = persist_time
        payload: dict[str, dict] = {
            f"{sym}_{tf}": state for (sym, tf), state in _OPEN_BARS.items()
        }
        _OPEN_BARS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception as exc:
        log.debug(f"[open-bars] write failed: {exc}")


def _write_json(path_obj: Path, payload: dict | list) -> None:
    try:
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        path_obj.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception as exc:
        log.debug(f"[runtime] write failed for {path_obj.name}: {exc}")


def _write_runtime_status() -> None:
    payload = {
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
        "subscriptionsRequested": list(_subscription_state["requested"]),
        "subscriptionsResolved": list(_subscription_state["resolved"]),
        "subscriptionsStarted": list(_subscription_state["started"]),
        "subscriptionsFailed": list(_subscription_state["failed"]),
        "subscriptionFailures": list(_subscription_state["failureDetails"]),
        "subscriptionMetrics": {
            source: {
                "subscriptionStarted": bool(metrics.get("subscriptionStarted")),
                "providerEventsReceived": int(metrics.get("providerEventsReceived", 0)),
                "lastProviderEventUtc": metrics.get("lastProviderEventUtc"),
                "lastProviderPrice": metrics.get("lastProviderPrice"),
                "requestSymbols": list(metrics.get("requestSymbols", [])),
            }
            for source, metrics in sorted(subscription_runtime_metrics.items())
        },
        "heartbeat": dict(_heartbeat),
    }
    _write_json(RUNTIME_STATUS_PATH, payload)


def _write_quote_runtime_state(all_request_symbols: set[str] | None = None) -> None:
    symbols = sorted(all_request_symbols or set(quote_runtime_state.keys()) | set(contract_live_meta.keys()))
    payload: dict[str, dict] = {}
    snapshot_time = datetime.now(timezone.utc).isoformat()
    for req_sym in symbols:
        meta = contract_live_meta.get(req_sym, {})
        row = quote_runtime_state.get(req_sym, {})
        payload[req_sym] = {
            "instrumentId": meta.get("instrumentId"),
            "marketType": meta.get("marketType"),
            "provider": meta.get("liveProvider"),
            "providerSymbol": meta.get("liveSymbol") or req_sym,
            "price": row.get("price"),
            "previousPrice": row.get("previousPrice"),
            "providerTimestampUtc": row.get("providerTimestampUtc"),
            "receivedTimestampUtc": row.get("receivedTimestampUtc"),
            "sequence": row.get("sequence", 0),
            "snapshotUpdatedUtc": snapshot_time,
        }
    _write_json(QUOTE_STATE_PATH, payload)


def _mark_subscription_started(source: str, request_symbols: list[str]) -> None:
    metrics = subscription_runtime_metrics.setdefault(source, {})
    metrics["subscriptionStarted"] = True
    metrics["providerEventsReceived"] = int(metrics.get("providerEventsReceived", 0))
    metrics["lastProviderEventUtc"] = metrics.get("lastProviderEventUtc")
    metrics["lastProviderPrice"] = metrics.get("lastProviderPrice")
    metrics["requestSymbols"] = sorted({*metrics.get("requestSymbols", []), *request_symbols})


def _record_provider_event(source: str, payload: dict, request_symbols: list[str]) -> None:
    metrics = subscription_runtime_metrics.setdefault(source, {})
    metrics["subscriptionStarted"] = True
    metrics["providerEventsReceived"] = int(metrics.get("providerEventsReceived", 0)) + 1
    raw_lp_time = payload.get("lp_time")
    if raw_lp_time is not None:
        try:
            metrics["lastProviderEventUtc"] = datetime.fromtimestamp(float(raw_lp_time), tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OSError):
            pass
    elif not metrics.get("lastProviderEventUtc"):
        metrics["lastProviderEventUtc"] = datetime.now(timezone.utc).isoformat()
    if payload.get("lp") is not None:
        try:
            metrics["lastProviderPrice"] = float(payload.get("lp"))
        except (TypeError, ValueError):
            pass
    metrics["requestSymbols"] = sorted({*metrics.get("requestSymbols", []), *request_symbols})


# Chart series config — one TV chart session per entry.
# tv_tf: TV timeframe string in minutes ("30" = 30M, "60" = 1H, "120" = 2H).
# bars:  how many historical bars to request on connect.
DEFAULT_CHART_SERIES_CONFIGS: list[dict] = [
    # EUR/USD Futures — engine strategy EUR_30M
    {"req_sym": "6E1!",   "tv_src": "CME:6E1!",      "tf": "30M", "tv_tf": "30",  "bars": 500},
    # GBP Futures — additional intraday asset (no engine strategy, used for monitoring)
    {"req_sym": "6B1!",   "tv_src": "CME:6B1!",      "tf": "30M", "tv_tf": "30",  "bars": 500},
    # DAX Futures — engine strategies DAX_2H, DAX_1H
    {"req_sym": "FDAX1!", "tv_src": "EUREX:FDAX1!",  "tf": "2H",  "tv_tf": "120", "bars": 300},
    {"req_sym": "FDAX1!", "tv_src": "EUREX:FDAX1!",  "tf": "1H",  "tv_tf": "60",  "bars": 300},
    # DAX CFD — canonical 30M basis required for production_v1 bar aggregation
    {"req_sym": "DE30EUR", "tv_src": "OANDA:DE30EUR", "tf": "30M", "tv_tf": "30",  "bars": 500},
    # Gold Futures — engine strategies GC_FRI, GLD_THU (daily)
    {"req_sym": "GC1!",   "tv_src": "COMEX:GC1!",    "tf": "D",   "tv_tf": "1D",  "bars": 300},
    # Dow Jones Futures — engine strategy YM_TAT (daily)
    {"req_sym": "YM1!",   "tv_src": "CBOT:YM1!",     "tf": "D",   "tv_tf": "1D",  "bars": 300},
    # S&P 500 ETF — used in monitoring/comparison
    {"req_sym": "SPY",    "tv_src": "AMEX:SPY",       "tf": "D",   "tv_tf": "1D",  "bars": 300},
]

# These chart series are always injected regardless of what the contract file says.
# Use for bars that are structurally required by the engine but may be missing from
# the auto-generated terminal-universe.json (e.g. because the generator only knows
# about 1H/2H and was never updated for 30M).
MANDATORY_CHART_SERIES: list[dict] = [
    # DE30EUR 30M — canonical 30M basis for production_v1 DAX 2H/1H bar aggregation.
    # Without this, monitoring_ohlc has no DE30EUR_30M and the production runner
    # cannot derive production_v1-aligned bars.
    {"req_sym": "DE30EUR", "tv_src": "OANDA:DE30EUR", "tf": "30M", "tv_tf": "30", "bars": 500},
    # FDAX1! 30M — canonical 30M basis for production_v1 DAX 2H aggregation (FDAX path).
    # Stored as FDAX1!_30M in monitoring_ohlc.
    {"req_sym": "FDAX1!", "tv_src": "EUREX:FDAX1!", "tf": "30M", "tv_tf": "30", "bars": 500},
]

TV_TIMEFRAME_MAP: dict[str, str] = {
    "30M": "30",
    "1H": "60",
    "2H": "120",
    "4H": "240",
    "D": "1D",
}


def _load_canonical_contract() -> dict | None:
    if not CONTRACT_PATH.exists():
        return None
    try:
        return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning(f"Canonical contract load failed ({exc})")
        return None


def _load_contract_live_meta() -> dict[str, dict]:
    contract = _load_canonical_contract()
    result: dict[str, dict] = {}
    if not contract:
        return result
    for entry in contract.get("entries", []):
        provider = entry.get("providerMappings") or {}
        req = str(provider.get("liveSymbol") or entry.get("ticker") or "").strip().upper()
        if not req:
            continue
        result[req] = {
            "instrumentId": entry.get("instrumentId"),
            "marketType": entry.get("marketType"),
            "liveProvider": provider.get("liveProvider"),
            "liveSymbol": provider.get("liveSymbol"),
        }
    return result
    try:
        return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning(f"Canonical contract load failed ({exc})")
        return None


def load_chart_series_configs() -> list[dict]:
    contract = _load_canonical_contract()
    if not contract:
        return list(DEFAULT_CHART_SERIES_CONFIGS)

    configs: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for entry in contract.get("entries", []):
        provider = entry.get("providerMappings") or {}
        req_sym = str(provider.get("liveSymbol") or entry.get("ticker") or "").strip().upper()
        tv_src = str(provider.get("historicalSymbol") or "").strip()
        if not req_sym or not tv_src or ":" not in tv_src:
            continue
        for timeframe_raw in entry.get("timeframes", []):
            tf = str(timeframe_raw or "").strip().upper()
            tv_tf = TV_TIMEFRAME_MAP.get(tf)
            if not tv_tf:
                continue
            key = (req_sym, tf)
            if key in seen:
                continue
            seen.add(key)
            configs.append({
                "req_sym": req_sym,
                "tv_src": tv_src,
                "tf": tf,
                "tv_tf": tv_tf,
                "bars": 500 if tf != "D" else 300,
            })

    result = configs or list(DEFAULT_CHART_SERIES_CONFIGS)

    # Always inject mandatory series that may be absent from the generated contract.
    existing_keys = {(c["req_sym"], c["tf"]) for c in result}
    for mc in MANDATORY_CHART_SERIES:
        if (mc["req_sym"], mc["tf"]) not in existing_keys:
            result.append(mc)
            log.info(f"[chart] mandatory override: added {mc['req_sym']} {mc['tf']}")

    return result


CHART_SERIES_CONFIGS = load_chart_series_configs()


def setup_chart_sessions(ws, session_map: dict[str, tuple[str, str]]) -> None:
    """
    Create one TV chart session per CHART_SERIES_CONFIGS entry.
    session_map is populated: chart_session_id -> (req_sym, tf).
    TV will immediately send timescale_update with historical bars, then du for live updates.
    """
    for cfg in CHART_SERIES_CONFIGS:
        cs = _rand_session_id("cs_")
        _send(ws, "chart_create_session", [cs])
        _send(ws, "switch_timezone", [cs, "Etc/UTC"])
        sym_json = json.dumps({"symbol": cfg["tv_src"], "adjustment": "splits"})
        _send(ws, "resolve_symbol", [cs, "sym_0", f"={sym_json}"])
        _send(ws, "create_series", [cs, "sds_1", "s1", "sym_0", cfg["tv_tf"], cfg["bars"]])
        session_map[cs] = (cfg["req_sym"], cfg["tf"])
        log.info(f"[chart] session {cs} → {cfg['req_sym']} {cfg['tf']} via {cfg['tv_src']}")


def _process_chart_bars(req_sym: str, tf: str, data: dict) -> None:
    """
    Parse a timescale_update or du payload and write bars to bar_buffer.
    v = [timestamp_epoch_sec, open, high, low, close, volume] — real OHLC from TV chart data.
    The bucket string is derived from the TV bar timestamp (no server reception time used).
    """
    for sds_val in data.values():
        if not isinstance(sds_val, dict):
            continue
        bars = sds_val.get("s") or []
        if not bars:
            continue
        count = 0
        for bar in bars:
            v = bar.get("v", [])
            if len(v) < 5:
                continue
            try:
                ts_epoch = int(v[0])
                open_    = float(v[1])
                high_    = float(v[2])
                low_     = float(v[3])
                close_   = float(v[4])
                volume   = float(v[5]) if len(v) > 5 else 0.0
            except (TypeError, ValueError):
                continue
            if open_ <= 0 or close_ <= 0:
                continue
            dt_utc = datetime.fromtimestamp(ts_epoch, tz=timezone.utc)
            if tf == "D":
                # Daily bars: date key is YYYY-MM-DD; asset key is bare symbol
                # (monitoring_ohlc stores daily bars under the symbol alone, not "SYMBOL_D")
                bucket   = dt_utc.strftime("%Y-%m-%d")
                asset_id = req_sym
            else:
                # Intraday bars: ISO timestamp without Z; asset key is "SYMBOL_TF"
                bucket   = dt_utc.strftime("%Y-%m-%dT%H:%M:%S")
                asset_id = f"{req_sym}_{tf}"
            bar_buffer[(req_sym, tf, bucket)] = {
                "asset":     asset_id,
                "timeframe": tf,
                "date":      bucket,
                "open":      open_,
                "high":      high_,
                "low":       low_,
                "close":     close_,
                "volume":    volume,
            }
            # Track current open bar — the max-ts_epoch bar per (req_sym, tf).
            # "max" because TradingView sends historical then live; the last bucket
            # chronologically is always the currently forming bar.
            _ob_key = (req_sym, tf)
            _ob_prev = _OPEN_BARS.get(_ob_key)
            _ob_prev_ts = _ob_prev.get("ts_epoch", 0) if _ob_prev else 0
            if ts_epoch >= _ob_prev_ts:
                _now_str = datetime.now(tz=timezone.utc).isoformat()
                _same = (_ob_prev_ts == ts_epoch)
                _provider_event_utc = dt_utc.isoformat()
                _OPEN_BARS[_ob_key] = {
                    "req_sym": req_sym,
                    "tf": tf,
                    "ts_epoch": ts_epoch,
                    "open":   open_,
                    "high":   high_,
                    "low":    low_,
                    "close":  close_,
                    "volume": volume,
                    "updateCount": (_ob_prev.get("updateCount", 0) + 1) if _same else 1,
                    "firstReceivedUtc": _ob_prev.get("firstReceivedUtc") if _same else _now_str,
                    "lastReceivedUtc":  _now_str,
                    "lastProviderEventUtc": _provider_event_utc,
                    "lastOpenBarMutationUtc": _now_str,
                    "lastOpenBarPersistUtc": _ob_prev.get("lastOpenBarPersistUtc") if _ob_prev else None,
                }
            count += 1
        if count:
            log.debug(f"[chart] {req_sym} {tf}: {count} bars buffered")


def flush_bars() -> None:
    _write_open_bars()  # always update, even if no new bars
    if not bar_buffer:
        return
    rows = list(bar_buffer.values())
    bar_buffer.clear()
    try:
        supabase.table("monitoring_ohlc").upsert(rows, on_conflict="asset,timeframe,date").execute()
        log.info(f"[bars] upserted {len(rows)} intraday bars")
    except Exception as e:
        log.error(f"[bars] Supabase error: {e}")

# ── Symbol loading ────────────────────────────────────────────────────────────

def load_symbol_map() -> tuple[dict[str, str], dict[str, list[str]]]:
    """
    Returns:
      req_to_src:  {requestSymbol → tv_source}   e.g. "EURUSD_30M" → "OANDA:EURUSD"
      src_to_reqs: {tv_source → [requestSymbol]} e.g. "OANDA:EURUSD" → ["EURUSD_30M"]
    """
    req_to_src: dict[str, str] = {}
    src_to_reqs: dict[str, list[str]] = defaultdict(list)

    global contract_live_meta
    contract = _load_canonical_contract()
    if contract:
        try:
            contract_live_meta = _load_contract_live_meta()
            for entry in contract.get("entries", []):
                provider = entry.get("providerMappings") or {}
                req = str(provider.get("liveSymbol") or entry.get("ticker") or "").strip().upper()
                src = str(provider.get("historicalSymbol") or "").strip()
                if req and src:
                    req_to_src[req] = src
                    if req not in src_to_reqs[src]:
                        src_to_reqs[src].append(req)
            log.info(f"Canonical universe loaded: {len(req_to_src)} symbols from {CONTRACT_PATH.name}")
        except Exception as e:
            log.warning(f"Canonical universe load failed ({e})")

    if not req_to_src and UNIVERSE_PATH.exists():
        try:
            data = json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))
            assets = data.get("assets", [])
            for a in assets:
                req = a.get("requestSymbol", "").strip()
                src = a.get("source", "").strip()
                if req and src:
                    req_to_src[req] = src
                    if req not in src_to_reqs[src]:
                        src_to_reqs[src].append(req)
            log.info(f"Monitoring universe loaded: {len(req_to_src)} symbols from {UNIVERSE_PATH.name}")
        except Exception as e:
            log.warning(f"Universe load failed ({e}) — using EXTRA_SYMBOLS only")
    elif not req_to_src:
        log.info("No universe file found — using EXTRA_SYMBOLS only (Railway mode)")

    # Always merge Core-Invest + comparison symbols
    added = 0
    for req, src in EXTRA_SYMBOLS.items():
        if req not in req_to_src:
            req_to_src[req] = src
            if req not in src_to_reqs[src]:
                src_to_reqs[src].append(req)
            added += 1
    if added:
        log.info(f"Added {added} Core-Invest/comparison symbols")

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
    reception_time = datetime.now(timezone.utc).isoformat()   # Python server wall-clock
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

    # lp_time — TradingView's exchange event timestamp (Unix seconds, float).
    # Present when TV delivers it; absent on free-tier delayed feeds or when TV
    # simply omits it for this tick.  Fall back to reception_time so the feed
    # always writes a valid timestamp.
    raw_lp_time = v.get("lp_time")
    if raw_lp_time is not None:
        try:
            event_ts = datetime.fromtimestamp(float(raw_lp_time), tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OSError):
            event_ts = reception_time
    else:
        event_ts = reception_time   # best available: Python server reception time

    previous_price = quote_runtime_state.get(req_sym, {}).get("price")
    sequence = int(quote_runtime_state.get(req_sym, {}).get("sequence", 0)) + 1

    row = {
        "symbol":     req_sym,
        "open":       state["open"],
        "high":       state["high"],
        "low":        state["low"],
        "close":      state["close"],
        "volume":     state["volume"],
        # timestamp = real exchange event time (lp_time) when TV provides it;
        #             Python server reception time otherwise.
        # updated_at = always Python server reception time (≈ DB insert time).
        "timestamp":  event_ts,
        "updated_at": reception_time,
    }
    _heartbeat["last_tick_at"] = reception_time
    quote_runtime_state[req_sym] = {
        "price": state["close"],
        "previousPrice": previous_price,
        "providerTimestampUtc": event_ts,
        "receivedTimestampUtc": reception_time,
        "sequence": sequence,
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
        _heartbeat["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
        _write_runtime_status()
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
    # lp_time = TradingView's exchange event timestamp for the last price tick.
    # Not all symbols / account tiers deliver it; _store_quote falls back to
    # datetime.now() when absent so the feed continues working either way.
    _send(ws, "quote_set_fields", [q_session, "lp", "lp_time", "open_price", "high_price", "low_price", "volume"])

    # Subscribe all unique TV sources
    all_reqs = fast_reqs + slow_reqs
    subscribed_sources: set[str] = set()
    _subscription_state["requested"] = sorted({req_to_src[req] for req in all_reqs if req in req_to_src})
    _subscription_state["resolved"] = sorted(subscribed_sources)
    for req in all_reqs:
        src = req_to_src.get(req)
        if src and src not in subscribed_sources:
            try:
                _send(ws, "quote_add_symbols", [q_session, src])
                subscribed_sources.add(src)
                _subscription_state["started"].add(src)
                _mark_subscription_started(src, src_to_reqs.get(src, []))
            except Exception as exc:
                _subscription_state["failed"].add(src)
                _subscription_state["failureDetails"].append({
                    "source": src,
                    "error": str(exc),
                })

    _subscription_state["resolved"] = sorted(subscribed_sources)
    _write_runtime_status()

    log.info(f"Connected — {len(subscribed_sources)} TV sources subscribed — debug window 10s")

    # Chart sessions for real OHLC bars (timescale_update / du)
    cs_session_map: dict[str, tuple[str, str]] = {}
    setup_chart_sessions(ws, cs_session_map)

    # Flush thread
    stop_evt = threading.Event()
    last_fast = time.time()
    last_slow = time.time()

    def flush_loop():
        nonlocal last_fast, last_slow
        last_snapshot = 0.0
        while not stop_evt.is_set():
            now = time.time()
            if now - last_fast >= FAST_FLUSH_SECS:
                flush_batch(fast_buffer, "fast")
                flush_bars()
                last_fast = now
            if now - last_slow >= SLOW_FLUSH_SECS:
                flush_batch(slow_buffer, "slow")
                last_slow = now
            if now - last_snapshot >= SLOW_FLUSH_SECS:
                _write_quote_runtime_state(set(req_to_src.keys()))
                _write_runtime_status()
                last_snapshot = now
            time.sleep(1)

    t = threading.Thread(target=flush_loop, daemon=True)
    t.start()

    try:
        while True:
            raw = ws.recv()
            if not raw:
                continue

            if time.time() < debug_until:
                log.info(f"[raw] {raw[:400]}")

            # TV frames pack one or more messages as ~m~<len>~m~<content>[~m~<len>~m~<content>...]
            # Split on the frame separator to get each individual message content.
            # This is critical: if we only regex-search the first {}, a large timescale_update
            # frame that arrives with subsequent messages appended will fail json.loads.
            parts = re.split(r"~m~\d+~m~", raw)
            for part in parts:
                part = part.strip()
                if not part:
                    continue

                # Ping/pong
                if part.startswith("~h~"):
                    ws.send(_wrap(part))
                    continue

                # Parse JSON
                try:
                    msg = json.loads(part)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("m")

                # Chart series data — real OHLC bars (no day-session-extreme contamination)
                if msg_type in ("timescale_update", "du"):
                    p = msg.get("p", [])
                    if len(p) >= 2 and isinstance(p[1], dict):
                        cfg = cs_session_map.get(str(p[0]))
                        if cfg:
                            req_sym_c, tf_c = cfg
                            _process_chart_bars(req_sym_c, tf_c, p[1])
                            log.info(f"[chart-recv] {msg_type} → {req_sym_c} {tf_c} ({len(bar_buffer)} bars buffered)")
                    continue

                if msg_type != "qsd":
                    continue

                p = msg.get("p", [])
                if len(p) < 2:
                    continue

                payload = p[1]
                tv_sym: str = payload.get("n", "")
                v: dict = payload.get("v", {})

                if not tv_sym or not v:
                    continue

                _record_provider_event(tv_sym, v, src_to_reqs.get(tv_sym, []))

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
        flush_bars()
        _write_quote_runtime_state(set(req_to_src.keys()))
        _write_runtime_status()
        try:
            ws.close()
        except Exception:
            pass

# ── PID lock — single-instance guarantee ─────────────────────────────────────

PID_FILE = ROOT / "tv_live_feed.pid"


def _is_process_alive(pid: int) -> bool:
    """Windows-safe process liveness check using tasklist."""
    import subprocess as _sp
    try:
        result = _sp.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
            capture_output=True, text=True, timeout=5,
        )
        return str(pid) in result.stdout
    except Exception:
        try:
            os.kill(pid, 0)
            return True
        except (ProcessLookupError, OSError):
            return False


def acquire_pid_lock() -> bool:
    """Write PID file. Return False if another live instance is running."""
    if PID_FILE.exists():
        try:
            existing_pid = int(PID_FILE.read_text().strip())
        except (ValueError, OSError):
            existing_pid = None
        if existing_pid and existing_pid != os.getpid():
            if _is_process_alive(existing_pid):
                log.error(
                    f"Another instance is already running (PID {existing_pid}). "
                    f"Exiting. Remove {PID_FILE} manually if the process is dead."
                )
                return False
            log.warning(f"Stale PID file (PID {existing_pid} not found). Overwriting.")
    PID_FILE.write_text(str(os.getpid()))
    return True


def release_pid_lock() -> None:
    try:
        if PID_FILE.exists() and PID_FILE.read_text().strip() == str(os.getpid()):
            PID_FILE.unlink()
    except OSError:
        pass


# ── Heartbeat state ───────────────────────────────────────────────────────────

_heartbeat: dict = {
    "started_at":       None,
    "last_tick_at":     None,
    "last_db_write_at": None,
    "reconnect_count":  0,
    "session_active":   False,
}
_subscription_state: dict = {
    "requested": [],
    "resolved": [],
    "started": set(),
    "failed": set(),
    "failureDetails": [],
}


def hb_reconnect() -> None:
    _heartbeat["reconnect_count"] += 1
    _heartbeat["session_active"] = True


def hb_session_end() -> None:
    _heartbeat["session_active"] = False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not acquire_pid_lock():
        sys.exit(1)

    _heartbeat["started_at"] = datetime.now(timezone.utc).isoformat()

    try:
        req_to_src, src_to_reqs = load_symbol_map()
        if not req_to_src:
            log.error("No symbols loaded — aborting")
            return

        fast_reqs, slow_reqs = select_subscriptions(req_to_src)
        backoff_idx = 0

        while True:
            try:
                hb_reconnect()
                run_session(fast_reqs, slow_reqs, req_to_src, src_to_reqs)
                hb_session_end()
                # Clean return → soft reconnect
                delay = BACKOFF_STEPS[0]
                log.warning(f"Session ended cleanly — reconnect in {delay}s")
                time.sleep(delay)
                backoff_idx = max(0, backoff_idx - 1)
            except KeyboardInterrupt:
                log.info("Stopped by user.")
                break
            except Exception as e:
                hb_session_end()
                delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
                log.error(f"Session error: {e} — reconnect in {delay}s")
                time.sleep(delay)
                backoff_idx += 1
    finally:
        release_pid_lock()
        log.info("PID lock released.")


if __name__ == "__main__":
    main()
