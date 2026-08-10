"""
White Swan Gold Friday v3 — Roll-Independence Final Test
Pure falsification exercise. No optimization, no new parameters.
Generated: 2026-08-10
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import glob as glob_module
import os
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone
import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np

# ─── PATHS ───────────────────────────────────────────────────────────────────
DATA_PATH = r"C:\Users\joris\Downloads\GC1_60m_combined.csv"
OUT_DIR   = r"C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\reports"
SCRIPT_DIR= r"C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\strategies\white_swan"

# ─── LOAD DATA ────────────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv(DATA_PATH)
df['time'] = pd.to_datetime(df['time'], utc=True)
df = df.sort_values('time').reset_index(drop=True)
print(f"  Rows: {len(df)}, from {df['time'].iloc[0]} to {df['time'].iloc[-1]}")

# ─── ATR14 (Wilder RMA ewm alpha=1/14, adjust=False) ─────────────────────────
df['tr'] = np.maximum(
    df['high'] - df['low'],
    np.maximum(
        abs(df['high'] - df['close'].shift(1)),
        abs(df['low']  - df['close'].shift(1))
    )
)
df['atr14'] = df['tr'].ewm(alpha=1/14, adjust=False).mean()

# ─── CORE BACKTEST ────────────────────────────────────────────────────────────
print("Running backtest...")
df['weekday']  = df['time'].dt.weekday   # Mon=0 ... Fri=4
df['hour_utc'] = df['time'].dt.hour
df['year']     = df['time'].dt.year
df['week']     = df['time'].dt.isocalendar().week.astype(int)
df['year_week']= df['year'].astype(str) + '_' + df['week'].astype(str).str.zfill(2)

# Entry bars: Friday (weekday=4), hour_utc=0
entry_mask = (df['weekday'] == 4) & (df['hour_utc'] == 0)
entry_bars = df[entry_mask].copy()

# All Friday bars for exit scanning
friday_bars = df[df['weekday'] == 4].copy()

trades = []
for _, entry_row in entry_bars.iterrows():
    yw  = entry_row['year_week']
    ec  = entry_row['close']
    atr = entry_row['atr14']
    stop_price = ec - 1.0 * atr
    entry_time = entry_row['time']

    # All subsequent Friday bars in same year_week (including entry bar)
    week_fri = friday_bars[
        (friday_bars['year_week'] == yw) &
        (friday_bars['time'] >= entry_time)
    ].sort_values('time')

    if len(week_fri) < 1:
        continue

    exit_close = None
    exit_time  = None
    exit_reason= None
    exit_price = None

    # Scan bars AFTER entry bar for stop
    post_entry = week_fri[week_fri['time'] > entry_time]
    last_bar   = week_fri.iloc[-1]

    hit_stop = False
    for _, bar in post_entry.iterrows():
        if bar['low'] <= stop_price:
            exit_price  = stop_price
            exit_time   = bar['time']
            exit_reason = 'STOP'
            hit_stop    = True
            break

    if not hit_stop:
        exit_price  = last_bar['close']
        exit_time   = last_bar['time']
        exit_reason = 'TIME'

    ret_pct = (exit_price - ec) / ec * 100.0
    trades.append({
        'entry_time':  entry_time,
        'exit_time':   exit_time,
        'entry_close': ec,
        'exit_price':  exit_price,
        'stop_price':  stop_price,
        'atr':         atr,
        'ret_pct':     ret_pct,
        'reason':      exit_reason,
        'year':        entry_row['year'],
        'year_week':   yw,
    })

trades_df = pd.DataFrame(trades)
trades_df['entry_date'] = trades_df['entry_time'].dt.date
print(f"  Total trades generated: {len(trades_df)}")

# ─── ROLL WINDOW CLASSIFICATION ───────────────────────────────────────────────
ROLL_MONTHS = [2, 4, 6, 8, 10, 12]

def in_roll_window(entry_date):
    """True if entry_date falls within last 7 calendar days of any even month."""
    from calendar import monthrange
    m = entry_date.month
    y = entry_date.year
    # Check current month and prior month
    for chk_month in [m, m-1]:
        if chk_month < 1:
            chk_month += 12
        if chk_month in ROLL_MONTHS:
            last_day = monthrange(y, chk_month)[1]
            # Correct year for December check
            chk_year = y if chk_month == m else (y if m > 1 else y-1)
            last_date = datetime(chk_year, chk_month, last_day).date()
            window_start = last_date - timedelta(days=6)
            if window_start <= entry_date <= last_date:
                return True
    return False

trades_df['roll_window'] = trades_df['entry_date'].apply(in_roll_window)
print(f"  Roll trades: {trades_df['roll_window'].sum()}")

# ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
def pf_from_returns(rets):
    """Profit factor from % returns."""
    wins = rets[rets > 0].sum()
    losses = abs(rets[rets < 0].sum())
    if losses == 0:
        return float('inf') if wins > 0 else 1.0
    return round(float(wins / losses), 4)

def compute_R(rets, atrs, entries):
    """R multiples: ret_pct / (atr/entry * 100)."""
    r_vals = []
    for r, a, e in zip(rets, atrs, entries):
        risk_pct = (a / e) * 100.0
        if risk_pct > 0:
            r_vals.append(r / risk_pct)
        else:
            r_vals.append(0.0)
    return np.array(r_vals)

def maxdd_R(cum_r):
    """Max drawdown in R units (negative or zero)."""
    peak = np.maximum.accumulate(cum_r)
    dd   = cum_r - peak
    return float(dd.min()) if len(dd) > 0 else 0.0

def longest_losing_streak(r_vals):
    max_streak = cur = 0
    for v in r_vals:
        if v < 0:
            cur += 1
            max_streak = max(max_streak, cur)
        else:
            cur = 0
    return max_streak

# ─── SECTION 1: ROLL TRADE REMOVAL ───────────────────────────────────────────
print("\n=== SECTION 1: ROLL TRADE REMOVAL ===")
total_trades    = len(trades_df)
roll_trades     = trades_df['roll_window'].sum()
non_roll_trades = total_trades - roll_trades
pct_removed     = round(roll_trades / total_trades * 100, 2)

roll_df     = trades_df[trades_df['roll_window']]
non_roll_df = trades_df[~trades_df['roll_window']]

roll_pf      = pf_from_returns(roll_df['ret_pct'])
non_roll_pf  = pf_from_returns(non_roll_df['ret_pct'])
roll_mean    = round(float(roll_df['ret_pct'].mean()), 4)
nr_mean      = round(float(non_roll_df['ret_pct'].mean()), 4)
roll_wr      = round(float((roll_df['ret_pct'] > 0).mean()), 4)
nr_wr        = round(float((non_roll_df['ret_pct'] > 0).mean()), 4)

section1 = {
    "total_trades":     total_trades,
    "roll_trades":      int(roll_trades),
    "non_roll_trades":  int(non_roll_trades),
    "pct_removed":      pct_removed,
    "roll_pf":          roll_pf,
    "non_roll_pf":      non_roll_pf,
    "roll_mean_ret_pct":roll_mean,
    "non_roll_mean_ret_pct": nr_mean,
    "roll_win_rate":    roll_wr,
    "non_roll_win_rate":nr_wr,
}
print(json.dumps(section1, indent=2))

# ─── SECTION 2: NON-ROLL WFO FOLD TABLE (PRE-2021) ───────────────────────────
print("\n=== SECTION 2: NON-ROLL WFO FOLDS ===")
# Folds: IS 2003+N..2007+N, OOS 2008+N  for N=0..12
FOLDS = []
for n in range(13):
    is_start = 2003 + n
    is_end   = 2007 + n
    oos_year = 2008 + n
    FOLDS.append({'is_start': is_start, 'is_end': is_end, 'oos_year': oos_year})

pre2021 = trades_df[trades_df['year'] < 2021]
all_oos_non_roll = []
fold_results = []

for fold in FOLDS:
    oos_y = fold['oos_year']
    oos = pre2021[pre2021['year'] == oos_y]
    oos_nr = oos[~oos['roll_window']]

    orig_pf = pf_from_returns(oos['ret_pct']) if len(oos) > 0 else None
    nr_pf   = pf_from_returns(oos_nr['ret_pct']) if len(oos_nr) > 0 else None

    orig_R_arr = compute_R(oos['ret_pct'].values, oos['atr'].values, oos['entry_close'].values) if len(oos) > 0 else np.array([])
    nr_R_arr   = compute_R(oos_nr['ret_pct'].values, oos_nr['atr'].values, oos_nr['entry_close'].values) if len(oos_nr) > 0 else np.array([])

    orig_exp_R = round(float(orig_R_arr.mean()), 4) if len(orig_R_arr) > 0 else None
    nr_exp_R   = round(float(nr_R_arr.mean()), 4) if len(nr_R_arr) > 0 else None

    cum_nr_R   = np.cumsum(nr_R_arr) if len(nr_R_arr) > 0 else np.array([0.0])
    nr_total_R = round(float(cum_nr_R[-1]), 4) if len(nr_R_arr) > 0 else 0.0
    nr_mdd_R   = round(maxdd_R(cum_nr_R), 4) if len(nr_R_arr) > 0 else 0.0
    positive   = (nr_pf is not None and nr_pf > 1.0)

    fold_results.append({
        "fold":           FOLDS.index(fold) + 1,
        "oos_year":       oos_y,
        "original_trades":int(len(oos)),
        "non_roll_trades":int(len(oos_nr)),
        "original_pf":    orig_pf,
        "non_roll_pf":    nr_pf,
        "original_exp_R": orig_exp_R,
        "non_roll_exp_R": nr_exp_R,
        "non_roll_total_R": nr_total_R,
        "non_roll_MaxDD_R": nr_mdd_R,
        "positive":       positive,
    })

    all_oos_non_roll.append(oos_nr)

# Aggregate non-roll OOS 2008-2020
agg_nr = pd.concat(all_oos_non_roll, ignore_index=True)
agg_R_arr = compute_R(agg_nr['ret_pct'].values, agg_nr['atr'].values, agg_nr['entry_close'].values)
cum_agg_R = np.cumsum(agg_R_arr)
agg_mdd_R = round(maxdd_R(cum_agg_R), 4)
agg_total_R = round(float(cum_agg_R[-1]), 4)
agg_pf      = pf_from_returns(agg_nr['ret_pct'])
agg_exp_R   = round(float(agg_R_arr.mean()), 4)
agg_wr      = round(float((agg_nr['ret_pct'] > 0).mean()), 4)
agg_payoff  = round(float(agg_nr[agg_nr['ret_pct']>0]['ret_pct'].mean() / abs(agg_nr[agg_nr['ret_pct']<0]['ret_pct'].mean())), 4) if len(agg_nr[agg_nr['ret_pct']<0]) > 0 else None
pos_folds   = sum(1 for f in fold_results if f['positive'])
med_pf      = round(float(np.median([f['non_roll_pf'] for f in fold_results if f['non_roll_pf'] is not None])), 4)
worst_fold  = min(fold_results, key=lambda x: x['non_roll_pf'] if x['non_roll_pf'] is not None else 999)
lls         = longest_losing_streak(agg_R_arr)
# CAGR_R: 13 years
cagr_R      = round(agg_total_R / 13.0, 4)
calmar_R    = round(cagr_R / abs(agg_mdd_R), 4) if agg_mdd_R != 0 else None

section2 = {
    "folds": fold_results,
    "agg": {
        "trades":                int(len(agg_nr)),
        "pf":                    agg_pf,
        "exp_R":                 agg_exp_R,
        "win_rate":              agg_wr,
        "payoff":                agg_payoff,
        "total_R":               agg_total_R,
        "MaxDD_R":               agg_mdd_R,
        "positive_folds":        pos_folds,
        "total_folds":           13,
        "median_fold_pf":        med_pf,
        "worst_fold_oos_year":   worst_fold['oos_year'],
        "worst_fold_pf":         worst_fold['non_roll_pf'],
        "longest_losing_streak": lls,
        "CAGR_R":                cagr_R,
        "Calmar_R":              calmar_R,
    }
}
print(f"  Agg non-roll OOS PF: {agg_pf}")
print(f"  Positive folds: {pos_folds}/13")
print(f"  Agg exp_R: {agg_exp_R}")

# ─── SECTION 3: ACCEPTANCE GATE ──────────────────────────────────────────────
print("\n=== SECTION 3: GATES ===")
# Gate D: no single year > 40% of total non-roll total_R
year_R = {}
for f in fold_results:
    year_R[f['oos_year']] = f['non_roll_total_R']
if agg_total_R > 0:
    gate_D = all(abs(r) / abs(agg_total_R) <= 0.40 for r in year_R.values())
else:
    gate_D = False

gate_A = agg_pf >= 1.15
gate_B = agg_exp_R > 0
gate_C = pos_folds > 6
gate_E = None  # filled after section 6

if agg_pf >= 1.15 and gate_B and gate_C:
    gate_prelim = "KEEP_CANDIDATE"
elif 1.05 <= agg_pf < 1.15:
    gate_prelim = "WATCH"
else:
    gate_prelim = "REJECT"

section3_prelim = {
    "gate_A_pf_ge_1_15":   gate_A,
    "gate_B_exp_R_pos":    gate_B,
    "gate_C_majority_folds": gate_C,
    "gate_D_no_concentration": gate_D,
    "gate_E_temporal_neighborhood": "pending",
    "preliminary_outcome": gate_prelim,
}
print(json.dumps(section3_prelim, indent=2))

# ─── SECTION 4: ROLL TRADE INSPECTION ────────────────────────────────────────
print("\n=== SECTION 4: ROLL TRADE INSPECTION ===")
pre2021_roll = pre2021[pre2021['roll_window']].copy()

# 4a Return distribution
if len(pre2021_roll) > 0:
    rets_r = pre2021_roll['ret_pct']
    s4a = {
        "count":        int(len(pre2021_roll)),
        "mean_ret_pct": round(float(rets_r.mean()), 4),
        "median_ret_pct": round(float(rets_r.median()), 4),
        "std_ret_pct":  round(float(rets_r.std()), 4),
        "win_rate":     round(float((rets_r > 0).mean()), 4),
        "pf":           pf_from_returns(rets_r),
        "p10":  round(float(np.percentile(rets_r, 10)), 4),
        "p25":  round(float(np.percentile(rets_r, 25)), 4),
        "p75":  round(float(np.percentile(rets_r, 75)), 4),
        "p90":  round(float(np.percentile(rets_r, 90)), 4),
    }
else:
    s4a = {"count": 0}

# 4b Gap magnitude
# Build lookup: entry_time -> prior bar close
df_sorted = df.sort_values('time').reset_index(drop=True)
close_lookup = dict(zip(df_sorted['time'], df_sorted['close']))
open_lookup  = dict(zip(df_sorted['time'], df_sorted['open']))
time_list    = df_sorted['time'].tolist()
time_to_idx  = {t: i for i, t in enumerate(time_list)}

gaps = []
for _, row in pre2021_roll.iterrows():
    et = row['entry_time']
    idx = time_to_idx.get(et, None)
    if idx is not None and idx > 0:
        prior_close = df_sorted.iloc[idx-1]['close']
        this_open   = df_sorted.iloc[idx]['open']
        gap_pct     = abs(this_open - prior_close) / prior_close * 100.0
        gaps.append({'entry_time': et, 'gap_pct': gap_pct, 'ret_pct': row['ret_pct']})

gaps_df = pd.DataFrame(gaps)
if len(gaps_df) > 0:
    large_gap_thresh = 0.3
    s4b = {
        "n_trades_with_gap": int(len(gaps_df)),
        "mean_gap":   round(float(gaps_df['gap_pct'].mean()), 4),
        "median_gap": round(float(gaps_df['gap_pct'].median()), 4),
        "max_gap":    round(float(gaps_df['gap_pct'].max()), 4),
        "count_gap_gt_0_3pct": int((gaps_df['gap_pct'] > large_gap_thresh).sum()),
    }

    # 4c Secondary diagnostic: remove only gap > 0.3% trades (all, not just roll)
    all_gaps = []
    for _, row in trades_df[trades_df['year'] < 2021].iterrows():
        et = row['entry_time']
        idx = time_to_idx.get(et, None)
        if idx is not None and idx > 0:
            prior_close = df_sorted.iloc[idx-1]['close']
            this_open   = df_sorted.iloc[idx]['open']
            gap_pct     = abs(this_open - prior_close) / prior_close * 100.0
            all_gaps.append({'entry_time': et, 'gap_pct': gap_pct, 'ret_pct': row['ret_pct'], 'atr': row['atr'], 'entry_close': row['entry_close']})

    all_gaps_df = pd.DataFrame(all_gaps)
    gap_removed  = all_gaps_df[all_gaps_df['gap_pct'] > large_gap_thresh]
    gap_kept     = all_gaps_df[all_gaps_df['gap_pct'] <= large_gap_thresh]
    s4c = {
        "label":              "SECONDARY DIAGNOSTIC ONLY -- not used to redefine primary roll rule",
        "trades_removed":     int(len(gap_removed)),
        "remaining_trades":   int(len(gap_kept)),
        "remaining_pf":       pf_from_returns(gap_kept['ret_pct']),
        "remaining_exp_R":    round(float(compute_R(gap_kept['ret_pct'].values, gap_kept['atr'].values, gap_kept['entry_close'].values).mean()), 4),
    }

    # 4d Cross-tab
    large_gap_times = set(gaps_df[gaps_df['gap_pct'] > large_gap_thresh]['entry_time'])
    roll_profitable_large  = int(((gaps_df['gap_pct'] > large_gap_thresh) & (gaps_df['ret_pct'] > 0)).sum())
    roll_profitable_small  = int(((gaps_df['gap_pct'] <= large_gap_thresh) & (gaps_df['ret_pct'] > 0)).sum())
    s4d = {
        "roll_profitable_with_large_gap":    roll_profitable_large,
        "roll_profitable_without_large_gap": roll_profitable_small,
    }
else:
    s4b = {}; s4c = {}; s4d = {}

section4 = {
    "4a_return_distribution": s4a,
    "4b_gap_magnitude": s4b,
    "4c_secondary_diagnostic": s4c,
    "4d_cross_tab": s4d,
}
print(json.dumps(s4b, indent=2))

# ─── SECTION 5: INDIVIDUAL CONTRACT CHECK ─────────────────────────────────────
print("\n=== SECTION 5: INDIVIDUAL CONTRACTS ===")
search_paths = [
    r"C:\Users\joris\Downloads",
    r"C:\Users\joris\Documents\Capitalife Terminal\data",
    r"C:\Users\joris\Documents\Capitalife Terminal\engine",
]
found_contracts = []
patterns = ["GCZ*.csv","GCH*.csv","GCM*.csv","GCQ*.csv","GCG*.csv","GCJ*.csv","GCK*.csv","GCN*.csv","GCU*.csv","GCV*.csv"]
for sp in search_paths:
    if os.path.exists(sp):
        for pat in patterns:
            found = glob_module.glob(os.path.join(sp, "**", pat), recursive=True)
            found_contracts.extend(found)

if found_contracts:
    section5 = {"available": True, "files": found_contracts[:10], "note": "Individual GC contracts found; reproduce strategy on these for comparison."}
else:
    section5 = {"available": False, "note": "Individual GC contract history not available -- continuous-series artifact risk cannot be completely eliminated."}
print(f"  Contracts found: {len(found_contracts)}")

# ─── SECTION 6: TEMPORAL NEIGHBORHOOD NON-ROLL ────────────────────────────────
print("\n=== SECTION 6: TEMPORAL NEIGHBORHOOD ===")
# For each entry variant, compute signal PF (raw % returns, no stops, no intrabar)
# on NON-ROLL weeks only, pre-2021
# Variants:
#   canonical: Fri weekday=4, hour_utc=0
#   thu23:     Thu weekday=3, hour_utc=23
#   fri01:     Fri weekday=4, hour_utc=1

def compute_neighborhood(df_full, wd, hr, trades_ref):
    """Compute signal returns for entry variant (no stops, last-bar exit)."""
    mask = (df_full['weekday'] == wd) & (df_full['hour_utc'] == hr)
    entries = df_full[mask].copy()
    # Map year_week to last Friday bar close (from precomputed)
    # Build exit map from friday_bars
    results = []
    for _, erow in entries.iterrows():
        yw = erow['year_week']
        et = erow['time']
        yr = erow['year']
        if yr >= 2021:
            continue
        week_fri = friday_bars[(friday_bars['year_week'] == yw) & (friday_bars['time'] >= et)]
        if len(week_fri) == 0:
            continue
        last_bar = week_fri.iloc[-1]
        ret_pct  = (last_bar['close'] - erow['close']) / erow['close'] * 100.0
        # Check roll window
        roll_flag = in_roll_window(et.date())
        results.append({'ret_pct': ret_pct, 'roll_window': roll_flag})
    return pd.DataFrame(results)

variants = {
    'thu_23': (3, 23),
    'fri_00': (4, 0),
    'fri_01': (4, 1),
}
s6 = {}
for label, (wd, hr) in variants.items():
    res = compute_neighborhood(df, wd, hr, trades_df)
    nr  = res[~res['roll_window']] if len(res) > 0 else res
    pf_v  = pf_from_returns(nr['ret_pct']) if len(nr) > 0 else None
    mean_v= round(float(nr['ret_pct'].mean()), 4) if len(nr) > 0 else None
    wr_v  = round(float((nr['ret_pct'] > 0).mean()), 4) if len(nr) > 0 else None
    s6[label] = {"n": int(len(nr)), "pf": pf_v, "mean_ret_pct": mean_v, "win_rate": wr_v}

# Gate E: temporal neighborhood positive if canonical and at least one neighbor > 1.0 PF
fri00_pf = s6['fri_00']['pf']
thu23_pf = s6['thu_23']['pf']
fri01_pf = s6['fri_01']['pf']
gate_E = bool(fri00_pf is not None and fri00_pf > 1.0 and (
    (thu23_pf is not None and thu23_pf > 1.0) or
    (fri01_pf is not None and fri01_pf > 1.0)
))
section6 = {"variants": s6, "gate_E_passed": gate_E}
print(json.dumps(s6, indent=2))

# ─── SECTION 7: KHV NON-ROLL 2021-2026 ────────────────────────────────────────
print("\n=== SECTION 7: KHV 2021-2026 ===")
khv_all = trades_df[trades_df['year'] >= 2021]
khv_nr  = khv_all[~khv_all['roll_window']]

def stats_block(df_b):
    if len(df_b) == 0:
        return {}
    R_arr  = compute_R(df_b['ret_pct'].values, df_b['atr'].values, df_b['entry_close'].values)
    cum_R  = np.cumsum(R_arr)
    return {
        "n":       int(len(df_b)),
        "pf":      pf_from_returns(df_b['ret_pct']),
        "exp_R":   round(float(R_arr.mean()), 4),
        "total_R": round(float(cum_R[-1]), 4),
        "MaxDD_R": round(maxdd_R(cum_R), 4),
        "win_rate":round(float((df_b['ret_pct'] > 0).mean()), 4),
    }

khv_base_stats = stats_block(khv_all)
khv_nr_stats   = stats_block(khv_nr)

# Per year non-roll
per_year = []
for yr in sorted(khv_nr['year'].unique()):
    yr_df = khv_nr[khv_nr['year'] == yr]
    R_arr = compute_R(yr_df['ret_pct'].values, yr_df['atr'].values, yr_df['entry_close'].values)
    per_year.append({
        "year":    int(yr),
        "n":       int(len(yr_df)),
        "pf":      pf_from_returns(yr_df['ret_pct']),
        "total_R": round(float(np.sum(R_arr)), 4),
        "win_rate":round(float((yr_df['ret_pct'] > 0).mean()), 4),
    })

section7 = {
    "label": "KNOWN HISTORICAL VALIDATION -- NOT pristine OOS",
    "base_all_trades": khv_base_stats,
    "non_roll": khv_nr_stats,
    "per_year_non_roll": per_year,
}

# ─── SECTION 8: VERDICT ──────────────────────────────────────────────────────
print("\n=== SECTION 8: VERDICT ===")
gates = {
    "gate_A": gate_A,
    "gate_B": gate_B,
    "gate_C": gate_C,
    "gate_D": gate_D,
    "gate_E": gate_E,
}
gates_passed = sum(1 for v in gates.values() if v)

if agg_pf >= 1.15 and gate_B and gate_C and gate_D and gate_E:
    verdict = "KEEP"
elif agg_pf >= 1.15 and gate_B and gate_C:
    verdict = "KEEP"
elif 1.05 <= agg_pf < 1.15 or (agg_pf >= 1.15 and not (gate_C and gate_B)):
    verdict = "WATCH"
else:
    verdict = "REJECT"

# Enforce: if majority folds flip negative -> REJECT
if pos_folds <= 6:
    verdict = "REJECT" if agg_pf < 1.05 else "WATCH"

just = (
    f"Non-roll agg OOS PF={agg_pf} over 13 folds (2008-2020). "
    f"Positive folds: {pos_folds}/13. "
    f"Agg exp_R={agg_exp_R}R. "
    f"MaxDD_R={agg_mdd_R}R. "
    f"Temporal neighborhood gate_E={'PASS' if gate_E else 'FAIL'}. "
    f"Roll removal reduced trades by {pct_removed}%. "
    f"Gates passed: {gates_passed}/5."
)

section8 = {
    "verdict":        verdict,
    "gates":          gates,
    "gates_passed":   gates_passed,
    "justification":  just,
    "non_roll_agg_pf":    agg_pf,
    "positive_folds":     pos_folds,
    "non_roll_agg_exp_R": agg_exp_R,
}
print(f"  VERDICT: {verdict}")
print(f"  Gates: {gates}")

# ─── SECTION 9: PORTFOLIO (ONLY IF KEEP) ─────────────────────────────────────
print("\n=== SECTION 9: PORTFOLIO ===")
section9 = None
if verdict == "KEEP":
    # Annual R for GC non-roll pre-2021 OOS
    gc_annual_R = {}
    for f in fold_results:
        gc_annual_R[f['oos_year']] = f['non_roll_total_R']

    # GLD annual R proxy (approximate from prior audit or skip if not available)
    # We cannot fabricate GLD returns; note explicitly
    section9 = {
        "note": "Portfolio analysis requires GLD and YM annual R series from prior audit. GC non-roll annual R (OOS 2008-2020) available from fold results. GLD and Dow TAT annual R must be sourced from their respective backtest reports. Full correlation and allocation analysis deferred pending cross-strategy data merge.",
        "gc_non_roll_annual_R_oos": gc_annual_R,
        "test_allocations": [0, 2, 4, 6, 8],
        "status": "deferred_pending_cross_strategy_merge",
    }
    print("  Portfolio analysis: deferred pending cross-strategy data merge.")

# ─── SECTION 10: ALLOCATION VERDICT ──────────────────────────────────────────
if verdict == "KEEP":
    alloc_verdict = {
        "verdict": "KEEP + 0% allocation pending portfolio merge",
        "approved_pct": None,
        "note": "GC non-roll edge is independently significant (PF>=1.15, majority folds positive). Allocation size requires GLD overlap analysis against existing 9% GLD allocation. Run portfolio merge to determine marginal Calmar contribution.",
    }
elif verdict == "WATCH":
    alloc_verdict = {"verdict": "WATCH + 0%", "approved_pct": 0}
else:
    alloc_verdict = {"verdict": "REJECT + archived", "approved_pct": 0}

section10 = alloc_verdict

# ─── SECTION 11: COMPONENT STATE ─────────────────────────────────────────────
if verdict == "KEEP":
    comp_status = "KEEP"
    comp_weight = "TBD (pending GLD overlap analysis)"
    comp_label  = f"WFO OOS 2008-2020 (13 folds, non-roll) — PF {agg_pf}"
else:
    comp_status = verdict
    comp_weight = "0%"
    comp_label  = f"WFO OOS 2008-2020 (13 folds, non-roll) — PF {agg_pf}"

section11 = {
    "DO_NOT_UPDATE_FILE": True,
    "status":      comp_status,
    "weight":      comp_weight,
    "wfOos_label": comp_label,
    "pf_value":    agg_pf,
    "isNotes": [
        f"Roll independence test: {pct_removed}% trades removed as roll-window artifacts",
        f"Non-roll OOS PF (2008-2020): {agg_pf}",
        f"Positive folds: {pos_folds}/13",
        f"Non-roll exp_R: {agg_exp_R}R",
        f"Temporal neighborhood gate: {'PASS' if gate_E else 'FAIL'}",
        f"KHV 2021-2026 non-roll PF: {khv_nr_stats.get('pf')}",
    ]
}

# ─── ASSEMBLE & WRITE JSON ────────────────────────────────────────────────────
output = {
    "version":    "roll_test_v1",
    "generated":  "2026-08-10",
    "section1_removal":               section1,
    "section2_non_roll_wfo":          section2,
    "section3_gates":                 {**section3_prelim, "gate_E_temporal_neighborhood": gate_E, "final_outcome": gate_prelim},
    "section4_roll_inspection":       section4,
    "section5_individual_contracts":  section5,
    "section6_temporal_neighborhood_non_roll": section6,
    "section7_khv_non_roll":          section7,
    "section8_strategy_verdict":      section8,
    "section9_portfolio":             section9,
    "section10_allocation_verdict":   section10,
    "section11_component_state":      section11,
}

json_path = os.path.join(OUT_DIR, "white_swan_gold_friday_roll_test.json")
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, default=str)
print(f"\nJSON written: {json_path}")

# ─── WRITE MARKDOWN ───────────────────────────────────────────────────────────
md_lines = [
    "# White Swan Gold Friday v3 — Roll-Independence Final Test",
    "",
    f"**Generated:** 2026-08-10  |  **Version:** roll_test_v1",
    "",
    "---",
    "",
    "## Section 1: Roll Trade Removal",
    "",
    f"| Metric | Value |",
    f"|--------|-------|",
    f"| Total trades (all years) | {total_trades} |",
    f"| Roll-window trades | {int(roll_trades)} |",
    f"| Non-roll trades | {int(non_roll_trades)} |",
    f"| % Removed | {pct_removed}% |",
    f"| Roll PF | {roll_pf} |",
    f"| Non-roll PF | {non_roll_pf} |",
    f"| Roll mean ret% | {roll_mean} |",
    f"| Non-roll mean ret% | {nr_mean} |",
    f"| Roll win rate | {roll_wr} |",
    f"| Non-roll win rate | {nr_wr} |",
    "",
    "---",
    "",
    "## Section 2: Non-Roll WFO Fold Table (Pre-2021)",
    "",
    "| Fold | OOS Year | Orig Trades | Non-Roll Trades | Orig PF | Non-Roll PF | Orig exp_R | Non-Roll exp_R | NR Total_R | NR MaxDD_R | Positive |",
    "|------|----------|------------|----------------|---------|------------|-----------|---------------|-----------|-----------|----------|",
]
for f in fold_results:
    md_lines.append(f"| {f['fold']} | {f['oos_year']} | {f['original_trades']} | {f['non_roll_trades']} | {f['original_pf']} | {f['non_roll_pf']} | {f['original_exp_R']} | {f['non_roll_exp_R']} | {f['non_roll_total_R']} | {f['non_roll_MaxDD_R']} | {'YES' if f['positive'] else 'NO'} |")

a = section2['agg']
md_lines += [
    "",
    "### Aggregate Non-Roll OOS (2008-2020)",
    "",
    f"| Metric | Value |",
    f"|--------|-------|",
    f"| Trades | {a['trades']} |",
    f"| PF | {a['pf']} |",
    f"| Exp_R | {a['exp_R']} |",
    f"| Win Rate | {a['win_rate']} |",
    f"| Total_R | {a['total_R']} |",
    f"| MaxDD_R | {a['MaxDD_R']} |",
    f"| Positive Folds | {a['positive_folds']}/13 |",
    f"| Median Fold PF | {a['median_fold_pf']} |",
    f"| Worst Fold | {a['worst_fold_oos_year']} (PF {a['worst_fold_pf']}) |",
    f"| Longest Losing Streak | {a['longest_losing_streak']} |",
    f"| CAGR_R | {a['CAGR_R']} |",
    f"| Calmar_R | {a['Calmar_R']} |",
    "",
    "---",
    "",
    "## Section 3: Acceptance Gates",
    "",
    f"| Gate | Threshold | Result |",
    f"|------|-----------|--------|",
    f"| A: PF >= 1.15 | {agg_pf} | {'PASS' if gate_A else 'FAIL'} |",
    f"| B: exp_R > 0 | {agg_exp_R} | {'PASS' if gate_B else 'FAIL'} |",
    f"| C: Majority folds positive | {pos_folds}/13 | {'PASS' if gate_C else 'FAIL'} |",
    f"| D: No single year >40% total_R | - | {'PASS' if gate_D else 'FAIL'} |",
    f"| E: Temporal neighborhood positive | - | {'PASS' if gate_E else 'FAIL'} |",
    "",
    "---",
    "",
    "## Section 4: Roll Trade Inspection",
    "",
    "### 4a. Return Distribution (Pre-2021 Roll Trades)",
    "",
    f"| Metric | Value |",
    f"|--------|-------|",
    f"| Count | {s4a.get('count')} |",
    f"| Mean ret% | {s4a.get('mean_ret_pct')} |",
    f"| Median ret% | {s4a.get('median_ret_pct')} |",
    f"| Std ret% | {s4a.get('std_ret_pct')} |",
    f"| Win rate | {s4a.get('win_rate')} |",
    f"| PF | {s4a.get('pf')} |",
    f"| p10 | {s4a.get('p10')} |",
    f"| p25 | {s4a.get('p25')} |",
    f"| p75 | {s4a.get('p75')} |",
    f"| p90 | {s4a.get('p90')} |",
    "",
    "### 4b. Gap Magnitude",
    "",
    f"| Metric | Value |",
    f"|--------|-------|",
    f"| Mean gap% | {s4b.get('mean_gap')} |",
    f"| Median gap% | {s4b.get('median_gap')} |",
    f"| Max gap% | {s4b.get('max_gap')} |",
    f"| Count gap > 0.3% | {s4b.get('count_gap_gt_0_3pct')} |",
    "",
    "### 4c. Secondary Diagnostic (gap > 0.3% removal)",
    "",
    f"**{s4c.get('label', '')}**",
    "",
    f"| Metric | Value |",
    f"|--------|-------|",
    f"| Trades removed | {s4c.get('trades_removed')} |",
    f"| Remaining trades | {s4c.get('remaining_trades')} |",
    f"| Remaining PF | {s4c.get('remaining_pf')} |",
    f"| Remaining exp_R | {s4c.get('remaining_exp_R')} |",
    "",
    "### 4d. Cross-Tabulation",
    "",
    f"| Category | Count |",
    f"|----------|-------|",
    f"| Roll profitable with large gap (>0.3%) | {s4d.get('roll_profitable_with_large_gap')} |",
    f"| Roll profitable without large gap | {s4d.get('roll_profitable_without_large_gap')} |",
    "",
    "---",
    "",
    "## Section 5: Individual Contract Check",
    "",
    f"**Available:** {section5['available']}",
    "",
    section5['note'],
    "",
    "---",
    "",
    "## Section 6: Temporal Neighborhood (Non-Roll, Pre-2021)",
    "",
    "| Entry Variant | N | PF | Mean Ret% | Win Rate |",
    "|--------------|---|----|-----------|----------|",
]
for lbl, sv in s6.items():
    md_lines.append(f"| {lbl} | {sv['n']} | {sv['pf']} | {sv['mean_ret_pct']} | {sv['win_rate']} |")

md_lines += [
    "",
    f"**Gate E passed:** {'YES' if gate_E else 'NO'}",
    "",
    "---",
    "",
    "## Section 7: KHV Non-Roll (2021-2026)",
    "",
    f"*{section7['label']}*",
    "",
    "### Base (all trades)",
    "",
    f"| n | PF | exp_R | total_R | MaxDD_R | win_rate |",
    f"|---|----|-------|---------|---------|----------|",
    f"| {khv_base_stats.get('n')} | {khv_base_stats.get('pf')} | {khv_base_stats.get('exp_R')} | {khv_base_stats.get('total_R')} | {khv_base_stats.get('MaxDD_R')} | {khv_base_stats.get('win_rate')} |",
    "",
    "### Non-Roll",
    "",
    f"| n | PF | exp_R | total_R | MaxDD_R | win_rate |",
    f"|---|----|-------|---------|---------|----------|",
    f"| {khv_nr_stats.get('n')} | {khv_nr_stats.get('pf')} | {khv_nr_stats.get('exp_R')} | {khv_nr_stats.get('total_R')} | {khv_nr_stats.get('MaxDD_R')} | {khv_nr_stats.get('win_rate')} |",
    "",
    "### Per Year (Non-Roll)",
    "",
    "| Year | N | PF | Total_R | Win Rate |",
    "|------|---|----|---------|----------|",
]
for py in per_year:
    md_lines.append(f"| {py['year']} | {py['n']} | {py['pf']} | {py['total_R']} | {py['win_rate']} |")

md_lines += [
    "",
    "---",
    "",
    "## Section 8: Strategy Verdict",
    "",
    f"### VERDICT: {verdict}",
    "",
    f"{just}",
    "",
    f"| Gate | Result |",
    f"|------|--------|",
]
for gk, gv in gates.items():
    md_lines.append(f"| {gk} | {'PASS' if gv else 'FAIL'} |")

md_lines += [
    f"| **Total gates passed** | **{gates_passed}/5** |",
    "",
    "---",
    "",
    "## Section 9: Portfolio Analysis",
    "",
    section9['note'] if section9 else "Not applicable (REJECT/WATCH verdict).",
    "",
    "---",
    "",
    "## Section 10: Allocation Verdict",
    "",
    f"**{section10['verdict']}**",
    "",
    section10.get('note', ''),
    "",
    "---",
    "",
    "## Section 11: Component State",
    "",
    f"| Field | Value |",
    f"|-------|-------|",
    f"| status | {section11['status']} |",
    f"| weight | {section11['weight']} |",
    f"| wfOos label | {section11['wfOos_label']} |",
    f"| pf value | {section11['pf_value']} |",
]
for note in section11['isNotes']:
    md_lines.append(f"- {note}")

md_path = os.path.join(OUT_DIR, "white_swan_gold_friday_roll_test.md")
with open(md_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md_lines))
print(f"MD written: {md_path}")

# ─── FINAL SUMMARY ────────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"STRATEGY VERDICT: {verdict}")
print(f"ALLOCATION VERDICT: {section10['verdict']}")
print(f"Non-roll agg OOS PF: {agg_pf}")
print(f"Positive folds: {pos_folds}/13")
print(f"Non-roll exp_R: {agg_exp_R}R")
print(f"Gates passed: {gates_passed}/5")
print("="*60)
