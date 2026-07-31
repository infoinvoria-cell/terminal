"""
Strategy: anomaly_gc_friday
Asset: GC1! Gold Futures (yfinance: GC=F)
Timeframe: Daily
Direction: Long only
Entry: Friday + ATR(4) <= ATR(14) * 1.5
Exit: SL ATR(14)*0.75, TP risk*1.25 (RR 1.25:1); same-day close on Friday
"""

from typing import Optional
import pandas as pd
import numpy as np
import yfinance as yf
from loguru import logger


def get_params() -> dict:
    return {
        "ticker": "GC=F",
        "atr_fast": 4,
        "atr_slow": 14,
        "vol_mult": 1.5,
        "sl_atr_mult": 0.75,
        "rr": 1.25,
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
    p = get_params()
    df = df.copy()
    df["atr_fast"] = _atr(df, p["atr_fast"])
    df["atr_slow"] = _atr(df, p["atr_slow"])
    df["is_friday"] = pd.to_datetime(df.index).dayofweek == 4
    df["vol_ok"] = df["atr_fast"] <= df["atr_slow"] * p["vol_mult"]
    df["entry_signal"] = df["is_friday"] & df["vol_ok"]
    return df


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    p = get_params()
    logger.info(f"[anomaly_gc_friday] Fetching {p['ticker']} {start} -> {end}")
    raw = yf.download(p["ticker"], start=start, end=end, progress=False, auto_adjust=True)
    if raw.empty:
        logger.warning("[anomaly_gc_friday] No data returned")
        return {"equity": pd.Series([100.0]), "trades": []}

    df = raw.copy()
    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].dropna()
    df = _add_signals(df)

    trades = []
    equity = 100.0
    equity_curve = [equity]

    for i in range(1, len(df)):
        row = df.iloc[i]
        if not row["entry_signal"]:
            continue

        entry_price = float(row["open"])  # Enter at open on Friday
        atr_slow = float(row["atr_slow"])
        risk = atr_slow * p["sl_atr_mult"]
        sl = entry_price - risk
        tp = entry_price + risk * p["rr"]

        # Same-day close: use Friday close as exit
        exit_price = float(row["close"])
        # Check if SL/TP was hit intraday first (approximate with high/low)
        if row["low"] <= sl:
            exit_price = sl
            win = False
        elif row["high"] >= tp:
            exit_price = tp
            win = True
        else:
            exit_price = float(row["close"])
            win = exit_price > entry_price

        pnl_pct = (exit_price - entry_price) / entry_price
        equity *= (1 + pnl_pct)
        trades.append({
            "entry": entry_price,
            "exit": exit_price,
            "win": win,
            "pnl_pct": pnl_pct,
            "equity": equity,
        })
        equity_curve.append(equity)

    logger.info(f"[anomaly_gc_friday] {len(trades)} trades, final equity {equity:.2f}")
    return {"equity": pd.Series(equity_curve), "trades": trades}


def get_signal(df: pd.DataFrame) -> dict:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df = _add_signals(df)
    last = df.iloc[-1]
    p = get_params()
    if last["entry_signal"]:
        entry = float(last["close"])
        risk = float(last["atr_slow"]) * p["sl_atr_mult"]
        return {
            "direction": "long",
            "entry": entry,
            "sl": entry - risk,
            "tp": entry + risk * p["rr"],
        }
    return {"direction": "flat", "entry": float(last["close"]), "sl": 0.0, "tp": 0.0}
