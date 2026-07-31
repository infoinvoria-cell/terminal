"""
Strategy: intraday_dax_1h
Asset: FDAX1! / DAX futures (yfinance proxy: ^GDAXI)
Timeframe: 1H (simulated with daily bars for backtest)
Direction: Long only
Entry: EMA(20) crosses over EMA(50)
Exit: SL 35 pts, TP 126 pts (RR 3.6:1); signal exit on crossunder
"""

from typing import Optional
import pandas as pd
import numpy as np
import yfinance as yf
from loguru import logger


def get_params() -> dict:
    return {
        "ticker": "^GDAXI",
        "ema_fast": 20,
        "ema_slow": 50,
        "sl_pts": 35.0,
        "tp_pts": 126.0,
        "direction": "long",
    }


def _add_signals(df: pd.DataFrame) -> pd.DataFrame:
    p = get_params()
    df = df.copy()
    df["ema_fast"] = df["close"].ewm(span=p["ema_fast"], adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=p["ema_slow"], adjust=False).mean()
    prev_fast = df["ema_fast"].shift(1)
    prev_slow = df["ema_slow"].shift(1)
    df["long_entry"] = (df["ema_fast"] > df["ema_slow"]) & (prev_fast <= prev_slow)
    df["signal_exit"] = (df["ema_fast"] < df["ema_slow"]) & (prev_fast >= prev_slow)
    return df


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    p = get_params()
    logger.info(f"[intraday_dax_1h] Fetching {p['ticker']} {start} -> {end}")
    raw = yf.download(p["ticker"], start=start, end=end, progress=False, auto_adjust=True)
    if raw.empty:
        logger.warning("[intraday_dax_1h] No data returned")
        return {"equity": pd.Series([100.0]), "trades": []}

    df = raw.copy()
    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].dropna()
    df = _add_signals(df)

    sl_pts = p["sl_pts"]
    tp_pts = p["tp_pts"]

    trades = []
    equity = 100.0
    equity_curve = [equity]
    in_position = False
    entry_price = sl = tp = 0.0

    for i in range(1, len(df)):
        row = df.iloc[i]

        if in_position:
            hit_tp = row["high"] >= tp
            hit_sl = row["low"] <= sl
            sig_exit = bool(row["signal_exit"])

            if hit_tp or hit_sl or sig_exit:
                if hit_tp and not hit_sl:
                    exit_price = tp
                    win = True
                elif hit_sl and not hit_tp:
                    exit_price = sl
                    win = False
                elif sig_exit:
                    exit_price = float(row["close"])
                    win = exit_price > entry_price
                else:
                    exit_price = sl
                    win = False

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
                in_position = False

        if not in_position and row["long_entry"]:
            in_position = True
            entry_price = float(row["close"])
            sl = entry_price - sl_pts
            tp = entry_price + tp_pts

    logger.info(f"[intraday_dax_1h] {len(trades)} trades, final equity {equity:.2f}")
    return {"equity": pd.Series(equity_curve), "trades": trades}


def get_signal(df: pd.DataFrame) -> dict:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df = _add_signals(df)
    last = df.iloc[-1]
    p = get_params()
    if last["long_entry"]:
        entry = float(last["close"])
        return {"direction": "long", "entry": entry, "sl": entry - p["sl_pts"], "tp": entry + p["tp_pts"]}
    return {"direction": "flat", "entry": float(last["close"]), "sl": 0.0, "tp": 0.0}
