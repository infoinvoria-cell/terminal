"""Gold futures (GC) Friday anomaly strategy. Stub — implement signal logic here."""

from typing import Optional
from loguru import logger


def run(start: str, end: Optional[str] = None, config: dict = None, ibkr=None) -> dict:
    logger.info("anomaly_gc_friday: stub — implement signal logic")
    return {"equity": None, "note": "stub — not yet implemented"}
