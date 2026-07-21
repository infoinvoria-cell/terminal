"""
TVC Cache Refresh — Fund Manager Dashboard
Uses tvdatafeed (pip install tradingview-datafeed) to fetch daily OHLC bars
and write them into public/generated/monitoring/tradingview_data_cache/D/*.json

Security: Monitoring only. No execution. No order routing. No secrets.

Usage:
  python tools/monitoring/refresh-tvc-cache.py
  python tools/monitoring/refresh-tvc-cache.py --assets GC1! SI1! CL1!  (subset)
  python tools/monitoring/refresh-tvc-cache.py --dry-run

Schedule via Windows Task Scheduler: run daily at 22:00 (after US close).
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from tvDatafeed import TvDatafeed, Interval
except ImportError:
    sys.exit("ERROR: tradingview-datafeed not installed. Run: pip install tradingview-datafeed")

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).resolve().parent
FUND_MGR    = SCRIPT_DIR.parent.parent
TVC_ROOT    = FUND_MGR / "public/generated/monitoring/tradingview_data_cache"
CACHE_DIR   = TVC_ROOT / "D"
MANIFEST    = CACHE_DIR / "_refresh_manifest.json"
FULL_MANIFEST = TVC_ROOT / "cache_manifest_full.json"

INTRADAY_INTERVALS = None  # set after Interval import

# ── Asset definitions ────────────────────────────────────────────────────────
# Format: (symbol_key, tv_symbol, tv_exchange, interval, cache_file, n_bars)
# tv_symbol and tv_exchange must match what TvDatafeed.get_hist() expects.
# cache_file naming convention: {EXCHANGE}_{SYMBOL_CLEAN}_D.json
# Intraday assets use their own interval and get _1H / _2H / _30M files.

DAILY = Interval.in_daily

INTRADAY_INTERVALS = {Interval.in_30_minute, Interval.in_1_hour, Interval.in_2_hour}

ASSETS = [
    # ── Agrar ────────────────────────────────────────────────────────────────
    ("ZC1!",   "ZC1!",    "CBOT",       DAILY,               "CBOT_ZC1_D.json",       15000),
    ("ZW1!",   "ZW1!",    "CBOT",       DAILY,               "CBOT_ZW1_D.json",       15000),
    ("ZS1!",   "ZS1!",    "CBOT",       DAILY,               "CBOT_ZS1_D.json",       15000),
    ("CC1!",   "CC1!",    "ICEUS",      DAILY,               "ICEUS_CC1_D.json",      15000),
    ("KC1!",   "KC1!",    "ICEUS",      DAILY,               "ICEUS_KC1_D.json",      15000),
    ("OJ1!",   "OJ1!",    "ICEUS",      DAILY,               "ICEUS_OJ1_D.json",      15000),
    ("SB1!",   "SB1!",    "ICEUS",      DAILY,               "ICEUS_SB1_D.json",      15000),
    ("CT1!",   "CT1!",    "ICEUS",      DAILY,               "ICEUS_CT1_D.json",      15000),
    # ── Metalle ──────────────────────────────────────────────────────────────
    ("GC1!",   "GC1!",    "COMEX",      DAILY,               "COMEX_GC1_D.json",      15000),
    ("SI1!",   "SI1!",    "COMEX",      DAILY,               "COMEX_SI1_D.json",      15000),
    ("HG1!",   "HG1!",    "COMEX",      DAILY,               "COMEX_HG1_D.json",      15000),
    ("PL1!",   "PL1!",    "NYMEX",      DAILY,               "NYMEX_PL1_D.json",      15000),
    ("PA1!",   "PA1!",    "NYMEX",      DAILY,               "NYMEX_PA1_D.json",      15000),
    # ── Energie ──────────────────────────────────────────────────────────────
    ("CL1!",   "CL1!",    "NYMEX",      DAILY,               "NYMEX_CL1_D.json",      15000),
    ("NG1!",   "NG1!",    "NYMEX",      DAILY,               "NYMEX_NG1_D.json",      15000),
    ("RB1!",   "RB1!",    "NYMEX",      DAILY,               "NYMEX_RB1_D.json",      15000),
    # ── Indizes ──────────────────────────────────────────────────────────────
    ("ES1!",   "ES1!",    "CME_MINI",   DAILY,               "CME_MINI_ES1_D.json",   15000),
    ("NQ1!",   "NQ1!",    "CME_MINI",   DAILY,               "CME_MINI_NQ1_D.json",   15000),
    ("YM1!",   "YM1!",    "CBOT_MINI",  DAILY,               "CBOT_MINI_YM1_D.json",  15000),
    ("FDAX1!", "FDAX1!",  "EUREX",      DAILY,               "EUREX_FDAX1_D.json",    15000),
    ("UKX!",   "UKX",     "TVC",        DAILY,               "TVC_UKX_D.json",        15000),
    # ── Aktien ───────────────────────────────────────────────────────────────
    ("AAPL",   "AAPL",    "NASDAQ",     DAILY,               "NASDAQ_AAPL_D.json",    15000),
    ("AMZN",   "AMZN",    "NASDAQ",     DAILY,               "NASDAQ_AMZN_D.json",    15000),
    ("GOOGL",  "GOOGL",   "NASDAQ",     DAILY,               "NASDAQ_GOOGL_D.json",   15000),
    ("META",   "META",    "NASDAQ",     DAILY,               "NASDAQ_META_D.json",    15000),
    ("MSFT",   "MSFT",    "NASDAQ",     DAILY,               "NASDAQ_MSFT_D.json",    15000),
    ("NVDA",   "NVDA",    "NASDAQ",     DAILY,               "NASDAQ_NVDA_D.json",    15000),
    # ── Invest (OANDA) ───────────────────────────────────────────────────────
    ("NAS100USD", "NAS100USD", "OANDA", DAILY,               "OANDA_NAS100USD_D.json", 15000),
    ("USDCHF",    "USDCHF",   "OANDA",  DAILY,               "OANDA_USDCHF_D.json",   15000),
    ("EURUSD",    "EURUSD",   "OANDA",  DAILY,               "OANDA_EURUSD_D.json",   15000),
    ("GBPUSD",    "GBPUSD",   "OANDA",  DAILY,               "OANDA_GBPUSD_D.json",   15000),
    # ── FX Forex8 ────────────────────────────────────────────────────────────
    ("EURGBP",  "EURGBP", "VANTAGE",   DAILY,               "VANTAGE_EURGBP_D.json", 15000),
    ("GBPJPY",  "GBPJPY", "VANTAGE",   DAILY,               "VANTAGE_GBPJPY_D.json", 15000),
    ("MXNUSD",  "MXNUSD", "FX_IDC",   DAILY,               "FX_IDC_MXNUSD_D.json",  15000),
    ("NOK1!",   "NOK1!",  "CME",       DAILY,               "CME_NOK1_D.json",        15000),
    ("CLPUSD",  "CLPUSD", "FX_IDC",   DAILY,               "FX_IDC_CLPUSD_D.json",  15000),
    ("SEKUSD",  "SEKUSD", "FX_IDC",   DAILY,               "FX_IDC_SEKUSD_D.json",  15000),
    ("BRLUSD",  "BRLUSD", "FX_IDC",   DAILY,               "FX_IDC_BRLUSD_D.json",  15000),
    ("ZARUSD",  "ZARUSD", "FX_IDC",   DAILY,               "FX_IDC_ZARUSD_D.json",  15000),
    # ── Intraday MT ──────────────────────────────────────────────────────────
    ("DE30EUR_1H", "DE30EUR", "OANDA", Interval.in_1_hour,  "OANDA_DE30EUR_1H.json", 2000),
    ("DE30EUR_2H", "DE30EUR", "OANDA", Interval.in_2_hour,  "OANDA_DE30EUR_2H.json", 2000),
    ("EURUSD_30M", "EURUSD",  "OANDA", Interval.in_30_minute, "OANDA_EURUSD_30M.json", 2000),
    ("GBPUSD_30M", "GBPUSD",  "OANDA", Interval.in_30_minute, "OANDA_GBPUSD_30M.json", 2000),
]

ASSET_MAP = {key: rest for key, *rest in ASSETS}

# ── Helpers ──────────────────────────────────────────────────────────────────

def safe_float(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except Exception:
        return None


def interval_label(interval: Interval) -> str:
    return {
        Interval.in_daily:      "D",
        Interval.in_1_hour:     "1H",
        Interval.in_2_hour:     "2H",
        Interval.in_30_minute:  "30M",
    }.get(interval, "D")


def df_to_bars(df, interval=None):
    is_intraday = interval in INTRADAY_INTERVALS
    bars = []
    for dt, row in df.iterrows():
        if is_intraday:
            date_str = dt.strftime("%Y-%m-%dT%H:%M:%S") if hasattr(dt, "strftime") else str(dt)[:19]
        else:
            date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        bars.append({
            "time":   None,
            "date":   date_str,
            "open":   safe_float(row.get("open")),
            "high":   safe_float(row.get("high")),
            "low":    safe_float(row.get("low")),
            "close":  safe_float(row.get("close")),
            "volume": safe_float(row.get("volume")),
        })
    return bars


def cache_path_for(interval, cache_file):
    """Return the correct output directory for the given interval."""
    tf = interval_label(interval)
    if interval in INTRADAY_INTERVALS:
        out_dir = TVC_ROOT / tf
    else:
        out_dir = CACHE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / cache_file


def merge_bars(existing_bars, new_bars):
    """Merge new_bars into existing_bars; new_bars win on duplicate date key."""
    by_date = {b["date"]: b for b in existing_bars}
    by_date.update({b["date"]: b for b in new_bars})
    return sorted(by_date.values(), key=lambda b: b["date"])


def build_payload(key, tv_symbol, tv_exchange, interval, bars):
    tf = interval_label(interval)
    source = f"{tv_exchange}:{tv_symbol}"
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema":               "tvc-cache-v1",
        "source":               source,
        "symbol":               tv_symbol,
        "timeframe":            tf,
        "provider":             "tvdatafeed",
        "variant":              "continuous_adjusted",
        "barCount":             len(bars),
        "firstDate":            bars[0]["date"]  if bars else None,
        "lastDate":             bars[-1]["date"] if bars else None,
        "firstCandleTimestamp": None,
        "lastCandleTimestamp":  None,
        "refreshedAt":          now,
        "bars":                 bars,
    }


def write_atomic(path: Path, payload: dict):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Refresh TVC OHLC cache from TradingView")
    parser.add_argument("--assets", nargs="*", help="Subset of asset keys to refresh (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but do not write files")
    parser.add_argument("--delay", type=float, default=1.5, help="Seconds between requests (default 1.5)")
    parser.add_argument("--live", action="store_true",
                        help="Live mode: fetch only recent bars and merge into existing files (for intraday)")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    target_keys = set(args.assets) if args.assets else None
    targets = [(key, *rest) for key, *rest in ASSETS if target_keys is None or key in target_keys]

    if args.live and not args.assets:
        # In live mode default to intraday assets only
        targets = [(key, *rest) for key, *rest in ASSETS
                   if interval_label(rest[2]) in ("30M", "1H", "2H")]

    if not targets:
        sys.exit(f"No matching assets for keys: {args.assets}")

    print(f"[refresh-tvc-cache] {datetime.now().isoformat()[:19]}")
    print(f"  Cache dir : {CACHE_DIR}")
    print(f"  Assets    : {len(targets)} of {len(ASSETS)}")
    print(f"  Dry run   : {args.dry_run}\n")

    tv = TvDatafeed()

    results = []
    for key, tv_symbol, tv_exchange, interval, cache_file, n_bars in targets:
        tf_label = interval_label(interval)
        out_path = CACHE_DIR / cache_file
        print(f"  [{key}] {tv_exchange}:{tv_symbol} {tf_label} -> {cache_file}", end=" ... ", flush=True)

        try:
            fetch_bars = 500 if args.live else n_bars
            df = tv.get_hist(tv_symbol, tv_exchange, interval=interval, n_bars=fetch_bars)
            if df is None or df.empty:
                print("WARN: no data returned")
                results.append({"key": key, "status": "no_data", "file": cache_file})
                continue

            # Drop rows where close is NaN (incomplete/in-progress bars)
            df = df.dropna(subset=["close"])

            out_path = cache_path_for(interval, cache_file)
            new_bars = df_to_bars(df, interval)

            if args.live and out_path.exists():
                # Merge: preserve full history, update/add recent bars
                try:
                    existing = json.load(open(out_path, encoding="utf-8"))
                    bars = merge_bars(existing.get("bars", []), new_bars)
                except Exception:
                    bars = new_bars
            else:
                bars = new_bars

            payload = build_payload(key, tv_symbol, tv_exchange, interval, bars)

            if not args.dry_run:
                write_atomic(out_path, payload)

            last = bars[-1]["date"] if bars else "?"
            print(f"OK  {len(bars)} bars  last={last}")
            results.append({"key": key, "status": "ok", "file": cache_file,
                            "barCount": len(bars), "lastDate": last})

        except Exception as e:
            print(f"ERROR: {e}")
            results.append({"key": key, "status": "error", "file": cache_file, "error": str(e)})

        time.sleep(args.delay)

    # ── Summary ──────────────────────────────────────────────────────────────
    ok    = [r for r in results if r["status"] == "ok"]
    warn  = [r for r in results if r["status"] in ("no_data",)]
    errors= [r for r in results if r["status"] == "error"]

    print(f"\n{'='*60}")
    print(f"  OK    : {len(ok)}")
    print(f"  WARN  : {len(warn)}")
    print(f"  ERROR : {len(errors)}")
    if errors:
        print("\n  Errors:")
        for r in errors:
            print(f"    {r['key']}: {r.get('error')}")
    if warn:
        print("\n  No data:")
        for r in warn:
            print(f"    {r['key']}")

    # Write refresh manifest
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if not args.dry_run:
        manifest = {
            "refreshedAt": now_iso,
            "securityLabel": "Monitoring only — Forward tracking / not live execution",
            "total": len(results),
            "ok": len(ok),
            "warn": len(warn),
            "errors": len(errors),
            "results": results,
        }
        write_atomic(MANIFEST, manifest)
        print(f"\n  Manifest: {MANIFEST}")

        # Patch cache_manifest_full.json so the browser detects fresh data
        if FULL_MANIFEST.exists():
            try:
                full = json.load(open(FULL_MANIFEST, encoding="utf-8"))
                full["generatedAt"] = now_iso
                ok_map = {r["key"]: r for r in ok}
                for asset in full.get("assets", []):
                    key = asset.get("asset", "")
                    if key in ok_map:
                        asset["lastDate"] = ok_map[key]["lastDate"]
                        asset["refreshedAt"] = now_iso
                write_atomic(FULL_MANIFEST, full)
                print(f"  Full manifest patched: {FULL_MANIFEST}")
            except Exception as e:
                print(f"  WARN: could not patch full manifest: {e}")

    print(f"{'='*60}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
