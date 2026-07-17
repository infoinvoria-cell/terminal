#!/usr/bin/env python3
"""
validate_core_invest_pine.py
Validates QQQ Pine 1 and Pine 2 (EMA/Valuation) logic in Python.
Applies to: QQQ (Pine1+Pine2), HG1! (Pine2), 6S1! (Pine2).
Outputs JSON + Markdown report to Capitalife Brain / 14_Data_Room.
"""

import os
import sys
import json
import math
from datetime import datetime, date
from pathlib import Path


def _env_path(name):
    raw = (os.environ.get(name) or "").strip()
    return Path(raw) if raw else None


def _brain_root() -> Path:
    """CAPITALIFE_BRAIN_PATH -> sibling folder next to the repo -> exit."""
    from_env = _env_path("CAPITALIFE_BRAIN_PATH")
    if from_env:
        return from_env
    sibling = Path(__file__).resolve().parents[2] / "Capitalife Brain"
    if sibling.is_dir():
        return sibling
    sys.exit(
        "validate_core_invest_pine: Brain path not found. "
        'Set CAPITALIFE_BRAIN_PATH, or place the vault next to the repo as "../Capitalife Brain".'
    )


INVEST_FOLDER = _env_path("CORE_INVEST_FOLDER") or (Path.home() / "Desktop" / "Invest Portfolio")
BRAIN_DATAROOM = _brain_root() / "14_Data_Room"

OUT_JSON = BRAIN_DATAROOM / "Core Invest Pine Validation Results.json"
OUT_MD   = BRAIN_DATAROOM / "Core Invest Pine Validation Results.md"

# ─── CSV loader ────────────────────────────────────────────────────────────────

def load_ohlc_csv(path: Path) -> list[dict]:
    """Parse TradingView-style OHLC CSV. Returns list of {date, open, high, low, close, volume}."""
    import csv
    bars = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_raw = row.get("time") or row.get("date") or row.get("Date") or row.get("Time") or ""
            date_str = date_raw.strip()[:10]
            try:
                c = float(row.get("close") or row.get("Close") or "")
                o = float(row.get("open") or row.get("Open") or c)
                h = float(row.get("high") or row.get("High") or c)
                lo = float(row.get("low") or row.get("Low") or c)
            except (ValueError, TypeError):
                continue
            if not date_str:
                continue
            bars.append({"date": date_str, "open": o, "high": h, "low": lo, "close": c})
    bars.sort(key=lambda b: b["date"])
    return bars


def find_ohlc(symbol: str) -> tuple[Path | None, list[dict]]:
    candidates = {
        "QQQ": ["QQQ.csv", "QQQ(1).csv", "QQQ(2).csv"],
        "SPY": ["SPY.csv"],
        "SPMO": ["SPMO.csv"],
        "GLD": ["GLD.csv", "GLD(1).csv"],
        "HG1!": ["COMEX_DL_HG1!, 1D_9fc12.csv", "COMEX_DL_HG1!, 1D_9fc12(1).csv", "COMEX_DL_HG1!, 1D_9fc12(2).csv"],
        "6S1!": ["CME_DL_6S1!, 1D_b8f81.csv", "CME_DL_6S1!, 1D_b8f81(1).csv", "CME_DL_6S1!, 1D_b8f81(2).csv"],
    }
    for fname in candidates.get(symbol, []):
        p = INVEST_FOLDER / fname
        if p.exists():
            return p, load_ohlc_csv(p)
    # fallback scan
    sym_lower = symbol.lower().replace("!", "")
    for p in INVEST_FOLDER.glob("*.csv"):
        if sym_lower in p.name.lower():
            return p, load_ohlc_csv(p)
    return None, []


# ─── Indicators ───────────────────────────────────────────────────────────────

def sma(closes: list[float], period: int) -> list[float | None]:
    result = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        result[i] = sum(closes[i - period + 1: i + 1]) / period
    return result


def ema(closes: list[float], period: int) -> list[float | None]:
    k = 2 / (period + 1)
    result: list[float | None] = [None] * len(closes)
    em = None
    for i, c in enumerate(closes):
        if em is None:
            if i >= period - 1:
                em = sum(closes[i - period + 1: i + 1]) / period
                result[i] = em
        else:
            em = c * k + em * (1 - k)
            result[i] = em
    return result


# ─── Trade simulation ─────────────────────────────────────────────────────────

class Trade:
    def __init__(self, entry_date, entry_price):
        self.entry_date = entry_date
        self.entry_price = entry_price
        self.exit_date = None
        self.exit_price = None
        self.return_pct = None

    def close(self, exit_date, exit_price):
        self.exit_date = exit_date
        self.exit_price = exit_price
        if self.entry_price and self.entry_price > 0:
            self.return_pct = (exit_price / self.entry_price - 1) * 100

    def to_dict(self):
        return {
            "entry_date": self.entry_date,
            "entry_price": round(self.entry_price, 4),
            "exit_date": self.exit_date,
            "exit_price": round(self.exit_price, 4) if self.exit_price else None,
            "return_pct": round(self.return_pct, 3) if self.return_pct is not None else None,
        }


def equity_curve(trades: list[Trade], start: float = 10000.0) -> list[dict]:
    eq = start
    points = []
    for t in trades:
        if t.return_pct is not None:
            eq *= 1 + t.return_pct / 100
        points.append({"date": t.exit_date, "equity": round(eq, 2)})
    return points


def compute_metrics(trades: list[Trade], bars: list[dict]) -> dict:
    if not trades:
        return {"trade_count": 0, "win_rate": None, "profit_factor": None, "max_dd": None, "total_return_pct": None}

    returns = [t.return_pct for t in trades if t.return_pct is not None]
    if not returns:
        return {"trade_count": len(trades), "win_rate": None, "profit_factor": None, "max_dd": None, "total_return_pct": None}

    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r <= 0]
    win_rate = len(wins) / len(returns) * 100 if returns else None
    gross_profit = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else None

    eq = 10000.0
    peak = eq
    max_dd = 0.0
    for r in returns:
        eq *= 1 + r / 100
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd:
            max_dd = dd

    total_return = (eq / 10000 - 1) * 100

    return {
        "trade_count": len(returns),
        "win_rate": round(win_rate, 2) if win_rate is not None else None,
        "profit_factor": round(profit_factor, 3) if profit_factor is not None else None,
        "max_dd_pct": round(max_dd, 2),
        "total_return_pct": round(total_return, 2),
        "avg_win_pct": round(sum(wins) / len(wins), 3) if wins else None,
        "avg_loss_pct": round(sum(losses) / len(losses), 3) if losses else None,
    }


# ─── Pine 1 validation ────────────────────────────────────────────────────────

def validate_pine1_on_qqq(bars: list[dict]) -> dict:
    """
    White Swan - Capitalife | NAS EMA
    Logic (default params):
      MA1 = SMA(close, 400)
      MA2 = SMA(close, 5)
      BUY  when close > MA1 AND close < MA2 AND not in position
      SELL when close > MA2 AND in position
    """
    MA1_PERIOD = 400
    MA2_PERIOD = 5

    if len(bars) < MA1_PERIOD + 10:
        return {
            "status": "missing_data",
            "reason": f"Need >= {MA1_PERIOD + 10} bars, have {len(bars)}",
            "trades": [], "metrics": {},
        }

    closes = [b["close"] for b in bars]
    ma1 = sma(closes, MA1_PERIOD)
    ma2 = sma(closes, MA2_PERIOD)

    trades: list[Trade] = []
    current: Trade | None = None
    in_long = False

    for i in range(1, len(bars)):
        bar = bars[i]
        m1 = ma1[i]
        m2 = ma2[i]
        if m1 is None or m2 is None:
            continue

        c = bar["close"]

        if not in_long and c > m1 and c < m2:
            current = Trade(bar["date"], c)
            in_long = True
        elif in_long and current and c > m2:
            current.close(bar["date"], c)
            trades.append(current)
            current = None
            in_long = False

    # close open position at last bar
    if in_long and current and bars:
        current.close(bars[-1]["date"], bars[-1]["close"])
        trades.append(current)

    metrics = compute_metrics(trades, bars)
    eq = equity_curve(trades)

    return {
        "status": "partial_validation",
        "reason": "Python SMA-only approximation. Regime filter and exact TP/SL not applied. Validate against TradingView export.",
        "instrument": "QQQ",
        "pine_file": "QQQ_pine1.txt",
        "bars_used": len(bars),
        "first_date": bars[0]["date"],
        "last_date": bars[-1]["date"],
        "params": {"MA1": MA1_PERIOD, "MA2": MA2_PERIOD},
        "trades": [t.to_dict() for t in trades[-50:]],
        "total_trades": len(trades),
        "metrics": metrics,
        "equity_last": eq[-1]["equity"] if eq else None,
    }


# ─── Pine 2 validation ────────────────────────────────────────────────────────

def validate_pine2_on_instrument(symbol: str, bars: list[dict]) -> dict:
    """
    EMA + Valuation Strategy PRO MTF + Regime
    Default logic:
      EMA Fast = EMA(close, 20)
      EMA Slow = EMA(close, 50)
      LONG when emaFast > emaSlow (EMA crossover)
      EXIT when emaFast < emaSlow
    Valuation and regime filter not replicated without DXY/GC1!/ZB1! data.
    """
    EMA_FAST = 20
    EMA_SLOW = 50

    if len(bars) < EMA_SLOW + 10:
        return {
            "status": "missing_data",
            "reason": f"Need >= {EMA_SLOW + 10} bars, have {len(bars)}",
            "trades": [], "metrics": {},
        }

    closes = [b["close"] for b in bars]
    ef = ema(closes, EMA_FAST)
    es = ema(closes, EMA_SLOW)

    trades: list[Trade] = []
    current: Trade | None = None
    in_long = False

    for i in range(1, len(bars)):
        bar = bars[i]
        f = ef[i]
        s = es[i]
        if f is None or s is None:
            continue
        c = bar["close"]
        if not in_long and f > s:
            current = Trade(bar["date"], c)
            in_long = True
        elif in_long and current and f < s:
            current.close(bar["date"], c)
            trades.append(current)
            current = None
            in_long = False

    if in_long and current and bars:
        current.close(bars[-1]["date"], bars[-1]["close"])
        trades.append(current)

    metrics = compute_metrics(trades, bars)
    eq = equity_curve(trades)

    return {
        "status": "partial_validation",
        "reason": "EMA-crossover approximation only. Valuation/Regime filter requires DXY/GC1!/ZB1! data. Validate against TradingView export.",
        "instrument": symbol,
        "pine_file": "pine2.txt",
        "bars_used": len(bars),
        "first_date": bars[0]["date"],
        "last_date": bars[-1]["date"],
        "params": {"ema_fast": EMA_FAST, "ema_slow": EMA_SLOW},
        "trades": [t.to_dict() for t in trades[-50:]],
        "total_trades": len(trades),
        "metrics": metrics,
        "equity_last": eq[-1]["equity"] if eq else None,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Core Invest Pine Validation")
    print("=" * 50)

    BRAIN_DATAROOM.mkdir(parents=True, exist_ok=True)

    results = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "portfolio": "Core Invest",
        "data_folder": str(INVEST_FOLDER),
        "warning": "QQQ Pine muss auf QQQ validiert werden - NAS100/OANDA ist nur Proxy/Research",
        "sleeves": {},
    }

    # ── QQQ Pine 1 ──
    print("\n[1/4] QQQ Pine 1 on QQQ …")
    qqq_path, qqq_bars = find_ohlc("QQQ")
    if not qqq_bars:
        r1 = {"status": "missing_data", "reason": "QQQ OHLC not found", "trades": [], "metrics": {}}
    else:
        print(f"  QQQ: {len(qqq_bars)} bars ({qqq_bars[0]['date']} -> {qqq_bars[-1]['date']})")
        r1 = validate_pine1_on_qqq(qqq_bars)
    results["sleeves"]["QQQ_PINE_1"] = r1
    print(f"  Status: {r1['status']} | Trades: {r1.get('total_trades', 0)} | {r1.get('reason', '')[:60]}")

    # ── QQQ Pine 2 EMA ──
    print("\n[2/4] QQQ Pine 2 EMA on QQQ …")
    r2 = validate_pine2_on_instrument("QQQ", qqq_bars)
    results["sleeves"]["QQQ_PINE_2_EMA"] = r2
    print(f"  Status: {r2['status']} | Trades: {r2.get('total_trades', 0)}")

    # ── Copper/HG ──
    print("\n[3/4] Pine 2 on HG1! (Copper) …")
    hg_path, hg_bars = find_ohlc("HG1!")
    if not hg_bars:
        r3 = {"status": "missing_data", "reason": "HG1! OHLC not found", "trades": [], "metrics": {}}
    else:
        print(f"  HG1!: {len(hg_bars)} bars ({hg_bars[0]['date']} -> {hg_bars[-1]['date']})")
        r3 = validate_pine2_on_instrument("HG1!", hg_bars)
    results["sleeves"]["COPPER_HG"] = r3
    print(f"  Status: {r3['status']} | Trades: {r3.get('total_trades', 0)}")

    # ── CHF/6S ──
    print("\n[4/4] Pine 2 on 6S1! (CHF) …")
    s6_path, s6_bars = find_ohlc("6S1!")
    if not s6_bars:
        r4 = {"status": "missing_data", "reason": "6S1! OHLC not found", "trades": [], "metrics": {}}
    else:
        print(f"  6S1!: {len(s6_bars)} bars ({s6_bars[0]['date']} -> {s6_bars[-1]['date']})")
        r4 = validate_pine2_on_instrument("6S1!", s6_bars)
    results["sleeves"]["CHF_6S"] = r4
    print(f"  Status: {r4['status']} | Trades: {r4.get('total_trades', 0)}")

    # ── Write JSON ──
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nJSON -> {OUT_JSON}")

    # ── Write Markdown ──
    md = build_markdown(results)
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"MD   -> {OUT_MD}")

    print("\nDone.")


def build_markdown(results: dict) -> str:
    now = results["generated_at"][:10]
    lines = [
        "# Core Invest Pine Validation Results",
        "",
        f"**Generated:** {now}",
        f"**Portfolio:** {results['portfolio']}",
        f"**Data Folder:** `{results['data_folder']}`",
        "",
        f"> ⚠ {results['warning']}",
        "",
        "## Validation Summary",
        "",
        "| Sleeve | Instrument | Status | Trades | Win Rate | Profit Factor | Max DD | Total Return |",
        "|--------|------------|--------|--------|----------|---------------|--------|-------------|",
    ]

    for sleeve_id, r in results["sleeves"].items():
        m = r.get("metrics", {})
        wr = f"{m.get('win_rate'):.1f}%" if m.get('win_rate') is not None else "n/a"
        pf = f"{m.get('profit_factor'):.3f}" if m.get('profit_factor') is not None else "n/a"
        dd = f"{m.get('max_dd_pct'):.2f}%" if m.get('max_dd_pct') is not None else "n/a"
        tr = f"{m.get('total_return_pct'):.2f}%" if m.get('total_return_pct') is not None else "n/a"
        lines.append(
            f"| {sleeve_id} | {r.get('instrument', '-')} | {r.get('status', '-')} | "
            f"{r.get('total_trades', 0)} | {wr} | {pf} | {dd} | {tr} |"
        )

    lines += [
        "",
        "## Status Explanations",
        "",
        "- `partial_validation` – Python approximation. Must be validated against TradingView export.",
        "- `missing_data` – Required OHLC file not found in Invest Folder.",
        "- `proxy_only` – Using NAS100 as proxy (not final QQQ validation).",
        "",
        "## Pine 1 (QQQ Pine 1)",
        "",
        f"Pine file: `QQQ_pine1.txt`",
        f"Logic: SMA(400) + SMA(5) crossover. Long-only. Long when close > SMA400 AND close < SMA5.",
        f"Regime filter: requires VIX/SPX/DXY/US10Y – not applied in this validation.",
        "",
        "## Pine 2 (QQQ Pine 2 EMA / HG / CHF)",
        "",
        f"Pine file: `pine2.txt`",
        f"Logic: EMA(20) / EMA(50) crossover. Long when EMA Fast > EMA Slow.",
        f"Valuation & Regime: requires DXY/GC1!/ZB1! – not applied. Status = partial_validation.",
        "",
        "## Missing Data for Full Validation",
        "",
        "- SPMO OHLC (if not in folder)",
        "- DXY OHLC (for pine2 comparison)",
        "- GC1! OHLC (for pine2 comparison)",
        "- ZB1! OHLC (for pine2 comparison)",
        "- VIX / SPX / US10Y (for pine1 regime filter)",
        "- TradingView trade export for QQQ Pine 1 on QQQ (not NAS100)",
        "- TradingView trade export for Pine 2 on QQQ / HG / CHF",
        "",
        "## Disclaimer",
        "",
        "Historische Ergebnisse sind kein Renditeversprechen.",
        "Core Invest ist ein Research-/Pre-Fund-Level-System ohne regulatorische Zulassung.",
        "Keine Live-Execution. Keine Finanzportfolioverwaltung durch Capitalife GbR.",
    ]

    return "\n".join(lines)


if __name__ == "__main__":
    main()
