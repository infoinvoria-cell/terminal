from __future__ import annotations
import hashlib, json
from datetime import date, datetime, timedelta
from pathlib import Path

class ValidationError(RuntimeError): pass

def canonical_hash(obj: dict) -> str:
    payload={k:v for k,v in obj.items() if k!='plan_hash'}
    raw=json.dumps(payload,sort_keys=True,separators=(',',':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()

def business_days_between(start: date, end: date) -> int:
    if end < start: return -business_days_between(end,start)
    days=0; cur=start
    while cur < end:
        cur += timedelta(days=1)
        if cur.weekday() < 5: days += 1
    return days

def nav_tier(config: dict, nav: float) -> dict:
    for tier in config['nav_tiers']:
        if float(tier['min_nav']) <= nav <= float(tier['max_nav']): return tier
    raise ValidationError(f'No NAV tier for {nav}')

def validate_plan(plan: dict, config: dict, today: date|None=None, allow_stale: bool=False) -> list[str]:
    required={'strategy_id','strategy_version','execution_release','as_of','reference_nav','mode','etf_weights','cash_financing_weight','gross_long_exposure','futures_targets','execution_caps','approval','plan_hash'}
    missing=required-set(plan)
    if missing: raise ValidationError(f'Missing plan fields: {sorted(missing)}')
    if plan['mode']!='DEMO_FORWARD_EXECUTION': raise ValidationError('Only DEMO_FORWARD_EXECUTION accepted')
    if canonical_hash(plan)!=plan['plan_hash']: raise ValidationError('Plan SHA-256 mismatch')
    asof=datetime.fromisoformat(plan['as_of']).date(); today=today or date.today()
    age=business_days_between(asof,today)
    if age<0: raise ValidationError('Plan date is in the future')
    if age>int(config['execution_policy']['max_plan_age_business_days']) and not allow_stale:
        raise ValidationError(f'Plan is stale by {age} business days')
    weights={str(k):float(v) for k,v in plan['etf_weights'].items()}
    if not weights or any(v<0 for v in weights.values()): raise ValidationError('ETF weights must be nonnegative')
    gross=sum(weights.values())
    if abs(gross-float(plan['gross_long_exposure']))>1e-8: raise ValidationError('Gross exposure does not equal ETF weight sum')
    if gross>1.5+1e-12: raise ValidationError('Execution hard cap 150% exceeded')
    if abs(float(plan['cash_financing_weight']))>float(config['concentration']['max_financing_nav'])+1e-12:
        raise ValidationError('Financing cap exceeded')
    core=set(config['concentration']['core_assets'])
    for asset,w in weights.items():
        cap=float(config['concentration']['absolute_single_etf_cap_nav'] if asset in core else config['concentration']['satellite_cap_nav'])
        if w>cap+1e-12: raise ValidationError(f'{asset} concentration {w:.2%} > {cap:.2%}')
    if plan['approval'].get('live_allowed') or plan['approval'].get('customer_money_allowed'):
        raise ValidationError('Live/customer permissions must remain false')
    warnings=[]
    if not config['research_limitations']['legacy_guard_builder_reconstructed']:
        warnings.append('Legacy guard builder not independently re-derived; reference schedule is frozen and hashed.')
    return warnings

def validate_reference_hashes(root: Path, plan: dict) -> None:
    for rel, expected in plan.get('research_reference_hashes',{}).items():
        path=root/'reference'/rel
        if not path.exists(): raise ValidationError(f'Missing reference file: {rel}')
        actual=hashlib.sha256(path.read_bytes()).hexdigest()
        if actual!=expected: raise ValidationError(f'Reference hash mismatch: {rel}')
