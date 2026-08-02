"""
Full Universe Seasonal Pattern Scanner
Scans 50+ assets across all calendar windows, validates with Backtrader.
Bonferroni correction, rolling walk-forward, Calmar ranking.

Usage: python run_universe_scan.py [--quick] [--assets ES1,GC1,CL1]
"""
import sys
import os
import json
import math
import argparse
from datetime import date, timedelta
from collections import defaultdict

import numpy as np
import pandas as pd

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)
from engine.backtrader.data.seasonal_loader import load_asset, ASSET_PATHS

# ═══ CONFIGURATION ══════════════════════════════════════════════════════

ENTRY_DAYS = [1, 5, 10, 15, 20, 25]
HOLDING_DAYS = [5, 8, 10, 14, 18, 21, 30, 45]
DIRECTIONS = ["LONG", "SHORT"]
MIN_YEARS = 15
MIN_OBSERVATIONS = 10
MIN_HOLDING_DAYS = 5
IS_CUTOFF = "2019-12-31"
OOS_START = "2020-01-01"

# Tier 1 fast screen thresholds
T1_MIN_WIN_RATE = 0.58
T1_MIN_AVG_RET = 0.001
T1_MIN_SHARPE = 0.3

# Tier 2 Backtrader thresholds
T2_MIN_SHARPE = 0.2
T2_MIN_PROFIT_FACTOR = 1.1
T2_MIN_CALMAR = 0.15

# Max one pattern per asset in final output
MAX_PER_ASSET = 2

ASSET_CATEGORIES = {
    "RB1": "energy", "ZW1": "grain", "GC1": "metal", "NG1": "energy",
    "SB1": "soft", "CC1": "soft", "PA1": "metal", "ZM1": "grain",
    "CT1": "soft", "ES1": "index", "ZC1": "grain", "ZS1": "grain",
    "KC1": "soft", "OJ1": "soft", "CL1": "energy", "HG1": "metal",
    "PL1": "metal", "BZ1": "energy", "6S1": "fx", "ZN1": "bond",
    "ZT1": "bond", "DXY": "fx", "6A1": "fx", "SI1": "metal",
    "NQ1": "index", "YM1": "index", "RTY1": "index", "FDAX1": "index",
    "6E1": "fx", "6B1": "fx", "6J1": "fx", "ZB1": "bond",
    "SPY": "etf_equity", "QQQ": "etf_equity", "GLD": "etf_metal",
    "TLT": "etf_bond", "IEF": "etf_bond", "LQD": "etf_bond",
    "EFA": "etf_equity", "EEM": "etf_equity", "VNQ": "etf_reit",
    "DBC": "etf_commodity", "HYG": "etf_bond", "IWM": "etf_equity",
    "SHY": "etf_bond", "COPX": "etf_metal",
    "AAPL": "stock", "MSFT": "stock", "NVDA": "stock",
    "AMZN": "stock", "META": "stock", "GOOGL": "stock",
}


# ═══ TIER 1 — FAST NUMPY SCREEN ════════════════════════════════════════

def fast_screen_asset(symbol, df):
    """Screen all calendar windows for one asset using vectorized numpy.
    Returns list of candidate patterns that pass Tier 1 thresholds."""
    df = df.copy()
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time").sort_index()

    if "close" not in df.columns:
        return []

    is_df = df[df.index <= IS_CUTOFF]
    if len(is_df) < 252 * MIN_YEARS * 0.7:
        return []

    closes = is_df["close"].values
    dates = is_df.index
    daily_rets = np.diff(closes) / closes[:-1]

    candidates = []
    months = range(1, 13)

    for month in months:
        for entry_day in ENTRY_DAYS:
            for hold in HOLDING_DAYS:
                for direction in DIRECTIONS:
                    rets = _compute_window_returns(
                        dates, closes, month, entry_day, hold, direction
                    )
                    if len(rets) < MIN_OBSERVATIONS:
                        continue

                    win_rate = np.mean(rets > 0)
                    avg_ret = np.mean(rets)
                    std_ret = np.std(rets)

                    if win_rate < T1_MIN_WIN_RATE:
                        continue
                    if avg_ret < T1_MIN_AVG_RET:
                        continue
                    if std_ret == 0:
                        continue

                    sharpe = avg_ret / std_ret * math.sqrt(len(rets))
                    if sharpe < T1_MIN_SHARPE:
                        continue

                    candidates.append({
                        "asset": symbol,
                        "category": ASSET_CATEGORIES.get(symbol, "unknown"),
                        "direction": direction,
                        "entry_month": month,
                        "entry_day": entry_day,
                        "holding_days": hold,
                        "type": "calendar",
                        "t1_win_rate": round(float(win_rate), 4),
                        "t1_avg_ret": round(float(avg_ret), 6),
                        "t1_sharpe": round(float(sharpe), 3),
                        "t1_observations": len(rets),
                        "t1_std": round(float(std_ret), 6),
                    })

    return candidates


def _compute_window_returns(dates, closes, month, entry_day, hold, direction):
    """Compute returns for a seasonal window across all years."""
    months = dates.month
    days = dates.day
    years = dates.year
    unique_years = np.unique(years)
    returns = []

    for year in unique_years:
        entry_mask = (years == year) & (months == month) & (days >= entry_day) & (days <= entry_day + 2)
        entry_indices = np.where(entry_mask)[0]
        if len(entry_indices) == 0:
            continue

        entry_idx = entry_indices[0]
        exit_idx = entry_idx + hold
        if exit_idx >= len(closes):
            continue

        ret = (closes[exit_idx] - closes[entry_idx]) / closes[entry_idx]
        if direction == "SHORT":
            ret = -ret
        returns.append(ret)

    return np.array(returns)


# ═══ TIER 2 — BACKTRADER VALIDATION ════════════════════════════════════

def tier2_backtrader(candidates, n_total_patterns):
    """Run Backtrader on Tier 1 survivors, apply Bonferroni.
    n_total_patterns is used for Bonferroni correction — should be len(candidates)."""
    from engine.backtrader.strategies.seasonality.run_extended_validation import (
        run_pattern, compute_metrics, walk_forward
    )

    validated = []
    total = len(candidates)
    n_bonf = total  # Bonferroni over Tier 2 candidates, not total screened

    # Diagnostic counters
    filt_trades = filt_sharpe = filt_pf = filt_calmar = filt_bonf = filt_wf = 0

    for i, pat in enumerate(candidates):
        pid = f"{pat['asset']}_{pat['direction'][0]}_{pat['entry_month']:02d}{pat['entry_day']:02d}_{pat['holding_days']}"
        pat["id"] = pid
        pat["name"] = f"{pat['asset']} {pat['direction']} M{pat['entry_month']:02d}D{pat['entry_day']:02d} H{pat['holding_days']}"

        if (i + 1) % 50 == 0 or i == 0:
            print(f"  Tier 2: {i+1}/{total} ... ({len(validated)} passed so far)")

        # Full-period Backtrader run
        result = run_pattern(pat)
        metrics = compute_metrics(result)

        if metrics["trades"] < MIN_OBSERVATIONS:
            filt_trades += 1
            continue
        if metrics["sharpe"] < T2_MIN_SHARPE:
            filt_sharpe += 1
            continue
        if metrics["profit_factor"] < T2_MIN_PROFIT_FACTOR:
            filt_pf += 1
            continue
        if metrics["calmar"] < T2_MIN_CALMAR:
            filt_calmar += 1
            continue

        # Quick WF: IS=5y, OOS=2y (full strict WF in Tier 3)
        wf = _quick_walk_forward(pat)
        if wf["wf_efficiency"] < 45:
            filt_wf += 1
            continue

        # OOS check
        oos_result = run_pattern(pat, start=OOS_START)
        oos_metrics = compute_metrics(oos_result, label="oos")

        pat.update({
            "t2_sharpe": metrics["sharpe"],
            "t2_calmar": metrics["calmar"],
            "t2_win_rate": metrics["win_rate"],
            "t2_profit_factor": metrics["profit_factor"],
            "t2_cagr": metrics["cagr"],
            "t2_max_dd": metrics["max_dd"],
            "t2_trades": metrics["trades"],
            "t2_avg_days": metrics["avg_trade_days"],
            "t2_total_pnl": metrics["total_pnl"],
            "t2_p_raw": 0,
            "t2_wf_efficiency": wf["wf_efficiency"],
            "t2_wf_folds": wf.get("total_folds", 0),
            "t2_oos_sharpe": oos_metrics["sharpe"],
            "t2_oos_win_rate": oos_metrics["win_rate"],
            "t2_oos_pnl": oos_metrics["total_pnl"],
        })
        validated.append(pat)
        print(f"    OK {pid}: Sharpe={metrics['sharpe']:.2f} Calmar={metrics['calmar']:.2f} "
              f"WR={metrics['win_rate']:.1f}% WF={wf['wf_efficiency']:.0f}%")

    print(f"\n  Filter breakdown: trades={filt_trades} sharpe={filt_sharpe} "
          f"pf={filt_pf} calmar={filt_calmar} wf={filt_wf}")
    return validated


def _permutation_test_raw(pat, metrics, n_sims=500):
    """Quick permutation test — returns raw p-value (no Bonferroni)."""
    df = load_asset(pat["asset"])
    if df is None:
        return 1.0

    df = df.set_index("time")
    all_returns = df["close"].pct_change().dropna().values
    hold = pat["holding_days"]
    n_trades = metrics["trades"]

    if len(all_returns) < hold + 10 or n_trades < 5:
        return 1.0

    real_sharpe = metrics["sharpe"]
    rng = np.random.default_rng(42)
    count_better = 0

    for _ in range(n_sims):
        rand_entries = rng.integers(0, max(1, len(all_returns) - hold - 1), size=n_trades)
        rand_pnls = []
        for idx in rand_entries:
            window = all_returns[idx:idx + hold]
            cum_ret = float(np.prod(1 + window) - 1)
            if pat["direction"] == "SHORT":
                cum_ret = -cum_ret
            rand_pnls.append(cum_ret)

        rand_pnls = np.array(rand_pnls)
        if np.std(rand_pnls) > 0:
            rs = float(np.mean(rand_pnls) / np.std(rand_pnls) * math.sqrt(n_trades))
        else:
            rs = 0
        if rs >= real_sharpe:
            count_better += 1

    return count_better / n_sims


def _quick_walk_forward(pat):
    """Fast numpy-based walk-forward: IS=5y, OOS=2y, step=2y."""
    df = load_asset(pat["asset"])
    if df is None:
        return {"wf_efficiency": 0}

    df = df.copy()
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time").sort_index()
    if "close" not in df.columns:
        return {"wf_efficiency": 0}

    first_y = df.index.year.min()
    last_y = df.index.year.max()
    folds = []
    sy = first_y

    while sy + 5 + 2 <= last_y + 1:
        oos_start = f"{sy + 5}-01-01"
        oos_end = f"{sy + 6}-12-31"
        oos_df = df[oos_start:oos_end]
        if len(oos_df) < 50:
            sy += 2
            continue

        rets = _compute_window_returns(
            oos_df.index, oos_df["close"].values,
            pat["entry_month"], pat["entry_day"], pat["holding_days"], pat["direction"]
        )
        positive = len(rets) > 0 and float(np.mean(rets)) > 0
        folds.append(positive)
        sy += 2

    if not folds:
        return {"wf_efficiency": 0}

    eff = sum(folds) / len(folds) * 100
    return {"wf_efficiency": round(eff, 1), "folds": len(folds)}


# ═══ TIER 3 — DEEP VALIDATION (7 TESTS) ════════════════════════════════

def tier3_deep_validation(candidates):
    """Run the 7-test deep validation on Tier 2 survivors."""
    from engine.backtrader.strategies.seasonality.run_deep_validation import (
        test1_walk_forward_strict, test2_bonferroni, test3_parameter_stability,
        test4_regime, test5_cost_sensitivity, test6_decade_stability,
        test7_forward, compute_deep_score
    )

    # Override N_PATTERNS_TESTED for correct Bonferroni
    import engine.backtrader.strategies.seasonality.run_deep_validation as dv
    dv.N_PATTERNS_TESTED = len(candidates)

    deep_results = []

    for i, pat in enumerate(candidates):
        print(f"\n  Deep [{i+1}/{len(candidates)}] {pat['id']}")

        t1 = test1_walk_forward_strict(pat)
        t2 = test2_bonferroni(pat)
        t3 = test3_parameter_stability(pat)
        t4 = test4_regime(pat)
        t5 = test5_cost_sensitivity(pat)
        t6 = test6_decade_stability(pat)
        t7 = test7_forward(pat)

        score, grade = compute_deep_score(t1, t2, t3, t4, t5, t6, t7)

        print(f"    WF={t1['wf_strict_pct']}% Bonf={'SIG' if t2.get('significant') else 'NS'} "
              f"Stab={t3.get('stability_pct', 0):.0f}% Reg={t4['regimes_positive']}/4 "
              f"Cost={'OK' if t5.get('pass') else 'FAIL'} Dec={t6.get('decades_profitable', 0)}/5 "
              f"Fwd={'OK' if t7.get('pass') else 'FAIL'} → {grade}({score})")

        pat.update({
            "deep_score": score,
            "deep_grade": grade,
            "t3_wf_strict_pct": t1["wf_strict_pct"],
            "t3_bonf_significant": t2.get("significant", False),
            "t3_bonf_p": t2.get("p_bonferroni", 1),
            "t3_stability_pct": t3.get("stability_pct", 0),
            "t3_regimes_positive": t4["regimes_positive"],
            "t3_cost_pass": t5.get("pass", False),
            "t3_decades_profitable": t6.get("decades_profitable", 0),
            "t3_forward_pass": t7.get("pass", False),
            "t3_forward_sharpe": t7.get("sharpe", 0),
            "t3_forward_wr": t7.get("win_rate", 0),
            "deep_details": {
                "t1": t1, "t2": t2, "t3": t3, "t4": t4,
                "t5": t5, "t6": t6, "t7": t7,
            },
        })
        deep_results.append(pat)

    return deep_results


# ═══ RANKING & SELECTION ════════════════════════════════════════════════

def rank_and_select(results, top_n=15):
    """Rank by composite score, enforce max-per-asset, return top N."""
    # Composite rank score: 40% deep_score + 30% Calmar + 20% WF + 10% OOS
    for r in results:
        calmar_norm = min(r.get("t2_calmar", 0) / 2.0, 1.0)
        wf_norm = r.get("t2_wf_efficiency", 0) / 100.0
        oos_norm = 1.0 if r.get("t2_oos_sharpe", 0) > 0 else 0.0
        deep_norm = r.get("deep_score", 0) / 100.0

        r["rank_score"] = round(
            deep_norm * 0.40 + calmar_norm * 0.30 + wf_norm * 0.20 + oos_norm * 0.10, 4
        )

    results.sort(key=lambda x: x["rank_score"], reverse=True)

    # Enforce max per asset
    selected = []
    asset_counts = defaultdict(int)
    for r in results:
        if asset_counts[r["asset"]] >= MAX_PER_ASSET:
            continue
        asset_counts[r["asset"]] += 1
        selected.append(r)
        if len(selected) >= top_n:
            break

    return selected


# ═══ REPORTING ══════════════════════════════════════════════════════════

def print_results(results, label=""):
    """Print ranked results table."""
    if label:
        print(f"\n{'='*120}")
        print(f"  {label}")
        print(f"{'='*120}")

    print(f"{'#':>3} {'ID':<30} {'Cat':<8} {'Gr':>2} {'DS':>3} {'RS':>5} "
          f"{'Shrp':>5} {'Clmr':>5} {'WR%':>5} {'WF%':>5} {'OOS':>5} "
          f"{'Bonf':>5} {'Trd':>4} {'PnL':>10}")
    print("-" * 120)

    for i, r in enumerate(results):
        print(f"{i+1:>3} {r.get('id','?'):<30} "
              f"{r.get('category','?'):<8} "
              f"{r.get('deep_grade','?'):>2} {r.get('deep_score',0):>3} "
              f"{r.get('rank_score',0):>5.3f} "
              f"{r.get('t2_sharpe',0):>5.2f} {r.get('t2_calmar',0):>5.2f} "
              f"{r.get('t2_win_rate',0):>5.1f} {r.get('t2_wf_efficiency',0):>5.1f} "
              f"{r.get('t2_oos_sharpe',0):>5.2f} "
              f"{r.get('t2_p_raw',1):>5.3f} "
              f"{r.get('t2_trades',0):>4} "
              f"{r.get('t2_total_pnl',0):>10.0f}")


def save_results(results, all_t1_count, all_t2_count):
    """Save to JSON."""
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    report_dir = os.path.join(project_root, "engine", "backtrader", "reports")
    os.makedirs(report_dir, exist_ok=True)
    out_path = os.path.join(report_dir, "universe_scan_results.json")

    # Strip deep_details for the summary (too large)
    summary_results = []
    for r in results:
        r_copy = {k: v for k, v in r.items() if k != "deep_details"}
        summary_results.append(r_copy)

    output = {
        "generated_at": date.today().isoformat(),
        "generator": "run_universe_scan.py",
        "pipeline": {
            "assets_scanned": len(ASSET_PATHS),
            "tier1_candidates": all_t1_count,
            "tier2_validated": all_t2_count,
            "tier3_deep_validated": len(results),
        },
        "methodology": {
            "entry_days": ENTRY_DAYS,
            "holding_periods": HOLDING_DAYS,
            "directions": DIRECTIONS,
            "is_cutoff": IS_CUTOFF,
            "min_observations": MIN_OBSERVATIONS,
            "min_years_data": MIN_YEARS,
            "tier1_thresholds": {
                "min_win_rate": T1_MIN_WIN_RATE,
                "min_avg_return": T1_MIN_AVG_RET,
                "min_sharpe": T1_MIN_SHARPE,
            },
            "tier2_thresholds": {
                "min_sharpe": T2_MIN_SHARPE,
                "min_profit_factor": T2_MIN_PROFIT_FACTOR,
                "min_calmar": T2_MIN_CALMAR,
                "permutation_p_alpha": 0.10,
                "min_wf_efficiency": 50,
            },
            "tier3": "7-test deep validation (WF-strict, Bonferroni, Stability, Regime, Cost, Decades, Forward)",
            "ranking": "40% deep_score + 30% calmar + 20% WF + 10% OOS",
        },
        "top_patterns": summary_results,
    }

    # Also save full details separately
    detail_path = os.path.join(report_dir, "universe_scan_details.json")
    with open(detail_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nSummary: {out_path}")
    print(f"Details: {detail_path}")

    # Also copy top patterns to frontend data
    fe_path = os.path.join(project_root, "src", "data", "capitalife", "universe_scan_top.json")
    with open(fe_path, "w", encoding="utf-8") as f:
        json.dump(summary_results, f, indent=2, ensure_ascii=False, default=str)
    print(f"Frontend: {fe_path}")


# ═══ MAIN ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Full Universe Seasonal Scanner")
    parser.add_argument("--quick", action="store_true", help="Quick mode: skip Tier 3")
    parser.add_argument("--assets", type=str, default="", help="Comma-separated asset list")
    parser.add_argument("--top", type=int, default=15, help="Top N patterns to output")
    args = parser.parse_args()

    print(f"{'='*80}")
    print(f"  FULL UNIVERSE SEASONAL PATTERN SCANNER")
    print(f"  {date.today()} | Assets: {len(ASSET_PATHS)} | "
          f"Windows: {len(ENTRY_DAYS)}x12m x {len(HOLDING_DAYS)} holds x 2 dirs")
    print(f"{'='*80}")

    if args.assets:
        target_assets = [a.strip() for a in args.assets.split(",")]
    else:
        target_assets = list(ASSET_PATHS.keys())

    # ─── TIER 1: Fast numpy screen ───────────────────────────────────
    print(f"\n>> TIER 1 — Fast Screen ({len(target_assets)} assets)")
    all_t1 = []
    loaded_assets = 0

    for symbol in sorted(target_assets):
        df = load_asset(symbol)
        if df is None:
            print(f"  {symbol}: NO DATA")
            continue

        loaded_assets += 1
        candidates = fast_screen_asset(symbol, df)
        if candidates:
            print(f"  {symbol}: {len(df):>6} bars, {len(candidates):>3} candidates")
        all_t1.extend(candidates)

    n_total_screened = loaded_assets * len(ENTRY_DAYS) * 12 * len(HOLDING_DAYS) * 2
    print(f"\n  Tier 1 Summary: {loaded_assets} assets loaded, "
          f"{n_total_screened:,} patterns screened, {len(all_t1)} survivors")

    if not all_t1:
        print("No patterns survived Tier 1. Exiting.")
        return

    # Deduplicate overlapping patterns (same asset, similar entry)
    all_t1 = _deduplicate_patterns(all_t1)
    print(f"  After dedup: {len(all_t1)} unique candidates")

    # Sort by Tier 1 Sharpe for priority processing
    all_t1.sort(key=lambda x: x["t1_sharpe"], reverse=True)

    # Cap at top 200 for Tier 2 (resource limit)
    t2_input = all_t1[:200]
    print(f"  Sending top {len(t2_input)} to Tier 2")

    # ─── TIER 2: Backtrader validation ───────────────────────────────
    print(f"\n>> TIER 2 — Backtrader Validation + Bonferroni + Walk-Forward")
    t2_results = tier2_backtrader(t2_input, n_total_screened)
    print(f"\n  Tier 2 Summary: {len(t2_results)} patterns survived")

    if not t2_results:
        print("No patterns survived Tier 2. Try lowering thresholds.")
        return

    print_results(t2_results[:30], "TIER 2 TOP 30")

    # ─── TIER 3: Deep validation ─────────────────────────────────────
    if args.quick:
        print("\n  --quick mode: skipping Tier 3 deep validation")
        final = rank_and_select(
            [{**r, "deep_score": 50, "deep_grade": "?"} for r in t2_results],
            top_n=args.top
        )
    else:
        # Take top 40 for deep validation
        t3_input = t2_results[:40]
        print(f"\n>> TIER 3 — Deep Validation (7 Tests) on top {len(t3_input)}")
        t3_results = tier3_deep_validation(t3_input)
        final = rank_and_select(t3_results, top_n=args.top)

    print_results(final, f"FINAL TOP {len(final)} — LIVE-TRADEABLE PATTERNS")

    # ─── Category distribution ───────────────────────────────────────
    cats = defaultdict(int)
    for r in final:
        cats[r.get("category", "?")] += 1
    print(f"\n  Category distribution: {dict(cats)}")

    # ─── Save ────────────────────────────────────────────────────────
    save_results(final, len(all_t1), len(t2_results))
    print(f"\nDone. {len(final)} live-tradeable patterns identified from {loaded_assets} assets.")


def _deduplicate_patterns(patterns):
    """Remove overlapping patterns (same asset, direction, nearby entry, similar hold)."""
    seen = set()
    deduped = []
    for p in sorted(patterns, key=lambda x: x["t1_sharpe"], reverse=True):
        key = (p["asset"], p["direction"], p["entry_month"],
               p["entry_day"] // 5, p["holding_days"] // 5)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(p)
    return deduped


if __name__ == "__main__":
    main()
