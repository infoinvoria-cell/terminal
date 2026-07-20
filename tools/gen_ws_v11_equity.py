"""
Generate White Swan v1.1 equity curve data.
Adds groupSeries["Intraday MT v3-F"] to analytics-generated.json.
Intraday = MT v3-F portfolio (EUR 30m 40%, DAX 1H 40%, GBP 30m 5%, DAX 2H 15%)
OOS window: 2019-01 – 2026-07
"""
from __future__ import annotations

import calendar
import datetime
import importlib.util
import json
import math
import sys
from dataclasses import replace
from pathlib import Path

sys.stdout = open(1, mode="w", encoding="utf-8", errors="replace", closefd=False)

ROOT   = Path(__file__).resolve().parent.parent
BRAIN  = Path(r"C:\Users\joris\Documents\Capitalife Brain")
VALID  = BRAIN / "16_Backtesting_Validation"
DATA   = {
    "EUR30m": BRAIN / "08_Data" / "ohlc_cache" / "30M" / "OANDA_EURUSD_30M.json",
    "GBP30m": BRAIN / "08_Data" / "ohlc_cache" / "30M" / "OANDA_GBPUSD_30M.json",
    "DAX1H":  BRAIN / "08_Data" / "ohlc_cache" / "1H"  / "OANDA_DE30EUR_1H.json",
    "DAX2H":  BRAIN / "08_Data" / "ohlc_cache" / "2H"  / "OANDA_DE30EUR_2H.json",
}
OUT_JSON   = ROOT / "src" / "data" / "capitalife" / "analytics-generated.json"
OOS_START  = "2019-01-01"
OOS_END    = "2026-07-31"
TOTAL_RISK = 0.01
IB_R = {"EUR30m": 1.0/13.0, "GBP30m": 2.0/10.0, "DAX1H": 1.5/40.0, "DAX2H": 1.5/50.0}
V3F_W = {"EUR30m": 0.40, "DAX1H": 0.40, "GBP30m": 0.05, "DAX2H": 0.15}


# ── helpers ───────────────────────────────────────────────────────────────────
def _load(path):
    raw  = json.loads(path.read_text(encoding="utf-8"))
    bars = raw.get("bars", raw) if isinstance(raw, dict) else raw
    bars.sort(key=lambda b: str(b.get("date", "") or b.get("time", "")))
    return bars

def _slice(bars, s, e):
    return [b for b in bars if s <= str(b.get("date","") or b.get("time",""))[:10] <= e]

def _dt(bar):
    s = str(bar.get("date","") or bar.get("time","")).replace("T"," ").replace("Z","").split("+")[0][:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try: return datetime.datetime.strptime(s, fmt)
        except: pass
    return None

def _dk(b): return str(b.get("date","") or b.get("time",""))[:10]

def _ema(vals, p):
    out = [None]*len(vals)
    if p <= 0 or len(vals) < p: return out
    k = 2/(p+1); out[p-1] = sum(vals[:p])/p
    for i in range(p, len(vals)):
        out[i] = vals[i]*k + out[i-1]*(1-k)
    return out

def _sma(vals, p):
    out = [None]*len(vals)
    for i in range(p-1, len(vals)):
        out[i] = sum(vals[i-p+1:i+1])/p
    return out

def _atr(h, l, c, p):
    trs = []
    for i in range(len(c)):
        pr = c[i-1] if i>0 else c[i]
        trs.append(max(h[i]-l[i], abs(h[i]-pr), abs(l[i]-pr)))
    return _sma(trs, p)

def month_end(ym: str) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    return f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"

# ── DAX 1H ────────────────────────────────────────────────────────────────────
def _sweep_l(bars, i):
    for lb in range(3, 10):
        if i < lb: continue
        up=bars[i-lb+1]; bear=bars[i-1]; base=bars[i-lb]; cur=bars[i]
        if up["open"]>=up["close"]: continue
        if base["open"]<=base["close"]: continue
        if bear["open"]<=bear["close"]: continue
        if bear["close"]>=up["open"]: continue
        if cur["close"]<=up["open"]: continue
        if (up["open"]-bear["close"])<=0.01: continue
        if all(bars[j]["close"]>base["close"] for j in range(i-lb+2,i-1)):
            return True
    return False

def run_dax1h(bars):
    SL_A=40.0; TP_A=100.0
    n=len(bars); ema=_ema([b["close"] for b in bars],2)
    trades=[]; pos=None; td={}
    for i in range(15, n):
        bar=bars[i]; dt=_dt(bar)
        if dt is None or dt.isoweekday()>5 or ema[i] is None: continue
        dk=_dk(bar)
        if pos is not None and pos["idx"]<i:
            entry=pos["entry"]; sl_c=pos["be_sl"] if pos["be_on"] else pos["sl"]
            hi,lo,op=bar["high"],bar["low"],bar["open"]
            if not pos["be_t"]:
                if hi>=entry+SL_A*1.5: pos["be_t"]=True
            elif not pos["be_on"]:
                pos["be_on"]=True; pos["be_sl"]=entry; sl_c=entry
            ep=er=None
            if   op<=sl_c:               ep,er=op,"sl"
            elif op>=pos["tp"]:          ep,er=op,"tp"
            elif lo<=sl_c and hi>=pos["tp"]: ep,er=sl_c,"sl"
            elif hi>=pos["tp"]:          ep,er=pos["tp"],"tp"
            elif lo<=sl_c:               ep,er=sl_c,"sl"
            if ep is not None:
                trades.append({"pnl_r":round((ep-entry)/SL_A,4),"exit_date":dk,"source":"DAX1H"})
                pos=None
        if not (7<=dt.hour<12): continue
        if not (0<bar["close"]-bar["open"]<100): continue
        if bar["close"]<=ema[i]: continue
        if not _sweep_l(bars,i): continue
        if pos is None and td.get(dk,0)<1:
            e=bar["close"]
            pos={"entry":e,"sl":e-SL_A,"tp":e+TP_A,"idx":i,"ed":dk,
                 "be_t":False,"be_on":False,"be_sl":e-SL_A}
            td[dk]=td.get(dk,0)+1
    if pos:
        last=bars[-1]
        trades.append({"pnl_r":round((last["close"]-pos["entry"])/SL_A,4),
                       "exit_date":_dk(last),"source":"DAX1H"})
    return trades

# ── DAX 2H ────────────────────────────────────────────────────────────────────
def _sweep_long_2h(bars, i):
    for lb in range(3,10):
        if i<lb: continue
        up=bars[i-lb+1]; bear=bars[i-1]; base=bars[i-lb]; cur=bars[i]
        if up["open"]>=up["close"]: continue
        if base["open"]<=base["close"]: continue
        if bear["open"]<=bear["close"]: continue
        if bear["close"]>=up["open"]: continue
        if cur["close"]<=up["open"]: continue
        if (up["open"]-bear["close"])<=1e-9: continue
        if all(bars[j]["close"]>base["close"] for j in range(i-lb+2,i-1)):
            return True
    return False

def run_dax2h(bars):
    n=len(bars); closes=[b["close"] for b in bars]
    highs=[b["high"] for b in bars]; lows=[b["low"] for b in bars]
    ema4=_ema(closes,4); atr14=_atr(highs,lows,closes,14)
    trades=[]; pos=None; td={}
    for i in range(9, n):
        bar=bars[i]; s=str(bar.get("date","") or "")
        try: dt=datetime.datetime.fromisoformat(s[:19])
        except: continue
        if dt.isoweekday()>5: continue
        if not (9<=dt.hour<11): continue
        if ema4[i] is None or atr14[i] is None: continue
        risk=atr14[i]*0.8
        if risk<=0: continue
        body_l=bar["close"]-bar["open"]
        sw_l=_sweep_long_2h(bars,i)
        logic_l=sw_l and bar["close"]>=ema4[i] and (0<body_l<200)
        dk=s[:10]; today=td.get(dk,0)
        if pos is not None:
            entry=pos["entry"]; hi,lo,op=bar["high"],bar["low"],bar["open"]
            sl_c=pos.get("be_sl",pos["sl"]) if pos.get("be_on") else pos["sl"]
            if not pos.get("be_t"):
                if hi>=entry+pos["risk"]: pos["be_t"]=True
            elif not pos.get("be_on"):
                pos["be_on"]=True; pos["be_sl"]=entry; sl_c=entry
            ep=er=None
            if   op<=sl_c:               ep,er=op,"sl"
            elif op>=pos["tp"]:          ep,er=op,"tp"
            elif lo<=sl_c and hi>=pos["tp"]: ep,er=sl_c,"sl"
            elif hi>=pos["tp"]:          ep,er=pos["tp"],"tp"
            elif lo<=sl_c:               ep,er=sl_c,"sl"
            if ep is not None:
                trades.append({"pnl_r":round((ep-entry)/pos["risk"],4),
                               "exit_date":dk,"source":"DAX2H"})
                pos=None
        if pos is None and today<3 and logic_l:
            e=bar["close"]
            pos={"entry":e,"sl":e-risk,"tp":e+risk*3.0,"risk":risk,
                 "idx":i,"be_t":False,"be_on":False}
            td[dk]=today+1
    if pos:
        last=bars[-1]; e=pos["entry"]
        trades.append({"pnl_r":round((last["close"]-e)/pos["risk"],4) if pos["risk"]>0 else 0.0,
                       "exit_date":_dk(last),"source":"DAX2H"})
    return trades


# ── Build monthly cumulative curve ────────────────────────────────────────────
def build_intraday_cumulative_curve(all_trades: list[dict]) -> list[dict]:
    """
    Returns [{date: "2019-01-31", value: 5.23}, ...] — cumulative % from start.
    Uses v3-F portfolio weighting (40/40/5/15), compounded at 1% total risk/trade.
    """
    eq = 1.0
    trades_s = sorted(all_trades, key=lambda t: t.get("exit_date",""))
    by_month: dict[str, float] = {}
    for t in trades_s:
        w     = V3F_W.get(t["source"], 0.0)
        ib    = IB_R.get(t["source"], 0.0)
        net_r = t["pnl_r"] - ib
        eq   += eq * TOTAL_RISK * w * net_r
        month = t["exit_date"][:7]
        by_month[month] = eq   # running equity end of last trade in month

    if not by_month:
        return []

    months = sorted(by_month)
    start_eq = 1.0
    result = []
    for m in months:
        cum_pct = (by_month[m] / start_eq - 1) * 100
        result.append({"date": month_end(m), "value": round(cum_pct, 4)})
    return result


def main():
    print("Generating White Swan v1.1 — Intraday MT v3-F equity curve")
    print(f"  OOS window: {OOS_START[:7]} – {OOS_END[:7]}")

    # Load engines
    spec = importlib.util.spec_from_file_location("_wf", VALID / "fx_backtest" / "run_fx_30m_wf.py")
    wf   = importlib.util.module_from_spec(spec)
    sys.modules["_wf"] = wf
    spec.loader.exec_module(wf)
    sys.stdout = open(1, mode="w", encoding="utf-8", errors="replace", closefd=False)

    EUR_CFG = wf.EUR
    GBP_B   = replace(wf.GBP, be_crv=1.0, be_immediate=False,
                      session_h_start=9, session_m_start=0,
                      session_h_end=10, session_m_end=30)
    run_fx  = wf.run_backtest

    # Load bars
    print("  Loading OHLC data …")
    bars = {k: _slice(_load(v), OOS_START, OOS_END) for k, v in DATA.items()}
    for k, v in bars.items():
        print(f"    {k}: {len(v)} bars")

    # Run engines
    print("  Running backtest engines …")
    eur_t = run_fx(bars["EUR30m"], EUR_CFG); [t.__setitem__("source","EUR30m") for t in eur_t]
    gbp_t = run_fx(bars["GBP30m"], GBP_B);  [t.__setitem__("source","GBP30m") for t in gbp_t]
    dax1_t = run_dax1h(bars["DAX1H"])
    dax2_t = run_dax2h(bars["DAX2H"])
    all_t  = eur_t + dax1_t + gbp_t + dax2_t
    print(f"    EUR30m: {len(eur_t)} | DAX1H: {len(dax1_t)} | GBP30m: {len(gbp_t)} | DAX2H: {len(dax2_t)}")

    # Build cumulative curve
    curve = build_intraday_cumulative_curve(all_t)
    print(f"  Intraday curve: {len(curve)} monthly points")
    if curve:
        print(f"    First: {curve[0]} | Last: {curve[-1]}")

    # Quick stats check
    if curve:
        mrets = []
        prev = 0.0
        for p in curve:
            r = (1 + p["value"]/100) / (1 + prev/100) - 1
            mrets.append(r)
            prev = p["value"]
        n_m   = len(mrets)
        eq    = 1 + curve[-1]["value"]/100
        cagr  = (eq**(12/n_m) - 1)*100 if n_m > 0 else 0
        mean  = sum(mrets)/n_m; std = math.sqrt(sum((r-mean)**2 for r in mrets)/n_m)
        sh    = (mean/std)*math.sqrt(12) if std > 0 else 0
        dds   = [min(0,(1+p["value"]/100)/(max((1+c["value"]/100) for c in curve[:i+1])-1e-9)-1)*100
                 for i,p in enumerate(curve)]
        # simpler maxdd
        peak_eq = 1.0
        maxdd = 0.0
        prev_eq = 1.0
        for p in curve:
            curr_eq = 1 + p["value"]/100
            if curr_eq > peak_eq: peak_eq = curr_eq
            dd = (curr_eq/peak_eq - 1)*100
            if dd < maxdd: maxdd = dd
        calmar = cagr/abs(maxdd) if maxdd < 0 else 0
        print(f"    Stats: CAGR={cagr:+.2f}% MaxDD={maxdd:.2f}% Sharpe={sh:.3f} Calmar={calmar:.3f}")

    # Update analytics-generated.json
    print(f"\n  Updating {OUT_JSON.name} …")
    data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    data["whiteSwanBacktest"]["groupSeries"]["Intraday MT v3-F"] = curve
    data["generatedAt"] = datetime.date.today().isoformat()

    OUT_JSON.write_text(json.dumps(data, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    size_kb = OUT_JSON.stat().st_size / 1024
    print(f"  ✓ Saved ({size_kb:.0f} KB)")
    print(f"  groupSeries keys: {list(data['whiteSwanBacktest']['groupSeries'].keys())}")


if __name__ == "__main__":
    main()
