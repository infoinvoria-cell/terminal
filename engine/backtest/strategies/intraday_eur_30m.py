"""
Strategy: intraday_eur_30m
Asset: 6E1! / EURUSD (yfinance proxy: EURUSD=X daily)
Timeframe: 30m (simulated with daily bars for backtest)
Direction: Long and Short
Entry: EMA(20) x EMA(50) crossover / crossunder
Exit: SL 0.0013 (13 pips), TP 0.0039 (39 pips), RR 3:1
"""

from typing import Optional
import pandas as pd
import numpy as np
import yfinance as yf
from loguru import logger


def get_params() -> dict:
    return {
        "ticker": "EURUSD=X",
        "ema_fast": 20,
        "ema_slow": 50,
        "sl_pts": 0.0013,
        "tp_pts": 0.0039,
        "direction": "both",
    }


def _add_signals(df: pd.DataFrame) -> pd.DataFrame:
    p = get_params()
    df = df.copy()
    df["ema_fast"] = df["close"].ewm(span=p["ema_fast"], adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=p["ema_slow"], adjust=False).mean()
    prev_fast = df["ema_fast"].shift(1)
    prev_slow = df["ema_slow"].shift(1)
    df["long_entry"] = (df["ema_fast"] > df["ema_slow"]) & (prev_fast <= prev_slow)
    df["short_entry"] = (df["ema_fast"] < df["ema_slow"]) & (prev_fast >= prev_slow)
    return df


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    p = get_params()
    logger.info(f"[intraday_eur_30m] Fetching {p['ticker']} {start} -> {end}")
    raw = yf.download(p["ticker"], start=start, end=end, progress=False, auto_adjust=True)
    if raw.empty:
        logger.warning("[intraday_eur_30m] No data returned")
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
    direction = None
    entry_price = sl = tp = 0.0

    for i in range(1, len(df)):
        row = df.iloc[i]

        if in_position:
            if direction == "long":
                hit_tp = row["high"] >= tp
                hit_sl = row["low"] <= sl
            else:
                hit_tp = row["low"] <= tp
                hit_sl = row["high"] >= sl

            if hit_tp or hit_sl:
                win = hit_tp and not hit_sl
                pnl_pct = (tp_pts / entry_price) if win else -(sl_pts / entry_price)
                equity *= (1 + pnl_pct)
                trades.append({
                    "entry": entry_price,
                    "direction": direction,
                    "win": win,
                    "pnl_pct": pnl_pct,
                    "equity": equity,
                })
                equity_curve.append(equity)
                in_position = False

        if not in_position:
            if row["long_entry"]:
                in_position, direction = True, "long"
                entry_price = row["close"]
                sl = entry_price - sl_pts
                tp = entry_price + tp_pts
            elif row["short_entry"]:
                in_position, direction = True, "short"
                entry_price = row["close"]
                sl = entry_price + sl_pts
                tp = entry_price - tp_pts

    logger.info(f"[intraday_eur_30m] {len(trades)} trades, final equity {equity:.2f}")
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
    if last["short_entry"]:
        entry = float(last["close"])
        return {"direction": "short", "entry": entry, "sl": entry + p["sl_pts"], "tp": entry - p["tp_pts"]}
    return {"direction": "flat", "entry": float(last["close"]), "sl": 0.0, "tp": 0.0}
