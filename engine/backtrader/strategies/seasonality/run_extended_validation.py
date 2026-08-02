"""
Extended Seasonality Validation Pipeline
Validates all 45 patterns from Brain, Agent Portfolio, and public anomalies.
Uses calendar-date entry logic (MM-DD + holding days) instead of slot-based.
"""
import sys
import os
import json
import math
from datetime import datetime, date, timedelta

import numpy as np
import pandas as pd
import backtrader as bt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from engine.backtrader.data.seasonal_loader import load_asset


# ─── Calendar-Date Seasonal Strategy ─────────────────────────────────

class CalendarSeasonalStrategy(bt.Strategy):
    params = (
        ("entry_month", 1),
        ("entry_day", 1),
        ("holding_days", 10),
        ("direction", "LONG"),
        ("commission_pct", 0.001),
    )

    def __init__(self):
        self.trade_log = []
        self._entry_pending = False
        self._bars_held = 0

    def next(self):
        dt = self.data.datetime.date(0)
        m, d = dt.month, dt.day

        if not self.position and not self._entry_pending:
            if m == self.p.entry_month and d >= self.p.entry_day and d <= self.p.entry_day + 2:
                if self.p.direction == "LONG":
                    self.buy()
                else:
                    self.sell()
                self._entry_pending = True
                self._bars_held = 0

        if self.position:
            self._bars_held += 1
            if self._bars_held >= self.p.holding_days:
                self.close()
                self._entry_pending = False
                self._bars_held = 0

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_log.append({
                "pnl": trade.pnl,
                "pnlcomm": trade.pnlcomm,
                "dtopen": bt.num2date(trade.dtopen),
                "dtclose": bt.num2date(trade.dtclose),
                "size": trade.size,
                "barlen": trade.barlen,
            })


# ─── Weekday Strategy (Mo-Di etc.) ───────────────────────────────────

class WeekdaySeasonalStrategy(bt.Strategy):
    params = (
        ("entry_weekday", 0),
        ("holding_days", 2),
        ("direction", "SHORT"),
    )

    def __init__(self):
        self.trade_log = []
        self._bars_held = 0

    def next(self):
        dt = self.data.datetime.date(0)
        wd = dt.weekday()

        if not self.position:
            if wd == self.p.entry_weekday:
                if self.p.direction == "LONG":
                    self.buy()
                else:
                    self.sell()
                self._bars_held = 0

        if self.position:
            self._bars_held += 1
            if self._bars_held >= self.p.holding_days:
                self.close()
                self._bars_held = 0

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_log.append({
                "pnl": trade.pnl,
                "pnlcomm": trade.pnlcomm,
                "dtopen": bt.num2date(trade.dtopen),
                "dtclose": bt.num2date(trade.dtclose),
                "size": trade.size,
                "barlen": trade.barlen,
            })


# ─── Month-End Strategy (last N trading days) ────────────────────────

class MonthEndStrategy(bt.Strategy):
    params = (
        ("target_month", 12),
        ("last_n_days", 5),
        ("direction", "LONG"),
    )

    def __init__(self):
        self.trade_log = []
        self._bars_held = 0

    def next(self):
        dt = self.data.datetime.date(0)
        m, d = dt.month, dt.day

        if not self.position:
            if m == self.p.target_month and d >= 24:
                if self.p.direction == "LONG":
                    self.buy()
                else:
                    self.sell()
                self._bars_held = 0

        if self.position:
            self._bars_held += 1
            if self._bars_held >= self.p.last_n_days:
                self.close()
                self._bars_held = 0

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_log.append({
                "pnl": trade.pnl,
                "pnlcomm": trade.pnlcomm,
                "dtopen": bt.num2date(trade.dtopen),
                "dtclose": bt.num2date(trade.dtclose),
                "size": trade.size,
                "barlen": trade.barlen,
            })


# ─── Multi-Month Strategy (Sell in May etc.) ─────────────────────────

class MultiMonthStrategy(bt.Strategy):
    params = (
        ("entry_month", 11),
        ("exit_month", 4),
        ("direction", "LONG"),
    )

    def __init__(self):
        self.trade_log = []

    def next(self):
        dt = self.data.datetime.date(0)
        m, d = dt.month, dt.day

        if not self.position:
            if m == self.p.entry_month and d <= 5:
                if self.p.direction == "LONG":
                    self.buy()
                else:
                    self.sell()

        if self.position:
            if m == self.p.exit_month and d >= 25:
                self.close()

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_log.append({
                "pnl": trade.pnl,
                "pnlcomm": trade.pnlcomm,
                "dtopen": bt.num2date(trade.dtopen),
                "dtclose": bt.num2date(trade.dtclose),
                "size": trade.size,
                "barlen": trade.barlen,
            })


# ─── Pattern Registry ────────────────────────────────────────────────

EXTENDED_PATTERNS = [
    # Brain Production (21)
    {"id": "ZW1_L_0815_10", "asset": "ZW1", "name": "Wheat LONG Aug 15", "direction": "LONG", "entry_month": 8, "entry_day": 15, "holding_days": 10, "source": "Brain Production", "quality": 76, "type": "calendar"},
    {"id": "ZW1_L_0401_16", "asset": "ZW1", "name": "Wheat LONG Apr 01", "direction": "LONG", "entry_month": 4, "entry_day": 1, "holding_days": 16, "source": "Brain Production", "quality": 76, "type": "calendar"},
    {"id": "ZC1_L_1110_16", "asset": "ZC1", "name": "Corn LONG Nov 10", "direction": "LONG", "entry_month": 11, "entry_day": 10, "holding_days": 16, "source": "Brain Production", "quality": 91, "type": "calendar"},
    {"id": "ZC1_S_1029_18", "asset": "ZC1", "name": "Corn SHORT Oct 29", "direction": "SHORT", "entry_month": 10, "entry_day": 29, "holding_days": 18, "source": "Brain Production", "quality": 88, "type": "calendar"},
    {"id": "ZC1_L_0219_10", "asset": "ZC1", "name": "Corn LONG Feb 19", "direction": "LONG", "entry_month": 2, "entry_day": 19, "holding_days": 10, "source": "Brain Production", "quality": 84, "type": "calendar"},
    {"id": "ZC1_S_0714_18", "asset": "ZC1", "name": "Corn SHORT Jul 14", "direction": "SHORT", "entry_month": 7, "entry_day": 14, "holding_days": 18, "source": "Brain Production", "quality": 83, "type": "calendar"},
    {"id": "ZS1_S_0715_16", "asset": "ZS1", "name": "Soybeans SHORT Jul 15", "direction": "SHORT", "entry_month": 7, "entry_day": 15, "holding_days": 16, "source": "Brain Production", "quality": 84, "type": "calendar"},
    {"id": "ZS1_L_1004_14", "asset": "ZS1", "name": "Soybeans LONG Oct 04", "direction": "LONG", "entry_month": 10, "entry_day": 4, "holding_days": 14, "source": "Brain Production", "quality": 83, "type": "calendar"},
    {"id": "ZS1_S_0608_14", "asset": "ZS1", "name": "Soybeans SHORT Jun 08", "direction": "SHORT", "entry_month": 6, "entry_day": 8, "holding_days": 14, "source": "Brain Production", "quality": 82, "type": "calendar"},
    {"id": "KC1_S_0430_18", "asset": "KC1", "name": "Coffee SHORT Apr 30", "direction": "SHORT", "entry_month": 4, "entry_day": 30, "holding_days": 18, "source": "Brain Production", "quality": 85, "type": "calendar"},
    {"id": "KC1_S_0309_14", "asset": "KC1", "name": "Coffee SHORT Mar 09", "direction": "SHORT", "entry_month": 3, "entry_day": 9, "holding_days": 14, "source": "Brain Production", "quality": 81, "type": "calendar"},
    {"id": "KC1_L_0121_12", "asset": "KC1", "name": "Coffee LONG Jan 21", "direction": "LONG", "entry_month": 1, "entry_day": 21, "holding_days": 12, "source": "Brain Production", "quality": 76, "type": "calendar"},
    {"id": "SB1_L_0924_10", "asset": "SB1", "name": "Sugar LONG Sep 24", "direction": "LONG", "entry_month": 9, "entry_day": 24, "holding_days": 10, "source": "Brain Production", "quality": 92, "type": "calendar"},
    {"id": "SB1_S_1130_10", "asset": "SB1", "name": "Sugar SHORT Nov 30", "direction": "SHORT", "entry_month": 11, "entry_day": 30, "holding_days": 10, "source": "Brain Production", "quality": 87, "type": "calendar"},
    {"id": "SB1_S_0225_20", "asset": "SB1", "name": "Sugar SHORT Feb 25", "direction": "SHORT", "entry_month": 2, "entry_day": 25, "holding_days": 20, "source": "Brain Production", "quality": 85, "type": "calendar"},
    {"id": "CC1_L_0402_16", "asset": "CC1", "name": "Cocoa LONG Apr 02", "direction": "LONG", "entry_month": 4, "entry_day": 2, "holding_days": 16, "source": "Brain Production", "quality": 80, "type": "calendar"},
    {"id": "CT1_L_0103_12", "asset": "CT1", "name": "Cotton LONG Jan 03", "direction": "LONG", "entry_month": 1, "entry_day": 3, "holding_days": 12, "source": "Brain Production", "quality": 89, "type": "calendar"},
    {"id": "CT1_S_0422_20", "asset": "CT1", "name": "Cotton SHORT Apr 22", "direction": "SHORT", "entry_month": 4, "entry_day": 22, "holding_days": 20, "source": "Brain Production", "quality": 75, "type": "calendar"},
    {"id": "OJ1_L_1112_10", "asset": "OJ1", "name": "OJ LONG Nov 12", "direction": "LONG", "entry_month": 11, "entry_day": 12, "holding_days": 10, "source": "Brain Production", "quality": 77, "type": "calendar"},
    {"id": "OJ1_L_0628_10", "asset": "OJ1", "name": "OJ LONG Jun 28", "direction": "LONG", "entry_month": 6, "entry_day": 28, "holding_days": 10, "source": "Brain Production", "quality": 76, "type": "calendar"},
    {"id": "OJ1_L_0501_18", "asset": "OJ1", "name": "OJ LONG May 01", "direction": "LONG", "entry_month": 5, "entry_day": 1, "holding_days": 18, "source": "Brain Production", "quality": 75, "type": "calendar"},
    # Brain Research extra (2)
    {"id": "ZC1_L_0329_10", "asset": "ZC1", "name": "Corn LONG Mar 29", "direction": "LONG", "entry_month": 3, "entry_day": 29, "holding_days": 10, "source": "Brain Research", "quality": 78, "type": "calendar"},
    {"id": "ZC1_S_0605_16", "asset": "ZC1", "name": "Corn SHORT Jun 05", "direction": "SHORT", "entry_month": 6, "entry_day": 5, "holding_days": 16, "source": "Brain Research", "quality": 78, "type": "calendar"},
    # Agent Portfolio — calendar patterns (8)
    {"id": "HYG_L_1124_5", "asset": "HYG", "name": "HYG LONG Nov last 5", "direction": "LONG", "entry_month": 11, "entry_day": 24, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "PA1_L_0112_8", "asset": "PA1", "name": "PA Jan OpEx LONG", "direction": "LONG", "entry_month": 1, "entry_day": 12, "holding_days": 8, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "SHY_L_0325_5", "asset": "SHY", "name": "SHY Q1 last 5 LONG", "direction": "LONG", "entry_month": 3, "entry_day": 25, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "COPX_L_1218_10", "asset": "COPX", "name": "COPX Q4 last 10 LONG", "direction": "LONG", "entry_month": 12, "entry_day": 18, "holding_days": 10, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "ZN1_L_0825_5", "asset": "ZN1", "name": "10Y Note Aug last 5 LONG", "direction": "LONG", "entry_month": 8, "entry_day": 25, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "PL1_L_0112_8", "asset": "PL1", "name": "Platinum Jan OpEx LONG", "direction": "LONG", "entry_month": 1, "entry_day": 12, "holding_days": 8, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "IWM_L_0525_5", "asset": "IWM", "name": "IWM Mai last 5 LONG", "direction": "LONG", "entry_month": 5, "entry_day": 25, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "6S1_L_1225_5", "asset": "6S1", "name": "CHF Dez last 5 LONG", "direction": "LONG", "entry_month": 12, "entry_day": 25, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "ZM1_L_1001_22", "asset": "ZM1", "name": "Soybean Meal Okt LONG", "direction": "LONG", "entry_month": 10, "entry_day": 1, "holding_days": 22, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    {"id": "ZT1_S_0628_5", "asset": "ZT1", "name": "2Y Note Jun ToM SHORT", "direction": "SHORT", "entry_month": 6, "entry_day": 28, "holding_days": 5, "source": "Agent Portfolio", "quality": 0, "type": "calendar"},
    # Agent Portfolio — weekday patterns (3)
    {"id": "BZ1_S_MoDi", "asset": "BZ1", "name": "Brent Mo-Di SHORT", "direction": "SHORT", "entry_weekday": 0, "holding_days": 2, "source": "Agent Portfolio", "quality": 0, "type": "weekday"},
    {"id": "CL1_S_MoDi", "asset": "CL1", "name": "WTI Mo-Di SHORT", "direction": "SHORT", "entry_weekday": 0, "holding_days": 2, "source": "Agent Portfolio", "quality": 0, "type": "weekday"},
    {"id": "RB1_S_MoDi", "asset": "RB1", "name": "RBOB Mo-Di SHORT", "direction": "SHORT", "entry_weekday": 0, "holding_days": 2, "source": "Agent Portfolio", "quality": 0, "type": "weekday"},
    # Public anomalies — calendar (6)
    {"id": "HG1_L_0102_60", "asset": "HG1", "name": "Copper China Jan-Mär LONG", "direction": "LONG", "entry_month": 1, "entry_day": 2, "holding_days": 60, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "GC1_L_0801_130", "asset": "GC1", "name": "Gold Aug-Feb Cycle LONG", "direction": "LONG", "entry_month": 8, "entry_day": 1, "holding_days": 130, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "CL1_L_0201_120", "asset": "CL1", "name": "Crude Oil Sommer-Rallye LONG", "direction": "LONG", "entry_month": 2, "entry_day": 1, "holding_days": 120, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "NG1_L_1001_60", "asset": "NG1", "name": "NatGas Winter-Spike LONG", "direction": "LONG", "entry_month": 10, "entry_day": 1, "holding_days": 60, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "IWM_L_0102_20", "asset": "IWM", "name": "January Effect Small Caps", "direction": "LONG", "entry_month": 1, "entry_day": 2, "holding_days": 20, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "DXY_S_0601_90", "asset": "DXY", "name": "USD Sommer-Schwäche SHORT", "direction": "SHORT", "entry_month": 6, "entry_day": 1, "holding_days": 90, "source": "Public", "quality": 0, "type": "calendar"},
    # Public — multi-month (1)
    {"id": "ES1_L_NovApr", "asset": "ES1", "name": "Sell in May Reverse (Nov-Apr)", "direction": "LONG", "entry_month": 11, "exit_month": 4, "source": "Public", "quality": 0, "type": "multimonth"},
    # Public — month-end (1)
    {"id": "ES1_L_SantaRally", "asset": "ES1", "name": "Santa Rally Dez 20-31", "direction": "LONG", "entry_month": 12, "entry_day": 20, "holding_days": 8, "source": "Public", "quality": 0, "type": "calendar"},
    {"id": "ZC1_S_0901_40", "asset": "ZC1", "name": "Corn Harvest Pressure Sep", "direction": "SHORT", "entry_month": 9, "entry_day": 1, "holding_days": 40, "source": "Public", "quality": 0, "type": "calendar"},
]


# ─── Generic Backtest Runner ─────────────────────────────────────────

def run_pattern(pattern, start=None, end=None, commission=0.001):
    df = load_asset(pattern["asset"])
    if df is None:
        return None

    if start:
        df = df[df["time"] >= pd.Timestamp(start)]
    if end:
        df = df[df["time"] <= pd.Timestamp(end)]
    if len(df) < 50:
        return None

    df = df.set_index("time")
    data = bt.feeds.PandasData(dataname=df)

    cerebro = bt.Cerebro()
    cerebro.adddata(data)

    ptype = pattern.get("type", "calendar")

    if ptype == "weekday":
        cerebro.addstrategy(WeekdaySeasonalStrategy,
                            entry_weekday=pattern["entry_weekday"],
                            holding_days=pattern["holding_days"],
                            direction=pattern["direction"])
    elif ptype == "multimonth":
        cerebro.addstrategy(MultiMonthStrategy,
                            entry_month=pattern["entry_month"],
                            exit_month=pattern["exit_month"],
                            direction=pattern["direction"])
    else:
        cerebro.addstrategy(CalendarSeasonalStrategy,
                            entry_month=pattern["entry_month"],
                            entry_day=pattern["entry_day"],
                            holding_days=pattern["holding_days"],
                            direction=pattern["direction"],
                            commission_pct=commission)

    cerebro.broker.setcash(100000)
    cerebro.broker.setcommission(commission=commission)
    cerebro.addsizer(bt.sizers.PercentSizer, percents=95)

    results = cerebro.run()
    strat = results[0]
    return {"final_value": cerebro.broker.getvalue(), "trades": strat.trade_log, "start_cash": 100000}


def compute_metrics(result, label="full"):
    if not result or not result["trades"]:
        return {"label": label, "trades": 0, "win_rate": 0, "sharpe": 0, "cagr": 0,
                "max_dd": 0, "calmar": 0, "profit_factor": 0, "avg_trade_days": 0, "total_pnl": 0}

    trades = result["trades"]
    pnls = [t["pnlcomm"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate = len(wins) / len(pnls) if pnls else 0
    gross_profit = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0.001
    profit_factor = gross_profit / gross_loss

    equity = [100000]
    for p in pnls:
        equity.append(equity[-1] + p)
    equity = np.array(equity)

    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak
    max_dd = float(dd.min()) * 100

    first_trade = trades[0]["dtopen"]
    last_trade = trades[-1]["dtclose"]
    years = max((last_trade - first_trade).days / 365.25, 0.5)
    total_return = equity[-1] / equity[0]
    cagr = (total_return ** (1.0 / years) - 1) * 100 if total_return > 0 else -100

    rets = np.array(pnls) / 100000
    if len(rets) > 1 and np.std(rets) > 0:
        trades_per_year = len(rets) / years
        sharpe = (np.mean(rets) / np.std(rets)) * math.sqrt(trades_per_year)
    else:
        sharpe = 0

    calmar = abs(cagr / max_dd) if max_dd != 0 else 0
    avg_days = np.mean([t["barlen"] for t in trades])

    return {"label": label, "trades": len(pnls), "win_rate": round(win_rate * 100, 1),
            "sharpe": round(sharpe, 2), "cagr": round(cagr, 2), "max_dd": round(max_dd, 2),
            "calmar": round(calmar, 2), "profit_factor": round(profit_factor, 2),
            "avg_trade_days": round(avg_days, 1), "total_pnl": round(sum(pnls), 2)}


def walk_forward(pattern, is_years=5, oos_years=1):
    df = load_asset(pattern["asset"])
    if df is None:
        return {"wf_efficiency": 0, "avg_oos_sharpe": 0}

    first_year = df["time"].dt.year.min()
    last_year = df["time"].dt.year.max()
    folds = []
    start_year = first_year

    while start_year + is_years + oos_years <= last_year + 1:
        oos_start = f"{start_year + is_years}-01-01"
        oos_end = f"{start_year + is_years + oos_years - 1}-12-31"
        oos_result = run_pattern(pattern, start=oos_start, end=oos_end)
        oos_metrics = compute_metrics(oos_result)
        folds.append({"oos_sharpe": oos_metrics["sharpe"], "oos_positive": oos_metrics["total_pnl"] > 0})
        start_year += 1

    if not folds:
        return {"wf_efficiency": 0, "avg_oos_sharpe": 0}

    positive_folds = sum(1 for f in folds if f["oos_positive"])
    return {"wf_efficiency": round(positive_folds / len(folds) * 100, 1),
            "avg_oos_sharpe": round(np.mean([f["oos_sharpe"] for f in folds]), 2),
            "total_folds": len(folds), "positive_folds": positive_folds}


STRESS_PERIODS = {
    "GFC_2008": ("2008-09-01", "2009-03-31"),
    "EUR_Krise_2011": ("2011-06-01", "2012-06-30"),
    "USD_Rally_2014": ("2014-07-01", "2015-03-31"),
    "COVID_2020": ("2020-02-01", "2020-04-30"),
    "Zinsanstieg_2022": ("2022-01-01", "2022-12-31"),
}


def stress_tests(pattern):
    results = {}
    for name, (start, end) in STRESS_PERIODS.items():
        r = run_pattern(pattern, start=start, end=end)
        m = compute_metrics(r, label=name)
        results[name] = {"trades": m["trades"], "pnl": m["total_pnl"], "passed": m["total_pnl"] >= 0 or m["trades"] == 0}
    return {"passed": sum(1 for v in results.values() if v["passed"]), "total": len(STRESS_PERIODS)}


def monte_carlo(pattern, n_sims=500):
    r = run_pattern(pattern)
    if not r or not r["trades"] or len(r["trades"]) < 5:
        return {"p5_sharpe": 0, "p50_sharpe": 0, "prob_loss_pct": 100}

    trade_rets = np.array([t["pnlcomm"] / 100000 for t in r["trades"]])
    n = len(trade_rets)
    rng = np.random.default_rng(42)
    sharpes = []
    final_returns = []

    for _ in range(n_sims):
        shuffled = rng.choice(trade_rets, size=n, replace=True)
        eq = np.cumprod(1 + shuffled)
        final_returns.append(eq[-1] - 1)
        if np.std(shuffled) > 0:
            sharpes.append(np.mean(shuffled) / np.std(shuffled) * math.sqrt(n))
        else:
            sharpes.append(0)

    return {"p5_sharpe": round(float(np.percentile(sharpes, 5)), 2),
            "p50_sharpe": round(float(np.percentile(sharpes, 50)), 2),
            "prob_loss_pct": round(np.mean(np.array(final_returns) < 0) * 100, 1)}


def compute_score(basis, wf, stress, mc, cost_profitable):
    score = 0
    if basis["sharpe"] > 1.0: score += 20
    elif basis["sharpe"] > 0.5: score += 10
    if wf["wf_efficiency"] > 70: score += 20
    elif wf["wf_efficiency"] > 50: score += 10
    if stress["passed"] >= 4: score += 20
    elif stress["passed"] >= 3: score += 10
    if cost_profitable: score += 20
    if mc["p5_sharpe"] > 0: score += 20
    elif mc["p5_sharpe"] > -0.5: score += 10

    if score >= 80: return score, "A", "Live-tauglich"
    if score >= 60: return score, "B", "Paper Trading"
    if score >= 40: return score, "C", "Weitere Forschung"
    return score, "D", "Verwerfen"


# ─── MAIN ─────────────────────────────────────────────────────────────

def validate_all():
    all_results = []
    total = len(EXTENDED_PATTERNS)

    for i, pat in enumerate(EXTENDED_PATTERNS):
        print(f"\n[{i+1}/{total}] {pat['id']} — {pat['name']} ({pat['direction']})")

        basis_result = run_pattern(pat)
        basis = compute_metrics(basis_result)
        if basis["trades"] == 0:
            print(f"  SKIP: 0 Trades")
            all_results.append({**pat, "grade": "D", "score": 0, "verdict": "Keine Trades",
                                "sharpe": 0, "cagr": 0, "max_dd": 0, "win_rate": 0,
                                "profit_factor": 0, "trades": 0, "wf_efficiency": 0,
                                "stress_passed": 0, "mc_p5_sharpe": 0,
                                "after_costs_profitable": False,
                                "last_validated": date.today().isoformat()})
            continue

        print(f"  Basis: {basis['trades']} Trades, Sharpe={basis['sharpe']}, WR={basis['win_rate']}%")

        wf = walk_forward(pat)
        print(f"  WF: {wf['wf_efficiency']}%")

        stress = stress_tests(pat)
        print(f"  Stress: {stress['passed']}/{stress['total']}")

        # Cost analysis
        no_cost_result = run_pattern(pat, commission=0)
        no_cost = compute_metrics(no_cost_result)
        cost_profitable = basis["total_pnl"] > 0

        mc = monte_carlo(pat)
        print(f"  MC: p5={mc['p5_sharpe']}")

        score, grade, verdict = compute_score(basis, wf, stress, mc, cost_profitable)
        print(f"  >>> {grade} ({score}) — {verdict}")

        all_results.append({
            "id": pat["id"], "name": pat["name"], "asset": pat["asset"],
            "direction": pat["direction"], "source": pat["source"],
            "grade": grade, "score": score, "verdict": verdict,
            "sharpe": basis["sharpe"], "cagr": basis["cagr"], "max_dd": basis["max_dd"],
            "win_rate": basis["win_rate"], "profit_factor": basis["profit_factor"],
            "trades": basis["trades"], "avg_trade_days": basis["avg_trade_days"],
            "wf_efficiency": wf["wf_efficiency"],
            "stress_passed": stress["passed"], "stress_total": stress["total"],
            "after_costs_profitable": cost_profitable,
            "mc_p5_sharpe": mc["p5_sharpe"], "mc_p50_sharpe": mc["p50_sharpe"],
            "mc_prob_loss_pct": mc.get("prob_loss_pct", 100),
            "brain_quality": pat.get("quality", 0),
            "last_validated": date.today().isoformat(),
        })

    return all_results


def save_results(results):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    out_path = os.path.join(project_root, "src", "data", "capitalife", "seasonality_validation.json")

    output = {
        "generated_at": date.today().isoformat(),
        "generator": "engine/backtrader/strategies/seasonality/run_extended_validation.py",
        "total_patterns": len(results),
        "patterns": sorted(results, key=lambda x: x["score"], reverse=True),
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nErgebnisse gespeichert: {out_path}")


def print_summary(results):
    sorted_r = sorted(results, key=lambda x: x["score"], reverse=True)
    print(f"\n{'='*110}")
    print(f"{'#':>3} {'ID':<25} {'Asset':<6} {'Dir':<6} {'Src':<12} {'Gr':>2} {'Sc':>3} "
          f"{'Sharpe':>7} {'WR%':>5} {'WF%':>5} {'Str':>3} {'MC5':>6} {'Verdict':<20}")
    print("-" * 110)
    for i, r in enumerate(sorted_r):
        print(f"{i+1:>3} {r['id']:<25} {r['asset']:<6} {r['direction']:<6} "
              f"{r['source']:<12} {r['grade']:>2} {r['score']:>3} "
              f"{r['sharpe']:>7.2f} {r['win_rate']:>5.1f} {r['wf_efficiency']:>5.1f} "
              f"{r['stress_passed']:>1}/{r['stress_total']:>1} "
              f"{r['mc_p5_sharpe']:>6.2f} {r['verdict']:<20}")

    for g in ["A", "B", "C", "D"]:
        group = [r for r in sorted_r if r["grade"] == g]
        if group:
            label = {"A": "Live-tauglich", "B": "Paper Trading", "C": "Forschung", "D": "Verwerfen"}[g]
            print(f"\n  Grade {g} ({label}): {', '.join(r['id'] for r in group)}")


if __name__ == "__main__":
    print(f"Extended Seasonality Validation — {date.today()}")
    print(f"Patterns: {len(EXTENDED_PATTERNS)}")

    results = validate_all()
    print_summary(results)
    save_results(results)
    print(f"\nFertig. {len(results)} Muster validiert.")
