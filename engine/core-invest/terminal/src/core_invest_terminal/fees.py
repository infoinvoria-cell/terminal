from __future__ import annotations
from dataclasses import dataclass
import pandas as pd

@dataclass
class FeeState:
    nav: float = 1.0
    high_water_mark: float = 1.0


def quarterly_hwm_fee(returns: pd.Series, fee_rate: float = 0.25, state: FeeState | None = None):
    """Quarterly performance fee above a perpetual post-fee high-water mark."""
    state = state or FeeState()
    nav = float(state.nav)
    hwm = float(state.high_water_mark)
    periods = returns.index.to_period("Q")
    net, ledger = [], []
    for i, (date, value) in enumerate(returns.fillna(0.0).items()):
        before = nav
        nav *= 1.0 + float(value)
        is_quarter_end = i == len(returns) - 1 or periods[i + 1] != periods[i]
        fee = 0.0
        pre_fee = nav
        if is_quarter_end and nav > hwm:
            fee = fee_rate * (nav - hwm)
            nav -= fee
            hwm = nav
        net.append(nav / before - 1.0)
        if is_quarter_end:
            ledger.append({"date": date, "pre_fee_nav": pre_fee, "fee": fee, "post_fee_nav": nav, "high_water_mark": hwm})
    return pd.Series(net, index=returns.index, name="investor_net_return"), pd.DataFrame(ledger)
