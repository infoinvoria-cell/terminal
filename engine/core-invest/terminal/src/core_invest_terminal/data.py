from __future__ import annotations
from pathlib import Path
import hashlib
import pandas as pd

REQUIRED_OHLC = ("open", "high", "low", "close")


def read_tradingview_csv(path: Path) -> pd.DataFrame:
    """Read a user-supplied TradingView daily CSV deterministically."""
    df = pd.read_csv(path)
    if "time" not in df.columns:
        raise ValueError(f"Missing time column: {path}")
    index = pd.to_datetime(df.pop("time"), utc=True, errors="raise").dt.tz_convert(None).dt.normalize()
    df.index = index
    df.index.name = "date"
    df = df.sort_index()
    if df.index.has_duplicates:
        raise ValueError(f"Duplicate dates in {path}")
    for column in REQUIRED_OHLC:
        if column in df:
            df[column] = pd.to_numeric(df[column], errors="raise")
    return df


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_ohlc(df: pd.DataFrame) -> list[str]:
    errors: list[str] = []
    if set(REQUIRED_OHLC).issubset(df.columns):
        high_floor = df[["open", "close", "low"]].max(axis=1)
        low_ceiling = df[["open", "close", "high"]].min(axis=1)
        if (df["high"] < high_floor).any():
            errors.append("high below another OHLC field")
        if (df["low"] > low_ceiling).any():
            errors.append("low above another OHLC field")
    return errors
