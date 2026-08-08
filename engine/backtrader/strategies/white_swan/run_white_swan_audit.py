"""
White Swan Strategy Audit -- Walk-Forward Runner (Vectorized)
Runs WFO for all three strategies and saves results to JSON.

WFO Protocol:
  - Pre-2021 data only for IS/OOS parameter selection
  - Rolling: IS window -> 1-year OOS
  - GC1 data starts 2016-06: use 2yr IS windows (data limitation documented)
  - FDAX data starts 2007-03: use 5yr IS windows
  - GLD data starts 2004-11: use 5yr IS windows
  - Freeze best family -> run 2021+ exactly once as final holdout
  - IS optimization criterion: Profit Factor (maximize)

Execution model (vectorized, no Backtrader overhead):
  - Entry: market order at next bar open after signal bar
  - Stop/target: checked at each bar using high/low (worst-case fill = stop at stop_price, TP at tp_price)
  - No look-ahead on regime data (prior-day confirmed via shift(1))
  - Commission applied to each trade
"""

import sys, os, json, warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
from datetime import datetime
from itertools import product

# ---- File paths ---------------------------------------------------------------
DOWNLOADS = r"C:\Users\joris\Downloads"
GC_CSV    = os.path.join(DOWNLOADS, "COMEX_DL_GC1!, 240_dc277.csv")
FDAX_CSV  = os.path.join(DOWNLOADS, "EUREX_FDAX_30min_gesamt_2007-2026.csv")
GLD_CSV   = os.path.join(DOWNLOADS, "BATS_GLD, 1D_4975f.csv")
VIX_CSV   = os.path.join(DOWNLOADS, "TVC_VIX, 1D_402f7.csv")
US10Y_CSV = os.path.join(DOWNLOADS, "TVC_US10Y, 1D_935af.csv")
DXY_CSV   = os.path.join(DOWNLOADS, "ICEUS_DLY_DXY, 1D_3217e.csv")

REPORT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "reports")
os.makedirs(REPORT_DIR, exist_ok=True)
REPORT_PATH = os.path.join(REPORT_DIR, "white_swan_audit_results.json")

# ---- Helpers -----------------------------------------------------------------

def to_utc(x):
    if x is None:
        return None
    ts = pd.Timestamp(x)
    if ts.tzinfo is None:
        return ts.tz_localize('UTC')
    return ts.tz_convert('UTC')


# ---- Data loading -------------------------------------------------------------

def load_ohlc_intraday(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df['dt'] = pd.to_datetime(df['time'], utc=True)
    df = df.sort_values('dt').reset_index(drop=True)
    for c in ['open','high','low','close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    if 'volume' in df.columns:
        df['volume'] = pd.to_numeric(df['volume'], errors='coerce').fillna(0)
    else:
        df['volume'] = 0.0
    return df.dropna(subset=['open','high','low','close']).reset_index(drop=True)


def load_daily(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df['date'] = pd.to_datetime(df['time']).dt.date
    df = df.sort_values('date').reset_index(drop=True)
    df['close'] = pd.to_numeric(df['close'], errors='coerce')
    return df.dropna(subset=['close']).set_index('date')['close']


# ---- Metrics from trade list --------------------------------------------------

def metrics_from_trades(trades, initial_cash=100_000):
    """
    trades: list of dicts {entry_date, exit_date, pnl_dollar, direction}
    Returns: dict of cagr, max_dd, calmar, pf, win_rate, trades count
    """
    if not trades:
        return {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0}

    pnls = [t['pnl_dollar'] for t in trades]
    winners = [p for p in pnls if p > 0]
    losers  = [p for p in pnls if p <= 0]

    gp = sum(winners) if winners else 0
    gl = abs(sum(losers)) if losers else 1e-9
    pf = gp / gl
    wr = len(winners) / len(pnls)

    # Build equity curve (daily)
    dates = sorted(set(t['exit_date'] for t in trades))
    if not dates:
        return {'cagr':0,'max_dd':0,'calmar':0,'pf':round(pf,4),'win_rate':round(wr,4),'trades':len(pnls)}

    eq = initial_cash
    equity_vals = {}
    # Group trades by exit date
    by_date = {}
    for t in trades:
        by_date.setdefault(t['exit_date'], []).append(t['pnl_dollar'])

    eq_series = []
    cumulative = initial_cash
    for d in sorted(by_date.keys()):
        cumulative += sum(by_date[d])
        eq_series.append(cumulative)

    eq_arr = np.array(eq_series, dtype=float)
    if len(eq_arr) < 2:
        return {'cagr':0,'max_dd':0,'calmar':0,'pf':round(pf,4),'win_rate':round(wr,4),'trades':len(pnls)}

    first_date = sorted(by_date.keys())[0]
    last_date  = sorted(by_date.keys())[-1]
    # Convert dates
    try:
        d0 = pd.Timestamp(str(first_date))
        d1 = pd.Timestamp(str(last_date))
        years = max((d1 - d0).days / 365.25, 0.1)
    except Exception:
        years = 1.0

    final_val = eq_arr[-1]
    cagr = (final_val / initial_cash) ** (1 / years) - 1

    roll_max = np.maximum.accumulate(eq_arr)
    dd = (eq_arr - roll_max) / roll_max
    max_dd = float(dd.min())
    calmar = cagr / abs(max_dd) if abs(max_dd) > 1e-9 else 0.0

    return {
        'cagr':   round(float(cagr), 4),
        'max_dd': round(float(max_dd), 4),
        'calmar': round(float(calmar), 4),
        'pf':     round(float(pf), 4),
        'win_rate': round(float(wr), 4),
        'trades': len(pnls),
    }


# ==============================================================================
# Strategy 1: Gold Friday Long (GC1 240m)
# ==============================================================================

def backtest_gold_friday(df, atr_len=10, sl_atr=1.0, rr=1.5,
                          risk_pct=0.01, contract_pts=100,
                          commission_per_side=3.0,
                          initial_cash=100_000,
                          from_dt=None, to_dt=None):
    """
    Vectorized backtest for Gold Friday Long.
    Entry: signal on Friday bar with UTC hour in [13..18] (penultimate session bar)
           -> enter at NEXT bar's open
    Exit:  Friday bar with hour >= 19 (session close), OR stop/target hit
    Stop:  entry - sl_atr * ATR
    Target: entry + sl_atr * ATR * rr

    Commission: $3/side/contract applied to P&L.
    Contract size: 100 oz -> $100 per point.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < atr_len + 5:
        return []

    # Compute ATR
    hl   = d['high'] - d['low']
    hpc  = (d['high'] - d['close'].shift(1)).abs()
    lpc  = (d['low']  - d['close'].shift(1)).abs()
    tr   = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    atr  = tr.rolling(atr_len).mean()

    d['atr'] = atr
    d['weekday'] = d['dt'].dt.weekday  # 0=Mon, 4=Fri
    d['hour_utc'] = d['dt'].dt.hour

    # Signal bars: Friday, hour 13-18, ATR valid
    signal_mask = (d['weekday'] == 4) & (d['hour_utc'].between(13, 18)) & (d['atr'].notna())

    trades = []
    equity = initial_cash
    in_trade = False
    entry_price = stop_price = target_price = size = 0

    for i in range(len(d) - 1):
        if not in_trade:
            if signal_mask.iloc[i]:
                a = d['atr'].iloc[i]
                ep = d['open'].iloc[i + 1]   # entry at next bar open
                sd = sl_atr * a
                sp = ep - sd
                tp = ep + sd * rr

                # Size: 1% risk
                stop_usd = sd * contract_pts
                if stop_usd <= 0:
                    continue
                sz = max(1, int(equity * risk_pct / stop_usd))

                in_trade = True
                entry_price = ep
                stop_price  = sp
                target_price = tp
                size = sz
                entry_bar = i + 1
                entry_date = d['dt'].iloc[i + 1].date()
        else:
            bar = d.iloc[i]
            exit_price = None
            reason = None

            # Stop hit
            if bar['low'] <= stop_price:
                exit_price = stop_price
                reason = 'stop'
            # Target hit
            elif bar['high'] >= target_price:
                exit_price = target_price
                reason = 'target'
            # Time exit: Friday session-close bar
            elif bar['weekday'] == 4 and bar['hour_utc'] >= 19:
                exit_price = bar['close']
                reason = 'time_fri'
            # Force exit if Monday (missed time exit)
            elif bar['weekday'] == 0 and i > entry_bar:
                exit_price = bar['open']
                reason = 'force'

            if exit_price is not None:
                gross_pnl = (exit_price - entry_price) * size * contract_pts
                comm = commission_per_side * 2 * size   # round-turn
                net_pnl = gross_pnl - comm
                equity += net_pnl

                trades.append({
                    'entry_date': entry_date,
                    'exit_date': bar['dt'].date(),
                    'entry_price': round(entry_price, 2),
                    'exit_price': round(exit_price, 2),
                    'size': size,
                    'pnl_dollar': round(net_pnl, 2),
                    'reason': reason,
                })
                in_trade = False

    return trades


# ==============================================================================
# Strategy 2: DAX Turnaround Tuesday (FDAX 30m)
# ==============================================================================

def _compute_daily_atr_sma(df30m, atr_len=7):
    """Compute daily ATR SMA from 30m data, aligned back to 30m bars (prior-day)."""
    d = df30m.copy()
    d['date_berlin'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.date
    d['date_str'] = d['date_berlin'].astype(str)

    # Daily OHLC
    daily = d.groupby('date_berlin').agg(
        high=('high','max'), low=('low','min'), close=('close','last')
    ).reset_index()
    daily = daily.sort_values('date_berlin').reset_index(drop=True)

    # Daily TR
    daily['prev_close'] = daily['close'].shift(1)
    daily['tr'] = daily[['high','low','prev_close']].apply(
        lambda r: max(r['high']-r['low'],
                      abs(r['high']-r['prev_close']) if pd.notna(r['prev_close']) else 0,
                      abs(r['low'] -r['prev_close']) if pd.notna(r['prev_close']) else 0),
        axis=1
    )
    daily['atr_sma'] = daily['tr'].rolling(atr_len).mean()
    # Shift by 1 to get prior-day confirmed value
    daily['atr_sma_prev'] = daily['atr_sma'].shift(1)
    daily['date_str'] = daily['date_berlin'].astype(str)

    atr_map = dict(zip(daily['date_str'], daily['atr_sma_prev']))
    return atr_map


def backtest_dax_tuesday(df, atr_len=7, sl_atr=1.5, rr=1.5,
                          risk_pct=0.01, contract_size=25,
                          commission_eur=2.50, spread_pct=0.00075,
                          vix_regime=None, us10y_regime=None,
                          initial_cash=100_000,
                          from_dt=None, to_dt=None):
    """
    Vectorized DAX Turnaround Tuesday.
    Entry: Monday bar at 16:30 UTC (CET 17:30) or 15:30 UTC (CEST 17:30)
           -> enter at NEXT bar open
    Exit: Wednesday bar at 16:30 or 15:30 UTC
          OR stop/target hit
    Stop: prior-day ATR_SMA * sl_atr
    Target: stop_dist * rr

    Commission: 2.50 EUR/side + 0.075% spread/side (applied per trade).
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < 100:
        return []

    atr_map = _compute_daily_atr_sma(d, atr_len)

    d['weekday'] = d['dt'].dt.weekday  # 0=Mon, 2=Wed
    d['hour_utc'] = d['dt'].dt.hour
    d['minute'] = d['dt'].dt.minute
    d['date_str'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.strftime('%Y-%m-%d')

    # Entry: Monday, hour 15 or 16, minute 30 (= 17:30 Berlin)
    entry_mask = (d['weekday'] == 0) & (d['hour_utc'].isin([15, 16])) & (d['minute'] == 30)
    # Exit: Wednesday, same time
    exit_mask  = (d['weekday'] == 2) & (d['hour_utc'].isin([15, 16])) & (d['minute'] == 30)

    trades = []
    equity = initial_cash
    in_trade = False
    entry_price = stop_price = target_price = size = 0

    def regime_mult(date_str):
        bad = 0
        if vix_regime and vix_regime.get(date_str, False):
            bad += 1
        if us10y_regime and us10y_regime.get(date_str, False):
            bad += 1
        # Bad condition 1: DAX ATR low (computed inside daily, approximated via atr_map value vs its MA)
        # Here we don't have the MA of ATR, so we skip this component to avoid forward bias
        # (In full implementation, pre-compute daily ATR MA and include it)
        return 1.00 if bad == 0 else (0.75 if bad == 1 else 0.50)

    for i in range(len(d) - 1):
        if not in_trade:
            if entry_mask.iloc[i]:
                ds = d['date_str'].iloc[i]
                atr_sma = atr_map.get(ds)
                if atr_sma is None or np.isnan(atr_sma) or atr_sma <= 0:
                    continue

                ep = d['open'].iloc[i + 1]
                sd = sl_atr * atr_sma
                sp = ep - sd
                tp = ep + sd * rr

                rm = regime_mult(ds)
                stop_eur = sd * contract_size
                if stop_eur <= 0:
                    continue
                sz = max(1, int(equity * risk_pct * rm / stop_eur))

                in_trade = True
                entry_price = ep
                stop_price  = sp
                target_price = tp
                size = sz
                entry_date = d['dt'].iloc[i + 1].date()
                entry_bar = i + 1
        else:
            bar = d.iloc[i]
            exit_price = None
            reason = None

            if bar['low'] <= stop_price:
                exit_price = stop_price
                reason = 'stop'
            elif bar['high'] >= target_price:
                exit_price = target_price
                reason = 'target'
            elif exit_mask.iloc[i]:
                exit_price = bar['close']
                reason = 'time_wed'
            elif bar['weekday'] > 2 and i > entry_bar + 2:
                exit_price = bar['open']
                reason = 'force'

            if exit_price is not None:
                gross = (exit_price - entry_price) * size * contract_size
                comm = (commission_eur + exit_price * spread_pct * contract_size) * 2 * size
                net = gross - comm
                equity += net

                trades.append({
                    'entry_date': entry_date,
                    'exit_date': bar['dt'].date(),
                    'entry_price': round(entry_price, 2),
                    'exit_price': round(exit_price, 2),
                    'size': size,
                    'pnl_dollar': round(net, 2),
                    'reason': reason,
                })
                in_trade = False

    return trades


# ==============================================================================
# Strategy 3: GLD Thursday Long (Daily)
# ==============================================================================

def backtest_gld_thursday(df, atr_len=14, sl_atr=1.0, tp_r=0.0,
                           risk_pct=0.01, commission_pct=0.0002,
                           dxy_bad=None, us10y_bad=None,
                           initial_cash=100_000,
                           from_dt=None, to_dt=None):
    """
    Vectorized GLD Thursday Close Long.
    Entry: Thursday daily bar -> buy at NEXT bar open (Friday open)
    Exit: Friday close
    Stop: ATR-based safety stop checked at Friday bar
    TP: optional (tp_r > 0)
    Commission: 0.02% per side (roundtrip 0.04%)
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < atr_len + 5:
        return []

    # ATR
    hl   = d['high'] - d['low']
    hpc  = (d['high'] - d['close'].shift(1)).abs()
    lpc  = (d['low']  - d['close'].shift(1)).abs()
    tr   = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    atr  = tr.rolling(atr_len).mean()
    d['atr'] = atr

    d['weekday'] = d['dt'].dt.weekday
    d['date_str'] = d['dt'].dt.strftime('%Y-%m-%d')

    signal_mask = (d['weekday'] == 3) & (d['atr'].notna())  # Thursday

    def size_mult(date_str):
        bad = 0
        if dxy_bad and dxy_bad.get(date_str, False):
            bad += 1
        if us10y_bad and us10y_bad.get(date_str, False):
            bad += 1
        return 0.5 if bad > 0 else 1.0

    trades = []
    equity = initial_cash

    i = 0
    while i < len(d) - 1:
        if signal_mask.iloc[i]:
            a = d['atr'].iloc[i]
            ep = d['open'].iloc[i + 1]   # Friday open
            sd = sl_atr * a
            sp = ep - sd

            ds = d['date_str'].iloc[i]
            sm = size_mult(ds)
            sz = max(1, int(equity * risk_pct * sm / sd)) if sd > 0 else 1

            # Look at exit bar (i+1 = Friday)
            fri = d.iloc[i + 1]
            exit_price = None
            reason = None

            if fri['low'] <= sp:
                exit_price = sp
                reason = 'stop'
            elif tp_r > 0 and fri['high'] >= ep + sd * tp_r:
                exit_price = ep + sd * tp_r
                reason = 'target'
            else:
                exit_price = fri['close']
                reason = 'time_fri'

            comm = exit_price * commission_pct * 2 * sz
            gross = (exit_price - ep) * sz
            net = gross - comm
            equity += net

            trades.append({
                'entry_date': d['dt'].iloc[i + 1].date(),
                'exit_date':  fri['dt'].date(),
                'entry_price': round(ep, 4),
                'exit_price':  round(exit_price, 4),
                'size': sz,
                'pnl_dollar': round(net, 4),
                'reason': reason,
            })
            i += 2  # skip to bar after Friday
        else:
            i += 1

    return trades


# ==============================================================================
# Regime builders
# ==============================================================================

def build_regime(series, ma_len, condition='below'):
    """
    condition='below': bad if series < MA (VIX below MA)
    condition='above': bad if series > MA (US10Y above MA)
    Returns dict {date_str -> bool}
    """
    ma = series.rolling(ma_len).mean()
    if condition == 'below':
        bad = series < ma
    else:
        bad = series > ma
    bad_shifted = bad.shift(1).fillna(False)
    return {str(d): bool(v) for d, v in bad_shifted.items()}


# ==============================================================================
# WFO Engine
# ==============================================================================

def run_wfo(name, backtest_fn, df, param_grid, extra_kwargs,
            is_years, oos_years, data_start_year,
            holdout_start='2021-01-01', initial_cash=100_000):

    print(f"\n{'='*60}")
    print(f"WFO: {name}")
    print(f"{'='*60}")

    holdout_dt = pd.Timestamp(holdout_start, tz='UTC')

    # Build fold windows
    folds = []
    oos_year = data_start_year + is_years
    while True:
        is_start = pd.Timestamp(f"{oos_year - is_years}-01-01", tz='UTC')
        is_end   = pd.Timestamp(f"{oos_year}-01-01", tz='UTC')
        oos_end  = pd.Timestamp(f"{oos_year + oos_years}-01-01", tz='UTC')
        if is_end >= holdout_dt:
            break
        folds.append({
            'is_start': is_start, 'is_end': is_end,
            'oos_start': is_end,  'oos_end': min(oos_end, holdout_dt),
        })
        oos_year += oos_years

    print(f"  {len(folds)} WFO folds planned")

    param_names = list(param_grid.keys())
    param_combos = list(product(*param_grid.values()))

    fold_results = []
    all_best_params = []

    for fi, fold in enumerate(folds):
        print(f"  Fold {fi+1}/{len(folds)}: IS {fold['is_start'].date()} -> {fold['is_end'].date()} | OOS {fold['oos_start'].date()} -> {fold['oos_end'].date()}")

        best_pf = -999
        best_params = None
        best_is_m = None

        for combo in param_combos:
            params = dict(zip(param_names, combo))
            kwargs = {**extra_kwargs, **params,
                      'from_dt': fold['is_start'], 'to_dt': fold['is_end'],
                      'initial_cash': initial_cash}
            try:
                trades = backtest_fn(df, **kwargs)
                m = metrics_from_trades(trades, initial_cash)
            except Exception as e:
                continue

            if m['trades'] < 5:
                continue
            if m['pf'] > best_pf:
                best_pf = m['pf']
                best_params = params
                best_is_m = m

        if best_params is None:
            print(f"    No valid IS params -- skipping fold")
            continue

        print(f"    Best IS: {best_params} PF={best_pf:.3f} trades={best_is_m['trades']}")

        # OOS
        oos_kwargs = {**extra_kwargs, **best_params,
                      'from_dt': fold['oos_start'], 'to_dt': fold['oos_end'],
                      'initial_cash': initial_cash}
        try:
            oos_trades = backtest_fn(df, **oos_kwargs)
            oos_m = metrics_from_trades(oos_trades, initial_cash)
        except Exception as e:
            print(f"    OOS error: {e}")
            oos_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0}

        print(f"    OOS: CAGR={oos_m['cagr']:.2%} DD={oos_m['max_dd']:.2%} PF={oos_m['pf']:.3f} trades={oos_m['trades']}")

        fold_results.append({
            'fold': fi+1,
            'is_start': str(fold['is_start'].date()),
            'is_end':   str(fold['is_end'].date()),
            'oos_start': str(fold['oos_start'].date()),
            'oos_end':   str(fold['oos_end'].date()),
            'best_params': best_params,
            'is_metrics': best_is_m,
            'oos_metrics': oos_m,
        })
        all_best_params.append(best_params)

    # Aggregate WFO
    if fold_results:
        total_trades = sum(f['oos_metrics']['trades'] for f in fold_results)
        wfo_cagr  = float(np.mean([f['oos_metrics']['cagr'] for f in fold_results]))
        wfo_max_dd = float(min(f['oos_metrics']['max_dd'] for f in fold_results))
        wfo_pf    = float(np.mean([f['oos_metrics']['pf'] for f in fold_results if f['oos_metrics']['trades']>0] or [0]))
        wfo_wr    = float(np.mean([f['oos_metrics']['win_rate'] for f in fold_results]))
        wfo_calmar = wfo_cagr / abs(wfo_max_dd) if abs(wfo_max_dd) > 1e-9 else 0.0
        wfo_m = {'cagr':round(wfo_cagr,4),'max_dd':round(wfo_max_dd,4),'calmar':round(wfo_calmar,4),
                 'pf':round(wfo_pf,4),'win_rate':round(wfo_wr,4),'trades':total_trades}
    else:
        wfo_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0}

    # Best family: most frequent across folds
    if all_best_params:
        freq = {}
        for p in all_best_params:
            key = tuple(p[k] for k in param_names)
            freq[key] = freq.get(key, 0) + 1
        best_key = max(freq, key=lambda k: freq[k])
        best_family = dict(zip(param_names, best_key))
    else:
        # Reference center
        best_family = {k: v[len(v)//2] for k, v in param_grid.items()}

    print(f"\n  Locked family: {best_family}")

    # Holdout
    hk = {**extra_kwargs, **best_family,
          'from_dt': holdout_dt, 'to_dt': None, 'initial_cash': initial_cash}
    try:
        h_trades = backtest_fn(df, **hk)
        h_m = metrics_from_trades(h_trades, initial_cash)
    except Exception as e:
        print(f"  Holdout error: {e}")
        h_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0}

    print(f"  Holdout 2021+: CAGR={h_m['cagr']:.2%} DD={h_m['max_dd']:.2%} PF={h_m['pf']:.3f} trades={h_m['trades']}")

    return {
        'strategy': name,
        'folds': fold_results,
        'wfo_aggregate': wfo_m,
        'best_family': best_family,
        'holdout_2021_plus': h_m,
    }


# ==============================================================================
# Main
# ==============================================================================

def main():
    import backtrader as bt
    bt_version = bt.__version__

    print("Loading data...")
    gc_df   = load_ohlc_intraday(GC_CSV)
    fdax_df = load_ohlc_intraday(FDAX_CSV)
    gld_df  = load_ohlc_intraday(GLD_CSV)
    vix_s   = load_daily(VIX_CSV)
    us10y_s = load_daily(US10Y_CSV)
    dxy_s   = load_daily(DXY_CSV)

    print(f"  GC1  240m: {len(gc_df):,} bars | {gc_df['dt'].min().date()} -> {gc_df['dt'].max().date()}")
    print(f"  FDAX  30m: {len(fdax_df):,} bars | {fdax_df['dt'].min().date()} -> {fdax_df['dt'].max().date()}")
    print(f"  GLD   1D:  {len(gld_df):,} bars | {gld_df['dt'].min().date()} -> {gld_df['dt'].max().date()}")

    vix_regime    = build_regime(vix_s,   14, 'below')
    us10y_regime  = build_regime(us10y_s, 14, 'above')
    dxy_bad_gld   = build_regime(dxy_s,  100, 'above')
    us10y_bad_gld = build_regime(us10y_s,100, 'above')

    # ---- Strategy 1: Gold ------------------------------------------------
    gold_grid = {'atr_len':[7,10,14], 'sl_atr':[0.75,1.0,1.25], 'rr':[1.0,1.5,2.0]}
    gold_extra = {'risk_pct':0.01, 'contract_pts':100, 'commission_per_side':3.0}
    gc_start = gc_df['dt'].min().year  # 2016

    gold_r = run_wfo('GOLD Friday Long (GC1 240m)',
                     backtest_gold_friday, gc_df,
                     gold_grid, gold_extra,
                     is_years=2, oos_years=1, data_start_year=gc_start)

    # ---- Strategy 2: DAX -------------------------------------------------
    dax_grid = {'atr_len':[7,14,21], 'sl_atr':[1.0,1.5,2.0], 'rr':[1.0,1.5,2.0]}
    dax_extra = {'risk_pct':0.01, 'contract_size':25, 'commission_eur':2.50, 'spread_pct':0.00075,
                 'vix_regime': vix_regime, 'us10y_regime': us10y_regime}
    fdax_start = fdax_df['dt'].min().year  # 2007

    dax_r = run_wfo('DAX Turnaround Tuesday (FDAX 30m)',
                    backtest_dax_tuesday, fdax_df,
                    dax_grid, dax_extra,
                    is_years=5, oos_years=1, data_start_year=fdax_start)

    # ---- Strategy 3: GLD -------------------------------------------------
    gld_grid = {'atr_len':[10,14,20], 'sl_atr':[0.75,1.0,1.5], 'tp_r':[0.0,1.5,2.0]}
    gld_extra = {'risk_pct':0.01, 'commission_pct':0.0002,
                 'dxy_bad': dxy_bad_gld, 'us10y_bad': us10y_bad_gld}
    gld_start = gld_df['dt'].min().year  # 2004

    gld_r = run_wfo('GLD Thursday Long (GLD 1D)',
                    backtest_gld_thursday, gld_df,
                    gld_grid, gld_extra,
                    is_years=5, oos_years=1, data_start_year=gld_start)

    results = {
        'gold_friday_long': gold_r,
        'dax_turnaround_tuesday': dax_r,
        'gld_thursday_long': gld_r,
    }

    # ---- Manifest --------------------------------------------------------
    manifest = {
        'backtrader_version': bt_version,
        'run_timestamp': datetime.utcnow().isoformat() + 'Z',
        'execution_model': 'Vectorized pandas (entry at next-bar open, stop/target checked via high/low)',
        'data_files': {
            'GC1_240m': {'path': GC_CSV, 'rows': len(gc_df),
                         'date_range': [str(gc_df['dt'].min().date()), str(gc_df['dt'].max().date())]},
            'FDAX_30m': {'path': FDAX_CSV, 'rows': len(fdax_df),
                         'date_range': [str(fdax_df['dt'].min().date()), str(fdax_df['dt'].max().date())]},
            'GLD_1D':   {'path': GLD_CSV,  'rows': len(gld_df),
                         'date_range': [str(gld_df['dt'].min().date()), str(gld_df['dt'].max().date())]},
            'VIX_1D':   {'path': VIX_CSV,  'rows': len(vix_s)},
            'US10Y_1D': {'path': US10Y_CSV,'rows': len(us10y_s)},
            'DXY_1D':   {'path': DXY_CSV,  'rows': len(dxy_s)},
        },
        'cost_model': {
            'GC_commission_per_side_usd': 3.00,
            'GC_slippage_ticks': 0,
            'FDAX_commission_per_side_eur': 2.50,
            'FDAX_spread_pct_per_side': 0.00075,
            'GLD_commission_pct_per_side': 0.0002,
        },
        'wfo_protocol': {
            'IS_optimization_criterion': 'Profit Factor (maximize)',
            'min_IS_trades': 5,
            'holdout': '2021-01-01 to present (run exactly once)',
            'GC1_note': 'Data starts 2016-06; 2yr IS windows used (limited history)',
            'FDAX_note': '5yr IS windows from 2007',
            'GLD_note': '5yr IS windows from 2004',
        },
    }

    output = {'manifest': manifest, 'results': results}
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved -> {REPORT_PATH}")

    # ---- Decision Summary ------------------------------------------------
    ref = {
        'gold_friday_long':      {'cagr':0.0264,'max_dd':-0.0514,'calmar':0.51,'pf':1.58,'trades':547},
        'dax_turnaround_tuesday':{'cagr':0.0208,'max_dd':-0.0991,'calmar':0.21,'pf':1.29,'trades':284},
        'gld_thursday_long':     {'cagr':0.0483,'max_dd':-0.1127,'calmar':0.43,'pf':1.58,'trades':525},
    }

    print("\n" + "="*60)
    print("DECISION SUMMARY")
    print("="*60)

    for key, sr in results.items():
        wfo = sr['wfo_aggregate']
        h   = sr['holdout_2021_plus']
        r   = ref.get(key, {})
        n_folds = len(sr['folds'])
        pos_folds = sum(1 for f in sr['folds'] if f['oos_metrics']['cagr'] > 0)

        if wfo['pf'] >= 1.1 and h['pf'] >= 1.05 and pos_folds >= max(2, n_folds//2):
            decision = "KEEP"
        elif wfo['pf'] >= 1.0 and pos_folds >= max(1, n_folds//3):
            decision = "KEEP-SMALL"
        else:
            decision = "REJECT"

        print(f"\n{sr['strategy']}")
        print(f"  WFO Aggregate: CAGR={wfo['cagr']:.2%} MaxDD={wfo['max_dd']:.2%} PF={wfo['pf']:.3f} trades={wfo['trades']}")
        print(f"  Holdout 2021+: CAGR={h['cagr']:.2%}  MaxDD={h['max_dd']:.2%}  PF={h['pf']:.3f}  trades={h['trades']}")
        print(f"  Reference:     CAGR={r.get('cagr',0):.2%} MaxDD={r.get('max_dd',0):.2%} PF={r.get('pf',0):.3f} trades={r.get('trades',0)}")
        print(f"  Positive OOS folds: {pos_folds}/{n_folds}")
        print(f"  => Decision: {decision}")

    print("\nDone.")


if __name__ == '__main__':
    main()
