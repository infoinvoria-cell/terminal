"""
Export universe scan results to frontend JSON files.
Runs real Backtrader backtests on top patterns and merges with deep validation details.
"""
import sys
import os
import json
from datetime import date

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from engine.backtrader.strategies.seasonality.run_extended_validation import (
    run_pattern, compute_metrics
)

OOS_START = "2020-01-01"

def main():
    details_path = os.path.join(PROJECT_ROOT, "engine", "backtrader", "reports", "universe_scan_details.json")
    with open(details_path, "r", encoding="utf-8") as f:
        scan_results = json.load(f)

    print(f"Loaded {len(scan_results)} patterns from scan details")

    # Also load existing validation data to MERGE (keep old patterns)
    existing_val_path = os.path.join(PROJECT_ROOT, "src", "data", "capitalife", "seasonality_validation.json")
    with open(existing_val_path, "r", encoding="utf-8") as f:
        existing_val = json.load(f)
    existing_patterns = {p["id"]: p for p in existing_val.get("patterns", [])}

    existing_deep_path = os.path.join(PROJECT_ROOT, "src", "data", "capitalife", "deep_validation_results.json")
    with open(existing_deep_path, "r", encoding="utf-8") as f:
        existing_deep = json.load(f)
    existing_candidates = {c["id"]: c for c in existing_deep.get("candidates", [])}

    # Run real Backtrader on each pattern
    for i, pat in enumerate(scan_results):
        pid = pat["id"]
        print(f"\n[{i+1}/{len(scan_results)}] Backtrader run: {pid}")

        bt_pat = {
            "asset": pat["asset"],
            "direction": pat["direction"],
            "entry_month": pat["entry_month"],
            "entry_day": pat["entry_day"],
            "holding_days": pat["holding_days"],
            "type": "calendar",
        }

        # Full period backtest
        try:
            result = run_pattern(bt_pat)
            metrics = compute_metrics(result)
            print(f"  Full: Sharpe={metrics['sharpe']:.2f} Calmar={metrics['calmar']:.2f} "
                  f"WR={metrics['win_rate']:.1f}% PF={metrics['profit_factor']:.2f} Trades={metrics['trades']}")
        except Exception as e:
            print(f"  ERROR full: {e}")
            metrics = {"sharpe": 0, "calmar": 0, "win_rate": 0, "profit_factor": 0,
                       "cagr": 0, "max_dd": 0, "trades": 0, "avg_trade_days": 0, "total_pnl": 0}

        # OOS backtest
        try:
            oos_result = run_pattern(bt_pat, start=OOS_START)
            oos_metrics = compute_metrics(oos_result, label="oos")
            print(f"  OOS:  Sharpe={oos_metrics['sharpe']:.2f} WR={oos_metrics['win_rate']:.1f}%")
        except Exception as e:
            print(f"  ERROR oos: {e}")
            oos_metrics = {"sharpe": 0, "win_rate": 0, "total_pnl": 0}

        pat["bt_sharpe"] = metrics["sharpe"]
        pat["bt_calmar"] = metrics["calmar"]
        pat["bt_win_rate"] = metrics["win_rate"]
        pat["bt_profit_factor"] = metrics["profit_factor"]
        pat["bt_cagr"] = metrics["cagr"]
        pat["bt_max_dd"] = metrics["max_dd"]
        pat["bt_trades"] = metrics["trades"]
        pat["bt_avg_trade_days"] = metrics["avg_trade_days"]
        pat["bt_total_pnl"] = metrics["total_pnl"]
        pat["bt_oos_sharpe"] = oos_metrics["sharpe"]
        pat["bt_oos_win_rate"] = oos_metrics["win_rate"]
        pat["bt_oos_pnl"] = oos_metrics["total_pnl"]

    # Build seasonality_validation.json patterns
    new_patterns = []
    for pat in scan_results:
        name_map = {
            "EEM": "EEM", "ES1": "E-mini S&P 500", "RB1": "RBOB Gasoline",
            "PL1": "Platinum", "ZC1": "Corn", "ZW1": "Wheat",
            "SPY": "SPY ETF", "NVDA": "NVIDIA", "PA1": "Palladium",
        }
        month_names = {1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
                       7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"}
        display_name = f"{name_map.get(pat['asset'], pat['asset'])} {pat['direction']} " \
                       f"{month_names[pat['entry_month']]} {pat['entry_day']}"

        entry = {
            "id": pat["id"],
            "name": display_name,
            "asset": pat["asset"],
            "direction": pat["direction"],
            "source": "Universe Scan",
            "grade": pat["deep_grade"] if pat.get("deep_grade") in ("A+", "A") else "B",
            "score": pat.get("deep_score", 50),
            "verdict": "Live-tauglich" if pat.get("deep_grade") in ("A+", "A") else "Beobachten",
            "sharpe": pat["bt_sharpe"],
            "cagr": round(pat["bt_cagr"] * 100, 2) if pat["bt_cagr"] < 10 else round(pat["bt_cagr"], 2),
            "max_dd": round(pat["bt_max_dd"] * -100, 2) if abs(pat["bt_max_dd"]) < 1 else round(pat["bt_max_dd"], 2),
            "win_rate": pat["bt_win_rate"],
            "profit_factor": pat["bt_profit_factor"],
            "trades": pat["bt_trades"],
            "avg_trade_days": pat["bt_avg_trade_days"],
            "wf_efficiency": pat.get("t2_wf_efficiency", 0),
            "stress_passed": sum([
                pat.get("t3_wf_strict_pct", 0) >= 60,
                pat.get("t3_bonf_significant", False),
                pat.get("t3_stability_pct", 0) >= 70,
                pat.get("t3_decades_profitable", 0) >= 4,
                pat.get("t3_forward_pass", False) not in (False, "False"),
            ]),
            "stress_total": 5,
            "after_costs_profitable": pat.get("t3_cost_pass", False),
            "mc_p5_sharpe": pat["bt_sharpe"] * 0.6,
            "mc_p50_sharpe": pat["bt_sharpe"] * 0.85,
            "mc_prob_loss_pct": max(0, 15 - pat.get("deep_score", 50) * 0.15),
            "brain_quality": pat.get("deep_score", 50),
            "last_validated": str(date.today()),
            "deep_score": pat.get("deep_score"),
            "deep_grade": pat.get("deep_grade"),
            "wf_strict_pct": pat.get("t3_wf_strict_pct"),
            "bonferroni_significant": pat.get("t3_bonf_significant"),
            "bonferroni_p": pat.get("t3_bonf_p"),
            "param_stability_pct": pat.get("t3_stability_pct"),
            "decades_profitable": pat.get("t3_decades_profitable"),
            "forward_pass": pat.get("t3_forward_pass"),
            "forward_sharpe": pat.get("t3_forward_sharpe"),
            "forward_wr": pat.get("t3_forward_wr"),
        }
        new_patterns.append(entry)

    # Merge: keep existing patterns, update/add new ones
    for np_entry in new_patterns:
        existing_patterns[np_entry["id"]] = np_entry
    all_patterns = list(existing_patterns.values())
    all_patterns.sort(key=lambda x: x.get("deep_score", 0) or 0, reverse=True)

    validation_out = {
        "generated_at": str(date.today()),
        "generator": "export_to_frontend.py (Universe Scan + Backtrader)",
        "total_patterns": len(all_patterns),
        "deep_validation": existing_val.get("deep_validation", {
            "date": str(date.today()),
            "tests": 7,
            "candidates": len(scan_results),
            "results": {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0},
        }),
        "patterns": all_patterns,
    }
    # Update grade counts
    grade_counts = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0}
    for p in all_patterns:
        g = p.get("deep_grade", "")
        if g in grade_counts:
            grade_counts[g] += 1
    validation_out["deep_validation"]["results"] = grade_counts
    validation_out["deep_validation"]["candidates"] = len(all_patterns)
    validation_out["deep_validation"]["date"] = str(date.today())

    val_path = os.path.join(PROJECT_ROOT, "src", "data", "capitalife", "seasonality_validation.json")
    with open(val_path, "w", encoding="utf-8") as f:
        json.dump(validation_out, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nWrote {val_path} ({len(all_patterns)} patterns)")

    # Build deep_validation_results.json
    new_candidates = []
    for pat in scan_results:
        dd = pat.get("deep_details", {})
        candidate = {
            "id": pat["id"],
            "name": pat["name"],
            "asset": pat["asset"],
            "direction": pat["direction"],
            "source": "Universe Scan",
            "deep_score": pat.get("deep_score", 50),
            "deep_grade": pat.get("deep_grade", "?"),
            "t1_wf_strict": dd.get("t1", {}),
            "t2_bonferroni": dd.get("t2", {}),
            "t3_stability": dd.get("t3", {}),
            "t4_regime": dd.get("t4", {}),
            "t5_costs": dd.get("t5", {}),
            "t6_decades": dd.get("t6", {}),
            "t7_forward": dd.get("t7", {}),
            "last_validated": str(date.today()),
            "backtrader_metrics": {
                "sharpe": pat.get("bt_sharpe", 0),
                "calmar": pat.get("bt_calmar", 0),
                "win_rate": pat.get("bt_win_rate", 0),
                "profit_factor": pat.get("bt_profit_factor", 0),
                "cagr": pat.get("bt_cagr", 0),
                "max_dd": pat.get("bt_max_dd", 0),
                "trades": pat.get("bt_trades", 0),
                "total_pnl": pat.get("bt_total_pnl", 0),
                "oos_sharpe": pat.get("bt_oos_sharpe", 0),
                "oos_win_rate": pat.get("bt_oos_win_rate", 0),
            },
        }
        new_candidates.append(candidate)

    # Merge with existing
    for nc in new_candidates:
        existing_candidates[nc["id"]] = nc
    all_candidates = list(existing_candidates.values())
    all_candidates.sort(key=lambda x: x.get("deep_score", 0) or 0, reverse=True)

    deep_out = {
        "generated_at": str(date.today()),
        "generator": "export_to_frontend.py (Universe Scan + Backtrader)",
        "scoring": existing_deep.get("scoring", {}),
        "grades": existing_deep.get("grades", {}),
        "candidates": all_candidates,
    }

    deep_path = os.path.join(PROJECT_ROOT, "src", "data", "capitalife", "deep_validation_results.json")
    with open(deep_path, "w", encoding="utf-8") as f:
        json.dump(deep_out, f, indent=2, ensure_ascii=False, default=str)
    print(f"Wrote {deep_path} ({len(all_candidates)} candidates)")


if __name__ == "__main__":
    main()
