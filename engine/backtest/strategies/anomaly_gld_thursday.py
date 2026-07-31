"""
Strategy: anomaly_gld_thursday
Asset: GLD ETF (yfinance: GLD)
Timeframe: Daily
Direction: Long only
Entry: Thursday (weekday==3), no SMA filter
Exit: SL ATR(14)*1.5, TP risk*2.0 (RR 2:1); time-based close on next Friday
"""

from typing import Optional
import pandas as pd
import numpy as np
import yfinance as yf
from loguru import logger


def get_params() -> dict:
    return {
        "ticker": "GLD",
        "atr_period": 14,
        "sl_atr_mult": 1.5,
        "rr": 2.0,
        "direction": "long",
    }


def _atr(df: pd.DataFrame, period: int) -> pd.Series:
    high, low, prev_close = df["high"], df["low"], df["close"].shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def _add_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["atr14"] = _atr(df, get_params()["atr_period"])
    df["dayofweek"] = pd.to_datetime(df.index).dayofweek
    df["is_thursday"] = df["dayofweek"] == 3
    df["is_friday"] = df["dayofweek"] == 4
    df["entry_signal"] = df["is_thursday"]
    return df


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    p = get_params()
    logger.info(f"[anomaly_gld_thursday] Fetching {p['ticker']} {start} -> {end}")
    raw = yf.download(p["ticker"], start=start, end=end, progress=False, auto_adjust=True)
    if raw.empty:
        logger.warning("[anomaly_gld_thursday] No data returned")
        return {"equity": pd.Series([100.0]), "trades": []}

    df = raw.copy()
    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].dropna()
    df = _add_signals(df)

    trades = []
    equity = 100.0
    equity_curve = [equity]
    in_position = False
    entry_price = sl = tp = 0.0

    for i in range(len(df)):
        row = df.iloc[i]

        if in_position:
            # Check SL/TP intraday
            hit_sl = row["low"] <= sl
            hit_tp = row["high"] >= tp
            is_friday = bool(row["is_friday"])

            if hit_sl and not hit_tp:
                exit_price = sl
                win = False
                pnl_pct = (exit_price - entry_price) / entry_price
                equity *= (1 + pnl_pct)
                trades.append({"entry": entry_price, "exit": exit_price, "win": win, "pnl_pct": pnl_pct, "equity": equity})
                equity_curve.append(equity)
                in_position = False
            elif hit_tp:
                exit_price = tp
                win = True
                pnl_pct = (exit_price - entry_price) / entry_price
                equity *= (1 + pnl_pct)
                trades.append({"entry": entry_price, "exit": exit_price, "win": win, "pnl_pct": pnl_pct, "equity": equity})
                equity_curve.append(equity)
                in_position = False
            elif is_friday:
                # Time-based exit on Friday close
                exit_price = float(row["close"])
                win = exit_price > entry_price
                pnl_pct = (exit_price - entry_price) / entry_price
                equity *= (1 + pnl_pct)
                trades.append({"entry": entry_price, "exit": exit_price, "win": win, "pnl_pct": pnl_pct, "equity": equity})
                equity_curve.append(equity)
                in_position = False

        if not in_position and bool(row["entry_signal"]):
            entry_price = float(row["close"])
            atr = float(row["atr14"])
            risk = atr * p["sl_atr_mult"]
            sl = entry_price - risk
            tp = entry_price + risk * p["rr"]
            in_position = True

    logger.info(f"[anomaly_gld_thursday] {len(trades)} trades, final equity {equity:.2f}")
    return {"equity": pd.Series(equity_curve), "trades": trades}


def get_signal(df: pd.DataFrame) -> dict:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df = _add_signals(df)
    last = df.iloc[-1]
    p = get_params()
    if last["entry_signal"]:
        entry = float(last["close"])
        risk = float(last["atr14"]) * p["sl_atr_mult"]
        return {
            "direction": "long",
            "entry": entry,
            "sl": entry - risk,
            "tp": entry + risk * p["rr"],
        }
    return {"direction": "flat", "entry": float(last["close"]), "sl": 0.0, "tp": 0.0}
