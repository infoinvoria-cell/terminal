"""
Strategy: intraday_dax_2h
Asset: FDAX1! / DAX (yfinance proxy: ^GDAXI)
Timeframe: 2H (simulated with daily bars for backtest)
Direction: Long only
Entry: swept low + bull close + bullish body + body < 200 + close >= EMA(4) + max 3/day
Exit: SL ATR(14)*0.8, TP risk*3, Breakeven at entry+risk*1
"""

from typing import Optional
import pandas as pd
import numpy as np
import yfinance as yf
from loguru import logger


def get_params() -> dict:
    return {
        "ticker": "^GDAXI",
        "ema_period": 4,
        "atr_period": 14,
        "atr_sl_mult": 0.8,
        "rr": 3.0,
        "breakeven_r": 1.0,
        "max_trades_day": 3,
        "max_body_size": 200,
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
    df["ema4"] = df["close"].ewm(span=p["ema_period"], adjust=False).mean()
    df["atr14"] = _atr(df, p["atr_period"])
    df["prev_low"] = df["low"].shift(1)
    df["body_size"] = (df["close"] - df["open"]).abs()
    df["swept_low"] = df["low"] < df["prev_low"]
    df["bull_close"] = df["close"] > df["prev_low"]
    df["bullish_body"] = df["close"] > df["open"]
    df["body_ok"] = (df["body_size"] > 0) & (df["body_size"] < p["max_body_size"])
    df["above_ema"] = df["close"] >= df["ema4"]
    df["entry_signal"] = (
        df["swept_low"] & df["bull_close"] & df["bullish_body"] & df["body_ok"] & df["above_ema"]
    )
    return df


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    p = get_params()
    logger.info(f"[intraday_dax_2h] Fetching {p['ticker']} {start} -> {end}")
    raw = yf.download(p["ticker"], start=start, end=end, progress=False, auto_adjust=True)
    if raw.empty:
        logger.warning("[intraday_dax_2h] No data returned")
        return {"equity": pd.Series([100.0]), "trades": []}

    df = raw.copy()
    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].dropna()
    df = _add_signals(df)

    trades = []
    equity = 100.0
    equity_curve = [equity]
    in_position = False
    entry_price = sl = tp = be_level = risk = 0.0
    breakeven_moved = False
    daily_trades: dict = {}

    for i in range(1, len(df)):
        row = df.iloc[i]
        date_key = df.index[i].date() if hasattr(df.index[i], "date") else str(df.index[i])[:10]

        if in_position:
            # Move breakeven
            if not breakeven_moved and row["high"] >= be_level:
                sl = entry_price
                breakeven_moved = True

            hit_tp = row["high"] >= tp
            hit_sl = row["low"] <= sl

            if hit_tp or hit_sl:
                if hit_tp and not hit_sl:
                    exit_price = tp
                    win = True
                else:
                    exit_price = sl
                    win = exit_price >= entry_price  # breakeven = no loss
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

        if not in_position and bool(row["entry_signal"]):
            day_count = daily_trades.get(date_key, 0)
            if day_count < p["max_trades_day"]:
                atr = float(row["atr14"])
                risk = atr * p["atr_sl_mult"]
                in_position = True
                breakeven_moved = False
                entry_price = float(row["close"])
                sl = entry_price - risk
                tp = entry_price + risk * p["rr"]
                be_level = entry_price + risk * p["breakeven_r"]
                daily_trades[date_key] = day_count + 1

    logger.info(f"[intraday_dax_2h] {len(trades)} trades, final equity {equity:.2f}")
    return {"equity": pd.Series(equity_curve), "trades": trades}


def get_signal(df: pd.DataFrame) -> dict:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df = _add_signals(df)
    last = df.iloc[-1]
    p = get_params()
    if last["entry_signal"]:
        entry = float(last["close"])
        risk = float(last["atr14"]) * p["atr_sl_mult"]
        return {
            "direction": "long",
            "entry": entry,
            "sl": entry - risk,
            "tp": entry + risk * p["rr"],
        }
    return {"direction": "flat", "entry": float(last["close"]), "sl": 0.0, "tp": 0.0}
