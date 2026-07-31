"""Historical data fetcher — yfinance primary, IBKR fallback."""

from typing import Optional
import pandas as pd
import yfinance as yf
from loguru import logger


def fetch_yfinance(
    symbol: str,
    start: str,
    end: str,
    interval: str = "1d",
) -> Optional[pd.DataFrame]:
    try:
        df = yf.download(symbol, start=start, end=end, interval=interval, auto_adjust=True, progress=False)
        if df.empty:
            logger.warning(f"yfinance returned no data for {symbol}")
            return None
        df.index = pd.to_datetime(df.index)
        logger.info(f"yfinance: {len(df)} bars for {symbol} ({interval})")
        return df
    except Exception as e:
        logger.exception(f"yfinance fetch failed for {symbol}: {e}")
        return None


def fetch_ibkr(
    ibkr,
    symbol: str,
    duration: str = "5 Y",
    bar_size: str = "1 day",
    sec_type: str = "STK",
    exchange: str = "SMART",
    currency: str = "USD",
) -> Optional[pd.DataFrame]:
    """Fetch via IBKR connection (pass an IBKRConnection instance)."""
    return ibkr.get_historical_data(
        symbol=symbol,
        duration=duration,
        bar_size=bar_size,
        sec_type=sec_type,
        exchange=exchange,
        currency=currency,
    )
