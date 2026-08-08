"""
Gold Friday Long Calendar Anomaly — Backtrader Strategy
Asset: GC1! (Gold Futures Continuous, 240-minute bars)
Signal: Enter at close of penultimate Friday session bar; exit at final Friday close or stop/target
Commission: USD 3.00/side per contract; slippage 0
Contract size: 100 troy oz ($100/point on GC)

Penultimate-bar detection: Since COMEX closes ~17:00 ET on Friday, 240m bars typically
fall at UTC times ending 21:00 or 22:00. We define "penultimate" as the bar whose
close time is between 14:00-18:00 UTC on a Friday. This avoids any look-ahead.
Exit bar: Friday bar with close after 19:00 UTC (session end bar).
"""

import backtrader as bt
import backtrader.indicators as btind


class GoldFridayLong(bt.Strategy):
    params = (
        ('atr_len', 10),
        ('sl_atr', 1.0),
        ('rr', 1.5),
        ('risk_pct', 0.01),        # 1% equity risk per trade
        ('contract_pts_per_usd', 100),  # GC: $100 per point (1 troy oz point * 100)
        ('printlog', False),
    )

    def log(self, txt, dt=None):
        if self.p.printlog:
            dt = dt or self.data.datetime.datetime(0)
            print(f'{dt} {txt}')

    def __init__(self):
        self.atr = btind.ATR(self.data, period=self.p.atr_len)
        self.order = None
        self.stop_price = None
        self.target_price = None
        self.exit_bar = None   # bar index of final Friday bar (time exit)

    def notify_order(self, order):
        if order.status in [order.Submitted, order.Accepted]:
            return
        if order.status in [order.Completed]:
            if order.isbuy():
                self.log(f'BUY  EXEC price={order.executed.price:.2f} size={order.executed.size}')
            elif order.issell():
                self.log(f'SELL EXEC price={order.executed.price:.2f}')
        elif order.status in [order.Canceled, order.Margin, order.Rejected]:
            self.log(f'Order FAILED status={order.status}')
        self.order = None

    def next(self):
        if self.order:
            return   # pending order

        dt = self.data.datetime.datetime(0)
        is_friday = (dt.weekday() == 4)
        bar_hour_utc = dt.hour  # times in data are local with offset — we parse in UTC in loader

        if not self.position:
            # Look for penultimate Friday bar: Friday AND hour in [13, 14, 15, 16, 17, 18]
            # This covers the bar whose candle close falls roughly 4h before session end
            if is_friday and 13 <= bar_hour_utc <= 18:
                atr_val = self.atr[0]
                if atr_val <= 0:
                    return
                entry_price = self.data.close[0]
                stop_dist = self.p.sl_atr * atr_val
                self.stop_price = entry_price - stop_dist
                self.target_price = entry_price + stop_dist * self.p.rr

                # Size: risk 1% of equity
                equity = self.broker.getvalue()
                risk_usd = equity * self.p.risk_pct
                stop_usd = stop_dist * self.p.contract_pts_per_usd
                size = max(1, int(risk_usd / stop_usd))

                self.order = self.buy(size=size)  # market order, executes next bar open
                self.log(f'BUY SIGNAL @ {entry_price:.2f} SL={self.stop_price:.2f} TP={self.target_price:.2f} sz={size}')
        else:
            price = self.data.close[0]
            # Check intrabar stop/target (using close as proxy — no tick data)
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
            elif is_friday and bar_hour_utc >= 19:
                # Final Friday bar — time exit
                self.order = self.close()
                self.log(f'TIME EXIT @ {price:.2f}')
                self.stop_price = None
                self.target_price = None
            elif not is_friday and dt.weekday() in [0, 1, 2, 3]:
                # Monday or later — force exit (should not happen if time exit works)
                self.order = self.close()
                self.log(f'FORCE EXIT @ {price:.2f}')
                self.stop_price = None
                self.target_price = None
