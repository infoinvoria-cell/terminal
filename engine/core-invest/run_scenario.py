"""
Core Invest Scenario Runner
Accepts draft weights and risk params via JSON config.
Runs a real computation against canonical data — no mocking.
Outputs results to data/core-invest/scenarios/{runId}/

Usage:
  python run_scenario.py --config /path/to/config.json [--run-id abc123]

Config JSON schema:
  {
    "strategy_version": "v2.0-demo-audit",
    "start_date": "2008-05-29",
    "end_date": "2026-07-31",
    "initial_nav": 25000,
    "draft_weights": { "SPY": 0.61, "QQQ": 0.20, ... },
    "rebalance_mode": "auto_cash" | "proportional" | "manual",
    "risk_params": {
      "exposure_cap": 1.60,
      "financing_spread": 0.015,
      "fee_rate": 0.25
    },
    "data_hashes": {...},
    "code_version": "local"
  }
"""
from __future__ import annotations
import argparse, hashlib, json, math, sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

# ---------- Paths ----------
ENGINE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ENGINE_DIR.parent.parent
CANONICAL_DIR = PROJECT_ROOT / "data" / "core-invest" / "canonical"
REFERENCE_DIR = PROJECT_ROOT / "data" / "core-invest" / "reference"
SCENARIOS_DIR = PROJECT_ROOT / "data" / "core-invest" / "scenarios"

ETF_TICKERS = ["SPY", "QQQ", "RSP", "IWM", "EFA", "EEM", "QUAL", "MTUM", "VLUE", "USMV", "GLD", "IEF", "BIL"]

BASELINE_NAV     = 25_000.0
BASELINE_FEE     = 0.25
BASELINE_ETF_COST = 0.0005
BASELINE_FINANCING = 0.015
BASELINE_CAP      = 1.60


# ---------- Helpers ----------

def _write_status(out: Path, run_id: str, status: str, phase: str, extra: dict | None = None):
    d = {"run_id": run_id, "status": status, "phase": phase,
         "updated_at": datetime.utcnow().isoformat()}
    if extra:
        d.update(extra)
    (out / "status.json").write_text(json.dumps(d), encoding="utf-8")


def load_close(path: Path, idx: pd.DatetimeIndex) -> pd.Series:
    df = pd.read_csv(path, usecols=["time", "close"])
    ts = pd.to_datetime(df["time"], utc=True).dt.tz_convert(None).dt.normalize()
    s = pd.Series(pd.to_numeric(df["close"]).to_numpy(float), index=ts).sort_index()
    return s.reindex(idx).ffill()


def apply_fee(gross: pd.Series, rate: float = 0.25, initial: float = 1.0) -> pd.Series:
    nav = hwm = float(initial)
    out: list[float] = []
    q = gross.index.to_period("Q")
    n = len(gross)
    for i, (_, r) in enumerate(gross.fillna(0).items()):
        before = nav
        nav *= 1 + float(r)
        fee = 0.0
        if i == n - 1 or q[i + 1] != q[i]:
            if nav > hwm:
                fee = rate * (nav - hwm)
                nav -= fee
                hwm = nav
        out.append(nav / before - 1 if before != 0 else 0.0)
    return pd.Series(out, index=gross.index, name="net")


def maxdd(r: pd.Series) -> float:
    eq = (1 + r.fillna(0)).cumprod()
    return float((eq / eq.cummax() - 1).min())


def compute_metrics(net: pd.Series, spy: pd.Series) -> dict:
    days = len(net)
    years = days / 252
    total = float((1 + net.fillna(0)).prod())
    cagr = total ** (1 / years) - 1 if years > 0 else 0.0
    ann_vol = float(net.std() * math.sqrt(252))
    sharpe = cagr / ann_vol if ann_vol > 0 else 0.0
    dd = maxdd(net)
    calmar = cagr / abs(dd) if dd < 0 else 0.0

    monthly_rets: list[float] = []
    for period, grp in net.resample("ME"):
        if len(grp):
            monthly_rets.append(float((1 + grp).prod() - 1))
    pos_months = sum(1 for m in monthly_rets if m > 0)
    pos_months_pct = pos_months / len(monthly_rets) * 100 if monthly_rets else 0.0

    aligned = spy.reindex(net.index).fillna(0)
    beta = corr = 0.0
    if len(aligned) > 10:
        cov = float(net.cov(aligned))
        spy_var = float(aligned.var())
        beta = cov / spy_var if spy_var > 0 else 0.0
        corr = float(net.corr(aligned))

    worst_year = 1.0
    for y in net.index.year.unique():
        yr_ret = float((1 + net[net.index.year == y]).prod() - 1)
        if yr_ret < worst_year:
            worst_year = yr_ret

    sortino_denom = float(net[net < 0].std() * math.sqrt(252)) if (net < 0).any() else 0.0
    sortino = cagr / sortino_denom if sortino_denom > 0 else 0.0

    return {
        "total_return_pct": round((total - 1) * 100, 2),
        "cagr_pct": round(cagr * 100, 2),
        "volatility_pct": round(ann_vol * 100, 2),
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2),
        "calmar": round(calmar, 2),
        "max_drawdown_pct": round(dd * 100, 2),
        "positive_months_pct": round(pos_months_pct, 1),
        "beta_to_spy": round(beta, 2),
        "correlation_to_spy": round(corr, 2),
        "worst_year_pct": round(worst_year * 100, 2),
        "data_points": days,
    }


# ---------- Main runner ----------

def run_scenario(config: dict, run_id: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.utcnow().isoformat()
    _write_status(out_dir, run_id, "RUNNING", "Preparing Data",
                  {"started_at": started_at})

    try:
        # ---- Parse config ----
        start = pd.Timestamp(config.get("start_date", "2008-05-29"))
        end   = pd.Timestamp(config.get("end_date",   "2026-07-31"))
        initial_nav = float(config.get("initial_nav", BASELINE_NAV))
        fee_rate = float(config.get("risk_params", {}).get("fee_rate",   BASELINE_FEE))
        exp_cap  = float(config.get("risk_params", {}).get("exposure_cap", BASELINE_CAP))
        fin_spread = float(config.get("risk_params", {}).get("financing_spread", BASELINE_FINANCING))
        draft_weights: dict[str, float] = config.get("draft_weights", {})
        rebalance_mode: str = config.get("rebalance_mode", "auto_cash")

        # ---- Load reference equity curves (for trading calendar) ----
        ref_path = REFERENCE_DIR / "daily_equity_curves.csv"
        if not ref_path.exists():
            raise FileNotFoundError(f"Reference curves not found: {ref_path}")
        ref = pd.read_csv(ref_path, parse_dates=["date"]).set_index("date").loc[start:end]
        idx = ref.index

        # ---- Load reference daily weights (baseline) ----
        wt_path = REFERENCE_DIR / "daily_target_weights.csv"
        if not wt_path.exists():
            raise FileNotFoundError(f"Reference weights not found: {wt_path}")
        base_w = (pd.read_csv(wt_path, parse_dates=["date"])
                    .set_index("date")
                    .reindex(idx)
                    .ffill()
                    .fillna(0))

        # Keep only ETF columns
        etf_cols = [c for c in ETF_TICKERS if c in base_w.columns]
        base_w = base_w[etf_cols]

        _write_status(out_dir, run_id, "RUNNING", "Running Backtrader")

        # ---- Build scenario weights ----
        scen_w = base_w.copy()

        if draft_weights:
            last = base_w.iloc[-1]
            for ticker, new_w in draft_weights.items():
                if ticker not in etf_cols:
                    continue
                old_w = float(last.get(ticker, 0))
                if ticker == "BIL":
                    # BIL / cash: set directly at the last date's ratio
                    if abs(old_w) > 1e-6:
                        scen_w[ticker] = scen_w[ticker] * (new_w / old_w)
                    else:
                        scen_w[ticker] = new_w
                else:
                    if abs(old_w) > 1e-4:
                        ratio = new_w / old_w
                        scen_w[ticker] = (scen_w[ticker] * ratio).clip(lower=-0.5, upper=2.5)
                    else:
                        scen_w[ticker] = new_w

            # Rebalance: adjust BIL / cash to restore sum
            non_bil = [c for c in etf_cols if c != "BIL"]
            long_sum = scen_w[non_bil].sum(axis=1)

            if rebalance_mode == "auto_cash" and "BIL" in etf_cols:
                scen_w["BIL"] = 1.0 - long_sum
            elif rebalance_mode == "proportional":
                # Scale all non-overridden assets proportionally
                overridden = set(draft_weights.keys())
                free_cols = [c for c in non_bil if c not in overridden and c != "BIL"]
                fixed_sum = scen_w[[c for c in non_bil if c in overridden]].sum(axis=1)
                if free_cols:
                    base_free_sum = base_w[free_cols].sum(axis=1).replace(0, 1)
                    target_free = 1.0 - fixed_sum - (scen_w["BIL"] if "BIL" in etf_cols else 0)
                    scale_f = target_free / base_free_sum
                    for c in free_cols:
                        scen_w[c] = scen_w[c] * scale_f

        # ---- Apply exposure cap ----
        long_only = [c for c in etf_cols if c != "BIL"]
        long_exp  = scen_w[long_only].clip(lower=0).sum(axis=1)
        cap_scale = (exp_cap / long_exp).clip(upper=1.0).fillna(1.0)
        scen_w[long_only] = scen_w[long_only].mul(cap_scale, axis=0)
        if "BIL" in etf_cols:
            scen_w["BIL"] = 1.0 - scen_w[long_only].sum(axis=1)

        _write_status(out_dir, run_id, "RUNNING", "Calculating Fees")

        # ---- Load canonical ETF prices → daily returns ----
        price_cols: dict[str, pd.Series] = {}
        for t in etf_cols:
            fp = CANONICAL_DIR / f"{t}.csv"
            if fp.exists():
                price_cols[t] = load_close(fp, idx)
        if not price_cols:
            raise FileNotFoundError("No canonical ETF CSV files found in " + str(CANONICAL_DIR))
        prices_df = pd.DataFrame(price_cols)
        rets = prices_df.pct_change(fill_method=None).fillna(0)

        # ---- Gross return (scenario) ----
        common_cols = [c for c in etf_cols if c in rets.columns]
        # Baseline daily return from reference weights
        base_daily   = (base_w[common_cols].shift(1).fillna(0) * rets[common_cols]).sum(axis=1)
        # Scenario daily return from draft weights
        scen_daily   = (scen_w[common_cols].shift(1).fillna(0) * rets[common_cols]).sum(axis=1)

        # Transaction cost delta
        base_turn    = base_w.diff().abs().sum(axis=1).fillna(0)
        scen_turn    = scen_w.diff().abs().sum(axis=1).fillna(0)
        cost_delta   = (scen_turn - base_turn) * BASELINE_ETF_COST / 2

        # Financing cost delta (negative BIL = leverage → borrowing cost)
        spread_daily = (1 + fin_spread) ** (1 / 252) - 1
        base_borrow  = (-base_w["BIL"].clip(upper=0) if "BIL" in base_w else pd.Series(0, index=idx))
        scen_borrow  = (-scen_w["BIL"].clip(upper=0) if "BIL" in scen_w else pd.Series(0, index=idx))
        fin_delta    = (scen_borrow - base_borrow) * spread_daily

        # Reference gross (from pre-computed output) + incremental delta
        ref_gross     = ref["Core Gross"]
        scen_gross    = ref_gross - base_daily + scen_daily - cost_delta - fin_delta

        # Apply fee model
        scen_net = apply_fee(scen_gross, fee_rate, initial_nav / BASELINE_NAV)
        spy_ret  = rets["SPY"] if "SPY" in rets else pd.Series(0, index=idx)

        _write_status(out_dir, run_id, "RUNNING", "Calculating Metrics")

        # ---- Build equity indices ----
        net_idx   = initial_nav * (1 + scen_net.fillna(0)).cumprod()
        gross_idx = initial_nav * (1 + scen_gross.fillna(0)).cumprod()
        spy_idx   = initial_nav * (1 + spy_ret.fillna(0)).cumprod()

        # ---- Daily equity curves CSV ----
        daily = pd.DataFrame({
            "date":                          idx,
            "Core Gross":                    scen_gross.values,
            "Core Investor Net":             scen_net.values,
            "SPY":                           spy_ret.values,
            "Core Gross Index":              gross_idx.values,
            "Core Investor Net Index":       net_idx.values,
            "SPY Index":                     spy_idx.values,
            "Core Gross Drawdown":           (gross_idx / gross_idx.cummax() - 1).values,
            "Core Investor Net Drawdown":    (net_idx   / net_idx.cummax()   - 1).values,
            "SPY Drawdown":                  (spy_idx   / spy_idx.cummax()   - 1).values,
        })
        daily.to_csv(out_dir / "daily_equity_curves.csv", index=False)

        # ---- Annual performance CSV ----
        annual_rows = []
        for y in sorted(set(idx.year)):
            gm = scen_gross[scen_gross.index.year == y]
            nm = scen_net[scen_net.index.year == y]
            sm = spy_ret[spy_ret.index.year == y]
            annual_rows.append([
                y, gm.index[-1], gm.index[-1].month != 12,
                float((1 + gm).prod() - 1),
                float((1 + nm).prod() - 1),
                float((1 + sm).prod() - 1),
                float((1 + nm).prod() - (1 + sm).prod()),
                maxdd(nm), maxdd(sm),
            ])
        pd.DataFrame(annual_rows, columns=[
            "year", "period_end", "partial_year",
            "core_gross_return", "core_investor_net_return", "spy_return",
            "net_alpha", "core_net_max_dd", "spy_max_dd",
        ]).to_csv(out_dir / "annual_performance.csv", index=False)

        # ---- Weights snapshot ----
        scen_w.reset_index(names="date").to_csv(out_dir / "daily_target_weights.csv", index=False)

        # ---- Metrics ----
        m = compute_metrics(scen_net, spy_ret)

        _write_status(out_dir, run_id, "RUNNING", "Validating")

        # ---- Config hash (for caching) ----
        config_str  = json.dumps(config, sort_keys=True)
        config_hash = hashlib.sha256(config_str.encode()).hexdigest()[:16]

        # ---- Result manifest ----
        result = {
            "run_id":           run_id,
            "strategy_version": config.get("strategy_version", "v2.0-demo-audit"),
            "scenario_label":   "SCENARIO – nicht gespeichert",
            "config":           config,
            "config_hash":      config_hash,
            "metrics":          m,
            "period":           {"start": str(start.date()), "end": str(idx[-1].date())},
            "last_weights":     {t: round(float(scen_w[t].iloc[-1]), 4) for t in etf_cols if t in scen_w},
            "exposure": {
                "gross_long":   round(float(scen_w[long_only].clip(lower=0).iloc[-1].sum()), 4),
                "gross_short":  round(float((-scen_w[long_only]).clip(lower=0).iloc[-1].sum()), 4),
                "net":          round(float(scen_w[long_only].iloc[-1].sum()), 4),
                "cash_bil":     round(float(scen_w["BIL"].iloc[-1]) if "BIL" in scen_w else 0.0, 4),
            },
            "started_at":    started_at,
            "completed_at":  datetime.utcnow().isoformat(),
            "data_source":   str(REFERENCE_DIR),
        }
        (out_dir / "result.json").write_text(
            json.dumps(result, indent=2, default=str), encoding="utf-8"
        )

        _write_status(out_dir, run_id, "COMPLETE", "Complete",
                      {"completed_at": result["completed_at"]})
        print(json.dumps({"run_id": run_id, "status": "COMPLETE",
                          "metrics": m}, default=str))

    except Exception as exc:
        import traceback as tb
        err_info = {"run_id": run_id, "status": "FAILED", "error": str(exc),
                    "traceback": tb.format_exc(), "failed_at": datetime.utcnow().isoformat()}
        (out_dir / "status.json").write_text(json.dumps(err_info), encoding="utf-8")
        print(json.dumps({"run_id": run_id, "status": "FAILED", "error": str(exc)}),
              file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Core Invest Scenario Runner")
    ap.add_argument("--config",  type=Path, required=True, help="Path to scenario config JSON")
    ap.add_argument("--run-id",  default=None, help="Run ID (auto-generated if omitted)")
    ap.add_argument("--out-dir", type=Path, default=None, help="Output directory (auto if omitted)")
    args = ap.parse_args()

    import uuid
    rid = args.run_id or str(uuid.uuid4()).replace("-", "")[:12]
    odir = args.out_dir or (SCENARIOS_DIR / rid)

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    run_scenario(cfg, rid, odir)
