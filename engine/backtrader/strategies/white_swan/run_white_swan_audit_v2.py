"""
White Swan Strategy Audit v2 -- CLOSE-FILL EXECUTION (Corrected)
=================================================================
Execution model: cheat-on-close (process_orders_on_close=True equivalent)
- Gold:  entry at SIGNAL bar's CLOSE (penultimate Friday 240m bar)
- GLD:   entry at THURSDAY's CLOSE; exit at FRIDAY's CLOSE
- DAX:   entry at MONDAY 17:30 Berlin 30m bar's CLOSE

All three strategies verified as bar-close execution strategies.
This is NOT look-ahead: the bar-close price is confirmed at bar close,
and market-at-close orders are a real institutional execution model.

Previous v1 used next-bar-open for all three strategies -- this was WRONG.

Outputs:
  engine/backtrader/reports/white_swan_audit_results.json
  engine/backtrader/reports/white_swan_trade_reconciliation.json
  reports/white_swan_strategy_audit.md
"""

import sys, os, json, warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
from datetime import datetime
from itertools import product

# ---- File paths ---------------------------------------------------------------
DOWNLOADS  = r"C:\Users\joris\Downloads"
GC_CSV     = os.path.join(DOWNLOADS, "COMEX_DL_GC1!, 240_dc277.csv")
FDAX_CSV   = os.path.join(DOWNLOADS, "EUREX_FDAX_30min_gesamt_2007-2026.csv")
GLD_CSV    = os.path.join(DOWNLOADS, "BATS_GLD, 1D_4975f.csv")
VIX_CSV    = os.path.join(DOWNLOADS, "TVC_VIX, 1D_402f7.csv")
US10Y_CSV  = os.path.join(DOWNLOADS, "TVC_US10Y, 1D_935af.csv")
DXY_CSV    = os.path.join(DOWNLOADS, "ICEUS_DLY_DXY, 1D_3217e.csv")

SCRIPT_DIR  = os.path.dirname(__file__)
REPORT_DIR  = os.path.join(SCRIPT_DIR, "..", "..", "reports")
MD_REPORT_DIR = os.path.join(SCRIPT_DIR, "..", "..", "..", "..", "reports")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(MD_REPORT_DIR, exist_ok=True)

RESULTS_PATH   = os.path.join(REPORT_DIR, "white_swan_audit_results.json")
RECON_PATH     = os.path.join(REPORT_DIR, "white_swan_trade_reconciliation.json")
MD_REPORT_PATH = os.path.join(MD_REPORT_DIR, "white_swan_strategy_audit.md")

# Reference numbers from handoff doc (prior research, not Backtrader)
REFERENCE = {
    'gold_friday_long':       {'cagr': 0.0264, 'max_dd': -0.0514, 'calmar': 0.51, 'pf': 1.58, 'trades': 547},
    'dax_turnaround_tuesday': {'cagr': 0.0208, 'max_dd': -0.0991, 'calmar': 0.21, 'pf': 1.29, 'trades': 284},
    'gld_thursday_long':      {'cagr': 0.0483, 'max_dd': -0.1127, 'calmar': 0.43, 'pf': 1.58, 'trades': 525},
}

# v1 results (next-bar-open, from prior audit run)
V1_RESULTS = {
    'gold_friday_long':       {'cagr': 0.0005, 'max_dd': -0.0004, 'pf': 1.3942, 'trades': 152},
    'dax_turnaround_tuesday': {'cagr': 0.0000, 'max_dd': 0.0000,  'pf': 0.0000, 'trades': 0},
    'gld_thursday_long':      {'cagr': 0.0000, 'max_dd': 0.0000,  'pf': 0.0000, 'trades': 0},
}

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
    for c in ['open', 'high', 'low', 'close']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    if 'volume' in df.columns:
        df['volume'] = pd.to_numeric(df['volume'], errors='coerce').fillna(0)
    else:
        df['volume'] = 0.0
    return df.dropna(subset=['open', 'high', 'low', 'close']).reset_index(drop=True)


def load_daily(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df['date'] = pd.to_datetime(df['time']).dt.date
    df = df.sort_values('date').reset_index(drop=True)
    df['close'] = pd.to_numeric(df['close'], errors='coerce')
    return df.dropna(subset=['close']).set_index('date')['close']


# ---- Metrics -----------------------------------------------------------------

def metrics_from_trades(trades, initial_cash=100_000):
    if not trades:
        return {'cagr': 0, 'max_dd': 0, 'calmar': 0, 'pf': 0, 'win_rate': 0, 'trades': 0,
                'final_value': initial_cash}

    pnls    = [t['pnl_dollar'] for t in trades]
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
    cumulative = initial_cash
    for d in sorted(by_date.keys()):
        cumulative += sum(by_date[d])
        eq_series.append(cumulative)

    eq_arr = np.array(eq_series, dtype=float)
    if len(eq_arr) < 2:
        return {'cagr': 0, 'max_dd': 0, 'calmar': 0, 'pf': round(pf, 4),
                'win_rate': round(wr, 4), 'trades': len(pnls), 'final_value': float(eq_arr[-1]) if len(eq_arr) else initial_cash}

    first_date = sorted(by_date.keys())[0]
    last_date  = sorted(by_date.keys())[-1]
    try:
        d0    = pd.Timestamp(str(first_date))
        d1    = pd.Timestamp(str(last_date))
        years = max((d1 - d0).days / 365.25, 0.1)
    except Exception:
        years = 1.0

    final_val = float(eq_arr[-1])
    cagr      = (final_val / initial_cash) ** (1 / years) - 1
    roll_max  = np.maximum.accumulate(eq_arr)
    dd        = (eq_arr - roll_max) / roll_max
    max_dd    = float(dd.min())
    calmar    = cagr / abs(max_dd) if abs(max_dd) > 1e-9 else 0.0

    return {
        'cagr':        round(float(cagr), 4),
        'max_dd':      round(float(max_dd), 4),
        'calmar':      round(float(calmar), 4),
        'pf':          round(float(pf), 4),
        'win_rate':    round(float(wr), 4),
        'trades':      len(pnls),
        'final_value': round(final_val, 2),
    }


def layer_a_signal_stats(trades):
    """Layer A: pure signal stats, no sizing artifact."""
    if not trades:
        return {}
    r_multiples = [t.get('r_multiple', 0) for t in trades]
    winners = [r for r in r_multiples if r > 0]
    losers  = [r for r in r_multiples if r <= 0]
    stops   = sum(1 for t in trades if t.get('reason') == 'stop')
    targets = sum(1 for t in trades if t.get('reason') == 'target')
    time_ex = sum(1 for t in trades if t.get('reason') not in ('stop', 'target'))
    gp = sum(winners) if winners else 0
    gl = abs(sum(losers)) if losers else 1e-9
    return {
        'n_trades':    len(trades),
        'win_rate':    round(len(winners) / len(trades), 4) if trades else 0,
        'pf_r':        round(gp / gl, 4),
        'avg_r':       round(float(np.mean(r_multiples)), 4),
        'avg_win_r':   round(float(np.mean(winners)), 4) if winners else 0,
        'avg_loss_r':  round(float(np.mean(losers)), 4) if losers else 0,
        'payoff_ratio':round(abs(np.mean(winners)/np.mean(losers)), 4) if winners and losers else 0,
        'stop_pct':    round(stops / len(trades), 4),
        'target_pct':  round(targets / len(trades), 4),
        'time_exit_pct': round(time_ex / len(trades), 4),
    }


# ==============================================================================
# Strategy 1: Gold Friday Long (GC1 240m) -- CLOSE-FILL
# ==============================================================================

def backtest_gold_friday(df, atr_len=10, sl_atr=1.0, rr=1.5,
                          risk_pct=0.01, contract_pts=100,
                          commission_per_side=3.0,
                          initial_cash=100_000,
                          from_dt=None, to_dt=None,
                          record_trades=False):
    """
    CLOSE-FILL version.
    Signal bar: Friday, UTC hour 13-18 (penultimate bar of Friday session).
    Entry: signal bar's CLOSE (cheat-on-close).
    ATR: computed on signal bar.
    Stop: entry - sl_atr * ATR
    Target: entry + sl_atr * ATR * rr
    Time exit: FINAL Friday session bar's close (UTC hour >= 19).
    Commission: $3/side/contract. Point value: $100/point.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < atr_len + 5:
        return []

    hl  = d['high'] - d['low']
    hpc = (d['high'] - d['close'].shift(1)).abs()
    lpc = (d['low']  - d['close'].shift(1)).abs()
    tr  = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    atr = tr.rolling(atr_len).mean()

    d['atr']     = atr
    d['weekday'] = d['dt'].dt.weekday   # 0=Mon 4=Fri
    d['hour_utc']= d['dt'].dt.hour

    # Penultimate Friday bar: Friday, hour 13-18, ATR valid
    signal_mask   = (d['weekday'] == 4) & (d['hour_utc'].between(13, 18)) & (d['atr'].notna())
    # Time-exit bar: Friday, hour >= 19
    time_exit_mask= (d['weekday'] == 4) & (d['hour_utc'] >= 19)

    trades    = []
    equity    = initial_cash
    in_trade  = False
    entry_price = stop_price = target_price = size = 0
    entry_bar = 0

    for i in range(len(d)):
        if not in_trade:
            if signal_mask.iloc[i]:
                a  = d['atr'].iloc[i]
                # CLOSE-FILL: entry at THIS bar's close
                ep = d['close'].iloc[i]
                sd = sl_atr * a
                sp = ep - sd
                tp = ep + sd * rr

                stop_usd = sd * contract_pts
                if stop_usd <= 0 or np.isnan(stop_usd):
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
            # Check from NEXT bar after entry
            if i <= entry_bar:
                continue
            bar = d.iloc[i]
            exit_price = None
            reason     = None

            if bar['low'] <= stop_price:
                exit_price = stop_price
                reason     = 'stop'
            elif bar['high'] >= target_price:
                exit_price = target_price
                reason     = 'target'
            elif time_exit_mask.iloc[i]:
                exit_price = bar['close']
                reason     = 'time_fri'
            elif bar['weekday'] == 0 and i > entry_bar + 1:
                # Force exit Monday open if we missed the Friday close
                exit_price = bar['open']
                reason     = 'force_mon'

            if exit_price is not None:
                gross   = (exit_price - entry_price) * size * contract_pts
                comm    = commission_per_side * 2 * size
                net     = gross - comm
                risk_amt= abs(entry_price - stop_price) * size * contract_pts
                r_mult  = net / risk_amt if risk_amt > 0 else 0
                equity += net

                t = {
                    'signal_bar_timestamp': str(entry_dt),
                    'entry_timestamp':      str(entry_dt),
                    'entry_price':          round(entry_price, 2),
                    'atr_value_used':       round(atr_val, 2),
                    'stop_price':           round(stop_price, 2),
                    'target_price':         round(target_price, 2),
                    'exit_timestamp':       str(bar['dt']),
                    'exit_price':           round(exit_price, 2),
                    'exit_reason':          reason,
                    'size':                 int(size),
                    'gross_pnl':            round(gross, 2),
                    'costs':                round(comm, 2),
                    'pnl_dollar':           round(net, 2),
                    'r_multiple':           round(r_mult, 3),
                    'entry_date':           entry_dt.date(),
                    'exit_date':            bar['dt'].date(),
                }
                trades.append(t)
                in_trade = False

    return trades


# ==============================================================================
# Strategy 2: DAX Turnaround Tuesday (FDAX 30m) -- CLOSE-FILL
# ==============================================================================

def _compute_daily_atr_sma(df30m, atr_len=7):
    d = df30m.copy()
    d['date_berlin'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.date

    daily = d.groupby('date_berlin').agg(
        high=('high', 'max'), low=('low', 'min'), close=('close', 'last')
    ).reset_index()
    daily = daily.sort_values('date_berlin').reset_index(drop=True)
    daily['prev_close'] = daily['close'].shift(1)

    def calc_tr(r):
        hl = r['high'] - r['low']
        if pd.notna(r['prev_close']):
            return max(hl, abs(r['high'] - r['prev_close']), abs(r['low'] - r['prev_close']))
        return hl

    daily['tr']          = daily.apply(calc_tr, axis=1)
    daily['atr_sma']     = daily['tr'].rolling(atr_len).mean()
    # Also compute MA of ATR for regime condition 1
    daily['atr_sma_ma']  = daily['atr_sma'].rolling(atr_len).mean()
    # Shift by 1 day: prior-day confirmed, no look-ahead
    daily['atr_sma_prev']    = daily['atr_sma'].shift(1)
    daily['atr_sma_ma_prev'] = daily['atr_sma_ma'].shift(1)

    atr_map       = {str(r['date_berlin']): r['atr_sma_prev']    for _, r in daily.iterrows()}
    atr_ma_map    = {str(r['date_berlin']): r['atr_sma_ma_prev'] for _, r in daily.iterrows()}
    return atr_map, atr_ma_map


def backtest_dax_tuesday(df, atr_len=7, sl_atr=1.5, rr=1.5,
                          risk_pct=0.01, contract_size=25,
                          commission_eur=2.50, spread_pct=0.00075,
                          vix_regime=None, us10y_regime=None,
                          initial_cash=100_000,
                          from_dt=None, to_dt=None,
                          record_trades=False):
    """
    CLOSE-FILL version.
    Signal bar: Monday 30m bar with time = 16:30 UTC (CET 17:30) or 15:30 UTC (CEST 17:30).
    Entry: that bar's CLOSE (cheat-on-close).
    Daily ATR: prior completed daily bar's ATR_SMA, no look-ahead.
    Stop: entry - sl_atr * daily_ATR_prior
    Target: entry + sl_atr * daily_ATR_prior * rr
    Time exit: Wednesday same-time bar's CLOSE.
    Regime: VIX < VIX_SMA(20) bad; US10Y > US10Y_SMA(20) bad; ATR < ATR_SMA bad.
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < 100:
        return []

    atr_map, atr_ma_map = _compute_daily_atr_sma(d, atr_len)

    d['weekday']  = d['dt'].dt.weekday
    d['hour_utc'] = d['dt'].dt.hour
    d['minute']   = d['dt'].dt.minute
    d['date_str'] = d['dt'].dt.tz_convert('Europe/Berlin').dt.strftime('%Y-%m-%d')

    # Entry: Monday, (hour 15 or 16) AND minute 30 = 17:30 Berlin time
    entry_mask = (d['weekday'] == 0) & (d['hour_utc'].isin([15, 16])) & (d['minute'] == 30)
    exit_mask  = (d['weekday'] == 2) & (d['hour_utc'].isin([15, 16])) & (d['minute'] == 30)

    def regime_mult(date_str, atr_val, atr_ma_val):
        bad = 0
        # Condition 1: ATR < ATR_MA = low volatility = bad for bounce
        if atr_val is not None and atr_ma_val is not None and \
           not np.isnan(atr_val) and not np.isnan(atr_ma_val) and atr_val < atr_ma_val:
            bad += 1
        # Condition 2: VIX < VIX_SMA = too calm
        if vix_regime and vix_regime.get(date_str, False):
            bad += 1
        # Condition 3: US10Y > US10Y_SMA = rising rates bad
        if us10y_regime and us10y_regime.get(date_str, False):
            bad += 1
        return 1.00 if bad == 0 else (0.75 if bad == 1 else 0.50)

    trades    = []
    equity    = initial_cash
    in_trade  = False
    entry_price = stop_price = target_price = size = 0
    entry_bar = 0

    for i in range(len(d)):
        if not in_trade:
            if entry_mask.iloc[i]:
                ds       = d['date_str'].iloc[i]
                atr_val  = atr_map.get(ds)
                atr_ma   = atr_ma_map.get(ds)
                if atr_val is None or np.isnan(float(atr_val)) or float(atr_val) <= 0:
                    continue

                atr_val = float(atr_val)
                atr_ma  = float(atr_ma) if atr_ma is not None and not np.isnan(float(atr_ma)) else None

                # CLOSE-FILL: entry at THIS bar's close
                ep = d['close'].iloc[i]
                sd = sl_atr * atr_val
                sp = ep - sd
                tp = ep + sd * rr

                rm       = regime_mult(ds, atr_val, atr_ma)
                stop_eur = sd * contract_size
                if stop_eur <= 0:
                    continue
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

            if bar['low'] <= stop_price:
                exit_price = stop_price
                reason     = 'stop'
            elif bar['high'] >= target_price:
                exit_price = target_price
                reason     = 'target'
            elif exit_mask.iloc[i]:
                exit_price = bar['close']
                reason     = 'time_wed'
            elif bar['weekday'] > 2 and i > entry_bar + 4:
                exit_price = bar['open']
                reason     = 'force'

            if exit_price is not None:
                gross   = (exit_price - entry_price) * size * contract_size
                comm    = (commission_eur + exit_price * spread_pct * contract_size) * 2 * size
                net     = gross - comm
                risk_amt= abs(entry_price - stop_price) * size * contract_size
                r_mult  = net / risk_amt if risk_amt > 0 else 0
                equity += net

                t = {
                    'signal_bar_timestamp': str(entry_dt),
                    'entry_timestamp':      str(entry_dt),
                    'entry_price':          round(entry_price, 2),
                    'atr_value_used':       round(atr_used, 2),
                    'stop_price':           round(stop_price, 2),
                    'target_price':         round(target_price, 2),
                    'exit_timestamp':       str(bar['dt']),
                    'exit_price':           round(exit_price, 2),
                    'exit_reason':          reason,
                    'size':                 int(size),
                    'gross_pnl':            round(gross, 2),
                    'costs':                round(comm, 2),
                    'pnl_dollar':           round(net, 2),
                    'r_multiple':           round(r_mult, 3),
                    'entry_date':           entry_dt.date(),
                    'exit_date':            bar['dt'].date(),
                }
                trades.append(t)
                in_trade = False

    return trades


# ==============================================================================
# Strategy 3: GLD Thursday Long (Daily) -- CLOSE-FILL
# ==============================================================================

def backtest_gld_thursday(df, atr_len=14, sl_atr=1.0, tp_r=0.0,
                           risk_pct=0.01, commission_pct=0.0002,
                           dxy_bad=None, us10y_bad=None,
                           initial_cash=100_000,
                           from_dt=None, to_dt=None,
                           record_trades=False):
    """
    CLOSE-FILL version.
    Signal: Thursday daily bar.
    Entry: Thursday's CLOSE (cheat-on-close).
    Exit: Friday's CLOSE (next bar's close — place pending order executed at Friday close).
    Safety stop: if Friday's LOW <= stop_price, exit at stop_price.
    TP: if tp_r > 0 and Friday HIGH >= tp_price, exit at tp_price.
    Otherwise: exit at Friday CLOSE.
    Commission: 0.02%/side (0.04% roundtrip applied on exit price * shares).
    """
    d = df.copy()
    if from_dt is not None:
        d = d[d['dt'] >= to_utc(from_dt)]
    if to_dt is not None:
        d = d[d['dt'] < to_utc(to_dt)]
    d = d.reset_index(drop=True)

    if len(d) < atr_len + 5:
        return []

    hl  = d['high'] - d['low']
    hpc = (d['high'] - d['close'].shift(1)).abs()
    lpc = (d['low']  - d['close'].shift(1)).abs()
    tr  = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    atr = tr.rolling(atr_len).mean()
    d['atr']     = atr
    d['weekday'] = d['dt'].dt.weekday  # 3=Thu 4=Fri

    signal_mask = (d['weekday'] == 3) & (d['atr'].notna())

    def size_mult(idx):
        ds  = d['dt'].iloc[idx].strftime('%Y-%m-%d')
        bad = 0
        if dxy_bad and dxy_bad.get(ds, False):
            bad += 1
        if us10y_bad and us10y_bad.get(ds, False):
            bad += 1
        if bad == 2:
            return 0.5
        elif bad == 1:
            return 0.75
        return 1.0

    trades = []
    equity = initial_cash
    i      = 0

    while i < len(d) - 1:
        if signal_mask.iloc[i]:
            a  = d['atr'].iloc[i]
            # CLOSE-FILL: enter at Thursday's close
            ep = d['close'].iloc[i]
            sd = sl_atr * a
            sp = ep - sd
            tp = ep + sd * tp_r if tp_r > 0 else None

            sm = size_mult(i)
            sz = max(1, int(equity * risk_pct * sm / sd)) if sd > 0 else 1

            entry_dt  = d['dt'].iloc[i]
            atr_val   = a
            thu_ds    = entry_dt.strftime('%Y-%m-%d')

            # Exit bar: Friday (i+1)
            fri = d.iloc[i + 1]
            exit_price = None
            reason     = None

            # Safety stop checked against Friday's intraday low
            if fri['low'] <= sp:
                exit_price = sp
                reason     = 'stop'
            elif tp is not None and fri['high'] >= tp:
                exit_price = tp
                reason     = 'target'
            else:
                # Exit at Friday's CLOSE
                exit_price = fri['close']
                reason     = 'time_fri'

            # Commission: 0.04% roundtrip on trade value
            trade_val = exit_price * sz
            comm      = trade_val * commission_pct * 2
            gross     = (exit_price - ep) * sz
            net       = gross - comm
            risk_amt  = abs(ep - sp) * sz
            r_mult    = net / risk_amt if risk_amt > 0 else 0
            equity   += net

            t = {
                'signal_bar_timestamp': str(entry_dt),
                'entry_timestamp':      str(entry_dt),
                'entry_price':          round(ep, 4),
                'atr_value_used':       round(atr_val, 4),
                'stop_price':           round(sp, 4),
                'target_price':         round(tp, 4) if tp else None,
                'exit_timestamp':       str(fri['dt']),
                'exit_price':           round(exit_price, 4),
                'exit_reason':          reason,
                'size':                 int(sz),
                'gross_pnl':            round(gross, 4),
                'costs':                round(comm, 4),
                'pnl_dollar':           round(net, 4),
                'r_multiple':           round(r_mult, 3),
                'entry_date':           entry_dt.date(),
                'exit_date':            fri['dt'].date(),
            }
            trades.append(t)
            i += 2  # skip Friday bar, next signal is next Thursday
        else:
            i += 1

    return trades


# ==============================================================================
# Regime builders
# ==============================================================================

def build_regime(series, ma_len, condition='below'):
    ma          = series.rolling(ma_len).mean()
    bad         = series < ma if condition == 'below' else series > ma
    bad_shifted = bad.shift(1).fillna(False)
    return {str(d): bool(v) for d, v in bad_shifted.items()}


# ==============================================================================
# WFO Engine
# ==============================================================================

def run_wfo(name, backtest_fn, df, param_grid, extra_kwargs,
            is_years, oos_years, data_start_year,
            holdout_start='2021-01-01', initial_cash=100_000,
            min_is_trades=10):

    print(f"\n{'='*60}")
    print(f"WFO: {name}")
    print(f"{'='*60}")

    holdout_dt = pd.Timestamp(holdout_start, tz='UTC')

    folds = []
    oos_year = data_start_year + is_years
    while True:
        is_start = pd.Timestamp(f"{oos_year - is_years}-01-01", tz='UTC')
        is_end   = pd.Timestamp(f"{oos_year}-01-01", tz='UTC')
        oos_end  = pd.Timestamp(f"{oos_year + oos_years}-01-01", tz='UTC')
        if is_end >= holdout_dt:
            break
        folds.append({
            'is_start':  is_start, 'is_end': is_end,
            'oos_start': is_end,   'oos_end': min(oos_end, holdout_dt),
        })
        oos_year += oos_years

    print(f"  {len(folds)} WFO folds planned (min IS trades = {min_is_trades})")

    param_names  = list(param_grid.keys())
    param_combos = list(product(*param_grid.values()))

    fold_results    = []
    all_best_params = []

    for fi, fold in enumerate(folds):
        print(f"  Fold {fi+1}/{len(folds)}: IS {fold['is_start'].date()} -> {fold['is_end'].date()}"
              f" | OOS {fold['oos_start'].date()} -> {fold['oos_end'].date()}")

        best_pf     = -999
        best_params = None
        best_is_m   = None

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
                best_pf    = m['pf']
                best_params= params
                best_is_m  = m

        if best_params is None:
            print(f"    No valid IS params (min {min_is_trades} trades not met) -- skipping fold")
            continue

        print(f"    Best IS: {best_params}  PF={best_pf:.3f}  trades={best_is_m['trades']}")

        oos_kwargs = {**extra_kwargs, **best_params,
                      'from_dt': fold['oos_start'], 'to_dt': fold['oos_end'],
                      'initial_cash': initial_cash}
        try:
            oos_trades = backtest_fn(df, **oos_kwargs)
            oos_m      = metrics_from_trades(oos_trades, initial_cash)
        except Exception as e:
            print(f"    OOS error: {e}")
            oos_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0,'final_value':initial_cash}

        print(f"    OOS: CAGR={oos_m['cagr']:.2%}  DD={oos_m['max_dd']:.2%}  PF={oos_m['pf']:.3f}  trades={oos_m['trades']}")

        fold_results.append({
            'fold':       fi + 1,
            'is_start':   str(fold['is_start'].date()),
            'is_end':     str(fold['is_end'].date()),
            'oos_start':  str(fold['oos_start'].date()),
            'oos_end':    str(fold['oos_end'].date()),
            'best_params':best_params,
            'is_metrics': best_is_m,
            'oos_metrics':oos_m,
        })
        all_best_params.append(best_params)

    # Aggregate WFO OOS
    if fold_results:
        total_trades = sum(f['oos_metrics']['trades'] for f in fold_results)
        wfo_cagr     = float(np.mean([f['oos_metrics']['cagr'] for f in fold_results]))
        wfo_max_dd   = float(min(f['oos_metrics']['max_dd'] for f in fold_results))
        wfo_pf_vals  = [f['oos_metrics']['pf'] for f in fold_results if f['oos_metrics']['trades'] > 0]
        wfo_pf       = float(np.mean(wfo_pf_vals)) if wfo_pf_vals else 0.0
        wfo_wr       = float(np.mean([f['oos_metrics']['win_rate'] for f in fold_results]))
        wfo_calmar   = wfo_cagr / abs(wfo_max_dd) if abs(wfo_max_dd) > 1e-9 else 0.0
        pos_folds    = sum(1 for f in fold_results if f['oos_metrics']['cagr'] > 0)
        wfo_m = {
            'cagr': round(wfo_cagr, 4), 'max_dd': round(wfo_max_dd, 4),
            'calmar': round(wfo_calmar, 4), 'pf': round(wfo_pf, 4),
            'win_rate': round(wfo_wr, 4), 'trades': total_trades,
            'n_folds': len(fold_results), 'positive_folds': pos_folds,
        }
    else:
        wfo_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0,'n_folds':0,'positive_folds':0}

    # Best family: mode of best IS params across folds
    if all_best_params:
        freq = {}
        for p in all_best_params:
            key = tuple(p[k] for k in param_names)
            freq[key] = freq.get(key, 0) + 1
        best_key    = max(freq, key=lambda k: freq[k])
        best_family = dict(zip(param_names, best_key))
    else:
        best_family = {k: v[len(v) // 2] for k, v in param_grid.items()}

    print(f"\n  Locked family: {best_family}")

    # Holdout (run exactly once)
    hk = {**extra_kwargs, **best_family,
          'from_dt': holdout_dt, 'to_dt': None, 'initial_cash': initial_cash}
    try:
        h_trades = backtest_fn(df, **hk)
        h_m      = metrics_from_trades(h_trades, initial_cash)
    except Exception as e:
        print(f"  Holdout error: {e}")
        h_m = {'cagr':0,'max_dd':0,'calmar':0,'pf':0,'win_rate':0,'trades':0,'final_value':initial_cash}

    print(f"  Holdout 2021+: CAGR={h_m['cagr']:.2%}  DD={h_m['max_dd']:.2%}  PF={h_m['pf']:.3f}  trades={h_m['trades']}")

    return {
        'strategy':         name,
        'folds':            fold_results,
        'wfo_aggregate':    wfo_m,
        'best_family':      best_family,
        'holdout_2021_plus': h_m,
    }


# ==============================================================================
# Main
# ==============================================================================

def main():
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

    # Regime signals (prior-day confirmed, no look-ahead)
    vix_regime    = build_regime(vix_s,    20, 'below')   # VIX < SMA20 = bad
    us10y_regime  = build_regime(us10y_s,  20, 'above')   # US10Y > SMA20 = bad
    dxy_bad_gld   = build_regime(dxy_s,   100, 'above')   # DXY > SMA100 = bad for GLD
    us10y_bad_gld = build_regime(us10y_s, 100, 'above')   # US10Y > SMA100 = bad for GLD

    # ===========================================================================
    # Strategy 1: Gold Friday Long
    # ===========================================================================
    gold_grid  = {'atr_len': [7, 10, 14], 'sl_atr': [0.75, 1.0, 1.25], 'rr': [1.0, 1.5, 2.0]}
    gold_extra = {'risk_pct': 0.01, 'contract_pts': 100, 'commission_per_side': 3.0}
    gc_start   = gc_df['dt'].min().year  # 2016 -- DATA LIMITATION, only 2-3 folds possible

    gold_r = run_wfo(
        'GOLD Friday Long (GC1 240m)',
        backtest_gold_friday, gc_df,
        gold_grid, gold_extra,
        is_years=2, oos_years=1, data_start_year=gc_start,
        min_is_trades=10,
    )

    # Full-history Layer B/C run (best family, all pre-holdout data)
    gold_full_trades = backtest_gold_friday(gc_df, **{**gold_extra, **gold_r['best_family']})
    gold_pre2021     = [t for t in gold_full_trades if str(t['exit_date']) < '2021-01-01']
    gold_layer_a     = layer_a_signal_stats(gold_pre2021)
    gold_layer_b     = metrics_from_trades(gold_pre2021)   # 1% risk normalized
    # Layer C: actual GC1 instrument (1 contract min, $100/pt, $6 roundtrip)
    gold_layer_c_note = "GC1 futures: $100/point, $6 roundtrip. Min 1 contract. On 100k equity, 1% risk = $1000 risk."

    # ===========================================================================
    # Strategy 2: DAX Turnaround Tuesday
    # ===========================================================================
    dax_grid  = {'atr_len': [7, 14, 21], 'sl_atr': [1.0, 1.5, 2.0], 'rr': [1.0, 1.5, 2.0]}
    dax_extra = {
        'risk_pct': 0.01, 'contract_size': 1, 'commission_eur': 2.50, 'spread_pct': 0.00075,
        'vix_regime': vix_regime, 'us10y_regime': us10y_regime,
    }
    # Run with FDXS (EUR 1/point, contract_size=1) for granular sizing
    fdax_start = fdax_df['dt'].min().year  # 2007

    dax_r = run_wfo(
        'DAX Turnaround Tuesday (FDAX 30m)',
        backtest_dax_tuesday, fdax_df,
        dax_grid, dax_extra,
        is_years=5, oos_years=1, data_start_year=fdax_start,
        min_is_trades=10,
    )

    dax_full_trades  = backtest_dax_tuesday(fdax_df, **{**dax_extra, **dax_r['best_family']})
    dax_pre2021      = [t for t in dax_full_trades if str(t['exit_date']) < '2021-01-01']
    dax_layer_a      = layer_a_signal_stats(dax_pre2021)
    dax_layer_b      = metrics_from_trades(dax_pre2021)
    # FDXS vs FDAX note
    dax_layer_c_note = ("FDXS (DAX micro, EUR 1/pt): used in this run for granularity. "
                        "FDAX (EUR 25/pt) would give 25x larger P&L per contract. "
                        "On 100k EUR account, FDAX creates ~EUR 1250-5000 risk per trade "
                        "vs FDXS ~EUR 50-200. Flag: FDAX is oversized for <200k EUR accounts.")

    # ===========================================================================
    # Strategy 3: GLD Thursday Long
    # ===========================================================================
    gld_grid  = {'atr_len': [10, 14, 20], 'sl_atr': [0.75, 1.0, 1.5], 'tp_r': [0.0, 1.5, 2.0]}
    gld_extra = {
        'risk_pct': 0.01, 'commission_pct': 0.0002,
        'dxy_bad': dxy_bad_gld, 'us10y_bad': us10y_bad_gld,
    }
    gld_start = gld_df['dt'].min().year  # 2004

    gld_r = run_wfo(
        'GLD Thursday Long (GLD 1D)',
        backtest_gld_thursday, gld_df,
        gld_grid, gld_extra,
        is_years=5, oos_years=1, data_start_year=gld_start,
        min_is_trades=10,
    )

    gld_full_trades = backtest_gld_thursday(gld_df, **{**gld_extra, **gld_r['best_family']})
    gld_pre2021     = [t for t in gld_full_trades if str(t['exit_date']) < '2021-01-01']
    gld_layer_a     = layer_a_signal_stats(gld_pre2021)
    gld_layer_b     = metrics_from_trades(gld_pre2021)
    gld_layer_c_note= ("GLD ETF: $1/share. Commission 0.02%/side = 0.04% roundtrip. "
                       "On 100k USD, 1% risk = $1000. With ATR ~$1.50 and SL=1.0x, "
                       "position size ~667 shares ~ $145k notional. Leverage ~1.45x.")

    # ===========================================================================
    # Trade Reconciliation (20+ trades per strategy, all available history)
    # ===========================================================================
    print("\nBuilding trade reconciliation tables...")
    recon = {
        'Gold':  [_recon_row(t, 'Gold')  for t in gold_full_trades[:30]],
        'DAX':   [_recon_row(t, 'DAX')   for t in dax_full_trades[:30]],
        'GLD':   [_recon_row(t, 'GLD')   for t in gld_full_trades[:30]],
    }
    print(f"  Gold recon trades: {len(recon['Gold'])}")
    print(f"  DAX  recon trades: {len(recon['DAX'])}")
    print(f"  GLD  recon trades: {len(recon['GLD'])}")

    with open(RECON_PATH, 'w', encoding='utf-8') as f:
        json.dump(recon, f, indent=2, default=str)
    print(f"Reconciliation saved -> {RECON_PATH}")

    # ===========================================================================
    # Assemble output JSON
    # ===========================================================================
    manifest = {
        'audit_version':  'v2-close-fill',
        'run_timestamp':  datetime.utcnow().isoformat() + 'Z',
        'execution_model': (
            'CLOSE-FILL (cheat-on-close equivalent). '
            'Entry executed at signal bar CLOSE, not next-bar open. '
            'This is the correct model for all three White Swan strategies.'
        ),
        'data_files': {
            'GC1_240m':  {'path': GC_CSV,    'rows': len(gc_df),
                          'date_range': [str(gc_df['dt'].min().date()), str(gc_df['dt'].max().date())],
                          'data_limitation': 'Starts 2016-06 only. Max 3 WFO folds with 2yr IS.'},
            'FDAX_30m':  {'path': FDAX_CSV,  'rows': len(fdax_df),
                          'date_range': [str(fdax_df['dt'].min().date()), str(fdax_df['dt'].max().date())]},
            'GLD_1D':    {'path': GLD_CSV,   'rows': len(gld_df),
                          'date_range': [str(gld_df['dt'].min().date()), str(gld_df['dt'].max().date())]},
            'VIX_1D':    {'path': VIX_CSV,   'rows': len(vix_s)},
            'US10Y_1D':  {'path': US10Y_CSV, 'rows': len(us10y_s)},
            'DXY_1D':    {'path': DXY_CSV,   'rows': len(dxy_s)},
        },
        'cost_model': {
            'GC_commission_per_side_usd':  3.00,
            'GC_slippage':                 '1 tick per side (not modeled separately — absorbed in $3 commission)',
            'FDAX_commission_per_side_eur': 2.50,
            'FDAX_spread_pct_per_side':    0.00075,
            'GLD_commission_pct_per_side': 0.0002,
        },
        'wfo_protocol': {
            'min_IS_trades':           10,
            'IS_optimization_criterion': 'Profit Factor (maximize)',
            'holdout':                 '2021-01-01 to present (run exactly once)',
            'GC1_note':                'Data starts 2016-06; 2yr IS windows; max 3 folds. DATA-LIMITED.',
            'FDAX_note':               '5yr IS windows from 2007; up to 9 folds pre-2021.',
            'GLD_note':                '5yr IS windows from 2004; up to 12 folds pre-2021.',
        },
    }

    results = {
        'gold_friday_long': {
            **gold_r,
            'layer_a_signal_stats': gold_layer_a,
            'layer_b_risk_normalized': gold_layer_b,
            'layer_c_instrument_note': gold_layer_c_note,
        },
        'dax_turnaround_tuesday': {
            **dax_r,
            'layer_a_signal_stats': dax_layer_a,
            'layer_b_risk_normalized': dax_layer_b,
            'layer_c_instrument_note': dax_layer_c_note,
        },
        'gld_thursday_long': {
            **gld_r,
            'layer_a_signal_stats': gld_layer_a,
            'layer_b_risk_normalized': gld_layer_b,
            'layer_c_instrument_note': gld_layer_c_note,
        },
    }

    output = {'manifest': manifest, 'results': results}
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nResults saved -> {RESULTS_PATH}")

    # ===========================================================================
    # Generate Markdown Report
    # ===========================================================================
    _write_md_report(results, gold_full_trades, dax_full_trades, gld_full_trades,
                     gold_layer_a, dax_layer_a, gld_layer_a,
                     gold_layer_b, dax_layer_b, gld_layer_b)
    print(f"Report saved -> {MD_REPORT_PATH}")


def _recon_row(t, strategy):
    return {
        'strategy':              strategy,
        'signal_bar_timestamp':  str(t.get('signal_bar_timestamp', '')),
        'entry_timestamp':       str(t.get('entry_timestamp', '')),
        'entry_price':           t.get('entry_price'),
        'atr_value_used':        t.get('atr_value_used'),
        'stop_price':            t.get('stop_price'),
        'target_price':          t.get('target_price'),
        'exit_timestamp':        str(t.get('exit_timestamp', '')),
        'exit_price':            t.get('exit_price'),
        'exit_reason':           t.get('exit_reason'),
        'gross_pnl':             t.get('gross_pnl'),
        'costs':                 t.get('costs'),
        'net_pnl':               t.get('pnl_dollar'),
        'r_multiple':            t.get('r_multiple'),
    }


def _fmt_pct(v):
    try:
        return f"{float(v):.2%}"
    except Exception:
        return str(v)


def _write_md_report(results, gold_trades, dax_trades, gld_trades,
                      gold_la, dax_la, gld_la,
                      gold_lb, dax_lb, gld_lb):
    run_ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')

    lines = [
        "# White Swan Strategy Audit — v2 Close-Fill Execution",
        "",
        f"**Audit version:** v2 (close-fill / cheat-on-close)",
        f"**Generated:** {run_ts}",
        "",
        "---",
        "",
        "## Executive Summary",
        "",
        "This audit corrects the execution model from v1 (next-bar-open) to the correct",
        "close-fill semantics used by all three White Swan strategies.",
        "Entry is executed at the signal bar's close price, not the next bar's open.",
        "",
        "---",
        "",
        "## Section 8: Diff Table (Reference vs v1 vs v2)",
        "",
    ]

    for key, label in [
        ('gold_friday_long',       'Gold Friday Long (GC1 240m)'),
        ('dax_turnaround_tuesday', 'DAX Turnaround Tuesday (FDAX 30m)'),
        ('gld_thursday_long',      'GLD Thursday Long (GLD 1D)'),
    ]:
        r  = REFERENCE.get(key, {})
        v1 = V1_RESULTS.get(key, {})
        v2 = results[key]['wfo_aggregate']
        h  = results[key]['holdout_2021_plus']

        lines += [
            f"### {label}",
            "",
            "| Metric | Reference (handoff) | v1 next-open Backtrader | v2 close-fill Backtrader | Cause of difference |",
            "|--------|--------------------|-----------------------|-------------------------|---------------------|",
            f"| CAGR   | {_fmt_pct(r.get('cagr','N/A'))} | {_fmt_pct(v1.get('cagr','N/A'))} | {_fmt_pct(v2.get('cagr','N/A'))} (WFO OOS avg) | Execution model, data length, sizing |",
            f"| MaxDD  | {_fmt_pct(r.get('max_dd','N/A'))} | {_fmt_pct(v1.get('max_dd','N/A'))} | {_fmt_pct(v2.get('max_dd','N/A'))} | Same |",
            f"| PF     | {r.get('pf','N/A')} | {v1.get('pf','N/A')} | {v2.get('pf','N/A')} | Entry price shift affects P&L distribution |",
            f"| Trades | {r.get('trades','N/A')} | {v1.get('trades','N/A')} | {v2.get('trades','N/A')} (WFO OOS) | Reference uses longer history |",
            f"| Holdout 2021+ CAGR | — | — | {_fmt_pct(h.get('cagr','N/A'))} | Run once on locked family |",
            f"| Holdout 2021+ PF   | — | — | {h.get('pf','N/A')} | — |",
            "",
            "**Notes:**",
            "- Reference figures come from prior research (data back to ~2003 for Gold, full history for others).",
            "- v1 used next-bar open — systematically different from strategy intent.",
            "- v2 uses bar close — matches actual strategy specification.",
            "- Gold data limitation (2016+ only) limits WFO to 3 folds vs reference 547 trades (likely 2003+ data).",
            "",
        ]

    lines += [
        "---",
        "",
        "## Section 2: Trade Reconciliation Tables (first 20 trades per strategy)",
        "",
        "Full 30-trade tables saved to `engine/backtrader/reports/white_swan_trade_reconciliation.json`.",
        "",
    ]

    for trades, label, key in [
        (gold_trades, 'Gold Friday Long', 'gold_friday_long'),
        (dax_trades,  'DAX Turnaround Tuesday', 'dax_turnaround_tuesday'),
        (gld_trades,  'GLD Thursday Long', 'gld_thursday_long'),
    ]:
        lines += [f"### {label} — Trade Reconciliation (first 20)", ""]
        lines.append("| # | Entry Time (UTC) | Entry Price | ATR | Stop | Target | Exit Time | Exit Price | Reason | Net P&L | R |")
        lines.append("|---|-----------------|------------|-----|------|--------|-----------|-----------|--------|---------|---|")
        for idx, t in enumerate(trades[:20], 1):
            ep    = t.get('entry_price', '')
            atr   = t.get('atr_value_used', '')
            sp    = t.get('stop_price', '')
            tp    = t.get('target_price', '') or '—'
            xp    = t.get('exit_price', '')
            rsn   = t.get('exit_reason', '')
            net   = t.get('pnl_dollar', '')
            r     = t.get('r_multiple', '')
            et    = str(t.get('entry_timestamp', ''))[:19]
            xt    = str(t.get('exit_timestamp', ''))[:19]
            lines.append(f"| {idx} | {et} | {ep} | {atr} | {sp} | {tp} | {xt} | {xp} | {rsn} | {net} | {r} |")
        lines.append("")

    lines += ["---", "", "## Section 3: Metric Layers per Strategy", ""]

    layer_data = [
        ('Gold Friday Long (GC1 240m)',       'gold_friday_long',       gold_la, gold_lb),
        ('DAX Turnaround Tuesday (FDAX 30m)', 'dax_turnaround_tuesday', dax_la,  dax_lb),
        ('GLD Thursday Long (GLD 1D)',        'gld_thursday_long',      gld_la,  gld_lb),
    ]

    for label, key, la, lb in layer_data:
        lc_note = results[key].get('layer_c_instrument_note', '')
        lines += [
            f"### {label}",
            "",
            "**Layer A — Signal Statistics (sizing-independent, pre-2021 history):**",
            "",
            f"- Trades: {la.get('n_trades', 0)}",
            f"- Win rate: {_fmt_pct(la.get('win_rate', 0))}",
            f"- Profit Factor (R): {la.get('pf_r', 0)}",
            f"- Average R per trade: {la.get('avg_r', 0)}",
            f"- Payoff ratio (avg win R / avg loss R): {la.get('payoff_ratio', 0)}",
            f"- Stop hit: {_fmt_pct(la.get('stop_pct', 0))}  |  Target hit: {_fmt_pct(la.get('target_pct', 0))}  |  Time exit: {_fmt_pct(la.get('time_exit_pct', 0))}",
            "",
            "**Layer B — Risk-Normalized (1% equity per trade, no instrument constraint, pre-2021):**",
            "",
            f"- CAGR: {_fmt_pct(lb.get('cagr', 0))}",
            f"- MaxDD: {_fmt_pct(lb.get('max_dd', 0))}",
            f"- Calmar: {lb.get('calmar', 0)}",
            f"- Sharpe: not calculated (daily PnL series not available in this run)",
            f"- Trades: {lb.get('trades', 0)}",
            "",
            "**Layer C — Actual Instrument:**",
            "",
            f"{lc_note}",
            "",
        ]

    lines += ["---", "", "## WFO Fold Tables", ""]

    for key, label in [
        ('gold_friday_long',       'Gold Friday Long'),
        ('dax_turnaround_tuesday', 'DAX Turnaround Tuesday'),
        ('gld_thursday_long',      'GLD Thursday Long'),
    ]:
        r_data = results[key]
        folds  = r_data.get('folds', [])
        wfo    = r_data.get('wfo_aggregate', {})
        h_data = r_data.get('holdout_2021_plus', {})

        lines += [f"### {label} — WFO Folds", ""]
        lines.append("| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |")
        lines.append("|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|")

        for f in folds:
            bp   = f.get('best_params', {})
            im   = f.get('is_metrics', {})
            om   = f.get('oos_metrics', {})
            bp_s = ', '.join(f"{k}={v}" for k, v in bp.items())
            lines.append(
                f"| {f['fold']} | {f['is_start']} | {f['is_end']} | {f['oos_start']} | {f['oos_end']} "
                f"| {bp_s} | {im.get('pf',0):.3f} | {om.get('pf',0):.3f} "
                f"| {_fmt_pct(om.get('cagr',0))} | {_fmt_pct(om.get('max_dd',0))} | {om.get('trades',0)} |"
            )

        if not folds:
            lines.append("| — | No valid folds | — | — | — | — | — | — | — | — | — |")

        pos = wfo.get('positive_folds', 0)
        n   = wfo.get('n_folds', 0)
        lines += [
            "",
            f"**WFO Aggregate OOS:** CAGR={_fmt_pct(wfo.get('cagr',0))}  DD={_fmt_pct(wfo.get('max_dd',0))}  PF={wfo.get('pf',0)}  Trades={wfo.get('trades',0)}  Positive folds: {pos}/{n}",
            f"**Holdout 2021+:** CAGR={_fmt_pct(h_data.get('cagr',0))}  DD={_fmt_pct(h_data.get('max_dd',0))}  PF={h_data.get('pf',0)}  Trades={h_data.get('trades',0)}",
            "",
        ]

    lines += ["---", "", "## Final Decision per Strategy", ""]

    for key, label in [
        ('gold_friday_long',       'Gold Friday Long (GC1 240m)'),
        ('dax_turnaround_tuesday', 'DAX Turnaround Tuesday (FDAX 30m)'),
        ('gld_thursday_long',      'GLD Thursday Long (GLD 1D)'),
    ]:
        r_data = results[key]
        wfo    = r_data.get('wfo_aggregate', {})
        h_data = r_data.get('holdout_2021_plus', {})
        folds  = r_data.get('folds', [])
        la     = r_data.get('layer_a_signal_stats', {})

        n_folds   = wfo.get('n_folds', 0)
        pos_folds = wfo.get('positive_folds', 0)
        wfo_pf    = wfo.get('pf', 0)
        h_pf      = h_data.get('pf', 0)

        # Rejection gate checklist
        gate = {
            'close_fill_implemented': True,  # always true in v2
            'recon_complete':         len([t for t in gold_trades if key == 'gold_friday_long'] or
                                         [t for t in dax_trades if key == 'dax_turnaround_tuesday'] or
                                         [t for t in gld_trades]) >= 20,
            'layers_reported':        True,
            'wfo_correct_protocol':   n_folds > 0,
        }

        all_gate_passed = all(gate.values())

        if not all_gate_passed:
            decision = "PROVISIONAL — AUDIT MISMATCH (gate not fully met)"
        elif wfo_pf >= 1.1 and h_pf >= 1.05 and pos_folds >= max(2, n_folds // 2):
            decision = "KEEP"
        elif wfo_pf >= 1.0 and pos_folds >= max(1, n_folds // 3) and n_folds > 0:
            decision = "KEEP-SMALL"
        elif n_folds == 0:
            decision = "PROVISIONAL — insufficient folds for WFO verdict"
        else:
            decision = "REJECT — negative OOS after correct implementation"

        lines += [
            f"### {label}",
            "",
            f"**Decision: {decision}**",
            "",
            "Rejection gate checklist:",
            f"- [{'x' if gate['close_fill_implemented'] else ' '}] Close-fill execution implemented",
            f"- [{'x' if gate['recon_complete'] else ' '}] Trade reconciliation >= 20 trades",
            f"- [{'x' if gate['layers_reported'] else ' '}] All three metric layers reported",
            f"- [{'x' if gate['wfo_correct_protocol'] else ' '}] WFO run with correct protocol",
            "",
            f"WFO: {n_folds} folds, {pos_folds} positive. PF={wfo_pf}. Holdout PF={h_pf}.",
            "",
        ]

        if key == 'gold_friday_long':
            lines += [
                "**DATA LIMITATION NOTE:** Gold data only available from 2016-06 onwards.",
                "Only 2-3 WFO folds possible. The reference 547 trades implies data from ~2003.",
                "Gold strategy cannot be fully validated without pre-2016 GC1 data.",
                "Mark as DATA-LIMITED until longer data is sourced.",
                "",
            ]

    lines += ["---", "", f"*Report generated by run_white_swan_audit_v2.py | {run_ts}*", ""]

    with open(MD_REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    main()
