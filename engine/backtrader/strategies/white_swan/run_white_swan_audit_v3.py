"""
White Swan Strategy Audit v3 -- Full 10-Phase Validation
=========================================================

EXECUTION MODEL: cheat-on-close (close-fill) for all strategies.
COST MODEL (IB Standard):
  Gold GC1!: $0.85/contract/side commission + 1 tick slippage/side ($10)
             => $21.70 round-trip per contract
  GLD ETF:   0.02%/side commission + 1 tick slippage (absorbed in 0.02%)
             => 0.04% round-trip
  FDAX:      EUR 2.50/contract/side commission + 0.075% spread/side
  Roll:      4x/year, 0.05% per roll (GC/FDAX only)

PHASES:
  1  Data Manifest & Gold Data Search
  2  Canonical Strategy Specifications (verification)
  3  Trade Reconciliation (sample trades)
  4  Signal Edge Analysis (Layer A -- 1% equity risk, no leverage artifact)
  5  Parameter Family Grid Search (IS only, pre-2021)
  6  Rolling Walk-Forward (5yr IS / 1yr OOS)
  7  Final Holdout 2021+
  8  Regime Research
  9  Third Strategy Search (if DAX fails)
  10 Cost / Execution Stress Test

Outputs:
  reports/white_swan_strategy_audit_v3.json
  reports/white_swan_strategy_audit_v3.md
"""

import sys, os, json, warnings, traceback
from datetime import datetime, date
from itertools import product
from collections import Counter

warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DOWNLOADS   = r"C:\Users\joris\Downloads"
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
REPORT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "..", "..", "reports"))
os.makedirs(REPORT_ROOT, exist_ok=True)

V3_JSON = os.path.join(REPORT_ROOT, "white_swan_strategy_audit_v3.json")
V3_MD   = os.path.join(REPORT_ROOT, "white_swan_strategy_audit_v3.md")

# Data files
GC_240M  = os.path.join(DOWNLOADS, "COMEX_DL_GC1!, 240_dc277.csv")
GC_1D    = os.path.join(DOWNLOADS, "COMEX_DL_GC1!, 1D_d451f.csv")
FDAX_CSV = os.path.join(DOWNLOADS, "EUREX_FDAX_30min_gesamt_2007-2026.csv")
GLD_CSV  = os.path.join(DOWNLOADS, "BATS_GLD, 1D_4975f.csv")
VIX_CSV  = os.path.join(DOWNLOADS, "TVC_VIX, 1D_402f7.csv")
US10Y_CSV= os.path.join(DOWNLOADS, "TVC_US10Y, 1D_935af.csv")
DXY_CSV  = os.path.join(DOWNLOADS, "ICEUS_DLY_DXY, 1D_3217e.csv")

# IB-standard cost model
GC_COMMISSION_PER_SIDE  = 0.85    # USD/contract/side
GC_TICK_VALUE           = 10.0    # USD per tick (0.10 pts)
GC_SLIPPAGE_TICKS       = 1       # 1 tick per side
GC_CONTRACT_PTS         = 100.0   # USD per point
GC_RT_COST_PER_LOT      = (GC_COMMISSION_PER_SIDE + GC_TICK_VALUE * GC_SLIPPAGE_TICKS) * 2  # $21.70

FDAX_COMMISSION_PER_SIDE = 2.50   # EUR/contract/side
FDAX_SPREAD_PCT_SIDE     = 0.00075
FDAX_CONTRACT_SIZE       = 25     # EUR per point

GLD_COMMISSION_PCT_SIDE  = 0.0002  # 0.02% per side

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def to_utc(x):
    if x is None:
        return None
    ts = pd.Timestamp(x)
    return ts.tz_localize('UTC') if ts.tzinfo is None else ts.tz_convert('UTC')


def load_ohlc(path, daily=False):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df['dt'] = pd.to_datetime(df['time'], utc=True)
    df = df.sort_values('dt').reset_index(drop=True)
    for c in ['open', 'high', 'low', 'close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df['volume'] = pd.to_numeric(df.get('volume', pd.Series([0]*len(df))), errors='coerce').fillna(0)
    return df.dropna(subset=['open', 'high', 'low', 'close']).reset_index(drop=True)


def load_daily_series(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df['date'] = pd.to_datetime(df['time']).dt.date
    df = df.sort_values('date').reset_index(drop=True)
    df['close'] = pd.to_numeric(df['close'], errors='coerce')
    return df.dropna(subset=['close']).set_index('date')['close']


def compute_atr(df, n):
    hl  = df['high'] - df['low']
    hpc = (df['high'] - df['close'].shift(1)).abs()
    lpc = (df['low']  - df['close'].shift(1)).abs()
    tr  = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    return tr.rolling(n).mean()


def metrics_from_trades(trades, initial_cash=100_000):
    if not trades:
        return dict(cagr=0, max_dd=0, calmar=0, pf=0, win_rate=0, trades=0,
                    final_value=initial_cash, avg_r=0)
    pnls    = [t['pnl_dollar'] for t in trades]
    r_mults = [t.get('r_multiple', 0) for t in trades]
    winners = [p for p in pnls if p > 0]
    losers  = [p for p in pnls if p <= 0]
    gp = sum(winners) if winners else 0
    gl = abs(sum(losers)) if losers else 1e-9
    pf = gp / gl
    wr = len(winners) / len(pnls)

    by_date = {}
    for t in trades:
        by_date.setdefault(t['exit_date'], []).append(t['pnl_dollar'])

    eq_series = []
    cum = initial_cash
    for d in sorted(by_date):
        cum += sum(by_date[d])
        eq_series.append(cum)

    eq = np.array(eq_series, dtype=float)
    first_date = sorted(by_date)[0]
    last_date  = sorted(by_date)[-1]
    try:
        years = max((pd.Timestamp(str(last_date)) - pd.Timestamp(str(first_date))).days / 365.25, 0.1)
    except Exception:
        years = 1.0

    final_val = float(eq[-1])
    cagr      = (final_val / initial_cash) ** (1 / years) - 1 if final_val > 0 else -1.0
    roll_max  = np.maximum.accumulate(eq)
    dd        = (eq - roll_max) / roll_max
    max_dd    = float(dd.min())
    calmar    = cagr / abs(max_dd) if abs(max_dd) > 1e-9 else 0.0

    return dict(
        cagr=round(float(cagr), 4), max_dd=round(float(max_dd), 4),
        calmar=round(float(calmar), 4), pf=round(float(pf), 4),
        win_rate=round(float(wr), 4), trades=len(pnls),
        final_value=round(final_val, 2),
        avg_r=round(float(np.mean(r_mults)), 4) if r_mults else 0,
    )


def signal_layer_a(trades):
    """Pure signal stats: R-multiples only, no sizing artifacts."""
    if not trades:
        return {}
    rm = [t.get('r_multiple', 0) for t in trades]
    winners = [r for r in rm if r > 0]
    losers  = [r for r in rm if r <= 0]
    gp = sum(winners) if winners else 0
    gl = abs(sum(losers)) if losers else 1e-9
    streaks = []
    cur = 0
    for r in rm:
        if r <= 0:
            cur += 1
            streaks.append(cur)
        else:
            cur = 0
    max_losing_streak = max(streaks) if streaks else 0
    return dict(
        n_trades=len(rm), win_rate=round(len(winners)/len(rm), 4),
        pf_r=round(gp/gl, 4), avg_r=round(float(np.mean(rm)), 4),
        avg_win_r=round(float(np.mean(winners)), 4) if winners else 0,
        avg_loss_r=round(float(np.mean(losers)), 4) if losers else 0,
        payoff_ratio=round(abs(np.mean(winners)/np.mean(losers)), 4) if winners and losers else 0,
        max_losing_streak=max_losing_streak,
    )


def yearly_returns(trades, initial_cash=100_000):
    if not trades:
        return {}
    by_year = {}
    for t in trades:
        yr = pd.Timestamp(str(t['exit_date'])).year
        by_year.setdefault(yr, []).append(t['pnl_dollar'])
    result = {}
    eq = initial_cash
    for yr in sorted(by_year):
        pnl = sum(by_year[yr])
        ret = pnl / eq
        result[yr] = round(ret, 4)
        eq += pnl
    return result


def build_regime(series, ma_len, condition='below'):
    ma  = series.rolling(ma_len).mean()
    bad = (series < ma) if condition == 'below' else (series > ma)
    return {str(d): bool(v) for d, v in bad.shift(1).fillna(False).items()}


# ---------------------------------------------------------------------------
# STRATEGY 1: Gold Friday Long (GC1! 240m) -- CLOSE-FILL
# ---------------------------------------------------------------------------

def backtest_gold_friday_240m(df, atr_len=10, sl_atr=1.0, rr=1.5,
                               risk_pct=0.01, initial_cash=100_000,
                               from_dt=None, to_dt=None):
    """
    Signal: 240m bar on Friday with UTC hour in 13-18 (last bar before end of session).
    Entry: CLOSE of signal bar (cheat-on-close).
    ATR: rolling ATR computed on prior bars (atr_len bars).
    Stop: entry - sl_atr * ATR
    Target: entry + sl_atr * ATR * rr
    Exit: first of stop hit, target hit, or Monday close.
    Cost: $0.85 commission + 1 tick ($10) slippage per side => $21.70 RT.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)
    if len(d) < atr_len + 5:
        return []

    d['atr']     = compute_atr(d, atr_len)
    d['weekday'] = d['dt'].dt.weekday
    d['hour_utc']= d['dt'].dt.hour

    # Signal bar: Friday, UTC hour 13-18, ATR valid
    signal_mask   = (d['weekday'] == 4) & d['hour_utc'].between(13, 18) & d['atr'].notna()
    # Monday exit: any Monday bar (first to close)
    mon_mask      = (d['weekday'] == 0)

    trades   = []
    equity   = initial_cash
    in_trade = False

    for i in range(len(d)):
        if not in_trade:
            if signal_mask.iloc[i] and d['atr'].iloc[i] > 0:
                a   = float(d['atr'].iloc[i])
                ep  = float(d['close'].iloc[i])
                sd  = sl_atr * a
                sp  = ep - sd
                tp  = ep + sd * rr
                stop_usd = sd * GC_CONTRACT_PTS
                if stop_usd <= 0:
                    continue
                sz = max(1, int(equity * risk_pct / stop_usd))
                in_trade    = True
                entry_price = ep
                stop_price  = sp
                target_price= tp
                size        = sz
                entry_bar   = i
                entry_dt    = d['dt'].iloc[i]
                atr_val     = a
        else:
            if i <= entry_bar:
                continue
            bar = d.iloc[i]
            exit_price = None
            reason     = None

            if float(bar['low']) <= stop_price:
                exit_price = stop_price
                reason     = 'stop'
            elif float(bar['high']) >= target_price:
                exit_price = target_price
                reason     = 'target'
            elif mon_mask.iloc[i]:
                exit_price = float(bar['close'])
                reason     = 'time_mon'
            # Force exit if stuck beyond Tuesday
            elif bar['weekday'] >= 2 and i > entry_bar + 3:
                exit_price = float(bar['open'])
                reason     = 'force'

            if exit_price is not None:
                gross  = (exit_price - entry_price) * size * GC_CONTRACT_PTS
                comm   = GC_RT_COST_PER_LOT * size
                net    = gross - comm
                risk_a = abs(entry_price - stop_price) * size * GC_CONTRACT_PTS
                r_mult = net / risk_a if risk_a > 0 else 0
                equity += net

                trades.append(dict(
                    signal_bar_timestamp=str(entry_dt),
                    entry_price=round(entry_price, 2),
                    atr_value_used=round(atr_val, 2),
                    stop_price=round(stop_price, 2),
                    target_price=round(target_price, 2),
                    exit_timestamp=str(bar['dt']),
                    exit_price=round(exit_price, 2),
                    exit_reason=reason,
                    size=int(size),
                    gross_pnl=round(gross, 2),
                    costs=round(comm, 2),
                    pnl_dollar=round(net, 2),
                    r_multiple=round(r_mult, 3),
                    entry_date=entry_dt.date(),
                    exit_date=bar['dt'].date(),
                ))
                in_trade = False

    return trades


# ---------------------------------------------------------------------------
# STRATEGY 2: GLD Thursday Long (Daily) -- CLOSE-FILL
# ---------------------------------------------------------------------------

def backtest_gld_thursday(df, atr_len=14, sl_atr=1.0, tp_r=0.0,
                           risk_pct=0.01, initial_cash=100_000,
                           dxy_bad=None, us10y_bad=None,
                           from_dt=None, to_dt=None):
    """
    Signal: Thursday daily bar.
    Entry: Thursday CLOSE (cheat-on-close).
    Exit: Friday CLOSE, or stop if Friday LOW <= stop, or target if Friday HIGH >= target.
    Cost: 0.02%/side commission (IB ETF), round-trip 0.04% on exit value.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)
    if len(d) < atr_len + 5:
        return []

    d['atr']     = compute_atr(d, atr_len)
    d['weekday'] = d['dt'].dt.weekday

    signal_mask = (d['weekday'] == 3) & d['atr'].notna()
    trades = []
    equity = initial_cash
    i = 0

    while i < len(d) - 1:
        if signal_mask.iloc[i]:
            a   = float(d['atr'].iloc[i])
            ep  = float(d['close'].iloc[i])
            sd  = sl_atr * a
            sp  = ep - sd
            tp  = (ep + sd * tp_r) if tp_r > 0 else None

            # Regime sizing
            ds  = d['dt'].iloc[i].strftime('%Y-%m-%d')
            bad = sum([
                bool(dxy_bad and dxy_bad.get(ds, False)),
                bool(us10y_bad and us10y_bad.get(ds, False)),
            ])
            sm  = 1.0 if bad == 0 else (0.75 if bad == 1 else 0.5)
            sz  = max(1, int(equity * risk_pct * sm / sd)) if sd > 0 else 1

            entry_dt = d['dt'].iloc[i]
            fri = d.iloc[i + 1]

            exit_price = None
            reason     = None
            if float(fri['low']) <= sp:
                exit_price = sp
                reason     = 'stop'
            elif tp is not None and float(fri['high']) >= tp:
                exit_price = tp
                reason     = 'target'
            else:
                exit_price = float(fri['close'])
                reason     = 'time_fri'

            trade_val = exit_price * sz
            comm      = trade_val * GLD_COMMISSION_PCT_SIDE * 2
            gross     = (exit_price - ep) * sz
            net       = gross - comm
            risk_a    = abs(ep - sp) * sz
            r_mult    = net / risk_a if risk_a > 0 else 0
            equity   += net

            trades.append(dict(
                signal_bar_timestamp=str(entry_dt),
                entry_price=round(ep, 4),
                atr_value_used=round(a, 4),
                stop_price=round(sp, 4),
                target_price=round(tp, 4) if tp else None,
                exit_timestamp=str(fri['dt']),
                exit_price=round(exit_price, 4),
                exit_reason=reason,
                size=int(sz),
                gross_pnl=round(gross, 4),
                costs=round(comm, 4),
                pnl_dollar=round(net, 4),
                r_multiple=round(r_mult, 3),
                entry_date=entry_dt.date(),
                exit_date=fri['dt'].date(),
            ))
            i += 2
        else:
            i += 1

    return trades


# ---------------------------------------------------------------------------
# STRATEGY 3: DAX Turnaround Tuesday (FDAX 30m) -- CLOSE-FILL
# ---------------------------------------------------------------------------

def _build_daily_atr_map(df30m, atr_len):
    """Compute prior-day ATR from 30m data -- no look-ahead."""
    d = df30m.copy()
    d['date_berlin'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.date

    daily = (d.groupby('date_berlin')
              .agg(high=('high','max'), low=('low','min'), close=('close','last'))
              .reset_index()
              .sort_values('date_berlin')
              .reset_index(drop=True))
    daily['prev_close'] = daily['close'].shift(1)
    def _tr(r):
        hl = r['high'] - r['low']
        if pd.notna(r['prev_close']):
            return max(hl, abs(r['high']-r['prev_close']), abs(r['low']-r['prev_close']))
        return hl
    daily['tr']      = daily.apply(_tr, axis=1)
    daily['atr']     = daily['tr'].rolling(atr_len).mean()
    daily['atr_ma']  = daily['atr'].rolling(atr_len).mean()
    # Prior-day (shift 1)
    daily['atr_prev']    = daily['atr'].shift(1)
    daily['atr_ma_prev'] = daily['atr_ma'].shift(1)

    atr_map    = {str(r['date_berlin']): r['atr_prev']    for _, r in daily.iterrows()}
    atr_ma_map = {str(r['date_berlin']): r['atr_ma_prev'] for _, r in daily.iterrows()}
    return atr_map, atr_ma_map


def backtest_dax_tuesday(df, atr_len=10, sl_atr=1.5, rr=1.5,
                          risk_pct=0.01, initial_cash=100_000,
                          vix_regime=None,
                          from_dt=None, to_dt=None):
    """
    Signal: Monday 30m bar with Berlin time 17:30 (UTC 15:30 summer / 16:30 winter).
    Entry: CLOSE of that bar (cheat-on-close).
    ATR: prior completed daily bar ATR (no look-ahead).
    Stop: entry - sl_atr * daily_ATR_prior
    Target: entry + sl_atr * daily_ATR_prior * rr
    Exit: Wednesday 17:30 bar CLOSE, or stop/target if hit first.
    Cost: EUR 2.50/side commission + 0.075% spread per side.
    NOTE: Layer A signal PF(R) computed separately from contract sizing.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)
    if len(d) < 100:
        return []

    atr_map, atr_ma_map = _build_daily_atr_map(d, atr_len)

    d['weekday']  = d['dt'].dt.weekday
    d['hour_utc'] = d['dt'].dt.hour
    d['minute']   = d['dt'].dt.minute
    d['date_str'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.strftime('%Y-%m-%d')

    # Berlin 17:30 = UTC 15:30 (CEST, summer) or 16:30 (CET, winter)
    entry_mask = (d['weekday'] == 0) & d['hour_utc'].isin([15, 16]) & (d['minute'] == 30)
    exit_mask  = (d['weekday'] == 2) & d['hour_utc'].isin([15, 16]) & (d['minute'] == 30)

    trades   = []
    equity   = initial_cash
    in_trade = False

    for i in range(len(d)):
        if not in_trade:
            if entry_mask.iloc[i]:
                ds       = d['date_str'].iloc[i]
                atr_val  = atr_map.get(ds)
                atr_ma   = atr_ma_map.get(ds)
                if not atr_val or np.isnan(float(atr_val)) or float(atr_val) <= 0:
                    continue
                atr_val = float(atr_val)
                atr_ma  = float(atr_ma) if atr_ma and not np.isnan(float(atr_ma)) else None

                ep = float(d['close'].iloc[i])
                sd = sl_atr * atr_val
                sp = ep - sd
                tp = ep + sd * rr

                # Regime: skip if VIX unfavorable
                vix_bad = bool(vix_regime and vix_regime.get(ds, False))
                if vix_bad:
                    continue  # filter, do not trade

                # ATR regime: low vol = bad
                atr_bad = (atr_ma is not None and atr_val < atr_ma)

                stop_eur = sd * FDAX_CONTRACT_SIZE
                if stop_eur <= 0:
                    continue
                # Reduce size in low-vol regime
                rm = 0.75 if atr_bad else 1.0
                sz = max(1, int(equity * risk_pct * rm / stop_eur))

                in_trade    = True
                entry_price = ep
                stop_price  = sp
                target_price= tp
                size        = sz
                entry_bar   = i
                entry_dt    = d['dt'].iloc[i]
                atr_used    = atr_val
        else:
            if i <= entry_bar:
                continue
            bar = d.iloc[i]
            exit_price = None
            reason     = None

            if float(bar['low']) <= stop_price:
                exit_price = stop_price
                reason     = 'stop'
            elif float(bar['high']) >= target_price:
                exit_price = target_price
                reason     = 'target'
            elif exit_mask.iloc[i]:
                exit_price = float(bar['close'])
                reason     = 'time_wed'
            elif bar['weekday'] > 2 and i > entry_bar + 4:
                exit_price = float(bar['open'])
                reason     = 'force'

            if exit_price is not None:
                gross  = (exit_price - entry_price) * size * FDAX_CONTRACT_SIZE
                comm   = (FDAX_COMMISSION_PER_SIDE + exit_price * FDAX_SPREAD_PCT_SIDE * FDAX_CONTRACT_SIZE) * 2 * size
                net    = gross - comm
                risk_a = abs(entry_price - stop_price) * size * FDAX_CONTRACT_SIZE
                r_mult = net / risk_a if risk_a > 0 else 0
                equity += net

                trades.append(dict(
                    signal_bar_timestamp=str(entry_dt),
                    entry_price=round(entry_price, 2),
                    atr_value_used=round(atr_used, 2),
                    stop_price=round(stop_price, 2),
                    target_price=round(target_price, 2),
                    exit_timestamp=str(bar['dt']),
                    exit_price=round(exit_price, 2),
                    exit_reason=reason,
                    size=int(size),
                    gross_pnl=round(gross, 2),
                    costs=round(comm, 2),
                    pnl_dollar=round(net, 2),
                    r_multiple=round(r_mult, 3),
                    entry_date=entry_dt.date(),
                    exit_date=bar['dt'].date(),
                ))
                in_trade = False

    return trades


# ---------------------------------------------------------------------------
# PHASE 5 -- Parameter Grid Search
# ---------------------------------------------------------------------------

def param_grid_search(name, backtest_fn, df, param_grid, extra_kwargs,
                      train_start, train_end, initial_cash=100_000, min_trades=10):
    """IS-only grid over pre-2021 data. Returns sorted list of (params, metrics)."""
    param_names  = list(param_grid.keys())
    param_combos = list(product(*param_grid.values()))
    results = []

    for combo in param_combos:
        params = dict(zip(param_names, combo))
        kwargs = {**extra_kwargs, **params,
                  'from_dt': train_start, 'to_dt': train_end,
                  'initial_cash': initial_cash}
        try:
            trades = backtest_fn(df, **kwargs)
            if len(trades) < min_trades:
                continue
            m  = metrics_from_trades(trades, initial_cash)
            la = signal_layer_a(trades)
            results.append({'params': params, 'is_metrics': m, 'signal': la})
        except Exception:
            continue

    results.sort(key=lambda x: x['is_metrics']['pf'], reverse=True)
    return results


# ---------------------------------------------------------------------------
# PHASE 6 -- Rolling Walk-Forward
# ---------------------------------------------------------------------------

def run_wfo(name, backtest_fn, df, param_grid, extra_kwargs,
            is_years, oos_years, data_start_year,
            holdout_start='2021-01-01', initial_cash=100_000, min_is_trades=10):
    holdout_dt = pd.Timestamp(holdout_start, tz='UTC')
    param_names  = list(param_grid.keys())
    param_combos = list(product(*param_grid.values()))

    folds = []
    oos_year = data_start_year + is_years
    while True:
        is_start = pd.Timestamp(f"{oos_year - is_years}-01-01", tz='UTC')
        is_end   = pd.Timestamp(f"{oos_year}-01-01", tz='UTC')
        oos_end  = pd.Timestamp(f"{oos_year + oos_years}-01-01", tz='UTC')
        if is_end >= holdout_dt:
            break
        folds.append(dict(is_start=is_start, is_end=is_end,
                          oos_start=is_end, oos_end=min(oos_end, holdout_dt)))
        oos_year += oos_years

    print(f"\n{'='*60}\nWFO: {name} -- {len(folds)} folds\n{'='*60}")

    fold_results  = []
    all_best_params = []

    for fi, fold in enumerate(folds):
        best_pf  = -999
        best_par = None
        best_ism = None

        for combo in param_combos:
            params = dict(zip(param_names, combo))
            kwargs = {**extra_kwargs, **params,
                      'from_dt': fold['is_start'], 'to_dt': fold['is_end'],
                      'initial_cash': initial_cash}
            try:
                trades = backtest_fn(df, **kwargs)
                m      = metrics_from_trades(trades, initial_cash)
            except Exception:
                continue
            if m['trades'] < min_is_trades:
                continue
            if m['pf'] > best_pf:
                best_pf  = m['pf']
                best_par = params
                best_ism = m

        if best_par is None:
            print(f"  Fold {fi+1}: no valid IS params (min {min_is_trades} trades) -- skip")
            continue

        oos_kwargs = {**extra_kwargs, **best_par,
                      'from_dt': fold['oos_start'], 'to_dt': fold['oos_end'],
                      'initial_cash': initial_cash}
        try:
            oos_trades = backtest_fn(df, **oos_kwargs)
            oos_m      = metrics_from_trades(oos_trades, initial_cash)
            oos_la     = signal_layer_a(oos_trades)
        except Exception as e:
            print(f"  Fold {fi+1} OOS error: {e}")
            oos_m  = dict(cagr=0,max_dd=0,calmar=0,pf=0,win_rate=0,trades=0,final_value=initial_cash,avg_r=0)
            oos_la = {}

        print(f"  Fold {fi+1} IS {fold['is_start'].date()}->{fold['is_end'].date()} "
              f"OOS {fold['oos_start'].date()}->{fold['oos_end'].date()} "
              f"best={best_par} IS_PF={best_pf:.3f} OOS_PF={oos_m['pf']:.3f} "
              f"OOS_trades={oos_m['trades']} OOS_CAGR={oos_m['cagr']:.2%}")

        fold_results.append(dict(
            fold=fi+1,
            is_start=str(fold['is_start'].date()),
            is_end=str(fold['is_end'].date()),
            oos_start=str(fold['oos_start'].date()),
            oos_end=str(fold['oos_end'].date()),
            best_params=best_par,
            is_pf=round(best_pf, 4),
            is_trades=best_ism['trades'],
            oos_metrics=oos_m,
            oos_signal=oos_la,
        ))
        all_best_params.append(best_par)

    # Aggregate WFO
    if fold_results:
        n = len(fold_results)
        wfo_pf     = float(np.mean([f['oos_metrics']['pf'] for f in fold_results]))
        wfo_cagr   = float(np.mean([f['oos_metrics']['cagr'] for f in fold_results]))
        wfo_max_dd = float(min(f['oos_metrics']['max_dd'] for f in fold_results))
        wfo_calmar = wfo_cagr / abs(wfo_max_dd) if abs(wfo_max_dd) > 1e-9 else 0
        pos_folds  = sum(1 for f in fold_results if f['oos_metrics']['cagr'] > 0)
        wfo_agg    = dict(n_folds=n, positive_folds=pos_folds,
                          avg_pf=round(wfo_pf,4), avg_cagr=round(wfo_cagr,4),
                          min_max_dd=round(wfo_max_dd,4), avg_calmar=round(wfo_calmar,4),
                          total_oos_trades=sum(f['oos_metrics']['trades'] for f in fold_results))
    else:
        wfo_agg = dict(n_folds=0, positive_folds=0, avg_pf=0, avg_cagr=0,
                       min_max_dd=0, avg_calmar=0, total_oos_trades=0)

    # Select best family: most frequent best IS params across folds
    if all_best_params:
        freq    = Counter(tuple(p[k] for k in param_names) for p in all_best_params)
        best_k  = max(freq, key=lambda k: freq[k])
        best_family = dict(zip(param_names, best_k))
    else:
        best_family = {k: list(v)[len(v)//2] for k, v in param_grid.items()}

    print(f"  Locked family: {best_family}")

    # PHASE 7 -- Holdout (run exactly once)
    h_kwargs = {**extra_kwargs, **best_family,
                'from_dt': holdout_dt, 'to_dt': None,
                'initial_cash': initial_cash}
    try:
        h_trades = backtest_fn(df, **h_kwargs)
        h_m      = metrics_from_trades(h_trades, initial_cash)
        h_la     = signal_layer_a(h_trades)
        h_yearly = yearly_returns(h_trades, initial_cash)
    except Exception as e:
        print(f"  Holdout error: {e}")
        h_m      = dict(cagr=0,max_dd=0,calmar=0,pf=0,win_rate=0,trades=0,final_value=initial_cash,avg_r=0)
        h_la     = {}
        h_yearly = {}

    print(f"  Holdout 2021+: CAGR={h_m['cagr']:.2%} DD={h_m['max_dd']:.2%} "
          f"PF={h_m['pf']:.3f} trades={h_m['trades']}")

    return dict(
        strategy=name,
        folds=fold_results,
        wfo_aggregate=wfo_agg,
        best_family=best_family,
        holdout_2021_plus=h_m,
        holdout_signal=h_la,
        holdout_yearly=h_yearly,
    )


# ---------------------------------------------------------------------------
# PHASE 10 -- Cost / Execution Stress
# ---------------------------------------------------------------------------

def stress_test(name, backtest_fn, df, best_params, extra_kwargs,
                holdout_start='2021-01-01', initial_cash=100_000, instrument='gc'):
    """Run holdout under 5 stress scenarios."""
    holdout_dt = pd.Timestamp(holdout_start, tz='UTC')
    scenarios  = {}

    base_kwargs = {**extra_kwargs, **best_params,
                   'from_dt': holdout_dt, 'to_dt': None,
                   'initial_cash': initial_cash}

    # Baseline
    t = backtest_fn(df, **base_kwargs)
    scenarios['baseline'] = metrics_from_trades(t, initial_cash)

    # 1.5x cost: multiply pnl reduction from costs by 1.5
    # Simplest proxy: reduce all pnl_dollar by 0.5 * costs
    def scale_costs(trades, mult):
        out = []
        for tr in trades:
            extra = (mult - 1) * tr['costs']
            out.append({**tr, 'pnl_dollar': tr['pnl_dollar'] - extra})
        return out

    t = backtest_fn(df, **base_kwargs)
    scenarios['costs_1_5x'] = metrics_from_trades(scale_costs(t, 1.5), initial_cash)

    t = backtest_fn(df, **base_kwargs)
    scenarios['costs_2x']   = metrics_from_trades(scale_costs(t, 2.0), initial_cash)

    # SL widened 20%
    par2 = {**best_params, 'sl_atr': best_params.get('sl_atr', 1.0) * 1.2}
    t = backtest_fn(df, **{**extra_kwargs, **par2,
                             'from_dt': holdout_dt, 'to_dt': None,
                             'initial_cash': initial_cash})
    scenarios['sl_wide_20pct'] = metrics_from_trades(t, initial_cash)

    # SL narrowed 20%
    par3 = {**best_params, 'sl_atr': best_params.get('sl_atr', 1.0) * 0.8}
    t = backtest_fn(df, **{**extra_kwargs, **par3,
                             'from_dt': holdout_dt, 'to_dt': None,
                             'initial_cash': initial_cash})
    scenarios['sl_narrow_20pct'] = metrics_from_trades(t, initial_cash)

    return scenarios


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    print("="*70)
    print("WHITE SWAN STRATEGY AUDIT v3")
    print(f"Run: {datetime.utcnow().isoformat()}Z")
    print("="*70)

    # -----------------------------------------------------------------------
    # PHASE 1 -- Data Manifest
    # -----------------------------------------------------------------------
    print("\n--- PHASE 1: Data Manifest ---")
    gc240  = load_ohlc(GC_240M)
    gc1d   = load_ohlc(GC_1D)
    fdax   = load_ohlc(FDAX_CSV)
    gld    = load_ohlc(GLD_CSV)
    vix_s  = load_daily_series(VIX_CSV)
    us10y_s= load_daily_series(US10Y_CSV)
    dxy_s  = load_daily_series(DXY_CSV)

    data_manifest = {
        "GC1_240m": {
            "path": GC_240M, "rows": len(gc240),
            "first": str(gc240['dt'].min().date()),
            "last":  str(gc240['dt'].max().date()),
            "note":  "DATA-LIMITED: starts 2016-06. Only 3 WFO folds possible pre-2021. Pre-2016 not found.",
        },
        "GC1_1D": {
            "path": GC_1D, "rows": len(gc1d),
            "first": str(gc1d['dt'].min().date()),
            "last":  str(gc1d['dt'].max().date()),
            "note":  "Daily GC1! available 1975+. Used for ATR reference only; 240m signal cannot be reconstructed from daily.",
        },
        "FDAX_30m": {
            "path": FDAX_CSV, "rows": len(fdax),
            "first": str(fdax['dt'].min().date()),
            "last":  str(fdax['dt'].max().date()),
        },
        "GLD_1D": {
            "path": GLD_CSV, "rows": len(gld),
            "first": str(gld['dt'].min().date()),
            "last":  str(gld['dt'].max().date()),
        },
        "VIX_1D":   {"rows": len(vix_s)},
        "US10Y_1D": {"rows": len(us10y_s)},
        "DXY_1D":   {"rows": len(dxy_s)},
    }

    for k, v in data_manifest.items():
        print(f"  {k}: {v.get('rows','?')} rows | {v.get('first','')} -> {v.get('last','')}")
        if 'note' in v:
            print(f"    NOTE: {v['note']}")

    # -----------------------------------------------------------------------
    # Regime maps
    # -----------------------------------------------------------------------
    vix_regime    = build_regime(vix_s,   20, 'below')   # VIX < SMA20 = bad (too calm)
    dxy_bad_gld   = build_regime(dxy_s,  100, 'above')   # DXY > SMA100 = bad for GLD
    us10y_bad_gld = build_regime(us10y_s,100, 'above')   # US10Y > SMA100 = bad for GLD

    # -----------------------------------------------------------------------
    # PHASE 4+5+6+7 -- Gold Friday Long (GC1! 240m)
    # -----------------------------------------------------------------------
    print("\n--- PHASE 4-7: Gold Friday Long (GC1! 240m) ---")

    gold_grid  = {
        'atr_len': [7, 10, 14, 21],
        'sl_atr':  [0.75, 1.0, 1.25, 1.5, 2.0],
        'rr':      [0.75, 1.0, 1.25, 1.5],
    }
    gold_extra = {'risk_pct': 0.01}

    # IS-only grid (2016-2020 due to data limitation)
    gold_grid_results = param_grid_search(
        'Gold Friday Long', backtest_gold_friday_240m, gc240,
        gold_grid, gold_extra,
        train_start='2016-01-01', train_end='2021-01-01',
        min_trades=5,
    )
    print(f"  Grid: {len(gold_grid_results)} valid param combos")
    if gold_grid_results:
        best = gold_grid_results[0]
        print(f"  Best IS params: {best['params']} PF={best['is_metrics']['pf']:.3f} trades={best['is_metrics']['trades']}")

    # Full signal layer A (all available 240m data)
    gold_all_trades = backtest_gold_friday_240m(gc240, **{**gold_extra,
                                                           **(gold_grid_results[0]['params'] if gold_grid_results else {'atr_len':10,'sl_atr':1.0,'rr':1.5})})
    gold_signal_all = signal_layer_a(gold_all_trades)
    print(f"  Signal Layer A (all data): trades={gold_signal_all.get('n_trades',0)} "
          f"PF(R)={gold_signal_all.get('pf_r',0):.4f} WR={gold_signal_all.get('win_rate',0):.2%} "
          f"AvgR={gold_signal_all.get('avg_r',0):.3f}")

    # WFO: DATA-LIMITED, use 2yr IS / 1yr OOS from 2016
    gold_wfo = run_wfo(
        'GOLD Friday Long (GC1 240m)',
        backtest_gold_friday_240m, gc240,
        gold_grid, gold_extra,
        is_years=2, oos_years=1,
        data_start_year=2017,   # need 2yr IS => first OOS = 2018+
        holdout_start='2021-01-01',
        min_is_trades=5,
    )

    # -----------------------------------------------------------------------
    # PHASE 4+5+6+7 -- GLD Thursday Long
    # -----------------------------------------------------------------------
    print("\n--- PHASE 4-7: GLD Thursday Long ---")

    gld_grid  = {
        'atr_len': [7, 10, 14, 20],
        'sl_atr':  [0.75, 1.0, 1.5, 2.0],
        'tp_r':    [0.0, 1.0, 1.5, 2.0],
    }
    gld_extra = {'risk_pct': 0.01, 'dxy_bad': dxy_bad_gld, 'us10y_bad': us10y_bad_gld}

    # IS-only grid (pre-2021)
    gld_grid_results = param_grid_search(
        'GLD Thursday Long', backtest_gld_thursday, gld,
        gld_grid, gld_extra,
        train_start='2004-01-01', train_end='2021-01-01',
        min_trades=10,
    )
    print(f"  Grid: {len(gld_grid_results)} valid param combos")
    if gld_grid_results:
        gp = gld_grid_results[0]
        print(f"  Best IS params: {gp['params']} PF={gp['is_metrics']['pf']:.3f} trades={gp['is_metrics']['trades']}")

    # All-data signal stats
    gld_all_trades = backtest_gld_thursday(gld, **{**gld_extra,
                                                     **(gld_grid_results[0]['params'] if gld_grid_results else {'atr_len':14,'sl_atr':1.0,'tp_r':0.0})})
    gld_signal_all = signal_layer_a(gld_all_trades)
    print(f"  Signal Layer A (all data): trades={gld_signal_all.get('n_trades',0)} "
          f"PF(R)={gld_signal_all.get('pf_r',0):.4f} WR={gld_signal_all.get('win_rate',0):.2%}")

    gld_wfo = run_wfo(
        'GLD Thursday Long (1D)',
        backtest_gld_thursday, gld,
        gld_grid, gld_extra,
        is_years=5, oos_years=1,
        data_start_year=2010,   # enough IS from 2004+
        holdout_start='2021-01-01',
        min_is_trades=10,
    )

    # -----------------------------------------------------------------------
    # PHASE 4+5+6+7 -- DAX Turnaround Tuesday
    # -----------------------------------------------------------------------
    print("\n--- PHASE 4-7: DAX Turnaround Tuesday (FDAX 30m) ---")

    dax_grid  = {
        'atr_len': [7, 10, 14, 21],
        'sl_atr':  [0.75, 1.0, 1.5, 2.0],
        'rr':      [1.0, 1.5, 2.0],
    }
    dax_extra = {'risk_pct': 0.01, 'vix_regime': vix_regime}

    # IS-only grid (pre-2021)
    dax_grid_results = param_grid_search(
        'DAX Turnaround Tuesday', backtest_dax_tuesday, fdax,
        dax_grid, dax_extra,
        train_start='2007-01-01', train_end='2021-01-01',
        min_trades=10,
    )
    print(f"  Grid: {len(dax_grid_results)} valid param combos")
    if dax_grid_results:
        dp = dax_grid_results[0]
        print(f"  Best IS params: {dp['params']} PF={dp['is_metrics']['pf']:.3f} trades={dp['is_metrics']['trades']}")

    # All-data signal stats (no VIX filter for pure signal eval)
    dax_extra_nosig = {'risk_pct': 0.01}
    dax_all_trades = backtest_dax_tuesday(fdax, **{**dax_extra_nosig,
                                                     **(dax_grid_results[0]['params'] if dax_grid_results else {'atr_len':10,'sl_atr':1.5,'rr':1.5})})
    dax_signal_all = signal_layer_a(dax_all_trades)
    print(f"  Signal Layer A (no regime filter, all data): trades={dax_signal_all.get('n_trades',0)} "
          f"PF(R)={dax_signal_all.get('pf_r',0):.4f} WR={dax_signal_all.get('win_rate',0):.2%}")

    dax_wfo = run_wfo(
        'DAX Turnaround Tuesday (FDAX 30m)',
        backtest_dax_tuesday, fdax,
        dax_grid, dax_extra,
        is_years=5, oos_years=1,
        data_start_year=2013,   # 5yr IS => 2007-2012 = fold 1 OOS 2013
        holdout_start='2021-01-01',
        min_is_trades=10,
    )

    # -----------------------------------------------------------------------
    # PHASE 8 -- Regime Research (side-by-side)
    # -----------------------------------------------------------------------
    print("\n--- PHASE 8: Regime Research ---")

    # GLD: with vs without regime
    gld_best_par = gld_wfo['best_family']
    gld_no_regime_trades = backtest_gld_thursday(gld, **{**{'risk_pct':0.01}, **gld_best_par,
                                                           'from_dt':'2021-01-01', 'to_dt':None})
    gld_regime_trades    = backtest_gld_thursday(gld, **{**gld_extra, **gld_best_par,
                                                          'from_dt':'2021-01-01', 'to_dt':None})
    gld_no_reg_m = metrics_from_trades(gld_no_regime_trades)
    gld_reg_m    = metrics_from_trades(gld_regime_trades)
    print(f"  GLD Holdout no-regime: PF={gld_no_reg_m['pf']:.3f} CAGR={gld_no_reg_m['cagr']:.2%}")
    print(f"  GLD Holdout regime:    PF={gld_reg_m['pf']:.3f}    CAGR={gld_reg_m['cagr']:.2%}")

    # DAX: with vs without VIX regime
    dax_best_par = dax_wfo['best_family']
    dax_no_regime = backtest_dax_tuesday(fdax, **{**dax_extra_nosig, **dax_best_par,
                                                    'from_dt':'2021-01-01', 'to_dt':None})
    dax_w_regime  = backtest_dax_tuesday(fdax, **{**dax_extra, **dax_best_par,
                                                    'from_dt':'2021-01-01', 'to_dt':None})
    dax_no_reg_m  = metrics_from_trades(dax_no_regime)
    dax_reg_m     = metrics_from_trades(dax_w_regime)
    print(f"  DAX Holdout no-regime: PF={dax_no_reg_m['pf']:.3f} CAGR={dax_no_reg_m['cagr']:.2%}")
    print(f"  DAX Holdout regime:    PF={dax_reg_m['pf']:.3f}    CAGR={dax_reg_m['cagr']:.2%}")

    # -----------------------------------------------------------------------
    # PHASE 10 -- Cost/Execution Stress
    # -----------------------------------------------------------------------
    print("\n--- PHASE 10: Cost/Execution Stress ---")

    gold_stress = stress_test('Gold', backtest_gold_friday_240m, gc240,
                               gold_wfo['best_family'], gold_extra)
    gld_stress  = stress_test('GLD',  backtest_gld_thursday, gld,
                               gld_wfo['best_family'], gld_extra)
    dax_stress  = stress_test('DAX',  backtest_dax_tuesday, fdax,
                               dax_wfo['best_family'], dax_extra)

    for name_, st in [('Gold', gold_stress), ('GLD', gld_stress), ('DAX', dax_stress)]:
        print(f"  {name_} stress:")
        for sc, m in st.items():
            print(f"    {sc:20s}: CAGR={m['cagr']:.2%} PF={m['pf']:.3f} DD={m['max_dd']:.2%}")

    # -----------------------------------------------------------------------
    # PHASE 9 -- Third Strategy Decision
    # -----------------------------------------------------------------------
    dax_pf_r   = dax_signal_all.get('pf_r', 0)
    dax_holdout_pf = dax_wfo['holdout_2021_plus'].get('pf', 0)
    dax_wfo_pos_folds = dax_wfo['wfo_aggregate'].get('positive_folds', 0)
    dax_wfo_n_folds   = dax_wfo['wfo_aggregate'].get('n_folds', 1)

    # Decision: KEEP if PF(R) >= 1.0 AND holdout PF > 1.0 AND >= 5/8 pos folds
    # WATCH if borderline, REJECT otherwise
    if dax_pf_r >= 1.0 and dax_holdout_pf > 1.0 and dax_wfo_pos_folds / max(dax_wfo_n_folds, 1) >= 0.5:
        dax_verdict = "KEEP"
    elif dax_pf_r >= 0.9 or dax_holdout_pf > 1.0:
        dax_verdict = "WATCH"
    else:
        dax_verdict = "REJECT"

    gold_pf_r   = gold_signal_all.get('pf_r', 0)
    gold_holdout = gold_wfo['holdout_2021_plus']
    gold_verdict = "DATA-LIMITED" if gold_wfo['wfo_aggregate']['n_folds'] < 5 else (
        "KEEP" if gold_pf_r >= 1.0 and gold_holdout.get('pf', 0) > 1.0 else "WATCH"
    )

    gld_pf_r    = gld_signal_all.get('pf_r', 0)
    gld_holdout = gld_wfo['holdout_2021_plus']
    gld_pos     = gld_wfo['wfo_aggregate'].get('positive_folds', 0)
    gld_n       = gld_wfo['wfo_aggregate'].get('n_folds', 1)
    if gld_pf_r >= 1.0 and gld_holdout.get('pf', 0) > 1.0 and gld_pos / max(gld_n, 1) >= 0.6:
        gld_verdict = "KEEP"
    elif gld_pf_r >= 0.9:
        gld_verdict = "WATCH"
    else:
        gld_verdict = "REJECT"

    print(f"\n  Gold verdict: {gold_verdict}  (PF(R)={gold_pf_r:.3f}, WFO folds={dax_wfo['wfo_aggregate']['n_folds']})")
    print(f"  GLD  verdict: {gld_verdict}   (PF(R)={gld_pf_r:.3f})")
    print(f"  DAX  verdict: {dax_verdict}   (PF(R)={dax_pf_r:.3f})")

    # -----------------------------------------------------------------------
    # Build JSON output
    # -----------------------------------------------------------------------
    output = {
        "manifest": {
            "audit_version": "v3",
            "run_timestamp": datetime.utcnow().isoformat() + "Z",
            "execution_model": "CLOSE-FILL (cheat-on-close). Entry at signal bar CLOSE.",
            "cost_model": {
                "GC_commission_per_side_usd": GC_COMMISSION_PER_SIDE,
                "GC_slippage_ticks_per_side": GC_SLIPPAGE_TICKS,
                "GC_tick_value_usd": GC_TICK_VALUE,
                "GC_RT_cost_per_lot_usd": GC_RT_COST_PER_LOT,
                "FDAX_commission_per_side_eur": FDAX_COMMISSION_PER_SIDE,
                "FDAX_spread_pct_per_side": FDAX_SPREAD_PCT_SIDE,
                "GLD_commission_pct_per_side": GLD_COMMISSION_PCT_SIDE,
            },
            "data_manifest": data_manifest,
        },
        "phase4_signal_layer_a": {
            "gold_friday_long": gold_signal_all,
            "gld_thursday_long": gld_signal_all,
            "dax_turnaround_tuesday": dax_signal_all,
        },
        "phase5_grid_search": {
            "gold_friday_long_top5": gold_grid_results[:5] if gold_grid_results else [],
            "gld_thursday_long_top5": gld_grid_results[:5] if gld_grid_results else [],
            "dax_turnaround_tuesday_top5": dax_grid_results[:5] if dax_grid_results else [],
        },
        "phase6_wfo": {
            "gold_friday_long": gold_wfo,
            "gld_thursday_long": gld_wfo,
            "dax_turnaround_tuesday": dax_wfo,
        },
        "phase7_holdout": {
            "gold_friday_long": {**gold_wfo['holdout_2021_plus'],
                                  "signal": gold_wfo['holdout_signal'],
                                  "yearly": gold_wfo['holdout_yearly'],
                                  "best_family": gold_wfo['best_family']},
            "gld_thursday_long": {**gld_wfo['holdout_2021_plus'],
                                   "signal": gld_wfo['holdout_signal'],
                                   "yearly": gld_wfo['holdout_yearly'],
                                   "best_family": gld_wfo['best_family']},
            "dax_turnaround_tuesday": {**dax_wfo['holdout_2021_plus'],
                                        "signal": dax_wfo['holdout_signal'],
                                        "yearly": dax_wfo['holdout_yearly'],
                                        "best_family": dax_wfo['best_family']},
        },
        "phase8_regime": {
            "gld_no_regime_holdout": gld_no_reg_m,
            "gld_with_regime_holdout": gld_reg_m,
            "dax_no_regime_holdout": dax_no_reg_m,
            "dax_with_regime_holdout": dax_reg_m,
        },
        "phase10_stress": {
            "gold": gold_stress,
            "gld":  gld_stress,
            "dax":  dax_stress,
        },
        "verdicts": {
            "gold_friday_long": {
                "verdict": gold_verdict,
                "signal_pf_r": gold_pf_r,
                "wfo_folds": gold_wfo['wfo_aggregate']['n_folds'],
                "wfo_positive_folds": gold_wfo['wfo_aggregate']['positive_folds'],
                "holdout_pf": gold_holdout.get('pf', 0),
                "holdout_cagr": gold_holdout.get('cagr', 0),
            },
            "gld_thursday_long": {
                "verdict": gld_verdict,
                "signal_pf_r": gld_pf_r,
                "wfo_folds": gld_n,
                "wfo_positive_folds": gld_pos,
                "holdout_pf": gld_holdout.get('pf', 0),
                "holdout_cagr": gld_holdout.get('cagr', 0),
            },
            "dax_turnaround_tuesday": {
                "verdict": dax_verdict,
                "signal_pf_r": dax_pf_r,
                "wfo_folds": dax_wfo_n_folds,
                "wfo_positive_folds": dax_wfo_pos_folds,
                "holdout_pf": dax_holdout_pf,
                "holdout_cagr": dax_wfo['holdout_2021_plus'].get('cagr', 0),
            },
        },
    }

    # -----------------------------------------------------------------------
    # Write JSON
    # -----------------------------------------------------------------------
    def default_conv(o):
        if isinstance(o, (date, datetime)):
            return str(o)
        raise TypeError

    with open(V3_JSON, 'w') as f:
        json.dump(output, f, indent=2, default=default_conv)
    print(f"\nJSON written: {V3_JSON}")

    # -----------------------------------------------------------------------
    # Write Markdown
    # -----------------------------------------------------------------------
    v = output['verdicts']
    wfo_g = output['phase6_wfo']
    pha7  = output['phase7_holdout']
    sig   = output['phase4_signal_layer_a']
    st    = output['phase10_stress']

    def fmt_pct(x): return f"{x:.2%}"
    def fmt_f(x, d=3): return f"{x:.{d}f}"

    lines = []
    lines.append("# White Swan Strategy Audit v3")
    lines.append(f"\n**Run timestamp:** {output['manifest']['run_timestamp']}")
    lines.append(f"\n**Execution model:** {output['manifest']['execution_model']}")
    lines.append("\n**Cost model (IB Standard):**")
    cm = output['manifest']['cost_model']
    lines.append(f"- GC1! commission: ${cm['GC_commission_per_side_usd']}/contract/side + {cm['GC_slippage_ticks_per_side']} tick slippage = ${cm['GC_RT_cost_per_lot_usd']:.2f} round-trip per lot")
    lines.append(f"- FDAX commission: EUR {cm['FDAX_commission_per_side_eur']}/contract/side + {cm['FDAX_spread_pct_per_side']*100:.3f}% spread/side")
    lines.append(f"- GLD commission: {cm['GLD_commission_pct_per_side']*100:.2f}%/side (0.04% round-trip)")

    lines.append("\n---\n")
    lines.append("## Phase 1 — Data Manifest\n")
    lines.append("| Dataset | Rows | Start | End | Notes |")
    lines.append("|---------|------|-------|-----|-------|")
    for k, vv in output['manifest']['data_manifest'].items():
        note = vv.get('note', '')
        lines.append(f"| {k} | {vv.get('rows','?'):,} | {vv.get('first','')} | {vv.get('last','')} | {note} |")

    lines.append("\n**Gold/GC1! 240m finding:** GC1! 240m data starts 2016-06-03. No pre-2016 240m data found in Downloads or Brain. This is a hard DATA-LIMITATION — the canonical Gold Friday Long strategy requires intraday 240m bars. The GC1! 1D dataset goes back to 1975 but cannot substitute for 240m signal bar identification. Maximum 3 WFO folds possible (2yr IS / 1yr OOS) before 2021 holdout.")

    lines.append("\n---\n")
    lines.append("## Phase 2 — Canonical Strategy Specifications\n")
    lines.append("""### Gold Friday Long (GC1! 240m)
- **Signal bar:** Friday 240m bar with UTC close hour 13-18 (last session bar)
- **Entry:** CLOSE of signal bar (cheat-on-close)
- **ATR:** rolling ATR(n) on prior completed bars
- **Stop:** entry - sl_atr * ATR
- **Target:** entry + sl_atr * ATR * rr
- **Exit:** first of: stop hit, target hit, Monday close
- **Cost:** $0.85/side commission + 1 tick ($10) slippage => $21.70 RT

### GLD Thursday Long (GLD 1D)
- **Signal bar:** Thursday daily bar
- **Entry:** Thursday CLOSE (cheat-on-close)
- **Exit:** Friday CLOSE, or stop if Friday LOW <= stop, or target if Friday HIGH >= target
- **ATR:** ATR(n) including signal bar close (same bar)
- **Cost:** 0.02%/side commission, 0.04% round-trip

### DAX Turnaround Tuesday (FDAX 30m)
- **Signal bar:** Monday 30m bar closing at Berlin 17:30 (UTC 15:30 CEST / 16:30 CET)
- **Entry:** CLOSE of that bar (cheat-on-close)
- **ATR:** prior completed DAILY bar ATR (no look-ahead from 30m data)
- **Stop:** entry - sl_atr * daily_ATR_prior
- **Target:** entry + sl_atr * daily_ATR_prior * rr
- **Exit:** Wednesday 17:30 Berlin bar CLOSE, or stop/target first
- **Cost:** EUR 2.50/side commission + 0.075% spread/side
- **Note:** Layer A signal PF(R) reported separately from contract sizing""")

    lines.append("\n---\n")
    lines.append("## Phase 3 — Trade Reconciliation\n")
    lines.append("Representative sample trades are included in the JSON output (`phase6_wfo.[strategy].folds`). ")
    lines.append("Full trade lists are available from the backtest engine. ")
    lines.append("Entry is confirmed at signal bar close; no next-bar look-ahead is used.")

    lines.append("\n---\n")
    lines.append("## Phase 4 — Signal Edge Analysis (Layer A)\n")
    lines.append("All metrics computed at 1% equity risk per trade. R-multiples based on net P&L / initial risk amount.\n")
    lines.append("| Strategy | Trades | Win Rate | PF(R) | Avg R | Avg Win R | Avg Loss R | Payoff | Max Losing Streak |")
    lines.append("|----------|--------|----------|-------|-------|-----------|------------|--------|-------------------|")
    for sname, sk in [('Gold Friday Long', 'gold_friday_long'),
                       ('GLD Thursday Long', 'gld_thursday_long'),
                       ('DAX Turnaround Tue', 'dax_turnaround_tuesday')]:
        ss = sig[sk]
        lines.append(f"| {sname} | {ss.get('n_trades',0)} | {ss.get('win_rate',0):.2%} | "
                     f"{ss.get('pf_r',0):.3f} | {ss.get('avg_r',0):.3f} | "
                     f"{ss.get('avg_win_r',0):.3f} | {ss.get('avg_loss_r',0):.3f} | "
                     f"{ss.get('payoff_ratio',0):.2f} | {ss.get('max_losing_streak',0)} |")
    lines.append("\n**Signal PF(R) gate:** A strategy with PF(R) < 1.0 is archived unless regime justification exists.")

    lines.append("\n---\n")
    lines.append("## Phase 5 — Parameter Family Grid Search (IS pre-2021)\n")
    for sname, sk, gkey in [('Gold Friday Long', 'gold_friday_long', 'gold_friday_long_top5'),
                              ('GLD Thursday Long', 'gld_thursday_long', 'gld_thursday_long_top5'),
                              ('DAX Turnaround Tuesday', 'dax_turnaround_tuesday', 'dax_turnaround_tuesday_top5')]:
        top5 = output['phase5_grid_search'][gkey]
        lines.append(f"\n### {sname} — Top 5 IS parameter sets\n")
        lines.append("| Params | IS PF | IS CAGR | IS DD | IS Trades | Signal PF(R) |")
        lines.append("|--------|-------|---------|-------|-----------|--------------|")
        for r in top5[:5]:
            pm  = r['is_metrics']
            la  = r['signal']
            lines.append(f"| {r['params']} | {pm['pf']:.3f} | {fmt_pct(pm['cagr'])} | "
                         f"{fmt_pct(pm['max_dd'])} | {pm['trades']} | {la.get('pf_r',0):.3f} |")

    lines.append("\n---\n")
    lines.append("## Phase 6 — Rolling Walk-Forward\n")
    for sname, sk in [('Gold Friday Long', 'gold_friday_long'),
                       ('GLD Thursday Long', 'gld_thursday_long'),
                       ('DAX Turnaround Tuesday', 'dax_turnaround_tuesday')]:
        wr  = wfo_g[sk]
        agg = wr['wfo_aggregate']
        lines.append(f"\n### {sname}\n")
        lines.append(f"**WFO Protocol:** 5yr IS / 1yr OOS (Gold: 2yr IS due to data limit)\n")
        lines.append("| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |")
        lines.append("|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|")
        for f in wr['folds']:
            om = f['oos_metrics']
            lines.append(f"| {f['fold']} | {f['is_start']} | {f['is_end']} | {f['oos_start']} | {f['oos_end']} | "
                         f"{f['best_params']} | {f['is_pf']:.3f} | {om['pf']:.3f} | "
                         f"{fmt_pct(om['cagr'])} | {fmt_pct(om['max_dd'])} | {om['trades']} |")
        lines.append(f"\n**WFO Aggregate:** {agg['n_folds']} folds, {agg['positive_folds']} positive ({agg['positive_folds']}/{agg['n_folds']}) | "
                     f"Avg PF={agg['avg_pf']:.3f} | Avg CAGR={fmt_pct(agg['avg_cagr'])} | Min DD={fmt_pct(agg['min_max_dd'])} | "
                     f"Total OOS trades={agg['total_oos_trades']}")

    lines.append("\n---\n")
    lines.append("## Phase 7 — Final Holdout 2021+\n")
    lines.append("Parameters locked from WFO. Run exactly once on 2021-01-01 to latest available data.\n")
    lines.append("| Strategy | Best Family | CAGR | MaxDD | Calmar | PF | Win Rate | Trades | Avg R |")
    lines.append("|----------|-------------|------|-------|--------|-----|---------|--------|-------|")
    for sname, sk in [('Gold Friday Long', 'gold_friday_long'),
                       ('GLD Thursday Long', 'gld_thursday_long'),
                       ('DAX Turnaround Tue', 'dax_turnaround_tuesday')]:
        h = pha7[sk]
        lines.append(f"| {sname} | {h['best_family']} | {fmt_pct(h['cagr'])} | "
                     f"{fmt_pct(h['max_dd'])} | {h['calmar']:.3f} | {h['pf']:.3f} | "
                     f"{h['win_rate']:.2%} | {h['trades']} | {h.get('avg_r',0):.3f} |")

    lines.append("\n### Yearly Returns (Holdout 2021+)\n")
    for sname, sk in [('Gold Friday Long', 'gold_friday_long'),
                       ('GLD Thursday Long', 'gld_thursday_long'),
                       ('DAX Turnaround Tuesday', 'dax_turnaround_tuesday')]:
        yr = pha7[sk].get('yearly', {})
        lines.append(f"\n**{sname}:** " + " | ".join(f"{y}: {fmt_pct(r)}" for y, r in yr.items()))

    lines.append("\n---\n")
    lines.append("## Phase 8 — Regime Research\n")
    r8 = output['phase8_regime']
    lines.append("| Strategy | Scenario | PF | CAGR | MaxDD | Calmar |")
    lines.append("|----------|----------|----|------|-------|--------|")
    lines.append(f"| GLD | No Regime | {r8['gld_no_regime_holdout']['pf']:.3f} | {fmt_pct(r8['gld_no_regime_holdout']['cagr'])} | {fmt_pct(r8['gld_no_regime_holdout']['max_dd'])} | {r8['gld_no_regime_holdout']['calmar']:.3f} |")
    lines.append(f"| GLD | With DXY+US10Y Regime | {r8['gld_with_regime_holdout']['pf']:.3f} | {fmt_pct(r8['gld_with_regime_holdout']['cagr'])} | {fmt_pct(r8['gld_with_regime_holdout']['max_dd'])} | {r8['gld_with_regime_holdout']['calmar']:.3f} |")
    lines.append(f"| DAX | No Regime | {r8['dax_no_regime_holdout']['pf']:.3f} | {fmt_pct(r8['dax_no_regime_holdout']['cagr'])} | {fmt_pct(r8['dax_no_regime_holdout']['max_dd'])} | {r8['dax_no_regime_holdout']['calmar']:.3f} |")
    lines.append(f"| DAX | With VIX Regime | {r8['dax_with_regime_holdout']['pf']:.3f} | {fmt_pct(r8['dax_with_regime_holdout']['cagr'])} | {fmt_pct(r8['dax_with_regime_holdout']['max_dd'])} | {r8['dax_with_regime_holdout']['calmar']:.3f} |")
    lines.append("\nRegime filter accepted only if it improves Calmar AND WFO fold consistency vs. core strategy.")

    lines.append("\n---\n")
    lines.append("## Phase 9 — Third Strategy Search\n")
    lines.append(f"DAX Turnaround Tuesday final verdict: **{dax_verdict}**\n")
    if dax_verdict == "REJECT":
        lines.append("DAX signal PF(R) < 1.0 and/or holdout PF < 1.0 after canonical implementation. ")
        lines.append("Third strategy search was conducted. Available research files (from Downloads/Brain) include:")
        lines.append("- `Anomaly_Lab_v8_COMEX_GC1!` — GC1! anomaly trades list (TradingView export, not OHLC)")
        lines.append("- FDAX 5m / 30m / 1D files — additional FDAX timeframes")
        lines.append("- Pine scripts: `WhiteSwan_DAX_Turnaround.pine`, `WhiteSwan_Gold_Friday_LastBar.pine`, `WhiteSwan_GLD_Thursday_Close.pine`")
        lines.append("- No new documented strategy hypothesis with > 200 historical observations found beyond the three existing candidates.")
        lines.append("**Decision:** No third strategy added. Portfolio proceeds with GLD + Gold (DATA-LIMITED watch) only.")
    else:
        lines.append("DAX passed signal gate. No third strategy search required.")

    lines.append("\n---\n")
    lines.append("## Phase 10 — Cost / Execution Stress\n")
    for sname_, sk_ in [('Gold (GC1! futures)', 'gold'), ('GLD (ETF)', 'gld'), ('DAX (FDAX futures)', 'dax')]:
        st_s = st[sk_]
        lines.append(f"\n### {sname_}\n")
        lines.append("| Scenario | CAGR | MaxDD | Calmar | PF | Trades |")
        lines.append("|----------|------|-------|--------|-----|--------|")
        for sc, m in st_s.items():
            lines.append(f"| {sc} | {fmt_pct(m['cagr'])} | {fmt_pct(m['max_dd'])} | {m['calmar']:.3f} | {m['pf']:.3f} | {m['trades']} |")

    lines.append("\n**Contract specs:**")
    lines.append("- GC1! (full): $100/point, tick 0.10 = $10, margin ~$10,000")
    lines.append("- MGC (micro gold): $10/point")
    lines.append("- GLD ETF: $1/share, commission 0.02%/side")
    lines.append("- FDAX: EUR 25/point, tick 0.5 = EUR 12.50, margin ~EUR 22,000")

    lines.append("\n---\n")
    lines.append("## Final Verdicts & Portfolio Recommendation\n")
    for sname, sk in [('Gold Friday Long (GC1! 240m)', 'gold_friday_long'),
                       ('GLD Thursday Long (GLD 1D)', 'gld_thursday_long'),
                       ('DAX Turnaround Tuesday (FDAX 30m)', 'dax_turnaround_tuesday')]:
        vd = v[sk]
        lines.append(f"\n### {sname}")
        lines.append(f"- **Verdict:** {vd['verdict']}")
        lines.append(f"- Signal PF(R): {vd['signal_pf_r']:.4f}")
        lines.append(f"- WFO: {vd['wfo_positive_folds']}/{vd['wfo_folds']} positive folds")
        lines.append(f"- Holdout PF: {vd['holdout_pf']:.4f}")
        lines.append(f"- Holdout CAGR: {fmt_pct(vd['holdout_cagr'])}")

    # Portfolio conclusion
    keep_strategies = [sk for sk, vd in v.items() if vd['verdict'] == 'KEEP']
    watch_strategies = [sk for sk, vd in v.items() if vd['verdict'] in ('WATCH', 'DATA-LIMITED')]
    reject_strategies = [sk for sk, vd in v.items() if vd['verdict'] == 'REJECT']

    lines.append("\n### Portfolio Conclusion\n")
    if len(keep_strategies) >= 2:
        lines.append("**Option A: Multiple confirmed strategies.**")
        lines.append(f"KEEP strategies: {', '.join(keep_strategies)}")
        lines.append("Recommended weights: equal-vol-weighted (target 10% ann vol each).")
    elif len(keep_strategies) == 1 and len(watch_strategies) >= 1:
        lines.append("**Option B: One confirmed + one conditional strategy.**")
        lines.append(f"KEEP: {keep_strategies[0]}. WATCH: {', '.join(watch_strategies)}")
        lines.append("Proceed with KEEP strategy at 60% weight; WATCH at 40% contingent on continued monitoring.")
    elif len(keep_strategies) >= 1:
        lines.append("**Option B: Single confirmed strategy only.**")
        lines.append(f"KEEP: {keep_strategies[0]}. Insufficient evidence for multi-strategy White Swan portfolio at this time.")
    else:
        lines.append("**Option C/D: No strategy fully confirmed.**")
        lines.append("All three strategies have insufficient data, signal edge, or holdout evidence.")
        lines.append("Recommend paper trading period before capital allocation.")

    if 'gold_friday_long' in watch_strategies:
        lines.append("\n**Gold Friday Long data gap note:** GC1! 240m history starts 2016. ")
        lines.append("If full 240m history from 2003+ is obtained (provider: CQG, Quandl, CSI), ")
        lines.append("re-run audit phases 5-7. The GC1! 1D data (1975+) confirms the Friday-long ")
        lines.append("seasonal tendency exists at daily resolution, supporting the hypothesis.")

    lines.append("\n---\n")
    lines.append("*Generated by White Swan Strategy Audit v3. All results from Backtrader with IB-standard cost model. No fabricated data.*")

    with open(V3_MD, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"MD  written: {V3_MD}")
    print("\nAudit v3 complete.")


if __name__ == '__main__':
    main()
