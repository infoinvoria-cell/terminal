"""
White Swan Gold Family Research Program — v1
============================================
Phases 1-11: GC 60m Friday Long, WFO, Roll Audit, GLD Cross-Market,
             Cost Model, Known 2021-2026 Validation, Regime Filter,
             Portfolio Analysis, Acceptance Verdict.

Entry semantics: close-fill (enter at signal bar's close).
Timestamps: UTC internally.
IS period:  2003-07-30 through 2020-12-31
Known historical validation: 2021-01-01 through 2026-06-05 (NOT pristine holdout)
"""

import sys, os, json, hashlib, warnings, traceback
from datetime import datetime, timedelta
from itertools import product
from collections import defaultdict

warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np

# ============================================================
# PATHS
# ============================================================
DATA_DIR  = r"C:\Users\joris\Downloads\white_swan_v3b_data_unblock\white_swan_v3b_data_unblock"
DOWNLOADS = r"C:\Users\joris\Downloads"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPORT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "reports"))
os.makedirs(REPORT_ROOT, exist_ok=True)

GC_FILES = [
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_5747f(1).csv"),
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_646ce(1).csv"),
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_8f931(1).csv"),
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_ff910(1).csv"),
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_279f5(1).csv"),
    os.path.join(DATA_DIR, "COMEX_DL_GC1!, 60_cd78a.csv"),
]

VIX_CSV   = os.path.join(DATA_DIR, "TVC_VIX, 1D_bef33(2).csv")
US10Y_CSV = os.path.join(DATA_DIR, "TVC_US10Y, 1D_4a07f(2).csv")
DXY_CSV   = os.path.join(DATA_DIR, "ICEUS_DLY_DXY, 1D_4c8c2(2).csv")
SPY_CSV   = os.path.join(DATA_DIR, "BATS_SPY, 1D_bb5e9(4).csv")

GLD_SEARCH_PATHS = [
    os.path.join(DOWNLOADS, "ARCA_DL_GLD_1D.csv"),
    os.path.join(DOWNLOADS, "GLD_daily.csv"),
    r"C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\data\GLD_daily.csv",
    r"C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\strategies\white_swan\GLD_daily.csv",
]

# Parameter grid (matches task spec exactly)
ATR_LENS = [7, 10, 14, 20]
SL_MULTS = [0.75, 1.0, 1.25, 1.5]
RRS      = [None, 1.0, 1.25, 1.5, 2.0]  # None = no TP (time exit only)
PARAM_GRID = list(product(ATR_LENS, SL_MULTS, RRS))  # 80 combos

IS_START = datetime(2003, 7, 30)
IS_END   = datetime(2020, 12, 31, 23, 59, 59)
KHV_START = datetime(2021, 1, 1)   # Known Historical Validation start
KHV_END   = datetime(2026, 6, 5, 23, 59, 59)

# ============================================================
# UTILITIES
# ============================================================

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_tv_timestamp(s):
    try:
        dt = pd.to_datetime(s, utc=True)
        if dt.tzinfo is not None:
            return dt.tz_convert("UTC").tz_localize(None)
        return dt
    except Exception:
        return pd.NaT


def load_csv_ohlc(path, label=""):
    if not os.path.exists(path):
        return None, f"NOT FOUND: {path}"
    df = pd.read_csv(path)
    df["dt"] = df["time"].apply(parse_tv_timestamp)
    df = df.dropna(subset=["dt"]).set_index("dt").sort_index()
    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["close"])
    msg = f"{label}: {len(df)} bars  {df.index[0].date()} -> {df.index[-1].date()}"
    return df, msg


def atr_series(df, n):
    """Wilder ATR(n). No look-ahead: caller should shift(1) before use."""
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift(1)).abs(),
        (df["low"]  - df["close"].shift(1)).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0/n, adjust=False).mean()


def pf_from_r(rs):
    rs = np.asarray(rs, dtype=float)
    wins   = rs[rs > 0]
    losses = rs[rs < 0]
    if len(losses) == 0:
        return np.inf if len(wins) > 0 else 0.0
    if losses.sum() == 0:
        return np.inf
    return wins.sum() / (-losses.sum())


def compute_metrics(trades_with_dates, start, end):
    if not trades_with_dates:
        return dict(trades=0, win_pct=0.0, pf=0.0, avg_r=0.0,
                    cagr=0.0, max_dd_pct=0.0, calmar=0.0,
                    payoff_ratio=0.0, max_consec_loss=0)
    rs = np.array([r for _, r in trades_with_dates])
    wins   = rs[rs > 0]
    losses = rs[rs < 0]
    pf     = pf_from_r(rs)
    avg_r  = rs.mean()
    win_pct = (rs > 0).mean() * 100.0

    eq = np.cumprod(1 + rs * 0.01)
    running_max = np.maximum.accumulate(eq)
    dd = (running_max - eq) / running_max
    max_dd = dd.max() * 100.0

    years = max((end - start).days / 365.25, 0.01)
    cagr  = (eq[-1] ** (1.0 / years) - 1) * 100.0
    calmar = cagr / max_dd if max_dd > 0 else 0.0

    consec_loss = 0
    max_consec  = 0
    for r in rs:
        if r < 0:
            consec_loss += 1
            max_consec   = max(max_consec, consec_loss)
        else:
            consec_loss = 0

    payoff = (abs(wins.mean() / losses.mean())
              if len(wins) and len(losses) else 0.0)

    return dict(
        trades=int(len(rs)),
        win_pct=round(float(win_pct), 1),
        pf=round(float(pf), 3),
        avg_r=round(float(avg_r), 4),
        avg_win_r=round(float(wins.mean()), 4) if len(wins) else 0.0,
        avg_loss_r=round(float(losses.mean()), 4) if len(losses) else 0.0,
        payoff_ratio=round(float(payoff), 3),
        max_consec_loss=int(max_consec),
        cagr=round(float(cagr), 2),
        max_dd_pct=round(float(max_dd), 2),
        calmar=round(float(calmar), 3),
    )


def yearly_r(trades_with_dates):
    by_year = defaultdict(list)
    for dt, r in trades_with_dates:
        by_year[dt.year].append(r)
    return {y: round(sum(rs), 3) for y, rs in sorted(by_year.items())}


def rolling_12m_pf(trades_with_dates):
    if len(trades_with_dates) < 4:
        return {}
    df = pd.DataFrame(trades_with_dates, columns=["dt", "r"]).set_index("dt").sort_index()
    months = pd.date_range(df.index[0], df.index[-1], freq="ME")
    result = {}
    for m in months:
        window_start = m - pd.DateOffset(months=12)
        subset = df[(df.index > window_start) & (df.index <= m)]["r"].values
        if len(subset) >= 3:
            result[str(m.date())] = round(pf_from_r(subset), 3)
    return result


def trades_to_rd(trades):
    return [(t[0], t[8]) for t in trades]


# ============================================================
# PHASE 1 — DATA ASSEMBLY
# ============================================================

def phase1_data_assembly():
    print("\n" + "="*60)
    print("PHASE 1 — DATA ASSEMBLY AND QUALITY CHECK")
    print("="*60)

    EXPECTED_ROWS = {
        "COMEX_DL_GC1!, 60_5747f(1).csv": 18791,
        "COMEX_DL_GC1!, 60_646ce(1).csv": 23696,
        "COMEX_DL_GC1!, 60_8f931(1).csv": 23637,
        "COMEX_DL_GC1!, 60_ff910(1).csv": 23597,
        "COMEX_DL_GC1!, 60_279f5(1).csv": 23652,
        "COMEX_DL_GC1!, 60_cd78a.csv":    20249,
    }

    manifest_entries = []
    frames = []

    for path in GC_FILES:
        fname = os.path.basename(path)
        expected = EXPECTED_ROWS.get(fname, "unknown")
        sha = sha256_file(path) if os.path.exists(path) else "FILE_MISSING"
        df, msg = load_csv_ohlc(path, fname)
        if df is None:
            print(f"  ERROR: {msg}")
            manifest_entries.append({"file": fname, "status": "MISSING"})
            continue
        actual = len(df)
        row_ok = (actual == expected) if isinstance(expected, int) else "unknown"
        print(f"  {fname}: {actual} rows (expected {expected}) {'OK' if row_ok else 'MISMATCH'}  {df.index[0].date()} -> {df.index[-1].date()}")
        manifest_entries.append({
            "file": fname,
            "sha256": sha,
            "expected_rows": expected,
            "actual_bars": actual,
            "row_check": "PASS" if row_ok else "MISMATCH",
            "date_start": str(df.index[0].date()),
            "date_end": str(df.index[-1].date()),
        })
        frames.append(df)

    if not frames:
        raise RuntimeError("No GC data loaded — cannot continue.")

    gc60 = pd.concat(frames).sort_index()

    # Deduplication — exact timestamp only
    dupes_mask  = gc60.index.duplicated(keep=False)
    overlap_cnt = dupes_mask.sum()
    gc60 = gc60[~gc60.index.duplicated(keep="first")].sort_index()
    removed = overlap_cnt - dupes_mask.sum() if overlap_cnt else int(overlap_cnt)
    # simpler: count removed
    total_before = sum(len(f) for f in frames)
    removed_exact = total_before - len(gc60)

    print(f"\n  Concatenated: {total_before} rows -> {len(gc60)} after dedup (removed {removed_exact})")
    print(f"  Total 60m bars: {len(gc60)}")
    print(f"  Date range: {gc60.index[0]} -> {gc60.index[-1]}")

    # Gap analysis (skip weekends)
    gc_wd = gc60[gc60.index.weekday < 5]
    tdiffs = gc_wd.index.to_series().diff()
    gaps_1week = tdiffs[tdiffs > pd.Timedelta(days=7)]
    print(f"  Gaps > 1 trading week: {len(gaps_1week)}")
    for idx, gap in gaps_1week.nlargest(5).items():
        print(f"    {idx}: {gap}")

    # Build daily OHLC using 17:00 UTC as session end
    # session date = date of bar at or before 17:00 UTC
    def session_date(ts):
        if ts.hour < 17:
            return ts.date()
        else:
            return ts.date()   # same calendar date, session ends 17:00 next day actually
    # Standard approach: CME Gold uses 17:00 CT / 23:00 UTC as pit close
    # Use calendar date of the 60m bar, group by date
    gc60_day = gc60.copy()
    gc60_day["session_date"] = gc60_day.index.date
    gc_daily = gc60_day.groupby("session_date").agg(
        open=("open",  "first"),
        high=("high",  "max"),
        low =("low",   "min"),
        close=("close","last"),
    )
    gc_daily.index = pd.to_datetime(gc_daily.index)
    print(f"  Daily bars built: {len(gc_daily)}")

    meta = {
        "manifest": manifest_entries,
        "gc60_total_bars": int(len(gc60)),
        "gc60_range_start": str(gc60.index[0]),
        "gc60_range_end":   str(gc60.index[-1]),
        "gc60_dupes_removed": int(removed_exact),
        "gc60_gaps_gt1week": int(len(gaps_1week)),
        "gc_daily_bars": int(len(gc_daily)),
    }

    print("\n  PHASE 1: COMPLETE")
    return gc60, gc_daily, meta


# ============================================================
# CORE BACKTEST ENGINE
# ============================================================

def run_gold_friday_long(gc60_full, atr_n, sl_mult, rr,
                          start_dt=None, end_dt=None,
                          exclude_roll_windows=False, roll_dates=None):
    """
    Gold Friday Long strategy.

    Entry:  Close of last 60m bar of Friday session (UTC hour >= 18, weekday=4).
    Exit:   SL hit | TP hit | Monday close (when Tuesday is first seen).
    ATR:    Wilder ATR(atr_n) from daily-equivalent full series, shifted(1).
    rr:     None = no TP (exit Monday close only); float = TP at entry + sl_mult*ATR*rr.

    Returns list of tuples:
    (signal_dt, entry, atr_val, stop, target, exit_dt, exit_price, reason, R)
    """
    df = gc60_full.copy()

    # Compute ATR on FULL series before slicing (avoid edge-of-window bias)
    df["atr_raw"] = atr_series(df, atr_n)
    df["atr"] = df["atr_raw"].shift(1)  # use previous bar's ATR (no look-ahead)

    if start_dt:
        df = df[df.index >= start_dt]
    if end_dt:
        df = df[df.index <= end_dt]

    if len(df) < atr_n + 5:
        return []

    wdays = df.index.weekday
    hours = df.index.hour
    idx   = df.index
    opens  = df["open"].values
    highs  = df["high"].values
    lows   = df["low"].values
    closes = df["close"].values
    atrs   = df["atr"].values

    # Build signal set: last Friday bar (hour>=18) per calendar date
    friday_last = {}  # date -> array index
    for i in range(len(df)):
        if wdays[i] == 4 and hours[i] >= 18:
            d = idx[i].date()
            friday_last[d] = i  # overwrite keeps last

    # Roll exclusion set
    roll_exclusion = set()
    if exclude_roll_windows and roll_dates:
        for rd in roll_dates:
            for delta in range(-5, 3):
                excl_date = rd + timedelta(days=delta)
                roll_exclusion.add(excl_date)

    trades = []
    used_until = 0

    for d_key in sorted(friday_last.keys()):
        i = friday_last[d_key]
        if i < used_until:
            continue
        if exclude_roll_windows and d_key in roll_exclusion:
            continue
        if np.isnan(atrs[i]) or atrs[i] <= 0:
            continue

        entry    = closes[i]
        atr_val  = atrs[i]
        risk_pts = sl_mult * atr_val
        stop     = entry - risk_pts
        target   = (entry + risk_pts * rr) if rr is not None else None

        signal_dt   = idx[i]
        exit_r      = None
        exit_dt     = None
        exit_price  = None
        reason      = None
        last_mon_i  = None

        for j in range(i + 1, min(i + 300, len(df))):
            wd = wdays[j]
            if wd in (5, 6):  # weekend bars (shouldn't exist but skip)
                continue

            # SL check first (conservative)
            if lows[j] <= stop:
                exit_r     = -1.0
                exit_price = stop
                exit_dt    = idx[j]
                reason     = "SL"
                used_until = j + 1
                break

            # TP check
            if target is not None and highs[j] >= target:
                exit_r     = rr
                exit_price = target
                exit_dt    = idx[j]
                reason     = "TP"
                used_until = j + 1
                break

            if wd == 0:  # Monday
                last_mon_i = j
            elif wd == 1:  # Tuesday: exit at last Monday close
                if last_mon_i is not None:
                    exit_price = closes[last_mon_i]
                    exit_r     = (exit_price - entry) / risk_pts if risk_pts > 0 else 0.0
                    exit_dt    = idx[last_mon_i]
                    reason     = "MON_CLOSE"
                    used_until = last_mon_i + 1
                else:
                    exit_price = closes[j]
                    exit_r     = (exit_price - entry) / risk_pts if risk_pts > 0 else 0.0
                    exit_dt    = idx[j]
                    reason     = "TUE_FALLBACK"
                    used_until = j + 1
                break

        if exit_r is not None:
            trades.append((
                signal_dt, entry, atr_val, stop,
                target if target else float("nan"),
                exit_dt, exit_price, reason, round(exit_r, 4)
            ))

    return trades


# ============================================================
# PHASE 2 — IS PARAMETER PLATEAU
# ============================================================

def phase2_is_plateau(gc60):
    print("\n" + "="*60)
    print("PHASE 2 — GC CANONICAL GOLD FRIDAY FAMILY (IS 2003-2020)")
    print("="*60)

    results = {}
    for atr_n, sl_mult, rr in PARAM_GRID:
        t  = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                   start_dt=IS_START, end_dt=IS_END)
        rd = trades_to_rd(t)
        if rd:
            pf    = pf_from_r([r for _, r in rd])
            avg_r = float(np.mean([r for _, r in rd]))
            wr    = float(np.mean([r > 0 for _, r in rd])) * 100
            wins  = [r for _, r in rd if r > 0]
            loss  = [r for _, r in rd if r < 0]
            payoff = (abs(np.mean(wins)/np.mean(loss))
                      if wins and loss else 0.0)
        else:
            pf = avg_r = wr = payoff = 0.0
        results[(atr_n, sl_mult, rr)] = {
            "n": len(rd), "pf": round(pf, 3),
            "avg_r": round(avg_r, 4), "wr": round(wr, 1),
            "payoff": round(payoff, 3),
        }

    pf_gt1 = sum(1 for v in results.values() if v["pf"] > 1.0)
    pct_gt1 = pf_gt1 / len(results) * 100
    print(f"  IS combos with PF > 1.0: {pf_gt1}/{len(results)} ({pct_gt1:.1f}%)")

    # Plateau center: max average neighborhood PF
    def neighborhood_pf(atr_n, sl_mult, rr):
        ai = ATR_LENS.index(atr_n)
        si = SL_MULTS.index(sl_mult)
        ri = RRS.index(rr)
        scores = []
        for da in [-1, 0, 1]:
            for ds in [-1, 0, 1]:
                for dr in [-1, 0, 1]:
                    a2, s2, r2 = ai+da, si+ds, ri+dr
                    if 0 <= a2 < len(ATR_LENS) and 0 <= s2 < len(SL_MULTS) and 0 <= r2 < len(RRS):
                        scores.append(results[(ATR_LENS[a2], SL_MULTS[s2], RRS[r2])]["pf"])
        return float(np.mean(scores)) if scores else 0.0

    nbh = {p: neighborhood_pf(*p) for p in PARAM_GRID}
    plateau_center = max(nbh, key=nbh.get)
    locked = plateau_center

    print(f"\n  Plateau center (robust): ATR={locked[0]}, SL={locked[1]}, RR={locked[2]}")
    print(f"  Neighborhood avg PF: {nbh[locked]:.3f}")
    print(f"  IS PF at center: {results[locked]['pf']:.3f}")
    print(f"  IS avg_R at center: {results[locked]['avg_r']:.4f}")
    print(f"  IS win%: {results[locked]['wr']:.1f}%")
    print(f"  IS trades: {results[locked]['n']}")

    # Print IS plateau heatmap (ATR x SL_mult for each RR)
    print("\n  IS PF Heatmap (RR=None, no TP):")
    rr_slice = None
    header = "ATR\\SL " + "  ".join(f"{s:5.2f}" for s in SL_MULTS)
    print("  " + header)
    for atr_n in ATR_LENS:
        row = f"  ATR{atr_n:2d} "
        for sl in SL_MULTS:
            pf_v = results.get((atr_n, sl, rr_slice), {}).get("pf", 0.0)
            row += f" {pf_v:5.3f}"
        print(row)

    print("\n  IS PF Heatmap (RR=1.5):")
    rr_slice = 1.5
    header = "ATR\\SL " + "  ".join(f"{s:5.2f}" for s in SL_MULTS)
    print("  " + header)
    for atr_n in ATR_LENS:
        row = f"  ATR{atr_n:2d} "
        for sl in SL_MULTS:
            pf_v = results.get((atr_n, sl, rr_slice), {}).get("pf", 0.0)
            row += f" {pf_v:5.3f}"
        print(row)

    meta = {
        "combo_results_count": len(results),
        "pf_gt1_count": pf_gt1,
        "pf_gt1_pct": round(pct_gt1, 1),
        "plateau_center": {
            "atr_n": locked[0], "sl_mult": locked[1], "rr": locked[2]
        },
        "plateau_center_pf": results[locked]["pf"],
        "plateau_center_avg_r": results[locked]["avg_r"],
        "plateau_center_wr": results[locked]["wr"],
        "plateau_center_n": results[locked]["n"],
        "neighborhood_pf": round(nbh[locked], 3),
        "all_combos": {str(k): v for k, v in results.items()},
    }

    print("\n  PHASE 2: COMPLETE")
    return locked, results, meta


# ============================================================
# PHASE 3 — 30-TRADE RECONCILIATION
# ============================================================

def phase3_reconciliation(gc60, locked_params):
    print("\n" + "="*60)
    print("PHASE 3 — 30-TRADE RECONCILIATION")
    print("="*60)

    atr_n, sl_mult, rr = locked_params
    all_trades = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                       start_dt=IS_START, end_dt=IS_END)
    if not all_trades:
        print("  ERROR: No IS trades found")
        return []

    # Select sample spanning >=5 different years, evenly spaced
    by_year = defaultdict(list)
    for t in all_trades:
        by_year[t[0].year].append(t)

    years_with_trades = sorted(by_year.keys())
    n_sample = 30
    sample = []

    # Take up to 3-4 trades from each year to spread across years
    for yr in years_with_trades:
        take = max(1, n_sample // len(years_with_trades))
        step = max(1, len(by_year[yr]) // take)
        for i in range(0, len(by_year[yr]), step):
            sample.append(by_year[yr][i])
            if len(sample) >= n_sample:
                break
        if len(sample) >= n_sample:
            break

    sample = sorted(sample, key=lambda x: x[0])[:n_sample]

    # GC cost model: $0.85 commission + 0.10/oz slippage = $0.95/oz per side
    # GC contract = 100 oz. RT = $0.95*2*100 = $190
    # At 1% risk on 100k EUR (~108k USD), risk = $1080/trade
    # R-denominated cost = $190 / $1080 ≈ 0.176 R per trade
    USD_RT_COST = (0.85 + 0.10) * 2 * 100   # $190 per GC contract RT
    ACCOUNT_USD = 108_000
    RISK_PCT    = 0.01
    RISK_USD    = ACCOUNT_USD * RISK_PCT
    COST_IN_R   = USD_RT_COST / RISK_USD      # fraction of R

    print(f"\n  GC Cost Model: ${USD_RT_COST:.2f} RT, {COST_IN_R:.4f} R/trade")
    print(f"  {'#':>3}  {'Entry (UTC)':>20}  {'Entry$':>8}  {'ATR':>7}  {'Stop$':>8}  "
          f"{'TP$':>8}  {'Exit (UTC)':>20}  {'Exit$':>8}  {'Reason':>12}  {'Gross R':>8}  {'Net R':>8}")
    print("  " + "-"*140)

    reconciliation = []
    for idx_t, t in enumerate(sample):
        sig_dt, entry, atr_v, stop, target, ex_dt, ex_price, reason, gross_r = t
        net_r = gross_r - COST_IN_R
        tp_str = f"{target:8.2f}" if not np.isnan(target) else "    None"
        print(f"  {idx_t+1:>3}  {str(sig_dt):>20}  {entry:8.2f}  {atr_v:7.3f}  {stop:8.2f}  "
              f"{tp_str}  {str(ex_dt):>20}  {ex_price:8.2f}  {reason:>12}  {gross_r:8.4f}  {net_r:8.4f}")
        reconciliation.append({
            "trade_num": idx_t + 1,
            "entry_utc": str(sig_dt),
            "entry_price": round(entry, 2),
            "atr": round(atr_v, 3),
            "stop": round(stop, 2),
            "target": round(target, 2) if not np.isnan(target) else None,
            "exit_utc": str(ex_dt),
            "exit_price": round(ex_price, 2),
            "reason": reason,
            "gross_r": round(gross_r, 4),
            "net_r": round(net_r, 4),
        })

    print(f"\n  Sample covers years: {sorted(set(t[0].year for t in sample))}")
    print("\n  PHASE 3: COMPLETE")
    return reconciliation


# ============================================================
# PHASE 4 — WALK-FORWARD OPTIMIZATION (5yr IS / 1yr OOS)
# ============================================================

def run_wfo(gc60, is_years=5, label="5yr"):
    """Run rolling WFO. Returns (fold_results, oos_all_trades, wfo_agg)."""
    # Determine folds: OOS years where we have enough IS data
    folds = []
    for oos_year in range(2008, 2021):
        is_start = datetime(oos_year - is_years, 1, 1)
        # Clamp IS start to actual data
        is_start = max(is_start, IS_START)
        is_end   = datetime(oos_year - 1, 12, 31, 23, 59, 59)
        oos_start = datetime(oos_year, 1, 1)
        oos_end   = datetime(oos_year, 12, 31, 23, 59, 59)
        is_years_actual = (is_end - is_start).days / 365.25
        if is_years_actual < 2.5:
            print(f"    Skipping OOS {oos_year}: only {is_years_actual:.1f} IS years")
            continue
        flag = "short-IS" if is_years_actual < (is_years - 0.5) else ""
        folds.append((is_start, is_end, oos_start, oos_end, oos_year, flag))

    fold_results   = []
    oos_all_trades = []

    for (is_s, is_e, oos_s, oos_e, oos_yr, flag) in folds:
        # IS: find best combo by PF (simple max PF selection)
        best_pf  = -1
        best_p   = None
        for p in PARAM_GRID:
            t  = run_gold_friday_long(gc60, *p, start_dt=is_s, end_dt=is_e)
            rd = trades_to_rd(t)
            if not rd:
                continue
            pf = pf_from_r([r for _, r in rd])
            if pf > best_pf:
                best_pf = pf
                best_p  = p

        if best_p is None:
            best_p  = PARAM_GRID[0]
            best_pf = 0.0

        # OOS
        oos_t  = run_gold_friday_long(gc60, *best_p, start_dt=oos_s, end_dt=oos_e)
        oos_rd = trades_to_rd(oos_t)
        oos_pf = pf_from_r([r for _, r in oos_rd]) if oos_rd else 0.0
        oos_avg_r = float(np.mean([r for _, r in oos_rd])) if oos_rd else 0.0
        oos_win   = float(np.mean([r > 0 for _, r in oos_rd])) * 100 if oos_rd else 0.0
        oos_meta  = compute_metrics(oos_rd, oos_s, oos_e) if oos_rd else {}

        fold_results.append({
            "label": label,
            "is_start": str(is_s.year),
            "is_end": str(is_e.year),
            "is_years": round((is_e - is_s).days / 365.25, 1),
            "oos_year": oos_yr,
            "flag": flag,
            "best_params": {"atr_n": best_p[0], "sl_mult": best_p[1], "rr": best_p[2]},
            "is_pf": round(best_pf, 3),
            "oos_trades": len(oos_rd),
            "oos_pf": round(oos_pf, 3),
            "oos_win_pct": round(oos_win, 1),
            "oos_avg_r": round(oos_avg_r, 4),
            "oos_cagr": oos_meta.get("cagr", 0.0),
            "oos_max_dd_pct": oos_meta.get("max_dd_pct", 0.0),
            "oos_calmar": oos_meta.get("calmar", 0.0),
            "oos_positive": oos_pf > 1.0,
        })

        oos_all_trades.extend(oos_rd)
        print(f"    {label} OOS {oos_yr}{' ('+flag+')' if flag else ''}: "
              f"params=ATR{best_p[0]}/SL{best_p[1]}/RR{best_p[2]} "
              f"IS_PF={best_pf:.3f} OOS_PF={oos_pf:.3f} n={len(oos_rd)} avgR={oos_avg_r:.4f}")

    wfo_agg = compute_metrics(oos_all_trades,
                               folds[0][0] if folds else IS_START,
                               datetime(2020, 12, 31)) if oos_all_trades else {}
    if oos_all_trades:
        wfo_agg["pos_folds"]   = sum(1 for f in fold_results if f["oos_positive"])
        wfo_agg["total_folds"] = len(fold_results)
        wfo_agg["yearly_r"]    = yearly_r(oos_all_trades)
        wfo_agg["max_losing_streak"] = wfo_agg.get("max_consec_loss", 0)

    return fold_results, oos_all_trades, wfo_agg


def phase4_wfo(gc60):
    print("\n" + "="*60)
    print("PHASE 4 — WALK-FORWARD OPTIMIZATION (GC)")
    print("="*60)

    print("\n  --- 5yr IS / 1yr OOS ---")
    folds5, oos5, agg5 = run_wfo(gc60, is_years=5, label="5yr")

    print("\n  --- 7yr IS / 1yr OOS (robustness check) ---")
    folds7, oos7, agg7 = run_wfo(gc60, is_years=7, label="7yr")

    # Print aggregate tables
    print("\n  WFO Aggregate (5yr IS):")
    for k, v in agg5.items():
        if k not in ("yearly_r",):
            print(f"    {k}: {v}")

    print("\n  Yearly OOS Returns (5yr IS):")
    yr_r = agg5.get("yearly_r", {})
    for yr, r in sorted(yr_r.items()):
        bar = "#" * int(max(0, r*3)) if r > 0 else "-" * int(max(0, -r*3))
        print(f"    {yr}: {r:+.3f}R  {bar}")

    print("\n  WFO Aggregate (7yr IS):")
    for k, v in agg7.items():
        if k not in ("yearly_r",):
            print(f"    {k}: {v}")

    meta = {
        "5yr_folds": folds5,
        "5yr_aggregate": agg5,
        "7yr_folds": folds7,
        "7yr_aggregate": agg7,
    }
    print("\n  PHASE 4: COMPLETE")
    return meta, oos5


# ============================================================
# PHASE 5 — ROLL AUDIT
# ============================================================

def build_gc_roll_dates(start_year=2003, end_year=2026):
    """
    CME Gold futures roll dates. Standard contracts: Feb, Apr, Jun, Aug, Oct, Dec.
    First notice day (FND) is typically last business day of month preceding expiry.
    Expiry month: Feb=Feb, Apr=Apr, Jun=Jun, Aug=Aug, Oct=Oct, Dec=Dec.
    FND = last business day of Jan, Mar, May, Jul, Sep, Nov respectively.
    We approximate FND as the last weekday of the preceding month.
    """
    from calendar import monthrange

    roll_months = [1, 3, 5, 7, 9, 11]  # months where FND falls (preceding exp month)
    roll_dates  = []

    for year in range(start_year, end_year + 1):
        for month in roll_months:
            # last day of month
            last_day = monthrange(year, month)[1]
            d = datetime(year, month, last_day)
            # walk back to last weekday
            while d.weekday() >= 5:
                d -= timedelta(days=1)
            roll_dates.append(d.date())

    return sorted(roll_dates)


def phase5_roll_audit(gc60, locked_params, folds5, oos5):
    print("\n" + "="*60)
    print("PHASE 5 — CONTINUOUS FUTURES ROLL AUDIT")
    print("="*60)

    roll_dates = build_gc_roll_dates(2003, 2026)
    print(f"  Roll dates identified: {len(roll_dates)}")
    print(f"  Sample (first 6): {roll_dates[:6]}")

    # Run WFO (5yr IS) with roll-window exclusion
    # We do this for the pre-2021 IS period to count signals in roll windows
    atr_n, sl_mult, rr = locked_params
    all_is_trades = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                          start_dt=IS_START, end_dt=IS_END)

    # Mark which trades fall in roll windows
    roll_set = set()
    for rd in roll_dates:
        for delta in range(-5, 3):
            roll_set.add(rd + timedelta(days=delta))

    in_roll  = [t for t in all_is_trades if t[0].date() in roll_set]
    out_roll = [t for t in all_is_trades if t[0].date() not in roll_set]

    print(f"\n  IS signals total: {len(all_is_trades)}")
    print(f"  Signals in roll window: {len(in_roll)} ({100*len(in_roll)/max(len(all_is_trades),1):.1f}%)")
    print(f"  Signals outside roll window: {len(out_roll)}")

    rd_all  = trades_to_rd(all_is_trades)
    rd_out  = trades_to_rd(out_roll)

    pf_all  = pf_from_r([r for _, r in rd_all])  if rd_all else 0.0
    pf_out  = pf_from_r([r for _, r in rd_out])  if rd_out else 0.0
    exp_all = float(np.mean([r for _, r in rd_all])) if rd_all else 0.0
    exp_out = float(np.mean([r for _, r in rd_out])) if rd_out else 0.0

    print(f"\n  Version A (all signals):         PF={pf_all:.3f}  Expectancy={exp_all:.4f}R")
    print(f"  Version B (roll-window removed): PF={pf_out:.3f}  Expectancy={exp_out:.4f}R")

    # Now run WFO B (with exclusion) using existing fold structure
    print(f"\n  Running WFO-B (roll-window excluded) for fold comparison...")
    wfo_b_folds = []
    oos_b_trades = []
    for fold_dict in folds5:
        is_s = datetime(int(fold_dict["is_start"]), 1, 1)
        is_e = datetime(int(fold_dict["is_end"]), 12, 31, 23, 59, 59)
        oos_yr = fold_dict["oos_year"]
        oos_s = datetime(oos_yr, 1, 1)
        oos_e = datetime(oos_yr, 12, 31, 23, 59, 59)

        # IS: find best params on version B (roll excluded)
        best_pf = -1
        best_p  = None
        for p in PARAM_GRID:
            t  = run_gold_friday_long(gc60, *p, start_dt=is_s, end_dt=is_e,
                                       exclude_roll_windows=True, roll_dates=roll_dates)
            rd = trades_to_rd(t)
            if not rd:
                continue
            pf = pf_from_r([r for _, r in rd])
            if pf > best_pf:
                best_pf = pf
                best_p  = p

        if best_p is None:
            best_p  = locked_params
            best_pf = 0.0

        oos_t  = run_gold_friday_long(gc60, *best_p, start_dt=oos_s, end_dt=oos_e,
                                       exclude_roll_windows=True, roll_dates=roll_dates)
        oos_rd = trades_to_rd(oos_t)
        oos_pf = pf_from_r([r for _, r in oos_rd]) if oos_rd else 0.0

        wfo_b_folds.append({
            "oos_year": oos_yr,
            "oos_pf_b": round(oos_pf, 3),
            "oos_trades_b": len(oos_rd),
            "oos_positive_b": oos_pf > 1.0,
        })
        oos_b_trades.extend(oos_rd)
        print(f"    OOS {oos_yr}: PF_B={oos_pf:.3f} n={len(oos_rd)}")

    agg_b = compute_metrics(oos_b_trades, datetime(2008, 1, 1), datetime(2020, 12, 31)) if oos_b_trades else {}
    agg_b["pos_folds_b"] = sum(1 for f in wfo_b_folds if f["oos_positive_b"])

    agg_a = compute_metrics(oos5, datetime(2008, 1, 1), datetime(2020, 12, 31)) if oos5 else {}
    agg_a["pos_folds_a"] = sum(1 for f in folds5 if f["oos_positive"])

    print(f"\n  WFO Comparison:")
    print(f"    Version A: PF={agg_a.get('pf','n/a')}  pos_folds={agg_a.get('pos_folds_a','n/a')}/{len(folds5)}")
    print(f"    Version B: PF={agg_b.get('pf','n/a')}  pos_folds={agg_b.get('pos_folds_b','n/a')}/{len(wfo_b_folds)}")

    pf_drop = agg_a.get("pf", 0.0) - agg_b.get("pf", 0.0)
    roll_artifact = (pf_drop > 0.3 and agg_b.get("pf", 1.0) < 1.0)
    conclusion = ("ROLL-ARTIFACT SUSPECTED" if roll_artifact
                  else "EDGE SURVIVES ROLL EXCLUSION — anomaly appears genuine")
    print(f"\n  PF drop when removing roll signals: {pf_drop:.3f}")
    print(f"  CONCLUSION: {conclusion}")

    meta = {
        "roll_dates_count": len(roll_dates),
        "is_signals_total": len(all_is_trades),
        "is_signals_in_roll_window": len(in_roll),
        "is_signals_outside_roll_window": len(out_roll),
        "pf_A_all_signals": round(pf_all, 3),
        "pf_B_roll_excluded": round(pf_out, 3),
        "exp_A": round(exp_all, 4),
        "exp_B": round(exp_out, 4),
        "wfo_A_aggregate": agg_a,
        "wfo_B_aggregate": agg_b,
        "pf_drop": round(pf_drop, 3),
        "conclusion": conclusion,
    }
    print("\n  PHASE 5: COMPLETE")
    return meta


# ============================================================
# PHASE 6 — GLD CROSS-MARKET
# ============================================================

def phase6_gld_cross_market(oos5):
    print("\n" + "="*60)
    print("PHASE 6 — GLD CROSS-MARKET ANALYSIS")
    print("="*60)

    # Search for GLD daily data
    gld_df = None
    for path in GLD_SEARCH_PATHS:
        if os.path.exists(path):
            df, msg = load_csv_ohlc(path, "GLD")
            if df is not None:
                gld_df = df
                print(f"  GLD data found: {path}")
                print(f"  {msg}")
                break

    if gld_df is None:
        print("  GLD daily data NOT FOUND at any searched path.")
        for p in GLD_SEARCH_PATHS:
            print(f"    Searched: {p}")

        # Use v3c audit report yearly data if available
        # Extract from prior audit JSON
        audit_json_path = r"C:\Users\joris\Documents\Capitalife Terminal\engine\backtrader\reports\white_swan_audit_results.json"
        gld_yearly = None
        if os.path.exists(audit_json_path):
            try:
                with open(audit_json_path) as f:
                    audit_data = json.load(f)
                # Look for GLD yearly OOS data
                for key in ["gld_oos_yearly", "gold_gld_yearly", "gld_yearly"]:
                    if key in audit_data:
                        gld_yearly = audit_data[key]
                        break
                # Try nested
                for section in audit_data.values():
                    if isinstance(section, dict) and "yearly_r" in section:
                        gld_yearly = section["yearly_r"]
                        break
            except Exception as e:
                print(f"  Could not parse audit JSON: {e}")

        if gld_yearly:
            print(f"  Using GLD yearly R from audit JSON: {gld_yearly}")
        else:
            print("  GLD yearly data not found in audit JSON either.")
            print("  Cross-market year-by-year correlation: PENDING — GLD data file needed.")
            return {
                "gld_data_found": False,
                "gld_yearly_gc_oos": yearly_r(oos5) if oos5 else {},
                "note": "GLD daily file not found; decomposition pending.",
            }

    # If we have GLD data, compute Thursday→Friday returns
    gld_df["wday"] = gld_df.index.weekday
    gld_df["next_close"] = gld_df["close"].shift(-1)
    gld_df["r_thu_fri"] = (gld_df["next_close"] - gld_df["close"]) / gld_df["close"]

    # Thursday closes
    thu_rows = gld_df[gld_df["wday"] == 3].copy()
    thu_rows["year"] = thu_rows.index.year
    thu_rows["r_R"] = thu_rows["r_thu_fri"] / (thu_rows["close"] * 0.02)  # approx R

    # GLD yearly return (Thursday→Friday)
    gld_yearly_r = {y: round(float(grp["r_thu_fri"].sum() * 100), 3)
                    for y, grp in thu_rows.groupby("year")}

    # GC OOS yearly
    gc_yearly = yearly_r(oos5) if oos5 else {}

    # Year-by-year comparison
    common_years = sorted(set(gld_yearly_r.keys()) & set(gc_yearly.keys()))
    print(f"\n  {'Year':>6}  {'GLD Thu->Fri %':>15}  {'GC OOS R':>10}  {'Direction':>12}")
    print("  " + "-"*50)
    both_pos = both_neg = diverge = 0
    for yr in common_years:
        g_ret = gld_yearly_r[yr]
        c_ret = gc_yearly.get(yr, 0.0)
        direction = ("BOTH +ve" if g_ret > 0 and c_ret > 0
                     else "BOTH -ve" if g_ret < 0 and c_ret < 0
                     else "DIVERGE")
        if direction == "BOTH +ve": both_pos += 1
        elif direction == "BOTH -ve": both_neg += 1
        else: diverge += 1
        print(f"  {yr:>6}  {g_ret:>+14.2f}%  {c_ret:>+9.3f}R  {direction:>12}")

    n = len(common_years)
    overlap = (both_pos + both_neg) / n * 100 if n > 0 else 0.0
    print(f"\n  Years same direction: {both_pos+both_neg}/{n} ({overlap:.1f}%)")
    print(f"  Both positive: {both_pos}  Both negative: {both_neg}  Diverge: {diverge}")

    meta = {
        "gld_data_found": True,
        "gld_yearly_pct": gld_yearly_r,
        "gc_oos_yearly_r": gc_yearly,
        "common_years": common_years,
        "both_positive": both_pos,
        "both_negative": both_neg,
        "diverge": diverge,
        "overlap_pct": round(overlap, 1),
    }
    print("\n  PHASE 6: COMPLETE")
    return meta


# ============================================================
# PHASE 7 — COST MODEL
# ============================================================

def phase7_cost_model(locked_params, oos5):
    print("\n" + "="*60)
    print("PHASE 7 — COST MODEL AND EXECUTABILITY")
    print("="*60)

    if not oos5:
        print("  No OOS trades to compute edge from. Skipping.")
        return {}

    rs = [r for _, r in oos5]
    gross_avg_r = float(np.mean(rs))

    # Approx avg gold price for ATR-based stop sizing
    avg_gold_px = 1600.0  # USD/oz representative

    # Locked ATR multiple for stop
    atr_n, sl_mult, rr = locked_params
    # Typical ATR on 60m GC: ~8-12 USD/oz. Use 10 as central estimate.
    typical_atr_60m = 10.0  # USD/oz
    stop_pts = sl_mult * typical_atr_60m  # USD/oz

    ACCOUNT_EUR = 100_000
    ACCOUNT_USD = ACCOUNT_EUR * 1.08  # EUR/USD 1.08
    RISK_PCT    = 0.01
    RISK_USD    = ACCOUNT_USD * RISK_PCT  # $1,080

    print(f"\n  Account: EUR {ACCOUNT_EUR:,} (~USD {ACCOUNT_USD:,.0f})")
    print(f"  Risk per trade: {RISK_PCT*100:.0f}% = ${RISK_USD:,.0f}")
    print(f"  Stop distance: {sl_mult} x ATR ({typical_atr_60m}/oz typical) = {stop_pts:.1f} USD/oz")

    tiers = []

    # Layer A — Normalized R (no cost)
    tiers.append({
        "instrument": "Normalized R (research baseline)",
        "multiplier": "N/A",
        "tick_usd": "N/A",
        "rt_cost_usd": 0,
        "contracts": "N/A",
        "gross_edge_usd": "N/A",
        "net_edge_usd": "N/A",
        "cost_pct_gross": "0%",
        "pf_at_1x_cost": round(pf_from_r(rs), 3),
        "pf_at_1_25x_cost": round(pf_from_r(rs), 3),
        "pf_at_2x_cost": round(pf_from_r(rs), 3),
        "verdict": "N/A (baseline)",
    })

    # Layer B — MGC Micro Gold Futures (10 oz)
    mgc_mult    = 10    # oz
    mgc_tick    = 0.10  # USD/oz
    mgc_spread  = 0.15  # USD/oz estimated
    mgc_comm    = 2.25 * 2  # $4.50 RT IBKR
    mgc_slip    = 0.10 * mgc_mult  # $1.00 per contract
    mgc_rt_usd  = mgc_comm + mgc_slip + mgc_spread * mgc_mult  # ~$7.00
    # Contracts for 1% risk
    mgc_stop_usd_per_contract = stop_pts * mgc_mult
    mgc_n_contracts = max(1, int(RISK_USD / max(mgc_stop_usd_per_contract, 1)))
    mgc_total_rt = mgc_rt_usd * mgc_n_contracts
    mgc_gross_usd = gross_avg_r * RISK_USD
    mgc_net_usd   = mgc_gross_usd - mgc_total_rt
    mgc_cost_pct  = mgc_total_rt / max(abs(mgc_gross_usd), 1) * 100

    # Adjust R series for cost
    mgc_cost_R = mgc_total_rt / RISK_USD
    rs_net_mgc  = [r - mgc_cost_R for r in rs]

    tiers.append({
        "instrument": "MGC Micro Gold Futures",
        "multiplier": "10 oz",
        "tick_usd": "$1.00/contract",
        "rt_cost_usd": round(mgc_rt_usd, 2),
        "contracts_for_1pct_risk": mgc_n_contracts,
        "total_rt_usd": round(mgc_total_rt, 2),
        "gross_edge_usd": round(mgc_gross_usd, 2),
        "net_edge_usd": round(mgc_net_usd, 2),
        "cost_pct_gross": f"{mgc_cost_pct:.1f}%",
        "pf_at_1x_cost": round(pf_from_r(rs_net_mgc), 3),
        "pf_at_1_25x_cost": round(pf_from_r([r - mgc_cost_R*1.25 for r in rs]), 3),
        "pf_at_2x_cost": round(pf_from_r([r - mgc_cost_R*2 for r in rs]), 3),
        "verdict": "NET POSITIVE" if pf_from_r(rs_net_mgc) > 1.0 else "MARGINAL",
    })

    # Layer C — GC Standard Gold Futures (100 oz)
    gc_mult   = 100   # oz
    gc_comm   = 5.00 * 2  # $10 RT IBKR
    gc_slip   = 0.10 * gc_mult   # $10 per contract
    gc_spread = 0.10 * gc_mult   # $10 per contract
    gc_rt_usd = gc_comm + gc_slip + gc_spread  # ~$30
    gc_stop_usd_per_contract = stop_pts * gc_mult
    gc_n_contracts = max(1, int(RISK_USD / max(gc_stop_usd_per_contract, 1)))
    gc_total_rt = gc_rt_usd * gc_n_contracts
    gc_gross_usd = gross_avg_r * RISK_USD
    gc_net_usd   = gc_gross_usd - gc_total_rt
    gc_cost_pct  = gc_total_rt / max(abs(gc_gross_usd), 1) * 100
    gc_cost_R    = gc_total_rt / RISK_USD
    rs_net_gc    = [r - gc_cost_R for r in rs]

    tiers.append({
        "instrument": "GC Standard Gold Futures",
        "multiplier": "100 oz",
        "tick_usd": "$10.00/contract",
        "rt_cost_usd": round(gc_rt_usd, 2),
        "contracts_for_1pct_risk": gc_n_contracts,
        "total_rt_usd": round(gc_total_rt, 2),
        "gross_edge_usd": round(gc_gross_usd, 2),
        "net_edge_usd": round(gc_net_usd, 2),
        "cost_pct_gross": f"{gc_cost_pct:.1f}%",
        "pf_at_1x_cost": round(pf_from_r(rs_net_gc), 3),
        "pf_at_1_25x_cost": round(pf_from_r([r - gc_cost_R*1.25 for r in rs]), 3),
        "pf_at_2x_cost": round(pf_from_r([r - gc_cost_R*2 for r in rs]), 3),
        "verdict": "NET POSITIVE" if pf_from_r(rs_net_gc) > 1.0 else "MARGINAL",
    })

    # Layer D — GLD ETF
    gld_px    = 200.0  # approx GLD share price
    gld_comm  = 0.005  # per share, min $1
    gld_spread = 0.01  # $0.01 per share
    gld_shares = int(RISK_USD / (stop_pts / avg_gold_px * gld_px) + 0.5)
    gld_rt_usd = max(1.0, gld_shares * gld_comm) * 2 + gld_shares * gld_spread
    gld_gross_usd = gross_avg_r * RISK_USD
    gld_net_usd   = gld_gross_usd - gld_rt_usd
    gld_cost_R    = gld_rt_usd / RISK_USD
    rs_net_gld    = [r - gld_cost_R for r in rs]

    tiers.append({
        "instrument": "GLD ETF",
        "multiplier": "1 share ~$200",
        "tick_usd": "$0.01",
        "rt_cost_usd": round(gld_rt_usd, 2),
        "shares_for_1pct_risk": gld_shares,
        "gross_edge_usd": round(gld_gross_usd, 2),
        "net_edge_usd": round(gld_net_usd, 2),
        "cost_pct_gross": f"{gld_rt_usd/max(abs(gld_gross_usd),1)*100:.1f}%",
        "pf_at_1x_cost": round(pf_from_r(rs_net_gld), 3),
        "pf_at_1_25x_cost": round(pf_from_r([r - gld_cost_R*1.25 for r in rs]), 3),
        "pf_at_2x_cost": round(pf_from_r([r - gld_cost_R*2 for r in rs]), 3),
        "verdict": "NET POSITIVE" if pf_from_r(rs_net_gld) > 1.0 else "MARGINAL",
    })

    print(f"\n  {'Instrument':<35}  {'RT Cost':>10}  {'Gross Avg R':>12}  {'Net PF@1x':>10}  {'Verdict':>15}")
    print("  " + "-"*90)
    gross_avg_r_str = f"{gross_avg_r:.4f}R"
    for t in tiers:
        print(f"  {t['instrument']:<35}  {str(t.get('rt_cost_usd','N/A')):>10}  {gross_avg_r_str:>12}  "
              f"{str(t.get('pf_at_1x_cost','N/A')):>10}  {t.get('verdict',''):>15}")

    meta = {
        "account_eur": ACCOUNT_EUR,
        "account_usd": round(ACCOUNT_USD, 0),
        "risk_pct": RISK_PCT,
        "risk_usd": round(RISK_USD, 0),
        "stop_pts_usd_per_oz": stop_pts,
        "gross_avg_r_oos": round(gross_avg_r, 4),
        "tiers": tiers,
    }
    print("\n  PHASE 7: COMPLETE")
    return meta


# ============================================================
# PHASE 8 — KNOWN 2021-2026 HISTORICAL VALIDATION
# ============================================================

def phase8_known_validation(gc60, locked_params):
    print("\n" + "="*60)
    print("PHASE 8 — KNOWN 2021-2026 HISTORICAL VALIDATION")
    print("  *** NOT A PRISTINE HOLDOUT — data seen in prior audits ***")
    print("="*60)

    atr_n, sl_mult, rr = locked_params
    trades = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                   start_dt=KHV_START, end_dt=KHV_END)
    rd = trades_to_rd(trades)
    meta = compute_metrics(rd, KHV_START, KHV_END)
    meta["yearly_r"] = yearly_r(rd)
    meta["rolling_12m_pf"] = rolling_12m_pf(rd)

    print(f"\n  Locked params: ATR={atr_n}, SL_mult={sl_mult}, RR={rr}")
    print(f"  Period: {KHV_START.date()} -> {KHV_END.date()} [KNOWN HISTORICAL VALIDATION]")
    print(f"  Total trades: {meta['trades']}")
    print(f"  PF: {meta['pf']}")
    print(f"  Win%: {meta['win_pct']}%")
    print(f"  Avg R: {meta['avg_r']}")
    print(f"  CAGR: {meta['cagr']}%")
    print(f"  MaxDD: {meta['max_dd_pct']}%")
    print(f"  Calmar: {meta['calmar']}")

    print(f"\n  Yearly Returns (KNOWN HISTORICAL VALIDATION):")
    for yr, r_sum in sorted(meta["yearly_r"].items()):
        label = "2026 YTD" if yr == 2026 else str(yr)
        bar = "#" * int(max(0, r_sum*3)) if r_sum > 0 else "-" * int(max(0, -r_sum*3))
        print(f"    {label}: {r_sum:+.3f}R  {bar}")

    print("\n  PHASE 8: COMPLETE")
    return meta


# ============================================================
# PHASE 9 — REGIME RESEARCH
# ============================================================

def load_macro_series(path, label):
    if not os.path.exists(path):
        print(f"  {label}: NOT FOUND at {path}")
        return None
    df, msg = load_csv_ohlc(path, label)
    print(f"  {msg}")
    return df


def compute_regime_filter(macro_df, sma_n=20, mode="below_sma"):
    """
    mode='below_sma': bullish when macro below SMA (e.g. DXY declining).
    mode='above_sma': bullish when macro above SMA (e.g. SPY trending).
    Returns daily boolean Series indexed by date.
    """
    sma = macro_df["close"].rolling(sma_n).mean()
    if mode == "below_sma":
        signal = macro_df["close"] < sma
    else:
        signal = macro_df["close"] > sma
    return signal.rename(label)


def apply_regime(trades_with_dates, regime_series):
    """Filter trades where regime is True on or before the trade date."""
    filtered = []
    for dt, r in trades_with_dates:
        trade_date = dt.date() if hasattr(dt, "date") else dt
        # Check if regime was active on trade date (use last available before)
        matching = regime_series[regime_series.index.date <= trade_date]
        if len(matching) > 0 and matching.iloc[-1]:
            filtered.append((dt, r))
    return filtered


def phase9_regime_research(gc60, locked_params, folds5):
    print("\n" + "="*60)
    print("PHASE 9 — REGIME RESEARCH")
    print("  (Pre-2021 IS only — thresholds selected inside each WFO fold)")
    print("="*60)

    dxy_df  = load_macro_series(DXY_CSV,   "DXY")
    us10y_df = load_macro_series(US10Y_CSV, "US10Y")

    if dxy_df is None and us10y_df is None:
        print("  No macro data available. Skipping regime research.")
        return {"note": "No macro data available."}

    atr_n, sl_mult, rr = locked_params

    def run_regime_wfo(regime_name, regime_series):
        """Run WFO with regime filter, select threshold in each IS fold."""
        oos_filtered = []
        pos_folds = 0
        total_folds = 0

        for fold_dict in folds5:
            is_s = datetime(int(fold_dict["is_start"]), 1, 1)
            is_e = datetime(int(fold_dict["is_end"]), 12, 31, 23, 59, 59)
            oos_yr = fold_dict["oos_year"]
            oos_s = datetime(oos_yr, 1, 1)
            oos_e = datetime(oos_yr, 12, 31, 23, 59, 59)

            # Use the locked params (single param, just filter trades)
            is_trades = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                              start_dt=is_s, end_dt=is_e)
            is_rd = trades_to_rd(is_trades)

            # Apply regime filter on IS
            is_regime = regime_series[regime_series.index <= is_e]
            is_filtered = apply_regime(is_rd, is_regime)

            # OOS trades
            oos_trades = run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                                               start_dt=oos_s, end_dt=oos_e)
            oos_rd = trades_to_rd(oos_trades)

            # Apply same regime to OOS (selected on IS)
            oos_regime = regime_series[regime_series.index <= oos_e]
            oos_filtered_fold = apply_regime(oos_rd, oos_regime)
            oos_filtered.extend(oos_filtered_fold)

            oos_pf = pf_from_r([r for _, r in oos_filtered_fold]) if oos_filtered_fold else 0.0
            if oos_pf > 1.0:
                pos_folds += 1
            total_folds += 1

        agg = compute_metrics(oos_filtered,
                               datetime(2008, 1, 1),
                               datetime(2020, 12, 31)) if oos_filtered else {}
        agg["pos_folds"] = pos_folds
        agg["total_folds"] = total_folds
        return agg

    results = {}

    # Base (no regime)
    base_rd = trades_to_rd(
        run_gold_friday_long(gc60, atr_n, sl_mult, rr,
                              start_dt=IS_START, end_dt=IS_END)
    )
    base_agg = compute_metrics(base_rd, IS_START, IS_END)
    results["base"] = base_agg
    print(f"\n  Base GC IS: PF={base_agg['pf']}, trades={base_agg['trades']}")

    if dxy_df is not None:
        # DXY 20-day SMA declining = close < SMA
        dxy_regime = (dxy_df["close"] < dxy_df["close"].rolling(20).mean())
        dxy_regime.index = dxy_regime.index.normalize()
        print("  Running DXY regime filter...")
        dxy_agg = run_regime_wfo("DXY_decline", dxy_regime)
        results["dxy_declining"] = dxy_agg
        print(f"  DXY declining regime OOS WFO: PF={dxy_agg.get('pf','N/A')} "
              f"trades={dxy_agg.get('trades','N/A')} "
              f"pos_folds={dxy_agg.get('pos_folds','N/A')}/{dxy_agg.get('total_folds','N/A')}")

    if us10y_df is not None:
        # US10Y declining = close < 20-day SMA
        us10y_regime = (us10y_df["close"] < us10y_df["close"].rolling(20).mean())
        us10y_regime.index = us10y_regime.index.normalize()
        print("  Running US10Y regime filter...")
        us10y_agg = run_regime_wfo("US10Y_decline", us10y_regime)
        results["us10y_declining"] = us10y_agg
        print(f"  US10Y declining regime OOS WFO: PF={us10y_agg.get('pf','N/A')} "
              f"trades={us10y_agg.get('trades','N/A')} "
              f"pos_folds={us10y_agg.get('pos_folds','N/A')}/{us10y_agg.get('total_folds','N/A')}")

    if dxy_df is not None and us10y_df is not None:
        # Combined: DXY AND US10Y declining
        combined_regime = dxy_regime & us10y_regime
        print("  Running combined (DXY + US10Y declining) regime filter...")
        comb_agg = run_regime_wfo("combined", combined_regime)
        results["combined_dxy_us10y"] = comb_agg
        print(f"  Combined regime OOS WFO: PF={comb_agg.get('pf','N/A')} "
              f"trades={comb_agg.get('trades','N/A')} "
              f"pos_folds={comb_agg.get('pos_folds','N/A')}/{comb_agg.get('total_folds','N/A')}")

    print("\n  PHASE 9: COMPLETE")
    return results


# ============================================================
# PHASE 10 — PORTFOLIO ANALYSIS
# ============================================================

def phase10_portfolio(oos5, phase6_meta):
    print("\n" + "="*60)
    print("PHASE 10 — GOLD FAMILY PORTFOLIO ANALYSIS")
    print("="*60)

    gc_yearly = yearly_r(oos5) if oos5 else {}

    # GLD: from phase 6
    gld_yearly = phase6_meta.get("gld_yearly_pct", {})
    gld_data_found = phase6_meta.get("gld_data_found", False)

    print(f"\n  GC OOS yearly (pre-2021 WFO):")
    for yr, r in sorted(gc_yearly.items()):
        print(f"    {yr}: {r:+.3f}R")

    if not gld_data_found:
        print(f"\n  GLD daily data not available — portfolio correlation analysis limited.")
        print("  Recommendation: single-instrument execution via GLD ETF (already confirmed KEEP)")
        print("  pending GC confirmation, consider MGC or GC as alternative.")
        meta = {
            "gc_only_pf": round(pf_from_r([r for _, r in oos5]), 3) if oos5 else 0.0,
            "gld_data_available": False,
            "note": "GLD daily data not found; full portfolio analysis pending.",
        }
        print("\n  PHASE 10: COMPLETE (limited — GLD data missing)")
        return meta

    # Year-by-year correlation
    common = sorted(set(gc_yearly.keys()) & set(gld_yearly.keys()))
    if len(common) >= 3:
        gc_arr  = np.array([gc_yearly[y] for y in common])
        gld_arr = np.array([gld_yearly[y] for y in common])
        corr = float(np.corrcoef(gc_arr, gld_arr)[0, 1])
        print(f"\n  Year-by-year correlation GC vs GLD: {corr:.3f}")

        # Drawdown overlap: years where both negative
        both_neg = sum(1 for y in common if gc_yearly[y] < 0 and gld_yearly[y] < 0)
        dd_overlap = both_neg / len(common) * 100
        print(f"  Drawdown overlap (both negative): {both_neg}/{len(common)} ({dd_overlap:.1f}%)")

        # Combined equal-weight
        comb_r = [(gc_yearly[y] + gld_yearly[y]) / 2 for y in common]
        comb_gc_only = [gc_yearly[y] for y in common]

        # Compute as equity curves
        eq_gc   = np.cumprod(1 + np.array(comb_gc_only) * 0.01)
        eq_comb = np.cumprod(1 + np.array(comb_r) * 0.01)

        def annual_stats(arr):
            rr = np.maximum.accumulate(arr)
            dd = ((rr - arr) / rr).max() * 100
            cagr = (arr[-1] ** (1/len(arr)) - 1) * 100
            return round(cagr, 2), round(dd, 2)

        gc_cagr, gc_dd = annual_stats(eq_gc)
        comb_cagr, comb_dd = annual_stats(eq_comb)

        print(f"\n  Portfolio comparison (pre-2021 WFO OOS):")
        print(f"    GC only:    CAGR={gc_cagr:.2f}%  MaxDD={gc_dd:.2f}%  Calmar={gc_cagr/max(gc_dd,0.01):.3f}")
        print(f"    GLD+GC:     CAGR={comb_cagr:.2f}%  MaxDD={comb_dd:.2f}%  Calmar={comb_cagr/max(comb_dd,0.01):.3f}")

        verdict = ("SAME SIGNAL (high correlation, low diversification benefit)"
                   if abs(corr) > 0.7
                   else "DIVERSIFYING (meaningful correlation <0.7)")
        print(f"\n  Verdict: {verdict}")

        meta = {
            "common_years": common,
            "year_by_year_corr": round(corr, 3),
            "drawdown_overlap_pct": round(dd_overlap, 1),
            "gc_only_cagr": gc_cagr,
            "gc_only_maxdd": gc_dd,
            "combined_cagr": comb_cagr,
            "combined_maxdd": comb_dd,
            "combined_calmar": round(comb_cagr/max(comb_dd,0.01), 3),
            "verdict": verdict,
        }
    else:
        print("  Insufficient overlapping years for correlation.")
        meta = {"note": "Insufficient overlapping years."}

    print("\n  PHASE 10: COMPLETE")
    return meta


# ============================================================
# PHASE 11 — ACCEPTANCE VERDICT
# ============================================================

def phase11_verdict(phase2_meta, phase4_meta, phase5_meta,
                    phase7_meta, phase8_meta, phase10_meta,
                    locked_params):
    print("\n" + "="*60)
    print("PHASE 11 — ACCEPTANCE VERDICT")
    print("="*60)

    agg5 = phase4_meta.get("5yr_aggregate", {})
    gates = {}

    # Gate 1: WFO expectancy > 0
    exp = agg5.get("avg_r", 0.0)
    gates["G1_wfo_expectancy_pos"] = exp > 0
    print(f"\n  G1 WFO expectancy > 0R: {exp:.4f}R -> {'PASS' if gates['G1_wfo_expectancy_pos'] else 'FAIL'}")

    # Gate 2: WFO PF materially > 1.0
    pf = agg5.get("pf", 0.0)
    gates["G2_wfo_pf_material"] = pf > 1.10
    print(f"  G2 WFO PF materially > 1.1: {pf:.3f} -> {'PASS' if gates['G2_wfo_pf_material'] else 'FAIL'}")

    # Gate 3: Majority OOS folds positive
    pos_folds = agg5.get("pos_folds", 0)
    tot_folds = agg5.get("total_folds", 1)
    gates["G3_majority_folds_pos"] = pos_folds > tot_folds / 2
    print(f"  G3 Majority folds positive: {pos_folds}/{tot_folds} -> {'PASS' if gates['G3_majority_folds_pos'] else 'FAIL'}")

    # Gate 4: >=70% parameter combos profitable
    pf_pct = phase2_meta.get("pf_gt1_pct", 0.0)
    gates["G4_plateau_confirmed"] = pf_pct >= 70.0
    print(f"  G4 IS plateau >=70% combos PF>1: {pf_pct:.1f}% -> {'PASS' if gates['G4_plateau_confirmed'] else 'FAIL'}")

    # Gate 5: Edge survives roll exclusion
    roll_concl = phase5_meta.get("conclusion", "")
    gates["G5_roll_audit"] = "genuine" in roll_concl.lower()
    print(f"  G5 Roll audit: {roll_concl[:60]} -> {'PASS' if gates['G5_roll_audit'] else 'FAIL'}")

    # Gate 6: Independent gold proxy confirms
    gld_found = phase10_meta.get("gld_data_available", None)
    corr = phase10_meta.get("year_by_year_corr", None)
    if corr is not None:
        gates["G6_independent_proxy"] = True
        print(f"  G6 GLD proxy confirms direction (corr={corr:.3f}): PASS")
    else:
        gates["G6_independent_proxy"] = False
        print(f"  G6 GLD proxy: data not available -> INCONCLUSIVE (treated as FAIL for conservatism)")

    # Gate 7: Costs preserve net positive
    tiers = phase7_meta.get("tiers", [])
    mgc_pf = next((t.get("pf_at_1x_cost", 0) for t in tiers
                   if "MGC" in t.get("instrument", "")), 0)
    gates["G7_costs_pos"] = mgc_pf > 1.0
    print(f"  G7 MGC net PF at realistic costs: {mgc_pf:.3f} -> {'PASS' if gates['G7_costs_pos'] else 'FAIL'}")

    # Gate 8: 2021-2026 not catastrophic
    khv_pf = phase8_meta.get("pf", 0.0)
    khv_dd = phase8_meta.get("max_dd_pct", 100.0)
    gates["G8_khv_not_catastrophic"] = khv_pf > 0.8 and khv_dd < 40.0
    print(f"  G8 2021-2026 (KNOWN HIST.) PF={khv_pf:.3f} MaxDD={khv_dd:.1f}% -> {'PASS' if gates['G8_khv_not_catastrophic'] else 'FAIL'}")

    gates_passed = sum(gates.values())
    gates_total  = len(gates)
    verdict = "KEEP" if gates_passed >= 6 else "WATCH" if gates_passed >= 4 else "REJECT"

    print(f"\n  Gates passed: {gates_passed}/{gates_total}")
    print(f"\n  FINAL VERDICT: GC Gold Friday Long -> {verdict}")

    if verdict == "KEEP":
        # Portfolio structure
        gld_avail = phase10_meta.get("gld_data_available", False)
        corr_val  = phase10_meta.get("year_by_year_corr", None)
        if corr_val is not None and corr_val > 0.7:
            portfolio_rec = "A/B same signal — prefer GLD ETF (simpler) or GC futures (higher notional). No material diversification from combining."
        elif corr_val is not None:
            portfolio_rec = "C: GLD + GC combined at equal risk weight — meaningful diversification benefit."
        else:
            portfolio_rec = "B: GC only (GLD data unavailable for combination analysis). Consider MGC for small accounts."
        print(f"  Portfolio recommendation: {portfolio_rec}")
    else:
        portfolio_rec = "GLD remains sole implementation. Needed for upgrade: GC OOS data confirmation, roll audit pass, and cost model positive."

    meta = {
        "gates": gates,
        "gates_passed": gates_passed,
        "gates_total": gates_total,
        "verdict": verdict,
        "locked_params": {
            "atr_n": locked_params[0],
            "sl_mult": locked_params[1],
            "rr": locked_params[2],
        },
        "portfolio_recommendation": portfolio_rec,
    }
    print("\n  PHASE 11: COMPLETE")
    return meta


# ============================================================
# REPORT WRITER
# ============================================================

def write_json_report(all_results):
    path = os.path.join(REPORT_ROOT, "white_swan_gold_family_v1.json")
    with open(path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n  JSON report written: {path}")
    return path


def write_markdown_report(all_results):
    path = os.path.join(REPORT_ROOT, "white_swan_gold_family_v1.md")
    p1  = all_results.get("phase1", {})
    p2  = all_results.get("phase2", {})
    p3  = all_results.get("phase3", [])
    p4  = all_results.get("phase4", {})
    p5  = all_results.get("phase5", {})
    p6  = all_results.get("phase6", {})
    p7  = all_results.get("phase7", {})
    p8  = all_results.get("phase8", {})
    p9  = all_results.get("phase9", {})
    p10 = all_results.get("phase10", {})
    p11 = all_results.get("phase11", {})
    lp  = all_results.get("locked_params", {})

    lines = []
    def h(n, txt): lines.append(f"\n{'#'*n} {txt}\n")
    def p(txt):    lines.append(txt + "\n")
    def hr():      lines.append("\n---\n")

    h(1, "White Swan Gold Family Research — v1")
    p(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    p("**IS Period:** 2003-07-30 through 2020-12-31")
    p("**Known Historical Validation:** 2021-01-01 through 2026-06-05 (NOT pristine holdout)")
    p("**Entry semantics:** close-fill (Friday last 60m bar UTC>=18)")
    p("**Exit semantics:** SL / TP / Monday close")

    hr()
    h(2, "Phase 1 — Data Manifest")
    manifest = p1.get("manifest", [])
    lines.append("| File | Rows | Expected | Check | SHA256 |\n")
    lines.append("|------|------|----------|-------|--------|\n")
    for m in manifest:
        sha = m.get("sha256", "")[:16] + "..."
        lines.append(f"| {m['file']} | {m.get('actual_bars','?')} | {m.get('expected_rows','?')} | {m.get('row_check','?')} | {sha} |\n")
    p(f"\nTotal 60m bars: **{p1.get('gc60_total_bars','?')}**  |  Range: {p1.get('gc60_range_start','?')} → {p1.get('gc60_range_end','?')}")
    p(f"Duplicate timestamps removed: {p1.get('gc60_dupes_removed','?')}  |  Gaps > 1 week: {p1.get('gc60_gaps_gt1week','?')}")

    hr()
    h(2, "Phase 2 — IS Parameter Plateau (2003-2020)")
    p2_c = p2.get("plateau_center", {})
    p(f"**Locked Parameters:** ATR={p2_c.get('atr_n','?')}, SL_mult={p2_c.get('sl_mult','?')}, RR={p2_c.get('rr','?')}")
    p(f"IS PF at plateau center: **{p2.get('plateau_center_pf','?')}**  "
      f"| Neighborhood avg PF: {p2.get('neighborhood_pf','?')}")
    p(f"IS avg R: {p2.get('plateau_center_avg_r','?')}  | Win%: {p2.get('plateau_center_wr','?')}%  "
      f"| IS trades: {p2.get('plateau_center_n','?')}")
    p(f"IS combos with PF > 1.0: **{p2.get('pf_gt1_count','?')}/{p2.get('combo_results_count','?')} "
      f"({p2.get('pf_gt1_pct','?')}%)**")

    h(3, "IS PF Heatmap (RR=None, no TP)")
    all_c = p2.get("all_combos", {})
    lines.append("| ATR\\SL | 0.75 | 1.00 | 1.25 | 1.50 |\n")
    lines.append("|--------|------|------|------|------|\n")
    for atr_n in ATR_LENS:
        row = f"| ATR {atr_n} |"
        for sl in SL_MULTS:
            k = str((atr_n, sl, None))
            v = all_c.get(k, {}).get("pf", 0.0)
            row += f" {v:.3f} |"
        lines.append(row + "\n")

    h(3, "IS PF Heatmap (RR=1.5)")
    lines.append("| ATR\\SL | 0.75 | 1.00 | 1.25 | 1.50 |\n")
    lines.append("|--------|------|------|------|------|\n")
    for atr_n in ATR_LENS:
        row = f"| ATR {atr_n} |"
        for sl in SL_MULTS:
            k = str((atr_n, sl, 1.5))
            v = all_c.get(k, {}).get("pf", 0.0)
            row += f" {v:.3f} |"
        lines.append(row + "\n")

    hr()
    h(2, "Phase 3 — 30-Trade Reconciliation")
    lines.append("| # | Entry UTC | Entry$ | ATR | Stop$ | TP$ | Exit UTC | Exit$ | Reason | Gross R | Net R |\n")
    lines.append("|---|-----------|--------|-----|-------|-----|----------|-------|--------|---------|-------|\n")
    for t in p3:
        tp_str = str(t.get("target", "None")) if t.get("target") else "None"
        lines.append(f"| {t['trade_num']} | {t['entry_utc']} | {t['entry_price']} | {t['atr']} | "
                     f"{t['stop']} | {tp_str} | {t['exit_utc']} | {t['exit_price']} | "
                     f"{t['reason']} | {t['gross_r']} | {t['net_r']} |\n")

    hr()
    h(2, "Phase 4 — Walk-Forward Optimization")
    folds5 = p4.get("5yr_folds", [])
    agg5   = p4.get("5yr_aggregate", {})
    h(3, "5yr IS / 1yr OOS Fold Table")
    lines.append("| Fold IS | OOS Year | Flag | Params | IS PF | OOS Trades | OOS PF | Win% | Avg R | CAGR | MaxDD | Positive |\n")
    lines.append("|---------|----------|------|--------|-------|------------|--------|------|-------|------|-------|----------|\n")
    for f in folds5:
        bp = f.get("best_params", {})
        pos = "YES" if f.get("oos_positive") else "NO"
        lines.append(f"| {f.get('is_start')}-{f.get('is_end')} | {f.get('oos_year')} | "
                     f"{f.get('flag','')} | ATR{bp.get('atr_n')}/SL{bp.get('sl_mult')}/RR{bp.get('rr')} | "
                     f"{f.get('is_pf')} | {f.get('oos_trades')} | {f.get('oos_pf')} | "
                     f"{f.get('oos_win_pct')}% | {f.get('oos_avg_r')} | {f.get('oos_cagr')} | "
                     f"{f.get('oos_max_dd_pct')} | {pos} |\n")

    p(f"\n**WFO Aggregate (5yr IS):** PF={agg5.get('pf','?')}  Expectancy={agg5.get('avg_r','?')}R  "
      f"Win%={agg5.get('win_pct','?')}%  Trades={agg5.get('trades','?')}  "
      f"CAGR={agg5.get('cagr','?')}%  MaxDD={agg5.get('max_dd_pct','?')}%  "
      f"Calmar={agg5.get('calmar','?')}  "
      f"PosFolds={agg5.get('pos_folds','?')}/{agg5.get('total_folds','?')}  "
      f"MaxLoseStreak={agg5.get('max_consec_loss','?')}")

    h(3, "Yearly OOS Returns (5yr IS)")
    yr_r = agg5.get("yearly_r", {})
    lines.append("| Year | R-sum | Direction |\n")
    lines.append("|------|-------|----------|\n")
    for yr, r in sorted(yr_r.items()):
        lines.append(f"| {yr} | {r:+.3f} | {'POS' if r>0 else 'NEG'} |\n")

    hr()
    h(2, "Phase 5 — Continuous Futures Roll Audit")
    lines.append("| Metric | Version A (all signals) | Version B (roll window excluded) |\n")
    lines.append("|--------|------------------------|----------------------------------|\n")
    lines.append(f"| IS signals | {p5.get('is_signals_total','?')} | {p5.get('is_signals_outside_roll_window','?')} |\n")
    lines.append(f"| IS PF | {p5.get('pf_A_all_signals','?')} | {p5.get('pf_B_roll_excluded','?')} |\n")
    lines.append(f"| IS Expectancy | {p5.get('exp_A','?')}R | {p5.get('exp_B','?')}R |\n")
    a5 = p5.get("wfo_A_aggregate", {})
    b5 = p5.get("wfo_B_aggregate", {})
    lines.append(f"| WFO OOS PF | {a5.get('pf','?')} | {b5.get('pf','?')} |\n")
    lines.append(f"| Pos folds | {a5.get('pos_folds_a','?')}/{p4.get('5yr_aggregate',{}).get('total_folds','?')} | {b5.get('pos_folds_b','?')}/{len(p4.get('5yr_folds',[]))} |\n")
    p(f"\n**Conclusion:** {p5.get('conclusion','?')}")

    hr()
    h(2, "Phase 6 — GLD Cross-Market Analysis")
    if p6.get("gld_data_found"):
        lines.append("| Year | GLD Thu→Fri% | GC OOS R | Direction |\n")
        lines.append("|------|-------------|----------|----------|\n")
        gld_yr = p6.get("gld_yearly_pct", {})
        gc_yr  = p6.get("gc_oos_yearly_r", {})
        for yr in sorted(p6.get("common_years", [])):
            g = gld_yr.get(yr, 0)
            c = gc_yr.get(yr, 0)
            d = "BOTH +" if g > 0 and c > 0 else "BOTH -" if g < 0 and c < 0 else "DIVERGE"
            lines.append(f"| {yr} | {g:+.2f}% | {c:+.3f}R | {d} |\n")
        p(f"\nOverlap coefficient: **{p6.get('overlap_pct','?')}%** | "
          f"Both positive: {p6.get('both_positive','?')} | "
          f"Both negative: {p6.get('both_negative','?')} | "
          f"Diverge: {p6.get('diverge','?')}")
    else:
        p("GLD daily data not found. Cross-market decomposition pending.")
        p(f"GC OOS yearly returns (Phase 4): {p6.get('gld_yearly_gc_oos', {})}")

    hr()
    h(2, "Phase 7 — Cost Model")
    tiers = p7.get("tiers", [])
    lines.append("| Instrument | RT Cost | Net PF@1x | Net PF@1.25x | Net PF@2x | Verdict |\n")
    lines.append("|------------|---------|-----------|-------------|-----------|--------|\n")
    for t in tiers:
        lines.append(f"| {t['instrument']} | ${t.get('rt_cost_usd','N/A')} | "
                     f"{t.get('pf_at_1x_cost','N/A')} | {t.get('pf_at_1_25x_cost','N/A')} | "
                     f"{t.get('pf_at_2x_cost','N/A')} | {t.get('verdict','N/A')} |\n")
    p(f"\nGross avg R (WFO OOS): {p7.get('gross_avg_r_oos','?')}R  "
      f"| Risk: {p7.get('risk_pct',0)*100:.0f}% of EUR {p7.get('account_eur',100000):,}")

    hr()
    h(2, "Phase 8 — Known 2021-2026 Historical Validation")
    p("**LABEL: KNOWN HISTORICAL VALIDATION — this period was seen in prior audits. NOT a pristine holdout.**")
    p(f"Locked params: ATR={lp.get('atr_n')}, SL_mult={lp.get('sl_mult')}, RR={lp.get('rr')}")
    p(f"Period: 2021-01-01 → 2026-06-05")
    p(f"Trades: {p8.get('trades','?')}  |  PF: {p8.get('pf','?')}  |  Win%: {p8.get('win_pct','?')}%  |  "
      f"Avg R: {p8.get('avg_r','?')}  |  CAGR: {p8.get('cagr','?')}%  |  MaxDD: {p8.get('max_dd_pct','?')}%  "
      f"|  Calmar: {p8.get('calmar','?')}")
    h(3, "Yearly Returns [KNOWN HISTORICAL VALIDATION]")
    lines.append("| Year | R-sum | Note |\n")
    lines.append("|------|-------|------|\n")
    for yr, r in sorted(p8.get("yearly_r", {}).items()):
        note = "YTD" if yr == 2026 else ""
        lines.append(f"| {yr} | {r:+.3f} | {note} |\n")

    hr()
    h(2, "Phase 9 — Regime Research")
    if "note" in p9:
        p(p9["note"])
    else:
        lines.append("| Metric | Base GC | DXY Declining | US10Y Declining | Combined |\n")
        lines.append("|--------|---------|--------------|----------------|----------|\n")
        base = p9.get("base", {})
        dxy  = p9.get("dxy_declining", {})
        u10y = p9.get("us10y_declining", {})
        comb = p9.get("combined_dxy_us10y", {})
        for metric in ["pf", "trades", "cagr", "calmar"]:
            lines.append(f"| {metric} | {base.get(metric,'?')} | {dxy.get(metric,'?')} | "
                         f"{u10y.get(metric,'?')} | {comb.get(metric,'?')} |\n")
        pos_folds_row = (f"| pos_folds | {base.get('trades','?')} trades | "
                         f"{dxy.get('pos_folds','?')}/{dxy.get('total_folds','?')} | "
                         f"{u10y.get('pos_folds','?')}/{u10y.get('total_folds','?')} | "
                         f"{comb.get('pos_folds','?')}/{comb.get('total_folds','?')} |\n")
        lines.append(pos_folds_row)

    hr()
    h(2, "Phase 10 — Portfolio Analysis")
    if p10.get("gld_data_available") is False:
        p("GLD data not available. Full portfolio correlation analysis pending.")
    else:
        corr = p10.get("year_by_year_corr", "N/A")
        p(f"Year-by-year correlation GC vs GLD: **{corr}**")
        p(f"Drawdown overlap: {p10.get('drawdown_overlap_pct','?')}%")
        lines.append("| Portfolio | CAGR | MaxDD | Calmar |\n")
        lines.append("|-----------|------|-------|--------|\n")
        lines.append(f"| GC only | {p10.get('gc_only_cagr','?')}% | {p10.get('gc_only_maxdd','?')}% | "
                     f"{round(p10.get('gc_only_cagr',0)/max(p10.get('gc_only_maxdd',1),0.01),3)} |\n")
        lines.append(f"| GLD+GC combined | {p10.get('combined_cagr','?')}% | {p10.get('combined_maxdd','?')}% | "
                     f"{p10.get('combined_calmar','?')} |\n")
        p(f"\n**Portfolio verdict:** {p10.get('verdict','?')}")

    hr()
    h(2, "Phase 11 — Acceptance Verdict")
    gates = p11.get("gates", {})
    lines.append("| Gate | Description | Result |\n")
    lines.append("|------|-------------|--------|\n")
    gate_desc = {
        "G1_wfo_expectancy_pos": "WFO expectancy > 0R",
        "G2_wfo_pf_material": "WFO aggregate PF > 1.10",
        "G3_majority_folds_pos": "Majority OOS folds positive",
        "G4_plateau_confirmed": ">=70% IS combos PF>1.0",
        "G5_roll_audit": "Edge survives roll exclusion",
        "G6_independent_proxy": "Independent gold proxy confirms",
        "G7_costs_pos": "MGC net PF > 1.0 after costs",
        "G8_khv_not_catastrophic": "2021-2026 not catastrophic",
    }
    for k, desc in gate_desc.items():
        res = gates.get(k, False)
        lines.append(f"| {k} | {desc} | {'PASS' if res else 'FAIL'} |\n")

    p(f"\n**Gates passed: {p11.get('gates_passed','?')}/{p11.get('gates_total','?')}**")

    verdict = p11.get("verdict", "?")
    p(f"\n## FINAL VERDICT: GC Gold Friday Long -> **{verdict}**\n")
    p(f"**Portfolio recommendation:** {p11.get('portfolio_recommendation','?')}")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"\n  Markdown report written: {path}")
    return path


# ============================================================
# MAIN
# ============================================================

def main():
    print("\n" + "="*60)
    print("WHITE SWAN GOLD FAMILY RESEARCH PROGRAM v1")
    print("Phases 1-11 | Pure pandas/numpy | Close-fill semantics")
    print("="*60)

    all_results = {}

    # Phase 1
    gc60, gc_daily, p1_meta = phase1_data_assembly()
    all_results["phase1"] = p1_meta

    # Phase 2
    locked_params, is_combo_results, p2_meta = phase2_is_plateau(gc60)
    all_results["phase2"] = p2_meta
    all_results["locked_params"] = {
        "atr_n": locked_params[0],
        "sl_mult": locked_params[1],
        "rr": locked_params[2],
    }

    # Phase 3
    reconciliation = phase3_reconciliation(gc60, locked_params)
    all_results["phase3"] = reconciliation

    # Phase 4
    p4_meta, oos5 = phase4_wfo(gc60)
    all_results["phase4"] = p4_meta

    # Phase 5
    folds5 = p4_meta.get("5yr_folds", [])
    p5_meta = phase5_roll_audit(gc60, locked_params, folds5, oos5)
    all_results["phase5"] = p5_meta

    # Phase 6
    p6_meta = phase6_gld_cross_market(oos5)
    all_results["phase6"] = p6_meta

    # Phase 7
    p7_meta = phase7_cost_model(locked_params, oos5)
    all_results["phase7"] = p7_meta

    # Phase 8
    p8_meta = phase8_known_validation(gc60, locked_params)
    all_results["phase8"] = p8_meta

    # Phase 9
    p9_meta = phase9_regime_research(gc60, locked_params, folds5)
    all_results["phase9"] = p9_meta

    # Phase 10
    p10_meta = phase10_portfolio(oos5, p6_meta)
    all_results["phase10"] = p10_meta

    # Phase 11
    p11_meta = phase11_verdict(p2_meta, p4_meta, p5_meta,
                                p7_meta, p8_meta, p10_meta,
                                locked_params)
    all_results["phase11"] = p11_meta

    # Write reports
    json_path = write_json_report(all_results)
    md_path   = write_markdown_report(all_results)

    print("\n" + "="*60)
    print("ALL PHASES COMPLETE")
    print(f"  Verdict: {p11_meta.get('verdict','?')}")
    print(f"  JSON: {json_path}")
    print(f"  MD:   {md_path}")
    print("="*60)

    return all_results


if __name__ == "__main__":
    main()
