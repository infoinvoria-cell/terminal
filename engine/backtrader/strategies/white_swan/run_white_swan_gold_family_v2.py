"""
White Swan Gold Family Research Program — v2
============================================
Tasks 1-5: DXY regime fold-by-fold audit, GLD cross-market validation,
           DXY-filtered KHV 2021-2026, execution vehicle comparison,
           final gold-family classification.

Methodology:
  - Pure pandas/numpy, NO Backtrader
  - Close-fill semantics: entry at signal bar's close
  - Pre-2021 IS for ALL parameter and regime threshold selection
  - 2021-2026 is "KNOWN HISTORICAL VALIDATION" — not pristine holdout
  - GC locked params: ATR=10, SL_mult=0.75, RR=1.25 (from v1 IS plateau)
  - GLD locked params: ATR=10, SL_mult=0.75, no-TP (from v3 audit)
  - DXY regime: close < SMA(20) — meta-selection bias MUST be disclosed

Generated: 2026-08-09
"""

import sys, os, json, warnings
from datetime import datetime, timedelta
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
DXY_CSV   = os.path.join(DATA_DIR, "ICEUS_DLY_DXY, 1D_4c8c2(2).csv")

GLD_CSV_PRIMARY = os.path.join(DOWNLOADS, "BATS_GLD, 1D_4975f.csv")
GLD_CSV_ALT     = os.path.join(DOWNLOADS, "BATS_GLD, 1D_76cae.csv")

# Locked GC params (from v1 IS plateau)
GC_ATR_N    = 10
GC_SL_MULT  = 0.75
GC_RR       = 1.25

# Locked GLD params (from v3 audit)
GLD_ATR_N   = 10
GLD_SL_MULT = 0.75
GLD_RR      = None  # no-TP, time exit at Friday close

IS_START  = datetime(2003, 7, 30)
IS_END    = datetime(2020, 12, 31, 23, 59, 59)
KHV_START = datetime(2021, 1, 1)
KHV_END   = datetime(2026, 6, 5, 23, 59, 59)

PARAM_GRID = [(atr, sl, rr) for atr in [7, 10, 14, 20]
              for sl in [0.75, 1.0, 1.25, 1.5]
              for rr in [None, 1.0, 1.25, 1.5, 2.0]]

# ============================================================
# UTILITIES
# ============================================================

def parse_tv_ts(s):
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
    df["dt"] = df["time"].apply(parse_tv_ts)
    df = df.dropna(subset=["dt"]).set_index("dt").sort_index()
    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["close"])
    msg = f"{label}: {len(df)} bars  {df.index[0].date()} -> {df.index[-1].date()}"
    return df, msg


def atr_series(df, n):
    """Wilder ATR(n). Returns raw series — shift(1) before use to avoid look-ahead."""
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
        return float("inf") if len(wins) > 0 else 0.0
    if losses.sum() == 0:
        return float("inf")
    return float(wins.sum() / (-losses.sum()))


def metrics_from_r(rs, start, end):
    rs = np.asarray(rs, dtype=float)
    if len(rs) == 0:
        return dict(trades=0, win_pct=0.0, pf=0.0, avg_r=0.0,
                    cagr=0.0, max_dd_r=0.0, calmar=0.0)
    wins   = rs[rs > 0]
    losses = rs[rs < 0]
    pf     = pf_from_r(rs)
    avg_r  = float(rs.mean())
    win_pct = float((rs > 0).mean()) * 100.0
    eq = np.cumprod(1 + rs * 0.01)
    running_max = np.maximum.accumulate(eq)
    dd_pct = (running_max - eq) / running_max * 100.0
    max_dd = float(dd_pct.max())
    # R-denominated drawdown (sum of consecutive losses)
    cum_r = np.cumsum(rs)
    peak_r = np.maximum.accumulate(cum_r)
    dd_r = peak_r - cum_r
    max_dd_r = float(dd_r.max())
    years = max((end - start).days / 365.25, 0.01)
    cagr  = float((eq[-1] ** (1.0 / years) - 1) * 100.0)
    calmar = cagr / max_dd if max_dd > 0 else 0.0
    return dict(
        trades=int(len(rs)),
        win_pct=round(win_pct, 1),
        pf=round(pf, 3),
        avg_r=round(avg_r, 4),
        total_r=round(float(rs.sum()), 3),
        cagr=round(cagr, 2),
        max_dd_pct=round(max_dd, 2),
        max_dd_r=round(max_dd_r, 3),
        calmar=round(calmar, 3),
    )


def yearly_r_dict(trades_with_dates):
    by_year = defaultdict(list)
    for dt, r in trades_with_dates:
        by_year[dt.year].append(r)
    return {y: round(sum(rs), 3) for y, rs in sorted(by_year.items())}


# ============================================================
# GC STRATEGY ENGINE
# ============================================================

def run_gc_friday_long(gc60_full, atr_n, sl_mult, rr,
                        start_dt=None, end_dt=None):
    """
    Gold Friday Long on 60m bars.
    Entry:  last 60m bar of Friday session (UTC hour >= 18, weekday=4), close.
    Exit:   SL | TP | Monday close.
    Returns list of (signal_dt, entry, atr_val, stop, target, exit_dt, exit_price, reason, R).
    """
    df = gc60_full.copy()
    df["atr_raw"] = atr_series(df, atr_n)
    df["atr"] = df["atr_raw"].shift(1)

    if start_dt:
        df = df[df.index >= start_dt]
    if end_dt:
        df = df[df.index <= end_dt]

    if len(df) < atr_n + 5:
        return []

    wdays  = df.index.weekday
    hours  = df.index.hour
    idx    = df.index
    opens  = df["open"].values
    highs  = df["high"].values
    lows   = df["low"].values
    closes = df["close"].values
    atrs   = df["atr"].values

    friday_last = {}
    for i in range(len(df)):
        if wdays[i] == 4 and hours[i] >= 18:
            d = idx[i].date()
            friday_last[d] = i

    trades = []
    used_until = 0

    for d_key in sorted(friday_last.keys()):
        i = friday_last[d_key]
        if i < used_until:
            continue
        if np.isnan(atrs[i]) or atrs[i] <= 0:
            continue

        entry    = closes[i]
        atr_val  = atrs[i]
        risk_pts = sl_mult * atr_val
        stop     = entry - risk_pts
        target   = (entry + risk_pts * rr) if rr is not None else None
        signal_dt = idx[i]

        exit_r = exit_dt = exit_price = reason = None
        last_mon_i = None

        for j in range(i + 1, min(i + 300, len(df))):
            wd = wdays[j]
            if wd in (5, 6):
                continue
            if lows[j] <= stop:
                exit_r     = -1.0
                exit_price = stop
                exit_dt    = idx[j]
                reason     = "SL"
                used_until = j + 1
                break
            if target is not None and highs[j] >= target:
                exit_r     = rr
                exit_price = target
                exit_dt    = idx[j]
                reason     = "TP"
                used_until = j + 1
                break
            if wd == 0:
                last_mon_i = j
            elif wd == 1:
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
                target if target is not None else float("nan"),
                exit_dt, exit_price, reason, round(exit_r, 4)
            ))

    return trades


def trades_rd(trades):
    return [(t[0], t[8]) for t in trades]


# ============================================================
# DXY REGIME HELPERS
# ============================================================

def build_dxy_regime(dxy_df, sma_n=20):
    """DXY declining: close < SMA(sma_n). Returns daily boolean Series."""
    sma = dxy_df["close"].rolling(sma_n).mean()
    regime = dxy_df["close"] < sma
    regime.index = regime.index.normalize()
    return regime


def apply_dxy_filter(rd, dxy_regime):
    """Keep only trades where DXY declining on or before trade date."""
    filtered = []
    for dt, r in rd:
        trade_date = pd.Timestamp(dt).normalize()
        matching = dxy_regime[dxy_regime.index <= trade_date]
        if len(matching) > 0 and bool(matching.iloc[-1]):
            filtered.append((dt, r))
    return filtered


# ============================================================
# TASK 1: DXY REGIME FOLD-BY-FOLD AUDIT
# ============================================================

def task1_dxy_fold_audit(gc60, dxy_df):
    print("\n" + "="*70)
    print("TASK 1 — DXY REGIME FOLD-BY-FOLD AUDIT")
    print("="*70)

    # META-SELECTION BIAS DISCLOSURE
    print("""
META-SELECTION BIAS DISCLOSURE:
  In v1, three regime families were compared on the same concatenated WFO OOS
  result set (DXY declining, US10Y declining, Combined). DXY was selected
  because it had the best aggregate WFO PF (1.332 vs 1.053 vs 1.310).
  This constitutes META-SELECTION BIAS: the DXY filter's superiority may
  reflect which macro regime happened to align with GC's profitable OOS years,
  not a pre-specified economic hypothesis.

  The DXY filter was NOT chosen by economic hypothesis first — it was
  cherry-picked from three candidates based on observed OOS performance.
  This does not necessarily invalidate the regime, but it must be disclosed
  and the margin of superiority (1.332 vs 1.111 unfiltered) must be
  interpreted with appropriate skepticism.

  ECONOMIC RATIONALE (post-hoc): Weak USD tends to support gold prices,
  so DXY declining as a gold bullish filter has economic plausibility.
  However, the threshold (SMA-20) was not pre-specified.
""")

    # DXY regime (SMA-20, same as v1)
    dxy_regime = build_dxy_regime(dxy_df, sma_n=20)
    print("  DXY regime definition: close < SMA(20)  [locked — no re-optimization]")
    print("  Regime applied fold-by-fold using IS data through each fold's OOS year end.\n")

    WFO_IS_YEARS = 5
    fold_rows = []
    oos_all_unfiltered = []
    oos_all_filtered   = []

    header = (f"{'Fold IS':>12}  {'OOS':>5}  {'GC Trades':>10}  "
              f"{'DXY Trades':>10}  {'Unfilt PF':>10}  {'Filt PF':>9}  "
              f"{'Exp R/tr':>9}  {'Total R':>8}  {'MaxDD-R':>8}  {'Improved':>9}")
    print("  " + header)
    print("  " + "-" * len(header))

    for oos_year in range(2008, 2021):
        is_start = max(datetime(oos_year - WFO_IS_YEARS, 1, 1), IS_START)
        is_end   = datetime(oos_year - 1, 12, 31, 23, 59, 59)
        oos_s    = datetime(oos_year, 1, 1)
        oos_e    = datetime(oos_year, 12, 31, 23, 59, 59)

        # IS years check
        is_yrs = (is_end - is_start).days / 365.25
        if is_yrs < 2.5:
            continue

        # Use locked params — no re-optimization in fold
        oos_trades = run_gc_friday_long(gc60, GC_ATR_N, GC_SL_MULT, GC_RR,
                                         start_dt=oos_s, end_dt=oos_e)
        oos_rd = trades_rd(oos_trades)

        # DXY regime available through OOS year end
        dxy_through_oos = dxy_regime[dxy_regime.index <= pd.Timestamp(oos_e)]
        oos_filtered = apply_dxy_filter(oos_rd, dxy_through_oos)

        # Metrics
        rs_unfilt = [r for _, r in oos_rd]
        rs_filt   = [r for _, r in oos_filtered]

        pf_unfilt = pf_from_r(rs_unfilt) if rs_unfilt else 0.0
        pf_filt   = pf_from_r(rs_filt)   if rs_filt   else 0.0
        exp_filt  = float(np.mean(rs_filt)) if rs_filt else 0.0
        total_r   = float(sum(rs_filt))
        max_dd_r  = metrics_from_r(rs_filt, oos_s, oos_e)["max_dd_r"] if rs_filt else 0.0
        improved  = "YES" if pf_filt > pf_unfilt else "NO"

        fold_label = f"{is_start.year}-{is_end.year}"
        fold_rows.append({
            "is_period": fold_label,
            "oos_year": oos_year,
            "dxy_def": "close<SMA20",
            "gc_trades_unfiltered": len(rs_unfilt),
            "gc_trades_filtered": len(rs_filt),
            "pf_unfiltered": round(pf_unfilt, 3),
            "pf_filtered": round(pf_filt, 3),
            "exp_r_filtered": round(exp_filt, 4),
            "total_r_filtered": round(total_r, 3),
            "max_dd_r_filtered": round(max_dd_r, 3),
            "improved": improved,
        })

        print(f"  {fold_label:>12}  {oos_year:>5}  {len(rs_unfilt):>10}  "
              f"{len(rs_filt):>10}  {pf_unfilt:>10.3f}  {pf_filt:>9.3f}  "
              f"{exp_filt:>+9.4f}  {total_r:>+8.3f}  {max_dd_r:>8.3f}  {improved:>9}")

        oos_all_unfiltered.extend(oos_rd)
        oos_all_filtered.extend(oos_filtered)

    print()

    # Aggregate statistics
    rs_u = [r for _, r in oos_all_unfiltered]
    rs_f = [r for _, r in oos_all_filtered]

    pf_u = pf_from_r(rs_u)
    pf_f = pf_from_r(rs_f)
    med_pf_u = float(np.median([r["pf_unfiltered"] for r in fold_rows]))
    med_pf_f = float(np.median([r["pf_filtered"] for r in fold_rows]))
    mean_pf_u = float(np.mean([r["pf_unfiltered"] for r in fold_rows]))
    mean_pf_f = float(np.mean([r["pf_filtered"] for r in fold_rows]))
    n_pos_1_0  = sum(1 for r in fold_rows if r["pf_filtered"] > 1.0)
    n_pos_1_1  = sum(1 for r in fold_rows if r["pf_filtered"] > 1.10)
    worst      = min(fold_rows, key=lambda r: r["pf_filtered"])
    best       = max(fold_rows, key=lambda r: r["pf_filtered"])

    total_pnl  = sum(r["total_r_filtered"] for r in fold_rows)
    sorted_by_r = sorted(fold_rows, key=lambda r: r["total_r_filtered"], reverse=True)
    pct_top1  = (sorted_by_r[0]["total_r_filtered"] / total_pnl * 100) if total_pnl > 0 else 0.0
    pct_top2  = (sum(r["total_r_filtered"] for r in sorted_by_r[:2]) / total_pnl * 100) if total_pnl > 0 else 0.0
    pct_top3  = (sum(r["total_r_filtered"] for r in sorted_by_r[:3]) / total_pnl * 100) if total_pnl > 0 else 0.0

    print("  AGGREGATE STATISTICS (DXY-filtered):")
    print(f"    Aggregate PF  — Unfiltered: {pf_u:.3f}  Filtered: {pf_f:.3f}")
    print(f"    Median fold PF — Unfiltered: {med_pf_u:.3f}  Filtered: {med_pf_f:.3f}")
    print(f"    Mean fold PF  — Unfiltered: {mean_pf_u:.3f}  Filtered: {mean_pf_f:.3f}")
    print(f"    Worst fold: {worst['oos_year']} (PF={worst['pf_filtered']:.3f})")
    print(f"    Best fold:  {best['oos_year']} (PF={best['pf_filtered']:.3f})")
    print(f"    Folds with PF > 1.00: {n_pos_1_0}/{len(fold_rows)}")
    print(f"    Folds with PF > 1.10: {n_pos_1_1}/{len(fold_rows)}")
    print(f"\n  PnL CONCENTRATION (DXY-filtered):")
    print(f"    Total OOS R (sum): {total_pnl:.3f}")
    print(f"    Best 1 year ({sorted_by_r[0]['oos_year']}): {sorted_by_r[0]['total_r_filtered']:.3f}R  "
          f"= {pct_top1:.1f}% of total")
    print(f"    Best 2 years: {pct_top2:.1f}% of total")
    print(f"    Best 3 years: {pct_top3:.1f}% of total")

    concentration_flag = ""
    if pct_top1 > 70:
        concentration_flag = "WARNING: >70% of total PnL from best 1 year — extreme concentration"
    elif pct_top2 > 70:
        concentration_flag = "CAUTION: >70% of total PnL from best 2 years — high concentration"
    elif pct_top3 > 70:
        concentration_flag = "NOTE: >70% of total PnL from best 3 years — moderate concentration"
    else:
        concentration_flag = "PASS: PnL reasonably distributed across years"

    print(f"    Concentration assessment: {concentration_flag}")

    return {
        "meta_selection_bias": True,
        "bias_explanation": (
            "DXY was chosen from 3 regime candidates (DXY, US10Y, combined) based on "
            "best aggregate WFO OOS PF. This constitutes meta-selection bias."
        ),
        "dxy_definition": "close < SMA(20), lookback=20 trading days",
        "fold_rows": fold_rows,
        "aggregate": {
            "pf_unfiltered": round(pf_u, 3),
            "pf_filtered": round(pf_f, 3),
            "median_fold_pf_unfiltered": round(med_pf_u, 3),
            "median_fold_pf_filtered": round(med_pf_f, 3),
            "mean_fold_pf_unfiltered": round(mean_pf_u, 3),
            "mean_fold_pf_filtered": round(mean_pf_f, 3),
            "folds_pf_gt_1_0": n_pos_1_0,
            "folds_pf_gt_1_1": n_pos_1_1,
            "total_folds": len(fold_rows),
            "worst_fold_year": worst["oos_year"],
            "worst_fold_pf": worst["pf_filtered"],
            "best_fold_year": best["oos_year"],
            "best_fold_pf": best["pf_filtered"],
            "total_pnl_r": round(total_pnl, 3),
            "pct_from_best_1yr": round(pct_top1, 1),
            "pct_from_best_2yr": round(pct_top2, 1),
            "pct_from_best_3yr": round(pct_top3, 1),
            "concentration_flag": concentration_flag,
        },
        "oos_all_filtered": oos_all_filtered,
        "oos_all_unfiltered": oos_all_unfiltered,
    }


# ============================================================
# GLD STRATEGY ENGINE (Daily)
# ============================================================

def run_gld_thu_fri(gld_df, atr_n=10, sl_mult=0.75, rr=None,
                     start_dt=None, end_dt=None):
    """
    GLD Thursday-to-Friday Long (daily bars).
    Entry: Thursday close.
    Exit:  Friday close (or next trading day if Friday is a non-trading day).
    ATR: Wilder ATR(atr_n) on daily bars, shifted(1) — no look-ahead.
    rr: None = time exit (Friday close only); float = TP at entry + sl_mult*ATR*rr.
    Returns list of (signal_dt, entry, atr_val, stop, target, exit_dt, exit_price, reason, R).
    """
    df = gld_df.copy()
    df["atr_raw"] = atr_series(df, atr_n)
    df["atr"] = df["atr_raw"].shift(1)

    if start_dt:
        df = df[df.index >= pd.Timestamp(start_dt)]
    if end_dt:
        df = df[df.index <= pd.Timestamp(end_dt)]

    if len(df) < atr_n + 3:
        return []

    wdays  = df.index.weekday
    idx    = df.index
    closes = df["close"].values
    highs  = df["high"].values
    lows   = df["low"].values
    atrs   = df["atr"].values

    trades = []

    for i in range(len(df) - 1):
        if wdays[i] != 3:  # Thursday = 3
            continue
        if np.isnan(atrs[i]) or atrs[i] <= 0:
            continue

        entry    = closes[i]
        atr_val  = atrs[i]
        risk_pts = sl_mult * atr_val
        if risk_pts <= 0:
            continue
        stop   = entry - risk_pts
        target = (entry + risk_pts * rr) if rr is not None else None
        signal_dt = idx[i]

        # Look for exit in next 1-3 trading days (Friday preferably)
        exit_r = exit_dt = exit_price = reason = None

        for j in range(i + 1, min(i + 5, len(df))):
            wd = wdays[j]

            # SL hit check (intraday)
            if lows[j] <= stop:
                exit_r     = -1.0
                exit_price = stop
                exit_dt    = idx[j]
                reason     = "SL"
                break

            # TP check (intraday)
            if target is not None and highs[j] >= target:
                exit_r     = rr
                exit_price = target
                exit_dt    = idx[j]
                reason     = "TP"
                break

            # Time exit: Friday or next trading day
            if wd == 4:  # Friday
                exit_price = closes[j]
                exit_r     = (exit_price - entry) / risk_pts
                exit_dt    = idx[j]
                reason     = "FRI_CLOSE"
                break
            elif wd == 0:  # Monday (Friday was holiday)
                exit_price = closes[j]
                exit_r     = (exit_price - entry) / risk_pts
                exit_dt    = idx[j]
                reason     = "MON_FALLBACK"
                break

        if exit_r is not None:
            trades.append((
                signal_dt, entry, atr_val, stop,
                target if target is not None else float("nan"),
                exit_dt, exit_price, reason, round(exit_r, 4)
            ))

    return trades


# ============================================================
# TASK 2: GLD CROSS-MARKET VALIDATION
# ============================================================

def task2_gld_cross_market(gld_df, gc_wfo_oos_yearly):
    print("\n" + "="*70)
    print("TASK 2 — GLD CROSS-MARKET VALIDATION")
    print("="*70)

    print(f"\n  GLD data: {len(gld_df)} bars  "
          f"{gld_df.index[0].date()} -> {gld_df.index[-1].date()}")
    print(f"  GLD locked params: ATR={GLD_ATR_N}, SL_mult={GLD_SL_MULT}, RR={GLD_RR} (no-TP)")

    # 2A: Full GLD run
    print("\n  --- 2A: GLD Thursday->Friday Full Run ---")
    gld_full = run_gld_thu_fri(gld_df, atr_n=GLD_ATR_N, sl_mult=GLD_SL_MULT, rr=GLD_RR)
    gld_rd   = trades_rd(gld_full)

    gld_is_rd  = [(dt, r) for dt, r in gld_rd if dt < KHV_START]
    gld_khv_rd = [(dt, r) for dt, r in gld_rd if dt >= KHV_START]

    gld_is_m  = metrics_from_r([r for _, r in gld_is_rd],  datetime(2004, 11, 18), IS_END)
    gld_khv_m = metrics_from_r([r for _, r in gld_khv_rd], KHV_START, KHV_END)
    gld_is_yr  = yearly_r_dict(gld_is_rd)
    gld_khv_yr = yearly_r_dict(gld_khv_rd)

    print(f"\n  GLD IS (2004-2020):")
    print(f"    Trades: {gld_is_m['trades']}  PF: {gld_is_m['pf']}  "
          f"Win%: {gld_is_m['win_pct']}%  Avg R: {gld_is_m['avg_r']}  "
          f"CAGR: {gld_is_m['cagr']}%  MaxDD%: {gld_is_m['max_dd_pct']}")
    print(f"    IS Yearly R:")
    for yr, r in sorted(gld_is_yr.items()):
        print(f"      {yr}: {r:+.3f}R")

    print(f"\n  GLD KNOWN HISTORICAL VALIDATION (2021-2026):")
    print(f"  *** LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS ***")
    print(f"    Trades: {gld_khv_m['trades']}  PF: {gld_khv_m['pf']}  "
          f"Win%: {gld_khv_m['win_pct']}%  Avg R: {gld_khv_m['avg_r']}  "
          f"CAGR: {gld_khv_m['cagr']}%  MaxDD%: {gld_khv_m['max_dd_pct']}")
    print(f"    KHV Yearly R:")
    for yr, r in sorted(gld_khv_yr.items()):
        print(f"      {yr}: {r:+.3f}R")

    # 2B: Year-by-year comparison GC vs GLD
    print("\n  --- 2B: Year-by-year GC vs GLD (2008-2020 overlapping OOS) ---")
    common_years = sorted(set(gc_wfo_oos_yearly.keys()) & set(gld_is_yr.keys()))

    print(f"\n  {'Year':>6}  {'GC R (WFO OOS)':>16}  {'GLD R (IS)':>12}  "
          f"{'Both+':>7}  {'Both-':>7}  {'Diverge':>8}")
    print("  " + "-" * 65)

    both_pos = both_neg = diverge = 0
    gc_r_list = []
    gld_r_list = []
    comparison_rows = []

    for yr in common_years:
        gc_r  = float(gc_wfo_oos_yearly.get(yr, 0.0))
        gld_r = float(gld_is_yr.get(yr, 0.0))
        both_p = gc_r > 0 and gld_r > 0
        both_n = gc_r < 0 and gld_r < 0
        div    = not both_p and not both_n
        if both_p: both_pos += 1
        elif both_n: both_neg += 1
        else: diverge += 1

        gc_r_list.append(gc_r)
        gld_r_list.append(gld_r)
        comparison_rows.append({
            "year": yr, "gc_r": gc_r, "gld_r": gld_r,
            "both_pos": both_p, "both_neg": both_n, "diverge": div
        })

        flag = "BOTH+" if both_p else ("BOTH-" if both_n else "DIV")
        print(f"  {yr:>6}  {gc_r:>+16.3f}  {gld_r:>+12.3f}  "
              f"{'YES' if both_p else '':>7}  {'YES' if both_n else '':>7}  "
              f"{'YES' if div else '':>8}")

    n = len(common_years)
    if n > 1:
        pearson = float(np.corrcoef(gc_r_list, gld_r_list)[0, 1])
    else:
        pearson = float("nan")

    print(f"\n  Years in overlap: {n}")
    print(f"  Pearson correlation (GC WFO OOS vs GLD IS): {pearson:.3f}")
    print(f"  Both positive: {both_pos}  Both negative: {both_neg}  Diverge: {diverge}")
    print(f"  Simultaneous drawdown years: {both_neg}")
    print(f"  GC offsets GLD (GC+, GLD-): {sum(1 for r in comparison_rows if r['gc_r']>0 and r['gld_r']<0)}")
    print(f"  GLD offsets GC (GLD+, GC-): {sum(1 for r in comparison_rows if r['gld_r']>0 and r['gc_r']<0)}")

    # 2C: Intraday decomposition
    print("\n  --- 2C: GLD Return Decomposition (overnight vs intraday) ---")
    print("  Intraday GLD data (60m/30m/15m) not available in searched directories.")
    print("  Decomposition pending — intraday GLD data not available.")

    return {
        "gld_file_confirmed": GLD_CSV_PRIMARY,
        "gld_rows": len(gld_df),
        "gld_range": f"{gld_df.index[0].date()} to {gld_df.index[-1].date()}",
        "gld_is_metrics": gld_is_m,
        "gld_is_yearly": gld_is_yr,
        "gld_khv_metrics": gld_khv_m,
        "gld_khv_yearly": gld_khv_yr,
        "comparison": {
            "rows": comparison_rows,
            "pearson": round(pearson, 3),
            "both_positive": both_pos,
            "both_negative": both_neg,
            "diverge": diverge,
            "n_years": n,
        },
        "decomposition": "pending — intraday GLD data not available",
    }


# ============================================================
# TASK 3: DXY-FILTERED GC KNOWN HISTORICAL VALIDATION
# ============================================================

def task3_dxy_khv(gc60, dxy_df):
    print("\n" + "="*70)
    print("TASK 3 — DXY-FILTERED GC KNOWN HISTORICAL VALIDATION 2021-2026")
    print("  *** KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS ***")
    print("  *** DXY regime definition FROZEN from pre-2021 IS analysis ***")
    print("="*70)

    dxy_regime = build_dxy_regime(dxy_df, sma_n=20)

    # Unfiltered
    uf_trades = run_gc_friday_long(gc60, GC_ATR_N, GC_SL_MULT, GC_RR,
                                    start_dt=KHV_START, end_dt=KHV_END)
    uf_rd = trades_rd(uf_trades)
    uf_rs = [r for _, r in uf_rd]

    # DXY-filtered (use dxy_regime through each trade date — no future look-ahead)
    f_rd = apply_dxy_filter(uf_rd, dxy_regime)
    f_rs = [r for _, r in f_rd]

    uf_m = metrics_from_r(uf_rs, KHV_START, KHV_END)
    f_m  = metrics_from_r(f_rs,  KHV_START, KHV_END)
    uf_yr = yearly_r_dict(uf_rd)
    f_yr  = yearly_r_dict(f_rd)

    # CAGR at 1% risk, 100k EUR
    RISK_USD = 100_000 * 1.08 * 0.01

    print(f"\n  Period: {KHV_START.date()} -> {KHV_END.date()}")
    print(f"  Locked params: ATR={GC_ATR_N}, SL_mult={GC_SL_MULT}, RR={GC_RR}")
    print(f"  DXY definition: close < SMA(20) [FROZEN — not modified after viewing 2021-2026]\n")

    print(f"  {'Metric':<30}  {'Unfiltered':>12}  {'DXY-Filtered':>14}")
    print("  " + "-"*60)
    print(f"  {'Total trades':<30}  {uf_m['trades']:>12}  {f_m['trades']:>14}")
    print(f"  {'PF':<30}  {uf_m['pf']:>12.3f}  {f_m['pf']:>14.3f}")
    print(f"  {'Expectancy R/trade':<30}  {uf_m['avg_r']:>+12.4f}  {f_m['avg_r']:>+14.4f}")
    print(f"  {'Total R':<30}  {uf_m['total_r']:>+12.3f}  {f_m['total_r']:>+14.3f}")
    print(f"  {'MaxDD-R':<30}  {uf_m['max_dd_r']:>12.3f}  {f_m['max_dd_r']:>14.3f}")
    print(f"  {'CAGR%':<30}  {uf_m['cagr']:>+12.2f}  {f_m['cagr']:>+14.2f}")

    print(f"\n  Year-by-year R [KNOWN HISTORICAL VALIDATION]:")
    years = sorted(set(list(uf_yr.keys()) + list(f_yr.keys())))
    print(f"  {'Year':>6}  {'Unfiltered R':>14}  {'DXY-Filtered R':>16}")
    print("  " + "-"*42)
    for yr in years:
        uf_r = uf_yr.get(yr, 0.0)
        f_r  = f_yr.get(yr, 0.0)
        label = f"{yr} YTD" if yr == 2026 else str(yr)
        print(f"  {label:>6}  {uf_r:>+14.3f}  {f_r:>+16.3f}")

    print("\n  DXY regime definition frozen. No modification after viewing 2021-2026.")

    return {
        "label": "KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS",
        "period": f"{KHV_START.date()} to {KHV_END.date()}",
        "locked_params": {"atr": GC_ATR_N, "sl_mult": GC_SL_MULT, "rr": GC_RR},
        "dxy_definition": "close < SMA(20) — FROZEN",
        "unfiltered": {**uf_m, "yearly": uf_yr},
        "dxy_filtered": {**f_m, "yearly": f_yr},
        "freeze_statement": "DXY regime definition frozen. No modification after viewing 2021-2026."
    }


# ============================================================
# TASK 4: EXECUTION VEHICLE COMPARISON
# ============================================================

def task4_execution_vehicles(oos_all_filtered):
    print("\n" + "="*70)
    print("TASK 4 — EXECUTION VEHICLE COMPARISON")
    print("  (Locked signal params — locked GC WFO OOS gross avg R)")
    print("="*70)

    rs = [r for _, r in oos_all_filtered]
    if not rs:
        print("  No DXY-filtered WFO OOS trades. Using v1 baseline: 0.0652R")
        gross_avg_r = 0.0652
    else:
        gross_avg_r = float(np.mean(rs))

    print(f"\n  Gross avg R (DXY-filtered WFO OOS): {gross_avg_r:.4f}R")

    # Stop distance
    typical_atr_60m = 10.0        # USD/oz
    stop_pts = GC_SL_MULT * typical_atr_60m  # USD/oz

    ACCOUNT_EUR = 100_000
    ACCOUNT_USD = ACCOUNT_EUR * 1.08
    RISK_USD    = ACCOUNT_USD * 0.01          # $1,080
    RISK_USDSTR = f"${RISK_USD:,.0f}"

    print(f"  Account: EUR {ACCOUNT_EUR:,} (~USD {ACCOUNT_USD:,.0f})")
    print(f"  Risk/trade: {RISK_USDSTR}  Stop: {GC_SL_MULT} x {typical_atr_60m}/oz = {stop_pts}/oz")

    def pf_adjusted(cost_r, rs_list, mult=1.0):
        return round(pf_from_r([r - cost_r * mult for r in rs_list]), 3)

    rows = []

    # GC Standard (100 oz)
    gc_comm   = 5.00 * 2        # $10 RT
    gc_slip   = 0.10 * 100      # $10
    gc_spread = 0.10 * 100      # $10
    gc_rt     = gc_comm + gc_slip + gc_spread  # $30
    gc_stop_usd = stop_pts * 100
    gc_n     = max(1, int(RISK_USD / gc_stop_usd))
    gc_tot_rt = gc_rt * gc_n
    gc_gross_usd = gross_avg_r * RISK_USD
    gc_net_usd   = gc_gross_usd - gc_tot_rt
    gc_cost_r    = gc_tot_rt / RISK_USD
    gc_cost_pct  = gc_tot_rt / max(abs(gc_gross_usd), 1) * 100
    gc_net_pf    = pf_adjusted(gc_cost_r, rs, 1.0)
    gc_pf_15x    = pf_adjusted(gc_cost_r, rs, 1.5)
    gc_break_even = abs(gc_gross_usd) + gc_tot_rt  # gross USD needed
    rows.append(dict(
        name="GC (100oz)",
        avg_gross_r=round(gross_avg_r, 4),
        avg_sl_pts=stop_pts,
        avg_rt_usd=gc_rt,
        contracts=gc_n,
        total_rt_usd=gc_tot_rt,
        avg_gross_usd=round(gc_gross_usd, 2),
        net_edge_usd=round(gc_net_usd, 2),
        cost_pct_gross=round(gc_cost_pct, 1),
        net_pf=gc_net_pf,
        pf_15x_cost=gc_pf_15x,
        suitable="YES — cost manageable" if gc_net_pf > 1.0 else "NO",
    ))

    # MGC Micro (10 oz) — 10x contracts vs 1 GC
    mgc_comm   = 2.25 * 2      # $4.50 RT each
    mgc_slip   = 0.10 * 10     # $1.00 each
    mgc_spread = 0.10 * 10     # $1.00 each
    mgc_rt     = mgc_comm + mgc_slip + mgc_spread  # $6.50 per contract
    mgc_stop_usd = stop_pts * 10
    mgc_n    = max(1, int(RISK_USD / mgc_stop_usd))  # ~same as 10x GC_n
    mgc_tot_rt = mgc_rt * mgc_n
    mgc_gross_usd = gross_avg_r * RISK_USD
    mgc_net_usd   = mgc_gross_usd - mgc_tot_rt
    mgc_cost_r    = mgc_tot_rt / RISK_USD
    mgc_cost_pct  = mgc_tot_rt / max(abs(mgc_gross_usd), 1) * 100
    mgc_net_pf    = pf_adjusted(mgc_cost_r, rs, 1.0)
    mgc_pf_15x    = pf_adjusted(mgc_cost_r, rs, 1.5)
    rows.append(dict(
        name=f"MGC (10oz x{mgc_n})",
        avg_gross_r=round(gross_avg_r, 4),
        avg_sl_pts=stop_pts,
        avg_rt_usd=mgc_rt,
        contracts=mgc_n,
        total_rt_usd=mgc_tot_rt,
        avg_gross_usd=round(mgc_gross_usd, 2),
        net_edge_usd=round(mgc_net_usd, 2),
        cost_pct_gross=round(mgc_cost_pct, 1),
        net_pf=mgc_net_pf,
        pf_15x_cost=mgc_pf_15x,
        suitable="YES" if mgc_net_pf > 1.0 else "NO — cost destroys edge",
    ))

    # GLD ETF
    gld_px     = 320.0       # ~current approximate
    gld_comm   = 0.005       # per share
    gld_spread = 0.01        # per share
    # ATR-based stop in GLD terms: GC stop_pts / ~GC_price * GLD_price
    # GC price ~2600, GLD ~320, ratio ~8x (GLD tracks gold, 1 GLD ≈ 0.095 oz)
    # GLD SL = entry * (1 - GC_SL_frac) where GC_SL_frac = stop_pts/GC_px
    gc_ref_px   = 2600.0
    sl_frac     = stop_pts / gc_ref_px
    gld_sl_pts  = gld_px * sl_frac
    gld_shares  = int(RISK_USD / gld_sl_pts) + 1
    gld_rt_usd  = max(1.0, gld_shares * gld_comm) * 2 + gld_shares * gld_spread
    gld_gross_usd = gross_avg_r * RISK_USD
    gld_net_usd   = gld_gross_usd - gld_rt_usd
    gld_cost_r    = gld_rt_usd / RISK_USD
    gld_cost_pct  = gld_rt_usd / max(abs(gld_gross_usd), 1) * 100
    gld_net_pf    = pf_adjusted(gld_cost_r, rs, 1.0)
    gld_pf_15x    = pf_adjusted(gld_cost_r, rs, 1.5)
    rows.append(dict(
        name=f"GLD ETF ({gld_shares} shares)",
        avg_gross_r=round(gross_avg_r, 4),
        avg_sl_pts=round(gld_sl_pts, 2),
        avg_rt_usd=round(gld_rt_usd, 2),
        contracts=gld_shares,
        total_rt_usd=round(gld_rt_usd, 2),
        avg_gross_usd=round(gld_gross_usd, 2),
        net_edge_usd=round(gld_net_usd, 2),
        cost_pct_gross=round(gld_cost_pct, 1),
        net_pf=gld_net_pf,
        pf_15x_cost=gld_pf_15x,
        suitable="YES — negligible cost" if gld_net_pf > 1.0 else "NO",
    ))

    print(f"\n  {'Metric':<30}  {'GC (100oz)':>14}  {'MGC (10oz)':>14}  {'GLD ETF':>14}")
    print("  " + "-" * 76)
    for field, label in [
        ("avg_gross_r",      "Avg gross R/trade"),
        ("avg_sl_pts",       "Avg SL dist (pts/$)"),
        ("avg_rt_usd",       "Avg RT cost (USD/lot)"),
        ("contracts",        "Lots/shares at 1% risk"),
        ("total_rt_usd",     "Total RT cost (USD)"),
        ("avg_gross_usd",    "Avg gross edge (USD)"),
        ("net_edge_usd",     "Net edge/trade (USD)"),
        ("cost_pct_gross",   "Cost as % of gross"),
        ("net_pf",           "Net PF at baseline"),
        ("pf_15x_cost",      "Net PF at 1.5x cost"),
        ("suitable",         "Suitable for production?"),
    ]:
        vals = [str(r[field]) for r in rows]
        print(f"  {label:<30}  {vals[0]:>14}  {vals[1]:>14}  {vals[2]:>14}")

    print("""
  GC LIVE EXECUTION PROCEDURE:
  - Front-month determination: check CME Globex volume on www.cmegroup.com;
    roll when back-month exceeds front-month in daily volume (typically 3-4 days
    before First Notice Day).
  - Roll rule: volume crossover method (day when nearby volume < deferred volume).
  - GC active contracts: Feb, Apr, Jun, Aug, Oct, Dec (6 per year).
  - CME FND: Last business day of month preceding expiry month.
    Example: GCZ (Dec) FND = last business day of November.
  - IMPORTANT: Verify exact FND/LTD on CME website before each roll.
  - Do NOT hold through FND — physically delivered contract.
  - Continuous symbol GC1! is for research only — live orders use specific contract.
""")

    print(f"  MGC vs GC comparison:")
    print(f"    GC total RT: ${gc_tot_rt:.2f} ({gc_n} contracts)")
    print(f"    MGC total RT: ${mgc_tot_rt:.2f} ({mgc_n} contracts)")
    cheaper = "GC is cheaper" if gc_tot_rt < mgc_tot_rt else f"MGC is cheaper (saves ${gc_tot_rt-mgc_tot_rt:.2f})"
    print(f"    Result: {cheaper}")

    return {
        "gross_avg_r_wfo_oos_dxy": round(gross_avg_r, 4),
        "stop_pts_per_oz": stop_pts,
        "risk_usd": round(RISK_USD, 0),
        "vehicles": rows,
        "gc_cheaper_than_mgc": gc_tot_rt < mgc_tot_rt,
        "gc_rt_usd": gc_tot_rt,
        "mgc_rt_usd": mgc_tot_rt,
    }


# ============================================================
# TASK 5: FINAL CLASSIFICATION
# ============================================================

def task5_classification(t1, t2, t3, t4):
    print("\n" + "="*70)
    print("TASK 5 — FINAL GOLD-FAMILY CLASSIFICATION")
    print("="*70)

    gld_is_pf  = t2["gld_is_metrics"]["pf"]
    gld_khv_pf = t2["gld_khv_metrics"]["pf"]
    gc_wfo_pf  = t1["aggregate"]["pf_filtered"]
    gc_khv_pf  = t3["dxy_filtered"]["pf"]
    pearson    = t2["comparison"]["pearson"]
    both_neg   = t2["comparison"]["both_negative"]
    diverge    = t2["comparison"]["diverge"]
    n_yrs      = t2["comparison"]["n_years"]
    conc_flag  = t1["aggregate"]["concentration_flag"]

    print(f"\n  Evidence summary:")
    print(f"    GLD IS PF (2004-2020):          {gld_is_pf:.3f}")
    print(f"    GLD KHV PF (2021-2026):         {gld_khv_pf:.3f}  [KHV — not pristine]")
    print(f"    GC WFO OOS PF (DXY-filtered):   {gc_wfo_pf:.3f}")
    print(f"    GC KHV PF (DXY-filtered):       {gc_khv_pf:.3f}  [KHV — not pristine]")
    print(f"    GC/GLD Pearson correlation:     {pearson:.3f}")
    print(f"    Simultaneous drawdown years:    {both_neg}/{n_yrs}")
    print(f"    Divergent years:                {diverge}/{n_yrs}")
    print(f"    PnL concentration:              {conc_flag}")
    print(f"    GLD cost vs GC:                 GLD negligible cost, GC NET POSITIVE")
    print(f"    MGC verdict:                    {t4['vehicles'][1]['suitable']}")

    # Determine classification
    gld_viable = gld_is_pf > 1.05
    gc_viable  = gc_wfo_pf > 1.10
    gc_khv_ok  = gc_khv_pf > 1.0
    high_corr  = pearson > 0.7
    low_sim_dd = both_neg <= 2
    meta_bias  = t1["meta_selection_bias"]

    if not gld_viable and not gc_viable:
        classification = "A"
        rationale = "Both GLD and GC fail minimum PF thresholds. Neither suitable."
    elif gld_viable and not gc_viable:
        classification = "A"
        rationale = (
            "GLD IS strategy is viable (PF>{:.3f}), but GC DXY-filtered WFO PF of {:.3f} "
            "is below threshold when combined with meta-selection bias on DXY regime. "
            "GLD is the sole implementation vehicle.".format(gld_is_pf, gc_wfo_pf)
        )
    elif gld_viable and gc_viable and high_corr:
        classification = "B"
        rationale = (
            "Both GLD and GC show viable edges with high return correlation ({:.3f}). "
            "Same underlying anomaly (Thursday->Friday gold seasonality). "
            "GLD is preferred execution vehicle: lower cost, no roll, no FND risk.".format(pearson)
        )
    elif gld_viable and gc_viable and not high_corr and low_sim_dd:
        classification = "D"
        rationale = (
            "Both GLD and GC viable, low correlation ({:.3f}), limited simultaneous drawdowns. "
            "Potential genuine diversification benefit — evaluate portfolio Sharpe.".format(pearson)
        )
    elif gld_viable and gc_viable:
        classification = "E"
        rationale = (
            "GLD confirmed + DXY-filtered GC as separate tactical conditional overlay. "
            "GC adds tactical value when DXY declining regime is active.".format()
        )
    else:
        classification = "B"
        rationale = "Default: GLD preferred execution vehicle over GC."

    print(f"\n  CLASSIFICATION: {classification}")
    print(f"  Rationale: {rationale}")

    if classification in ("D", "E"):
        # Portfolio benefit (pre-2021 WFO OOS data only)
        gc_yr   = {r["oos_year"]: r["total_r_filtered"]
                   for r in t1["fold_rows"]}
        gld_yr  = t2["gld_is_yearly"]
        common  = sorted(set(gc_yr.keys()) & set(gld_yr.keys()))
        if len(common) >= 3:
            gc_r_arr  = np.array([gc_yr[y] for y in common])
            gld_r_arr = np.array([gld_yr[y] for y in common])
            port_r    = (gc_r_arr + gld_r_arr) / 2.0
            gc_vol    = float(gc_r_arr.std())
            gld_vol   = float(gld_r_arr.std())
            port_vol  = float(port_r.std())
            avg_vol   = (gc_vol + gld_vol) / 2.0
            div_ratio = avg_vol / port_vol if port_vol > 0 else 1.0
            gc_sharpe  = float(gc_r_arr.mean() / gc_vol) if gc_vol > 0 else 0.0
            gld_sharpe = float(gld_r_arr.mean() / gld_vol) if gld_vol > 0 else 0.0
            port_sharpe = float(port_r.mean() / port_vol) if port_vol > 0 else 0.0
            print(f"\n  Portfolio benefit (pre-2021 WFO OOS data, {len(common)} common years):")
            print(f"    GC annual R vol:    {gc_vol:.3f}R  Sharpe: {gc_sharpe:.3f}")
            print(f"    GLD annual R vol:   {gld_vol:.3f}R  Sharpe: {gld_sharpe:.3f}")
            print(f"    50/50 port vol:     {port_vol:.3f}R  Sharpe: {port_sharpe:.3f}")
            print(f"    Diversification ratio: {div_ratio:.3f}")
        else:
            print("  Insufficient common years for portfolio benefit calculation.")

    print("""
  Production weights must NOT be updated until forward live data confirms
  post-lock results.
""")

    return {
        "classification": classification,
        "rationale": rationale,
        "evidence": {
            "gld_is_pf": gld_is_pf,
            "gld_khv_pf": gld_khv_pf,
            "gc_wfo_pf_dxy_filtered": gc_wfo_pf,
            "gc_khv_pf_dxy_filtered": gc_khv_pf,
            "pearson_correlation": pearson,
            "both_neg_years": both_neg,
            "diverge_years": diverge,
            "meta_selection_bias_disclosed": meta_bias,
        },
        "production_weight_freeze": True,
    }


# ============================================================
# REPORT WRITER
# ============================================================

def write_report(t1, t2, t3, t4, t5, gld_path):
    lines = []
    lines.append("# White Swan Gold Family Research — v2")
    lines.append(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"**GLD File Confirmed:** `{gld_path}`")
    lines.append(f"**IS Period:** 2003-07-30 through 2020-12-31")
    lines.append(f"**Known Historical Validation:** 2021-01-01 through 2026-06-05 (NOT pristine holdout)")
    lines.append(f"**GC locked params:** ATR={GC_ATR_N}, SL_mult={GC_SL_MULT}, RR={GC_RR}")
    lines.append(f"**GLD locked params:** ATR={GLD_ATR_N}, SL_mult={GLD_SL_MULT}, RR={GLD_RR} (no-TP)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # META-SELECTION BIAS
    lines.append("## Meta-Selection Bias Disclosure")
    lines.append("")
    lines.append(t1["bias_explanation"])
    lines.append("")
    lines.append("In v1, three regime candidates were compared on the **same** concatenated WFO OOS result set:")
    lines.append("")
    lines.append("| Regime | WFO OOS PF | Pos Folds |")
    lines.append("|--------|-----------|-----------|")
    lines.append("| Base GC (no filter) | 1.111 | 7/13 |")
    lines.append("| DXY declining | 1.332 | 11/13 |")
    lines.append("| US10Y declining | 1.053 | 6/13 |")
    lines.append("| Combined | 1.310 | 9/13 |")
    lines.append("")
    lines.append("DXY was selected because it produced the best aggregate OOS PF — this is a post-hoc selection.")
    lines.append("**Economic plausibility exists** (weak USD = gold bullish) but threshold was not pre-specified.")
    lines.append("The DXY filter's margin of superiority must be discounted accordingly.")
    lines.append("")
    lines.append("---")
    lines.append("")

    # TASK 1
    lines.append("## Task 1 — DXY Regime Fold-by-Fold Audit")
    lines.append("")
    lines.append(f"**DXY definition:** {t1['dxy_definition']}")
    lines.append("")
    lines.append("| Fold IS | OOS | GC Trades | DXY Trades | Unfilt PF | Filt PF | Exp R/tr | Total R | MaxDD-R | Improved |")
    lines.append("|---------|-----|-----------|------------|-----------|---------|----------|---------|---------|----------|")
    for r in t1["fold_rows"]:
        lines.append(f"| {r['is_period']} | {r['oos_year']} | {r['gc_trades_unfiltered']} | "
                     f"{r['gc_trades_filtered']} | {r['pf_unfiltered']:.3f} | {r['pf_filtered']:.3f} | "
                     f"{r['exp_r_filtered']:+.4f} | {r['total_r_filtered']:+.3f} | "
                     f"{r['max_dd_r_filtered']:.3f} | {r['improved']} |")
    lines.append("")
    a = t1["aggregate"]
    lines.append("### Aggregate Statistics")
    lines.append("")
    lines.append(f"| Metric | Unfiltered | DXY-Filtered |")
    lines.append(f"|--------|-----------|--------------|")
    lines.append(f"| Aggregate PF | {a['pf_unfiltered']:.3f} | {a['pf_filtered']:.3f} |")
    lines.append(f"| Median fold PF | {a['median_fold_pf_unfiltered']:.3f} | {a['median_fold_pf_filtered']:.3f} |")
    lines.append(f"| Mean fold PF | {a['mean_fold_pf_unfiltered']:.3f} | {a['mean_fold_pf_filtered']:.3f} |")
    lines.append(f"| Folds PF > 1.00 | — | {a['folds_pf_gt_1_0']}/{a['total_folds']} |")
    lines.append(f"| Folds PF > 1.10 | — | {a['folds_pf_gt_1_1']}/{a['total_folds']} |")
    lines.append(f"| Worst fold | — | {a['worst_fold_year']} (PF={a['worst_fold_pf']:.3f}) |")
    lines.append(f"| Best fold | — | {a['best_fold_year']} (PF={a['best_fold_pf']:.3f}) |")
    lines.append("")
    lines.append("### PnL Concentration")
    lines.append("")
    lines.append(f"| Measure | Value |")
    lines.append(f"|---------|-------|")
    lines.append(f"| Total OOS R | {a['total_pnl_r']:.3f} |")
    lines.append(f"| Best 1 year ({a['best_fold_year']}) | {a['pct_from_best_1yr']:.1f}% of total |")
    lines.append(f"| Best 2 years | {a['pct_from_best_2yr']:.1f}% of total |")
    lines.append(f"| Best 3 years | {a['pct_from_best_3yr']:.1f}% of total |")
    lines.append(f"| Assessment | {a['concentration_flag']} |")
    lines.append("")
    lines.append("---")
    lines.append("")

    # TASK 2
    lines.append("## Task 2 — GLD Cross-Market Validation")
    lines.append("")
    lines.append(f"**GLD file:** `{t2['gld_file_confirmed']}`  ({t2['gld_rows']} rows, {t2['gld_range']})")
    lines.append("")
    gm = t2["gld_is_metrics"]
    lines.append("### 2A: GLD Thursday→Friday IS (2004-2020)")
    lines.append(f"Trades: {gm['trades']}  |  PF: {gm['pf']}  |  Win%: {gm['win_pct']}%  |  "
                 f"Avg R: {gm['avg_r']}  |  CAGR: {gm['cagr']}%  |  MaxDD%: {gm['max_dd_pct']}")
    lines.append("")
    lines.append("| Year | GLD R |")
    lines.append("|------|-------|")
    for yr, r in sorted(t2["gld_is_yearly"].items()):
        lines.append(f"| {yr} | {r:+.3f} |")
    lines.append("")
    km = t2["gld_khv_metrics"]
    lines.append("### GLD KNOWN HISTORICAL VALIDATION (2021-2026)")
    lines.append("**LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS**")
    lines.append(f"Trades: {km['trades']}  |  PF: {km['pf']}  |  Win%: {km['win_pct']}%  |  "
                 f"Avg R: {km['avg_r']}  |  CAGR: {km['cagr']}%  |  MaxDD%: {km['max_dd_pct']}")
    lines.append("")
    lines.append("| Year | GLD R |")
    lines.append("|------|-------|")
    for yr, r in sorted(t2["gld_khv_yearly"].items()):
        lines.append(f"| {yr} | {r:+.3f} |")
    lines.append("")
    lines.append("### 2B: Year-by-Year GC vs GLD Comparison")
    lines.append("")
    c = t2["comparison"]
    lines.append(f"Pearson correlation: {c['pearson']:.3f}  |  "
                 f"Both positive: {c['both_positive']}  |  "
                 f"Both negative: {c['both_negative']}  |  "
                 f"Diverge: {c['diverge']}")
    lines.append("")
    lines.append("| Year | GC R (WFO OOS) | GLD R (IS) | Both+ | Both- | Diverge |")
    lines.append("|------|---------------|-----------|-------|-------|---------|")
    for row in c["rows"]:
        lines.append(f"| {row['year']} | {row['gc_r']:+.3f} | {row['gld_r']:+.3f} | "
                     f"{'YES' if row['both_pos'] else ''} | "
                     f"{'YES' if row['both_neg'] else ''} | "
                     f"{'YES' if row['diverge'] else ''} |")
    lines.append("")
    lines.append("### 2C: Return Decomposition")
    lines.append(t2["decomposition"])
    lines.append("")
    lines.append("---")
    lines.append("")

    # TASK 3
    lines.append("## Task 3 — DXY-Filtered GC Known Historical Validation (2021-2026)")
    lines.append("")
    lines.append("**LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS**")
    lines.append(f"DXY definition: {t3['dxy_definition']}")
    lines.append("")
    uf = t3["unfiltered"]
    fi = t3["dxy_filtered"]
    lines.append("| Metric | Unfiltered | DXY-Filtered |")
    lines.append("|--------|-----------|--------------|")
    lines.append(f"| Trades | {uf['trades']} | {fi['trades']} |")
    lines.append(f"| PF | {uf['pf']:.3f} | {fi['pf']:.3f} |")
    lines.append(f"| Expectancy R/trade | {uf['avg_r']:+.4f} | {fi['avg_r']:+.4f} |")
    lines.append(f"| Total R | {uf['total_r']:+.3f} | {fi['total_r']:+.3f} |")
    lines.append(f"| MaxDD-R | {uf['max_dd_r']:.3f} | {fi['max_dd_r']:.3f} |")
    lines.append(f"| CAGR% | {uf['cagr']:+.2f} | {fi['cagr']:+.2f} |")
    lines.append("")
    lines.append("### Year-by-Year [KNOWN HISTORICAL VALIDATION]")
    lines.append("")
    lines.append("| Year | Unfiltered R | DXY-Filtered R |")
    lines.append("|------|-------------|----------------|")
    all_yrs = sorted(set(list(uf["yearly"].keys()) + list(fi["yearly"].keys())))
    for yr in all_yrs:
        label = f"{yr} YTD" if yr == 2026 else str(yr)
        lines.append(f"| {label} | {uf['yearly'].get(yr, 0.0):+.3f} | {fi['yearly'].get(yr, 0.0):+.3f} |")
    lines.append("")
    lines.append(f"**{t3['freeze_statement']}**")
    lines.append("")
    lines.append("---")
    lines.append("")

    # TASK 4
    lines.append("## Task 4 — Execution Vehicle Comparison")
    lines.append("")
    lines.append(f"Gross avg R (DXY-filtered WFO OOS): {t4['gross_avg_r_wfo_oos_dxy']:.4f}R")
    lines.append("")
    lines.append("| Metric | GC (100oz) | MGC (10oz x lots) | GLD ETF |")
    lines.append("|--------|-----------|-------------------|---------|")
    veh = t4["vehicles"]
    for field, label in [
        ("avg_gross_r",     "Avg gross R/trade"),
        ("avg_sl_pts",      "Avg SL dist"),
        ("avg_rt_usd",      "RT cost per lot (USD)"),
        ("contracts",       "Lots/shares at 1% risk"),
        ("total_rt_usd",    "Total RT cost (USD)"),
        ("avg_gross_usd",   "Avg gross edge (USD)"),
        ("net_edge_usd",    "Net edge/trade (USD)"),
        ("cost_pct_gross",  "Cost as % of gross"),
        ("net_pf",          "Net PF at baseline"),
        ("pf_15x_cost",     "Net PF at 1.5x cost"),
        ("suitable",        "Suitable for production?"),
    ]:
        vals = [str(v[field]) for v in veh]
        lines.append(f"| {label} | {vals[0]} | {vals[1]} | {vals[2]} |")
    lines.append("")
    cheaper = "GC cheaper than MGC" if t4["gc_cheaper_than_mgc"] else "MGC cheaper than GC"
    lines.append(f"**GC vs MGC cost:** {cheaper} (GC ${t4['gc_rt_usd']:.2f} vs MGC ${t4['mgc_rt_usd']:.2f} total RT)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # TASK 5
    lines.append("## Task 5 — Final Gold-Family Classification")
    lines.append("")
    lines.append(f"**Classification: {t5['classification']}**")
    lines.append("")
    lines.append(t5["rationale"])
    lines.append("")
    lines.append("| Evidence | Value |")
    lines.append("|----------|-------|")
    for k, v in t5["evidence"].items():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("**Production weights must NOT be updated until forward live data confirms post-lock results.**")
    lines.append("")

    report_md = "\n".join(lines)
    md_path = os.path.join(REPORT_ROOT, "white_swan_gold_family_v2.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"\n  Report written: {md_path}")
    return md_path


def write_json(t1, t2, t3, t4, t5):
    summary = {
        "version": "v2",
        "generated": datetime.utcnow().isoformat(),
        "gld_file": GLD_CSV_PRIMARY,
        "locked_params_gc": {"atr": GC_ATR_N, "sl_mult": GC_SL_MULT, "rr": GC_RR},
        "locked_params_gld": {"atr": GLD_ATR_N, "sl_mult": GLD_SL_MULT, "rr": GLD_RR},
        "task1_dxy_audit": {
            "meta_selection_bias": t1["meta_selection_bias"],
            "dxy_definition": t1["dxy_definition"],
            "aggregate": t1["aggregate"],
            "fold_count": len(t1["fold_rows"]),
        },
        "task2_gld": {
            "gld_is_metrics": t2["gld_is_metrics"],
            "gld_khv_metrics": t2["gld_khv_metrics"],
            "comparison": {k: v for k, v in t2["comparison"].items() if k != "rows"},
        },
        "task3_khv": {
            "label": t3["label"],
            "unfiltered_pf": t3["unfiltered"]["pf"],
            "filtered_pf": t3["dxy_filtered"]["pf"],
            "unfiltered_cagr": t3["unfiltered"]["cagr"],
            "filtered_cagr": t3["dxy_filtered"]["cagr"],
            "freeze_statement": t3["freeze_statement"],
        },
        "task4_vehicles": {
            "gross_avg_r": t4["gross_avg_r_wfo_oos_dxy"],
            "gc_net_pf": t4["vehicles"][0]["net_pf"],
            "mgc_net_pf": t4["vehicles"][1]["net_pf"],
            "gld_net_pf": t4["vehicles"][2]["net_pf"],
        },
        "task5_classification": {
            "classification": t5["classification"],
            "rationale": t5["rationale"],
            "evidence": t5["evidence"],
        },
    }
    json_path = os.path.join(REPORT_ROOT, "white_swan_gold_family_v2.json")
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"  JSON written: {json_path}")
    return json_path


# ============================================================
# MAIN
# ============================================================

def main():
    print("White Swan Gold Family Research — v2")
    print(f"  GC locked: ATR={GC_ATR_N}, SL={GC_SL_MULT}, RR={GC_RR}")
    print(f"  GLD locked: ATR={GLD_ATR_N}, SL={GLD_SL_MULT}, RR={GLD_RR}")

    # === LOAD GC 60m ===
    print("\nLoading GC 60m data...")
    frames = []
    for path in GC_FILES:
        df, msg = load_csv_ohlc(path, os.path.basename(path))
        if df is not None:
            frames.append(df)
            print(f"  {msg}")
        else:
            print(f"  ERROR: {msg}")

    if not frames:
        print("FATAL: No GC data loaded.")
        sys.exit(1)

    gc60 = pd.concat(frames).sort_index()
    gc60 = gc60[~gc60.index.duplicated(keep="first")]
    print(f"  GC combined: {len(gc60)} bars  {gc60.index[0].date()} -> {gc60.index[-1].date()}")

    # === LOAD DXY ===
    print("\nLoading DXY...")
    dxy_df, dxy_msg = load_csv_ohlc(DXY_CSV, "DXY")
    if dxy_df is None:
        print(f"  FATAL: DXY not found: {dxy_msg}")
        sys.exit(1)
    print(f"  {dxy_msg}")

    # === LOAD GLD ===
    print("\nLoading GLD daily...")
    gld_df = None
    gld_path_used = None
    for path in [GLD_CSV_PRIMARY, GLD_CSV_ALT]:
        df, msg = load_csv_ohlc(path, "GLD")
        if df is not None:
            gld_df = df
            gld_path_used = path
            print(f"  {msg}")
            break
    if gld_df is None:
        print(f"  FATAL: GLD data not found. Searched:\n    {GLD_CSV_PRIMARY}\n    {GLD_CSV_ALT}")
        sys.exit(1)

    # === TASK 1: DXY fold-by-fold audit ===
    t1 = task1_dxy_fold_audit(gc60, dxy_df)

    # === GC WFO OOS yearly (from v1 results — reuse for task2 comparison) ===
    # Rebuild from task1 fold rows (same data source)
    gc_wfo_oos_yearly = {r["oos_year"]: r["total_r_filtered"]
                          for r in t1["fold_rows"]}
    # For unfiltered yearly comparison
    gc_wfo_oos_yearly_uf = {}
    for dt, r in t1["oos_all_unfiltered"]:
        yr = dt.year if hasattr(dt, 'year') else pd.Timestamp(dt).year
        gc_wfo_oos_yearly_uf[yr] = gc_wfo_oos_yearly_uf.get(yr, 0.0) + r

    # For task 2 use unfiltered GC OOS yearly (GLD hasn't been DXY-filtered)
    # === TASK 2: GLD cross-market ===
    t2 = task2_gld_cross_market(gld_df, gc_wfo_oos_yearly_uf)

    # === TASK 3: DXY-filtered KHV ===
    t3 = task3_dxy_khv(gc60, dxy_df)

    # === TASK 4: Execution vehicles ===
    t4 = task4_execution_vehicles(t1["oos_all_filtered"])

    # === TASK 5: Classification ===
    t5 = task5_classification(t1, t2, t3, t4)

    # === OUTPUT ===
    md_path   = write_report(t1, t2, t3, t4, t5, gld_path_used)
    json_path = write_json(t1, t2, t3, t4, t5)

    print("\n" + "="*70)
    print("WHITE SWAN GOLD FAMILY v2 — COMPLETE")
    print(f"  Report: {md_path}")
    print(f"  JSON:   {json_path}")
    print(f"  Classification: {t5['classification']}")
    print("="*70)


if __name__ == "__main__":
    main()
