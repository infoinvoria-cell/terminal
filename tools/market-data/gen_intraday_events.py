"""
gen_intraday_events.py
Run the local intraday strategy engines on the REAL futures bars and emit
chart-format event files (Entry/SL/TP) the Monitoring charts read.

Maps each Intraday MT chart to its engine + futures candle cache, calls the
engine's run_engine(bars), and writes:
  public/generated/monitoring/strategies/<EXCHANGE>_<SYM>_<TF>_events.json

Run:  tools/market-data/.venv/Scripts/python.exe tools/market-data/gen_intraday_events.py
"""
from __future__ import annotations
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINES = (REPO.parent / "Invoria Dashboard" / "workspace" / "tools" / "strategy_import" / "engines").resolve()
# Let the engine modules import their siblings (e.g. fx_30m_engine_common).
if str(ENGINES) not in sys.path:
    sys.path.insert(0, str(ENGINES))
HISTORY = REPO / ".capitalife-cache" / "market-data" / "tradingview" / "history"
OUT_DIR = REPO / "public" / "generated" / "monitoring" / "strategies"
# Committed, bundled copy so the events also reach Vercel (public/generated is
# gitignored). Served by /api/monitoring/strategy-events.
BUNDLE_DIR = REPO / "src" / "data" / "capitalife" / "monitoring-events"

# chart -> engine module + futures history file + output event file
# kind "dax": module.run_engine(bars)   |   kind "fx": fx_common.run_engine(bars, module.CFG)
TARGETS = [
    {"kind": "dax", "engine": "dax_2h_engine.py",    "hist": "FDAX1!_2h.json",  "out": "EUREX_FDAX1_2H_events.json", "sym": "FDAX1!", "tv": "EUREX:FDAX1!", "tf": "2H",  "name": "Trend Momentum DAX 2H"},
    {"kind": "dax", "engine": "dax_1h_engine.py",    "hist": "FDAX1!_1h.json",  "out": "EUREX_FDAX1_1H_events.json", "sym": "FDAX1!", "tv": "EUREX:FDAX1!", "tf": "1H",  "name": "Trend Momentum DAX 1H"},
    {"kind": "fx",  "engine": "eurusd_30m_engine.py","hist": "6E1!_30m.json",   "out": "CME_6E1_30M_events.json",   "sym": "6E1!",   "tv": "CME:6E1!",    "tf": "30M", "name": "MT Euro 30M"},
    {"kind": "fx",  "engine": "gbpusd_30m_engine.py","hist": "6B1!_30m.json",   "out": "CME_6B1_30M_events.json",   "sym": "6B1!",   "tv": "CME:6B1!",    "tf": "30M", "name": "MT GBP 30M"},
]


def timeframe_minutes(tf: str) -> int | None:
    value = tf.strip().upper()
    if value.endswith("M"):
        return int(value[:-1])
    if value.endswith("H"):
        return int(value[:-1]) * 60
    return None


def current_local_period_start(minutes: int) -> datetime:
    now = datetime.now().replace(second=0, microsecond=0)
    total_minutes = now.hour * 60 + now.minute
    bucket = (total_minutes // minutes) * minutes
    return now.replace(hour=bucket // 60, minute=bucket % 60)


def parse_bar_time(bar: dict) -> datetime | None:
    raw = str(bar.get("date") or bar.get("time") or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "").replace(" ", "T")[:19])
    except ValueError:
        return None


def exclude_forming_intraday_bar(bars: list[dict], tf: str) -> tuple[list[dict], int]:
    minutes = timeframe_minutes(tf)
    if not minutes or not bars:
        return bars, 0
    latest_dt = parse_bar_time(bars[-1])
    if latest_dt is None:
        return bars, 0
    # The tvDatafeed timestamps are chart-local wall-clock stamps in this cache.
    # Comparing as naive local time avoids treating "11:00" as UTC and prevents
    # the strategy from using the still-forming current candle.
    if latest_dt >= current_local_period_start(minutes):
        return bars[:-1], 1
    return bars, 0


def bar_iso(bar: dict) -> str:
    raw = str(bar.get("time") or bar.get("date") or "").strip()[:19]
    return f"{raw}Z" if raw and not raw.endswith("Z") else raw


def normalize_iso_z(value):
    if isinstance(value, str):
        while "ZZ" in value:
            value = value.replace("ZZ", "Z")
        return value
    if isinstance(value, list):
        return [normalize_iso_z(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_iso_z(item) for key, item in value.items()}
    return value


def mark_end_of_data_position_open(trades: list[dict], bars: list[dict]) -> tuple[list[dict], dict | None]:
    if not trades or not bars:
        return trades, None
    last_trade = dict(trades[-1])
    last_bar_time = bar_iso(bars[-1])
    if last_trade.get("exitReason") != "signal_exit" or last_trade.get("exitTime") != last_bar_time:
        return trades, None
    open_trade = dict(last_trade)
    open_trade["exitTime"] = None
    open_trade["exit"] = None
    open_trade["exitReason"] = None
    open_trade["pnl"] = None
    open_trade["isOpen"] = True
    next_trades = [*trades[:-1], open_trade]
    return next_trades, open_trade


def load_engine(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    for t in TARGETS:
        hist_file = HISTORY / t["hist"]
        eng_file = ENGINES / t["engine"]
        if not hist_file.exists():
            print(f"  SKIP {t['out']}: no futures bars ({hist_file.name})"); continue
        if not eng_file.exists():
            print(f"  SKIP {t['out']}: no engine ({t['engine']})"); continue
        raw_bars = json.loads(hist_file.read_text(encoding="utf-8")).get("bars", [])
        bars, excluded_forming_bars = exclude_forming_intraday_bar(raw_bars, t["tf"])
        if not bars:
            print(f"  SKIP {t['out']}: empty bars"); continue
        # Engines' _parse_bar_dt reads bar["time"] for the intraday hour and only
        # falls back to bar["date"][:10] (day → hour 0), which the session filter
        # would then reject. Our futures bars carry the full ISO in "date" only, so
        # mirror it into "time" to preserve the intraday hour.
        for b in bars:
            if not b.get("time") and b.get("date"):
                b["time"] = b["date"]
        try:
            mod = load_engine(eng_file)
            if t["kind"] == "fx":
                import fx_30m_engine_common as fxc  # noqa: WPS433 (ENGINES on sys.path)
                cfg = getattr(mod, "CFG", None)
                if cfg is None:
                    print(f"  SKIP {t['out']}: fx engine has no CFG"); continue
                trades = fxc.run_engine(bars, cfg)
            else:
                run_engine = getattr(mod, "run_engine", None)
                if run_engine is None:
                    print(f"  SKIP {t['out']}: engine has no run_engine()"); continue
                trades = run_engine(bars)
        except Exception as e:
            print(f"  ERR  {t['out']}: {e}"); continue
        trades = normalize_iso_z(trades)
        trades, open_trade = mark_end_of_data_position_open(trades, bars)
        dates = [str(b.get("date", ""))[:19] for b in bars if b.get("date")]
        payload = {
            "symbol": t["sym"], "tvSymbol": t["tv"], "strategyName": t["name"],
            "timeframe": t["tf"], "source": "engine_futures", "hasStrategy": True,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dateRange": {"first": dates[0] if dates else "", "last": dates[-1] if dates else ""},
            "barPolicy": {"excludeFormingIntradayBar": True, "excludedBars": excluded_forming_bars},
            "openTrade": open_trade is not None,
            "openTradeRow": open_trade,
            "openCount": 1 if open_trade is not None else 0,
            "tradeCounts": {"total": len(trades)},
            "trades": trades,
        }
        blob = json.dumps(payload, indent=2)
        (OUT_DIR / t["out"]).write_text(blob, encoding="utf-8")
        (BUNDLE_DIR / t["out"]).write_text(blob, encoding="utf-8")
        n_sl = sum(1 for tr in trades if tr.get("sl") is not None)
        n_tp = sum(1 for tr in trades if tr.get("tp") is not None)
        print(f"  OK   {t['out']}: {len(trades)} trades (sl={n_sl}, tp={n_tp}) [{payload['dateRange']['first']} -> {payload['dateRange']['last']}]")


if __name__ == "__main__":
    main()
