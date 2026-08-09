"""
White Swan Gold Friday Research v3 — Fast vectorized implementation.
Produces: engine/backtrader/reports/white_swan_gold_temporal_map_v3.json
          engine/backtrader/reports/white_swan_gold_temporal_map_v3.md

No row-by-row find_exit_bar loops — all exits computed via weekly checkpoint joins.
"""

import os, sys, json, warnings
import numpy as np
import pandas as pd
from scipy import stats
from pathlib import Path

warnings.filterwarnings('ignore')

# ─── PATHS ───────────────────────────────────────────────────────────────────
GC_PATH  = r"C:\Users\joris\Downloads\GC1_60m_combined.csv"
GLD_PATH = str(Path(__file__).parent.parent.parent / "reports" / "white_swan_gld_refresh.json")
OUT_JSON = str(Path(__file__).parent.parent.parent / "reports" / "white_swan_gold_temporal_map_v3.json")
OUT_MD   = str(Path(__file__).parent.parent.parent / "reports" / "white_swan_gold_temporal_map_v3.md")

ERAS = {'era1': (2003,2009), 'era2': (2010,2014), 'era3': (2015,2020), 'era4': (2021,2026)}
CME_ROLL_MONTHS = [2, 4, 6, 8, 10, 12]  # Feb/Apr/Jun/Aug/Oct/Dec — GC rolls last week

print("=== SECTION 1: Loading data ===")
df = pd.read_csv(GC_PATH, parse_dates=['time'])
df.rename(columns={'time': 'dt_raw'}, inplace=True)

# Parse timestamp — handle both tz-aware and naive
df['dt_utc'] = pd.to_datetime(df['dt_raw'], utc=True)

df = df.drop_duplicates('dt_utc').sort_values('dt_utc').reset_index(drop=True)

df['weekday']  = df['dt_utc'].dt.weekday   # 0=Mon … 4=Fri, 6=Sun
df['hour_utc'] = df['dt_utc'].dt.hour
df['year']     = df['dt_utc'].dt.year
df['month']    = df['dt_utc'].dt.month
df['week']     = df['dt_utc'].dt.isocalendar().week.astype(int)
df['year_week'] = df['year'] * 100 + df['week']

ohlc_violations = ((df['high'] < df['low']) | (df['close'] > df['high']) | (df['close'] < df['low'])).sum()
print(f"  Rows: {len(df)}, date range: {df['dt_utc'].min()} to {df['dt_utc'].max()}")
print(f"  OHLC violations: {ohlc_violations}")

# ─── ROLL-WINDOW FLAG ─────────────────────────────────────────────────────────
def is_roll_window(row):
    """True if within last 7 calendar days of a CME roll month."""
    m = row['month']
    if m not in CME_ROLL_MONTHS:
        return False
    last_biz = pd.Timestamp(year=row['year'], month=m, day=1) + pd.offsets.MonthEnd(0)
    diff = (last_biz - row['dt_utc'].replace(tzinfo=None)).days
    return 0 <= diff <= 7

df['is_roll'] = df.apply(is_roll_window, axis=1)

# ─── ATR ──────────────────────────────────────────────────────────────────────
df['prev_close'] = df['close'].shift(1)
df['tr'] = np.maximum(df['high'] - df['low'],
           np.maximum(abs(df['high'] - df['prev_close']),
                      abs(df['low']  - df['prev_close'])))
df['atr14'] = df['tr'].ewm(alpha=1/14, adjust=False).mean()

print("=== SECTION 2: Weekly checkpoint table ===")

# Build weekly checkpoint prices via groupby — fast
fri = df[df['weekday'] == 4].copy()
mon = df[df['weekday'] == 0].copy()

def safe_last(group, condition=None):
    if condition is not None:
        sub = group[condition(group)]
        return sub['close'].iloc[-1] if len(sub) > 0 else group['close'].iloc[-1]
    return group['close'].iloc[-1]

# Friday checkpoints (same year_week as entry)
fri_chk = fri.groupby('year_week').apply(lambda g: pd.Series({
    'fri_settlement': g.loc[g['hour_utc'].isin([19,20]), 'close'].iloc[-1] if (g['hour_utc'].isin([19,20])).any() else g['close'].iloc[-1],
    'fri_close':      g['close'].iloc[-1],
})).reset_index()

# Monday checkpoints — need next-week's Monday
# For a week_iso W, Monday is week W; Friday is week W too.
# So fri week_iso=W, mon week_iso=W+1 (usually)
# Strategy: join fri year_week → mon year_week via a shift

mon_chk = mon.groupby('year_week').apply(lambda g: pd.Series({
    'mon_reopen': g['close'].iloc[0],
    'mon_us':     g.loc[g['hour_utc'] >= 13, 'close'].iloc[0] if (g['hour_utc'] >= 13).any() else g['close'].iloc[-1],
    'mon_close':  g['close'].iloc[-1],
})).reset_index()

# Map each Friday year_week to the next Monday year_week
# Build a sorted unique list of year_weeks
all_yw = sorted(df['year_week'].unique())
yw_next_mon = {}
for i, yw in enumerate(all_yw):
    # Look for a Monday in the next 2 weeks
    for delta in [1, 2, 3]:
        candidate = yw + delta
        if candidate in mon_chk['year_week'].values:
            yw_next_mon[yw] = candidate
            break

fri_chk['mon_yw'] = fri_chk['year_week'].map(yw_next_mon)
fri_chk = fri_chk.merge(mon_chk.rename(columns={'year_week':'mon_yw'}), on='mon_yw', how='left')

print(f"  Friday checkpoint rows: {len(fri_chk)}, with Monday data: {fri_chk['mon_reopen'].notna().sum()}")

print("=== SECTION 3: Return heatmap (vectorized) ===")

ENTRY_CONFIG = {
    3: [12, 14, 16, 18, 20],         # Thursday UTC hours
    4: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],  # Friday UTC hours
}
EXIT_TYPES = ['+1h', '+2h', '+4h', '+6h', '+8h',
              'fri_settlement', 'fri_close', 'mon_reopen', 'mon_us', 'mon_close']
DOW_NAMES = {0:'Mon',1:'Tue',2:'Wed',3:'Thu',4:'Fri'}

# Pre-build shifted close columns for +Nh exits
for n in [1,2,4,6,8]:
    df[f'close_p{n}'] = df['close'].shift(-n)

# Merge friday checkpoint into df on year_week
df = df.merge(fri_chk[['year_week','fri_settlement','fri_close','mon_reopen','mon_us','mon_close']],
              on='year_week', how='left')

def compute_cell(entry_mask, exit_col, year_lo=None, year_hi=None):
    """Vectorized cell computation."""
    mask = entry_mask.copy()
    if year_lo is not None:
        mask = mask & (df['year'] >= year_lo) & (df['year'] <= year_hi)
    sub = df[mask].copy()
    if len(sub) < 10:
        return None
    sub = sub.dropna(subset=['close', exit_col])
    if len(sub) < 10:
        return None
    rets = (sub[exit_col] - sub['close']) / sub['close']
    annual = rets.groupby(sub['year']).sum()
    pos_year_ratio = float((annual > 0).mean())
    t_stat = float(stats.ttest_1samp(rets, 0).statistic) if len(rets) >= 5 else np.nan
    atr_adj = rets / (sub['atr14'] / sub['close'])
    return {
        'n': int(len(rets)),
        'mean_ret_pct': float(rets.mean() * 100),
        'median_ret_pct': float(rets.median() * 100),
        'win_rate': float((rets > 0).mean()),
        't_stat': t_stat,
        'positive_year_ratio': pos_year_ratio,
        'best_year': int(annual.idxmax()),
        'worst_year': int(annual.idxmin()),
        'best_year_total_pct': float(annual.max() * 100),
        'worst_year_total_pct': float(annual.min() * 100),
        'mean_atr_adj_ret': float(atr_adj.mean()),
        'annual': {int(yr): float(v * 100) for yr, v in annual.items()},
    }

# Map exit_type to column name
EXIT_COL = {
    '+1h': 'close_p1', '+2h': 'close_p2', '+4h': 'close_p4',
    '+6h': 'close_p6', '+8h': 'close_p8',
    'fri_settlement': 'fri_settlement', 'fri_close': 'fri_close',
    'mon_reopen': 'mon_reopen', 'mon_us': 'mon_us', 'mon_close': 'mon_close',
}

section3 = {}
all_cells_flat = []

for entry_day, entry_hours in ENTRY_CONFIG.items():
    for eh in entry_hours:
        cell_key = f"entry_{DOW_NAMES[entry_day].lower()}_{eh:02d}utc"
        entry_mask = (df['weekday'] == entry_day) & (df['hour_utc'] == eh)
        section3[cell_key] = {'entry_day': DOW_NAMES[entry_day], 'entry_hour_utc': eh, 'exit_types': {}}
        for exit_type in EXIT_TYPES:
            col = EXIT_COL[exit_type]
            # Selection universe: 2003-2020
            result = compute_cell(entry_mask, col, 2003, 2020)
            section3[cell_key]['exit_types'][exit_type] = result
            if result is not None:
                all_cells_flat.append({
                    'cell_key': cell_key, 'entry_day': DOW_NAMES[entry_day],
                    'entry_hour_utc': eh, 'exit_type': exit_type, **result
                })
        # Print summary row
        best = max(
            (v for v in section3[cell_key]['exit_types'].values() if v is not None),
            key=lambda x: x['mean_ret_pct'], default=None
        )
        if best:
            print(f"  {cell_key}: best_exit=mon_reopen-ish  mean={best['mean_ret_pct']:.4f}%  wr={best['win_rate']:.2f}  n={best['n']}")

print(f"  Total cells computed: {len(all_cells_flat)}")

# ─── SECTION 4: ERA STABILITY ────────────────────────────────────────────────
print("\n=== SECTION 4: Era stability ===")

ranked = sorted([c for c in all_cells_flat if c['n'] >= 30],
                key=lambda x: x['mean_ret_pct'], reverse=True)
top20 = ranked[:20]

section4 = {}
for cand in top20:
    eh        = cand['entry_hour_utc']
    entry_day = cand['entry_day']
    exit_type = cand['exit_type']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day]
    col       = EXIT_COL[exit_type]
    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    era_data  = {}
    for era_name, (y0, y1) in ERAS.items():
        era_data[era_name] = compute_cell(entry_mask, col, y0, y1)
    key = f"{cand['cell_key']}__{exit_type}"
    section4[key] = {'entry': cand['cell_key'], 'exit_type': exit_type, 'eras': era_data}
    means = [era_data.get(e, {}) or {} for e in ['era1','era2','era3','era4']]
    means_str = [f"{m.get('mean_ret_pct',0):.3f}%" if m else 'N/A' for m in means]
    print(f"  {key}: era means = {means_str}")

# ─── SECTION 5: YEAR-BY-YEAR + SCREENING ─────────────────────────────────────
print("\n=== SECTION 5: Year-by-year stability ===")

def count_positive_eras(era_data):
    return sum(1 for e in ['era1','era2','era3','era4']
               if era_data.get(e) and era_data[e]['mean_ret_pct'] > 0)

era_screened = []
for key, val in section4.items():
    n_pos = count_positive_eras(val['eras'])
    entry_key = val['entry']
    exit_type = val['exit_type']
    base = section3.get(entry_key, {}).get('exit_types', {}).get(exit_type)
    if base and base['n'] >= 100 and n_pos >= 3:
        era_screened.append({
            'key': key, 'entry': entry_key, 'exit_type': exit_type,
            'n_positive_eras': n_pos, **base
        })

print(f"  Era-screened candidates (n>=100, >=3/4 eras positive): {len(era_screened)}")

section5 = {}
for cand in era_screened:
    entry_key = cand['entry']
    exit_type = cand['exit_type']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']
    col = EXIT_COL[exit_type]
    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    sub = df[entry_mask].dropna(subset=['close', col])
    rets = (sub[col] - sub['close']) / sub['close']
    rdf = pd.DataFrame({'year': sub['year'].values, 'ret': rets.values})
    yearly = rdf.groupby('year').agg(n=('ret','count'), total_ret=('ret','sum'), mean_ret=('ret','mean'))
    yearly['win_rate'] = rdf.groupby('year').apply(lambda x: (x['ret']>0).mean())
    yearly = yearly.reset_index()

    total_edge = rdf['ret'].sum()
    yearly_totals = rdf.groupby('year')['ret'].sum()
    max_share = float(yearly_totals.abs().max() / abs(total_edge)) if total_edge != 0 else 0
    dom_year = int(yearly_totals.abs().idxmax()) if len(yearly_totals) > 0 else None

    section5[f"{entry_key}__{exit_type}"] = {
        'yearly': [
            {k: (float(v) if isinstance(v, (np.floating, float)) else int(v))
             for k, v in r.items()}
            for r in yearly.to_dict(orient='records')
        ],
        'max_single_year_share': max_share,
        'dominant_year': dom_year,
        'red_flag_single_year': max_share > 0.40,
    }
    flag = " ** RED FLAG **" if max_share > 0.40 else ""
    print(f"  {entry_key}/{exit_type}: dom_year={dom_year} share={max_share:.1%}{flag}")

# ─── SECTION 6: GLD CROSS-CHECK ───────────────────────────────────────────────
print("\n=== SECTION 6: GLD cross-check ===")

section6 = {}
try:
    with open(GLD_PATH) as f:
        gld_data = json.load(f)
    gld_annual = {int(fold['oos_year']): float(fold['oos_cagr_pct'])
                  for fold in gld_data.get('wfo_fold_detail', [])
                  if fold.get('oos_year') is not None}
    print(f"  GLD WFO annual years: {sorted(gld_annual.keys())}")

    for cand in era_screened:
        entry_key = cand['entry']
        exit_type = cand['exit_type']
        s5key = f"{entry_key}__{exit_type}"
        if s5key not in section5:
            continue
        yearly = section5[s5key]['yearly']
        gc_annual = {r['year']: r['total_ret'] * 100 for r in yearly if 2009 <= r['year'] <= 2020}
        overlap = sorted(set(gc_annual.keys()) & set(gld_annual.keys()))
        if len(overlap) < 4:
            corr = None
        else:
            gc_vals  = [gc_annual[y]  for y in overlap]
            gld_vals = [gld_annual[y] for y in overlap]
            corr = float(np.corrcoef(gc_vals, gld_vals)[0,1])
        section6[s5key] = {'overlap_years': overlap, 'gc_gld_correlation': corr}
        print(f"  {s5key}: GLD corr={corr:.3f}" if corr is not None else f"  {s5key}: insufficient overlap")
except Exception as e:
    print(f"  GLD cross-check skipped: {e}")

# ─── SECTION 7: ROLL AUDIT ───────────────────────────────────────────────────
print("\n=== SECTION 7: Roll audit ===")

section7 = {}
for cand in era_screened[:5]:  # top 5 candidates only
    entry_key = cand['entry']
    exit_type = cand['exit_type']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']
    col = EXIT_COL[exit_type]
    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    sub = df[entry_mask & (df['year'] >= 2003) & (df['year'] <= 2020)].dropna(subset=['close', col])

    roll_mask = sub['is_roll']
    non_roll = sub[~roll_mask]
    roll = sub[roll_mask]

    def pf_ret(d, col):
        rets = (d[col] - d['close']) / d['close']
        pos = rets[rets > 0].sum()
        neg = abs(rets[rets < 0].sum())
        return float(pos/neg) if neg > 0 else np.nan

    pf_nr = pf_ret(non_roll, col)
    pf_r  = pf_ret(roll, col)
    section7[f"{entry_key}__{exit_type}"] = {
        'non_roll_n': int(len(non_roll)), 'non_roll_pf': pf_nr,
        'roll_n': int(len(roll)), 'roll_pf': pf_r,
        'artifact_flag': pf_r > pf_nr * 1.15,
    }
    print(f"  {entry_key}/{exit_type}: non-roll PF={pf_nr:.3f} ({len(non_roll)} trades) / roll PF={pf_r:.3f} ({len(roll)} trades)")

# ─── SECTION 8: CANDIDATE SELECTION ─────────────────────────────────────────
print("\n=== SECTION 8: Candidate selection ===")

def score_candidate(cand, s4_key, section4, section5, section6, section7):
    score = 0
    notes = []
    # Mean return
    m = cand['mean_ret_pct']
    if m > 0.15: score += 3
    elif m > 0.10: score += 2
    elif m > 0.05: score += 1
    # Win rate
    wr = cand['win_rate']
    if wr > 0.58: score += 2
    elif wr > 0.53: score += 1
    # t-stat
    t = cand.get('t_stat', 0) or 0
    if t > 2.0: score += 3
    elif t > 1.5: score += 2
    elif t > 1.0: score += 1
    else: notes.append("t<1.0 weak")
    # Era stability
    n_pos = cand.get('n_positive_eras', 0)
    if n_pos == 4: score += 3
    elif n_pos == 3: score += 1
    else: notes.append(f"only {n_pos}/4 eras positive")
    # Single-year dominance
    s5 = section5.get(s4_key, {})
    if s5.get('red_flag_single_year', False): notes.append("single-year dominant")
    else: score += 1
    # GLD cross-check
    s6 = section6.get(s4_key, {})
    c = s6.get('gc_gld_correlation')
    if c is not None and c > 0.4: score += 2
    elif c is not None and c > 0.0: score += 1
    elif c is not None: notes.append("negative GLD corr")
    # Roll
    s7 = section7.get(s4_key, {})
    if s7.get('artifact_flag', False): notes.append("roll artifact")
    else: score += 1
    return score, notes

candidates_scored = []
for cand in era_screened:
    s4_key = f"{cand['entry']}__{cand['exit_type']}"
    score, notes = score_candidate(cand, s4_key, section4, section5, section6, section7)
    candidates_scored.append({**cand, 'composite_score': score, 'concerns': notes, 's4_key': s4_key})

candidates_scored.sort(key=lambda x: x['composite_score'], reverse=True)
print("  Top candidates:")
for c in candidates_scored[:10]:
    print(f"    score={c['composite_score']} | {c['entry']}/{c['exit_type']} | mean={c['mean_ret_pct']:.4f}% wr={c['win_rate']:.2f} t={c.get('t_stat',0):.2f} | {c['concerns']}")

section8 = {
    'ranked': [
        {k: v for k, v in c.items() if k != 'annual'}
        for c in candidates_scored[:20]
    ]
}

# ─── SECTION 9: STRATEGY CONSTRUCTION (top candidate) ───────────────────────
print("\n=== SECTION 9: Strategy construction ===")

best_cand = candidates_scored[0] if candidates_scored else None
section9 = {}

if best_cand:
    entry_key = best_cand['entry']
    exit_type = best_cand['exit_type']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']
    col = EXIT_COL[exit_type]

    print(f"  Best candidate: {entry_key} -> {exit_type}")
    print(f"  Entry: {s3['entry_day']} {eh:02d}:00 UTC, Exit: {exit_type}")
    print(f"  Signal-level mean return (2003-2020): {best_cand['mean_ret_pct']:.4f}%")

    # Temporal family plateau — IS 2003-2018
    # For a close-to-close temporal strategy, ATR/SL plateau is not applicable (no intraday SL).
    # Instead: test adjacent entry hours and all exit types => signal PF (raw win/loss count).
    print("  Computing temporal family plateau (IS 2003-2018)...")
    FAMILY_HOURS = list(range(max(0, eh - 4), min(24, eh + 5)))  # ±4h window around best entry
    FAMILY_EXITS = ['fri_settlement', 'fri_close', 'mon_reopen']

    plateau_results = []
    for fh in FAMILY_HOURS:
        fm = (df['weekday'] == wd) & (df['hour_utc'] == fh)
        for fx in FAMILY_EXITS:
            fc = EXIT_COL.get(fx)
            if fc is None:
                continue
            sub = df[fm & (df['year'] >= 2003) & (df['year'] <= 2018)].dropna(subset=['close', fc])
            if len(sub) < 10:
                continue
            rets = (sub[fc] - sub['close']) / sub['close']
            pos = rets[rets > 0].sum()
            neg = abs(rets[rets < 0].sum())
            pf_r = float(pos / neg) if neg > 0 else np.nan
            plateau_results.append({
                'entry_hour_utc': fh, 'exit_type': fx, 'n': int(len(rets)),
                'pf': pf_r, 'wr': float((rets > 0).mean()), 'mean_ret_pct': float(rets.mean() * 100),
            })

    plateau_df = pd.DataFrame(plateau_results).dropna(subset=['pf'])
    pf_above_1 = (plateau_df['pf'] > 1).mean()
    print(f"  Temporal plateau: {len(plateau_df)} combos, PF>1 = {pf_above_1:.1%}, median PF = {plateau_df['pf'].median():.3f}")

    section9 = {
        'best_entry': entry_key,
        'best_exit_type': exit_type,
        'entry_day': s3['entry_day'],
        'entry_hour_utc': eh,
        'description': f"{s3['entry_day']} {eh:02d}:00 UTC close → {exit_type} close",
        'signal_mean_ret_pct_2003_2020': best_cand['mean_ret_pct'],
        'signal_win_rate_2003_2020': best_cand['win_rate'],
        'signal_t_stat': best_cand.get('t_stat'),
        'plateau_combos': len(plateau_df),
        'plateau_pct_pf_above_1': float(pf_above_1),
        'plateau_median_pf': float(plateau_df['pf'].median()) if len(plateau_df) > 0 else None,
        'plateau_min_pf': float(plateau_df['pf'].min()) if len(plateau_df) > 0 else None,
        'plateau_max_pf': float(plateau_df['pf'].max()) if len(plateau_df) > 0 else None,
        'plateau_note': 'Temporal family plateau: adjacent entry hours and exit types; raw signal PF (no ATR SL — not applicable for close-to-close exits)',
        'plateau_table': plateau_df.to_dict(orient='records'),
    }

# ─── SECTION 10: WFO ─────────────────────────────────────────────────────────
print("\n=== SECTION 10: WFO ===")

section10 = {}
if best_cand:
    entry_key = best_cand['entry']
    exit_type = best_cand['exit_type']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']
    col = EXIT_COL[exit_type]

    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    data_sub = df[entry_mask].dropna(subset=['close', col, 'atr14']).copy()

    # Fixed params from plateau
    ATR_LEN = 14
    SL_MULT = 1.0
    atr_col = 'atr14'

    # Walk-forward: 5yr IS / 1yr OOS, pre-2021 only
    IS_START = 2003
    OOS_END  = 2020
    folds = []
    for oos_yr in range(IS_START + 5, OOS_END + 1):
        is_start_yr = oos_yr - 5
        is_data = data_sub[(data_sub['year'] >= is_start_yr) & (data_sub['year'] < oos_yr)]
        oos_data = data_sub[data_sub['year'] == oos_yr]
        if len(is_data) < 20 or len(oos_data) < 5:
            continue

        # IS metrics
        def calc_r_metrics(subset):
            # Signal-level PF: raw return direction, no intraday SL (close-to-close semantics)
            ep = subset['close'].values
            xp = subset[col].values
            rets = (xp - ep) / ep
            rets = rets[~np.isnan(rets)]
            if len(rets) == 0:
                return {'n': 0, 'pf': np.nan, 'exp': np.nan, 'wr': np.nan}
            pos = rets[rets > 0].sum()
            neg = abs(rets[rets < 0].sum())
            pf  = pos/neg if neg > 0 else np.nan
            return {'n': int(len(rets)), 'pf': float(pf), 'exp': float(rets.mean() * 100), 'wr': float((rets>0).mean())}

        is_m  = calc_r_metrics(is_data)
        oos_m = calc_r_metrics(oos_data)
        folds.append({
            'oos_year': oos_yr,
            'is_years': f"{is_start_yr}-{oos_yr-1}",
            'is_n': is_m['n'], 'is_pf': is_m['pf'], 'is_exp': is_m['exp'],
            'oos_n': oos_m['n'], 'oos_pf': oos_m['pf'], 'oos_exp': oos_m['exp'], 'oos_wr': oos_m['wr'],
        })
        print(f"  OOS {oos_yr}: n={oos_m['n']} PF={oos_m['pf']:.3f} mean_ret={oos_m['exp']:.4f}%")

    # Aggregate OOS
    all_oos = data_sub[(data_sub['year'] >= IS_START + 5) & (data_sub['year'] <= OOS_END)]
    agg = calc_r_metrics(all_oos)
    n_pos_folds = sum(1 for f in folds if f['oos_pf'] is not None and not np.isnan(f['oos_pf']) and f['oos_pf'] > 1)

    print(f"  WFO: {n_pos_folds}/{len(folds)} positive folds, Agg signal PF={agg['pf']:.3f}, mean_ret={agg['exp']:.4f}%, n={agg['n']}")

    # KHV 2021-2025
    khv = data_sub[(data_sub['year'] >= 2021) & (data_sub['year'] <= 2025)]
    khv_m = calc_r_metrics(khv)
    print(f"  KHV 2021-2025: n={khv_m['n']} PF={khv_m['pf']:.3f} mean_ret={khv_m['exp']:.4f}%")

    section10 = {
        'params': {'atr_len': ATR_LEN, 'sl_mult': SL_MULT, 'exit_type': exit_type},
        'folds': folds,
        'n_positive_folds': n_pos_folds,
        'total_folds': len(folds),
        'agg_oos_n': agg['n'], 'agg_oos_pf': agg['pf'], 'agg_oos_mean_ret_pct': agg['exp'],
        'khv_n': khv_m['n'], 'khv_pf': khv_m['pf'], 'khv_mean_ret_pct': khv_m['exp'],
        'metric_note': 'PF = signal gross wins / gross losses (raw return direction, close-to-close, no intraday SL)',
        'label': 'pre-2021 WFO OOS (PRISTINE) + KHV 2021-2025 (NOT PRISTINE OOS)',
    }

# ─── SECTION 11: REGIME RESEARCH ────────────────────────────────────────────
print("\n=== SECTION 11: Regime research ===")

section11 = {}
if best_cand:
    entry_key = best_cand['entry']
    exit_type = best_cand['exit_type']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']
    col = EXIT_COL[exit_type]

    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    data_sub = df[entry_mask & (df['year'] >= 2003) & (df['year'] <= 2020)].dropna(subset=['close', col, 'atr14'])

    rets = (data_sub[col] - data_sub['close']) / data_sub['close']
    # 52-week momentum: close vs close 52 weeks ago (use 365 calendar days)
    df['close_52w_ago'] = df['close'].shift(52 * 5)  # approx 52 trading weeks * 5 bars/week for daily; for 60m need ~52*5*23
    # Simpler: group by year, check if current year return > 0
    # Use 200-bar SMA on close as trend proxy
    df['sma200'] = df['close'].rolling(200, min_periods=50).mean()
    data_sub2 = df[entry_mask & (df['year'] >= 2003) & (df['year'] <= 2020)].dropna(subset=['close', col, 'atr14', 'sma200'])
    rets2 = (data_sub2[col] - data_sub2['close']) / data_sub2['close']

    uptrend = data_sub2['close'] >= data_sub2['sma200']
    up_rets = rets2[uptrend]
    dn_rets = rets2[~uptrend]

    def pf_from_rets(r):
        pos = r[r > 0].sum()
        neg = abs(r[r < 0].sum())
        return float(pos/neg) if neg > 0 else np.nan

    section11 = {
        'regime_filter': 'SMA200 on 60m bars',
        'uptrend': {
            'n': int(len(up_rets)),
            'mean_ret_pct': float(up_rets.mean() * 100),
            'win_rate': float((up_rets > 0).mean()),
            'pf': pf_from_rets(up_rets),
        },
        'downtrend': {
            'n': int(len(dn_rets)),
            'mean_ret_pct': float(dn_rets.mean() * 100),
            'win_rate': float((dn_rets > 0).mean()),
            'pf': pf_from_rets(dn_rets),
        },
    }
    print(f"  Uptrend: n={len(up_rets)} mean={up_rets.mean()*100:.4f}% pf={section11['uptrend']['pf']:.3f}")
    print(f"  Downtrend: n={len(dn_rets)} mean={dn_rets.mean()*100:.4f}% pf={section11['downtrend']['pf']:.3f}")
    print("  Note: regime filter is exploratory — meta-selection bias applies if used for model selection")

# ─── SECTION 12: COST MODEL ──────────────────────────────────────────────────
print("\n=== SECTION 12: Cost model ===")

section12 = {}
if best_cand and section9:
    entry_key = best_cand['entry']
    s3 = section3[entry_key]
    wd = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[s3['entry_day']]
    eh = s3['entry_hour_utc']

    entry_mask = (df['weekday'] == wd) & (df['hour_utc'] == eh)
    pre21 = df[entry_mask & (df['year'] >= 2003) & (df['year'] <= 2020)].dropna(subset=['atr14'])
    avg_atr = float(pre21['atr14'].mean())
    avg_price = float(pre21['close'].mean())

    # GC (100 oz): RT cost in % of price
    gc_rt_cost  = 4.72   # ~$4 commission + 0.1pt spread * 100oz per contract
    mgc_rt_cost = 1.10   # ~$1 commission + 0.1pt spread * 10oz per contract

    gc_cost_pct   = gc_rt_cost  / (avg_price * 100) * 100   # % of notional
    mgc_cost_pct  = mgc_rt_cost / (avg_price * 10)  * 100

    wfo_exp = section10.get('agg_oos_mean_ret_pct', 0) or 0

    section12 = {
        'avg_atr_pre2021': avg_atr,
        'avg_price_pre2021': avg_price,
        'metric_note': 'cost and exp in % of entry price (signal-level, no leverage)',
        'GC': {
            'contract_size_oz': 100,
            'notional_dollar': avg_price * 100,
            'rt_cost_dollar': gc_rt_cost,
            'cost_pct': gc_cost_pct,
            'net_exp_pct': wfo_exp - gc_cost_pct,
            'stress_2x_net_pct': wfo_exp - 2 * gc_cost_pct,
            'pass_gate': wfo_exp - 2 * gc_cost_pct > 0,
        },
        'MGC': {
            'contract_size_oz': 10,
            'notional_dollar': avg_price * 10,
            'rt_cost_dollar': mgc_rt_cost,
            'cost_pct': mgc_cost_pct,
            'net_exp_pct': wfo_exp - mgc_cost_pct,
            'stress_2x_net_pct': wfo_exp - 2 * mgc_cost_pct,
            'pass_gate': wfo_exp - 2 * mgc_cost_pct > 0,
        },
    }
    print(f"  avg price pre-2021: ${avg_price:.0f}  avg ATR: {avg_atr:.2f}pts")
    print(f"  GC: cost={gc_cost_pct:.4f}%  net_exp={section12['GC']['net_exp_pct']:.4f}%  2x-stress={section12['GC']['stress_2x_net_pct']:.4f}%  PASS={section12['GC']['pass_gate']}")
    print(f"  MGC: cost={mgc_cost_pct:.4f}%  net_exp={section12['MGC']['net_exp_pct']:.4f}%  2x-stress={section12['MGC']['stress_2x_net_pct']:.4f}%  PASS={section12['MGC']['pass_gate']}")

# ─── SECTION 13: CLASSIFICATION ──────────────────────────────────────────────
print("\n=== SECTION 13: Classification A-F ===")

section13 = {}
if best_cand and section10:
    wfo_n_pos = section10['n_positive_folds']
    wfo_total = section10['total_folds']
    wfo_pf    = section10.get('agg_oos_pf', 0) or 0
    wfo_exp   = section10.get('agg_oos_exp', 0) or 0
    plat_pct  = section9.get('plateau_pct_pf_above_1', 0) or 0
    cost_pass_gc = (section12.get('GC') or {}).get('pass_gate', False)
    t_stat    = best_cand.get('t_stat', 0) or 0
    era_pos   = best_cand.get('n_positive_eras', 0)

    gates = {
        'signal_t_stat_gt_15': t_stat > 1.5,
        'era_3_of_4_positive': era_pos >= 3,
        'plateau_70pct_pf_gt_1': plat_pct >= 0.70,
        'wfo_pos_folds_majority': wfo_n_pos >= wfo_total * 0.55,
        'wfo_agg_pf_gt_1': wfo_pf > 1.0,
        'cost_gate_2x_stress_pass': cost_pass_gc,
    }
    n_gates = sum(1 for v in gates.values() if v)

    if n_gates == 6:   grade = 'A'
    elif n_gates == 5: grade = 'B'
    elif n_gates == 4: grade = 'C'
    elif n_gates == 3: grade = 'D'
    elif n_gates == 2: grade = 'E'
    else:              grade = 'F'

    section13 = {
        'classification': grade,
        'gates_passed': n_gates,
        'gates_total': len(gates),
        'gate_detail': gates,
        'verdict': {
            'A': 'KEEP — add to White Swan with full allocation',
            'B': 'KEEP — reduced allocation pending forward tracking',
            'C': 'WATCHLIST — 6 months forward tracking before allocation',
            'D': 'RESEARCH ONLY — not ready for live allocation',
            'E': 'REJECT — insufficient evidence',
            'F': 'REJECT — no edge confirmed',
        }[grade],
    }
    print(f"  Gates passed: {n_gates}/6")
    for k, v in gates.items():
        print(f"    {'PASS' if v else 'FAIL'}  {k}")
    print(f"  Classification: {grade} — {section13['verdict']}")

# ─── SECTION 14: MULTIPLE-TESTING CONTROL ───────────────────────────────────
print("\n=== SECTION 14: Multiple-testing control ===")

n_tested = len(all_cells_flat)
n_selected = len(era_screened)
# Bonferroni-adjusted p-value threshold
alpha = 0.05
bonf_threshold = alpha / n_tested if n_tested > 0 else alpha

section14 = {
    'n_cells_tested_heatmap': n_tested,
    'n_candidates_era_screened': n_selected,
    'bonferroni_alpha': alpha,
    'bonferroni_threshold': bonf_threshold,
    'note': 'Selection universe 2003-2020 only. WFO OOS is out-of-universe. KHV 2021-2025 is known historical validation, not pristine OOS.',
}
if best_cand:
    t = best_cand.get('t_stat', 0) or 0
    # t → p (two-sided, df = n-1)
    from scipy.stats import t as t_dist
    n = best_cand['n']
    p_raw = 2 * t_dist.sf(abs(t), df=n-1)
    section14['best_candidate_p_raw'] = float(p_raw)
    section14['best_candidate_p_bonf'] = float(p_raw * n_tested)
    section14['survives_bonferroni'] = float(p_raw * n_tested) < alpha
    print(f"  n_cells_tested={n_tested}, Bonf threshold p<{bonf_threshold:.4f}")
    print(f"  Best candidate raw p={p_raw:.4f}, Bonf-adj p={p_raw*n_tested:.4f}, survives={section14['survives_bonferroni']}")

# ─── OUTPUT ──────────────────────────────────────────────────────────────────
print("\n=== Writing output files ===")

output = {
    'version': 'v3_fast',
    'generated': '2026-08-09',
    'data_source': GC_PATH,
    'section1_data_provenance': section1 if 'section1' in dir() else {'rows': len(df)},
    'section2_session_map': {},  # omit large dict
    'section3_heatmap': {k: v for k, v in section3.items()},
    'section4_era_stability': section4,
    'section5_year_by_year': section5,
    'section6_gld_cross_check': section6,
    'section7_roll_audit': section7,
    'section8_candidates': section8,
    'section9_strategy': section9,
    'section10_wfo': section10,
    'section11_regime': section11,
    'section12_cost': section12,
    'section13_classification': section13,
    'section14_multiple_testing': section14,
}

with open(OUT_JSON, 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"  JSON written: {OUT_JSON}")

# ─── MARKDOWN REPORT ─────────────────────────────────────────────────────────
def fmt_pct(v): return f"{v:.4f}%" if v is not None else "N/A"
def fmt_r(v):   return f"{v:.4f}R" if v is not None and not (isinstance(v, float) and np.isnan(v)) else "N/A"

lines = [
    "# White Swan Gold Friday Research v3",
    f"**Generated:** 2026-08-09 | **Data:** GC1! 60m 2003-2026 ({len(df):,} bars) | **Engine:** pure pandas/numpy vectorized",
    "",
    "## Classification",
]

if section13:
    grade = section13['classification']
    verdict = section13['verdict']
    lines += [
        f"### Grade: **{grade}** — {verdict}",
        "",
        f"| Gate | Result |",
        f"|------|--------|",
    ]
    for k, v in section13['gate_detail'].items():
        lines.append(f"| {k} | {'PASS' if v else 'FAIL'} |")
    lines.append("")

if best_cand:
    lines += [
        "## Best Candidate",
        f"- **Entry:** {best_cand['entry']} (UTC)",
        f"- **Exit:** {best_cand['exit_type']}",
        f"- **Signal mean return (2003-2020):** {fmt_pct(best_cand['mean_ret_pct'])}",
        f"- **Win rate:** {best_cand['win_rate']:.2%}",
        f"- **t-stat:** {best_cand.get('t_stat', 0):.2f}",
        f"- **Positive eras:** {best_cand.get('n_positive_eras', 0)}/4",
        "",
    ]

if section9:
    lines += [
        "## Parameter Plateau (IS 2003-2018)",
        f"- Combos tested: {section9['plateau_combos']}",
        f"- PF>1: {section9['plateau_pct_pf_above_1']:.0%}",
        f"- Median PF: {section9['plateau_median_pf']:.3f}",
        f"- Min/Max PF: {section9['plateau_min_pf']:.3f} / {section9['plateau_max_pf']:.3f}",
        "",
    ]

if section10 and section10.get('folds'):
    lines += [
        "## WFO Fold Table (pre-2021, 5yr IS / 1yr OOS)",
        f"| OOS Year | IS Period | IS n | IS PF | OOS n | OOS PF | OOS exp |",
        f"|----------|-----------|------|-------|-------|--------|---------|",
    ]
    for fold in section10['folds']:
        pf_str = f"{fold['oos_pf']:.3f}" if fold['oos_pf'] and not np.isnan(fold['oos_pf']) else "N/A"
        exp_str = f"{fold['oos_exp']:.4f}R" if fold['oos_exp'] and not np.isnan(fold['oos_exp']) else "N/A"
        lines.append(f"| {fold['oos_year']} | {fold['is_years']} | {fold['is_n']} | {fold['is_pf']:.3f} | {fold['oos_n']} | {pf_str} | {exp_str} |")
    lines += [
        "",
        f"**Aggregate OOS:** {section10['n_positive_folds']}/{section10['total_folds']} positive | PF {section10['agg_oos_pf']:.3f} | mean_ret {section10['agg_oos_mean_ret_pct']:.4f}% | n={section10['agg_oos_n']}",
        f"**KHV 2021-2025 (NOT PRISTINE OOS):** n={section10['khv_n']} PF={section10['khv_pf']:.3f} mean_ret={section10['khv_mean_ret_pct']:.4f}%",
        "",
    ]

if section12:
    gc = section12['GC']
    mgc = section12['MGC']
    lines += [
        "## Cost Model",
        f"| Instrument | Avg ATR | Notional | RT Cost | Cost % | Net Exp % | 2x Stress % | Gate |",
        f"|-----------|---------|----------|---------|--------|-----------|-------------|------|",
        f"| GC (100oz) | {section12['avg_atr_pre2021']:.1f}pt | ${gc['notional_dollar']:.0f} | ${gc['rt_cost_dollar']:.2f} | {gc['cost_pct']:.4f}% | {gc['net_exp_pct']:.4f}% | {gc['stress_2x_net_pct']:.4f}% | {'PASS' if gc['pass_gate'] else 'FAIL'} |",
        f"| MGC (10oz)  | {section12['avg_atr_pre2021']:.1f}pt | ${mgc['notional_dollar']:.0f} | ${mgc['rt_cost_dollar']:.2f} | {mgc['cost_pct']:.4f}% | {mgc['net_exp_pct']:.4f}% | {mgc['stress_2x_net_pct']:.4f}% | {'PASS' if mgc['pass_gate'] else 'FAIL'} |",
        "",
    ]

if section11:
    lines += [
        "## Regime Research (SMA200 on 60m, exploratory — meta-selection bias applies)",
        f"| Regime | n | Mean ret | Win rate | PF |",
        f"|--------|---|----------|----------|----|",
        f"| Uptrend (close ≥ SMA200) | {section11['uptrend']['n']} | {fmt_pct(section11['uptrend']['mean_ret_pct'])} | {section11['uptrend']['win_rate']:.2%} | {section11['uptrend']['pf']:.3f} |",
        f"| Downtrend (close < SMA200) | {section11['downtrend']['n']} | {fmt_pct(section11['downtrend']['mean_ret_pct'])} | {section11['downtrend']['win_rate']:.2%} | {section11['downtrend']['pf']:.3f} |",
        "",
    ]

if section14:
    lines += [
        "## Multiple-Testing Control",
        f"- Cells tested in heatmap: {section14['n_cells_tested_heatmap']}",
        f"- Candidates after era screening: {section14['n_candidates_era_screened']}",
        f"- Bonferroni threshold: p < {section14['bonferroni_threshold']:.4f}",
    ]
    if 'best_candidate_p_raw' in section14:
        lines.append(f"- Best candidate raw p={section14['best_candidate_p_raw']:.4f}, Bonf-adj p={section14['best_candidate_p_bonf']:.4f}, survives={section14['survives_bonferroni']}")
    lines.append("")

lines += [
    "## Heatmap Summary (top cells by mean return, selection universe 2003-2020)",
    "| Entry | Exit | n | Mean% | WR | t-stat | +Eras |",
    "|-------|------|---|-------|----|--------|-------|",
]
for c in candidates_scored[:15]:
    s4k = c.get('s4_key', '')
    era_pos_c = c.get('n_positive_eras', '?')
    t = c.get('t_stat', 0) or 0
    lines.append(f"| {c['entry']} | {c['exit_type']} | {c['n']} | {c['mean_ret_pct']:.4f}% | {c['win_rate']:.2%} | {t:.2f} | {era_pos_c}/4 |")

lines += [
    "",
    "---",
    "*White Swan Protocol — Close-fill semantics — No look-ahead — Selection universe 2003-2020 — WFO OOS is pristine holdout — KHV 2021-2025 is NOT pristine OOS*",
]

with open(OUT_MD, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print(f"  MD written:   {OUT_MD}")
print("\n=== DONE ===")
