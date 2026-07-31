"""Order manager — translates validated signals into IBKR orders."""

from typing import Optional
from loguru import logger

from .ibkr_connection import IBKRConnection
from .risk_manager import RiskManager


class OrderManager:
    def __init__(self, ibkr: IBKRConnection, risk: RiskManager):
        self.ibkr = ibkr
        self.risk = risk

    def execute_signal(
        self,
        symbol: str,
        direction: str,
        entry_price: float,
        stop_price: float,
        account_value: float,
        open_positions: int,
        sec_type: str = "STK",
        exchange: str = "SMART",
        currency: str = "USD",
    ) -> Optional[int]:
        size = self.risk.position_size(account_value, entry_price, stop_price)
        if size <= 0:
            logger.warning(f"Skipping {symbol} — zero position size")
            return None

        order_value = size * entry_price
        if not self.risk.approve(account_value, open_positions, order_value):
            logger.warning(f"Skipping {symbol} — risk check failed")
            return None

        action = "BUY" if direction == "long" else "SELL"
        order_id = self.ibkr.place_order(
            symbol=symbol,
            action=action,
            quantity=round(size),
            order_type="MKT",
            sec_type=sec_type,
            exchange=exchange,
            currency=currency,
        )
        return order_id
