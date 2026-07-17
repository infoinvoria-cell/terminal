"""
Generate strategy events JSON files for Core Invest monitoring.

Strategies implemented:
  QQQ Pine 1  : White Swan NAS EMA  — SMA(400)/SMA(5), SL=25%, TP=2%
  QQQ Pine 2  : EMA + Valuation PRO — EMA(20)/EMA(50), SL=2%,  TP=4%
  Copper/HG   : EMA + Valuation PRO — EMA(20)/EMA(50), SL=2%,  TP=4%

Output:
  public/generated/monitoring/strategies/BATS_QQQ_pine1_events.json
  public/generated/monitoring/strategies/BATS_QQQ_pine2_events.json
  public/generated/monitoring/strategies/COMEX_HG1_events.json
"""

import csv
import json
import math
import os
import sys
from pathlib import Path
from typing import Optional

# ─── paths ────────────────────────────────────────────────────────────────────
# Source folder is machine-local; override with CORE_INVEST_FOLDER.
_INVEST_ENV = (os.environ.get("CORE_INVEST_FOLDER") or "").strip()
INVEST_FOLDER = Path(_INVEST_ENV) if _INVEST_ENV else (Path.home() / "Desktop" / "Invest Portfolio")
STRATEGIES_DIR = Path(__file__).parent.parent.parent / "public" / "generated" / "monitoring" / "strategies"

SYMBOL_FILES = {
    "QQQ":  ["QQQ.csv", "QQQ(1).csv"],
    "HG1!": ["COMEX_DL_HG1!, 1D_9fc12.csv"],
}


# ─── csv loader ───────────────────────────────────────────────────────────────
def load_ohlc(symbol: str) -> list[dict]:
    candidates = SYMBOL_FILES.get(symbol, [])
    for fname in candidates:
        path = INVEST_FOLDER / fname
        if path.exists():
            rows = []
            with open(path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    date_key = next((k for k in row if k.lower() in ("time", "date")), None)
                    if date_key is None:
                        continue
                    try:
                        rows.append({
                            "date":  str(row[date_key]).strip()[:10],
                            "open":  float(row.get("open", row.get("Open", 0))),
                            "high":  float(row.get("high", row.get("High", 0))),
                            "low":   float(row.get("low",  row.get("Low",  0))),
                            "close": float(row.get("close", row.get("Close", 0))),
                        })
                    except (ValueError, KeyError):
                        continue
            rows.sort(key=lambda r: r["date"])
            print(f"  [{symbol}] loaded {len(rows)} bars from {path.name}")
            return rows
    print(f"  [{symbol}] WARNING: no file found", file=sys.stderr)
    return []


# ─── indicators ───────────────────────────────────────────────────────────────
def sma(closes: list[float], n: int) -> list[Optional[float]]:
    result: list[Optional[float]] = [None] * len(closes)
    for i in range(n - 1, len(closes)):
        result[i] = sum(closes[i - n + 1 : i + 1]) / n
    return result


def ema(closes: list[float], n: int) -> list[Optional[float]]:
    result: list[Optional[float]] = [None] * len(closes)
    k = 2.0 / (n + 1)
    # Seed with SMA of first n bars
    if len(closes) < n:
        return result
    seed = sum(closes[:n]) / n
    result[n - 1] = seed
    for i in range(n, len(closes)):
        result[i] = closes[i] * k + result[i - 1] * (1 - k)
    return result


# ─── strategy: Pine 1 (SMA400/5) ──────────────────────────────────────────────
def run_pine1(bars: list[dict]) -> list[dict]:
    """
    White Swan NAS EMA — SMA(400) trend filter + SMA(5) dip entry.

    Entry : close > SMA400 AND close < SMA5  (price dips below 5-day SMA
            while still above 400-day bull-trend filter)
    Exit  : close > SMA5  OR  price <= SL  OR  price >= TP
    SL    : entry * 0.75  (−25%)
    TP    : entry * 1.02  (+2%)
    """
    SL_PCT = 0.25   # 25% safety stop
    TP_PCT = 0.02   # 2% safety take-profit

    closes = [b["close"] for b in bars]
    ma400 = sma(closes, 400)
    ma5   = sma(closes, 5)

    trades = []
    in_trade = False
    entry_price = 0.0
    entry_date  = ""
    sl = 0.0
    tp = 0.0

    for i, bar in enumerate(bars):
        m400 = ma400[i]
        m5   = ma5[i]
        c    = bar["close"]
        date = bar["date"]

        if m400 is None or m5 is None:
            continue

        if not in_trade:
            # Entry: dip below SMA5 but above SMA400 (no SMA5 previously required)
            if c > m400 and c < m5:
                in_trade   = True
                entry_price = c
                entry_date  = date
                sl = entry_price * (1 - SL_PCT)
                tp = entry_price * (1 + TP_PCT)
        else:
            exit_reason = None
            exit_price  = None

            if c <= sl:
                exit_reason = "stop_loss"
                exit_price  = sl
            elif c >= tp:
                exit_reason = "take_profit"
                exit_price  = tp
            elif c > m5:
                exit_reason = "signal_exit"
                exit_price  = c

            if exit_reason:
                trades.append({
                    "direction": "long",
                    "entryTime": entry_date,
                    "exitTime":  date,
                    "entry":     round(entry_price, 4),
                    "sl":        round(sl, 4),
                    "tp":        round(tp, 4),
                    "exit":      round(exit_price, 4),
                    "exitReason": exit_reason,
                })
                in_trade = False

    # Open trade at end
    if in_trade:
        trades.append({
            "direction": "long",
            "entryTime": entry_date,
            "exitTime":  None,
            "entry":     round(entry_price, 4),
            "sl":        round(sl, 4),
            "tp":        round(tp, 4),
            "exit":      None,
            "exitReason": None,
        })

    return trades


# ─── strategy: Pine 2 / Copper (EMA20/50) ─────────────────────────────────────
def run_ema2050(bars: list[dict], sl_pct: float = 0.02, tp_pct: float = 0.04) -> list[dict]:
    """
    EMA + Valuation Strategy PRO (simplified: EMA filter only, no valuation).

    Entry : EMA(20) > EMA(50) AND close > EMA(20)
    Exit  : price <= SL  OR  price >= TP
            OR  (EMA(20) < EMA(50) AND close < EMA(20))  [opposite signal]
    SL    : entry * (1 - sl_pct)   default −2%
    TP    : entry * (1 + tp_pct)   default +4%
    """
    closes = [b["close"] for b in bars]
    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)

    trades = []
    in_trade = False
    entry_price = 0.0
    entry_date  = ""
    sl = 0.0
    tp = 0.0

    for i, bar in enumerate(bars):
        e20 = ema20[i]
        e50 = ema50[i]
        c   = bar["close"]
        date = bar["date"]

        if e20 is None or e50 is None:
            continue

        if not in_trade:
            if e20 > e50 and c > e20:
                in_trade    = True
                entry_price = c
                entry_date  = date
                sl = entry_price * (1 - sl_pct)
                tp = entry_price * (1 + tp_pct)
        else:
            exit_reason = None
            exit_price  = None

            if c <= sl:
                exit_reason = "stop_loss"
                exit_price  = sl
            elif c >= tp:
                exit_reason = "take_profit"
                exit_price  = tp
            elif e20 < e50 and c < e20:
                exit_reason = "opposite_signal"
                exit_price  = c

            if exit_reason:
                trades.append({
                    "direction": "long",
                    "entryTime": entry_date,
                    "exitTime":  date,
                    "entry":     round(entry_price, 4),
                    "sl":        round(sl, 4),
                    "tp":        round(tp, 4),
                    "exit":      round(exit_price, 4),
                    "exitReason": exit_reason,
                })
                in_trade = False

    if in_trade:
        trades.append({
            "direction": "long",
            "entryTime": entry_date,
            "exitTime":  None,
            "entry":     round(entry_price, 4),
            "sl":        round(sl, 4),
            "tp":        round(tp, 4),
            "exit":      None,
            "exitReason": None,
        })

    return trades


# ─── output writer ─────────────────────────────────────────────────────────────
def write_events(out_path: Path, symbol: str, tv_symbol: str, strategy_name: str,
                 bars: list[dict], trades: list[dict]) -> None:
    open_trade = next((t for t in trades if t["exitTime"] is None), None)
    closed_trades = [t for t in trades if t["exitTime"] is not None]

    payload = {
        "symbol":         symbol,
        "tvSymbol":       tv_symbol,
        "sourceResolved": "generate-core-invest-events.py",
        "strategyName":   strategy_name,
        "hasStrategy":    True,
        "status":         "ok",
        "warnings":       ["Python approximation. Valuation/regime filters not applied. Validate against TradingView."],
        "trades":         trades,
        "openTrade":      open_trade,
        "openTradeRow":   open_trade,
        "barCount":       len(bars),
        "firstDate":      bars[0]["date"] if bars else None,
        "lastDate":       bars[-1]["date"] if bars else None,
        "tradeCount":     len(closed_trades),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    wins = sum(1 for t in closed_trades if (t.get("exit") or 0) > t["entry"])
    print(f"  -> {out_path.name}: {len(closed_trades)} closed trades, {wins} wins, open={open_trade is not None}")


# ─── main ─────────────────────────────────────────────────────────────────────
def main():
    print("Core Invest - generating strategy events ...\n")

    # 1. QQQ Pine 1 — SMA400/5
    print("QQQ Pine 1 (SMA400/5):")
    qqq_bars = load_ohlc("QQQ")
    if qqq_bars:
        pine1_trades = run_pine1(qqq_bars)
        write_events(
            STRATEGIES_DIR / "BATS_QQQ_pine1_events.json",
            symbol="QQQ",
            tv_symbol="BATS:QQQ",
            strategy_name="White Swan NAS EMA (SMA400/5, SL=-25%, TP=+2%)",
            bars=qqq_bars,
            trades=pine1_trades,
        )
    print()

    # 2. QQQ Pine 2 EMA — EMA20/50
    print("QQQ Pine 2 EMA (EMA20/50):")
    if qqq_bars:
        pine2_trades = run_ema2050(qqq_bars, sl_pct=0.02, tp_pct=0.04)
        write_events(
            STRATEGIES_DIR / "BATS_QQQ_pine2_events.json",
            symbol="QQQ",
            tv_symbol="BATS:QQQ",
            strategy_name="EMA+Valuation PRO (EMA20/50, SL=-2%, TP=+4%)",
            bars=qqq_bars,
            trades=pine2_trades,
        )
    print()

    # 3. Copper/HG — EMA20/50
    print("Copper/HG (EMA20/50):")
    hg_bars = load_ohlc("HG1!")
    if hg_bars:
        hg_trades = run_ema2050(hg_bars, sl_pct=0.02, tp_pct=0.04)
        write_events(
            STRATEGIES_DIR / "COMEX_HG1_events.json",
            symbol="HG1!",
            tv_symbol="COMEX:HG1!",
            strategy_name="EMA+Valuation PRO (EMA20/50, SL=-2%, TP=+4%)",
            bars=hg_bars,
            trades=hg_trades,
        )
    print()
    print("Done.")


if __name__ == "__main__":
    main()
