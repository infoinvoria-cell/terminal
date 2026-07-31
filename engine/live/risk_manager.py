"""Risk manager — enforces max 1% risk per trade and portfolio limits."""

from loguru import logger


class RiskManager:
    def __init__(self, max_risk_pct: float = 0.01, max_positions: int = 20):
        self.max_risk_pct = max_risk_pct
        self.max_positions = max_positions

    def position_size(
        self,
        account_value: float,
        entry_price: float,
        stop_price: float,
    ) -> float:
        """Return number of shares/contracts risking at most max_risk_pct of account."""
        if entry_price <= 0 or stop_price <= 0:
            logger.error("Invalid entry or stop price")
            return 0.0
        risk_per_unit = abs(entry_price - stop_price)
        if risk_per_unit == 0:
            logger.error("Entry and stop price are identical — cannot size")
            return 0.0
        max_risk_dollars = account_value * self.max_risk_pct
        size = max_risk_dollars / risk_per_unit
        logger.debug(
            f"Size: {size:.2f} units | risk ${max_risk_dollars:.2f} | "
            f"entry={entry_price} stop={stop_price}"
        )
        return size

    def approve(
        self,
        account_value: float,
        open_positions: int,
        order_value: float,
    ) -> bool:
        """Return True if the order passes all risk checks."""
        if open_positions >= self.max_positions:
            logger.warning(f"Max positions reached ({self.max_positions}) — order rejected")
            return False
        if order_value / account_value > 0.25:
            logger.warning(f"Single order exceeds 25% of account — order rejected")
            return False
        return True
