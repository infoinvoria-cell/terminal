"""
White Swan GLD Thursday Long — canonical data refresh and Pine reconciliation
Data source: BATS_GLD, 1D_4975f.csv (5436 rows, 2004-11-18 to 2026-07-01)
NOTE: GLD(2).csv (5440 rows, 2026-07-07) was not found on local disk as of 2026-08-09.
      When available, re-run with that file — only 3–4 bars added, metrics expected unchanged.
Locked parameters: ATR=10, SL=0.75×, no TP, Thursday close entry, next daily close exit
Close-fill semantics throughout.
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
import glob

# ── Data ──────────────────────────────────────────────────────────────────────

DATA_PATHS = [
    r"C:\Users\joris\Downloads\BATS_GLD, 1D_4975f.csv",
    r"C:\Users\joris\Downloads\GLD(2).csv",
    r"C:\Users\joris\Downloads\GLD (2).csv",
]

gld_path = None
for p in DATA_PATHS:
    if Path(p).exists():
        gld_path = p
        break

if gld_path is None:
    # search
    found = glob.glob(r"C:\Users\joris\Downloads\*GLD*2*.csv")
    if found:
        gld_path = found[0]
    else:
        raise FileNotFoundError(
            f"GLD data not found. Searched: {DATA_PATHS}\n"
            "Place GLD(2).csv (5440 rows) in Downloads and re-run."
        )

print(f"[data] Using: {gld_path}")
gld = pd.read_csv(gld_path, parse_dates=["time"])
gld = gld.rename(columns={"time": "date"})
gld = gld.sort_values("date").reset_index(drop=True)
gld["date"] = pd.to_datetime(gld["date"]).dt.normalize()

# Validate
dups = gld["date"].duplicated().sum()
nulls = gld.isnull().sum().sum()
ohlc_violations = (
    (gld["high"] < gld["open"]) | (gld["high"] < gld["close"]) |
    (gld["low"] > gld["open"]) | (gld["low"] > gld["close"]) |
    (gld["high"] < gld["low"])
).sum()

print(f"[data] Rows: {len(gld)} | Range: {gld['date'].min().date()} to {gld['date'].max().date()}")
print(f"[data] Duplicates: {dups} | Nulls: {nulls} | OHLC violations: {ohlc_violations}")

# Show bars around July 4 2026 holiday
july_window = gld[(gld["date"] >= "2026-06-28") & (gld["date"] <= "2026-07-10")]
print("[data] Bars around 2026-07-04 holiday window:")
for _, r in july_window.iterrows():
    dow = r["date"].strftime("%a")
    print(f"  {r['date'].date()} {dow}  O={r['open']:.2f} H={r['high']:.2f} L={r['low']:.2f} C={r['close']:.2f}")

# ── Strategy parameters ───────────────────────────────────────────────────────

ATR_LEN   = 10
SL_MULT   = 0.75
TP_RATIO  = None          # no TP
INIT_EQUITY = 100_000.0   # USD
RISK_PCT    = 0.01        # 1% per trade

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

gld["atr"] = calc_atr(gld, ATR_LEN)
gld["weekday"] = gld["date"].dt.weekday  # 0=Mon, 3=Thu, 4=Fri

# ── Trade loop ────────────────────────────────────────────────────────────────

trades = []
in_trade = False
entry_idx = None

for i in range(ATR_LEN, len(gld)):
    row = gld.iloc[i]

    if in_trade:
        # Check SL intrabar (approximate: if low < stop, SL hit)
        if row["low"] <= stop_price:
            exit_price = stop_price
            exit_reason = "SL"
        else:
            # Time exit: next daily close after entry
            exit_price = row["close"]
            exit_reason = "time"

        gross_r = (exit_price - entry_price) / sl_dist if sl_dist > 0 else 0.0
        trades.append({
            "entry_date": entry_date, "entry_price": entry_price,
            "atr": entry_atr, "sl_dist": sl_dist, "stop_price": stop_price,
            "exit_date": row["date"], "exit_price": exit_price,
            "exit_reason": exit_reason, "gross_r": round(gross_r, 4),
        })
        in_trade = False
        entry_idx = None

    # Entry: Thursday close, no open position
    if not in_trade and row["weekday"] == 3 and not np.isnan(row["atr"]):
        entry_date  = row["date"]
        entry_price = row["close"]
        entry_atr   = row["atr"]
        sl_dist     = SL_MULT * entry_atr
        stop_price  = entry_price - sl_dist
        in_trade    = True
        entry_idx   = i

# ── Metric helpers ────────────────────────────────────────────────────────────

def compute_metrics(trade_list, label="", equity_start=INIT_EQUITY, risk_pct=RISK_PCT):
    if not trade_list:
        return {}
    rs = np.array([t["gross_r"] for t in trade_list])
    wins = (rs > 0).sum()
    losses = (rs <= 0).sum()
    gross_profit = rs[rs > 0].sum() if wins > 0 else 0
    gross_loss   = abs(rs[rs < 0].sum()) if losses > 0 else 1e-9
    pf = gross_profit / gross_loss if gross_loss > 0 else np.inf
    win_rate = wins / len(rs)
    avg_r    = rs.mean()
    payoff   = (gross_profit / wins) / (gross_loss / losses) if wins > 0 and losses > 0 else np.nan

    # Equity curve
    eq = [equity_start]
    for r in rs:
        risk_cash = eq[-1] * risk_pct
        eq.append(eq[-1] + r * risk_cash)
    eq = np.array(eq)
    peak = np.maximum.accumulate(eq)
    dd   = (eq / peak) - 1
    max_dd = dd.min()

    n_years = (trade_list[-1]["exit_date"] - trade_list[0]["entry_date"]).days / 365.25
    cagr = (eq[-1] / eq[0]) ** (1 / n_years) - 1 if n_years > 0.1 else np.nan
    calmar = abs(cagr / max_dd) if max_dd < 0 else np.nan

    return {
        "trades": len(trade_list), "pf": round(pf, 4), "win_pct": round(win_rate * 100, 2),
        "avg_r": round(avg_r, 4), "payoff": round(payoff, 3) if not np.isnan(payoff) else None,
        "cagr_pct": round(cagr * 100, 2) if not np.isnan(cagr) else None,
        "max_dd_pct": round(max_dd * 100, 2), "calmar": round(calmar, 3) if not np.isnan(calmar) else None,
        "final_equity": round(eq[-1], 2),
    }

# ── Period slicing ─────────────────────────────────────────────────────────────

IS_END   = pd.Timestamp("2020-12-31")
KHV_START = pd.Timestamp("2021-01-01")

is_trades  = [t for t in trades if t["entry_date"] <= IS_END]
khv_trades = [t for t in trades if t["entry_date"] >= KHV_START]

print(f"\n{'='*60}")
print("IS (2004-2020) metrics:")
is_m = compute_metrics(is_trades, "IS")
for k, v in is_m.items():
    print(f"  {k}: {v}")

print(f"\nKHV 2021-2026 (KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS):")
khv_m = compute_metrics(khv_trades, "KHV")
for k, v in khv_m.items():
    print(f"  {k}: {v}")

# ── WFO (5yr IS → 1yr OOS, same as v2 12-fold protocol) ─────────────────────

WFO_FOLDS = [
    (pd.Timestamp(f"{y-5}-01-01"), pd.Timestamp(f"{y-1}-12-31"), pd.Timestamp(f"{y}-01-01"), pd.Timestamp(f"{y}-12-31"))
    for y in range(2009, 2021)
]

wfo_oos_trades = []
fold_results = []

for is_start, is_end, oos_start, oos_end in WFO_FOLDS:
    fold_is  = [t for t in trades if is_start <= t["entry_date"] <= is_end]
    fold_oos = [t for t in trades if oos_start <= t["entry_date"] <= oos_end]
    if not fold_is or not fold_oos:
        continue
    is_pf = compute_metrics(fold_is).get("pf", 0)
    oos_m  = compute_metrics(fold_oos)
    fold_results.append({
        "is": f"{is_start.year}-{is_end.year}", "oos_year": oos_start.year,
        "is_pf": is_pf, **{f"oos_{k}": v for k, v in oos_m.items()}
    })
    wfo_oos_trades.extend(fold_oos)

print(f"\nWFO fold results:")
print(f"{'IS period':<12} {'OOS yr':<8} {'IS PF':<8} {'OOS PF':<8} {'OOS trades':<12} {'OOS CAGR%':<10}")
n_pos = 0
for f in fold_results:
    pos = "+" if f["oos_pf"] >= 1.0 else "-"
    if f["oos_pf"] >= 1.0:
        n_pos += 1
    print(f"  {f['is']:<12} {f['oos_year']:<8} {f['is_pf']:<8.3f} {f['oos_pf']:<8.3f} {f['oos_trades']:<12} {str(f['oos_cagr_pct']):<10} {pos}")

wfo_m = compute_metrics(wfo_oos_trades, "WFO OOS")
print(f"\nWFO aggregate ({n_pos}/{len(fold_results)} folds positive):")
for k, v in wfo_m.items():
    print(f"  {k}: {v}")

# ── 30-trade reconciliation sample ────────────────────────────────────────────

years_shown = set()
sample_trades = []
for t in trades:
    yr = t["entry_date"].year
    if yr not in years_shown and len(sample_trades) < 30:
        sample_trades.append(t)
        years_shown.add(yr)

# fill to 30 if needed
for t in trades:
    if len(sample_trades) >= 30:
        break
    if t not in sample_trades:
        sample_trades.append(t)

sample_trades = sorted(sample_trades, key=lambda x: x["entry_date"])[:30]

print(f"\n{'='*60}")
print("30-trade reconciliation sample (ATR=10 SL=0.75 no-TP canonical):")
print(f"{'#':<4} {'Entry date':<14} {'Entry $':<10} {'ATR':<8} {'Stop $':<10} {'Exit date':<14} {'Exit $':<10} {'Reason':<8} {'Gross R':<8}")
for i, t in enumerate(sample_trades, 1):
    print(f"{i:<4} {str(t['entry_date'].date()):<14} {t['entry_price']:<10.2f} "
          f"{t['atr']:<8.3f} {t['stop_price']:<10.2f} "
          f"{str(t['exit_date'].date()):<14} {t['exit_price']:<10.2f} "
          f"{t['exit_reason']:<8} {t['gross_r']:<8.4f}")

# ── Save outputs ──────────────────────────────────────────────────────────────

out_dir = Path(__file__).parent.parent.parent / "reports"
out_dir.mkdir(exist_ok=True)

result = {
    "run_date": "2026-08-09",
    "data_source": str(gld_path),
    "data_rows": len(gld),
    "data_start": str(gld["date"].min().date()),
    "data_end":   str(gld["date"].max().date()),
    "locked_params": {"atr_len": ATR_LEN, "sl_mult": SL_MULT, "tp": None},
    "is_metrics": is_m,
    "wfo_metrics": wfo_m,
    "wfo_folds_positive": f"{n_pos}/{len(fold_results)}",
    "wfo_fold_detail": fold_results,
    "khv_metrics": khv_m,
    "trade_reconciliation_30": [
        {k: (str(v) if isinstance(v, pd.Timestamp) else v) for k, v in t.items()}
        for t in sample_trades
    ],
}

with open(out_dir / "white_swan_gld_refresh.json", "w") as f:
    json.dump(result, f, indent=2, default=str)

print(f"\n[output] Saved: {out_dir / 'white_swan_gld_refresh.json'}")
print("[done] GLD refresh complete.")
