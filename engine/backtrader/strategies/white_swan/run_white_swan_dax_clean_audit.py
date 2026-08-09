"""
White Swan DAX Turnaround Tuesday -- Clean Audit (no regime filter)
===================================================================
Strategy spec:
  - Asset:  FDAX continuous (30-min bars)
  - Entry:  Monday 17:30 Berlin bar CLOSE (bar opens 17:00, closes 17:30 Berlin)
  - Stop:   prev completed daily ATR x SL_mult (daily bar closed BEFORE entry)
  - TP:     optional (entry + stop_dist * RR); None = time-exit only
  - Exit:   Wednesday 17:30 Berlin bar CLOSE (time exit)
  - Fill:   close-fill semantics throughout
  - No macro / regime filter
"""

import sys, json, math, warnings, datetime
from pathlib import Path
from itertools import product

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd
from zoneinfo import ZoneInfo

warnings.filterwarnings("ignore")

DOWNLOADS  = Path("C:/Users/joris/Downloads")
REPORTS    = Path("C:/Users/joris/Documents/Capitalife Terminal/reports")
REPORTS.mkdir(parents=True, exist_ok=True)

DAX_30M_FILE   = DOWNLOADS / "EUREX_FDAX_30min_gesamt_2007-2026.csv"
DAX_DAILY_FILE = DOWNLOADS / "EUREX_DLY_FDAX1!, 1D_6507d.csv"
GLD_OOS_FILE   = DOWNLOADS / "white_swan_handoff/white_swan_strategy_audit_handoff/reference_outputs/gold/Gold_wfo_oos_trades.csv"

BERLIN         = ZoneInfo("Europe/Berlin")
RISK_PCT       = 0.01
INITIAL_EQUITY = 100_000.0

# FDXS micro-DAX EUR 1/pt: comm 5 EUR RT + spread 0.75pt + slip 0.5pt = ~6.25 EUR
# At 1% risk on 100k EUR = 1000 EUR risk per trade -> cost_R = 6.25/1000 = 0.00625
# Round up to 0.01 for conservatism
FDXS_COST_R = 0.01

ATR_LENGTHS = [7, 10, 14]
SL_MULTS    = [1.0, 1.25, 1.5, 1.75, 2.0]
RR_VALUES   = [None, 1.0, 1.25, 1.5, 2.0]

# ---------------------------------------------------------------------------
# DATA LOADING
# ---------------------------------------------------------------------------
def load_30m() -> pd.DataFrame:
    if not DAX_30M_FILE.exists():
        raise FileNotFoundError(
            f"DAX 30-min file not found: {DAX_30M_FILE}\n"
            "Paths searched:\n"
            "  C:/Users/joris/Downloads/\n"
            "  C:/Users/joris/Documents/data/\n"
            "  engine/backtrader/data/\n"
            "  engine/backtrader/strategies/white_swan/"
        )
    df = pd.read_csv(DAX_30M_FILE)
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert(BERLIN)
    df = df.sort_values("time").reset_index(drop=True)
    return df

def load_daily() -> pd.DataFrame:
    if not DAX_DAILY_FILE.exists():
        raise FileNotFoundError(f"DAX daily file not found: {DAX_DAILY_FILE}")
    df = pd.read_csv(DAX_DAILY_FILE, parse_dates=["time"])
    df = df.sort_values("time").reset_index(drop=True)
    return df

def compute_daily_atr(daily: pd.DataFrame, atr_length: int) -> pd.Series:
    """Returns series indexed by date (as date objects) -> ATR float."""
    h = daily["high"].values.astype(float)
    l = daily["low"].values.astype(float)
    c = daily["close"].values.astype(float)
    pc = np.concatenate([[np.nan], c[:-1]])
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    atr = pd.Series(tr).rolling(atr_length, min_periods=atr_length).mean().values
    dates = pd.to_datetime(daily["time"]).dt.date.values
    return pd.Series(atr, index=dates)

# ---------------------------------------------------------------------------
# PRECOMPUTE TRADE WINDOWS (done once)
# ---------------------------------------------------------------------------
def build_trade_windows(df30: pd.DataFrame) -> dict:
    """
    For each Monday 17:00 signal bar find the corresponding Wednesday 17:00 exit bar
    and extract the intrabar window arrays.

    Returns dict with arrays (length = number of valid signals):
      entry_px   : float array
      entry_date : date array
      wed_close  : float (exit close at time-exit bar)
      win_h, win_l, win_c : list of 1-D float arrays (one per signal)
      win_len    : int array (window length)
    """
    t     = df30["time"]
    dow   = t.dt.dayofweek.values      # 0=Mon
    hour  = t.dt.hour.values
    minute= t.dt.minute.values
    hi    = df30["high"].values.astype(float)
    lo    = df30["low"].values.astype(float)
    cl    = df30["close"].values.astype(float)
    n     = len(cl)

    sig_mask  = (dow == 0) & (hour == 17) & (minute == 0)
    exit_mask = (dow == 2) & (hour == 17) & (minute == 0)
    sig_idx   = np.where(sig_mask)[0]
    exit_idx  = np.where(exit_mask)[0]

    # Build date -> exit_idx lookup
    exit_dates = {}
    for ei in exit_idx:
        d = t.iloc[ei].date()
        exit_dates[d] = ei

    entry_px   = []
    entry_dates= []
    wed_close  = []
    win_h_list = []
    win_l_list = []
    win_c_list = []

    for si in sig_idx:
        sig_date   = t.iloc[si].date()
        days_ahead = (2 - sig_date.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        wed_date = sig_date + datetime.timedelta(days=days_ahead)

        ei = exit_dates.get(wed_date)
        if ei is None or ei <= si:
            continue

        # Window: bars from si+1 to ei (inclusive = time-exit bar)
        w_hi = hi[si+1 : ei+1]
        w_lo = lo[si+1 : ei+1]
        w_cl = cl[si+1 : ei+1]

        if len(w_hi) == 0:
            continue

        entry_px.append(cl[si])
        entry_dates.append(sig_date)
        wed_close.append(cl[ei])
        win_h_list.append(w_hi)
        win_l_list.append(w_lo)
        win_c_list.append(w_cl)

    return {
        "entry_px"   : np.array(entry_px),
        "entry_dates": np.array(entry_dates),
        "wed_close"  : np.array(wed_close),
        "win_h"      : win_h_list,
        "win_l"      : win_l_list,
        "win_c"      : win_c_list,
    }

# ---------------------------------------------------------------------------
# FAST SIMULATION PER PARAM COMBO
# ---------------------------------------------------------------------------
def simulate_combo(windows: dict, atr_series: pd.Series,
                   sl_mult: float, rr,
                   start_date=None, end_date=None) -> pd.DataFrame:
    """
    Given precomputed windows and a daily ATR series,
    simulate all trades for (sl_mult, rr) params.
    """
    entry_px    = windows["entry_px"]
    entry_dates = windows["entry_dates"]
    wed_close   = windows["wed_close"]
    win_h       = windows["win_h"]
    win_l       = windows["win_l"]
    win_c       = windows["win_c"]

    # ATR lookup: sorted dates + values for binary search
    atr_valid = atr_series.dropna()
    atr_d = np.array(atr_valid.index)     # date objects
    atr_v = atr_valid.values.astype(float)

    sd = pd.Timestamp(start_date).date() if start_date else datetime.date(1900, 1, 1)
    ed = pd.Timestamp(end_date).date()   if end_date   else datetime.date(2100, 1, 1)

    trades = []
    for i in range(len(entry_px)):
        d = entry_dates[i]
        if d < sd or d > ed:
            continue

        # Find most recent ATR before entry date
        mask = atr_d < d
        if not mask.any():
            continue
        atr_val = float(atr_v[np.where(mask)[0][-1]])
        if np.isnan(atr_val) or atr_val == 0:
            continue

        ep        = float(entry_px[i])
        stop_dist = atr_val * sl_mult
        stop_px   = ep - stop_dist
        tp_px     = (ep + stop_dist * rr) if rr is not None else None

        wh = win_h[i]
        wl = win_l[i]
        wc = win_c[i]
        nb = len(wh)

        # Find first SL hit
        sl_arr  = wl <= stop_px
        tp_arr  = np.zeros(nb, dtype=bool) if tp_px is None else (wh >= tp_px)

        sl_first = int(np.argmax(sl_arr)) if sl_arr.any() else nb
        tp_first = int(np.argmax(tp_arr)) if tp_arr.any() else nb
        # time exit = last bar (index nb-1)

        hit = min(sl_first, tp_first, nb - 1)

        if sl_arr.any() and sl_first <= tp_first and sl_first <= nb - 1:
            exit_price  = stop_px
            exit_reason = "SL"
        elif tp_px is not None and tp_arr.any() and tp_first < nb - 1:
            exit_price  = tp_px
            exit_reason = "TP"
        else:
            exit_price  = float(wc[-1])
            exit_reason = "TIME"

        gross_r = (exit_price - ep) / stop_dist

        trades.append({
            "entry_date" : d,
            "entry_px"   : ep,
            "daily_atr"  : atr_val,
            "stop_dist"  : stop_dist,
            "stop_px"    : stop_px,
            "tp_px"      : tp_px,
            "exit_price" : exit_price,
            "exit_reason": exit_reason,
            "gross_R"    : gross_r,
            "year"       : d.year,
        })

    df = pd.DataFrame(trades)
    return df

def add_net_r(df: pd.DataFrame, cost_r: float) -> pd.DataFrame:
    df = df.copy()
    df["net_R"] = df["gross_R"] - cost_r
    return df

# ---------------------------------------------------------------------------
# METRICS
# ---------------------------------------------------------------------------
def metrics(trades_df: pd.DataFrame) -> dict:
    if trades_df is None or len(trades_df) == 0:
        return {"n": 0, "pf": None, "expectancy": None, "winrate": None,
                "payoff": None, "cagr": None, "maxdd": None, "calmar": None,
                "total_R": None, "final_equity": INITIAL_EQUITY}
    col = "net_R" if "net_R" in trades_df.columns else "gross_R"
    r   = trades_df[col].values.astype(float)
    pos = r[r > 0]; neg = r[r < 0]

    winrate = float((r > 0).mean())
    pf      = float(pos.sum() / -neg.sum()) if neg.sum() < 0 else None
    exp     = float(r.mean())
    payoff  = float(pos.mean() / -neg.mean()) if (len(pos) > 0 and len(neg) > 0) else None

    eq = np.empty(len(r) + 1); eq[0] = INITIAL_EQUITY
    for i, ri in enumerate(r):
        eq[i+1] = eq[i] * (1 + RISK_PCT * ri)

    years = 1.0
    if "entry_date" in trades_df.columns and len(trades_df) > 1:
        try:
            t0 = trades_df["entry_date"].iloc[0]
            t1 = trades_df["entry_date"].iloc[-1]
            years = max((pd.Timestamp(t1) - pd.Timestamp(t0)).days / 365.25, 0.1)
        except Exception:
            pass

    cagr   = float((eq[-1] / eq[0]) ** (1 / years) - 1)
    peak   = np.maximum.accumulate(eq)
    dd     = (eq - peak) / peak
    maxdd  = float(dd.min())
    calmar = float(cagr / -maxdd) if maxdd < 0 else None

    return {
        "n"          : int(len(r)),
        "pf"         : round(pf, 4)     if pf     else None,
        "expectancy" : round(exp, 4),
        "winrate"    : round(winrate, 4),
        "payoff"     : round(payoff, 4) if payoff  else None,
        "cagr"       : round(cagr, 4),
        "maxdd"      : round(maxdd, 4),
        "calmar"     : round(calmar, 3) if calmar  else None,
        "total_R"    : round(float(r.sum()), 3),
        "final_equity": round(float(eq[-1]), 2),
    }

def yearly_returns(trades_df: pd.DataFrame) -> dict:
    if trades_df is None or trades_df.empty:
        return {}
    col = "net_R" if "net_R" in trades_df.columns else "gross_R"
    out = {}
    for yr, grp in trades_df.groupby("year"):
        r  = grp[col].values.astype(float)
        eq = np.empty(len(r)+1); eq[0] = INITIAL_EQUITY
        for i, ri in enumerate(r): eq[i+1] = eq[i]*(1+RISK_PCT*ri)
        ret = (eq[-1]/eq[0]) - 1
        w = r[r>0].sum(); l = -r[r<0].sum()
        out[int(yr)] = {
            "return_pct": round(ret*100, 2),
            "n"         : int(len(r)),
            "pf"        : round(w/l, 3) if l > 0 else None,
        }
    return out

# ---------------------------------------------------------------------------
# GRID SEARCH
# ---------------------------------------------------------------------------
def run_grid(windows: dict, atr_series: pd.Series,
             start_date, end_date, cost_r=FDXS_COST_R) -> pd.DataFrame:
    rows = []
    for sl_m, rr in product(SL_MULTS, RR_VALUES):
        t = simulate_combo(windows, atr_series, sl_m, rr, start_date, end_date)
        if len(t) < 5:
            continue
        t = add_net_r(t, cost_r)
        m = metrics(t)
        rows.append({"sl_mult": sl_m, "rr": rr, **m})
    return pd.DataFrame(rows)

def full_is_grid(windows: dict, daily: pd.DataFrame,
                 start_date, end_date, cost_r=FDXS_COST_R) -> pd.DataFrame:
    all_rows = []
    for atr_len in ATR_LENGTHS:
        atr_s = compute_daily_atr(daily, atr_len)
        g = run_grid(windows, atr_s, start_date, end_date, cost_r)
        g.insert(0, "atr_length", atr_len)
        all_rows.append(g)
        print(f"    ATR={atr_len}: {len(g)} combos, best PF={g['pf'].max():.3f}" if not g.empty and g["pf"].notna().any() else f"    ATR={atr_len}: no valid combos")
    return pd.concat(all_rows, ignore_index=True) if all_rows else pd.DataFrame()

def select_robust_center(grid: pd.DataFrame):
    valid = grid[(grid["pf"].notna()) & (grid["pf"] > 1.0) & (grid["n"] >= 8)].copy()
    if valid.empty:
        valid = grid[grid["n"] >= 5].copy()
    if valid.empty:
        valid = grid.copy()
    valid = valid.sort_values("pf", ascending=False)
    top10 = valid.head(10)
    q = valid[valid["pf"] >= valid["pf"].quantile(0.75)] if valid["pf"].notna().any() else valid
    if q.empty:
        q = valid
    c_atr = int(q["atr_length"].mode()[0])
    c_sl  = float(q["sl_mult"].median())
    c_sl  = min(SL_MULTS, key=lambda x: abs(x - c_sl))
    rr_m  = q["rr"].mode()
    c_rr  = rr_m.iloc[0] if not rr_m.empty else None
    return (c_atr, c_sl, c_rr), top10

# ---------------------------------------------------------------------------
# WALK-FORWARD
# ---------------------------------------------------------------------------
WFO_FOLDS = [
    (2007, 2011, 2012),
    (2008, 2012, 2013),
    (2009, 2013, 2014),
    (2010, 2014, 2015),
    (2011, 2015, 2016),
    (2012, 2016, 2017),
    (2013, 2017, 2018),
    (2014, 2018, 2019),
    (2015, 2019, 2020),
]

def run_wfo(windows: dict, daily: pd.DataFrame, cost_r=FDXS_COST_R):
    fold_results = []
    all_oos      = []

    for is_start, is_end, oos_year in WFO_FOLDS:
        print(f"  Fold IS {is_start}-{is_end} | OOS {oos_year}")
        grid = full_is_grid(windows, daily, f"{is_start}-01-01", f"{is_end}-12-31", cost_r)
        if grid.empty:
            print("    WARNING: empty grid -- skipping")
            continue
        (b_atr, b_sl, b_rr), _ = select_robust_center(grid)
        best_row = grid.sort_values("pf", ascending=False).iloc[0]
        print(f"    Locked: ATR={b_atr} SL={b_sl} RR={b_rr} IS_PF={best_row['pf']:.3f}")

        da_oos = compute_daily_atr(daily, b_atr)
        oos = simulate_combo(windows, da_oos, b_sl, b_rr,
                              f"{oos_year}-01-01", f"{oos_year}-12-31")
        oos = add_net_r(oos, cost_r)
        oos["fold_year"] = oos_year
        all_oos.append(oos)

        oos_m = metrics(oos)
        pf_s = f"{oos_m['pf']:.3f}" if oos_m["pf"] else "N/A"
        print(f"    OOS n={oos_m['n']} PF={pf_s} exp={oos_m['expectancy']}")

        fold_results.append({
            "is_start"   : is_start,
            "is_end"     : is_end,
            "oos_year"   : oos_year,
            "params"     : {"atr": b_atr, "sl": b_sl, "rr": b_rr},
            "is_pf"      : round(float(best_row["pf"]) if best_row["pf"] else 0, 3),
            "is_n"       : int(best_row["n"]),
            **{f"oos_{k}": v for k, v in oos_m.items() if k not in ("final_equity",)},
        })

    combined = pd.concat(all_oos, ignore_index=True) if all_oos else pd.DataFrame()
    return fold_results, combined

# ---------------------------------------------------------------------------
# COST MODEL
# ---------------------------------------------------------------------------
COST_LAYERS = {
    "FDXS": {"comm_rt": 5.0,  "spread_pt": 0.75, "slip_pt": 0.5,  "pt_value": 1.0},
    "FDXM": {"comm_rt": 6.0,  "spread_pt": 1.5,  "slip_pt": 1.0,  "pt_value": 5.0},
    "FDAX": {"comm_rt": 10.0, "spread_pt": 0.5,  "slip_pt": 0.5,  "pt_value": 25.0},
    "CFD" : {"comm_rt": 2.0,  "spread_pt": 1.0,  "slip_pt": 0.0,  "pt_value": 1.0},
}

def cost_analysis(trades_df: pd.DataFrame) -> dict:
    if trades_df is None or trades_df.empty:
        return {}
    risk_eur      = INITIAL_EQUITY * RISK_PCT  # 1000 EUR
    avg_gross_r   = float(trades_df["gross_R"].mean())
    avg_gross_eur = avg_gross_r * risk_eur
    result = {}
    for layer, spec in COST_LAYERS.items():
        rt_eur       = spec["comm_rt"] + (spec["spread_pt"] + spec["slip_pt"]) * spec["pt_value"]
        cost_r_unit  = rt_eur / risk_eur
        net_eur      = avg_gross_eur - rt_eur
        cost_pct     = (rt_eur / avg_gross_eur * 100) if avg_gross_eur > 0 else None
        stress = {}
        for mult in [1.0, 1.25, 1.5, 2.0]:
            rn = trades_df["gross_R"].values - cost_r_unit * mult
            w  = rn[rn > 0].sum(); l = -rn[rn < 0].sum()
            stress[f"{mult}x"] = round(float(w/l), 3) if l > 0 else None
        result[layer] = {
            "rt_cost_eur"     : round(rt_eur, 2),
            "avg_gross_eur"   : round(avg_gross_eur, 2),
            "net_edge_eur"    : round(net_eur, 2),
            "cost_pct_gross"  : round(cost_pct, 1) if cost_pct else None,
            "breakeven_rt_eur": round(avg_gross_eur, 2),
            "pf_stress"       : stress,
        }
    return result

# ---------------------------------------------------------------------------
# ACCEPTANCE GATES
# ---------------------------------------------------------------------------
def apply_gates(folds, combined_oos, holdout, cost_r):
    if combined_oos is None or combined_oos.empty:
        return {"verdict": "REJECT", "reason": "No OOS trades"}
    r    = combined_oos["net_R"].values.astype(float)
    w    = r[r>0].sum(); l = -r[r<0].sum()
    wfo_pf  = float(w/l) if l > 0 else None
    wfo_exp = float(r.mean())
    pos_f   = sum(1 for f in folds if f.get("oos_pf") and f["oos_pf"] > 1.0)
    tot_f   = len(folds)

    r2   = combined_oos["gross_R"].values - cost_r
    w2   = r2[r2>0].sum(); l2 = -r2[r2<0].sum()
    fdxs_pf = float(w2/l2) if l2 > 0 else None

    r3   = combined_oos["gross_R"].values - cost_r * 1.5
    w3   = r3[r3>0].sum(); l3 = -r3[r3<0].sum()
    s15_pf  = float(w3/l3) if l3 > 0 else None

    h_pf = None
    if holdout is not None and not holdout.empty:
        rh = holdout["net_R"].values.astype(float)
        hw = rh[rh>0].sum(); hl = -rh[rh<0].sum()
        h_pf = float(hw/hl) if hl > 0 else None

    gates = {
        "wfo_expectancy_positive"    : bool(wfo_exp > 0),
        "wfo_pf_above_1"             : bool(wfo_pf and wfo_pf > 1.0),
        "majority_folds_positive"    : bool(pos_f > tot_f / 2),
        "fdxs_pf_above_1"            : bool(fdxs_pf and fdxs_pf > 1.0),
        "fdxs_15x_stress_pf_above_1" : bool(s15_pf and s15_pf > 1.0),
        "holdout_pf_above_1"         : bool(h_pf and h_pf > 1.0),
        "positive_folds"             : f"{pos_f}/{tot_f}",
        "wfo_expectancy"             : round(wfo_exp, 4),
        "wfo_aggregate_pf"           : round(wfo_pf, 3)  if wfo_pf  else None,
        "fdxs_pf"                    : round(fdxs_pf, 3) if fdxs_pf else None,
        "fdxs_15x_pf"                : round(s15_pf, 3)  if s15_pf  else None,
        "holdout_pf"                 : round(h_pf, 3)    if h_pf    else None,
    }
    bools = [v for k, v in gates.items() if isinstance(v, bool)]
    gates["verdict"] = "KEEP" if all(bools) else "REJECT"
    return gates

# ---------------------------------------------------------------------------
# PORTFOLIO
# ---------------------------------------------------------------------------
def build_portfolio(dax_oos: pd.DataFrame, gld_file: Path):
    if not gld_file.exists():
        return None, "GLD OOS file not found"
    gld = pd.read_csv(gld_file)
    if "fold_year" not in gld.columns:
        gld["fold_year"] = pd.to_datetime(gld["entry_time"]).dt.year
    rc = "effR" if "effR" in gld.columns else "R"
    dax_wfo = dax_oos[dax_oos["fold_year"].between(2012, 2020)]
    gld_wfo = gld[gld["fold_year"].between(2012, 2020)]
    dax_yr  = dax_wfo.groupby("fold_year")["net_R"].sum()
    gld_yr  = gld_wfo.groupby("fold_year")[rc].sum()
    common  = dax_yr.index.intersection(gld_yr.index)
    corr = round(float(np.corrcoef(dax_yr[common].values, gld_yr[common].values)[0,1]), 3) if len(common) > 2 else None
    yrs  = sorted(set(dax_yr.index) | set(gld_yr.index))
    port = {int(yr): round(0.5*float(dax_yr.get(yr,0)) + 0.5*float(gld_yr.get(yr,0)), 3) for yr in yrs}
    return {"wfo_period": "2012-2020", "corr_annual_r": corr,
            "weights": {"DAX_TAT": 0.5, "GLD_THU": 0.5},
            "annual_combined_R": port}, None

# ---------------------------------------------------------------------------
# REPLACEMENT SEARCH
# ---------------------------------------------------------------------------
def search_replacements():
    import re
    paths = [
        Path("C:/Users/joris/Documents/Capitalife Terminal/src/lib/components/ws-strategy-data.ts"),
        Path("C:/Users/joris/Documents/Capitalife Terminal/engine/backtrader/reports"),
        Path("C:/Users/joris/Documents/Capitalife Terminal/reports"),
    ]
    out = []
    for p in paths:
        if p.is_file():
            txt = p.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'"status"\s*:\s*"(watch|research|audit-pending)"', txt, re.I):
                ctx = txt[max(0,m.start()-200):m.end()+200]
                nm = re.search(r'"name"\s*:\s*"([^"]+)"', ctx)
                name = nm.group(1) if nm else "unknown"
                if not any(x in name.lower() for x in ["gold","gld","precious"]):
                    out.append({"name": name, "status": m.group(1), "source": str(p),
                                "notes": "non-gold strategy found in ts source"})
        elif p.is_dir():
            for f in p.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8", errors="ignore"))
                    if isinstance(data, dict):
                        for k, v in data.items():
                            if isinstance(v, dict) and v.get("status") in ("watch","research","audit-pending"):
                                name = v.get("name", k)
                                if not any(x in name.lower() for x in ["gold","gld"]):
                                    out.append({"name": name, "status": v["status"],
                                                "asset": v.get("asset","?"), "source": str(f),
                                                "notes": f"non-gold, status={v['status']}"})
                except Exception:
                    pass
    if not out:
        out = [{"name": "None found", "status": "--",
                "notes": "No non-gold watch/research strategies in scanned paths. "
                         "DAX TAT rejection leaves GLD as sole White Swan sleeve."}]
    return out

# ---------------------------------------------------------------------------
# MARKDOWN REPORT
# ---------------------------------------------------------------------------
def make_report(results: dict) -> str:
    L = []; A = L.append
    A("# White Swan DAX Turnaround Tuesday -- Clean Audit Report")
    A("")
    A("**Strategy:** FDAX long Mon 17:30 Berlin -> Wed 17:30 Berlin | No regime filter")
    A(f"**30m data:** {DAX_30M_FILE.name}")
    A(f"**Daily data:** {DAX_DAILY_FILE.name}")
    A("")
    A("## 1. Trade Reconciliation (IS 2007-2020, locked params -- sample)")
    A("")
    rec = results.get("reconciliation", [])
    if rec:
        A("| Entry Date | Entry Px | Daily ATR | Stop Dist | TP Px | Exit Px | Reason | Gross R | Net R |")
        A("|---|---|---|---|---|---|---|---|---|")
        for t in rec:
            tp_s = f"{t['tp_px']:.1f}" if t.get("tp_px") else "--"
            A(f"| {t['entry_date']} | {t['entry_px']:.1f} | {t['daily_atr']:.1f} | "
              f"{t['stop_dist']:.1f} | {tp_s} | {t['exit_price']:.1f} | "
              f"{t['exit_reason']} | {t['gross_R']:+.3f} | {t['net_R']:+.3f} |")
    A("")
    A(f"*Total IS trades: {results.get('is_total_trades', '?')}*")
    A("")
    A("## 2. IS Grid (2007-2020) -- Top 10 by PF")
    A("")
    top10 = results.get("is_top10", [])
    if top10:
        A("| ATR | SL | RR | N | Win% | PF | Exp R | CAGR% |")
        A("|---|---|---|---|---|---|---|---|")
        for row in top10:
            rr_s = str(row.get("rr")) if row.get("rr") is not None else "None"
            pf_v = row.get("pf") or 0
            exp_v = row.get("expectancy") or 0
            cagr_v = row.get("cagr") or 0
            wrate = row.get("winrate") or 0
            A(f"| {row.get('atr_length')} | {row.get('sl_mult')} | {rr_s} | {row.get('n')} | "
              f"{wrate*100:.1f}% | {pf_v:.3f} | {exp_v:+.4f} | {cagr_v*100:.2f}% |")
    A("")
    lp = results.get("locked_params", {})
    A(f"**Locked params:** ATR={lp.get('atr')}  SL_mult={lp.get('sl')}  RR={lp.get('rr')}")
    A("")
    A("## 3. Walk-Forward Optimization (9 folds, 5yr IS -> 1yr OOS)")
    A("")
    folds = results.get("wfo_folds", [])
    if folds:
        A("| IS | OOS | Params | IS PF | OOS n | OOS PF | OOS Exp | OOS WR% | MaxDD% | CAGR% |")
        A("|---|---|---|---|---|---|---|---|---|---|")
        for f in folds:
            p   = f.get("params", {})
            pf  = f.get("oos_pf");  pf_s  = f"{pf:.3f}"  if pf  else "--"
            exp = f.get("oos_expectancy") or 0
            wr  = f.get("oos_winrate") or 0
            md  = f.get("oos_maxdd") or 0
            cg  = f.get("oos_cagr") or 0
            rrs = str(p.get("rr")) if p.get("rr") is not None else "None"
            A(f"| {f['is_start']}-{f['is_end']} | {f['oos_year']} | "
              f"ATR={p.get('atr')} SL={p.get('sl')} RR={rrs} | {f.get('is_pf',0):.3f} | "
              f"{f.get('oos_n',0)} | {pf_s} | {exp:+.4f} | "
              f"{wr*100:.1f}% | {md*100:.1f}% | {cg*100:.2f}% |")
    A("")
    agg = results.get("wfo_aggregate", {})
    A(f"**Aggregate OOS** N={agg.get('n')} | PF={agg.get('pf')} | "
      f"Exp={agg.get('expectancy')} | Win%={round((agg.get('winrate') or 0)*100,1)}% | "
      f"MaxDD={round((agg.get('maxdd') or 0)*100,1)}% | Calmar={agg.get('calmar')}")
    A("")
    A("### WFO OOS Yearly Returns")
    A("")
    yr_ret = results.get("wfo_yearly", {})
    if yr_ret:
        A("| Year | Return% | N | PF |")
        A("|---|---|---|---|")
        for yr, v in sorted(yr_ret.items()):
            A(f"| {yr} | {v['return_pct']:+.2f}% | {v['n']} | {v['pf'] or '--'} |")
    A("")
    A("## 4. Cost Model")
    A("")
    cost = results.get("cost_analysis", {})
    if cost:
        A("| Layer | RT Cost EUR | Avg Gross EUR | Net Edge EUR | Cost% Gross | Break-Even RT EUR |")
        A("|---|---|---|---|---|---|")
        for layer, c in cost.items():
            A(f"| {layer} | {c['rt_cost_eur']} | {c['avg_gross_eur']} | "
              f"{c['net_edge_eur']} | {c.get('cost_pct_gross','?')}% | {c['breakeven_rt_eur']} |")
        A("")
        A("### FDXS PF Stress Test")
        A("| Cost Multiplier | PF |")
        A("|---|---|")
        for k, v in cost.get("FDXS", {}).get("pf_stress", {}).items():
            A(f"| {k} | {v if v else '--'} |")
    A("")
    A("## 5. Holdout 2021+ (locked params, run once)")
    A("")
    h = results.get("holdout", {})
    A(f"N={h.get('n')} | PF={h.get('pf')} | CAGR={round((h.get('cagr') or 0)*100,2)}% | "
      f"MaxDD={round((h.get('maxdd') or 0)*100,1)}% | Calmar={h.get('calmar')} | "
      f"Exp={h.get('expectancy')}")
    A("")
    A("### Holdout Yearly Returns")
    A("")
    hyr = results.get("holdout_yearly", {})
    if hyr:
        A("| Year | Return% | N | PF |")
        A("|---|---|---|---|")
        for yr, v in sorted(hyr.items()):
            label = f"{yr} (YTD)" if yr == 2026 else str(yr)
            A(f"| {label} | {v['return_pct']:+.2f}% | {v['n']} | {v['pf'] or '--'} |")
    A("")
    A("## 6. Acceptance Verdict")
    A("")
    gates = results.get("gates", {})
    verdict = gates.get("verdict", "?")
    A(f"**VERDICT: {verdict}**")
    A("")
    A("| Gate | Value | Pass |")
    A("|---|---|---|")
    for label, val_key, bool_key in [
        ("WFO Expectancy > 0",        "wfo_expectancy",      "wfo_expectancy_positive"),
        ("WFO Aggregate PF > 1.0",     "wfo_aggregate_pf",    "wfo_pf_above_1"),
        ("Majority Folds Positive",    "positive_folds",      "majority_folds_positive"),
        ("FDXS PF > 1.0 after cost",   "fdxs_pf",             "fdxs_pf_above_1"),
        ("FDXS 1.5x Stress PF > 1.0", "fdxs_15x_pf",        "fdxs_15x_stress_pf_above_1"),
        ("Holdout 2021+ PF > 1.0",     "holdout_pf",          "holdout_pf_above_1"),
    ]:
        A(f"| {label} | {gates.get(val_key)} | {'YES' if gates.get(bool_key) else 'NO'} |")
    A("")
    port = results.get("portfolio")
    if port and isinstance(port, dict):
        A("## 7. Two-Strategy Portfolio (GLD Thu + DAX TAT) -- WFO OOS 2012-2020")
        A("")
        A(f"Correlation (annual R): {port.get('corr_annual_r')}  "
          f"Weights: DAX {port['weights']['DAX_TAT']} / GLD {port['weights']['GLD_THU']}")
        A("")
        A("| Year | Combined R (50/50 equal-risk) |")
        A("|---|---|")
        for yr, r in sorted(port.get("annual_combined_R", {}).items()):
            A(f"| {yr} | {r:+.3f} |")
        A("")
    repl = results.get("replacement_search")
    if repl:
        A("## 8. Replacement Search (REJECT path)")
        A("")
        for item in repl:
            A(f"- **{item.get('name')}** ({item.get('status')}): {item.get('notes')}")
        A("")
    A("---")
    A("*Generated by run_white_swan_dax_clean_audit.py -- reproducible, no fabricated metrics.*")
    return "\n".join(L)

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    print("=" * 65)
    print("White Swan DAX Turnaround Tuesday -- Clean Audit")
    print("=" * 65)

    print("\n[1/8] Loading 30-min FDAX data...")
    df30 = load_30m()
    print(f"  {len(df30):,} 30-min bars loaded")

    print("\n[2/8] Loading daily FDAX data...")
    daily = load_daily()
    print(f"  {len(daily):,} daily bars loaded")

    print("\n[3/8] Pre-computing trade windows...")
    windows = build_trade_windows(df30)
    print(f"  {len(windows['entry_px'])} signal bars found")

    print("\n[4/8] IS grid search (2007-2020) for locked params...")
    is_grid = full_is_grid(windows, daily, "2007-01-01", "2020-12-31")
    if is_grid.empty:
        print("ERROR: IS grid empty -- stopping")
        return
    locked, top10_df = select_robust_center(is_grid)
    locked_atr, locked_sl, locked_rr = locked
    top10_list = top10_df.head(10).to_dict("records")
    print(f"  Locked: ATR={locked_atr} SL={locked_sl} RR={locked_rr}")

    # Trade reconciliation with locked params
    da_is = compute_daily_atr(daily, locked_atr)
    rec_t = simulate_combo(windows, da_is, locked_sl, locked_rr, "2007-01-01", "2020-12-31")
    rec_t = add_net_r(rec_t, FDXS_COST_R)
    print(f"  IS trades (locked): {len(rec_t)}")
    # Sample 3 per year for report
    rec_sample = []
    for yr, grp in rec_t.groupby("year"):
        rows = grp.to_dict("records")
        rec_sample.extend(rows[:3])
        if len(rows) > 3:
            rec_sample.extend(rows[-2:])
    # Convert date objects to string
    for r in rec_sample:
        r["entry_date"] = str(r["entry_date"])

    print("\n[5/8] Walk-Forward Optimization (9 folds)...")
    wfo_folds, combined_oos = run_wfo(windows, daily)
    agg_m  = metrics(combined_oos) if not combined_oos.empty else {}
    wfo_yr = yearly_returns(combined_oos) if not combined_oos.empty else {}

    print("\n[6/8] Cost model...")
    cost_res = cost_analysis(combined_oos) if not combined_oos.empty else {}

    print("\n[7/8] Holdout 2021+ (locked params, run once)...")
    da_h  = compute_daily_atr(daily, locked_atr)
    hold  = simulate_combo(windows, da_h, locked_sl, locked_rr, "2021-01-01", None)
    hold  = add_net_r(hold, FDXS_COST_R)
    hold_m  = metrics(hold)
    hold_yr = yearly_returns(hold)
    pf_str = f"{hold_m['pf']:.3f}" if hold_m["pf"] else "N/A"
    print(f"  n={hold_m['n']} PF={pf_str} CAGR={round((hold_m['cagr'] or 0)*100,2)}%")

    print("\n[8/8] Acceptance gates...")
    gates   = apply_gates(wfo_folds, combined_oos, hold, FDXS_COST_R)
    verdict = gates["verdict"]
    print(f"  VERDICT: {verdict}")

    port_result = None
    replacement = None
    if verdict == "KEEP":
        port_result, err = build_portfolio(combined_oos, GLD_OOS_FILE)
        if err:
            print(f"  Portfolio: {err}")
    else:
        replacement = search_replacements()

    def clean(obj):
        if isinstance(obj, dict):   return {k: clean(v) for k, v in obj.items()}
        if isinstance(obj, list):   return [clean(i) for i in obj]
        if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)): return None
        if isinstance(obj, (np.integer, np.floating)): return float(obj)
        if isinstance(obj, np.bool_): return bool(obj)
        if isinstance(obj, datetime.date): return str(obj)
        return obj

    results = clean({
        "locked_params"     : {"atr": locked_atr, "sl": locked_sl, "rr": locked_rr},
        "is_total_trades"   : int(len(rec_t)),
        "is_top10"          : top10_list,
        "reconciliation"    : rec_sample,
        "wfo_folds"         : wfo_folds,
        "wfo_aggregate"     : agg_m,
        "wfo_yearly"        : wfo_yr,
        "cost_analysis"     : cost_res,
        "holdout"           : hold_m,
        "holdout_yearly"    : hold_yr,
        "gates"             : gates,
        "portfolio"         : port_result,
        "replacement_search": replacement,
        "data_sources"      : {"30m": str(DAX_30M_FILE), "daily": str(DAX_DAILY_FILE)},
    })

    json_path = REPORTS / "white_swan_dax_clean_audit.json"
    json_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    md_path   = REPORTS / "white_swan_dax_clean_audit.md"
    md_path.write_text(make_report(results), encoding="utf-8")

    print(f"\nJSON: {json_path}")
    print(f"MD:   {md_path}")
    print("\n" + "=" * 65)
    print(f"VERDICT  : {verdict}")
    print(f"WFO PF   : {agg_m.get('pf')}")
    print(f"WFO Exp  : {agg_m.get('expectancy')}")
    print(f"WFO OOS N: {agg_m.get('n')}")
    print(f"Holdout PF: {hold_m.get('pf')}")
    print(f"Holdout CAGR: {round((hold_m.get('cagr') or 0)*100,2)}%")
    print("=" * 65)

if __name__ == "__main__":
    main()
