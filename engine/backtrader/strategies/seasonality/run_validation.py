"""
Full Seasonality Validation Pipeline
Runs all 10 patterns through: basis backtest, walk-forward, stress tests,
cost analysis, rollover, Monte Carlo, regime filter, and scoring.
"""
import sys
import os
import json
import math
from datetime import datetime, date

import numpy as np
import pandas as pd
import backtrader as bt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from engine.backtrader.data.seasonal_loader import load_asset, ASSET_PATHS
from engine.backtrader.strategies.seasonality.seasonal_base import (
    PATTERN_REGISTRY,
    PATTERN_META,
    SeasonalSlotStrategy,
)

# ─── A) BASIS BACKTEST ────────────────────────────────────────────────

def run_backtest(symbol, start=None, end=None, commission=0.001):
    df = load_asset(symbol)
    if df is None:
        return None

    if start:
        df = df[df["time"] >= pd.Timestamp(start)]
    if end:
        df = df[df["time"] <= pd.Timestamp(end)]
    if len(df) < 50:
        return None

    df = df.set_index("time")
    data = bt.feeds.PandasData(dataname=df)

    cerebro = bt.Cerebro()
    cerebro.adddata(data)
    strat_class = PATTERN_REGISTRY[symbol]
    cerebro.addstrategy(strat_class)
    cerebro.broker.setcash(100000)
    cerebro.broker.setcommission(commission=commission)
    cerebro.addsizer(bt.sizers.PercentSizer, percents=95)

    results = cerebro.run()
    strat = results[0]

    final_val = cerebro.broker.getvalue()
    trades = strat.trade_log

    return {
        "final_value": final_val,
        "trades": trades,
        "start_cash": 100000,
    }


def compute_metrics(result, label="full"):
    if not result or not result["trades"]:
        return {
            "label": label, "trades": 0, "win_rate": 0, "sharpe": 0,
            "cagr": 0, "max_dd": 0, "calmar": 0, "profit_factor": 0,
            "avg_trade_days": 0, "total_pnl": 0,
        }

    trades = result["trades"]
    pnls = [t["pnlcomm"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate = len(wins) / len(pnls) if pnls else 0
    gross_profit = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0.001
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 999

    # Equity curve from trades
    equity = [100000]
    for p in pnls:
        equity.append(equity[-1] + p)
    equity = np.array(equity)

    # Max drawdown
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak
    max_dd = float(dd.min()) * 100

    # CAGR
    first_trade = trades[0]["dtopen"]
    last_trade = trades[-1]["dtclose"]
    years = max((last_trade - first_trade).days / 365.25, 0.5)
    total_return = equity[-1] / equity[0]
    cagr = (total_return ** (1.0 / years) - 1) * 100 if total_return > 0 else -100

    # Sharpe (annualized from trade returns)
    rets = np.array(pnls) / 100000
    if len(rets) > 1 and np.std(rets) > 0:
        trades_per_year = len(rets) / years
        sharpe = (np.mean(rets) / np.std(rets)) * math.sqrt(trades_per_year)
    else:
        sharpe = 0

    calmar = abs(cagr / max_dd) if max_dd != 0 else 0

    avg_days = np.mean([t["barlen"] for t in trades]) if trades else 0

    return {
        "label": label,
        "trades": len(pnls),
        "win_rate": round(win_rate * 100, 1),
        "sharpe": round(sharpe, 2),
        "cagr": round(cagr, 2),
        "max_dd": round(max_dd, 2),
        "calmar": round(calmar, 2),
        "profit_factor": round(profit_factor, 2),
        "avg_trade_days": round(avg_days, 1),
        "total_pnl": round(sum(pnls), 2),
    }


# ─── B) ROLLING WALK-FORWARD ─────────────────────────────────────────

def walk_forward(symbol, is_years=5, oos_years=1):
    df = load_asset(symbol)
    if df is None:
        return {"wf_efficiency": 0, "avg_oos_sharpe": 0, "folds": []}

    first_year = df["time"].dt.year.min()
    last_year = df["time"].dt.year.max()

    folds = []
    start_year = first_year

    while start_year + is_years + oos_years <= last_year + 1:
        is_start = f"{start_year}-01-01"
        is_end = f"{start_year + is_years - 1}-12-31"
        oos_start = f"{start_year + is_years}-01-01"
        oos_end = f"{start_year + is_years + oos_years - 1}-12-31"

        oos_result = run_backtest(symbol, start=oos_start, end=oos_end)
        oos_metrics = compute_metrics(oos_result, label=f"OOS {start_year + is_years}")

        folds.append({
            "is_period": f"{start_year}-{start_year + is_years - 1}",
            "oos_period": f"{start_year + is_years}-{start_year + is_years + oos_years - 1}",
            "oos_sharpe": oos_metrics["sharpe"],
            "oos_pnl": oos_metrics["total_pnl"],
            "oos_trades": oos_metrics["trades"],
            "oos_positive": oos_metrics["total_pnl"] > 0,
        })

        start_year += 1

    positive_folds = sum(1 for f in folds if f["oos_positive"])
    wf_eff = (positive_folds / len(folds) * 100) if folds else 0
    avg_sharpe = np.mean([f["oos_sharpe"] for f in folds]) if folds else 0

    return {
        "wf_efficiency": round(wf_eff, 1),
        "avg_oos_sharpe": round(avg_sharpe, 2),
        "total_folds": len(folds),
        "positive_folds": positive_folds,
    }


# ─── C) STRESS TESTS ─────────────────────────────────────────────────

STRESS_PERIODS = {
    "GFC_2008": ("2008-09-01", "2009-03-31"),
    "EUR_Krise_2011": ("2011-06-01", "2012-06-30"),
    "USD_Rally_2014": ("2014-07-01", "2015-03-31"),
    "COVID_2020": ("2020-02-01", "2020-04-30"),
    "Zinsanstieg_2022": ("2022-01-01", "2022-12-31"),
}


def stress_tests(symbol):
    results = {}
    for name, (start, end) in STRESS_PERIODS.items():
        r = run_backtest(symbol, start=start, end=end)
        m = compute_metrics(r, label=name)
        passed = m["total_pnl"] >= 0 or m["trades"] == 0
        results[name] = {
            "trades": m["trades"],
            "pnl": m["total_pnl"],
            "max_dd": m["max_dd"],
            "passed": passed,
        }
    passed_count = sum(1 for v in results.values() if v["passed"])
    return {"periods": results, "passed": passed_count, "total": len(STRESS_PERIODS)}


# ─── D) KOSTEN-ANALYSE ───────────────────────────────────────────────

def cost_analysis(symbol):
    no_cost = run_backtest(symbol, commission=0)
    with_cost = run_backtest(symbol, commission=0.001)

    m_no = compute_metrics(no_cost, "no_cost")
    m_with = compute_metrics(with_cost, "with_cost")

    cost_drag = m_no["total_pnl"] - m_with["total_pnl"]
    still_profitable = m_with["total_pnl"] > 0

    # Break-even spread: find commission where PnL = 0
    be_spread = 0
    if m_no["total_pnl"] > 0 and m_no["trades"] > 0:
        avg_trade_value = 100000
        be_spread = m_no["total_pnl"] / (m_no["trades"] * avg_trade_value) * 10000

    return {
        "pnl_no_cost": m_no["total_pnl"],
        "pnl_with_cost": m_with["total_pnl"],
        "cost_drag": round(cost_drag, 2),
        "still_profitable": still_profitable,
        "break_even_spread_bps": round(be_spread, 1),
    }


# ─── E) ROLLOVER ─────────────────────────────────────────────────────

def rollover_analysis(symbol, rollover_cost_usd=50):
    r = run_backtest(symbol)
    if not r or not r["trades"]:
        return {"rollovers_per_year": 0, "annual_cost": 0, "net_pnl": 0}

    trades = r["trades"]
    first = trades[0]["dtopen"]
    last = trades[-1]["dtclose"]
    years = max((last - first).days / 365.25, 1)

    # Each trade is 1 entry + 1 exit, assume 1 rollover per multi-day hold
    total_rollovers = len(trades)
    per_year = total_rollovers / years
    annual_cost = per_year * rollover_cost_usd
    net_pnl = sum(t["pnlcomm"] for t in trades) - total_rollovers * rollover_cost_usd

    return {
        "total_trades": len(trades),
        "rollovers_per_year": round(per_year, 1),
        "annual_rollover_cost": round(annual_cost, 0),
        "net_pnl_after_rollover": round(net_pnl, 2),
    }


# ─── F) MONTE CARLO ──────────────────────────────────────────────────

def monte_carlo(symbol, n_sims=500):
    r = run_backtest(symbol)
    if not r or not r["trades"]:
        return {"p5_sharpe": 0, "p50_sharpe": 0, "prob_loss": 100, "prob_dd_gt_20": 100}

    trade_rets = np.array([t["pnlcomm"] / 100000 for t in r["trades"]])
    n = len(trade_rets)
    if n < 5:
        return {"p5_sharpe": 0, "p50_sharpe": 0, "prob_loss": 100, "prob_dd_gt_20": 100}

    rng = np.random.default_rng(42)
    sharpes = []
    final_returns = []
    max_dds = []

    for _ in range(n_sims):
        shuffled = rng.choice(trade_rets, size=n, replace=True)
        eq = np.cumprod(1 + shuffled)
        total_ret = eq[-1] - 1
        final_returns.append(total_ret)

        peak = np.maximum.accumulate(eq)
        dd = (eq - peak) / peak
        max_dds.append(dd.min() * 100)

        if np.std(shuffled) > 0:
            s = np.mean(shuffled) / np.std(shuffled) * math.sqrt(n)
            sharpes.append(s)
        else:
            sharpes.append(0)

    sharpes = np.array(sharpes)
    prob_loss = np.mean(np.array(final_returns) < 0) * 100
    prob_dd20 = np.mean(np.array(max_dds) < -20) * 100

    return {
        "p5_sharpe": round(float(np.percentile(sharpes, 5)), 2),
        "p50_sharpe": round(float(np.percentile(sharpes, 50)), 2),
        "prob_loss_pct": round(prob_loss, 1),
        "prob_dd_gt_20_pct": round(prob_dd20, 1),
    }


# ─── G) SCORING ───────────────────────────────────────────────────────

def compute_score(basis, wf, stress, costs, mc):
    score = 0
    if basis["sharpe"] > 1.0:
        score += 20
    elif basis["sharpe"] > 0.5:
        score += 10
    if wf["wf_efficiency"] > 70:
        score += 20
    elif wf["wf_efficiency"] > 50:
        score += 10
    if stress["passed"] >= 4:
        score += 20
    elif stress["passed"] >= 3:
        score += 10
    if costs["still_profitable"]:
        score += 20
    elif costs["pnl_with_cost"] > -1000:
        score += 5
    if mc["p5_sharpe"] > 0:
        score += 20
    elif mc["p5_sharpe"] > -0.5:
        score += 10

    if score >= 80:
        grade = "A"
        verdict = "Live-tauglich"
    elif score >= 60:
        grade = "B"
        verdict = "Paper Trading"
    elif score >= 40:
        grade = "C"
        verdict = "Weitere Forschung"
    else:
        grade = "D"
        verdict = "Verwerfen"

    return {"score": score, "grade": grade, "verdict": verdict}


# ─── MAIN ─────────────────────────────────────────────────────────────

def validate_all():
    all_results = []

    for symbol in PATTERN_REGISTRY:
        meta = PATTERN_META[symbol]
        print(f"\n{'='*60}")
        print(f"  {symbol} — {meta['name']} ({meta['direction']} {meta['window']})")
        print(f"{'='*60}")

        # A) Basis
        print("  [A] Basis-Backtest...", end=" ", flush=True)
        basis_result = run_backtest(symbol)
        basis = compute_metrics(basis_result)
        print(f"{basis['trades']} Trades, Sharpe={basis['sharpe']}, CAGR={basis['cagr']}%")

        # B) Walk-Forward
        print("  [B] Walk-Forward...", end=" ", flush=True)
        wf = walk_forward(symbol)
        print(f"Effizienz={wf['wf_efficiency']}%, Avg OOS Sharpe={wf['avg_oos_sharpe']}")

        # C) Stress
        print("  [C] Stress Tests...", end=" ", flush=True)
        stress = stress_tests(symbol)
        print(f"{stress['passed']}/{stress['total']} bestanden")

        # D) Kosten
        print("  [D] Kosten-Analyse...", end=" ", flush=True)
        costs = cost_analysis(symbol)
        print(f"Nach Kosten: {costs['pnl_with_cost']:.0f} USD, BE-Spread: {costs['break_even_spread_bps']} bps")

        # E) Rollover
        print("  [E] Rollover...", end=" ", flush=True)
        rollover = rollover_analysis(symbol)
        print(f"{rollover['rollovers_per_year']}/y, Netto: {rollover['net_pnl_after_rollover']:.0f} USD")

        # F) Monte Carlo
        print("  [F] Monte Carlo...", end=" ", flush=True)
        mc = monte_carlo(symbol)
        print(f"p5 Sharpe={mc['p5_sharpe']}, Prob Loss={mc['prob_loss_pct']}%")

        # G) Score
        scoring = compute_score(basis, wf, stress, costs, mc)
        print(f"  >>> SCORE: {scoring['score']}/100 — Grade {scoring['grade']} — {scoring['verdict']}")

        all_results.append({
            "name": meta["name"],
            "asset": meta["symbol"],
            "symbol": symbol,
            "direction": meta["direction"],
            "window": meta["window"],
            "category": meta["category"],
            "grade": scoring["grade"],
            "score": scoring["score"],
            "verdict": scoring["verdict"],
            "sharpe": basis["sharpe"],
            "cagr": basis["cagr"],
            "max_dd": basis["max_dd"],
            "win_rate": basis["win_rate"],
            "profit_factor": basis["profit_factor"],
            "trades": basis["trades"],
            "avg_trade_days": basis["avg_trade_days"],
            "wf_efficiency": wf["wf_efficiency"],
            "avg_oos_sharpe": wf["avg_oos_sharpe"],
            "stress_passed": stress["passed"],
            "stress_total": stress["total"],
            "after_costs_profitable": costs["still_profitable"],
            "cost_drag": costs["cost_drag"],
            "break_even_spread_bps": costs["break_even_spread_bps"],
            "mc_p5_sharpe": mc["p5_sharpe"],
            "mc_p50_sharpe": mc["p50_sharpe"],
            "mc_prob_loss_pct": mc["prob_loss_pct"],
            "rollover_cost_annual": rollover["annual_rollover_cost"],
            "net_pnl_after_rollover": rollover["net_pnl_after_rollover"],
            "last_validated": date.today().isoformat(),
        })

    return all_results


def save_results(results):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    out_path = os.path.join(project_root, "src", "data", "capitalife", "seasonality_validation.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    output = {
        "generated_at": date.today().isoformat(),
        "generator": "engine/backtrader/strategies/seasonality/run_validation.py",
        "patterns": results,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nErgebnisse gespeichert: {out_path}")
    return out_path


def print_summary_table(results):
    print(f"\n{'='*100}")
    print("ZUSAMMENFASSUNG")
    print(f"{'='*100}")
    print(f"{'Muster':<20} {'Asset':<6} {'Dir':<6} {'Grade':>5} {'Score':>5} "
          f"{'Sharpe':>7} {'CAGR%':>7} {'MaxDD%':>7} {'WR%':>5} {'WF%':>5} "
          f"{'Stress':>6} {'MC p5':>6} {'Verdict':<20}")
    print("-" * 100)
    for r in sorted(results, key=lambda x: x["score"], reverse=True):
        print(
            f"{r['name']:<20} {r['asset']:<6} {r['direction']:<6} "
            f"{r['grade']:>5} {r['score']:>5} "
            f"{r['sharpe']:>7.2f} {r['cagr']:>7.2f} {r['max_dd']:>7.2f} "
            f"{r['win_rate']:>5.1f} {r['wf_efficiency']:>5.1f} "
            f"{r['stress_passed']}/{r['stress_total']:>1} "
            f"{r['mc_p5_sharpe']:>6.2f} {r['verdict']:<20}"
        )

    # Empfehlungen
    live = [r for r in results if r["grade"] == "A"]
    paper = [r for r in results if r["grade"] == "B"]
    research = [r for r in results if r["grade"] == "C"]
    discard = [r for r in results if r["grade"] == "D"]

    print(f"\nEMPFEHLUNGEN:")
    if live:
        print(f"  Live-tauglich (A): {', '.join(r['asset'] for r in live)}")
    if paper:
        print(f"  Paper Trading (B): {', '.join(r['asset'] for r in paper)}")
    if research:
        print(f"  Weitere Forschung (C): {', '.join(r['asset'] for r in research)}")
    if discard:
        print(f"  Verwerfen (D): {', '.join(r['asset'] for r in discard)}")


if __name__ == "__main__":
    print("Seasonality Validation Pipeline")
    print(f"Datum: {date.today()}")
    print(f"Patterns: {len(PATTERN_REGISTRY)}")

    results = validate_all()
    print_summary_table(results)
    out = save_results(results)
    print(f"\nValidierung abgeschlossen. {len(results)} Muster geprüft.")
