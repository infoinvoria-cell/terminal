from __future__ import annotations
import itertools, math
from dataclasses import dataclass, asdict
from typing import Mapping
from .validation import nav_tier, ValidationError

@dataclass
class PlannedOrder:
    sequence_class: int
    asset: str
    security_type: str
    action: str
    quantity: int
    target_quantity: int
    current_quantity: int
    reference_price: float|None
    target_weight: float|None
    reason: str
    live_symbol: str|None=None
    exchange: str|None=None
    group: str|None=None


def integerize_weights(weights: Mapping[str,float], nav: float, prices: Mapping[str,float], gross_cap: float) -> dict[str,int]:
    names=sorted(weights)
    if nav<=0: raise ValidationError('NAV must be positive')
    missing=[x for x in names if x not in prices or not math.isfinite(float(prices[x])) or float(prices[x])<=0]
    if missing: raise ValidationError(f'Missing/invalid prices: {missing}')
    target_total=min(sum(float(weights[x]) for x in names),float(gross_cap))*nav
    bases={x:max(0,int(float(weights[x])*nav/float(prices[x]))) for x in names}
    # Exact small local search around fractional targets; 5^8 is bounded and deterministic.
    ranges=[]
    for x in names:
        b=bases[x]; ranges.append(range(max(0,b-1),b+4))
    best=None
    for vals in itertools.product(*ranges):
        q=dict(zip(names,vals)); total=sum(q[x]*float(prices[x]) for x in names)
        if total>target_total+1e-8: continue
        track=sum(((q[x]*float(prices[x])/nav)-float(weights[x]))**2 for x in names)
        objective=track+0.20*((total/nav)-(target_total/nav))**2
        key=(objective,-total,tuple(vals))
        if best is None or key<best[0]: best=(key,q)
    if best is None: raise ValidationError('No feasible whole-share solution')
    return best[1]


def scaled_targets(plan: dict, config: dict, nav: float, prices: Mapping[str,float]) -> tuple[dict[str,int],dict[str,int],dict]:
    tier=nav_tier(config,nav)
    raw_weights={k:float(v) for k,v in plan['etf_weights'].items()}
    raw_gross=sum(raw_weights.values())
    allowed=float(tier['max_etf_long'])
    scale=min(1.0,allowed/raw_gross) if raw_gross>0 else 0.0
    weights={k:v*scale for k,v in raw_weights.items()}
    shares=integerize_weights(weights,nav,prices,allowed)
    fut={}
    units=max(0,int(nav//float(plan['reference_nav'])))
    max_per=int(tier['max_contracts_per_market'])
    candidates=[]
    for row in plan.get('futures_targets',[]):
        target=int(row['target_contracts_at_25k'])*units
        target=max(-max_per,min(max_per,target))
        if target: candidates.append((row,target))
    candidates=candidates[:int(tier['max_active_futures'])]
    groups=set()
    for row,target in candidates:
        if len(groups)>=int(tier['max_futures_groups']) and row['group'] not in groups: continue
        groups.add(row['group']); fut[row['live_symbol']]=target
    meta={'tier':tier,'scaled_weights':weights,'target_gross_weight':sum(weights.values()),'whole_share_gross':sum(shares[x]*float(prices[x]) for x in shares)/nav}
    return shares,fut,meta


def build_orders(plan: dict, config: dict, nav: float, prices: Mapping[str,float], current_stocks: Mapping[str,int]|None=None, current_futures: Mapping[str,int]|None=None) -> tuple[list[dict],dict]:
    current_stocks={k:int(v) for k,v in (current_stocks or {}).items()}
    current_futures={k:int(v) for k,v in (current_futures or {}).items()}
    shares,fut,meta=scaled_targets(plan,config,nav,prices)
    rows=[]
    min_notional=float(config['execution_policy']['minimum_order_notional_usd'])
    weights=meta['scaled_weights']
    for asset,target in shares.items():
        current=int(current_stocks.get(asset,0)); delta=target-current
        if delta==0: continue
        px=float(prices[asset])
        if abs(delta)*px<min_notional: continue
        reduction=(current>0 and target<current) or (current<0 and target>current)
        seq=1 if reduction else 2
        rows.append(asdict(PlannedOrder(seq,asset,'STK','BUY' if delta>0 else 'SELL',abs(delta),target,current,px,weights[asset],'whole_share_rebalance')))
    all_fut=set(current_futures)|set(fut)
    spec_by_live={x['live_symbol']:x for x in plan.get('futures_targets',[])}
    for asset in sorted(all_fut):
        target=int(fut.get(asset,0)); current=int(current_futures.get(asset,0)); delta=target-current
        if delta==0: continue
        reduction=(current!=0 and (target==0 or abs(target)<abs(current) or target*current<0))
        seq=1 if reduction else 2
        spec=spec_by_live.get(asset,{})
        rows.append(asdict(PlannedOrder(seq,asset,'FUT','BUY' if delta>0 else 'SELL',abs(delta),target,current,None,None,'micro_futures_target',asset,spec.get('exchange'),spec.get('group'))))
    rows.sort(key=lambda r:(r['sequence_class'],r['security_type']!='FUT',r['asset']))
    meta['target_stock_shares']=shares; meta['target_futures']=fut
    return rows,meta
