from __future__ import annotations
from dataclasses import dataclass,asdict

@dataclass
class Fill:
    asset:str; security_type:str; action:str; quantity:int; price:float; commission:float; slippage:float

class MockBroker:
    def __init__(self,nav:float,stock_positions=None,future_positions=None):
        self.nav=float(nav); self.stocks=dict(stock_positions or {}); self.futures=dict(future_positions or {}); self.fills=[]
    def execute(self,orders,prices,config):
        for row in sorted(orders,key=lambda x:(x['sequence_class'],x['asset'])):
            qty=int(row['quantity']); sign=1 if row['action']=='BUY' else -1
            if row['security_type']=='STK':
                px=float(prices[row['asset']]); slip=px*float(config['execution_policy']['stock_slippage_bps'])/10000
                fill_px=px+slip if sign>0 else px-slip
                comm=max(float(config['execution_policy']['stock_commission_min']),qty*float(config['execution_policy']['stock_commission_per_share']))
                self.stocks[row['asset']]=int(self.stocks.get(row['asset'],0))+sign*qty
            else:
                fill_px=0.0; slip=float(config['execution_policy']['futures_slippage_ticks'])*1.25
                comm=qty*float(config['execution_policy']['futures_commission_per_contract'])
                self.futures[row['asset']]=int(self.futures.get(row['asset'],0))+sign*qty
            self.nav-=comm
            self.fills.append(Fill(row['asset'],row['security_type'],row['action'],qty,fill_px,comm,slip))
        return [asdict(x) for x in self.fills]
