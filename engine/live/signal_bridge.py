"""Signal bridge — connects strategy output to the order manager."""

from dataclasses import dataclass
from typing import Optional
from loguru import logger

from .order_manager import OrderManager


@dataclass
class Signal:
    symbol: str
    direction: str       # "long" | "short" | "flat"
    entry_price: float
    stop_price: float
    strategy: str


class SignalBridge:
    def __init__(self, order_manager: OrderManager):
        self.order_manager = order_manager
        self._account_value: float = 0.0
        self._open_positions: int = 0

    def update_account_state(self, account_value: float, open_positions: int):
        self._account_value = account_value
        self._open_positions = open_positions

    def dispatch(self, signal: Signal) -> Optional[int]:
        if signal.direction == "flat":
            logger.info(f"[{signal.strategy}] FLAT signal for {signal.symbol} — no action")
            return None

        logger.info(
            f"[{signal.strategy}] Dispatching {signal.direction.upper()} {signal.symbol} "
            f"entry={signal.entry_price} stop={signal.stop_price}"
        )
        return self.order_manager.execute_signal(
            symbol=signal.symbol,
            direction=signal.direction,
            entry_price=signal.entry_price,
            stop_price=signal.stop_price,
            account_value=self._account_value,
            open_positions=self._open_positions,
        )
