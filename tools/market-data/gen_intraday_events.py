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

# chart -> engine module + futures history file + output event file
TARGETS = [
    {"engine": "dax_2h_engine.py",    "hist": "FDAX1!_2h.json",  "out": "EUREX_FDAX1_2H_events.json", "sym": "FDAX1!", "tv": "EUREX:FDAX1!", "tf": "2H",  "name": "Trend Momentum DAX 2H"},
    {"engine": "dax_1h_engine.py",    "hist": "FDAX1!_1h.json",  "out": "EUREX_FDAX1_1H_events.json", "sym": "FDAX1!", "tv": "EUREX:FDAX1!", "tf": "1H",  "name": "Trend Momentum DAX 1H"},
    {"engine": "eurusd_30m_engine.py","hist": "6E1!_30m.json",   "out": "CME_6E1_30M_events.json",   "sym": "6E1!",   "tv": "CME:6E1!",    "tf": "30M", "name": "MT Euro 30M"},
    {"engine": "gbpusd_30m_engine.py","hist": "6B1!_30m.json",   "out": "CME_6B1_30M_events.json",   "sym": "6B1!",   "tv": "CME:6B1!",    "tf": "30M", "name": "MT GBP 30M"},
]


def load_engine(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for t in TARGETS:
        hist_file = HISTORY / t["hist"]
        eng_file = ENGINES / t["engine"]
        if not hist_file.exists():
            print(f"  SKIP {t['out']}: no futures bars ({hist_file.name})"); continue
        if not eng_file.exists():
            print(f"  SKIP {t['out']}: no engine ({t['engine']})"); continue
        bars = json.loads(hist_file.read_text(encoding="utf-8")).get("bars", [])
        if not bars:
            print(f"  SKIP {t['out']}: empty bars"); continue
        try:
            mod = load_engine(eng_file)
            run_engine = getattr(mod, "run_engine", None)
            if run_engine is None:
                print(f"  SKIP {t['out']}: engine has no run_engine()"); continue
            trades = run_engine(bars)
        except Exception as e:
            print(f"  ERR  {t['out']}: {e}"); continue
        dates = [str(b.get("date", ""))[:19] for b in bars if b.get("date")]
        payload = {
            "symbol": t["sym"], "tvSymbol": t["tv"], "strategyName": t["name"],
            "timeframe": t["tf"], "source": "engine_futures", "hasStrategy": True,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dateRange": {"first": dates[0] if dates else "", "last": dates[-1] if dates else ""},
            "tradeCounts": {"total": len(trades)},
            "trades": trades,
        }
        (OUT_DIR / t["out"]).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        n_sl = sum(1 for tr in trades if tr.get("sl") is not None)
        n_tp = sum(1 for tr in trades if tr.get("tp") is not None)
        print(f"  OK   {t['out']}: {len(trades)} trades (sl={n_sl}, tp={n_tp}) [{payload['dateRange']['first']} -> {payload['dateRange']['last']}]")


if __name__ == "__main__":
    main()
