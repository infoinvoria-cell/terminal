"""
OHLC Cache Builder — Fund Manager Dashboard
============================================
Merges local CSV historical data + tvdatafeed (live tail + today's bar)
into TVC cache JSON files for all production assets.

Sources (priority: tvdatafeed > CSV):
  - CSV backbone:  data/historical/**/*.csv  (goes back to 1968/1970)
  - tvdatafeed:    last 5000 bars + today's live bar (updates every 5 min)
  - Intraday:      multiple CSV chunks merged, then aggregated to 1H / 2H

Outputs to:
  - Fund Manager Dashboard:  public/generated/monitoring/tradingview_data_cache/
  - Invoria Dashboard:       frontend/public/generated/monitoring/tradingview_data_cache/
  - Capitalife Brain:        08_Data/ohlc_cache/

Security: Monitoring only. No execution. No order routing. No secrets.

Usage:
  python tools/monitoring/build-ohlc-cache.py
  python tools/monitoring/build-ohlc-cache.py --assets GC1! ZC1!   (subset)
  python tools/monitoring/build-ohlc-cache.py --no-live             (CSV only, no tvdatafeed)
  python tools/monitoring/build-ohlc-cache.py --dry-run
"""

import argparse
import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

try:
    from tvDatafeed import TvDatafeed, Interval
    HAS_TV = True
except ImportError:
    HAS_TV = False

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).resolve().parent
FUND_MGR    = SCRIPT_DIR.parent.parent
DATA_DIR    = FUND_MGR / "data" / "historical"
INVORIA     = FUND_MGR.parent / "Invoria Dashboard"
BRAIN       = FUND_MGR.parent / "Capitalife Brain"

# Output directories (all three destinations)
OUT_DIRS = {
    "fund_mgr": FUND_MGR / "public/generated/monitoring/tradingview_data_cache",
    "invoria":  INVORIA  / "frontend/public/generated/monitoring/tradingview_data_cache",
    "brain":    BRAIN    / "08_Data/ohlc_cache",
}

# ── Asset definitions ─────────────────────────────────────────────────────────
# (key, tv_symbol, tv_exchange, interval, cache_file, csv_files)
# csv_files: list of paths relative to DATA_DIR, merged in order (oldest first)

D  = Interval.in_daily      if HAS_TV else "D"
I30 = Interval.in_30_minute if HAS_TV else "30M"
I1H = Interval.in_1_hour    if HAS_TV else "1H"
I2H = Interval.in_2_hour    if HAS_TV else "2H"

ASSETS = [
    # ── Agrar ────────────────────────────────────────────────────────────────
    ("ZC1!",   "ZC1!",    "CBOT",       D,   "D/CBOT_ZC1_D.json",      ["agrar/CBOT_ZC1_D.csv"]),
    ("ZW1!",   "ZW1!",    "CBOT",       D,   "D/CBOT_ZW1_D.json",      ["agrar/CBOT_ZW1_D.csv"]),
    ("ZS1!",   "ZS1!",    "CBOT",       D,   "D/CBOT_ZS1_D.json",      ["agrar/CBOT_ZS1_D.csv"]),
    ("CC1!",   "CC1!",    "ICEUS",      D,   "D/ICEUS_CC1_D.json",     ["agrar/ICEUS_CC1_D.csv"]),
    ("KC1!",   "KC1!",    "ICEUS",      D,   "D/ICEUS_KC1_D.json",     ["agrar/ICEUS_KC1_D.csv"]),
    ("OJ1!",   "OJ1!",    "ICEUS",      D,   "D/ICEUS_OJ1_D.json",     ["agrar/ICEUS_OJ1_D.csv"]),
    ("SB1!",   "SB1!",    "ICEUS",      D,   "D/ICEUS_SB1_D.json",     ["agrar/ICEUS_SB1_D.csv"]),
    ("CT1!",   "CT1!",    "ICEUS",      D,   "D/ICEUS_CT1_D.json",     ["agrar/ICEUS_CT1_D.csv"]),
    # ── Metalle ──────────────────────────────────────────────────────────────
    ("GC1!",   "GC1!",    "COMEX",      D,   "D/COMEX_GC1_D.json",     ["metals/COMEX_GC1_D.csv"]),
    ("SI1!",   "SI1!",    "COMEX",      D,   "D/COMEX_SI1_D.json",     ["metals/COMEX_SI1_D.csv"]),
    ("HG1!",   "HG1!",    "COMEX",      D,   "D/COMEX_HG1_D.json",     ["metals/COMEX_HG1_D.csv"]),
    ("PL1!",   "PL1!",    "NYMEX",      D,   "D/NYMEX_PL1_D.json",     ["metals/NYMEX_PL1_D.csv"]),
    ("PA1!",   "PA1!",    "NYMEX",      D,   "D/NYMEX_PA1_D.json",     ["metals/NYMEX_PA1_D.csv"]),
    # ── Energie ──────────────────────────────────────────────────────────────
    ("CL1!",   "CL1!",    "NYMEX",      D,   "D/NYMEX_CL1_D.json",     ["energy/NYMEX_CL1_D.csv"]),
    ("NG1!",   "NG1!",    "NYMEX",      D,   "D/NYMEX_NG1_D.json",     ["energy/NYMEX_NG1_D.csv"]),
    ("RB1!",   "RB1!",    "NYMEX",      D,   "D/NYMEX_RB1_D.json",     ["energy/NYMEX_RB1_D.csv"]),
    # ── Indizes ──────────────────────────────────────────────────────────────
    ("ES1!",   "ES1!",    "CME_MINI",   D,   "D/CME_MINI_ES1_D.json",  ["indices/CME_MINI_ES1_D.csv"]),
    ("NQ1!",   "NQ1!",    "CME_MINI",   D,   "D/CME_MINI_NQ1_D.json",  ["indices/CME_MINI_NQ1_D.csv"]),
    ("YM1!",   "YM1!",    "CBOT_MINI",  D,   "D/CBOT_MINI_YM1_D.json", ["indices/CBOT_MINI_YM1_D.csv"]),
    ("FDAX1!", "FDAX1!",  "EUREX",      D,   "D/EUREX_FDAX1_D.json",   ["indices/EUREX_FDAX1_D.csv"]),
    ("UKX!",   "UKX",     "TVC",        D,   "D/TVC_UKX_D.json",       ["indices/FTSE_UKX_D.csv"]),
    # ── Aktien ───────────────────────────────────────────────────────────────
    ("AAPL",   "AAPL",    "NASDAQ",     D,   "D/NASDAQ_AAPL_D.json",   ["aktien/BATS_AAPL_D.csv"]),
    ("AMZN",   "AMZN",    "NASDAQ",     D,   "D/NASDAQ_AMZN_D.json",   ["aktien/BATS_AMZN_D.csv"]),
    ("GOOGL",  "GOOGL",   "NASDAQ",     D,   "D/NASDAQ_GOOGL_D.json",  ["aktien/BATS_GOOGL_D.csv"]),
    ("META",   "META",    "NASDAQ",     D,   "D/NASDAQ_META_D.json",   ["aktien/BATS_META_D.csv"]),
    ("MSFT",   "MSFT",    "NASDAQ",     D,   "D/NASDAQ_MSFT_D.json",   ["aktien/BATS_MSFT_D.csv"]),
    ("NVDA",   "NVDA",    "NASDAQ",     D,   "D/NASDAQ_NVDA_D.json",   ["aktien/BATS_NVDA_D.csv"]),
    # ── Forex Forex8 ─────────────────────────────────────────────────────────
    ("EURGBP", "EURGBP",  "VANTAGE",   D,   "D/VANTAGE_EURGBP_D.json",["forex/IBKR_EURGBP_D.csv"]),
    ("GBPJPY", "GBPJPY",  "VANTAGE",   D,   "D/VANTAGE_GBPJPY_D.json",["forex/IBKR_GBPJPY_D.csv"]),
    ("MXNUSD", "MXNUSD",  "FX_IDC",   D,   "D/FX_IDC_MXNUSD_D.json", ["forex/FX_IDC_MXNUSD_D.csv"]),
    ("NOKUSD", "NOK1!",   "CME",       D,   "D/CME_NOK1_D.json",      ["forex/CME_NOK1_D.csv"]),
    ("CLPUSD", "CLPUSD",  "FX_IDC",   D,   "D/FX_IDC_CLPUSD_D.json", ["forex/FX_IDC_CLPUSD_D.csv"]),
    ("SEKUSD", "SEKUSD",  "FX_IDC",   D,   "D/FX_IDC_SEKUSD_D.json", ["forex/FX_IDC_SEKUSD_D.csv"]),
    ("BRLUSD", "BRLUSD",  "FX_IDC",   D,   "D/FX_IDC_BRLUSD_D.json", ["forex/FX_IDC_BRLUSD_D.csv"]),
    ("ZARUSD", "ZARUSD",  "FX_IDC",   D,   "D/FX_IDC_ZARUSD_D.json", ["forex/FX_IDC_ZARUSD_D.csv"]),
    # ── Benchmarks / Makro ───────────────────────────────────────────────────
    ("DXY",    "DXY",     "ICEUS",     D,   "D/ICEUS_DXY_D.json",     ["benchmarks/ICEUS_DXY_D.csv"]),
    ("VIX",    "VIX",     "TVC",       D,   "D/TVC_VIX_D.json",       ["benchmarks/TVC_VIX_D.csv"]),
    ("US10Y",  "US10Y",   "TVC",       D,   "D/TVC_US10Y_D.json",     ["benchmarks/TVC_US10Y_D.csv"]),
    ("US02Y",  "US02Y",   "TVC",       D,   "D/TVC_US02Y_D.json",     ["benchmarks/TVC_US02Y_D.csv"]),
    ("SPY",    "SPY",     "BATS",      D,   "D/BATS_SPY_D.json",      ["benchmarks/BATS_SPY_D.csv"]),
    ("BB1!",   "BB1!",    "NYMEX",     D,   "D/NYMEX_BB1_D.json",     ["benchmarks/NYMEX_BB1_D.csv"]),
    ("6E1!",   "6E1!",    "CME",       D,   "D/CME_6E1_D.json",       ["benchmarks/CME_6E1_D.csv"]),
    ("6B1!",   "6B1!",    "CME",       D,   "D/CME_6B1_D.json",       ["benchmarks/CME_6B1_D.csv"]),
    ("6J1!",   "6J1!",    "CME",       D,   "D/CME_6J1_D.json",       ["benchmarks/CME_6J1_D.csv"]),
    # ── Intraday MT (30M — merged from chunks) ───────────────────────────────
    # These have special handling: csv_files lists ALL chunks sorted by name
    ("DE30EUR_30M", "DE30EUR", "OANDA", I30, "30M/OANDA_DE30EUR_30M.json",
        sorted([str(p.relative_to(DATA_DIR)) for p in (DATA_DIR / "intraday").glob("OANDA_DE30EUR_30M*.csv")])),
    ("EURUSD_30M",  "EURUSD",  "OANDA", I30, "30M/OANDA_EURUSD_30M.json",
        sorted([str(p.relative_to(DATA_DIR)) for p in (DATA_DIR / "intraday").glob("OANDA_EURUSD_30M*.csv")])),
    ("GBPUSD_30M",  "GBPUSD",  "OANDA", I30, "30M/OANDA_GBPUSD_30M.json",
        sorted([str(p.relative_to(DATA_DIR)) for p in (DATA_DIR / "intraday").glob("OANDA_GBPUSD_30M*.csv")])),
    # 1H / 2H: aggregated from 30M — no separate CSV, no tvdatafeed fetch needed
    # (built in post-process step from the 30M cache)
]

# ── CSV parser ────────────────────────────────────────────────────────────────

def parse_tv_csv(filepath: Path) -> list[dict]:
    """Parse TradingView-exported CSV. Handles YYYY-MM-DD and ISO timestamps."""
    bars = []
    try:
        with open(filepath, encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                return []
            h = [c.lower().strip() for c in header]
            ti = h.index("time") if "time" in h else 0
            oi = h.index("open") if "open" in h else 1
            hi = h.index("high") if "high" in h else 2
            li = h.index("low")  if "low"  in h else 3
            ci = h.index("close")if "close" in h else 4
            vi = h.index("volume") if "volume" in h else -1

            for row in reader:
                if len(row) < 5:
                    continue
                raw_t = row[ti].strip().strip('"')
                # Parse date — supports YYYY-MM-DD, ISO with TZ, Unix timestamp
                date_str = None
                try:
                    if raw_t.lstrip("-").isdigit():
                        ts = int(raw_t)
                        if ts > 1e10:
                            ts //= 1000
                        date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                    elif "T" in raw_t or " " in raw_t:
                        # ISO timestamp — keep full for intraday
                        date_str = raw_t[:19].replace(" ", "T")
                        # Normalize timezone offset away
                        if "+" in date_str[10:]:
                            date_str = date_str[:19]
                        elif date_str.endswith("Z"):
                            date_str = date_str[:-1]
                    else:
                        date_str = raw_t[:10]
                except Exception:
                    continue

                if not date_str:
                    continue

                def sf(idx):
                    try:
                        v = float(row[idx])
                        return v if math.isfinite(v) else None
                    except Exception:
                        return None

                bars.append({
                    "date":   date_str,
                    "open":   sf(oi),
                    "high":   sf(hi),
                    "low":    sf(li),
                    "close":  sf(ci),
                    "volume": sf(vi) if vi >= 0 and vi < len(row) else None,
                })
    except Exception as e:
        print(f"    [CSV ERROR] {filepath.name}: {e}")
    return bars


def merge_csv_files(paths: list[Path]) -> list[dict]:
    """Merge multiple CSV files, deduplicate by date, sort ascending."""
    seen: dict[str, dict] = {}
    for p in paths:
        if not p.exists():
            print(f"    [MISSING CSV] {p}")
            continue
        bars = parse_tv_csv(p)
        for b in bars:
            seen[b["date"]] = b  # later file wins for same date
    return sorted(seen.values(), key=lambda b: b["date"])


# ── tvdatafeed fetch ──────────────────────────────────────────────────────────

def fetch_tv(tv, symbol: str, exchange: str, interval, n_bars: int = 5000) -> list[dict]:
    if not HAS_TV or tv is None:
        return []
    try:
        df = tv.get_hist(symbol, exchange, interval=interval, n_bars=n_bars)
        if df is None or df.empty:
            return []
        df = df.dropna(subset=["close"])
        bars = []
        for dt, row in df.iterrows():
            if hasattr(dt, "strftime"):
                if interval in (I30, I1H, I2H):
                    date_str = dt.strftime("%Y-%m-%dT%H:%M:%S")
                else:
                    date_str = dt.strftime("%Y-%m-%d")
            else:
                date_str = str(dt)[:10]
            def sf(v):
                try:
                    f = float(v)
                    return f if math.isfinite(f) else None
                except Exception:
                    return None
            bars.append({
                "date":   date_str,
                "open":   sf(row.get("open")),
                "high":   sf(row.get("high")),
                "low":    sf(row.get("low")),
                "close":  sf(row.get("close")),
                "volume": sf(row.get("volume")),
            })
        return bars
    except Exception as e:
        print(f"    [TV ERROR] {symbol}: {e}")
        return []


def merge_csv_and_tv(csv_bars: list[dict], tv_bars: list[dict]) -> list[dict]:
    """Merge CSV (backbone) with tvdatafeed (tail). tvdatafeed wins on overlap."""
    combined: dict[str, dict] = {}
    for b in csv_bars:
        combined[b["date"]] = b
    for b in tv_bars:
        combined[b["date"]] = b  # tv overwrites CSV for same date
    return sorted(combined.values(), key=lambda b: b["date"])


# ── Aggregate 30M → 1H / 2H ──────────────────────────────────────────────────

def aggregate_intraday(bars_30m: list[dict], target_minutes: int) -> list[dict]:
    """Aggregate 30M bars to 1H (60min) or 2H (120min) by grouping on floor(time)."""
    result: dict[str, dict] = {}
    for b in bars_30m:
        try:
            dt = datetime.strptime(b["date"], "%Y-%m-%dT%H:%M:%S")
            # Floor to target_minutes boundary
            mins = (dt.hour * 60 + dt.minute) // target_minutes * target_minutes
            floored = dt.replace(hour=mins // 60, minute=mins % 60, second=0)
            key = floored.strftime("%Y-%m-%dT%H:%M:%S")
        except Exception:
            continue
        if key not in result:
            result[key] = {
                "date":   key,
                "open":   b["open"],
                "high":   b["high"],
                "low":    b["low"],
                "close":  b["close"],
                "volume": b["volume"] or 0.0,
            }
        else:
            ag = result[key]
            if b["high"] is not None and (ag["high"] is None or b["high"] > ag["high"]):
                ag["high"] = b["high"]
            if b["low"] is not None and (ag["low"] is None or b["low"] < ag["low"]):
                ag["low"] = b["low"]
            ag["close"] = b["close"]
            if b["volume"] is not None:
                ag["volume"] = (ag["volume"] or 0.0) + b["volume"]
    return sorted(result.values(), key=lambda b: b["date"])


# ── TVC cache writer ──────────────────────────────────────────────────────────

def to_tvc_payload(key: str, symbol: str, exchange: str, tf_label: str, bars: list[dict]) -> dict:
    source = f"{exchange}:{symbol}"
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    clean = [
        {"time": None, "date": b["date"], "open": b["open"], "high": b["high"],
         "low": b["low"], "close": b["close"], "volume": b["volume"]}
        for b in bars if b.get("close") is not None
    ]
    return {
        "schema":      "tvc-cache-v1",
        "source":      source,
        "symbol":      symbol,
        "timeframe":   tf_label,
        "provider":    "csv+tvdatafeed",
        "variant":     "continuous_adjusted",
        "barCount":    len(clean),
        "firstDate":   clean[0]["date"]  if clean else None,
        "lastDate":    clean[-1]["date"] if clean else None,
        "firstCandleTimestamp": None,
        "lastCandleTimestamp":  None,
        "refreshedAt": now,
        "bars":        clean,
    }


def write_all(cache_file: str, payload: dict, dry_run: bool):
    for dest_name, base in OUT_DIRS.items():
        out = base / cache_file
        if dry_run:
            print(f"    [DRY] -> {out}")
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(out)
    if not dry_run:
        sizes = [str(len(payload["bars"])) + " bars"]
        print(f"    -> written to {len(OUT_DIRS)} destinations  ({', '.join(sizes)})")


# ── Interval label ────────────────────────────────────────────────────────────

def tf_label(interval) -> str:
    if not HAS_TV:
        return str(interval)
    return {
        Interval.in_daily:       "D",
        Interval.in_30_minute:   "30M",
        Interval.in_1_hour:      "1H",
        Interval.in_2_hour:      "2H",
    }.get(interval, "D")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets",   nargs="*", help="Asset key subset (default: all)")
    parser.add_argument("--no-live",  action="store_true", help="Skip tvdatafeed, use CSV only")
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--delay",    type=float, default=1.2)
    args = parser.parse_args()

    print(f"[build-ohlc-cache] {datetime.now().isoformat()[:19]}")
    print(f"  DATA_DIR : {DATA_DIR}")
    print(f"  live     : {not args.no_live and HAS_TV}")
    print(f"  dry_run  : {args.dry_run}\n")

    tv = None
    if not args.no_live and HAS_TV:
        tv = TvDatafeed()

    target_keys = set(args.assets) if args.assets else None
    targets = [(k, *rest) for k, *rest in ASSETS if target_keys is None or k in target_keys]

    results = []

    for key, symbol, exchange, interval, cache_file, csv_rel_paths in targets:
        tfl = tf_label(interval)
        is_intraday = tfl in ("30M", "1H", "2H")
        print(f"  [{key}] {exchange}:{symbol} {tfl}", flush=True)

        # 1. Load CSV backbone
        csv_paths = [DATA_DIR / p for p in csv_rel_paths]
        csv_bars = merge_csv_files(csv_paths)
        print(f"    CSV: {len(csv_bars)} bars  first={csv_bars[0]['date'] if csv_bars else '?'}")

        # 2. Fetch tvdatafeed tail (5000 bars for daily, 2000 for intraday)
        tv_bars = []
        if not args.no_live and HAS_TV and tv is not None:
            n = 2000 if is_intraday else 5000
            tv_bars = fetch_tv(tv, symbol, exchange, interval, n_bars=n)
            if tv_bars:
                print(f"    TV:  {len(tv_bars)} bars  last={tv_bars[-1]['date']}")
            time.sleep(args.delay)

        # 3. Merge
        merged = merge_csv_and_tv(csv_bars, tv_bars)
        print(f"    merged: {len(merged)} bars  {merged[0]['date'] if merged else '?'} -> {merged[-1]['date'] if merged else '?'}")

        # 4. Write
        payload = to_tvc_payload(key, symbol, exchange, tfl, merged)
        write_all(cache_file, payload, args.dry_run)
        results.append({"key": key, "status": "ok", "bars": len(merged),
                        "first": merged[0]["date"] if merged else None,
                        "last":  merged[-1]["date"] if merged else None})

    # ── Post-process: build 1H and 2H from 30M ───────────────────────────────
    print("\n  [POST] Aggregating DE30EUR 30M -> 1H / 2H ...")
    for symbol_30m, agg_minutes, agg_tf, out_file in [
        ("DE30EUR_30M", 60,  "1H", "1H/OANDA_DE30EUR_1H.json"),
        ("DE30EUR_30M", 120, "2H", "2H/OANDA_DE30EUR_2H.json"),
    ]:
        src_file = OUT_DIRS["fund_mgr"] / "30M/OANDA_DE30EUR_30M.json"
        if not src_file.exists():
            print(f"    [SKIP] {out_file}: source 30M not built yet")
            continue
        src = json.loads(src_file.read_text(encoding="utf-8"))
        bars_30m = src.get("bars", [])
        # bars have "date" field = ISO timestamp
        agg = aggregate_intraday(bars_30m, agg_minutes)
        payload = to_tvc_payload(f"DE30EUR_{agg_tf}", "DE30EUR", "OANDA", agg_tf, agg)
        write_all(out_file, payload, args.dry_run)
        print(f"    {agg_tf}: {len(agg)} bars  last={agg[-1]['date'] if agg else '?'}")

    # ── Summary ───────────────────────────────────────────────────────────────
    ok = [r for r in results if r["status"] == "ok"]
    err= [r for r in results if r["status"] != "ok"]
    print(f"\n{'='*60}")
    print(f"  OK: {len(ok)}   ERROR: {len(err)}")
    if err:
        for r in err:
            print(f"  ERROR: {r['key']} — {r.get('error')}")

    # Write manifest
    if not args.dry_run:
        manifest = {
            "builtAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "securityLabel": "Monitoring only — Forward tracking / not live execution",
            "results": results,
        }
        manifest_path = OUT_DIRS["fund_mgr"] / "D/_build_manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("="*60)
    sys.exit(1 if err else 0)


if __name__ == "__main__":
    main()
