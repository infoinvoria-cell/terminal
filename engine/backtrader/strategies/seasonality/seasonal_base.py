"""
Base class for calendar-slot seasonal strategies.

Entry: Open on trading day `entry_slot` of the year.
Exit:  Close on trading day `exit_slot` of the year.
Trading day = business day index within the year (1-based, ~252 per year).
"""
import backtrader as bt
from collections import defaultdict


class SeasonalSlotStrategy(bt.Strategy):
    params = (
        ("entry_slot", 29),
        ("exit_slot", 35),
        ("direction", "LONG"),
        ("commission_pct", 0.001),
        ("slippage_pct", 0.0005),
    )

    def __init__(self):
        self._trading_day_counter = defaultdict(int)
        self._last_year = None
        self._current_slot = 0
        self._entered = False
        self.trade_log = []

    def _update_slot(self):
        dt = self.data.datetime.date(0)
        year = dt.year
        if year != self._last_year:
            self._trading_day_counter[year] = 0
            self._last_year = year
        self._trading_day_counter[year] += 1
        self._current_slot = self._trading_day_counter[year]

    def next(self):
        self._update_slot()
        slot = self._current_slot
        is_long = self.p.direction == "LONG"

        if slot == self.p.entry_slot and not self.position:
            if is_long:
                self.buy()
            else:
                self.sell()
            self._entered = True

        elif slot == self.p.exit_slot and self.position:
            self.close()
            self._entered = False

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_log.append(
                {
                    "pnl": trade.pnl,
                    "pnlcomm": trade.pnlcomm,
                    "dtopen": bt.num2date(trade.dtopen),
                    "dtclose": bt.num2date(trade.dtclose),
                    "size": trade.size,
                    "barlen": trade.barlen,
                }
            )


class SeasonalPattern_RB1(SeasonalSlotStrategy):
    """RBOB Gasoline LONG — Feb 8-16 (Slot 29→35)"""
    params = (("entry_slot", 29), ("exit_slot", 35), ("direction", "LONG"))


class SeasonalPattern_ZW1(SeasonalSlotStrategy):
    """Chicago Wheat LONG — Aug 10-20 (Slot 152→159)"""
    params = (("entry_slot", 152), ("exit_slot", 159), ("direction", "LONG"))


class SeasonalPattern_GC1(SeasonalSlotStrategy):
    """Gold LONG — Jul 25-31 (Slot 128→133)"""
    params = (("entry_slot", 128), ("exit_slot", 133), ("direction", "LONG"))


class SeasonalPattern_NG1(SeasonalSlotStrategy):
    """Natural Gas SHORT — Sep 16-30 (Slot 170→181)"""
    params = (("entry_slot", 170), ("exit_slot", 181), ("direction", "SHORT"))


class SeasonalPattern_SB1(SeasonalSlotStrategy):
    """Sugar #11 SHORT — Sep 18-30 (Slot 172→182)"""
    params = (("entry_slot", 172), ("exit_slot", 182), ("direction", "SHORT"))


class SeasonalPattern_CC1(SeasonalSlotStrategy):
    """Cocoa LONG — Nov 5-15 (Slot 210→217)"""
    params = (("entry_slot", 210), ("exit_slot", 217), ("direction", "LONG"))


class SeasonalPattern_PA1(SeasonalSlotStrategy):
    """Palladium SHORT — Jan 10-20 (Slot 10→17)"""
    params = (("entry_slot", 10), ("exit_slot", 17), ("direction", "SHORT"))


class SeasonalPattern_ZM1(SeasonalSlotStrategy):
    """Soybean Meal LONG — Apr 15-25 (Slot 73→80)"""
    params = (("entry_slot", 73), ("exit_slot", 80), ("direction", "LONG"))


class SeasonalPattern_CT1(SeasonalSlotStrategy):
    """Cotton #2 LONG — Feb 8-16 (Slot 29→35)"""
    params = (("entry_slot", 29), ("exit_slot", 35), ("direction", "LONG"))


class SeasonalPattern_ES1(SeasonalSlotStrategy):
    """S&P 500 E-mini LONG — Dez 15-25 (Slot 240→248)"""
    params = (("entry_slot", 240), ("exit_slot", 248), ("direction", "LONG"))


PATTERN_REGISTRY = {
    "RB1": SeasonalPattern_RB1,
    "ZW1": SeasonalPattern_ZW1,
    "GC1": SeasonalPattern_GC1,
    "NG1": SeasonalPattern_NG1,
    "SB1": SeasonalPattern_SB1,
    "CC1": SeasonalPattern_CC1,
    "PA1": SeasonalPattern_PA1,
    "ZM1": SeasonalPattern_ZM1,
    "CT1": SeasonalPattern_CT1,
    "ES1": SeasonalPattern_ES1,
}

PATTERN_META = {
    "RB1": {"name": "RBOB Gasoline",  "symbol": "RB1!", "direction": "LONG",  "window": "Feb 8-16",   "category": "Energie"},
    "ZW1": {"name": "Chicago Wheat",  "symbol": "ZW1!", "direction": "LONG",  "window": "Aug 10-20",  "category": "Agrar"},
    "GC1": {"name": "Gold",           "symbol": "GC1!", "direction": "LONG",  "window": "Jul 25-31",  "category": "Metalle"},
    "NG1": {"name": "Natural Gas",    "symbol": "NG1!", "direction": "SHORT", "window": "Sep 16-30",  "category": "Energie"},
    "SB1": {"name": "Sugar #11",      "symbol": "SB1!", "direction": "SHORT", "window": "Sep 18-30",  "category": "Agrar"},
    "CC1": {"name": "Cocoa",          "symbol": "CC1!", "direction": "LONG",  "window": "Nov 5-15",   "category": "Agrar"},
    "PA1": {"name": "Palladium",      "symbol": "PA1!", "direction": "SHORT", "window": "Jan 10-20",  "category": "Metalle"},
    "ZM1": {"name": "Soybean Meal",   "symbol": "ZM1!", "direction": "LONG",  "window": "Apr 15-25",  "category": "Agrar"},
    "CT1": {"name": "Cotton #2",      "symbol": "CT1!", "direction": "LONG",  "window": "Feb 8-16",   "category": "Agrar"},
    "ES1": {"name": "S&P 500 E-mini", "symbol": "ES1!", "direction": "LONG",  "window": "Dez 15-25",  "category": "Indizes"},
}
