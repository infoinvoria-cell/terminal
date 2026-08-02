"""
Rigorous re-validation of universe scan patterns.
Checks:
1. 20+ year history requirement
2. Rolling walk-forward (not just anchored expanding)
3. Parameter robustness (entry +-3d, hold +-5d)
4. Outlier analysis — no single year or decade driving returns
5. Median vs mean return comparison
6. Skewness check
7. Final verdict with honest grading
"""
import sys
import os
import json
import numpy as np
from datetime import datetime, timedelta

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from engine.backtrader.strategies.seasonality.run_extended_validation import (
    run_pattern, compute_metrics
)


def get_yearly_returns(asset, direction, entry_month, entry_day, holding_days):
    """Get individual year returns for the pattern."""
    pat = {
        "asset": asset, "direction": direction,
        "entry_month": entry_month, "entry_day": entry_day,
        "holding_days": holding_days, "type": "calendar",
    }
    try:
        result = run_pattern(pat)
        if not result:
            return {}, {}
        trades = result.get("trades", [])
        yearly = {}
        for t in trades:
            dt = t.get("dtopen")
            if dt is None:
                continue
            yr = str(dt.year) if hasattr(dt, 'year') else str(dt)[:4]
            pnl_pct = t.get("pnlcomm", 0) / 100000.0
            yearly[yr] = pnl_pct
        return yearly, result
    except Exception as e:
        print(f"  ERROR: {e}")
        return {}, {}


def rolling_walk_forward(asset, direction, entry_month, entry_day, holding_days,
                         train_years=10, test_years=3, min_folds=3):
    """True rolling walk-forward with fixed window (not expanding)."""
    pat = {
        "asset": asset, "direction": direction,
        "entry_month": entry_month, "entry_day": entry_day,
        "holding_days": holding_days, "type": "calendar",
    }

    result = run_pattern(pat)
    if not result:
        return {"folds": 0, "positive_folds": 0, "pass": False, "details": []}
    trades = result.get("trades", [])
    if not trades:
        return {"folds": 0, "positive_folds": 0, "pass": False, "details": []}

    # Sort trades by year
    by_year = {}
    for t in trades:
        dt = t.get("dtopen")
        if dt is None:
            continue
        yr = dt.year if hasattr(dt, 'year') else int(str(dt)[:4])
        by_year[yr] = t.get("pnlcomm", 0) / 100000.0

    years = sorted(by_year.keys())
    if len(years) < train_years + test_years:
        return {"folds": 0, "positive_folds": 0, "pass": False,
                "reason": f"Only {len(years)} years, need {train_years + test_years}"}

    fold_details = []
    # Rolling: slide the window
    for start_idx in range(0, len(years) - train_years - test_years + 1, test_years):
        train_end = start_idx + train_years
        test_end = min(train_end + test_years, len(years))

        train_years_list = years[start_idx:train_end]
        test_years_list = years[train_end:test_end]

        if len(test_years_list) == 0:
            continue

        # IS metrics
        is_rets = [by_year[y] for y in train_years_list if y in by_year]
        is_sharpe = np.mean(is_rets) / max(np.std(is_rets), 1e-9) * np.sqrt(len(is_rets)) if is_rets else 0

        # OOS metrics
        oos_rets = [by_year[y] for y in test_years_list if y in by_year]
        oos_pnl = sum(oos_rets)
        oos_sharpe = np.mean(oos_rets) / max(np.std(oos_rets), 1e-9) * np.sqrt(len(oos_rets)) if len(oos_rets) > 1 else (1 if sum(oos_rets) > 0 else -1)
        oos_positive = oos_pnl > 0
        oos_wr = sum(1 for r in oos_rets if r > 0) / len(oos_rets) * 100 if oos_rets else 0

        fold_details.append({
            "train": f"{train_years_list[0]}-{train_years_list[-1]}",
            "test": f"{test_years_list[0]}-{test_years_list[-1]}",
            "is_sharpe": round(is_sharpe, 2),
            "oos_sharpe": round(oos_sharpe, 2),
            "oos_pnl_pct": round(oos_pnl * 100, 2),
            "oos_wr": round(oos_wr, 1),
            "oos_trades": len(oos_rets),
            "positive": oos_positive,
        })

    n_pos = sum(1 for f in fold_details if f["positive"])
    return {
        "folds": len(fold_details),
        "positive_folds": n_pos,
        "pct": round(n_pos / len(fold_details) * 100, 1) if fold_details else 0,
        "pass": n_pos >= len(fold_details) * 0.6 and len(fold_details) >= min_folds,
        "details": fold_details,
    }


def parameter_robustness(asset, direction, entry_month, entry_day, holding_days):
    """Test +-3 days entry, +-5 days holding. Report how many variants are profitable."""
    entry_shifts = [-3, -2, -1, 0, 1, 2, 3]
    hold_shifts = [-5, -3, 0, 3, 5]

    positive = 0
    total = 0
    details = []

    for es in entry_shifts:
        for hs in hold_shifts:
            new_day = entry_day + es
            new_hold = holding_days + hs
            if new_hold < 3 or new_day < 1 or new_day > 28:
                continue

            # Adjust month if day rolls
            m, d = entry_month, new_day
            if d > 28:
                d = d - 28
                m = m + 1 if m < 12 else 1

            pat = {
                "asset": asset, "direction": direction,
                "entry_month": m, "entry_day": d,
                "holding_days": new_hold, "type": "calendar",
            }
            try:
                result = run_pattern(pat)
                metrics = compute_metrics(result)
                is_pos = metrics["sharpe"] > 0 and metrics["total_pnl"] > 0
                positive += int(is_pos)
                total += 1
                if es == 0 and hs == 0:
                    details.append({"shift": "BASE", "sharpe": round(metrics["sharpe"], 2), "pnl": round(metrics["total_pnl"], 0)})
                elif abs(es) <= 1 and abs(hs) <= 3:
                    details.append({"shift": f"e{es:+d}h{hs:+d}", "sharpe": round(metrics["sharpe"], 2), "pnl": round(metrics["total_pnl"], 0)})
            except:
                total += 1

    return {
        "positive": positive,
        "total": total,
        "pct": round(positive / total * 100, 1) if total else 0,
        "robust": positive >= total * 0.7,
        "details": details[:10],
    }


def outlier_analysis(yearly_returns):
    """Check if returns are driven by outliers."""
    if not yearly_returns:
        return {"ok": False, "reason": "no data"}

    rets = list(yearly_returns.values())
    years = list(yearly_returns.keys())

    mean_ret = np.mean(rets)
    median_ret = np.median(rets)
    std_ret = np.std(rets)

    # Skewness
    skew = float(np.mean(((np.array(rets) - mean_ret) / max(std_ret, 1e-9)) ** 3)) if len(rets) > 2 else 0

    # Best/worst year
    best_idx = int(np.argmax(rets))
    worst_idx = int(np.argmin(rets))
    best_year = years[best_idx]
    worst_year = years[worst_idx]

    # Remove best year — is it still profitable?
    without_best = [r for i, r in enumerate(rets) if i != best_idx]
    still_profitable_without_best = np.mean(without_best) > 0 if without_best else False

    # Remove top 2 years
    sorted_rets = sorted(enumerate(rets), key=lambda x: x[1], reverse=True)
    without_top2 = [r for i, r in enumerate(rets) if i not in {sorted_rets[0][0], sorted_rets[1][0]}] if len(rets) > 2 else rets
    still_profitable_without_top2 = np.mean(without_top2) > 0 if without_top2 else False

    # Win rate
    wr = sum(1 for r in rets if r > 0) / len(rets) * 100

    # Median/mean ratio — if median << mean, outliers drive the average
    median_mean_ratio = median_ret / mean_ret if abs(mean_ret) > 1e-9 else 1

    # Concern flags
    outlier_concern = not still_profitable_without_best or median_mean_ratio < 0.5

    return {
        "n_years": len(rets),
        "win_rate": round(wr, 1),
        "mean_ret_pct": round(mean_ret * 100, 2),
        "median_ret_pct": round(median_ret * 100, 2),
        "std_pct": round(std_ret * 100, 2),
        "skewness": round(skew, 2),
        "best_year": best_year,
        "best_ret_pct": round(rets[best_idx] * 100, 2),
        "worst_year": worst_year,
        "worst_ret_pct": round(rets[worst_idx] * 100, 2),
        "median_mean_ratio": round(median_mean_ratio, 2),
        "profitable_without_best": still_profitable_without_best,
        "profitable_without_top2": still_profitable_without_top2,
        "outlier_concern": outlier_concern,
    }


def main():
    details_path = os.path.join(PROJECT_ROOT, "engine", "backtrader", "reports", "universe_scan_details.json")
    with open(details_path, "r", encoding="utf-8") as f:
        patterns = json.load(f)

    print(f"RE-VALIDATION OF {len(patterns)} PATTERNS")
    print(f"Criteria: 20+ years, rolling WF, parameter robust, no outlier-driven returns")
    print("=" * 80)

    results = []

    for i, pat in enumerate(patterns):
        pid = pat["id"]
        asset = pat["asset"]
        direction = pat["direction"]
        em = pat["entry_month"]
        ed = pat["entry_day"]
        hd = pat["holding_days"]

        print(f"\n{'='*80}")
        print(f"[{i+1}/{len(patterns)}] {pid}")
        print(f"  Asset: {asset}, Direction: {direction}, Entry: M{em}D{ed}, Hold: {hd}d")

        # 1. YEARLY RETURNS + OUTLIER ANALYSIS
        print(f"\n  1) Yearly Returns & Outlier Check...")
        yearly, raw_result = get_yearly_returns(asset, direction, em, ed, hd)
        outlier = outlier_analysis(yearly)

        n_years = outlier.get("n_years", 0)
        has_20y = n_years >= 20
        print(f"     History: {n_years} years {'OK' if has_20y else 'FAIL FAIL (<20y)'}")
        print(f"     Win Rate: {outlier.get('win_rate',0):.1f}%")
        print(f"     Mean: {outlier.get('mean_ret_pct',0):+.2f}%  Median: {outlier.get('median_ret_pct',0):+.2f}%  Ratio: {outlier.get('median_mean_ratio',0):.2f}")
        print(f"     Skewness: {outlier.get('skewness',0):.2f}")
        print(f"     Best: {outlier.get('best_year','')} ({outlier.get('best_ret_pct',0):+.2f}%)  Worst: {outlier.get('worst_year','')} ({outlier.get('worst_ret_pct',0):+.2f}%)")
        print(f"     Profitable w/o best year: {outlier.get('profitable_without_best',False)}")
        print(f"     Profitable w/o top 2 years: {outlier.get('profitable_without_top2',False)}")
        print(f"     Outlier concern: {'!! YES' if outlier.get('outlier_concern') else 'OK No'}")

        # 2. ROLLING WALK-FORWARD
        print(f"\n  2) Rolling Walk-Forward (10y train, 3y test)...")
        rwf = rolling_walk_forward(asset, direction, em, ed, hd)
        print(f"     Folds: {rwf['folds']}, Positive: {rwf['positive_folds']}, Rate: {rwf.get('pct',0):.0f}%")
        for fd in rwf.get("details", []):
            status = "OK" if fd["positive"] else "FAIL"
            print(f"     {status} Train {fd['train']} -> Test {fd['test']}: OOS Sharpe={fd['oos_sharpe']:.2f} PnL={fd['oos_pnl_pct']:+.1f}% WR={fd['oos_wr']:.0f}%")
        print(f"     Rolling WF Pass: {'OK' if rwf['pass'] else 'FAIL FAIL'}")

        # 3. PARAMETER ROBUSTNESS
        print(f"\n  3) Parameter Robustness (+-3d entry, +-5d hold)...")
        param = parameter_robustness(asset, direction, em, ed, hd)
        print(f"     Positive variants: {param['positive']}/{param['total']} ({param['pct']:.0f}%)")
        print(f"     Robust: {'OK' if param['robust'] else 'FAIL FAIL'}")

        # 4. FINAL VERDICT
        issues = []
        if not has_20y:
            issues.append("INSUFFICIENT_HISTORY")
        if outlier.get("outlier_concern"):
            issues.append("OUTLIER_DRIVEN")
        if not rwf.get("pass"):
            issues.append("ROLLING_WF_FAIL")
        if not param.get("robust"):
            issues.append("PARAMETER_FRAGILE")
        if not outlier.get("profitable_without_top2"):
            issues.append("TOP2_DEPENDENT")

        # Grading
        if not issues:
            grade = "A+"
        elif len(issues) == 1 and issues[0] in ("OUTLIER_DRIVEN",):
            grade = "A"
        elif len(issues) == 1:
            grade = "B"
        elif len(issues) == 2:
            grade = "C"
        else:
            grade = "D"

        # Override: if history < 15 years, max grade is C
        if n_years < 15:
            grade = max(grade, "D")
        elif n_years < 20:
            if grade in ("A+", "A"):
                grade = "B"

        verdict = "LIVE-TAUGLICH" if grade in ("A+", "A") else "BEOBACHTEN" if grade == "B" else "ABGELEHNT"

        print(f"\n  FINAL: Grade={grade}  Verdict={verdict}")
        if issues:
            print(f"  Issues: {', '.join(issues)}")

        results.append({
            "id": pid,
            "asset": asset,
            "direction": direction,
            "entry_month": em,
            "entry_day": ed,
            "holding_days": hd,
            "n_years": n_years,
            "has_20y": has_20y,
            "win_rate": outlier.get("win_rate", 0),
            "mean_ret_pct": outlier.get("mean_ret_pct", 0),
            "median_ret_pct": outlier.get("median_ret_pct", 0),
            "median_mean_ratio": outlier.get("median_mean_ratio", 0),
            "skewness": outlier.get("skewness", 0),
            "profitable_without_best": outlier.get("profitable_without_best", False),
            "profitable_without_top2": outlier.get("profitable_without_top2", False),
            "outlier_concern": outlier.get("outlier_concern", False),
            "rolling_wf_folds": rwf.get("folds", 0),
            "rolling_wf_positive": rwf.get("positive_folds", 0),
            "rolling_wf_pct": rwf.get("pct", 0),
            "rolling_wf_pass": rwf.get("pass", False),
            "rolling_wf_details": rwf.get("details", []),
            "param_positive": param.get("positive", 0),
            "param_total": param.get("total", 0),
            "param_pct": param.get("pct", 0),
            "param_robust": param.get("robust", False),
            "grade": grade,
            "verdict": verdict,
            "issues": issues,
            "outlier_details": outlier,
        })

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"{'ID':<25} {'Yrs':>4} {'WR%':>5} {'Med/Mn':>6} {'RWF':>5} {'Param':>6} {'Grade':>5} {'Verdict':<15}")
    print("-" * 80)
    for r in sorted(results, key=lambda x: ("A+" if x["grade"] == "A+" else x["grade"])):
        print(f"{r['id']:<25} {r['n_years']:>4} {r['win_rate']:>5.1f} {r['median_mean_ratio']:>6.2f} "
              f"{r['rolling_wf_pct']:>4.0f}% {r['param_pct']:>5.0f}% {r['grade']:>5} {r['verdict']:<15} "
              f"{'!! '+','.join(r['issues']) if r['issues'] else 'OK'}")

    # Save results
    out_path = os.path.join(PROJECT_ROOT, "engine", "backtrader", "reports", "revalidation_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nSaved: {out_path}")

    approved = [r for r in results if r["grade"] in ("A+", "A")]
    watch = [r for r in results if r["grade"] == "B"]
    rejected = [r for r in results if r["grade"] in ("C", "D")]
    print(f"\nApproved: {len(approved)}  |  Watch: {len(watch)}  |  Rejected: {len(rejected)}")


if __name__ == "__main__":
    main()
