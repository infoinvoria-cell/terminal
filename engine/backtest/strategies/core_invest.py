"""
Core Invest — 7-component portfolio strategy.

Components & weights (approved live v2.0):
  SPY          30%  Buy & Hold
  QQQ_PINE_1   10%  SMA(5) cross SMA(400)
  GLD          15%  Buy & Hold
  HG           10%  EMA(20) cross EMA(50)   [Copper via HG=F]
  CHF          10%  EMA(20) cross EMA(50)   [CHF/USD via CHF=X]
  BTC          10%  Buy & Hold              [BTC-USD]
  CASH         15%  Cash (0% return)
"""

from typing import Optional

import numpy as np
import pandas as pd
import vectorbt as vbt
import yfinance as yf
from loguru import logger


# Ticker mapping
_TICKERS = {
    "SPY": "SPY",
    "QQQ_PINE_1": "QQQ",
    "GLD": "GLD",
    "HG": "HG=F",
    "CHF": "CHF=X",
    "BTC": "BTC-USD",
}

_WEIGHTS = {
    "SPY": 0.30,
    "QQQ_PINE_1": 0.10,
    "GLD": 0.15,
    "HG": 0.10,
    "CHF": 0.10,
    "BTC": 0.10,
    "CASH": 0.15,
}


def _fetch(ticker: str, start: str, end: Optional[str]) -> Optional[pd.Series]:
    df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
    if df.empty:
        logger.warning(f"No data for {ticker}")
        return None
    close = df["Close"]
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    return close.dropna()


def _sma_signal(price: pd.Series, fast: int = 5, slow: int = 400) -> pd.Series:
    """1 when fast SMA > slow SMA, else 0."""
    sma_fast = price.rolling(fast).mean()
    sma_slow = price.rolling(slow).mean()
    signal = (sma_fast > sma_slow).astype(float)
    signal[:slow] = 0  # no signal before slow SMA is warm
    return signal


def _ema_signal(price: pd.Series, fast: int = 20, slow: int = 50) -> pd.Series:
    """1 when fast EMA > slow EMA, else 0."""
    ema_fast = price.ewm(span=fast, adjust=False).mean()
    ema_slow = price.ewm(span=slow, adjust=False).mean()
    signal = (ema_fast > ema_slow).astype(float)
    signal[:slow] = 0
    return signal


def run(
    start: str = "2019-01-01",
    end: Optional[str] = None,
    config: dict = None,
) -> dict:
    logger.info(f"Core Invest backtest {start} → {end or 'today'}")

    # --- Data fetch ---
    prices: dict[str, pd.Series] = {}
    for key, ticker in _TICKERS.items():
        p = _fetch(ticker, start, end)
        if p is not None:
            prices[key] = p
        else:
            logger.warning(f"Skipping {key} — no data")

    if not prices:
        return {"error": "No price data fetched"}

    # Align to common index
    idx = prices[list(prices.keys())[0]].index
    for key in list(prices.keys()):
        idx = idx.intersection(prices[key].index)

    for key in list(prices.keys()):
        prices[key] = prices[key].reindex(idx).ffill()

    n = len(idx)
    logger.info(f"Common index: {n} days ({idx[0].date()} → {idx[-1].date()})")

    # --- Component returns ---
    component_returns: dict[str, pd.Series] = {}

    # Buy & Hold components
    for key in ("SPY", "GLD", "BTC"):
        if key in prices:
            component_returns[key] = prices[key].pct_change().fillna(0)

    # QQQ_PINE_1 — SMA(5/400) tactical
    if "QQQ_PINE_1" in prices:
        sig = _sma_signal(prices["QQQ_PINE_1"], fast=5, slow=400)
        raw_ret = prices["QQQ_PINE_1"].pct_change().fillna(0)
        component_returns["QQQ_PINE_1"] = sig.shift(1).fillna(0) * raw_ret

    # HG — EMA(20/50) tactical
    if "HG" in prices:
        sig = _ema_signal(prices["HG"], fast=20, slow=50)
        raw_ret = prices["HG"].pct_change().fillna(0)
        component_returns["HG"] = sig.shift(1).fillna(0) * raw_ret

    # CHF — EMA(20/50) tactical
    if "CHF" in prices:
        sig = _ema_signal(prices["CHF"], fast=20, slow=50)
        raw_ret = prices["CHF"].pct_change().fillna(0)
        component_returns["CHF"] = sig.shift(1).fillna(0) * raw_ret

    # CASH — 0% return
    component_returns["CASH"] = pd.Series(0.0, index=idx)

    # --- Portfolio return (static weights, monthly rebalance approximated by constant weights) ---
    port_return = pd.Series(0.0, index=idx)
    for key, ret in component_returns.items():
        w = _WEIGHTS.get(key, 0)
        port_return += w * ret.reindex(idx).fillna(0)

    # Equity curve starting at 100
    equity = (1 + port_return).cumprod() * 100

    logger.info(f"Core Invest final equity: {equity.iloc[-1]:.1f} (started 100)")

    return {
        "equity": equity,
        "returns": port_return,
        "component_returns": component_returns,
        "prices": prices,
        "index": idx,
    }
