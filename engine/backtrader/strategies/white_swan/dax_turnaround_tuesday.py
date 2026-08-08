"""
DAX Turnaround Tuesday — Backtrader Strategy
Asset: FDAX (DAX Futures Continuous, 30-minute bars)
Signal: Long at Monday 17:30 Europe/Berlin close (15:30 UTC CET / 14:30 UTC CEST)
Stop: Previous completed Daily ATR_SMA × SL_multiple (daily ATR, prior day confirmed)
Target: stop × RR
Time exit: Wednesday 17:30 Europe/Berlin close
Regime: 3 bad-condition flags reduce size (0 bad=1.0x, 1 bad=0.75x, 2-3 bad=0.5x)

Commission model: 2.50 EUR/side + spread ~0.075% of price (roundtrip split to per-side)
Regime sources (prior-day confirmed, no look-ahead):
  Bad 1: DAX Daily ATR below its own 14-period SMA (low volatility regime)
  Bad 2: VIX below its 14-period SMA (VIX not elevated)
  Bad 3: US10Y above its 14-period SMA (rising rates)
"""

import backtrader as bt
import backtrader.indicators as btind
import pandas as pd
import numpy as np


class DaxTurnaroundTuesday(bt.Strategy):
    params = (
        ('atr_len', 7),
        ('sl_atr', 1.5),
        ('rr', 1.5),
        ('risk_pct', 0.01),
        ('regime_ma_len', 14),       # MA period for regime signals
        ('spread_pct', 0.00075),     # 0.075% per side (half of ~0.075-0.10% roundtrip)
        ('commission_eur', 2.50),    # EUR per side
        ('contract_size', 25),       # DAX: EUR 25 per index point
        ('printlog', False),
        # Regime data passed as aligned pandas Series (daily, prior-day)
        # These must be set externally before cerebro.run()
        # We use a dict lookup keyed by date (string YYYY-MM-DD)
        ('vix_regime', None),        # dict date->bool: True if VIX < MA (bad condition)
        ('us10y_regime', None),      # dict date->bool: True if US10Y > MA (bad condition)
    )

    def log(self, txt, dt=None):
        if self.p.printlog:
            dt = dt or self.data.datetime.datetime(0)
            print(f'{dt} {txt}')

    def __init__(self):
        # Daily ATR on the 30m data — approximate using HLC of completed daily bars
        # We compute daily ATR as a rolling daily high-low range SMA
        # Since data is 30m, we aggregate in next() to simulate daily ATR
        self.atr_30m = btind.ATR(self.data, period=self.p.atr_len * 16)  # ~atr_len days
        self.atr_ma = btind.SMA(self.atr_30m, period=20)

        self.order = None
        self.stop_price = None
        self.target_price = None
        self.entry_size = 0

        # Daily ATR tracking
        self.daily_highs = []
        self.daily_lows = []
        self.daily_closes = []
        self._last_date = None
        self._daily_atr_vals = []   # confirmed daily ATR values
        self._daily_atr_ma_vals = []

    def _get_regime_multiplier(self, dt):
        """Compute regime multiplier from external signals (prior-day confirmed)."""
        bad_conditions = 0
        date_str = dt.strftime('%Y-%m-%d')

        # Bad condition 1: daily ATR low (below its own MA)
        if len(self._daily_atr_vals) >= self.p.regime_ma_len:
            atr_ma = np.mean(self._daily_atr_vals[-self.p.regime_ma_len:])
            if self._daily_atr_vals[-1] < atr_ma:
                bad_conditions += 1

        # Bad condition 2: VIX below MA
        if self.p.vix_regime and date_str in self.p.vix_regime:
            if self.p.vix_regime[date_str]:
                bad_conditions += 1

        # Bad condition 3: US10Y above MA
        if self.p.us10y_regime and date_str in self.p.us10y_regime:
            if self.p.us10y_regime[date_str]:
                bad_conditions += 1

        if bad_conditions == 0:
            return 1.00
        elif bad_conditions == 1:
            return 0.75
        else:
            return 0.50

    def _update_daily_tracking(self, dt):
        """Aggregate 30m bars into daily ATR tracking."""
        date = dt.date()
        if self._last_date is None:
            self._last_date = date
            self.daily_highs.append(self.data.high[0])
            self.daily_lows.append(self.data.low[0])
            self.daily_closes.append(self.data.close[0])
        elif date == self._last_date:
            self.daily_highs[-1] = max(self.daily_highs[-1], self.data.high[0])
            self.daily_lows[-1] = min(self.daily_lows[-1], self.data.low[0])
            self.daily_closes[-1] = self.data.close[0]
        else:
            # New day — compute ATR for completed day
            if len(self.daily_closes) >= 2:
                true_range = max(
                    self.daily_highs[-1] - self.daily_lows[-1],
                    abs(self.daily_highs[-1] - self.daily_closes[-2]),
                    abs(self.daily_lows[-1] - self.daily_closes[-2])
                )
                self._daily_atr_vals.append(true_range)
                if len(self._daily_atr_vals) >= self.p.atr_len:
                    atr_sma = np.mean(self._daily_atr_vals[-self.p.atr_len:])
                    self._daily_atr_ma_vals.append(atr_sma)
            self._last_date = date
            self.daily_highs.append(self.data.high[0])
            self.daily_lows.append(self.data.low[0])
            self.daily_closes.append(self.data.close[0])

    def _is_entry_bar(self, dt):
        """Monday 17:30 Berlin = 16:30 UTC (CET) or 15:30 UTC (CEST)."""
        if dt.weekday() != 0:  # Not Monday
            return False
        # Check for 17:30 CET (UTC+1) = 16:30 UTC or 17:30 CEST (UTC+2) = 15:30 UTC
        # Data comes with offset in the timezone string; after UTC conversion, check 15:30 or 16:30
        return dt.hour in (15, 16) and dt.minute == 30

    def _is_exit_bar(self, dt):
        """Wednesday 17:30 Berlin = 15:30 or 16:30 UTC."""
        if dt.weekday() != 2:  # Not Wednesday
            return False
        return dt.hour in (15, 16) and dt.minute == 30

    def next(self):
        if self.order:
            return

        dt = self.data.datetime.datetime(0)
        self._update_daily_tracking(dt)

        if not self.position:
            if self._is_entry_bar(dt) and len(self._daily_atr_ma_vals) >= 1:
                # Daily ATR SMA is the stop basis
                daily_atr_sma = self._daily_atr_ma_vals[-1]
                stop_dist = self.p.sl_atr * daily_atr_sma

                entry_price = self.data.close[0]
                self.stop_price = entry_price - stop_dist
                self.target_price = entry_price + stop_dist * self.p.rr

                regime_mult = self._get_regime_multiplier(dt)
                equity = self.broker.getvalue()
                risk_usd = equity * self.p.risk_pct * regime_mult
                stop_usd = stop_dist * self.p.contract_size
                size = max(1, int(risk_usd / stop_usd))

                self.order = self.buy(size=size)  # market, executes next bar open
                self.entry_size = size
                self.log(f'BUY SIGNAL @ {entry_price:.2f} SL={self.stop_price:.2f} TP={self.target_price:.2f} sz={size} regime_mult={regime_mult:.2f}')
        else:
            # Check stop/target/time exit
            if self.data.low[0] <= self.stop_price:
                self.order = self.close()
                self.log(f'STOP HIT @ {self.stop_price:.2f}')
                self.stop_price = None
                self.target_price = None
            elif self.data.high[0] >= self.target_price:
                self.order = self.close()
                self.log(f'TARGET HIT @ {self.target_price:.2f}')
                self.stop_price = None
                self.target_price = None
            elif self._is_exit_bar(dt):
                self.order = self.close()
                self.log(f'TIME EXIT @ {self.data.close[0]:.2f}')
                self.stop_price = None
                self.target_price = None
            elif dt.weekday() > 2:  # Thu or later = force exit (missed time exit)
                self.order = self.close()
                self.log(f'FORCE EXIT (missed Wed) @ {self.data.close[0]:.2f}')
                self.stop_price = None
                self.target_price = None
