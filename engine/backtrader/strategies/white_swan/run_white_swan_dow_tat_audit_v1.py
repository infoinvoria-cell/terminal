"""
White Swan Dow Jones TAT Audit v1 — 2026-08-09
Strategy: Long Tuesday after negative Monday (neg_monday filter)
Entry: Monday close. Exit: Tuesday close. SL: entry - slMult×ATR. TP: entry + rr×slDist.
ATR: Wilder's RMA (length 14).
Close-fill semantics. SL/TP checked intrabar (low/high of Tuesday bar).
Data: CBOT_MINI_DL_YM1!, 1D (TradingView export)
Locked params: ATR=14, SL=1.0, RR=2.0, filter=neg_monday
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
import glob
from itertools import product

# ── Data ──────────────────────────────────────────────────────────────────────

DATA_PATHS = [
    r"C:\Users\joris\Downloads\CBOT_MINI_DL_YM1!, 1D_ff3f0.csv",
    r"C:\Users\joris\Downloads\CBOT_MINI_DL_YM1!, 1D_5aaa9.csv",
]

ym_path = None
for p in DATA_PATHS:
    if Path(p).exists():
        ym_path = p
        break

if ym_path is None:
    found = glob.glob(r"C:\Users\joris\Downloads\*YM1*1D*.csv")
    if found:
        ym_path = found[0]
    else:
        raise FileNotFoundError(f"YM1 data not found. Searched: {DATA_PATHS}")

print(f"[data] Using: {ym_path}")
df = pd.read_csv(ym_path, parse_dates=["time"])
df = df.rename(columns={"time": "date"})
df = df.sort_values("date").reset_index(drop=True)
df["date"] = pd.to_datetime(df["date"]).dt.normalize()

dups = df["date"].duplicated().sum()
nulls = df.isnull().sum().sum()
ohlc_violations = (
    (df["high"] < df["open"]) | (df["high"] < df["close"]) |
    (df["low"] > df["open"]) | (df["low"] > df["close"]) |
    (df["high"] < df["low"])
).sum()

print(f"[data] Rows: {len(df)} | {df['date'].min().date()} to {df['date'].max().date()}")
print(f"[data] Duplicates: {dups} | Nulls: {nulls} | OHLC violations: {ohlc_violations}")

# ── ATR (Wilder's RMA) ────────────────────────────────────────────────────────

def calc_atr(df, length):
    hi = df["high"].values
    lo = df["low"].values
    cl = df["close"].values
    tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl, 1)), np.abs(lo - np.roll(cl, 1))))
    tr[0] = hi[0] - lo[0]
    atr = np.full(len(tr), np.nan)
    atr[length - 1] = tr[:length].mean()
    k = 1.0 / length
    for i in range(length, len(tr)):
        atr[i] = atr[i - 1] * (1 - k) + tr[i] * k
    return atr

df["atr14"] = calc_atr(df, 14)
df["weekday"] = df["date"].dt.weekday  # 0=Mon, 1=Tue

# ── Strategy core ─────────────────────────────────────────────────────────────

def run_strategy(df, atr_len=14, sl_mult=1.0, rr=2.0, use_neg_monday=True, atr_col=None):
    """
    Entry: Monday where close < open (neg_monday filter if enabled).
    Entry price: Monday close.
    Exit: Tuesday close (time exit), unless SL/TP hit intrabar on Tuesday.
    SL: entry - sl_mult * ATR
    TP: entry + rr * sl_dist (if rr is not None)
    """
    if atr_col is None:
        atr_col = f"atr{atr_len}"
        if atr_col not in df.columns:
            df = df.copy()
            df[atr_col] = calc_atr(df, atr_len)

    trades = []
    i = 0
    while i < len(df) - 1:
        row = df.iloc[i]
        # Entry: Monday (weekday=0)
        if row["weekday"] == 0 and not np.isnan(row[atr_col]):
            neg_mon = row["close"] < row["open"]
            if not use_neg_monday or neg_mon:
                entry_price = row["close"]
                entry_atr = row[atr_col]
                sl_dist = sl_mult * entry_atr
                stop = entry_price - sl_dist
                tp_price = entry_price + rr * sl_dist if rr is not None else None

                # Next bar (should be Tuesday)
                j = i + 1
                exit_row = df.iloc[j]
                exit_price = exit_row["close"]
                exit_reason = "TIME"

                # Check SL/TP intrabar
                if exit_row["low"] <= stop:
                    exit_price = stop
                    exit_reason = "SL"
                elif tp_price is not None and exit_row["high"] >= tp_price:
                    exit_price = tp_price
                    exit_reason = "TP"

                gross_r = (exit_price - entry_price) / sl_dist if sl_dist > 0 else 0.0
                trades.append({
                    "entry_date": row["date"],
                    "entry_price": entry_price,
                    "atr": round(entry_atr, 2),
                    "sl_dist": round(sl_dist, 2),
                    "stop": round(stop, 2),
                    "tp": round(tp_price, 2) if tp_price else None,
                    "exit_date": exit_row["date"],
                    "exit_price": round(exit_price, 2),
                    "exit_reason": exit_reason,
                    "gross_r": round(gross_r, 4),
                })
                i = j + 1
                continue
        i += 1
    return trades

# ── Metric helpers ────────────────────────────────────────────────────────────

def compute_metrics(trade_list):
    if not trade_list:
        return {}
    rs = np.array([t["gross_r"] for t in trade_list])
    wins = (rs > 0).sum()
    losses = (rs <= 0).sum()
    gp = rs[rs > 0].sum() if wins > 0 else 0
    gl = abs(rs[rs < 0].sum()) if losses > 0 else 1e-9
    pf = gp / gl if gl > 0 else np.inf
    win_rate = wins / len(rs)
    avg_r = rs.mean()
    median_r = float(np.median(rs))
    payoff = (gp / wins) / (gl / losses) if wins > 0 and losses > 0 else np.nan

    # MaxDD in R
    cum = np.cumsum(rs)
    peak = np.maximum.accumulate(cum)
    dd = cum - peak
    max_dd_r = dd.min()

    # Worst losing streak
    worst_streak = 0
    cur = 0
    for r in rs:
        if r <= 0:
            cur += 1
            worst_streak = max(worst_streak, cur)
        else:
            cur = 0

    # Yearly R
    dates = [t["entry_date"] for t in trade_list]
    years = pd.Series(rs, index=pd.to_datetime(dates)).groupby(pd.to_datetime(dates).map(lambda d: d.year)).sum()
    best_yr = f"{years.idxmax()} ({years.max():.2f}R)" if len(years) else "N/A"
    worst_yr = f"{years.idxmin()} ({years.min():.2f}R)" if len(years) else "N/A"

    return {
        "trades": len(trade_list),
        "win_rate": round(win_rate, 4),
        "pf": round(pf, 4),
        "avg_r": round(avg_r, 4),
        "median_r": round(median_r, 4),
        "payoff_ratio": round(payoff, 4) if not np.isnan(payoff) else None,
        "worst_streak": int(worst_streak),
        "maxdd_r": round(max_dd_r, 4),
        "expectancy": round(avg_r, 4),
        "gross_win_r": round(gp, 4),
        "gross_loss_r": round(gl, 4),
        "best_year": best_yr,
        "worst_year": worst_yr,
    }

# ── Period slices ─────────────────────────────────────────────────────────────

IS_END = pd.Timestamp("2018-12-31")
KHV_START = pd.Timestamp("2021-01-01")

all_trades = run_strategy(df, atr_len=14, sl_mult=1.0, rr=2.0, use_neg_monday=True)
is_trades = [t for t in all_trades if t["entry_date"] <= IS_END]
khv_trades = [t for t in all_trades if t["entry_date"] >= KHV_START]

print(f"\n{'='*60}")
print("IS (2002-2018) metrics:")
is_m = compute_metrics(is_trades)
for k, v in is_m.items():
    print(f"  {k}: {v}")

print(f"\nKHV 2021+ (KNOWN HISTORICAL VALIDATION - NOT PRISTINE OOS):")
khv_m = compute_metrics(khv_trades)
for k, v in khv_m.items():
    print(f"  {k}: {v}")

# ── Parameter plateau ─────────────────────────────────────────────────────────

ATR_LENS = [7, 10, 14, 20]
SL_MULTS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
RRS = [1.0, 1.25, 1.5, 2.0, None]

# Pre-compute ATRs
for al in ATR_LENS:
    col = f"atr{al}"
    if col not in df.columns:
        df[col] = calc_atr(df, al)

print(f"\n{'='*60}")
print("Parameter plateau (IS 2002-2018):")
plateau_results = []
for al, sl, rr in product(ATR_LENS, SL_MULTS, RRS):
    t = run_strategy(df, atr_len=al, sl_mult=sl, rr=rr, use_neg_monday=True, atr_col=f"atr{al}")
    t_is = [x for x in t if x["entry_date"] <= IS_END]
    m = compute_metrics(t_is)
    if m:
        plateau_results.append({"atr": al, "sl": sl, "rr": rr, "pf": m["pf"], "trades": m["trades"]})

plateau_results.sort(key=lambda x: -x["pf"])
n_above_1 = sum(1 for p in plateau_results if p["pf"] > 1.0)
pct = 100 * n_above_1 / len(plateau_results)
print(f"Total combos: {len(plateau_results)} | PF>1: {n_above_1} ({pct:.1f}%)")
print("Top 10:")
for p in plateau_results[:10]:
    print(f"  ATR={p['atr']} SL={p['sl']} RR={p['rr']} PF={p['pf']:.4f} N={p['trades']}")

plateau_summary = {
    "total_combos": len(plateau_results),
    "pf_above_1_count": n_above_1,
    "plateau_pct": round(pct, 1),
}

# ── WFO (5yr IS / 1yr OOS) ────────────────────────────────────────────────────

WFO_OOS_YEARS = list(range(2007, 2026))
wfo_oos_trades = []
fold_results = []

print(f"\n{'='*60}")
print("WFO fold results (5yr IS / 1yr OOS, base params ATR=14 SL=1.0 RR=2.0):")
print(f"{'IS period':<14} {'OOS':<6} {'IS PF':<8} {'OOS PF':<8} {'OOS N':<8} {'OOS R':<10} {'Pass'}")

n_pos = 0
for oos_yr in WFO_OOS_YEARS:
    is_start = pd.Timestamp(f"{oos_yr - 5}-01-01")
    is_end = pd.Timestamp(f"{oos_yr - 1}-12-31")
    oos_start = pd.Timestamp(f"{oos_yr}-01-01")
    oos_end = pd.Timestamp(f"{oos_yr}-12-31")

    fold_is = [t for t in all_trades if is_start <= t["entry_date"] <= is_end]
    fold_oos = [t for t in all_trades if oos_start <= t["entry_date"] <= oos_end]
    if not fold_is or not fold_oos:
        continue

    is_pf = compute_metrics(fold_is).get("pf", 0)
    oos_m = compute_metrics(fold_oos)
    pos = oos_m.get("pf", 0) >= 1.0
    if pos:
        n_pos += 1
    oos_r_total = sum(t["gross_r"] for t in fold_oos)

    fold_results.append({
        "oos_year": oos_yr,
        "is_period": f"{oos_yr - 5}\u2013{oos_yr - 1}",
        "oos_period": str(oos_yr),
        "is_pf": round(is_pf, 4),
        "oos_trades": oos_m.get("trades", 0),
        "oos_pf": round(oos_m.get("pf", 0), 4),
        "oos_r_total": round(oos_r_total, 4),
        "oos_positive": pos,
    })
    wfo_oos_trades.extend(fold_oos)
    mark = "+" if pos else "-"
    print(f"  {str(oos_yr-5)+'-'+str(oos_yr-1):<14} {oos_yr:<6} {is_pf:<8.3f} {oos_m.get('pf',0):<8.3f} {oos_m.get('trades',0):<8} {round(oos_r_total,2):<10} {mark}")

wfo_m = compute_metrics(wfo_oos_trades)
# Add aggregate fields
total_r = sum(t["gross_r"] for t in wfo_oos_trades)
n_years = len(fold_results)
wfo_m["total_oos_r"] = round(total_r, 4)
wfo_m["avg_r_per_year"] = round(total_r / n_years, 4) if n_years > 0 else 0
wfo_m["calmar_r"] = round(abs(wfo_m["avg_r_per_year"] / wfo_m["maxdd_r"]), 4) if wfo_m.get("maxdd_r") else None
wfo_m["positive_folds"] = n_pos
wfo_m["total_folds"] = len(fold_results)
wfo_m["positive_fold_ratio"] = round(n_pos / len(fold_results), 4)

print(f"\nWFO aggregate ({n_pos}/{len(fold_results)} folds positive):")
for k, v in wfo_m.items():
    print(f"  {k}: {v}")

# ── Roll audit ────────────────────────────────────────────────────────────────

# CME Dow quarterly expiration: 3rd Friday of Mar/Jun/Sep/Dec
roll_months = [3, 6, 9, 12]
roll_dates = []
for yr in range(2002, 2027):
    for mo in roll_months:
        # 3rd Friday of month
        first = pd.Timestamp(f"{yr}-{mo:02d}-01")
        fridays = [first + pd.Timedelta(days=d) for d in range(0, 28) if (first + pd.Timedelta(days=d)).weekday() == 4]
        if len(fridays) >= 3:
            roll_dates.append(fridays[2])

def is_near_roll(dt, window=5):
    dt = pd.Timestamp(dt)
    return any(abs((dt - rd).days) <= window for rd in roll_dates)

roll_trades = [t for t in all_trades if is_near_roll(t["entry_date"])]
non_roll_trades = [t for t in all_trades if not is_near_roll(t["entry_date"])]

roll_pf = compute_metrics(roll_trades).get("pf", 0) if roll_trades else 0
non_roll_pf = compute_metrics(non_roll_trades).get("pf", 0) if non_roll_trades else 0

# Check for jumps > 5% between consecutive bars (roll artifacts)
price_chg = df["close"].pct_change().abs()
artifacts = (price_chg > 0.05).sum()

roll_audit = {
    "roll_trades": len(roll_trades),
    "roll_pf": round(roll_pf, 4),
    "non_roll_trades": len(non_roll_trades),
    "non_roll_pf": round(non_roll_pf, 4),
    "artifacts_gt5pct": int(artifacts),
}
print(f"\nRoll audit: {len(roll_trades)} roll trades PF {roll_pf:.4f} | {len(non_roll_trades)} non-roll PF {non_roll_pf:.4f} | {artifacts} jumps>5%")

# ── Cost model ────────────────────────────────────────────────────────────────

avg_atr_oos = np.mean([t["atr"] for t in wfo_oos_trades]) if wfo_oos_trades else 309.6

ym_mult = 5  # $5 per point
ym_rt = 11.60  # IBKR + spread + slippage round trip
ym_1r = avg_atr_oos * ym_mult
ym_cost_r = ym_rt / ym_1r
ym_adj = wfo_m.get("expectancy", 0) - ym_cost_r

mym_mult = 0.5
mym_rt = 1.95
mym_1r = avg_atr_oos * mym_mult
mym_cost_r = mym_rt / mym_1r
mym_adj = wfo_m.get("expectancy", 0) - mym_cost_r

cost_model = {
    "avg_atr_oos": round(avg_atr_oos, 1),
    "ym": {
        "multiplier": ym_mult,
        "rt_cost_usd": ym_rt,
        "1r_usd": round(ym_1r, 0),
        "cost_in_r": round(ym_cost_r, 4),
        "adj_expectancy": round(ym_adj, 4),
    },
    "mym": {
        "multiplier": mym_mult,
        "rt_cost_usd": mym_rt,
        "1r_usd": round(mym_1r, 0),
        "cost_in_r": round(mym_cost_r, 4),
        "adj_expectancy": round(mym_adj, 4),
    },
}
print(f"\nCost model: YM 1R=${ym_1r:.0f} cost={ym_cost_r:.4f}R adj_exp={ym_adj:.4f}R | MYM 1R=${mym_1r:.0f} cost={mym_cost_r:.4f}R adj_exp={mym_adj:.4f}R")

# ── GLD correlation ────────────────────────────────────────────────────────────

gld_report_path = Path(__file__).parent.parent.parent / "reports" / "white_swan_gld_refresh.json"
gld_oos_by_year = {}
if gld_report_path.exists():
    with open(gld_report_path) as f:
        gld_data = json.load(f)
    for fold in gld_data.get("wfo_fold_detail", []):
        yr = fold.get("oos_year")
        if yr:
            gld_oos_by_year[yr] = fold.get("oos_cagr_pct", 0)

# YM TAT WFO OOS R by year
ym_r_by_year = {}
for fold in fold_results:
    ym_r_by_year[fold["oos_year"]] = fold["oos_r_total"]

overlap_years = sorted(set(gld_oos_by_year.keys()) & set(ym_r_by_year.keys()))
if len(overlap_years) >= 3:
    ym_arr = np.array([ym_r_by_year[y] for y in overlap_years])
    gld_arr = np.array([gld_oos_by_year[y] for y in overlap_years])
    if np.std(ym_arr) > 0 and np.std(gld_arr) > 0:
        pearson_r = float(np.corrcoef(ym_arr, gld_arr)[0, 1])
    else:
        pearson_r = float("nan")
    sim_losing = int(sum(1 for y in overlap_years if ym_r_by_year[y] < 0 and gld_oos_by_year[y] < 0))
else:
    pearson_r = float("nan")
    sim_losing = 0

gld_corr = {
    "overlap_years": overlap_years,
    "pearson_r": round(pearson_r, 3) if not np.isnan(pearson_r) else None,
    "simultaneous_losing_years": sim_losing,
}
print(f"\nGLD correlation (overlap {len(overlap_years)} years): Pearson={pearson_r:.3f} | Sim losing years: {sim_losing}")

# ── 30-trade reconciliation ───────────────────────────────────────────────────

years_used = set()
sample = []
for t in all_trades:
    yr = t["entry_date"].year
    if yr not in years_used:
        sample.append(t)
        years_used.add(yr)
for t in all_trades:
    if len(sample) >= 30:
        break
    if t not in sample:
        sample.append(t)
sample = sorted(sample, key=lambda x: x["entry_date"])[:30]

# ── Verdict ───────────────────────────────────────────────────────────────────

exp = wfo_m.get("expectancy", 0)
wfo_pf = wfo_m.get("pf", 0)
fold_ratio = wfo_m.get("positive_fold_ratio", 0)
plateau_pass = plateau_summary["plateau_pct"] >= 60.0
ym_cost_pass = ym_adj > 0
roll_pass = roll_audit["artifacts_gt5pct"] < 10  # no catastrophic roll
khv_pass = khv_m.get("pf", 0) > 0.90

gates = [
    {"gate": "WFO expectancy > 0", "pass": str(exp > 0), "value": exp},
    {"gate": "WFO PF > 1.1", "pass": wfo_pf > 1.1, "value": wfo_pf},
    {"gate": "Positive fold ratio >= 50%", "pass": fold_ratio >= 0.50, "value": fold_ratio},
    {"gate": "IS plateau >= 60% combos PF>1", "pass": str(plateau_pass), "value": plateau_summary["plateau_pct"]},
    {"gate": "Costs (YM 1x) preserve positive expectancy", "pass": str(ym_cost_pass), "value": ym_adj},
    {"gate": "Roll artifact: no catastrophic jumps", "pass": roll_pass, "value": roll_audit["artifacts_gt5pct"]},
    {"gate": "KHV 2021+ PF > 0.90", "pass": khv_pass, "value": khv_m.get("pf", 0)},
]

all_pass = all(g["pass"] if isinstance(g["pass"], bool) else g["pass"] == "True" for g in gates)
verdict = "KEEP" if all_pass else "WATCH"

print(f"\n{'='*60}")
print(f"VERDICT: {verdict}")
for g in gates:
    mark = "PASS" if (g["pass"] if isinstance(g["pass"], bool) else g["pass"] == "True") else "FAIL"
    print(f"  [{mark}] {g['gate']}: {g['value']}")

# ── Save outputs ──────────────────────────────────────────────────────────────

out_dir = Path(__file__).parent.parent.parent / "reports"
out_dir.mkdir(exist_ok=True)

result = {
    "run_date": str(pd.Timestamp.now()),
    "data_source": str(ym_path),
    "data_rows": len(df),
    "data_start": str(df["date"].min().date()),
    "data_end": str(df["date"].max().date()),
    "base_params": {"atrLength": 14, "slMult": 1.0, "rr": 2.0, "filter": "neg_monday"},
    "is_metrics": is_m,
    "parameter_plateau_summary": plateau_summary,
    "wfo_fold_detail": fold_results,
    "wfo_aggregate": wfo_m,
    "khv_metrics": {**khv_m, "period": "2021-2025", "label": "KNOWN HISTORICAL VALIDATION \u2014 NOT PRISTINE OOS"},
    "cost_model": cost_model,
    "roll_audit": roll_audit,
    "gld_correlation": gld_corr,
    "verdict": verdict,
    "verdict_reasons": gates,
    "recon_trades_30": [
        {k: (str(v) if isinstance(v, pd.Timestamp) else v) for k, v in t.items()}
        for t in sample
    ],
}

with open(out_dir / "white_swan_dow_tat_audit_v1.json", "w") as f:
    json.dump(result, f, indent=2, default=str)

print(f"\n[output] Saved: {out_dir / 'white_swan_dow_tat_audit_v1.json'}")
print("[done] Dow TAT audit v1 complete.")
