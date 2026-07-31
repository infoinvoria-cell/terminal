"""EUR/USD intraday strategy — 30-minute bars. Stub — implement signal logic here."""

from typing import Optional
import pandas as pd
from loguru import logger

from ...data.fetcher import fetch_ibkr


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    logger.info("intraday_eur_30m: stub — implement signal logic")
    # TODO: fetch 30m EUR/USD bars, implement entry/exit signal, return equity curve
    return {"equity": None, "note": "stub — not yet implemented"}
