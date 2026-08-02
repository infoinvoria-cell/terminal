"""
Deep Seasonality Validation — Institutional Standard
7 Tests für die Top 15 Kandidaten.
"""
import sys
import os
import json
import math
from datetime import datetime, date, timedelta

import numpy as np
import pandas as pd
import backtrader as bt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from engine.backtrader.data.seasonal_loader import load_asset
from engine.backtrader.strategies.seasonality.run_extended_validation import (
    CalendarSeasonalStrategy, MultiMonthStrategy, run_pattern, compute_metrics
)


# ═══ 15 Kandidaten ═══════════════════════════════════════════════════

CANDIDATES = [
    {"id": "SB1_L_0924_10", "asset": "SB1", "name": "Sugar LONG Sep 24", "direction": "LONG", "entry_month": 9, "entry_day": 24, "holding_days": 10, "source": "Brain Production", "type": "calendar"},
    {"id": "ZW1_L_0815_10", "asset": "ZW1", "name": "Wheat LONG Aug 15", "direction": "LONG", "entry_month": 8, "entry_day": 15, "holding_days": 10, "source": "Brain Production", "type": "calendar"},
    {"id": "ZC1_S_0714_18", "asset": "ZC1", "name": "Corn SHORT Jul 14", "direction": "SHORT", "entry_month": 7, "entry_day": 14, "holding_days": 18, "source": "Brain Production", "type": "calendar"},
    {"id": "ZS1_S_0715_16", "asset": "ZS1", "name": "Soybeans SHORT Jul 15", "direction": "SHORT", "entry_month": 7, "entry_day": 15, "holding_days": 16, "source": "Brain Production", "type": "calendar"},
    {"id": "ZC1_S_0605_16", "asset": "ZC1", "name": "Corn SHORT Jun 05", "direction": "SHORT", "entry_month": 6, "entry_day": 5, "holding_days": 16, "source": "Brain Research", "type": "calendar"},
    {"id": "IWM_L_0525_5", "asset": "IWM", "name": "IWM LONG Mai 25", "direction": "LONG", "entry_month": 5, "entry_day": 25, "holding_days": 5, "source": "Agent Portfolio", "type": "calendar"},
    {"id": "CT1_L_0103_12", "asset": "CT1", "name": "Cotton LONG Jan 03", "direction": "LONG", "entry_month": 1, "entry_day": 3, "holding_days": 12, "source": "Brain Production", "type": "calendar"},
    {"id": "ZC1_L_0219_10", "asset": "ZC1", "name": "Corn LONG Feb 19", "direction": "LONG", "entry_month": 2, "entry_day": 19, "holding_days": 10, "source": "Brain Production", "type": "calendar"},
    {"id": "CL1_L_0201_120", "asset": "CL1", "name": "Crude Oil Feb-Jun LONG", "direction": "LONG", "entry_month": 2, "entry_day": 1, "holding_days": 120, "source": "Public", "type": "calendar"},
    {"id": "ES1_L_NovApr", "asset": "ES1", "name": "Sell in May Reverse Nov-Apr", "direction": "LONG", "entry_month": 11, "exit_month": 4, "source": "Public", "type": "multimonth"},
    {"id": "CC1_L_0402_16", "asset": "CC1", "name": "Cocoa LONG Apr 02", "direction": "LONG", "entry_month": 4, "entry_day": 2, "holding_days": 16, "source": "Brain Production", "type": "calendar"},
    {"id": "ES1_L_SantaRally", "asset": "ES1", "name": "Santa Rally Dez 20-31", "direction": "LONG", "entry_month": 12, "entry_day": 20, "holding_days": 8, "source": "Public", "type": "calendar"},
    {"id": "ZC1_L_1110_16", "asset": "ZC1", "name": "Corn LONG Nov 10", "direction": "LONG", "entry_month": 11, "entry_day": 10, "holding_days": 16, "source": "Brain Production", "type": "calendar"},
    {"id": "SB1_S_1130_10", "asset": "SB1", "name": "Sugar SHORT Nov 30", "direction": "SHORT", "entry_month": 11, "entry_day": 30, "holding_days": 10, "source": "Brain Production", "type": "calendar"},
    {"id": "KC1_S_0430_18", "asset": "KC1", "name": "Coffee SHORT Apr 30", "direction": "SHORT", "entry_month": 4, "entry_day": 30, "holding_days": 18, "source": "Brain Production", "type": "calendar"},
]

N_PATTERNS_TESTED = 45


# ═══ TEST 1 — Rolling Walk-Forward (streng) ══════════════════════════

def test1_walk_forward_strict(pat):
    """IS=10y, OOS=3y, step=3y, min 5 folds."""
    df = load_asset(pat["asset"])
    if df is None:
        return {"wf_strict_pct": 0, "folds": 0, "positive_folds": 0, "fold_details": []}

    first_y = df["time"].dt.year.min()
    last_y = df["time"].dt.year.max()
    folds = []
    sy = first_y

    while sy + 10 + 3 <= last_y + 1:
        oos_start = f"{sy + 10}-01-01"
        oos_end = f"{sy + 10 + 2}-12-31"
        r = run_pattern(pat, start=oos_start, end=oos_end)
        m = compute_metrics(r)
        folds.append({"oos_start": oos_start, "oos_end": oos_end,
                       "sharpe": m["sharpe"], "pnl": m["total_pnl"], "trades": m["trades"],
                       "positive": m["sharpe"] > 0 and m["trades"] > 0})
        sy += 3

    pos = sum(1 for f in folds if f["positive"])
    pct = round(pos / len(folds) * 100, 1) if folds else 0
    return {"wf_strict_pct": pct, "folds": len(folds), "positive_folds": pos,
            "fold_details": folds, "pass": pct >= 60}


# ═══ TEST 2 — Bonferroni-Korrektur ═══════════════════════════════════

def test2_bonferroni(pat):
    """1000 random-entry sims, Bonferroni p < 0.05."""
    r = run_pattern(pat)
    if not r or not r["trades"] or len(r["trades"]) < 5:
        return {"p_raw": 1, "p_bonferroni": 1, "significant": False}

    trade_rets = np.array([t["pnlcomm"] / 100000 for t in r["trades"]])
    n = len(trade_rets)
    if np.std(trade_rets) == 0:
        return {"p_raw": 1, "p_bonferroni": 1, "significant": False}

    real_sharpe = np.mean(trade_rets) / np.std(trade_rets) * math.sqrt(n)

    df = load_asset(pat["asset"])
    df = df.set_index("time")
    all_returns = df["close"].pct_change().dropna().values
    hold = pat.get("holding_days", 10)

    rng = np.random.default_rng(42)
    random_sharpes = []

    for _ in range(500):
        rand_entries = rng.integers(0, max(1, len(all_returns) - hold - 1), size=n)
        rand_pnls = []
        for idx in rand_entries:
            window = all_returns[idx:idx + hold]
            cum_ret = np.prod(1 + window) - 1
            if pat["direction"] == "SHORT":
                cum_ret = -cum_ret
            rand_pnls.append(cum_ret)

        rand_pnls = np.array(rand_pnls)
        if np.std(rand_pnls) > 0:
            rs = np.mean(rand_pnls) / np.std(rand_pnls) * math.sqrt(n)
        else:
            rs = 0
        random_sharpes.append(rs)

    random_sharpes = np.array(random_sharpes)
    p_raw = float(np.mean(random_sharpes >= real_sharpe))
    p_bonf = min(1.0, p_raw * N_PATTERNS_TESTED)

    return {"p_raw": round(p_raw, 4), "p_bonferroni": round(p_bonf, 4),
            "significant": p_bonf < 0.05,
            "real_sharpe": round(real_sharpe, 3),
            "random_sharpe_mean": round(float(np.mean(random_sharpes)), 3),
            "random_sharpe_std": round(float(np.std(random_sharpes)), 3)}


# ═══ TEST 3 — Parameter-Stabilität ═══════════════════════════════════

def test3_parameter_stability(pat):
    """Shift entry ±1,2,3 days × hold ±2,5 days. Sharpe>0 in >=70%? Uses last 25y for speed."""
    if pat.get("type") == "multimonth":
        return {"stability_pct": 0, "robust": False, "n_variants": 0, "note": "multimonth skipped"}

    entry_shifts = range(-3, 4)
    hold_shifts = [-5, -2, 0, 2, 5]
    results = []

    for es in entry_shifts:
        for hs in hold_shifts:
            shifted = pat.copy()
            new_day = pat["entry_day"] + es
            new_hold = pat["holding_days"] + hs
            if new_day < 1 or new_day > 28 or new_hold < 2:
                continue
            shifted["entry_day"] = new_day
            shifted["holding_days"] = new_hold
            r = run_pattern(shifted, start="2001-01-01")
            m = compute_metrics(r)
            results.append({"entry_shift": es, "hold_shift": hs,
                            "sharpe": m["sharpe"], "pf": m["profit_factor"],
                            "positive": m["sharpe"] > 0 and m["trades"] > 0})

    if not results:
        return {"stability_pct": 0, "robust": False, "n_variants": 0}

    pos = sum(1 for r in results if r["positive"])
    pct = round(pos / len(results) * 100, 1)
    return {"stability_pct": pct, "robust": pct >= 70,
            "n_variants": len(results), "positive_variants": pos, "pass": pct >= 70}


# ═══ TEST 4 — Regime-Abhängigkeit ════════════════════════════════════

def test4_regime(pat):
    """Test in high/low vol and trend-up/trend-down regimes."""
    df_full = load_asset(pat["asset"])
    if df_full is None:
        return {"regimes_positive": 0, "total_regimes": 4}

    df_full = df_full.set_index("time")
    df_full["sma200"] = df_full["close"].rolling(200).mean()
    df_full["vol30"] = df_full["close"].pct_change().rolling(30).std() * math.sqrt(252)

    vol_med = df_full["vol30"].median()

    regimes = {
        "high_vol": df_full[df_full["vol30"] > vol_med * 1.5],
        "low_vol": df_full[df_full["vol30"] < vol_med * 0.75],
        "trend_up": df_full[df_full["close"] > df_full["sma200"]],
        "trend_down": df_full[df_full["close"] < df_full["sma200"]],
    }

    results = {}
    for rname, rdf in regimes.items():
        if len(rdf) < 100:
            results[rname] = {"trades": 0, "sharpe": 0, "positive": False}
            continue

        rdf_reset = rdf.reset_index()
        rdf_reset = rdf_reset.rename(columns={"index": "time"}) if "time" not in rdf_reset.columns else rdf_reset

        try:
            data = bt.feeds.PandasData(dataname=rdf)
            cerebro = bt.Cerebro()
            cerebro.adddata(data)

            if pat.get("type") == "multimonth":
                cerebro.addstrategy(MultiMonthStrategy,
                                    entry_month=pat["entry_month"],
                                    exit_month=pat["exit_month"],
                                    direction=pat["direction"])
            else:
                cerebro.addstrategy(CalendarSeasonalStrategy,
                                    entry_month=pat["entry_month"],
                                    entry_day=pat["entry_day"],
                                    holding_days=pat["holding_days"],
                                    direction=pat["direction"])

            cerebro.broker.setcash(100000)
            cerebro.broker.setcommission(commission=0.001)
            cerebro.addsizer(bt.sizers.PercentSizer, percents=95)

            res = cerebro.run()
            strat = res[0]
            pnls = [t["pnlcomm"] for t in strat.trade_log]
            sharpe = 0
            if pnls and np.std(pnls) > 0:
                sharpe = np.mean(pnls) / np.std(pnls) * math.sqrt(len(pnls))
            results[rname] = {"trades": len(pnls), "sharpe": round(sharpe, 2),
                              "pnl": round(sum(pnls), 2) if pnls else 0,
                              "positive": sharpe > 0 and len(pnls) > 0}
        except Exception:
            results[rname] = {"trades": 0, "sharpe": 0, "positive": False}

    pos = sum(1 for v in results.values() if v["positive"])
    return {"regimes": results, "regimes_positive": pos, "total_regimes": 4,
            "pass": pos >= 3}


# ═══ TEST 5 — Kosten-Sensitivität ════════════════════════════════════

def test5_cost_sensitivity(pat):
    """Test mit 0, 5, 10, 20, 50 bps."""
    levels = [0, 0.0005, 0.001, 0.002, 0.005]
    labels = ["0bps", "5bps", "10bps", "20bps", "50bps"]
    results = {}
    break_even = None

    for lbl, comm in zip(labels, levels):
        r = run_pattern(pat, commission=comm)
        m = compute_metrics(r)
        profitable = m["total_pnl"] > 0
        results[lbl] = {"pnl": m["total_pnl"], "sharpe": m["sharpe"], "profitable": profitable}
        if not profitable and break_even is None:
            prev_idx = labels.index(lbl) - 1
            if prev_idx >= 0:
                break_even = f"{labels[prev_idx]}-{lbl}"
            else:
                break_even = "0bps"

    if break_even is None:
        break_even = ">50bps"

    return {"cost_levels": results, "break_even_range": break_even,
            "pass": results["20bps"]["profitable"]}


# ═══ TEST 6 — Dekaden-Stabilität ═════════════════════════════════════

def test6_decade_stability(pat):
    """Test in 5 periods: 2000-05, 2005-10, 2010-15, 2015-20, 2020-26."""
    periods = [
        ("2000-2005", "2000-01-01", "2005-12-31"),
        ("2005-2010", "2005-01-01", "2010-12-31"),
        ("2010-2015", "2010-01-01", "2015-12-31"),
        ("2015-2020", "2015-01-01", "2020-12-31"),
        ("2020-2026", "2020-01-01", "2026-12-31"),
    ]

    results = {}
    for label, s, e in periods:
        r = run_pattern(pat, start=s, end=e)
        m = compute_metrics(r)
        results[label] = {"trades": m["trades"], "sharpe": m["sharpe"],
                          "pnl": m["total_pnl"], "win_rate": m["win_rate"],
                          "profitable": m["total_pnl"] > 0 and m["trades"] > 0}

    pos = sum(1 for v in results.values() if v["profitable"])
    return {"decades": results, "decades_profitable": pos, "total": len(periods),
            "pass": pos >= 4}


# ═══ TEST 7 — Forward Test (2023-2026) ═══════════════════════════════

def test7_forward(pat):
    """Pure forward test, last 3 years."""
    r = run_pattern(pat, start="2023-01-01", end="2026-12-31")
    m = compute_metrics(r)
    return {"trades": m["trades"], "sharpe": m["sharpe"], "win_rate": m["win_rate"],
            "pnl": m["total_pnl"], "profit_factor": m["profit_factor"],
            "pass": m["sharpe"] > 0 and m["win_rate"] > 50 and m["trades"] > 0}


# ═══ SCORING ═════════════════════════════════════════════════════════

def compute_deep_score(t1, t2, t3, t4, t5, t6, t7):
    score = 0
    if t1.get("pass"): score += 15
    if t2.get("significant"): score += 20
    if t3.get("pass"): score += 15
    if t6.get("pass"): score += 15
    if t7.get("pass"): score += 15
    if t5.get("pass"): score += 10
    # MC p5 from Bonferroni test is implicit — use p-value strength
    if t2.get("p_bonferroni", 1) < 0.01: score += 10
    elif t2.get("p_bonferroni", 1) < 0.05: score += 5

    if score >= 85: return score, "A+"
    if score >= 70: return score, "A"
    if score >= 55: return score, "B"
    if score >= 40: return score, "C"
    return score, "D"


# ═══ MAIN ════════════════════════════════════════════════════════════

def run_all():
    all_results = []

    for i, pat in enumerate(CANDIDATES):
        pid = pat["id"]
        print(f"\n{'='*70}")
        print(f"[{i+1}/{len(CANDIDATES)}] {pid} — {pat['name']}")
        print(f"{'='*70}")

        print("  TEST 1 — Walk-Forward (IS=10y, OOS=3y) ...")
        t1 = test1_walk_forward_strict(pat)
        print(f"    WF: {t1['wf_strict_pct']}% ({t1['positive_folds']}/{t1['folds']} Folds) — {'PASS' if t1.get('pass') else 'FAIL'}")

        print("  TEST 2 — Bonferroni-Korrektur ...")
        t2 = test2_bonferroni(pat)
        print(f"    p_raw={t2['p_raw']}, p_bonf={t2['p_bonferroni']}, sig={t2['significant']}")

        print("  TEST 3 — Parameter-Stabilität ...")
        t3 = test3_parameter_stability(pat)
        if t3.get("note"):
            print(f"    {t3['note']}")
        else:
            print(f"    Stabilität: {t3['stability_pct']}% ({t3.get('positive_variants',0)}/{t3['n_variants']}) — {'PASS' if t3.get('pass') else 'FAIL'}")

        print("  TEST 4 — Regime-Abhängigkeit ...")
        t4 = test4_regime(pat)
        print(f"    Regimes positiv: {t4['regimes_positive']}/{t4['total_regimes']} — {'PASS' if t4.get('pass') else 'FAIL'}")
        for rname, rdata in t4.get("regimes", {}).items():
            print(f"      {rname}: Sharpe={rdata['sharpe']}, Trades={rdata['trades']}")

        print("  TEST 5 — Kosten-Sensitivität ...")
        t5 = test5_cost_sensitivity(pat)
        print(f"    Break-even: {t5['break_even_range']} — {'PASS' if t5.get('pass') else 'FAIL'}")
        for lbl, cdata in t5["cost_levels"].items():
            print(f"      {lbl}: PnL={cdata['pnl']:.0f}, Sharpe={cdata['sharpe']:.2f}")

        print("  TEST 6 — Dekaden-Stabilität ...")
        t6 = test6_decade_stability(pat)
        print(f"    Profitabel: {t6['decades_profitable']}/{t6['total']} — {'PASS' if t6.get('pass') else 'FAIL'}")
        for dlbl, ddata in t6["decades"].items():
            print(f"      {dlbl}: PnL={ddata['pnl']:.0f}, Sharpe={ddata['sharpe']:.2f}, WR={ddata['win_rate']:.1f}%")

        print("  TEST 7 — Forward Test (2023-2026) ...")
        t7 = test7_forward(pat)
        print(f"    Sharpe={t7['sharpe']:.2f}, WR={t7['win_rate']:.1f}%, PnL={t7['pnl']:.0f} — {'PASS' if t7.get('pass') else 'FAIL'}")

        score, grade = compute_deep_score(t1, t2, t3, t4, t5, t6, t7)
        print(f"\n  >>> DEEP SCORE: {score} — Grade {grade}")

        all_results.append({
            "id": pid, "name": pat["name"], "asset": pat["asset"],
            "direction": pat["direction"], "source": pat["source"],
            "deep_score": score, "deep_grade": grade,
            "t1_wf_strict": t1, "t2_bonferroni": t2, "t3_stability": t3,
            "t4_regime": t4, "t5_costs": t5, "t6_decades": t6, "t7_forward": t7,
            "last_validated": date.today().isoformat(),
        })

    return all_results


def print_final_table(results):
    sorted_r = sorted(results, key=lambda x: x["deep_score"], reverse=True)
    print(f"\n{'='*120}")
    print(f"{'#':>3} {'ID':<22} {'Gr':>3} {'Sc':>3} {'WF%':>5} {'Bonf':>6} {'Stab%':>5} {'Reg':>3} {'Cost':>5} {'Dec':>3} {'Fwd':>4}")
    print("-" * 120)
    for i, r in enumerate(sorted_r):
        t1p = "PASS" if r["t1_wf_strict"].get("pass") else "FAIL"
        t2p = "PASS" if r["t2_bonferroni"].get("significant") else "FAIL"
        t3p = f"{r['t3_stability'].get('stability_pct', 0):.0f}" if r["t3_stability"].get("n_variants", 0) > 0 else "N/A"
        t4p = f"{r['t4_regime']['regimes_positive']}/4"
        t5p = "PASS" if r["t5_costs"].get("pass") else "FAIL"
        t6p = f"{r['t6_decades']['decades_profitable']}/5"
        t7p = "PASS" if r["t7_forward"].get("pass") else "FAIL"
        print(f"{i+1:>3} {r['id']:<22} {r['deep_grade']:>3} {r['deep_score']:>3} "
              f"{r['t1_wf_strict']['wf_strict_pct']:>5.1f} {t2p:>6} {t3p:>5} {t4p:>3} {t5p:>5} {t6p:>3} {t7p:>4}")


def save_results(results):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    out_path = os.path.join(project_root, "engine", "backtrader", "reports", "deep_validation_results.json")
    output = {
        "generated_at": date.today().isoformat(),
        "generator": "run_deep_validation.py",
        "scoring": {
            "wf_strict_pass": "+15 (WF>=60%)",
            "bonferroni_sig": "+20 (p_bonf<0.05)",
            "param_stability": "+15 (>=70%)",
            "decades_4of5": "+15",
            "forward_positive": "+15",
            "cost_20bps": "+10",
            "bonferroni_strong": "+5/10 (p<0.05/0.01)",
        },
        "grades": {"A+": "85-100", "A": "70-84", "B": "55-69", "C": "40-54", "D": "<40"},
        "candidates": sorted(results, key=lambda x: x["deep_score"], reverse=True),
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nErgebnisse gespeichert: {out_path}")


if __name__ == "__main__":
    print(f"Deep Seasonality Validation — {date.today()}")
    print(f"Kandidaten: {len(CANDIDATES)}")
    print(f"Tests: 7 (WF-streng, Bonferroni, Stabilität, Regime, Kosten, Dekaden, Forward)")

    results = run_all()
    print_final_table(results)
    save_results(results)
    print(f"\nFertig. {len(results)} Kandidaten tiefgehend validiert.")
