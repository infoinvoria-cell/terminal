"""
GLD Thursday Close Long — Backtrader Strategy
Asset: GLD (ETF, daily bars)
Signal: Long entry at Thursday daily close
Exit: Next daily close (Friday close)
Stop: ATR_len × SL_multiple (intraday safety stop, applied at next open)
TP: Optional (test both TP=off and TP=2R)
Regime filter (soft): DXY < 100-MA AND US10Y < 100-MA → full size; else → half size
Commission: roundtrip ~0.04% (0.03% spread + 0.01% commission), per-side = 0.02%

Note: GLD is an ETF so size is in shares. We treat 1 GLD share ≈ $GLD_price.
Risk: 1% of equity per trade with ATR-based stop.
"""

import backtrader as bt
import backtrader.indicators as btind


class GldThursdayLong(bt.Strategy):
    params = (
        ('atr_len', 14),
        ('sl_atr', 1.0),
        ('tp_r', 0.0),              # 0 = no TP; else RR multiple (e.g. 2.0)
        ('risk_pct', 0.01),
        ('regime_ma_len', 100),     # MA length for DXY and US10Y regime filter
        ('commission_pct', 0.0002), # 0.02% per side
        ('printlog', False),
        # Regime data: dict keyed by YYYY-MM-DD, True = bad condition
        ('dxy_bad', None),          # True if DXY >= 100-MA (bad for gold)
        ('us10y_bad', None),        # True if US10Y >= 100-MA (bad for gold)
    )

    def log(self, txt, dt=None):
        if self.p.printlog:
            dt = dt or self.data.datetime.date(0)
            print(f'{dt} {txt}')

    def __init__(self):
        self.atr = btind.ATR(self.data, period=self.p.atr_len)
        self.order = None
        self.stop_price = None
        self.target_price = None
        self.entry_bar = None

    def _regime_size_mult(self, dt):
        date_str = dt.strftime('%Y-%m-%d')
        bad = 0
        if self.p.dxy_bad and self.p.dxy_bad.get(date_str, False):
            bad += 1
        if self.p.us10y_bad and self.p.us10y_bad.get(date_str, False):
            bad += 1
        return 0.5 if bad > 0 else 1.0

    def next(self):
        if self.order:
            return

        dt = self.data.datetime.date(0)
        weekday = dt.weekday()   # 0=Mon, 3=Thu, 4=Fri

        if not self.position:
            if weekday == 3:  # Thursday
                atr_val = self.atr[0]
                if atr_val <= 0:
                    return
                entry_price = self.data.close[0]
                stop_dist = self.p.sl_atr * atr_val
                self.stop_price = entry_price - stop_dist

                if self.p.tp_r > 0:
                    self.target_price = entry_price + stop_dist * self.p.tp_r
                else:
                    self.target_price = None

                size_mult = self._regime_size_mult(dt)
                equity = self.broker.getvalue()
                risk_usd = equity * self.p.risk_pct * size_mult
                size = max(1, int(risk_usd / stop_dist))  # GLD: $1 per share per point

                self.order = self.buy(size=size)  # market, executes next bar open
                self.entry_bar = len(self)
                self.log(f'BUY Thu @ {entry_price:.2f} SL={self.stop_price:.2f} sz={size}')
        else:
            weekday_now = self.data.datetime.date(0).weekday()
            bars_in = len(self) - self.entry_bar

            # Safety stop check (using low of bar)
            if self.data.low[0] <= self.stop_price:
                self.order = self.close()
                self.log(f'STOP @ {self.stop_price:.2f}')
                self.stop_price = None
                self.target_price = None
                return

            # TP check
            if self.target_price and self.data.high[0] >= self.target_price:
                self.order = self.close()
                self.log(f'TARGET @ {self.target_price:.2f}')
                self.stop_price = None
                self.target_price = None
                return

            # Time exit: Friday close (1 bar after entry Thursday close)
            if bars_in >= 1 and weekday_now == 4:
                self.order = self.close()
                self.log(f'TIME EXIT Fri @ {self.data.close[0]:.2f}')
                self.stop_price = None
                self.target_price = None
            elif bars_in >= 2:
                # Missed Friday (e.g. holiday) — exit at next available close
                self.order = self.close()
                self.log(f'FORCE EXIT @ {self.data.close[0]:.2f}')
                self.stop_price = None
                self.target_price = None
