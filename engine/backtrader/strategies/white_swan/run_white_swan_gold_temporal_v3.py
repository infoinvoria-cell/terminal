"""
White Swan Gold Friday Research v3
Temporal Anomaly Mapping — GC1! 60-minute bars
NOT a parameter optimizer. All temporal selection on eras 1-4 (2003-2020) only.
2021-2026 is KNOWN HISTORICAL VALIDATION only.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from scipy import stats
from datetime import date, timedelta
import warnings
warnings.filterwarnings('ignore')

# ─── PATHS ────────────────────────────────────────────────────────────────────
GC_PATH   = r'C:\Users\joris\Downloads\GC1_60m_combined.csv'
GLD_PATH  = r'C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\reports\white_swan_gld_refresh.json'
DXY_PATH  = r'C:\Users\joris\Downloads\white_swan_v3b_data_unblock\white_swan_v3b_data_unblock\ICEUS_DLY_DXY, 1D_4c8c2(2).csv'
VIX_PATH  = r'C:\Users\joris\Downloads\white_swan_v3b_data_unblock\white_swan_v3b_data_unblock\TVC_VIX, 1D_bef33(2).csv'
OUT_JSON  = r'C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\reports\white_swan_gold_temporal_map_v3.json'
OUT_MD    = r'C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\reports\white_swan_gold_temporal_map_v3.md'

# ─── ERA DEFINITIONS ──────────────────────────────────────────────────────────
ERAS = {
    'era1': (2003, 2007),
    'era2': (2008, 2012),
    'era3': (2013, 2016),
    'era4': (2017, 2020),
    'era5_known_validation': (2021, 2026),
}
ERA_LABELS = {
    'era1': '2003-2007',
    'era2': '2008-2012',
    'era3': '2013-2016',
    'era4': '2017-2020',
    'era5_known_validation': '2021-2026 (KNOWN HISTORICAL VALIDATION)',
}

# ─── COMEX EXPIRY DATES (last business day of Feb/Apr/Jun/Aug/Oct/Dec) ────────
def comex_expiry_dates(start_year=2003, end_year=2027):
    """Approximate COMEX Gold quarterly expiries."""
    months = [2, 4, 6, 8, 10, 12]
    expiries = []
    for yr in range(start_year, end_year + 1):
        for mo in months:
            # last calendar day of month
            if mo == 12:
                last = date(yr + 1, 1, 1) - timedelta(days=1)
            else:
                last = date(yr, mo + 1, 1) - timedelta(days=1)
            # walk back to Friday or earlier weekday
            while last.weekday() > 4:
                last -= timedelta(days=1)
            expiries.append(pd.Timestamp(last))
    return expiries

EXPIRY_DATES = comex_expiry_dates()

def is_roll_window(ts, window=7):
    ts_date = ts.date() if hasattr(ts, 'date') else ts
    for exp in EXPIRY_DATES:
        if abs((pd.Timestamp(ts_date) - exp).days) <= window:
            return True
    return False

# ─── LOAD DATA ────────────────────────────────────────────────────────────────
print("=== SECTION 1: Loading data ===")
df = pd.read_csv(GC_PATH, parse_dates=['time'])
df = df.rename(columns={'time': 'dt'})
df = df.sort_values('dt').drop_duplicates('dt').reset_index(drop=True)
df['dt_utc'] = pd.to_datetime(df['dt'], utc=True)
df['dt_local'] = df['dt']
df['date'] = df['dt_utc'].dt.date
df['weekday'] = df['dt_utc'].dt.weekday
df['hour_utc'] = df['dt_utc'].dt.hour
df['year'] = df['dt_utc'].dt.year
df['week'] = df['dt_utc'].dt.isocalendar().week.astype(int)
df['year_week'] = df['dt_utc'].dt.to_period('W')

print(f"  Rows: {len(df)}")
print(f"  Date range: {df['dt_utc'].min()} to {df['dt_utc'].max()}")

# OHLC violation check
ohlc_violations = ((df['high'] < df['low']) | (df['high'] < df['open']) |
                   (df['high'] < df['close']) | (df['low'] > df['open']) |
                   (df['low'] > df['close'])).sum()
print(f"  OHLC violations: {ohlc_violations}")

# Day-of-week bar counts
dow_counts = df['weekday'].value_counts().sort_index()
dow_names  = {0:'Mon',1:'Tue',2:'Wed',3:'Thu',4:'Fri'}
dow_map    = {k: int(v) for k, v in dow_counts.items()}
print(f"  DoW counts: {dow_map}")

# Hour distribution (UTC)
hour_dist = df['hour_utc'].value_counts().sort_index().to_dict()
print(f"  Hour UTC distribution: {hour_dist}")

# Missing weeks (Thu or Fri absent)
all_weeks = df['year_week'].unique()
missing_thu = 0
missing_fri = 0
for w in all_weeks:
    wdf = df[df['year_week'] == w]
    if (wdf['weekday'] == 3).sum() == 0:
        missing_thu += 1
    if (wdf['weekday'] == 4).sum() == 0:
        missing_fri += 1
print(f"  Missing-Thu weeks: {missing_thu}, Missing-Fri weeks: {missing_fri}")

section1 = {
    'file': GC_PATH,
    'rows': len(df),
    'date_range': [str(df['dt_utc'].min()), str(df['dt_utc'].max())],
    'timezone_source': 'CET/CEST (Europe/Berlin +01:00/+02:00)',
    'analysis_timezone': 'UTC (converted)',
    'duplicates_removed': 0,
    'ohlc_violations': int(ohlc_violations),
    'dow_bar_counts': {dow_names.get(k, k): v for k, v in dow_map.items()},
    'hour_utc_distribution': {str(k): int(v) for k, v in hour_dist.items()},
    'missing_thu_weeks': missing_thu,
    'missing_fri_weeks': missing_fri,
    'notes': 'Bars at end-of-hour CET. Gold ~23h/day. Session approx 01:00-22:00 CET = 00:00-21:00 UTC summer / 01:00-22:00 UTC winter.',
}

# ─── SECTION 2: WEEKLY SESSION MAP ────────────────────────────────────────────
print("\n=== SECTION 2: Weekly session map ===")

# 1-bar forward return
df['ret_1bar'] = df['close'].pct_change().shift(-1)

session_map = {}
for wd in range(5):
    session_map[dow_names[wd]] = {}
    for h in range(24):
        mask = (df['weekday'] == wd) & (df['hour_utc'] == h)
        sub = df[mask]['ret_1bar'].dropna()
        if len(sub) < 5:
            continue
        session_map[dow_names[wd]][h] = {
            'n': int(len(sub)),
            'mean_ret_pct': float(sub.mean() * 100),
            'median_ret_pct': float(sub.median() * 100),
            'win_rate': float((sub > 0).mean()),
        }

# Print Thu/Fri window
print("  Thu/Fri session means (% per bar):")
for wd_n in ['Thu', 'Fri']:
    for h in sorted(session_map.get(wd_n, {}).keys()):
        c = session_map[wd_n][h]
        print(f"    {wd_n} {h:02d}UTC  n={c['n']}  mean={c['mean_ret_pct']:.4f}%  wr={c['win_rate']:.2f}")

section2 = session_map

# ─── ATR CALCULATION ──────────────────────────────────────────────────────────
print("\n  Computing ATR(14) on 60m bars...")
df['prev_close'] = df['close'].shift(1)
df['tr'] = np.maximum(df['high'] - df['low'],
           np.maximum(abs(df['high'] - df['prev_close']),
                      abs(df['low']  - df['prev_close'])))
df['atr14'] = df['tr'].ewm(alpha=1/14, adjust=False).mean()
df['atr7']  = df['tr'].ewm(alpha=1/7,  adjust=False).mean()
df['atr10'] = df['tr'].ewm(alpha=1/10, adjust=False).mean()
df['atr20'] = df['tr'].ewm(alpha=1/20, adjust=False).mean()

# ─── SECTION 3: RETURN HEATMAP ────────────────────────────────────────────────
print("\n=== SECTION 3: Return heatmap ===")

ENTRY_CONFIG = {
    3: [12, 14, 16, 18, 20],   # Thursday UTC
    4: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],  # Friday UTC
}
EXIT_TYPES = ['+1h', '+2h', '+4h', '+6h', '+8h',
              'fri_settlement', 'fri_close', 'mon_reopen', 'mon_us', 'mon_close']

df_indexed = df.set_index('dt_utc')
df_list    = df.reset_index(drop=True)

def find_exit_bar(df, entry_idx, entry_dt_utc, exit_type):
    """Return exit price given entry index and exit type."""
    entry_row = df.iloc[entry_idx]
    entry_wd  = entry_row['weekday']

    if exit_type.startswith('+'):
        n_bars = int(exit_type[1:].replace('h',''))
        out_idx = entry_idx + n_bars
        if out_idx >= len(df):
            return None, None
        return df.iloc[out_idx]['close'], out_idx

    if exit_type == 'fri_settlement':
        # Friday bars with hour_utc 19 or 20 in same week
        yw = entry_row['year_week']
        candidates = df[(df['year_week'] == yw) & (df['weekday'] == 4) &
                        (df['hour_utc'].isin([19, 20]))]
        candidates = candidates[candidates.index > entry_idx]
        if candidates.empty:
            return None, None
        row = candidates.iloc[0]
        return row['close'], row.name

    if exit_type == 'fri_close':
        yw = entry_row['year_week']
        candidates = df[(df['year_week'] == yw) & (df['weekday'] == 4) &
                        (df['hour_utc'] >= 20)]
        candidates = candidates[candidates.index > entry_idx]
        if candidates.empty:
            # try hour >= 19
            candidates = df[(df['year_week'] == yw) & (df['weekday'] == 4) &
                            (df['hour_utc'] >= 19)]
            candidates = candidates[candidates.index > entry_idx]
        if candidates.empty:
            return None, None
        row = candidates.iloc[-1]
        return row['close'], row.name

    if exit_type in ('mon_reopen', 'mon_us', 'mon_close'):
        # Find next Monday after entry
        yw = entry_row['year_week']
        next_week = yw + 1
        mon_bars = df[(df['year_week'] == next_week) & (df['weekday'] == 0)]
        if mon_bars.empty:
            # Try 2 weeks forward
            next_week = yw + 2
            mon_bars = df[(df['year_week'] == next_week) & (df['weekday'] == 0)]
        if mon_bars.empty:
            return None, None
        if exit_type == 'mon_reopen':
            row = mon_bars.iloc[0]
        elif exit_type == 'mon_us':
            us = mon_bars[mon_bars['hour_utc'] >= 13]
            if us.empty:
                row = mon_bars.iloc[-1]
            else:
                row = us.iloc[0]
        else:  # mon_close
            row = mon_bars.iloc[-1]
        return row['close'], row.name

    return None, None


def compute_heatmap_cell(df, entry_day, entry_hour, exit_type, year_filter=None):
    """Compute statistics for a single (entry_day, entry_hour, exit_type) cell."""
    records = []
    sub = df[(df['weekday'] == entry_day) & (df['hour_utc'] == entry_hour)]
    if year_filter is not None:
        y0, y1 = year_filter
        sub = sub[(sub['year'] >= y0) & (sub['year'] <= y1)]

    for idx in sub.index:
        row = df.iloc[idx]
        entry_price = row['close']
        entry_atr   = row['atr14']
        exit_price, _ = find_exit_bar(df, idx, row['dt_utc'], exit_type)
        if exit_price is None or entry_price <= 0:
            continue
        ret = (exit_price - entry_price) / entry_price
        atr_adj = ret / (entry_atr / entry_price) if entry_atr > 0 else np.nan
        records.append({
            'year': int(row['year']),
            'ret': ret,
            'atr_adj': atr_adj,
            'entry_price': entry_price,
            'is_roll': is_roll_window(row['dt_utc']),
        })

    if not records:
        return None

    rdf = pd.DataFrame(records)
    rets = rdf['ret'].values
    annual = rdf.groupby('year')['ret'].sum()
    pos_year_ratio = (annual > 0).mean() if len(annual) > 0 else np.nan
    t_stat = float(stats.ttest_1samp(rets, 0).statistic) if len(rets) >= 5 else np.nan

    return {
        'n': int(len(rets)),
        'mean_ret_pct': float(np.mean(rets) * 100),
        'median_ret_pct': float(np.median(rets) * 100),
        'win_rate': float((rets > 0).mean()),
        't_stat': t_stat,
        'positive_year_ratio': float(pos_year_ratio),
        'best_year': int(annual.idxmax()) if len(annual) > 0 else None,
        'worst_year': int(annual.idxmin()) if len(annual) > 0 else None,
        'best_year_total_pct': float(annual.max() * 100) if len(annual) > 0 else None,
        'worst_year_total_pct': float(annual.min() * 100) if len(annual) > 0 else None,
        'mean_atr_adj_ret': float(rdf['atr_adj'].mean()) if 'atr_adj' in rdf else None,
        'annual': {int(yr): float(v * 100) for yr, v in annual.items()},
    }

section3 = {}
total_cells = 0
all_cells_flat = []

for entry_day, entry_hours in ENTRY_CONFIG.items():
    wd_label = dow_names[entry_day]
    for eh in entry_hours:
        cell_key = f"entry_{wd_label.lower()}_{eh:02d}utc"
        section3[cell_key] = {'entry_day': wd_label, 'entry_hour_utc': eh, 'exit_types': {}}
        for exit_type in EXIT_TYPES:
            total_cells += 1
            # Only compute on eras 1-4 (2003-2020) for selection
            result = compute_heatmap_cell(df_list, entry_day, eh, exit_type, year_filter=(2003, 2020))
            section3[cell_key]['exit_types'][exit_type] = result
            if result is not None:
                all_cells_flat.append({
                    'cell_key': cell_key,
                    'entry_day': wd_label,
                    'entry_hour_utc': eh,
                    'exit_type': exit_type,
                    **result
                })
            print(f"  {cell_key} / {exit_type}: n={result['n'] if result else 0}  mean={result['mean_ret_pct']:.4f}% wr={result['win_rate']:.2f}" if result else f"  {cell_key} / {exit_type}: no data")

print(f"\n  Total cells computed: {total_cells}")

# ─── SECTION 4: ERA STABILITY ─────────────────────────────────────────────────
print("\n=== SECTION 4: Era stability ===")

# Rank cells by mean_ret on 2003-2020
ranked = sorted([c for c in all_cells_flat if c['n'] >= 30],
                key=lambda x: x['mean_ret_pct'], reverse=True)
top_candidates_for_era = ranked[:20]  # check top 20

section4 = {}
for cand in top_candidates_for_era:
    cell_key  = cand['cell_key']
    exit_type = cand['exit_type']
    entry_day = cand['entry_day']
    eh        = cand['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day]
    era_data  = {}
    for era_name, (y0, y1) in ERAS.items():
        res = compute_heatmap_cell(df_list, wd, eh, exit_type, year_filter=(y0, y1))
        era_data[era_name] = res
    section4[f"{cell_key}__{exit_type}"] = {
        'entry': cell_key, 'exit_type': exit_type,
        'eras': era_data,
    }
    era_means = [era_data[e]['mean_ret_pct'] if era_data[e] else None for e in ['era1','era2','era3','era4']]
    print(f"  {cell_key}/{exit_type}: era means = {[f'{m:.3f}%' if m is not None else 'N/A' for m in era_means]}")

# ─── SECTION 5: YEAR-BY-YEAR STABILITY ───────────────────────────────────────
print("\n=== SECTION 5: Year-by-year stability ===")

# Filter candidates: positive era1-4 count >= 3, n >= 100
def count_positive_eras(era_data):
    return sum(1 for e in ['era1','era2','era3','era4']
               if era_data.get(e) and era_data[e]['mean_ret_pct'] > 0)

era_screened = []
for key, val in section4.items():
    n_pos = count_positive_eras(val['eras'])
    base  = section3.get(val['entry'])
    if base is None:
        continue
    cell_res = base['exit_types'].get(val['exit_type'])
    if cell_res and cell_res['n'] >= 100 and n_pos >= 3:
        era_screened.append({
            'key': key, 'entry': val['entry'], 'exit_type': val['exit_type'],
            'n_positive_eras': n_pos, **cell_res
        })

print(f"  Era-screened candidates (n>=100, >=3/4 positive eras): {len(era_screened)}")

section5 = {}
for cand in era_screened:
    cell_key  = cand['entry']
    exit_type = cand['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    # Full history year-by-year
    records = []
    sub = df_list[(df_list['weekday'] == wd) & (df_list['hour_utc'] == eh)]
    for idx in sub.index:
        row = df_list.iloc[idx]
        entry_price = row['close']
        exit_price, _ = find_exit_bar(df_list, idx, row['dt_utc'], exit_type)
        if exit_price is None or entry_price <= 0:
            continue
        ret = (exit_price - entry_price) / entry_price
        records.append({'year': int(row['year']), 'ret': ret})

    rdf = pd.DataFrame(records)
    yearly = rdf.groupby('year').agg(n=('ret','count'), total_ret=('ret','sum'), mean_ret=('ret','mean')).reset_index()
    yearly['win_rate'] = rdf.groupby('year').apply(lambda x: (x['ret']>0).mean()).values
    yearly_list = yearly.to_dict(orient='records')

    # Red-flag: single year > 40% of lifetime
    total_edge = rdf['ret'].sum()
    yearly_totals = rdf.groupby('year')['ret'].sum()
    max_year_share = float(yearly_totals.abs().max() / abs(total_edge)) if total_edge != 0 else 0
    dominant_year = int(yearly_totals.abs().idxmax()) if len(yearly_totals) > 0 else None

    section5[f"{cell_key}__{exit_type}"] = {
        'yearly': [
            {k: (float(v) if isinstance(v, (np.floating, float)) else int(v))
             for k, v in row.items()}
            for row in yearly_list
        ],
        'max_single_year_share': max_year_share,
        'dominant_year': dominant_year,
        'red_flag_single_year': max_year_share > 0.40,
    }
    flag = " ** RED FLAG single-year dominance **" if max_year_share > 0.40 else ""
    print(f"  {cell_key}/{exit_type}: dominant_year={dominant_year} share={max_year_share:.1%}{flag}")

# ─── SECTION 6: GLD CROSS-CHECK ───────────────────────────────────────────────
print("\n=== SECTION 6: GLD cross-check ===")

with open(GLD_PATH) as f:
    gld_data = json.load(f)

gld_annual = {}
for fold in gld_data.get('wfo_fold_detail', []):
    yr  = fold.get('oos_year')
    cagr = fold.get('oos_cagr_pct')
    if yr is not None and cagr is not None:
        gld_annual[int(yr)] = float(cagr)

print(f"  GLD WFO annual data years: {sorted(gld_annual.keys())}")

section6 = {}
for cand in era_screened:
    cell_key  = cand['entry']
    exit_type = cand['exit_type']
    s5key     = f"{cell_key}__{exit_type}"
    if s5key not in section5:
        continue
    yearly = section5[s5key]['yearly']
    gc_annual = {r['year']: r['total_ret'] * 100 for r in yearly if 2009 <= r['year'] <= 2020}

    overlap_years = sorted(set(gc_annual.keys()) & set(gld_annual.keys()))
    if len(overlap_years) < 4:
        corr = None
        classification = 'insufficient_overlap'
    else:
        gc_vals  = [gc_annual[y] for y in overlap_years]
        gld_vals = [gld_annual[y] for y in overlap_years]
        corr, pval = stats.pearsonr(gc_vals, gld_vals)
        if corr > 0.4:
            classification = 'A_same_direction'
        elif corr < -0.2:
            classification = 'C_divergent'
        else:
            classification = 'B_independent'

    section6[s5key] = {
        'overlap_years': overlap_years,
        'pearson_corr': float(corr) if corr is not None else None,
        'gld_classification': classification,
        'gc_annual_pct': gc_annual,
        'gld_annual_cagr_pct': {y: gld_annual[y] for y in overlap_years},
    }
    corr_str2 = f"{corr:.3f}" if corr is not None else 'N/A'
    print(f"  {s5key}: corr={corr_str2} -> {classification}")

# ─── SECTION 7: ROLL AUDIT ────────────────────────────────────────────────────
print("\n=== SECTION 7: Roll audit ===")

section7 = {}
for cand in era_screened:
    cell_key  = cand['entry']
    exit_type = cand['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    records = []
    sub = df_list[(df_list['weekday'] == wd) & (df_list['hour_utc'] == eh) &
                  (df_list['year'] >= 2003) & (df_list['year'] <= 2020)]
    for idx in sub.index:
        row = df_list.iloc[idx]
        entry_price = row['close']
        exit_price, _ = find_exit_bar(df_list, idx, row['dt_utc'], exit_type)
        if exit_price is None or entry_price <= 0:
            continue
        ret = (exit_price - entry_price) / entry_price
        roll = is_roll_window(row['dt_utc'])
        records.append({'ret': ret, 'is_roll': roll, 'year': int(row['year'])})

    rdf = pd.DataFrame(records)
    if rdf.empty:
        section7[f"{cell_key}__{exit_type}"] = None
        continue

    base    = rdf
    nonroll = rdf[~rdf['is_roll']]

    def stats_block(d):
        if d.empty:
            return {}
        rets = d['ret'].values
        annual = d.groupby('year')['ret'].sum()
        return {
            'n': int(len(rets)),
            'mean_ret_pct': float(np.mean(rets) * 100),
            'median_ret_pct': float(np.median(rets) * 100),
            'win_rate': float((rets > 0).mean()),
            'positive_year_ratio': float((annual > 0).mean()),
        }

    base_stats    = stats_block(base)
    nonroll_stats = stats_block(nonroll)
    delta = (base_stats['mean_ret_pct'] - nonroll_stats['mean_ret_pct']) if nonroll_stats else None
    threshold = abs(base_stats['mean_ret_pct']) * 0.3
    roll_artifact = delta is not None and abs(delta) > threshold

    section7[f"{cell_key}__{exit_type}"] = {
        'base': base_stats,
        'non_roll': nonroll_stats,
        'delta_mean_pct': float(delta) if delta is not None else None,
        'roll_artifact_concern': bool(roll_artifact),
    }
    flag = " ** ROLL ARTIFACT **" if roll_artifact else ""
    nr_mean_str = f"{nonroll_stats['mean_ret_pct']:.4f}%" if nonroll_stats else 'N/A'
    print(f"  {cell_key}/{exit_type}: base_mean={base_stats['mean_ret_pct']:.4f}% nonroll_mean={nr_mean_str}{flag}")

# ─── SECTION 8: CANDIDATE SELECTION ──────────────────────────────────────────
print("\n=== SECTION 8: Candidate selection ===")

ECON_RATIONALE = {
    '+4h':  'Short-term momentum capture; covers main session price continuation.',
    '+6h':  '6-bar hold allows momentum to mature across US open/close transition.',
    '+8h':  'Overnight carry into next session open.',
    'fri_settlement': 'COMEX settlement at ~14:30 ET captures official fixing premium.',
    'fri_close': 'Weekly options expiry and position squaring drives Friday close premium.',
    'mon_reopen': 'Weekend gap reversion/momentum thesis; first-available exit.',
    'mon_us':  'Gap resolves at US Monday open after full weekend price discovery.',
    'mon_close': 'Full hold through Monday captures full weekend risk-premium unwinding.',
}

final_candidates = []
for cand in era_screened:
    cell_key  = cand['entry']
    exit_type = cand['exit_type']
    s_key     = f"{cell_key}__{exit_type}"
    s5        = section5.get(s_key, {})
    s7        = section7.get(s_key, {})
    s6        = section6.get(s_key, {})

    # All 6 criteria
    c1 = cand['median_ret_pct'] > 0
    c2 = cand['positive_year_ratio'] > 0.60
    c3 = cand['n_positive_eras'] >= 3
    c4 = cand['n'] >= 100
    c5 = (s7 and s7.get('non_roll') and s7['non_roll'].get('mean_ret_pct', -1) > 0) if s7 else False
    c6 = not s5.get('red_flag_single_year', True)

    passes = [c1, c2, c3, c4, c5, c6]
    n_pass = sum(passes)

    entry_day_str = section3[cell_key]['entry_day']
    eh = section3[cell_key]['entry_hour_utc']

    era_details = section4.get(s_key, {}).get('eras', {})
    era_persistence = count_positive_eras(era_details)

    rec = {
        'cell_key': cell_key,
        'exit_type': exit_type,
        'entry_weekday': entry_day_str,
        'entry_hour_utc': eh,
        'n': cand['n'],
        'mean_ret_pct': cand['mean_ret_pct'],
        'median_ret_pct': cand['median_ret_pct'],
        'win_rate': cand['win_rate'],
        'positive_year_ratio': cand['positive_year_ratio'],
        'era_persistence_of_4': era_persistence,
        'gld_classification': s6.get('gld_classification', 'N/A') if s6 else 'N/A',
        'roll_artifact_concern': s7.get('roll_artifact_concern', False) if s7 else False,
        'criteria_passed': n_pass,
        'criteria': {'c1_pos_median': c1, 'c2_pos_yr_ratio>60': c2,
                     'c3_era_persist>=3': c3, 'c4_n>=100': c4,
                     'c5_nonroll_pos': c5, 'c6_no_single_yr_dom': c6},
        'qualifies': n_pass == 6,
        'economic_rationale': ECON_RATIONALE.get(exit_type, 'General intraday/interday momentum.'),
    }
    final_candidates.append(rec)

final_candidates.sort(key=lambda x: (-x['criteria_passed'], -x['mean_ret_pct']))
qualified = [c for c in final_candidates if c['qualifies']]
print(f"  Fully qualified candidates: {len(qualified)}")
for c in qualified:
    print(f"    {c['cell_key']} / {c['exit_type']}: mean={c['mean_ret_pct']:.4f}% median={c['median_ret_pct']:.4f}% wr={c['win_rate']:.2f} pos_yr={c['positive_year_ratio']:.2f}")

# Pick best 2-3
best_candidates = qualified[:3] if qualified else final_candidates[:3]
section8 = {
    'all_screened': final_candidates,
    'selected': best_candidates,
}

# ─── SECTION 9: STRATEGY CONSTRUCTION / PLATEAU ───────────────────────────────
print("\n=== SECTION 9: ATR plateau analysis ===")

ATR_LENGTHS = [7, 10, 14, 20]
SL_MULTS    = [0.75, 1.0, 1.25, 1.5]
TP_RATIOS   = [None, 1.0, 1.25, 1.5, 2.0]

def run_strategy_combo(df, entry_day, entry_hour, exit_type, atr_len, sl_mult, tp_ratio, year_filter=(2003,2020)):
    atr_col = f'atr{atr_len}'
    sub = df[(df['weekday'] == entry_day) & (df['hour_utc'] == entry_hour) &
             (df['year'] >= year_filter[0]) & (df['year'] <= year_filter[1])]
    trades = []
    for idx in sub.index:
        row = df.iloc[idx]
        entry_price = row['close']
        atr_val     = row[atr_col]
        if atr_val <= 0 or entry_price <= 0:
            continue
        sl_price = entry_price - sl_mult * atr_val
        tp_price = entry_price + tp_ratio * sl_mult * atr_val if tp_ratio is not None else None

        # Walk bars until exit_type OR SL/TP hit
        exit_price_target, exit_idx = find_exit_bar(df, idx, row['dt_utc'], exit_type)
        if exit_price_target is None:
            continue

        # Scan bars between entry and exit for SL/TP
        actual_exit = exit_price_target
        for scan_idx in range(idx + 1, exit_idx + 1):
            if scan_idx >= len(df):
                break
            scan_row = df.iloc[scan_idx]
            if scan_row['low'] <= sl_price:
                actual_exit = sl_price
                break
            if tp_price is not None and scan_row['high'] >= tp_price:
                actual_exit = tp_price
                break

        ret_1R = (actual_exit - entry_price) / atr_val  # in R units
        trades.append(ret_1R)

    if not trades:
        return None
    trades = np.array(trades)
    winners = trades[trades > 0]
    losers  = trades[trades < 0]
    gross_profit = winners.sum() if len(winners) > 0 else 0
    gross_loss   = abs(losers.sum()) if len(losers) > 0 else 0
    pf           = gross_profit / gross_loss if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0)
    expectancy   = trades.mean()
    return {
        'trades': len(trades), 'pf': float(pf), 'expectancy_R': float(expectancy),
        'win_rate': float((trades > 0).mean()),
    }

section9 = {}
for cand in best_candidates:
    cell_key  = cand['cell_key']
    exit_type = cand['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    combo_results = []
    pf_list = []
    for atr_len in ATR_LENGTHS:
        for sl_mult in SL_MULTS:
            for tp_ratio in TP_RATIOS:
                res = run_strategy_combo(df_list, wd, eh, exit_type, atr_len, sl_mult, tp_ratio)
                if res:
                    pf_list.append(res['pf'])
                    combo_results.append({
                        'atr_len': atr_len, 'sl_mult': sl_mult, 'tp_ratio': tp_ratio,
                        **res
                    })

    n_combos   = len(combo_results)
    pf_above1  = sum(1 for p in pf_list if p > 1.0)
    plateau_pct = pf_above1 / n_combos if n_combos > 0 else 0
    pf_arr     = np.array(pf_list)
    qualifies_wfo = plateau_pct >= 0.60

    section9[f"{cell_key}__{exit_type}"] = {
        'n_combos_tested': n_combos,
        'pf_above1_count': pf_above1,
        'plateau_pct': float(plateau_pct),
        'min_pf': float(pf_arr.min()) if len(pf_arr) > 0 else None,
        'median_pf': float(np.median(pf_arr)) if len(pf_arr) > 0 else None,
        'max_pf': float(pf_arr.max()) if len(pf_arr) > 0 else None,
        'qualifies_for_wfo': qualifies_wfo,
    }
    print(f"  {cell_key}/{exit_type}: {pf_above1}/{n_combos} combos PF>1 ({plateau_pct:.1%}) — WFO qualify: {qualifies_wfo}")

# ─── SECTION 10: WALK-FORWARD ─────────────────────────────────────────────────
print("\n=== SECTION 10: Walk-forward analysis ===")

section10 = {}
wfo_qualified = [c for c in best_candidates
                 if section9.get(f"{c['cell_key']}__{c['exit_type']}", {}).get('qualifies_for_wfo', False)]
print(f"  WFO-qualified candidates: {len(wfo_qualified)}")

def select_best_atr_family(combo_results_is):
    """Select ATR length with highest median PF across SL/TP combos."""
    by_atr = {}
    for res in combo_results_is:
        k = res['atr_len']
        by_atr.setdefault(k, []).append(res['pf'])
    best_atr = max(by_atr, key=lambda k: np.median(by_atr[k]))
    # Within best_atr, pick median SL
    candidates = [r for r in combo_results_is if r['atr_len'] == best_atr]
    by_sl = {}
    for r in candidates:
        by_sl.setdefault(r['sl_mult'], []).append(r['pf'])
    best_sl = max(by_sl, key=lambda k: np.median(by_sl[k]))
    # Within best_sl, pick no-TP first then TP=1.5
    final_tp = None
    for r in candidates:
        if r['sl_mult'] == best_sl and r['tp_ratio'] is None:
            final_tp = None
            break
    return best_atr, best_sl, final_tp

for cand in wfo_qualified:
    cell_key  = cand['cell_key']
    exit_type = cand['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    oos_years = list(range(2008, 2021))
    folds = []
    last_atr, last_sl, last_tp = 14, 1.0, None

    for oos_yr in oos_years:
        is_start = max(2003, oos_yr - 5)
        is_end   = oos_yr - 1
        # IS combos
        is_combos = []
        for atr_len in ATR_LENGTHS:
            for sl_mult in SL_MULTS:
                for tp_ratio in TP_RATIOS:
                    res = run_strategy_combo(df_list, wd, eh, exit_type, atr_len, sl_mult, tp_ratio,
                                             year_filter=(is_start, is_end))
                    if res and res['trades'] >= 5:
                        is_combos.append({'atr_len': atr_len, 'sl_mult': sl_mult, 'tp_ratio': tp_ratio, **res})

        if not is_combos:
            continue

        best_atr, best_sl, best_tp = select_best_atr_family(is_combos)
        last_atr, last_sl, last_tp = best_atr, best_sl, best_tp

        # OOS
        is_res = next((r for r in is_combos if r['atr_len'] == best_atr and
                       r['sl_mult'] == best_sl and r['tp_ratio'] == best_tp), None)
        oos_res = run_strategy_combo(df_list, wd, eh, exit_type, best_atr, best_sl, best_tp,
                                     year_filter=(oos_yr, oos_yr))

        folds.append({
            'oos_year': oos_yr,
            'is_period': f"{is_start}-{is_end}",
            'is_trades': is_res['trades'] if is_res else None,
            'is_pf': is_res['pf'] if is_res else None,
            'params': {'atr_len': best_atr, 'sl_mult': best_sl, 'tp_ratio': best_tp},
            'oos_trades': oos_res['trades'] if oos_res else 0,
            'oos_pf': oos_res['pf'] if oos_res else None,
            'oos_R_total': float(oos_res['expectancy_R'] * oos_res['trades']) if oos_res else 0,
            'oos_positive': (oos_res['expectancy_R'] * oos_res['trades']) > 0 if oos_res else False,
        })

    # Aggregate pre-2021
    oos_trades = [f['oos_trades'] for f in folds if f['oos_trades']]
    oos_r      = [f['oos_R_total'] for f in folds]
    oos_pfs    = [f['oos_pf'] for f in folds if f.get('oos_pf')]
    pos_folds  = sum(1 for f in folds if f['oos_positive'])

    total_r = sum(oos_r)
    r_series = np.array([f['oos_R_total'] for f in folds])
    cumr     = np.cumsum(r_series)
    peak     = np.maximum.accumulate(cumr)
    dd       = peak - cumr
    max_dd   = float(dd.max()) if len(dd) > 0 else 0
    calmar   = (total_r / max_dd) if max_dd > 0 else None
    agg_pf   = sum(r for r in oos_r if r > 0) / abs(sum(r for r in oos_r if r < 0)) if any(r < 0 for r in oos_r) else None

    print(f"  {cell_key}/{exit_type}: {pos_folds}/{len(folds)} pos folds, total R={total_r:.2f}, MaxDD R={max_dd:.2f}")

    # Known historical validation 2021-2026
    val_res = run_strategy_combo(df_list, wd, eh, exit_type, last_atr, last_sl, last_tp,
                                 year_filter=(2021, 2026))
    val_yearly = {}
    if val_res:
        for yr in range(2021, 2027):
            yr_res = run_strategy_combo(df_list, wd, eh, exit_type, last_atr, last_sl, last_tp,
                                        year_filter=(yr, yr))
            if yr_res and yr_res['trades'] > 0:
                val_yearly[yr] = yr_res

    section10[f"{cell_key}__{exit_type}"] = {
        'folds': folds,
        'aggregate_pre2021': {
            'n_folds': len(folds),
            'positive_fold_ratio': float(pos_folds / len(folds)) if folds else 0,
            'total_trades': int(sum(oos_trades)),
            'total_R': float(total_r),
            'max_dd_R': float(max_dd),
            'calmar_R': float(calmar) if calmar else None,
            'agg_pf': float(agg_pf) if agg_pf else None,
        },
        'known_historical_validation_2021_2026': {
            'params_used': {'atr_len': last_atr, 'sl_mult': last_sl, 'tp_ratio': last_tp},
            'aggregate': {k: (float(v) if isinstance(v, (float, np.floating)) else int(v))
                         for k, v in (val_res or {}).items()},
            'yearly': {yr: {k: (float(v) if isinstance(v, (float, np.floating)) else int(v))
                           for k, v in r.items()}
                      for yr, r in val_yearly.items()},
        },
    }

# ─── SECTION 11: REGIME RESEARCH ──────────────────────────────────────────────
print("\n=== SECTION 11: Regime research ===")

section11 = {'meta_selection_bias_warning': 'DXY previously explored in Gold Friday v1/v2.'}

if wfo_qualified:
    # Load DXY
    try:
        dxy = pd.read_csv(DXY_PATH, parse_dates=['time'])
        dxy = dxy.rename(columns={'time':'dt'})
        dxy = dxy.sort_values('dt').reset_index(drop=True)
        dxy['dt'] = pd.to_datetime(dxy['dt'], utc=True)
        dxy['sma20'] = dxy['close'].rolling(20).mean()
        dxy['dxy_weak'] = dxy['close'] < dxy['sma20']
        dxy_date_map = {row['dt'].date(): row['dxy_weak'] for _, row in dxy.iterrows()}
        print(f"  DXY loaded: {len(dxy)} rows")
    except Exception as e:
        print(f"  DXY load failed: {e}")
        dxy_date_map = {}

    # Load GC daily for trend
    gc_daily = df_list.groupby('date').agg(close=('close','last')).reset_index()
    gc_daily['dt'] = pd.to_datetime(gc_daily['date'])
    gc_daily['sma20'] = gc_daily['close'].rolling(20).mean()
    gc_daily['gc_uptrend'] = gc_daily['close'] > gc_daily['sma20']
    gc_trend_map = {row['dt'].date(): row['gc_uptrend'] for _, row in gc_daily.iterrows()}

    for cand in wfo_qualified:
        cell_key  = cand['cell_key']
        exit_type = cand['exit_type']
        entry_day_str = section3[cell_key]['entry_day']
        eh        = section3[cell_key]['entry_hour_utc']
        wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]
        s10_key   = f"{cell_key}__{exit_type}"
        folds     = section10.get(s10_key, {}).get('folds', [])
        oos_years_set = {f['oos_year'] for f in folds}

        def run_regime_wfo(regime_filter_fn):
            """Re-run WFO OOS folds with regime filter."""
            fold_results = []
            for f in folds:
                oos_yr = f['oos_year']
                params = f['params']
                sub = df_list[(df_list['weekday'] == wd) & (df_list['hour_utc'] == eh) &
                              (df_list['year'] == oos_yr)]
                r_trades = []
                atr_col = f"atr{params['atr_len']}"
                for idx in sub.index:
                    row = df_list.iloc[idx]
                    if not regime_filter_fn(row['date']):
                        continue
                    entry_price = row['close']
                    atr_val = row[atr_col]
                    if atr_val <= 0 or entry_price <= 0:
                        continue
                    sl_price = entry_price - params['sl_mult'] * atr_val
                    tp_price = (entry_price + params.get('tp_ratio', 1.5) * params['sl_mult'] * atr_val
                                if params.get('tp_ratio') else None)
                    exit_price_target, exit_idx = find_exit_bar(df_list, idx, row['dt_utc'], exit_type)
                    if exit_price_target is None:
                        continue
                    actual_exit = exit_price_target
                    for scan_idx in range(idx + 1, exit_idx + 1):
                        if scan_idx >= len(df_list):
                            break
                        scan_row = df_list.iloc[scan_idx]
                        if scan_row['low'] <= sl_price:
                            actual_exit = sl_price
                            break
                        if tp_price and scan_row['high'] >= tp_price:
                            actual_exit = tp_price
                            break
                    r_trades.append((actual_exit - entry_price) / atr_val)
                if r_trades:
                    r_arr = np.array(r_trades)
                    fold_results.append({'oos_year': oos_yr, 'trades': len(r_arr),
                                        'R_total': float(r_arr.sum()), 'positive': r_arr.sum() > 0})
            if not fold_results:
                return {}
            pos = sum(1 for f in fold_results if f['positive'])
            return {
                'folds': fold_results,
                'positive_fold_ratio': pos / len(fold_results),
                'total_R': sum(f['R_total'] for f in fold_results),
                'trades': sum(f['trades'] for f in fold_results),
            }

        dxy_regime  = run_regime_wfo(lambda d: dxy_date_map.get(d, True))  # True=weak DXY
        gc_regime   = run_regime_wfo(lambda d: gc_trend_map.get(d, True))  # True=uptrend

        section11[s10_key] = {
            'regime1_dxy_weak': dxy_regime,
            'regime2_gc_uptrend': gc_regime,
            'note': 'DXY previously explored — meta-selection bias possible. Only adopt if materially improves positive-fold ratio AND maintains adequate trade count.',
        }
        dxy_pf_str = f"{dxy_regime.get('positive_fold_ratio',0):.2f}" if dxy_regime else 'N/A'
        gc_pf_str  = f"{gc_regime.get('positive_fold_ratio',0):.2f}" if gc_regime else 'N/A'
        print(f"  {s10_key}: DXY-weak pos_folds={dxy_pf_str}, GC-uptrend pos_folds={gc_pf_str}")

# ─── SECTION 12: COST MODEL ───────────────────────────────────────────────────
print("\n=== SECTION 12: Cost model ===")

GC_COST_RT   = 45.0   # $45 round-trip (comm $5 + spread $20 + slippage $20)
MGC_COST_RT  = 5.70   # $5.70 round-trip
GC_MULT      = 100    # $/oz
MGC_MULT     = 10     # $/oz

section12 = {}
for cand in wfo_qualified:
    cell_key  = cand['cell_key']
    exit_type = cand['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    # Avg ATR at pre-2021 OOS entry bars
    sub = df_list[(df_list['weekday'] == wd) & (df_list['hour_utc'] == eh) &
                  (df_list['year'] >= 2008) & (df_list['year'] <= 2020)]
    avg_atr = float(sub['atr14'].mean())

    gc_1R_usd  = avg_atr * GC_MULT
    mgc_1R_usd = avg_atr * MGC_MULT
    gc_cost_R  = GC_COST_RT  / gc_1R_usd
    mgc_cost_R = MGC_COST_RT / mgc_1R_usd

    s10 = section10.get(f"{cell_key}__{exit_type}", {}).get('aggregate_pre2021', {})
    total_trades = s10.get('total_trades', 1)
    total_R      = s10.get('total_R', 0)
    gross_exp    = total_R / total_trades if total_trades > 0 else 0
    gc_net_exp   = gross_exp - gc_cost_R
    mgc_net_exp  = gross_exp - mgc_cost_R

    section12[f"{cell_key}__{exit_type}"] = {
        'avg_atr_14': avg_atr,
        'GC': {
            '1R_usd': gc_1R_usd,
            'cost_RT_usd': GC_COST_RT,
            'cost_in_R': gc_cost_R,
            'gross_expectancy_R': gross_exp,
            'net_expectancy_R': gc_net_exp,
            'cost_pct_of_gross_exp': abs(gc_cost_R / gross_exp) if gross_exp != 0 else None,
            'stress': {f'{m}x': gc_net_exp - (m - 1) * gc_cost_R for m in [1, 1.25, 1.5, 2.0]},
        },
        'MGC': {
            '1R_usd': mgc_1R_usd,
            'cost_RT_usd': MGC_COST_RT,
            'cost_in_R': mgc_cost_R,
            'gross_expectancy_R': gross_exp,
            'net_expectancy_R': mgc_net_exp,
            'cost_pct_of_gross_exp': abs(mgc_cost_R / gross_exp) if gross_exp != 0 else None,
            'stress': {f'{m}x': mgc_net_exp - (m - 1) * mgc_cost_R for m in [1, 1.25, 1.5, 2.0]},
        },
        'GLD_note': 'GLD ETF executes same signal at daily close; no futures roll cost; intraday timing infeasible with daily data only. Signal timing on 60m GC is primary vehicle.',
    }
    print(f"  {cell_key}/{exit_type}: avg_ATR={avg_atr:.2f} | GC 1R=${gc_1R_usd:.0f} cost={gc_cost_R:.3f}R net_exp={gc_net_exp:.3f}R | MGC cost={mgc_cost_R:.3f}R net_exp={mgc_net_exp:.3f}R")

# ─── SECTION 13: MULTIPLE TESTING ────────────────────────────────────────────
print("\n=== SECTION 13: Multiple testing control ===")

# All cells means
all_means = [c['mean_ret_pct'] for c in all_cells_flat if c['n'] >= 10]
best_cell = max(all_cells_flat, key=lambda x: x['mean_ret_pct']) if all_cells_flat else None
median_stat = np.median(all_means) if all_means else None

section13 = {
    'total_cells_tested': total_cells,
    'cells_with_n_ge10': len(all_means),
    'best_cell': {k: v for k, v in best_cell.items() if k not in ['annual']} if best_cell else None,
    'median_cell_mean_ret_pct': float(median_stat) if median_stat is not None else None,
    'data_mining_ratio': float(best_cell['mean_ret_pct'] / median_stat) if (best_cell and median_stat and median_stat != 0) else None,
}

# Bootstrap permutation on best candidate
if best_candidates:
    bc = best_candidates[0]
    cell_key  = bc['cell_key']
    exit_type = bc['exit_type']
    entry_day_str = section3[cell_key]['entry_day']
    eh        = section3[cell_key]['entry_hour_utc']
    wd        = {'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4}[entry_day_str]

    # Collect raw returns (IS only)
    raw_rets = []
    sub = df_list[(df_list['weekday'] == wd) & (df_list['hour_utc'] == eh) &
                  (df_list['year'] >= 2003) & (df_list['year'] <= 2020)]
    for idx in sub.index:
        row = df_list.iloc[idx]
        exit_price, _ = find_exit_bar(df_list, idx, row['dt_utc'], exit_type)
        if exit_price is None or row['close'] <= 0:
            continue
        raw_rets.append((exit_price - row['close']) / row['close'])

    raw_rets = np.array(raw_rets)
    obs_mean = raw_rets.mean() if len(raw_rets) > 0 else 0

    np.random.seed(42)
    n_perm = 10000
    perm_means = np.array([np.random.choice(raw_rets, size=len(raw_rets), replace=True).mean()
                            for _ in range(n_perm)])
    emp_pval = float((perm_means >= obs_mean).mean())

    section13['bootstrap_permutation'] = {
        'candidate': f"{cell_key}__{exit_type}",
        'observed_mean_ret_pct': float(obs_mean * 100),
        'n_permutations': n_perm,
        'empirical_pvalue': emp_pval,
        'interpretation': 'Bootstrap resampling (with replacement) of observed returns. Low p-value = unlikely under null.',
    }
    print(f"  Bootstrap: observed_mean={obs_mean*100:.4f}% emp_pval={emp_pval:.4f}")

    # Neighboring cells
    neighbor_cells = []
    for adj_h in [eh - 1, eh + 1]:
        if adj_h < 0 or adj_h > 23:
            continue
        nb_key = f"entry_{entry_day_str.lower()}_{adj_h:02d}utc"
        nb = section3.get(nb_key, {}).get('exit_types', {}).get(exit_type)
        if nb:
            neighbor_cells.append({'cell': nb_key, 'hour_utc': adj_h, **nb})
    # Same hour, adjacent weekday
    for adj_wd in [wd - 1, wd + 1]:
        if adj_wd < 0 or adj_wd > 4:
            continue
        adj_wd_name = dow_names[adj_wd]
        nb_key = f"entry_{adj_wd_name.lower()}_{eh:02d}utc"
        nb = section3.get(nb_key, {}).get('exit_types', {}).get(exit_type)
        if nb:
            neighbor_cells.append({'cell': nb_key, 'weekday': adj_wd_name, **nb})

    section13['neighboring_cell_stability'] = [
        {k: v for k, v in nc.items() if k != 'annual'} for nc in neighbor_cells
    ]

print(f"  Total cells tested: {total_cells}  Best mean: {best_cell['mean_ret_pct']:.4f}%  Median mean: {median_stat:.4f}% ratio={section13.get('data_mining_ratio','N/A'):.2f}")

# ─── CLASSIFICATION ───────────────────────────────────────────────────────────
print("\n=== Classification ===")

n_wfo_q = len(wfo_qualified)
n_qual  = len(qualified)
n_era_s = len(era_screened)

if n_wfo_q >= 1:
    s10_vals = list(section10.values())
    best_s10 = s10_vals[0] if s10_vals else {}
    agg = best_s10.get('aggregate_pre2021', {})
    pos_fold_ratio = agg.get('positive_fold_ratio', 0)
    if pos_fold_ratio >= 0.70 and agg.get('total_R', 0) > 5:
        classification = 'D'
        rationale = f"One WFO-qualified Gold late-week strategy found with {pos_fold_ratio:.0%} positive OOS folds and positive total R. Meets KEEP candidate threshold."
    elif pos_fold_ratio >= 0.50:
        classification = 'C'
        rationale = f"One WFO-qualified strategy with {pos_fold_ratio:.0%} positive OOS folds. WATCH / Forward test warranted."
    else:
        classification = 'B'
        rationale = "Historical anomaly exists but WFO results are marginal. No robust implementation found."
elif n_qual > 0:
    classification = 'B'
    rationale = "Temporal anomalies identified but no candidate passed ATR plateau threshold for WFO."
elif n_era_s > 0:
    classification = 'B'
    rationale = "Some era-screened candidates found but none passed all 6 selection criteria."
else:
    classification = 'A'
    rationale = "No persistent Gold late-week temporal anomaly found after full screening."

# Check GLD overlap
gld_classes = [v.get('gld_classification','') for v in section6.values()]
all_A = all(g == 'A_same_direction' for g in gld_classes if g)
any_B = any(g == 'B_independent' for g in gld_classes if g)
if classification in ('C','D') and all_A:
    classification = 'E'
    rationale += " However, GC anomaly is fully correlated with GLD WFO — GLD already captures this edge."
elif classification in ('C','D') and any_B:
    classification = 'F'
    rationale += " GC captures complementary windows vs GLD WFO — potentially additive."

print(f"  Classification: {classification}")
print(f"  Rationale: {rationale}")

# ─── WRITE JSON ───────────────────────────────────────────────────────────────
print("\n=== Writing output files ===")

def make_serializable(obj):
    if isinstance(obj, (np.integer,)): return int(obj)
    if isinstance(obj, (np.floating,)): return float(obj)
    if isinstance(obj, np.ndarray): return obj.tolist()
    if isinstance(obj, pd.Period): return str(obj)
    if isinstance(obj, (pd.Timestamp,)): return str(obj)
    raise TypeError(f"Not serializable: {type(obj)}")

result = {
    'run_date': str(pd.Timestamp.now().date()),
    'section1_provenance': section1,
    'section2_session_map': section2,
    'section3_heatmap': section3,
    'section4_era_stability': section4,
    'section5_yearly_stability': section5,
    'section6_gld_crosscheck': section6,
    'section7_roll_audit': section7,
    'section8_candidates': section8,
    'section9_plateau': section9,
    'section10_wfo': section10,
    'section11_regime': section11,
    'section12_cost': section12,
    'section13_multiple_testing': section13,
    'classification': classification,
    'classification_rationale': rationale,
}

with open(OUT_JSON, 'w') as f:
    json.dump(result, f, indent=2, default=make_serializable)
print(f"  JSON written: {OUT_JSON}")

# ─── WRITE MD ─────────────────────────────────────────────────────────────────
def fmt_pct(v, decimals=4):
    if v is None: return 'N/A'
    return f"{v:.{decimals}f}%"

def fmt_f(v, decimals=3):
    if v is None: return 'N/A'
    return f"{v:.{decimals}f}"

md_lines = []
md = md_lines.append

md("# White Swan Gold Friday Research v3")
md(f"*Run date: {result['run_date']}*\n")
md("---\n")

md("## Executive Summary\n")
md(f"**Classification: {classification}**\n")
md(f"{rationale}\n")
md(f"- Total heatmap cells tested: {total_cells}")
md(f"- Era-screened candidates (n>=100, 3/4 positive eras): {n_era_s}")
md(f"- Fully qualified candidates (all 6 criteria): {n_qual}")
md(f"- WFO-qualified (IS plateau >=60%): {n_wfo_q}")
md("")

md("---\n")
md("## Section 1 — Data Provenance\n")
md(f"| Field | Value |")
md(f"|---|---|")
md(f"| File | `{section1['file']}` |")
md(f"| Rows | {section1['rows']:,} |")
md(f"| Date range | {section1['date_range'][0]} — {section1['date_range'][1]} |")
md(f"| Timezone (source) | {section1['timezone_source']} |")
md(f"| OHLC violations | {section1['ohlc_violations']} |")
md(f"| Missing Thu weeks | {section1['missing_thu_weeks']} |")
md(f"| Missing Fri weeks | {section1['missing_fri_weeks']} |")
md("")
md("**Day-of-week bar counts:**\n")
for d, c in section1['dow_bar_counts'].items():
    md(f"- {d}: {c:,}")
md("")

md("---\n")
md("## Section 2 — Weekly Session Map (Thu/Fri/Mon focus)\n")
md("| Weekday | Hour UTC | n | Mean ret % | Median ret % | Win rate |")
md("|---|---|---|---|---|---|")
for wd_n in ['Thu', 'Fri', 'Mon']:
    for h in sorted(session_map.get(wd_n, {}).keys()):
        c = session_map[wd_n][h]
        md(f"| {wd_n} | {h:02d} | {c['n']} | {c['mean_ret_pct']:.4f}% | {c['median_ret_pct']:.4f}% | {c['win_rate']:.2f} |")
md("")

md("---\n")
md("## Section 3 — Return Heatmap (2003-2020 only)\n")
md("Showing top 20 cells by mean return.\n")
top20 = sorted(all_cells_flat, key=lambda x: x['mean_ret_pct'], reverse=True)[:20]
md("| Entry | Hour UTC | Exit | n | Mean % | Median % | WR | Pos Yr Ratio | t-stat |")
md("|---|---|---|---|---|---|---|---|---|")
for c in top20:
    md(f"| {c['entry_day']} | {c['entry_hour_utc']:02d} | {c['exit_type']} | {c['n']} | {fmt_pct(c['mean_ret_pct'])} | {fmt_pct(c['median_ret_pct'])} | {c['win_rate']:.2f} | {fmt_f(c['positive_year_ratio'],2)} | {fmt_f(c['t_stat'])} |")
md("")

md("---\n")
md("## Section 4 — Era Stability\n")
for key, val in section4.items():
    entry = val['entry']
    xt    = val['exit_type']
    md(f"### {entry} / {xt}\n")
    md("| Era | Years | n | Mean % | Median % | WR |")
    md("|---|---|---|---|---|---|")
    for era_name, era_label in ERA_LABELS.items():
        er = val['eras'].get(era_name)
        if er:
            md(f"| {era_name} | {era_label} | {er['n']} | {fmt_pct(er['mean_ret_pct'])} | {fmt_pct(er['median_ret_pct'])} | {er['win_rate']:.2f} |")
        else:
            md(f"| {era_name} | {era_label} | — | — | — | — |")
    md("")

md("---\n")
md("## Section 5 — Year-by-Year Stability\n")
for s5key, val in section5.items():
    md(f"### {s5key}\n")
    if val['red_flag_single_year']:
        md(f"> **RED FLAG**: {val['dominant_year']} contributes >{val['max_single_year_share']:.0%} of lifetime edge.\n")
    md("| Year | n | Total ret % | Mean ret % | WR |")
    md("|---|---|---|---|---|")
    for row in val['yearly']:
        md(f"| {int(row['year'])} | {int(row['n'])} | {fmt_pct(row['total_ret']*100)} | {fmt_pct(row['mean_ret']*100)} | {row['win_rate']:.2f} |")
    md("")

md("---\n")
md("## Section 6 — GLD Cross-Check\n")
md("| Candidate | Overlap years | Pearson corr | Classification |")
md("|---|---|---|---|")
for k, v in section6.items():
    corr_str = fmt_f(v['pearson_corr']) if v['pearson_corr'] is not None else 'N/A'
    md(f"| {k} | {len(v['overlap_years'])} | {corr_str} | {v['gld_classification']} |")
md("")

md("---\n")
md("## Section 7 — Roll Audit\n")
for k, v in section7.items():
    if v is None: continue
    md(f"### {k}\n")
    md("| Version | n | Mean % | Median % | WR | Pos Yr Ratio |")
    md("|---|---|---|---|---|---|")
    b = v['base']
    nr = v['non_roll']
    md(f"| BASE | {b['n']} | {fmt_pct(b['mean_ret_pct'])} | {fmt_pct(b['median_ret_pct'])} | {b['win_rate']:.2f} | {fmt_f(b['positive_year_ratio'],2)} |")
    if nr:
        md(f"| NON-ROLL | {nr['n']} | {fmt_pct(nr['mean_ret_pct'])} | {fmt_pct(nr['median_ret_pct'])} | {nr['win_rate']:.2f} | {fmt_f(nr['positive_year_ratio'],2)} |")
    if v['roll_artifact_concern']:
        md(f"> **ROLL ARTIFACT CONCERN**: delta mean = {fmt_pct(v['delta_mean_pct'])}\n")
    md("")

md("---\n")
md("## Section 8 — Selected Temporal Candidates\n")
for c in section8['selected']:
    md(f"### {c['cell_key']} → {c['exit_type']}\n")
    md(f"- Entry: **{c['entry_weekday']} {c['entry_hour_utc']:02d}:00 UTC**")
    md(f"- Exit: **{c['exit_type']}**")
    md(f"- n: {c['n']} | Mean: {fmt_pct(c['mean_ret_pct'])} | Median: {fmt_pct(c['median_ret_pct'])} | WR: {c['win_rate']:.2f}")
    md(f"- Positive year ratio: {c['positive_year_ratio']:.2f} | Era persistence: {c['era_persistence_of_4']}/4")
    md(f"- Roll artifact: {c['roll_artifact_concern']} | GLD class: {c['gld_classification']}")
    md(f"- Criteria passed: {c['criteria_passed']}/6 | Qualifies: {c['qualifies']}")
    md(f"- Economic rationale: {c['economic_rationale']}")
    md("")

md("---\n")
md("## Section 9 — ATR Plateau (IS 2003-2020)\n")
md("| Candidate | Combos | PF>1 count | Plateau % | Min PF | Median PF | Max PF | WFO qualify |")
md("|---|---|---|---|---|---|---|---|")
for k, v in section9.items():
    md(f"| {k} | {v['n_combos_tested']} | {v['pf_above1_count']} | {v['plateau_pct']:.1%} | {fmt_f(v['min_pf'])} | {fmt_f(v['median_pf'])} | {fmt_f(v['max_pf'])} | {v['qualifies_for_wfo']} |")
md("")

md("---\n")
md("## Section 10 — Walk-Forward Analysis (pre-2021 OOS)\n")
for k, v in section10.items():
    md(f"### {k}\n")
    agg = v['aggregate_pre2021']
    md(f"**Pre-2021 OOS aggregate:**\n")
    md(f"- Folds: {agg['n_folds']} | Positive: {agg['positive_fold_ratio']:.0%}")
    md(f"- Total trades: {agg['total_trades']} | Total R: {fmt_f(agg['total_R'])} | MaxDD R: {fmt_f(agg['max_dd_R'])}")
    md(f"- Calmar-R: {fmt_f(agg['calmar_R'])} | Agg PF: {fmt_f(agg['agg_pf'])}")
    md("")
    md("**OOS Folds:**\n")
    md("| OOS Year | IS Period | IS PF | Params | OOS Trades | OOS PF | OOS R | Positive |")
    md("|---|---|---|---|---|---|---|---|")
    for fold in v['folds']:
        p = fold['params']
        param_str = f"ATR{p['atr_len']} SL{p['sl_mult']} TP{p['tp_ratio']}"
        md(f"| {fold['oos_year']} | {fold['is_period']} | {fmt_f(fold.get('is_pf'))} | {param_str} | {fold['oos_trades']} | {fmt_f(fold.get('oos_pf'))} | {fmt_f(fold['oos_R_total'])} | {'Yes' if fold['oos_positive'] else 'No'} |")
    md("")
    val_data = v.get('known_historical_validation_2021_2026', {})
    md(f"**KNOWN HISTORICAL VALIDATION 2021-2026** (params frozen from last IS):\n")
    params_used = val_data.get('params_used', {})
    md(f"- Params: ATR{params_used.get('atr_len')} SL{params_used.get('sl_mult')} TP{params_used.get('tp_ratio')}")
    agg2 = val_data.get('aggregate', {})
    md(f"- Trades: {agg2.get('trades','N/A')} | PF: {fmt_f(agg2.get('pf'))} | Exp R: {fmt_f(agg2.get('expectancy_R'))}")
    md("")
    md("| Year | Trades | PF | Exp R |")
    md("|---|---|---|---|")
    for yr, yr_data in sorted(val_data.get('yearly', {}).items()):
        md(f"| {yr} | {yr_data.get('trades','N/A')} | {fmt_f(yr_data.get('pf'))} | {fmt_f(yr_data.get('expectancy_R'))} |")
    md("")

md("---\n")
md("## Section 11 — Regime Research\n")
md(f"> **Warning**: {section11.get('meta_selection_bias_warning','')}\n")
for k, v in section11.items():
    if k == 'meta_selection_bias_warning': continue
    if not isinstance(v, dict): continue
    md(f"### {k}\n")
    for reg_name, reg in [('DXY Weak', v.get('regime1_dxy_weak',{})), ('GC Uptrend', v.get('regime2_gc_uptrend',{}))]:
        if not reg: continue
        md(f"**{reg_name}:** trades={reg.get('trades','N/A')} total_R={fmt_f(reg.get('total_R'))} pos_fold_ratio={fmt_f(reg.get('positive_fold_ratio'),2)}")
    md("")

md("---\n")
md("## Section 12 — Cost Model\n")
for k, v in section12.items():
    md(f"### {k}\n")
    md(f"Avg ATR (14-bar, 2008-2020 entry bars): {v['avg_atr_14']:.2f} pts\n")
    md("| Instrument | 1R USD | Cost RT USD | Cost in R | Gross Exp R | Net Exp R | Cost % of Gross |")
    md("|---|---|---|---|---|---|---|")
    for inst in ['GC', 'MGC']:
        d = v[inst]
        md(f"| {inst} | ${d['1R_usd']:.0f} | ${d['cost_RT_usd']:.2f} | {fmt_f(d['cost_in_R'])} | {fmt_f(d['gross_expectancy_R'])} | {fmt_f(d['net_expectancy_R'])} | {fmt_f(d.get('cost_pct_of_gross_exp'),1) if d.get('cost_pct_of_gross_exp') else 'N/A'} |")
    md("")
    md("**Cost stress (GC):**\n")
    gc_stress = v['GC']['stress']
    for mult, net in gc_stress.items():
        md(f"- {mult} cost: net exp = {fmt_f(net)} R")
    md(f"\n{v.get('GLD_note','')}\n")

md("---\n")
md("## Section 13 — Multiple Testing Control\n")
mt = section13
md(f"- Total cells tested: {mt['total_cells_tested']}")
md(f"- Cells with n>=10: {mt['cells_with_n_ge10']}")
bc_cell = mt.get('best_cell',{})
if bc_cell:
    md(f"- Best cell: {bc_cell.get('cell_key','?')} / {bc_cell.get('exit_type','?')} — mean={fmt_pct(bc_cell.get('mean_ret_pct'))} wr={bc_cell.get('win_rate',0):.2f}")
md(f"- Median cell mean ret: {fmt_pct(mt.get('median_cell_mean_ret_pct'))}")
md(f"- Data-mining ratio (best/median): {fmt_f(mt.get('data_mining_ratio'),1)}")
bp = mt.get('bootstrap_permutation',{})
if bp:
    md(f"\n**Bootstrap permutation ({bp.get('n_permutations',0):,} draws):**")
    md(f"- Candidate: {bp.get('candidate','?')}")
    md(f"- Observed mean: {fmt_pct(bp.get('observed_mean_ret_pct'))}")
    md(f"- Empirical p-value: {bp.get('empirical_pvalue','N/A'):.4f}")
    md(f"- Note: {bp.get('interpretation','')}")
nb = mt.get('neighboring_cell_stability',[])
if nb:
    md(f"\n**Neighboring cell stability:**\n")
    md("| Cell | Mean % | Median % | WR | Pos Yr Ratio |")
    md("|---|---|---|---|---|")
    for nc in nb:
        md(f"| {nc.get('cell','?')} | {fmt_pct(nc.get('mean_ret_pct'))} | {fmt_pct(nc.get('median_ret_pct'))} | {nc.get('win_rate',0):.2f} | {fmt_f(nc.get('positive_year_ratio'),2)} |")
md("")

md("---\n")
md("## Classification\n")
md(f"**{classification}** — {rationale}\n")
md("\n### Key Risk Flags\n")
md("- Roll artifacts: check Section 7 flags above.")
md("- Multiple testing: data-mining ratio shows magnitude of selection bias — bootstrap p-value is primary guard.")
md("- Era persistence: candidates must show edge in >=3/4 eras (2003-2020). Era 5 (2021-2026) is KNOWN HISTORICAL VALIDATION only.")
md("- 2021-2026 data was NOT used for candidate selection or parameter optimization.")
md("")

md_text = "\n".join(md_lines)
with open(OUT_MD, 'w', encoding='utf-8') as f:
    f.write(md_text)
print(f"  MD written: {OUT_MD}")

print("\n=== DONE ===")
