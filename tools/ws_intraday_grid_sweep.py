"""
White Swan v1.1 — Intraday Grid Sweep
======================================
Findet die optimale Intraday-Beimischung (5%–40%) zum bestehenden
White Swan v1.0 Portfolio (6 Strategien, eingefroren 2026-07-19).

Methodik:
- Intraday MT v3-F: EUR 30m (40%), DAX 1H (40%), GBP 30m (5%), DAX 2H (15%)
- WS v1.0 Strategien: aus analytics-generated.json (monatliche Kumul.-Kurven)
- OOS-Fenster: 2019-01 – 2026-07 (aligniert mit WS v1.0)
- Grid: intraday_w = 5% bis 40% (5%-Schritte), WS proportional skaliert
- Ziel: Calmar maximieren | Nebenbedingung: MaxDD ≤ 15%, Sharpe ≥ 1.0

Aufruf: python tools/ws_intraday_grid_sweep.py
"""
from __future__ import annotations

import datetime
import importlib.util
import json
import math
import sys
from dataclasses import replace
from pathlib import Path

sys.stdout = open(1, mode="w", encoding="utf-8", errors="replace", closefd=False)

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT  = Path(__file__).resolve().parent.parent
BRAIN = Path(r"C:\Users\joris\Documents\Capitalife Brain")
VALID = BRAIN / "16_Backtesting_Validation"
DATA  = {
    "EUR30m": BRAIN / "08_Data" / "ohlc_cache" / "30M" / "OANDA_EURUSD_30M.json",
    "GBP30m": BRAIN / "08_Data" / "ohlc_cache" / "30M" / "OANDA_GBPUSD_30M.json",
    "DAX1H":  BRAIN / "08_Data" / "ohlc_cache" / "1H"  / "OANDA_DE30EUR_1H.json",
    "DAX2H":  BRAIN / "08_Data" / "ohlc_cache" / "2H"  / "OANDA_DE30EUR_2H.json",
}
ANALYTICS_JSON = ROOT / "src" / "data" / "capitalife" / "analytics-generated.json"

# ── Constants ──────────────────────────────────────────────────────────────────
OOS_START   = "2019-01-01"
OOS_END     = "2026-07-31"
TOTAL_RISK  = 0.01   # 1% per trade compounded
IB_R = {
    "EUR30m": 1.0 / 13.0,
    "GBP30m": 2.0 / 10.0,
    "DAX1H":  1.5 / 40.0,
    "DAX2H":  1.5 / 50.0,
}
# v3-F internal weights (sum = 1.0)
V3F_W = {"EUR30m": 0.40, "DAX1H": 0.40, "GBP30m": 0.05, "DAX2H": 0.15}

# WS v1.0 frozen weights (sum ≈ 1.0)
WS_WEIGHTS = {
    "GC1 Friday Long":    19.8 / 100,
    "GLD Thursday Long":  19.8 / 100,
    "YM1 TAT":            19.8 / 100,
    "UKX Valuation":      19.8 / 100,
    "CT1 Macro A":        10.8 / 100,
    "NQ1 Trend LO":       10.0 / 100,
}

# ── Load FX engine ─────────────────────────────────────────────────────────────
def _load_fx_engine():
    spec = importlib.util.spec_from_file_location(
        "_wf", VALID / "fx_backtest" / "run_fx_30m_wf.py"
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_wf"] = mod
    spec.loader.exec_module(mod)
    sys.stdout = open(1, mode="w", encoding="utf-8", errors="replace", closefd=False)
    return mod


# ── Generic helpers ────────────────────────────────────────────────────────────
def _load_bars(path: Path) -> list[dict]:
    raw  = json.loads(path.read_text(encoding="utf-8"))
    bars = raw.get("bars", raw) if isinstance(raw, dict) else raw
    bars.sort(key=lambda b: str(b.get("date", "") or b.get("time", "")))
    return bars


def _slice(bars: list[dict], s: str, e: str) -> list[dict]:
    return [b for b in bars if s <= str(b.get("date","") or b.get("time",""))[:10] <= e]


def _ema(vals: list[float], p: int) -> list:
    out: list = [None] * len(vals)
    if p <= 0 or len(vals) < p:
        return out
    k = 2.0 / (p + 1)
    out[p - 1] = sum(vals[:p]) / p
    for i in range(p, len(vals)):
        out[i] = vals[i] * k + out[i - 1] * (1 - k)
    return out


def _sma(vals: list[float], p: int) -> list:
    out: list = [None] * len(vals)
    for i in range(p - 1, len(vals)):
        out[i] = sum(vals[i - p + 1 : i + 1]) / p
    return out


def _atr(highs: list, lows: list, closes: list, p: int) -> list:
    trs = []
    for i in range(len(closes)):
        pr = closes[i - 1] if i > 0 else closes[i]
        trs.append(max(highs[i] - lows[i], abs(highs[i] - pr), abs(lows[i] - pr)))
    return _sma(trs, p)


def _dk(bar: dict) -> str:
    return str(bar.get("date", "") or bar.get("time", ""))[:10]


def _dt(bar: dict):
    s = str(bar.get("date", "") or bar.get("time", "")).replace("T", " ").replace("Z", "").split("+")[0][:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except Exception:
            pass
    return None


# ── DAX 1H engine ─────────────────────────────────────────────────────────────
def _sweep_l(bars: list[dict], i: int) -> bool:
    for lb in range(3, 10):
        if i < lb:
            continue
        up   = bars[i - lb + 1]
        bear = bars[i - 1]
        base = bars[i - lb]
        cur  = bars[i]
        if up["open"] >= up["close"]: continue
        if base["open"] <= base["close"]: continue
        if bear["open"] <= bear["close"]: continue
        if bear["close"] >= up["open"]: continue
        if cur["close"] <= up["open"]: continue
        if (up["open"] - bear["close"]) <= 0.01: continue
        if all(bars[j]["close"] > base["close"] for j in range(i - lb + 2, i - 1)):
            return True
    return False


def run_dax1h(bars: list[dict]) -> list[dict]:
    SL_A = 40.0; TP_A = 100.0
    n   = len(bars)
    ema = _ema([b["close"] for b in bars], 2)
    trades: list[dict] = []; pos = None; td: dict[str, int] = {}
    for i in range(15, n):
        bar = bars[i]; dt = _dt(bar)
        if dt is None or dt.isoweekday() > 5 or ema[i] is None: continue
        dk = _dk(bar)
        if pos is not None and pos["idx"] < i:
            entry = pos["entry"]
            sl_c  = pos["be_sl"] if pos["be_on"] else pos["sl"]
            hi, lo, op = bar["high"], bar["low"], bar["open"]
            if not pos["be_t"]:
                if hi >= entry + SL_A * 1.5: pos["be_t"] = True
            elif not pos["be_on"]:
                pos["be_on"] = True; pos["be_sl"] = entry; sl_c = entry
            ep = er = None
            if   op <= sl_c:                ep, er = op, "sl"
            elif op >= pos["tp"]:           ep, er = op, "tp"
            elif lo <= sl_c and hi >= pos["tp"]: ep, er = sl_c, "sl"
            elif hi >= pos["tp"]:           ep, er = pos["tp"], "tp"
            elif lo <= sl_c:                ep, er = sl_c, "sl"
            if ep is not None:
                trades.append({"pnl_r": round((ep - entry) / SL_A, 4),
                               "exit_date": dk, "source": "DAX1H"})
                pos = None
        if not (7 <= dt.hour < 12): continue
        if not (0 < bar["close"] - bar["open"] < 100): continue
        if bar["close"] <= ema[i]: continue
        if not _sweep_l(bars, i): continue
        if pos is None and td.get(dk, 0) < 1:
            e = bar["close"]
            pos = {"entry": e, "sl": e - SL_A, "tp": e + TP_A, "idx": i, "ed": dk,
                   "be_t": False, "be_on": False, "be_sl": e - SL_A}
            td[dk] = td.get(dk, 0) + 1
    if pos:
        last = bars[-1]
        trades.append({"pnl_r": round((last["close"] - pos["entry"]) / SL_A, 4),
                       "exit_date": _dk(last), "source": "DAX1H"})
    return trades


# ── DAX 2H V4 engine ──────────────────────────────────────────────────────────
def _sweep_long_2h(bars: list[dict], i: int) -> bool:
    for lb in range(3, 10):
        if i < lb: continue
        up   = bars[i - lb + 1]; bear = bars[i - 1]
        base = bars[i - lb];     cur  = bars[i]
        if up["open"] >= up["close"]: continue
        if base["open"] <= base["close"]: continue
        if bear["open"] <= bear["close"]: continue
        if bear["close"] >= up["open"]: continue
        if cur["close"] <= up["open"]: continue
        if (up["open"] - bear["close"]) <= 1e-9: continue
        if all(bars[j]["close"] > base["close"] for j in range(i - lb + 2, i - 1)):
            return True
    return False


def run_dax2h(bars: list[dict]) -> list[dict]:
    n      = len(bars)
    closes = [b["close"] for b in bars]
    highs  = [b["high"]  for b in bars]
    lows   = [b["low"]   for b in bars]
    ema4   = _ema(closes, 4)
    atr14  = _atr(highs, lows, closes, 14)
    trades: list[dict] = []; pos = None; td: dict[str, int] = {}
    for i in range(9, n):
        bar = bars[i]
        s   = str(bar.get("date", "") or "")
        try:   dt = datetime.datetime.fromisoformat(s[:19])
        except: continue
        if dt.isoweekday() > 5: continue
        if not (9 <= dt.hour < 11): continue
        if ema4[i] is None or atr14[i] is None: continue
        risk = atr14[i] * 0.8
        if risk <= 0: continue
        body_l = bar["close"] - bar["open"]
        sw_l   = _sweep_long_2h(bars, i)
        logic_l = sw_l and bar["close"] >= ema4[i] and (0 < body_l < 200)
        dk = s[:10]; today = td.get(dk, 0)
        if pos is not None:
            entry = pos["entry"]; hi, lo, op = bar["high"], bar["low"], bar["open"]
            sl_c = pos.get("be_sl", pos["sl"]) if pos.get("be_on") else pos["sl"]
            if not pos.get("be_t"):
                if hi >= entry + pos["risk"]: pos["be_t"] = True
            elif not pos.get("be_on"):
                pos["be_on"] = True; pos["be_sl"] = entry; sl_c = entry
            ep = er = None
            if   op <= sl_c:                ep, er = op, "sl"
            elif op >= pos["tp"]:           ep, er = op, "tp"
            elif lo <= sl_c and hi >= pos["tp"]: ep, er = sl_c, "sl"
            elif hi >= pos["tp"]:           ep, er = pos["tp"], "tp"
            elif lo <= sl_c:                ep, er = sl_c, "sl"
            if ep is not None:
                trades.append({"pnl_r": round((ep - entry) / pos["risk"], 4),
                               "exit_date": dk, "source": "DAX2H"})
                pos = None
        if pos is None and today < 3 and logic_l:
            e = bar["close"]
            pos = {"entry": e, "sl": e - risk, "tp": e + risk * 3.0, "risk": risk,
                   "idx": i, "be_t": False, "be_on": False}
            td[dk] = today + 1
    if pos:
        last = bars[-1]; e = pos["entry"]
        trades.append({"pnl_r": round((last["close"] - e) / pos["risk"], 4) if pos["risk"] > 0 else 0.0,
                       "exit_date": _dk(last), "source": "DAX2H"})
    return trades


# ── Monthly return aggregation ─────────────────────────────────────────────────
def trades_to_monthly_r(trades: list[dict], source: str, ib: float) -> dict[str, float]:
    """
    Converts sorted trade list → per-month cumulative % equity change (decimal).
    Uses compound growth within the month.
    """
    eq = 1.0
    by_month: dict[str, float] = {}
    last_eq_of_prev: dict[str, float] = {}
    for t in sorted(trades, key=lambda x: x.get("exit_date", "")):
        month = t["exit_date"][:7]
        net_r = t["pnl_r"] - ib
        eq   += eq * TOTAL_RISK * net_r
        by_month[month] = eq  # running equity at end of last trade in this month

    # Convert absolute equity → monthly % change
    months = sorted(by_month)
    result: dict[str, float] = {}
    prev = 1.0
    for m in months:
        result[m] = by_month[m] / prev - 1.0
        prev = by_month[m]
    return result


def build_intraday_monthly_r(all_trades: list[dict]) -> dict[str, float]:
    """
    Combines 4 intraday strategies at v3-F weights into a single monthly return dict.
    Approach: portfolio-level trade equity (each trade affects portfolio by w * risk * r).
    """
    eq = 1.0
    trades_s = sorted(all_trades, key=lambda t: t.get("exit_date", ""))
    monthly_eq: dict[str, float] = {}
    for t in trades_s:
        src   = t["source"]
        w     = V3F_W.get(src, 0.0)
        ib    = IB_R.get(src, 0.0)
        net_r = t["pnl_r"] - ib
        eq   += eq * TOTAL_RISK * w * net_r
        month = t["exit_date"][:7]
        monthly_eq[month] = eq

    months = sorted(monthly_eq)
    result: dict[str, float] = {}
    prev = 1.0
    for m in months:
        result[m] = monthly_eq[m] / prev - 1.0
        prev = monthly_eq[m]
    return result


# ── Load WS v1.0 monthly returns from analytics JSON ──────────────────────────
def load_ws_monthly_returns() -> dict[str, dict[str, float]]:
    """
    Returns per-strategy monthly decimal returns for WS 6 strategies.
    Source: analytics-generated.json → whiteSwanBacktest.groupSeries
    """
    data = json.loads(ANALYTICS_JSON.read_text(encoding="utf-8"))
    group_series = data["whiteSwanBacktest"]["groupSeries"]
    result: dict[str, dict[str, float]] = {}
    for strat_id, curve in group_series.items():
        monthly_r: dict[str, float] = {}
        prev_cum = 0.0
        for point in curve:
            month  = point["date"][:7]
            cum    = point["value"]   # cumulative % from start
            r      = (1 + cum / 100) / (1 + prev_cum / 100) - 1
            monthly_r[month] = r
            prev_cum = cum
        result[strat_id] = monthly_r
    return result


# ── Combined portfolio metrics ─────────────────────────────────────────────────
def compute_portfolio_metrics(monthly_r: dict[str, float], label: str) -> dict:
    months = sorted(monthly_r)
    if not months:
        return {}
    # Equity curve
    eq = 1.0; peak = 1.0; max_dd = 0.0
    eq_vals: list[float] = [1.0]
    rs: list[float] = []
    for m in months:
        r = monthly_r[m]
        rs.append(r)
        eq  *= (1 + r)
        if eq > peak: peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd: max_dd = dd
        eq_vals.append(eq)

    # CAGR
    try:
        d0   = datetime.datetime.strptime(months[0],  "%Y-%m")
        d1   = datetime.datetime.strptime(months[-1], "%Y-%m")
        yrs  = max((d1 - d0).days / 365.25, 0.1)
        cagr = (eq ** (1 / yrs) - 1) * 100
    except Exception:
        cagr = 0.0

    calmar   = cagr / max_dd if max_dd > 0 else 0.0
    avg_r    = sum(rs) / len(rs) if rs else 0.0
    std_r    = math.sqrt(sum((r - avg_r) ** 2 for r in rs) / len(rs)) if len(rs) > 1 else 0.0
    sharpe   = (avg_r / std_r) * math.sqrt(12) if std_r > 0 else 0.0
    downside = [r for r in rs if r < 0]
    ds_std   = math.sqrt(sum(r ** 2 for r in downside) / len(downside)) if downside else 0.0
    sortino  = (avg_r / ds_std) * math.sqrt(12) if ds_std > 0 else 0.0
    pos_m    = len([r for r in rs if r > 0]) / len(rs) * 100 if rs else 0.0
    total_r  = (eq - 1) * 100
    # Worst year
    by_year: dict[str, list[float]] = {}
    for m, r in zip(months, rs):
        yr = m[:4]
        by_year.setdefault(yr, []).append(r)
    worst_yr = min(
        ((y, (math.prod(1 + r for r in vs) - 1) * 100) for y, vs in by_year.items()),
        key=lambda x: x[1], default=("n/a", 0.0)
    )[1] if by_year else 0.0

    return {
        "label":    label,
        "months":   len(months),
        "cagr":     round(cagr, 2),
        "max_dd":   round(max_dd, 2),
        "calmar":   round(calmar, 3),
        "sharpe":   round(sharpe, 3),
        "sortino":  round(sortino, 3),
        "pos_m":    round(pos_m, 1),
        "total_r":  round(total_r, 2),
        "worst_yr": round(worst_yr, 2),
    }


def combine_monthly(intraday_r: dict[str, float], ws_strat_r: dict[str, dict[str, float]],
                    intraday_w: float, ws_total_w: float) -> dict[str, float]:
    """
    For each month in the OOS window, combine:
      combined_r[m] = intraday_w * intraday_r[m]
                    + ws_total_w * sum_i(ws_frozen_w_i * ws_strat_r_i[m])
    Only months where intraday_r is defined are used.
    WS strategies use per-month renormalization if not all are available.
    """
    months = sorted(intraday_r)
    result: dict[str, float] = {}
    for m in months:
        if m < OOS_START[:7] or m > OOS_END[:7]:
            continue
        intra_c = intraday_r.get(m, 0.0)

        # WS contribution: renormalize by available strategies
        ws_sum_w = 0.0; ws_r_contrib = 0.0
        for strat_id, frozen_w in WS_WEIGHTS.items():
            r = ws_strat_r.get(strat_id, {}).get(m)
            if r is not None:
                ws_r_contrib += frozen_w * r
                ws_sum_w += frozen_w

        # Renormalize WS contribution if not all strategies available
        ws_r = ws_r_contrib / ws_sum_w if ws_sum_w > 0 else 0.0

        result[m] = intraday_w * intra_c + ws_total_w * ws_r
    return result


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("White Swan v1.1 — Intraday Grid Sweep")
    print("=" * 60)

    # ── Load and run intraday engines ──────────────────────────────────────────
    print("\n[1/4] Lade OHLC-Daten …")
    bars = {k: _slice(_load_bars(v), OOS_START, OOS_END) for k, v in DATA.items()}
    for k, v in bars.items():
        print(f"  {k}: {len(v)} bars")

    print("\n[2/4] Generiere Intraday-Trades (OOS 2019–2026) …")
    _wf = _load_fx_engine()
    EUR_CFG = _wf.EUR
    GBP_B   = replace(_wf.GBP, be_crv=1.0, be_immediate=False,
                      session_h_start=9, session_m_start=0,
                      session_h_end=10, session_m_end=30)
    run_fx  = _wf.run_backtest

    eur_t = run_fx(bars["EUR30m"], EUR_CFG)
    gbp_t = run_fx(bars["GBP30m"], GBP_B)
    for t in eur_t: t["source"] = "EUR30m"
    for t in gbp_t: t["source"] = "GBP30m"

    dax1_t = run_dax1h(bars["DAX1H"])
    dax2_t = run_dax2h(bars["DAX2H"])

    print(f"  EUR30m: {len(eur_t)} | DAX1H: {len(dax1_t)} | GBP30m: {len(gbp_t)} | DAX2H: {len(dax2_t)}")

    all_intraday = eur_t + dax1_t + gbp_t + dax2_t

    print("\n[3/4] Aggregiere monatliche Renditen …")
    intraday_monthly = build_intraday_monthly_r(all_intraday)
    ws_strat_monthly = load_ws_monthly_returns()

    print(f"  Intraday months: {len(intraday_monthly)}")
    for k, v in ws_strat_monthly.items():
        print(f"  {k}: {len(v)} months")

    # Standalone WS v1.0 (no intraday) for reference
    ws_only = combine_monthly(intraday_monthly, ws_strat_monthly, 0.0, 1.0)
    ref_ws  = compute_portfolio_metrics(ws_only, "WS v1.0 (0% Intraday)")
    print(f"\n  WS v1.0 Referenz: CAGR {ref_ws['cagr']:+.2f}% | MaxDD {ref_ws['max_dd']:.2f}% "
          f"| Calmar {ref_ws['calmar']:.3f} | Sharpe {ref_ws['sharpe']:.3f}")

    # Standalone Intraday v3-F for reference
    intra_only_r = {m: r for m, r in intraday_monthly.items()
                    if OOS_START[:7] <= m <= OOS_END[:7]}
    ref_intra = compute_portfolio_metrics(intra_only_r, "Intraday v3-F solo")
    print(f"  Intraday v3-F:    CAGR {ref_intra['cagr']:+.2f}% | MaxDD {ref_intra['max_dd']:.2f}% "
          f"| Calmar {ref_intra['calmar']:.3f} | Sharpe {ref_intra['sharpe']:.3f}")

    # ── Grid Sweep ─────────────────────────────────────────────────────────────
    print("\n[4/4] Grid-Sweep: Intraday-Anteil 5% – 40% …")
    sweep_steps = [round(w / 100, 2) for w in range(5, 45, 5)]
    results: list[dict] = [ref_ws, ref_intra]

    print(f"\n  {'Intraday%':>10} {'CAGR':>8} {'MaxDD':>8} {'Calmar':>8} {'Sharpe':>8} {'OK?':>5}")
    print(f"  {'-'*10} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*5}")

    for iw in sweep_steps:
        ws_w  = 1.0 - iw
        combined = combine_monthly(intraday_monthly, ws_strat_monthly, iw, ws_w)
        metrics  = compute_portfolio_metrics(combined, f"WS+IT {int(iw*100)}%")
        results.append(metrics)
        ok = (metrics["max_dd"] <= 15.0 and metrics["sharpe"] >= 1.0)
        flag = "✓" if ok else "✗"
        print(f"  {int(iw*100):>9}% {metrics['cagr']:>+7.2f}% {metrics['max_dd']:>7.2f}% "
              f"{metrics['calmar']:>8.3f} {metrics['sharpe']:>8.3f} {flag:>5}")

    # ── Ranking ────────────────────────────────────────────────────────────────
    valid = [r for r in results[2:]  # skip references
             if r["max_dd"] <= 15.0 and r["sharpe"] >= 1.0]

    print(f"\n{'=' * 60}")
    print("ERGEBNIS")
    print(f"{'=' * 60}")

    if not valid:
        print("  KEINE Kombination erfüllt MaxDD ≤ 15% UND Sharpe ≥ 1.0.")
        best = max(results[2:], key=lambda r: r["calmar"])
        print(f"  Bestes (ohne Nebenbedingung): {best['label']} | Calmar {best['calmar']:.3f}")
    else:
        best = max(valid, key=lambda r: r["calmar"])
        intraday_pct = int(best["label"].split("+IT ")[-1].replace("%", ""))
        ws_pct       = 100 - intraday_pct

        print(f"\n  Beste Intraday-Gewichtung: {intraday_pct}%")
        print(f"  WS v1.0 Anteil:            {ws_pct}%")
        print(f"\n  Portfolio-Key-Stats (OOS 2019–2026):")
        print(f"    CAGR:      {best['cagr']:+.2f}%")
        print(f"    MaxDD:     {best['max_dd']:.2f}%")
        print(f"    Calmar:    {best['calmar']:.3f}")
        print(f"    Sharpe:    {best['sharpe']:.3f}")
        print(f"    Sortino:   {best['sortino']:.3f}")
        print(f"    Pos Months:{best['pos_m']:.1f}%")
        print(f"    Total Ret: {best['total_r']:+.2f}%")
        print(f"    Worst Year:{best['worst_yr']:+.2f}%")
        print(f"    Months:    {best['months']}")

        print(f"\n  vs WS v1.0 (0% Intraday):")
        print(f"    CAGR  {ref_ws['cagr']:+.2f}% → {best['cagr']:+.2f}%  "
              f"(Δ{best['cagr']-ref_ws['cagr']:+.2f}%)")
        print(f"    MaxDD {ref_ws['max_dd']:.2f}% → {best['max_dd']:.2f}%  "
              f"(Δ{best['max_dd']-ref_ws['max_dd']:+.2f}pp)")
        print(f"    Calmar {ref_ws['calmar']:.3f} → {best['calmar']:.3f}  "
              f"(Δ{best['calmar']-ref_ws['calmar']:+.3f})")

        # Full ranking of valid combos
        print(f"\n  Alle gültigen Kombinationen (sortiert nach Calmar):")
        for r in sorted(valid, key=lambda x: x["calmar"], reverse=True):
            print(f"    {r['label']:20s} Calmar {r['calmar']:.3f} | CAGR {r['cagr']:+.2f}% | "
                  f"MaxDD {r['max_dd']:.2f}% | Sharpe {r['sharpe']:.3f}")

        # v1.1 config
        print(f"\n{'=' * 60}")
        print("WHITE SWAN v1.1 KONFIGURATION (zum Einfrieren)")
        print(f"{'=' * 60}")
        ws_scale = ws_pct / 100.0
        print(f"  WS v1.0 Strategien (×{ws_scale:.2f}):")
        for sid, w in WS_WEIGHTS.items():
            print(f"    {sid:<22s}: {w * ws_scale * 100:.2f}%")
        print(f"  Intraday MT v3-F   ({intraday_pct}%):")
        for src, iw in V3F_W.items():
            print(f"    {src:<22s}: {iw * intraday_pct:.2f}%")
        total = sum(w * ws_scale for w in WS_WEIGHTS.values()) + intraday_pct / 100.0
        print(f"  Summe: {total * 100:.1f}%")

    # Save results
    out = ROOT / "tools" / "ws_intraday_sweep_results.json"
    out.write_text(json.dumps({
        "generated": datetime.date.today().isoformat(),
        "oos_window": f"{OOS_START[:7]} – {OOS_END[:7]}",
        "v3f_weights": V3F_W,
        "ws_weights":  WS_WEIGHTS,
        "reference_ws":     ref_ws,
        "reference_intraday": ref_intra,
        "sweep_results":    results[2:],
        "best": best if valid else None,
    }, indent=2, default=str), encoding="utf-8")
    print(f"\n  JSON gespeichert: {out.name}")


if __name__ == "__main__":
    main()
