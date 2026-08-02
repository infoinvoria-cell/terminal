from __future__ import annotations
from pathlib import Path
from typing import Mapping
import pandas as pd


def run_target_replay(package_root: Path, cash: float = 25_000.0, plot: bool = False):
    """Replay frozen daily ETF weights and futures contract targets in Backtrader.

    This is an order-level integration harness, not an independent signal engine.
    The prior session's target is submitted for the next session, matching the
    research rule that signals use completed data and returns use lagged weights.
    """
    try:
        import backtrader as bt
    except ImportError as exc:
        raise RuntimeError("Install backtrader from requirements-terminal.txt") from exc

    data_dir = package_root / "01_DATA/canonical"
    ref = package_root / "02_RESEARCH_REFERENCE/Core_Invest_Demo_Forward_Ready_1/reference"
    weights = pd.read_csv(ref / "daily_target_weights.csv", parse_dates=["date"]).set_index("date")
    contracts = pd.read_csv(ref / "daily_futures_contracts.csv", parse_dates=["date"]).set_index("date")

    class TVPandas(bt.feeds.PandasData):
        params = (("datetime", None), ("open", "open"), ("high", "high"), ("low", "low"), ("close", "close"), ("volume", "Volume"), ("openinterest", -1))

    class Replay(bt.Strategy):
        params = dict(weight_frame=weights, contract_frame=contracts)
        def __init__(self):
            self.by_name = {data._name: data for data in self.datas}
            self.last_targets = {}
        def next(self):
            current_date = pd.Timestamp(self.datas[0].datetime.date(0))
            prior = self.p.weight_frame.index[self.p.weight_frame.index < current_date]
            if len(prior):
                row = self.p.weight_frame.loc[prior[-1]]
                for ticker in [x for x in row.index if x in self.by_name and x not in {"BIL", "Cash_Financing"}]:
                    target = float(row[ticker])
                    if self.last_targets.get(ticker) != target:
                        self.order_target_percent(data=self.by_name[ticker], target=target)
                        self.last_targets[ticker] = target
            fprior = self.p.contract_frame.index[self.p.contract_frame.index < current_date]
            if len(fprior):
                row = self.p.contract_frame.loc[fprior[-1]]
                for root in [x for x in row.index if x in self.by_name]:
                    target = int(row[root])
                    if self.last_targets.get(root) != target:
                        self.order_target_size(data=self.by_name[root], target=target)
                        self.last_targets[root] = target

    cerebro = bt.Cerebro(stdstats=False)
    cerebro.broker.setcash(cash)
    try:
        cerebro.broker.set_shortcash(True)
    except AttributeError:
        pass
    cerebro.broker.set_coc(False)
    cerebro.broker.set_slippage_perc(perc=0.0001, slip_open=True, slip_match=True)

    stock_tickers = ["SPY", "QQQ", "RSP", "IWM", "EFA", "EEM", "QUAL", "MTUM", "VLUE", "USMV", "GLD", "IEF"]
    future_roots = ["ES", "NQ", "6E", "6J", "6B", "6S", "GC", "HG", "CL", "NG", "ZC", "ZS"]
    start, end = weights.index.min(), weights.index.max()
    for ticker in stock_tickers:
        path = data_dir / f"{ticker}.csv"
        if not path.exists():
            continue
        df = pd.read_csv(path)
        df["date"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert(None).dt.normalize()
        df = df.set_index("date").loc[start:end]
        if "Volume" not in df:
            df["Volume"] = 0.0
        cerebro.adddata(TVPandas(dataname=df), name=ticker)
    for root in future_roots:
        path = data_dir / f"{root}.csv"
        if not path.exists():
            continue
        df = pd.read_csv(path)
        df["date"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert(None).dt.normalize()
        df = df.set_index("date").loc[start:end]
        if "Volume" not in df:
            df["Volume"] = 0.0
        cerebro.adddata(TVPandas(dataname=df), name=root)

    cerebro.addstrategy(Replay)
    result = cerebro.run()
    if plot:
        cerebro.plot()
    return {"final_value": float(cerebro.broker.getvalue()), "strategy": result[0]}
