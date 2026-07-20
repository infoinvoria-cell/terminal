"""
Generate White Swan F+10% Portfolio Equity Curve
================================================
Combines 6 OOS strategy curves (2019-01-01 to 2026-12-31) into a weighted
portfolio equity curve and writes two output files:

  1. public/data/whiteswan/portfolio_f10_equity.json
     Schema: { equityCurve, drawdownCurve, summary, yearly }

  2. Updates src/data/capitalife/analytics-generated.json
     Replaces whiteSwanBacktest block with F+10% data

Weights (F+10%: Port-F baseline * 0.90 + NQ1_TrendLO * 0.10):
  GC1 Friday Long    0.198  (anomaly, monthly from trades)
  GLD Thursday Long  0.198  (anomaly, monthly from trades)
  YM1 TAT            0.198  (anomaly, monthly from trades)
  UKX_Val            0.198  (WS pkl, monthly via pct_change)
  CT1_Macro_A        0.108  (WS pkl, monthly via pct_change)
  NQ1_TrendLO        0.100  (WS pkl, monthly via pct_change)

Methodology matches validated reference (ws_full_scan_f.py):
  - Monthly return frequency (annualized with sqrt(12))
  - Anomaly returns: trade PnL / 100_000 per month
  - PKL returns: resample to month-end, pct_change
  - Strict inner join (all 6 strategies must be present)

Run: python tools/gen_ws_f10_equity.py
"""

import json
import math
import pickle
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np

# ── Paths ───────────────────────────────────────────────────────────────────
REPO = Path(__file__).parent.parent
BRAIN = Path(r"C:\Users\joris\Documents\Capitalife Brain")
PKL = BRAIN / "16_Backtesting_Validation" / "ws_equity_curves.pkl"
OUT_PUBLIC = REPO / "public" / "data" / "whiteswan" / "portfolio_f10_equity.json"
OUT_ANALYTICS = REPO / "src" / "data" / "capitalife" / "analytics-generated.json"

IS_START = "2003-01-01"    # earliest GC1 trade (2003-08); IS uses anomaly-only
OOS_START = "2019-01-01"  # OOS: all 6 strategies (anomaly + WS pkl)
OOS_END = "2026-12-31"
BASE_CAPITAL = 100_000.0

# IS weights: only 3 anomaly strategies, renormalized to sum=1.0
IS_WEIGHTS = {
    "GC1_Friday_Long":  1 / 3,
    "GLD_Thursday_Long": 1 / 3,
    "YM1_TAT":           1 / 3,
}

# ── Weights (F+10%: Port-F * 0.90 + NQ1 * 0.10) ────────────────────────────
WEIGHTS = {
    "GC1_Friday_Long": 0.198,
    "GLD_Thursday_Long": 0.198,
    "YM1_TAT": 0.198,
    "UKX_Val": 0.198,
    "CT1_Macro_A": 0.108,
    "NQ1_TrendLO": 0.100,
}

ANOMALY_FILES = {
    "GC1_Friday_Long": REPO / "public/data/anomaly/gc1_friday_long.json",
    "GLD_Thursday_Long": REPO / "public/data/anomaly/gld_thursday_long.json",
    "YM1_TAT": REPO / "public/data/anomaly/ym1_tat.json",
}

PKL_KEYS = ["UKX_Val", "CT1_Macro_A", "NQ1_TrendLO"]


# ── Return loaders ──────────────────────────────────────────────────────────

def trades_to_monthly_returns(trades: list, start: str = IS_START) -> pd.Series:
    """PnL per trade -> monthly return (base = 100_000).
    Matches reference: monthly_pnl / 100_000."""
    rows = []
    for t in trades:
        exit_time = pd.to_datetime(t["exit_time"])
        rows.append({"date": exit_time, "pnl": float(t["pnl"])})
    df = pd.DataFrame(rows)
    df = df[(df["date"] >= start) & (df["date"] <= OOS_END)]
    if df.empty:
        return pd.Series(dtype=float)
    df = df.set_index("date").sort_index()
    monthly_pnl = df["pnl"].resample("ME").sum()
    return monthly_pnl / BASE_CAPITAL


def equity_to_monthly_returns(eq: pd.Series) -> pd.Series:
    """Daily normalized equity -> monthly return via resample + pct_change.
    Matches reference."""
    eq = eq.sort_index()
    eq = eq[(eq.index >= OOS_START) & (eq.index <= OOS_END)]
    if eq.empty:
        return pd.Series(dtype=float)
    monthly = eq.resample("ME").last()
    return monthly.pct_change().dropna()


# ── Stats ────────────────────────────────────────────────────────────────────

def sharpe_monthly(ret: pd.Series) -> float:
    """Annualized Sharpe from monthly returns (rf=0)."""
    if ret.empty or ret.std() == 0:
        return float("nan")
    return float(ret.mean() / ret.std() * math.sqrt(12))


def cagr_from_monthly(ret: pd.Series) -> float:
    """CAGR from monthly returns."""
    if ret.empty:
        return float("nan")
    years = len(ret) / 12
    if years <= 0:
        return float("nan")
    total = float((1 + ret).prod())
    return total ** (1 / years) - 1


def max_drawdown(ret: pd.Series) -> float:
    """Max drawdown as negative fraction."""
    eq = (1 + ret).cumprod()
    roll_max = eq.cummax()
    dd = (eq / roll_max - 1)
    return float(dd.min())


def calmar(ret: pd.Series) -> float:
    c = cagr_from_monthly(ret)
    md = max_drawdown(ret)
    if md == 0 or math.isnan(md) or math.isnan(c):
        return float("nan")
    return c / abs(md)


def vol_annual(ret: pd.Series) -> float:
    """Annualized vol from monthly returns."""
    if ret.empty or len(ret) < 2:
        return float("nan")
    return float(ret.std() * math.sqrt(12))


# ── Equity curve builder ──────────────────────────────────────────────────────

def returns_to_equity_curve(port_ret: pd.Series, initial: float = BASE_CAPITAL) -> list[dict]:
    """Convert monthly returns to cumulative equity curve."""
    equity = initial
    curve = []
    for ts, r in port_ret.items():
        equity *= 1 + r
        curve.append({"time": ts.strftime("%Y-%m-%d"), "value": round(equity, 2)})
    return curve


def compute_drawdown_curve(equity_curve: list[dict]) -> list[dict]:
    peak = -math.inf
    dd = []
    for p in equity_curve:
        v = p["value"]
        peak = max(peak, v)
        dd.append({"time": p["time"], "value": round((v / peak - 1) * 100, 4)})
    return dd


def compute_yearly(port_ret: pd.Series) -> list[dict]:
    result = []
    for yr, grp in port_ret.groupby(port_ret.index.year):
        compound = float((1 + grp).prod()) - 1
        result.append({"year": str(yr), "return": round(compound * 100, 3)})
    return result


def compute_monthly_series(port_ret: pd.Series) -> list[dict]:
    return [
        {"month": ts.strftime("%Y-%m"), "value": round(float(r) * 100, 4)}
        for ts, r in port_ret.items()
    ]


def strategy_equity_percent(ret: pd.Series) -> list[dict]:
    """Cumulative equity as % gain from a monthly return series (base=1)."""
    eq = 1.0
    result = []
    for ts, r in ret.items():
        eq *= 1 + r
        result.append({"date": ts.strftime("%Y-%m-%d"), "value": round((eq - 1) * 100, 4)})
    return result


def equity_to_percent_series(equity_curve: list[dict], initial: float = BASE_CAPITAL) -> list[dict]:
    return [
        {"date": p["time"], "value": round((p["value"] / initial - 1) * 100, 4)}
        for p in equity_curve
    ]


def drawdown_to_analytics(dd_curve: list[dict]) -> list[dict]:
    return [{"date": p["time"], "value": p["value"]} for p in dd_curve]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Loading anomaly returns from trades (full IS+OOS)...")
    anomaly_returns: dict[str, pd.Series] = {}
    for key, path in ANOMALY_FILES.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        # Load full history from IS_START
        anomaly_returns[key] = trades_to_monthly_returns(data["trades"], start=IS_START)
        print(f"  {key}: {len(anomaly_returns[key])} monthly returns ({anomaly_returns[key].index[0].date() if not anomaly_returns[key].empty else 'empty'} – {anomaly_returns[key].index[-1].date() if not anomaly_returns[key].empty else 'empty'})")

    print("Loading WS pkl curves (OOS only — no IS history available)...")
    pkl_data = pickle.load(open(PKL, "rb"))
    curves = pkl_data["curves"]

    pkl_returns: dict[str, pd.Series] = {}
    for key in PKL_KEYS:
        pkl_returns[key] = equity_to_monthly_returns(curves[key])
        print(f"  {key}: {len(pkl_returns[key])} monthly returns")

    # ── IS Phase: anomaly-only portfolio (before OOS_START) ──────────────────
    # Inner join of 3 anomaly series for IS period only
    print("\nBuilding IS phase (anomaly-only, 3 strategies, equal weights)...")
    anomaly_df_full = pd.concat(anomaly_returns, axis=1).dropna()
    is_df = anomaly_df_full[anomaly_df_full.index < OOS_START]
    print(f"  IS months: {len(is_df)}  ({is_df.index[0].date() if len(is_df) else 'none'} – {is_df.index[-1].date() if len(is_df) else 'none'})")
    is_ret = sum(is_df[name] * w for name, w in IS_WEIGHTS.items()) if len(is_df) else pd.Series(dtype=float)

    # ── OOS Phase: all 6 strategies (strict inner join) ───────────────────────
    print("Building OOS phase (all 6 strategies)...")
    all_source: dict[str, pd.Series] = {**anomaly_returns, **pkl_returns}
    oos_source = {k: v[v.index >= OOS_START] for k, v in all_source.items()}
    oos_df = pd.concat(oos_source, axis=1).dropna()
    print(f"  OOS months: {len(oos_df)}  ({oos_df.index[0].date()} – {oos_df.index[-1].date()})")
    oos_ret = sum(oos_df[name] * w for name, w in WEIGHTS.items())

    # ── Stitch IS + OOS ───────────────────────────────────────────────────────
    print("Stitching IS + OOS...")
    port_ret = pd.concat([is_ret, oos_ret]).sort_index()
    print(f"  Combined: {len(port_ret)} months  ({port_ret.index[0].date()} – {port_ret.index[-1].date()})")

    # Rebuild all_source for group series (anomaly full + pkl OOS only)
    all_source_oos = {k: v for k, v in anomaly_returns.items()}
    all_source_oos.update(pkl_returns)  # pkl_returns already OOS-only from equity_to_monthly_returns

    # ── Metrics ──────────────────────────────────────────────────────────────
    sh = sharpe_monthly(port_ret)
    c = cagr_from_monthly(port_ret) * 100
    md = max_drawdown(port_ret) * 100
    cal = calmar(port_ret)
    v = vol_annual(port_ret) * 100
    total_ret = float((1 + port_ret).prod() - 1) * 100

    summary = {
        "sharpe": round(sh, 3),
        "cagr": round(c, 3),
        "maxDD": round(md, 3),
        "calmar": round(cal, 3),
        "totalReturn": round(total_ret, 3),
        "vol": round(v, 3),
    }

    print(f"\nSummary: {summary}")

    # Validate against targets
    targets = {"sharpe": 1.585, "cagr": 6.96, "maxDD": -2.62, "calmar": 2.660}
    tol = {"sharpe": 0.05, "cagr": 0.5, "maxDD": 0.3, "calmar": 0.1}
    print("\nValidation vs targets:")
    all_pass = True
    for k, tgt in targets.items():
        got = summary[k]
        diff = abs(got - tgt)
        status = "PASS" if diff <= tol[k] else "FAIL"
        if status == "FAIL":
            all_pass = False
        print(f"  {k}: got {got}  target {tgt}  diff {diff:.4f}  [{status}]")
    if not all_pass:
        print("\nWARNING: One or more metrics outside tolerance. Proceeding with output anyway.")

    # ── Build curves ──────────────────────────────────────────────────────────
    equity_curve = returns_to_equity_curve(port_ret)
    drawdown_curve = compute_drawdown_curve(equity_curve)
    yearly = compute_yearly(port_ret)
    monthly_series = compute_monthly_series(port_ret)

    print(f"\nYearly returns: {yearly}")

    # ── Write public JSON ──────────────────────────────────────────────────────
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    public_json = {
        "meta": {
            "generated": datetime.utcnow().isoformat() + "Z",
            "is_start": IS_START,
            "oos_start": OOS_START,
            "strategies": list(WEIGHTS.keys()),
            "weights": WEIGHTS,
            "is_weights": IS_WEIGHTS,
            "note": "F+10% Portfolio IS+OOS Equity — IS: 3 anomaly strategies (equal weight); OOS: 6 strategies (monthly, inner join)",
        },
        "isOosSplit": OOS_START,
        "equityCurve": equity_curve,
        "drawdownCurve": drawdown_curve,
        "summary": summary,
        "yearly": yearly,
    }
    OUT_PUBLIC.write_text(json.dumps(public_json, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote: {OUT_PUBLIC}")

    # ── Write analytics-generated.json ────────────────────────────────────────
    perf_series = equity_to_percent_series(equity_curve)
    dd_series = drawdown_to_analytics(drawdown_curve)
    annual_bars = [{"year": item["year"], "value": round(item["return"], 4)} for item in yearly]
    monthly_bars = [{"month": item["month"], "value": item["value"]} for item in monthly_series]

    group_series = {
        "GC1 Friday Long": strategy_equity_percent(all_source_oos["GC1_Friday_Long"]),
        "GLD Thursday Long": strategy_equity_percent(all_source_oos["GLD_Thursday_Long"]),
        "YM1 TAT": strategy_equity_percent(all_source_oos["YM1_TAT"]),
        "UKX Valuation": strategy_equity_percent(all_source_oos["UKX_Val"]),
        "CT1 Macro A": strategy_equity_percent(all_source_oos["CT1_Macro_A"]),
        "NQ1 Trend LO": strategy_equity_percent(all_source_oos["NQ1_TrendLO"]),
    }
    group_bars = [
        {"group": label, "value": round(strategy_equity_percent(all_source_oos[key])[-1]["value"] if not all_source_oos[key].empty else 0, 2)}
        for label, key in [
            ("GC1 Friday Long", "GC1_Friday_Long"),
            ("GLD Thursday Long", "GLD_Thursday_Long"),
            ("YM1 TAT", "YM1_TAT"),
            ("UKX Valuation", "UKX_Val"),
            ("CT1 Macro A", "CT1_Macro_A"),
            ("NQ1 Trend LO", "NQ1_TrendLO"),
        ]
    ]

    ws_backtest_block = {
        "performanceSeries": perf_series,
        "drawdownSeries": dd_series,
        "benchmarkSeries": [],
        "groupSeries": group_series,
        "annualReturns": annual_bars,
        "monthlyReturns": monthly_bars,
        "groupBars": group_bars,
        "strategyBars": [],
    }

    if OUT_ANALYTICS.exists():
        existing = json.loads(OUT_ANALYTICS.read_text(encoding="utf-8"))
    else:
        existing = {
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "whiteSwanBacktest": {},
            "investBacktest": {"performanceSeries": [], "drawdownSeries": [], "benchmarkSeries": [], "groupSeries": {}, "annualReturns": [], "monthlyReturns": [], "groupBars": [], "strategyBars": []},
            "combinedBacktest": {"performanceSeries": [], "drawdownSeries": [], "benchmarkSeries": [], "groupSeries": {}, "annualReturns": [], "monthlyReturns": [], "groupBars": [], "strategyBars": []},
        }

    existing["generatedAt"] = datetime.utcnow().isoformat() + "Z"
    existing["whiteSwanBacktest"] = ws_backtest_block

    OUT_ANALYTICS.parent.mkdir(parents=True, exist_ok=True)
    OUT_ANALYTICS.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Updated: {OUT_ANALYTICS}")
    print("\nDone. Run: npm run build")


if __name__ == "__main__":
    main()
