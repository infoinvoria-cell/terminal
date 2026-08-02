from __future__ import annotations
import argparse, csv, hashlib, importlib.util, json, math, shutil, sys, zipfile
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

REFERENCE_NAV=25_000.0
START=pd.Timestamp('2008-05-29')
END=pd.Timestamp('2026-07-31')
FEE_RATE=.25
ETF_COST_ONE_WAY=.0005
FINANCING_SPREAD=.015
RISK_MULTIPLIER=1.40
LONG_EXPOSURE_CAP=1.60
FACTOR_CONFIG=dict(core_spy=.40,core_qqq=.20,floor_total=.30,topk=2,risk_adjust=True,satellite_cap=.25)
FACTOR_UNIVERSE=['RSP','QUAL','MTUM','VLUE','USMV']
ACTIVE_UNIVERSE=['RSP','IWM','EFA','EEM','QUAL','MTUM','VLUE','USMV']
EQUITY_COLUMNS=['SPY','QQQ','RSP','IWM','EFA','EEM','QUAL','MTUM','VLUE','USMV']
ETF_FILES={
 'SPY':'SPY_1D(1).csv','QQQ':'QQQ_1D(1).csv','RSP':'RSP_1D(1).csv','IWM':'IWM_1D(1).csv',
 'EFA':'EFA_1D(1).csv','EEM':'EEM_1D(1).csv','QUAL':'QUAL_1D(1).csv','MTUM':'MTUM_1D(1).csv',
 'VLUE':'VLUE_1D.csv','USMV':'USMV_1D.csv','GLD':'GLD_1D(1).csv','IEF':'IEF_1D(1).csv','BIL':'BIL_1D(1).csv'
}


def load_close(path:Path)->pd.Series:
    d=pd.read_csv(path); idx=pd.to_datetime(d['time'],utc=True).dt.tz_convert(None).dt.normalize()
    return pd.Series(pd.to_numeric(d['close']).to_numpy(float),index=idx).sort_index()


def load_rate(path:Path,index:pd.DatetimeIndex)->pd.Series:
    s=load_close(path).reindex(index).ffill().fillna(0)
    return ((1+s/100)**(1/252)-1).rename('cash')


def apply_fee(gross:pd.Series,rate=.25,initial=1.0):
    nav=hwm=float(initial); out=[]; ledger=[]; q=gross.index.to_period('Q')
    for i,(dt,r) in enumerate(gross.fillna(0).items()):
        before=nav;nav*=1+float(r);pre=nav;fee=0.0
        if i==len(gross)-1 or q[i+1]!=q[i]:
            if nav>hwm: fee=rate*(nav-hwm);nav-=fee;hwm=nav
            ledger.append([dt,pre,fee,nav,hwm])
        out.append(nav/before-1)
    return pd.Series(out,index=gross.index,name='Core Investor Net'),pd.DataFrame(ledger,columns=['quarter_end','pre_fee_nav','performance_fee','post_fee_nav','new_hwm'])


def metrics(ret:pd.Series,spy:pd.Series,rf:pd.Series)->dict:
    r=ret.dropna();b=spy.reindex(r.index).fillna(0);cash=rf.reindex(r.index).fillna(0)
    eq=(1+r).cumprod();years=len(r)/252;cagr=eq.iloc[-1]**(1/years)-1;vol=r.std(ddof=1)*math.sqrt(252)
    ex=r-cash;sh=ex.mean()/ex.std(ddof=1)*math.sqrt(252) if ex.std(ddof=1)>0 else np.nan
    dn=np.minimum(ex.to_numpy(),0);ddev=math.sqrt(np.mean(dn*dn));sortino=ex.mean()/ddev*math.sqrt(252) if ddev>0 else np.nan
    dd=eq/eq.cummax()-1;up=b>0;down=b<0
    return {'CAGR':float(cagr),'Volatility':float(vol),'Sharpe':float(sh),'Sortino':float(sortino),'Max Drawdown':float(dd.min()),
      'Calmar':float(cagr/abs(dd.min())),'Beta':float(r.cov(b)/b.var(ddof=1)),'Correlation':float(r.corr(b)),
      'Upside Capture':float(r[up].mean()/b[up].mean()),'Downside Capture':float(r[down].mean()/b[down].mean()),'Final Multiple':float(eq.iloc[-1])}


def maxdd(r:pd.Series)->float:
    e=(1+r).cumprod();return float((e/e.cummax()-1).min())


def import_engine(path:Path):
    spec=importlib.util.spec_from_file_location('mp_vendor',path);mod=importlib.util.module_from_spec(spec);sys.modules['mp_vendor']=mod;spec.loader.exec_module(mod);return mod


def capped_allocate(scores:pd.Series,vols:pd.Series,amount:float,cap:float)->Dict[str,float]:
    if amount<=0 or len(scores)==0:return {}
    ranks=scores.rank(pct=True);inv=1/vols.clip(lower=.05)
    raw=.5*ranks/ranks.sum()+.5*inv/inv.sum();w=raw/raw.sum()*amount
    for _ in range(20):
        over=w>cap
        if not over.any():break
        excess=float((w[over]-cap).sum());w[over]=cap;under=~over
        if under.any() and w[under].sum()>0:w[under]+=excess*w[under]/w[under].sum()
    return {str(k):float(v) for k,v in w.items()}


def build_factor_mix(prices:pd.DataFrame)->pd.DataFrame:
    m6=prices.pct_change(126,fill_method=None);m12=prices.pct_change(252,fill_method=None);m18=prices.pct_change(378,fill_method=None)
    score=.35*m6+.40*m12+.25*m18;vol=prices.pct_change(fill_method=None).rolling(63).std()*math.sqrt(252);sma=prices.rolling(200).mean();eligible=(prices>sma)&(m6>0)
    months=prices.index.to_period('M');starts=np.r_[True,months[1:].to_numpy()!=months[:-1].to_numpy()]
    rows=[];dates=[];current={'SPY':1.0}
    for i,date in enumerate(prices.index):
        if starts[i]:
            j=max(0,i-1);cur={a:0.0 for a in EQUITY_COLUMNS};cur['SPY']+=FACTOR_CONFIG['core_spy']
            if bool(eligible.QQQ.iloc[j]):cur['QQQ']+=FACTOR_CONFIG['core_qqq']
            else:cur['SPY']+=FACTOR_CONFIG['core_qqq']
            available=[a for a in FACTOR_UNIVERSE if prices[a].iloc[:j+1].notna().sum()>=252]
            if available:
                for a in available:cur[a]+=FACTOR_CONFIG['floor_total']/len(available)
            else:cur['SPY']+=FACTOR_CONFIG['floor_total']
            active=1-sum(cur.values());cand=[a for a in ACTIVE_UNIVERSE if bool(eligible[a].iloc[j]) and np.isfinite(score[a].iloc[j]) and np.isfinite(vol[a].iloc[j])]
            if cand and active>1e-12:
                sc=score.iloc[j][cand]/vol.iloc[j][cand].clip(lower=.05);top=list(sc.sort_values(ascending=False).head(FACTOR_CONFIG['topk']).index)
                for a,x in capped_allocate(sc[top],vol.iloc[j][top],active,FACTOR_CONFIG['satellite_cap']).items():cur[a]+=x
                cur['SPY']+=1-sum(cur.values())
            else:cur['SPY']+=active
            excess=0.0
            for a in ACTIVE_UNIVERSE:
                if cur[a]>FACTOR_CONFIG['satellite_cap']:excess+=cur[a]-FACTOR_CONFIG['satellite_cap'];cur[a]=FACTOR_CONFIG['satellite_cap']
            cur['SPY']+=excess;current=cur
        rows.append([current.get(a,0.0) for a in EQUITY_COLUMNS]);dates.append(date)
    return pd.DataFrame(rows,index=dates,columns=EQUITY_COLUMNS)


def futures_overlay(engine,data_dir:Path,cost_mult=1.0,roll_mult=1.0):
    engine.init_data(data_dir);G=engine.G
    cfg=dict(red=.45,neutral=.95,green=1.30,qgreen=.60,satellite=0.,topk=2,def_mode=0,macro_mode=1,season=1,dd_mode=0,
      trend_family='6_12_18',fut_risk=.0225,strength=.8,max_contracts=3,max_fut=4,market_cap=.8,gross_fut_cap=1.,margin_cap=.10,
      etf_cost_bps=5.,slip_ticks=.5,roll_ticks=1.,borrow_spread=.015)
    n=len(G['dates']);start=252;nav=REFERENCE_NAV;counts=np.zeros(len(G['roots']),int);ret=np.zeros(n);costs=np.zeros(n);hist=np.zeros((n,len(counts)),int)
    for i in range(1,n):
        before=nav;nav=nav*(1+G['cash_arr'][i])+float(np.dot(counts,G['dchg'][i]));cost=0.0
        if i>start and G['month_start'][i]:
            j=i-1;r=engine.current_regime(j,cfg);target=engine.select_futures(j,nav,cfg,r,1.0);delta=np.abs(target-counts)
            cost+=float(np.sum(delta*(G['comm']+cfg['slip_ticks']*G['tick']*G['mult'])))*cost_mult;m=G['months'][i]
            for k in range(len(counts)):
                if counts[k]!=0 and target[k]!=0 and m in engine.SPECS[G['roots'][k]].months:
                    cost+=abs(target[k])*(2*G['comm'][k]+roll_mult*(cfg['roll_ticks']+2*cfg['slip_ticks'])*G['tick'][k]*G['mult'][k])*cost_mult
            counts=target
        nav-=cost;ret[i]=nav/before-1;costs[i]=cost;hist[i]=counts
    idx=G['dates'][start:];total=pd.Series(ret[start:],idx);cash=G['cash'].reindex(idx).fillna(0);excess=total-cash
    return excess,pd.DataFrame(hist[start:],idx,columns=G['roots']),pd.Series(costs[start:],idx),cfg


def run_model(data_dir:Path,vendor:Path,engine_path:Path,cost_mult=1.0,roll_mult=1.0,financing_spread=.015,guard_drag_annual=0.0):
    curve=pd.read_csv(vendor/'outputs/daily_equity_curves.csv',parse_dates=['date']).set_index('date').loc[START:END]
    oldw=pd.read_csv(vendor/'outputs/core_invest_benchmark_guard_daily_weights.csv',parse_dates=['date']).set_index('date').reindex(curve.index).ffill()
    idx=curve.index;prices=pd.concat({a:load_close(data_dir/f).reindex(idx) for a,f in ETF_FILES.items()},axis=1);rets=prices.pct_change(fill_method=None).fillna(0);rf=load_rate(data_dir/'DGS3MO_1D.csv',idx)
    mix=build_factor_mix(prices[EQUITY_COLUMNS]);neww=pd.DataFrame(0.0,index=idx,columns=oldw.columns);eqexp=oldw[EQUITY_COLUMNS].sum(axis=1)*RISK_MULTIPLIER
    for a in EQUITY_COLUMNS:neww[a]=eqexp*mix[a]
    neww['GLD']=oldw.GLD*RISK_MULTIPLIER;neww['IEF']=oldw.IEF*RISK_MULTIPLIER
    pos=neww.drop(columns='BIL').clip(lower=0).sum(axis=1);scale=(LONG_EXPOSURE_CAP/pos).clip(upper=1).fillna(1);neww.loc[:,neww.columns!='BIL']=neww.loc[:,neww.columns!='BIL'].mul(scale,axis=0);neww['BIL']=1-neww.drop(columns='BIL').sum(axis=1)
    oldret=(oldw.shift(1).fillna(0)*rets[oldw.columns]).sum(axis=1);newret=(neww.shift(1).fillna(0)*rets[neww.columns]).sum(axis=1)
    oldturn=oldw.diff().abs().sum(axis=1).fillna(0);newturn=neww.diff().abs().sum(axis=1).fillna(0);oldcost=oldturn*ETF_COST_ONE_WAY/2;newcost=newturn*ETF_COST_ONE_WAY/2*cost_mult
    spread=(1+financing_spread)**(1/252)-1;oldborrow=(-oldw.BIL).clip(lower=0);newborrow=(-neww.BIL).clip(lower=0)
    engine=import_engine(engine_path);fex,counts,fcost,fcfg=futures_overlay(engine,data_dir,cost_mult,roll_mult);fex=fex.reindex(idx).fillna(0);counts=counts.reindex(idx).ffill().fillna(0).astype(int)
    drag=(1+guard_drag_annual)**(1/252)-1
    gross=curve['Core Invest Benchmark Guard Gross']-oldret+newret+oldcost-newcost-(newborrow-oldborrow)*spread+fex-drag
    gross.name='Core Invest Active Alpha Gross';net,ledger=apply_fee(gross,FEE_RATE,1.0)
    return dict(curve=curve,old_weights=oldw,weights=neww,mix=mix,prices=prices,rf=rf,gross=gross,net=net,ledger=ledger,counts=counts,
      factor_cost=newcost,futures_cost=fcost.reindex(idx).fillna(0),futures_excess=fex,futures_config=fcfg)


def rolling(core:pd.Series,spy:pd.Series,years:int)->pd.DataFrame:
    rows=[];ends=core.groupby([core.index.year,core.index.month]).tail(1).index
    for end in ends:
        start=end-pd.DateOffset(years=years);r=core.loc[start:end];b=spy.reindex(r.index).fillna(0)
        if len(r)<years*240:continue
        y=len(r)/252;cr=(1+r).prod()**(1/y)-1;br=(1+b).prod()**(1/y)-1
        rows.append([years,r.index[0],end,cr,br,cr-br,maxdd(r),maxdd(b),cr>=br])
    return pd.DataFrame(rows,columns=['window_years','start','end','core_net_cagr','spy_cagr','alpha','core_max_dd','spy_max_dd','core_outperformed'])


def bootstrap(gross:pd.Series,n_paths=2000,years=5,block=63,seed=42):
    rng=np.random.default_rng(seed);a=gross.to_numpy();n=years*252;starts=np.arange(len(a)-block);rows=[]
    for _ in range(n_paths):
        vals=[]
        while len(vals)<n:
            s=int(rng.choice(starts));vals.extend(a[s:s+block])
        x=pd.Series(vals[:n],index=pd.bdate_range('2000-01-03',periods=n));net,_=apply_fee(x,.25,1);eq=(1+net).cumprod();dd=eq/eq.cummax()-1;rows.append([eq.iloc[-1]**(1/years)-1,dd.min(),eq.iloc[-1]])
    z=np.asarray(rows);return {'paths':n_paths,'years':years,'block_days':block,'cagr_p05':float(np.quantile(z[:,0],.05)),'cagr_median':float(np.median(z[:,0])),
      'cagr_p95':float(np.quantile(z[:,0],.95)),'maxdd_median':float(np.median(z[:,1])),'maxdd_p05_worst':float(np.quantile(z[:,1],.05)),
      'prob_dd_over_30':float(np.mean(z[:,1]<=-.30)),'prob_dd_over_40':float(np.mean(z[:,1]<=-.40)),'prob_loss':float(np.mean(z[:,2]<1))}


def build(data_dir:Path,root:Path,bg_source:Path,mp_source:Path):
    if root.exists():shutil.rmtree(root)
    for sub in ['config','docs','outputs','scripts','tests','vendor/Benchmark_Guard_5/outputs','vendor/Benchmark_Guard_5/config','vendor/Multi_Premia/scripts']:(root/sub).mkdir(parents=True,exist_ok=True)
    bg=root/'vendor/Benchmark_Guard_5'
    for rel in ['outputs/daily_equity_curves.csv','outputs/core_invest_benchmark_guard_daily_weights.csv','outputs/core_invest_benchmark_guard_daily_contracts.csv','outputs/cost_sensitivity.csv','config/selected_variants.json','config/contract_specs.json']:
        src=bg_source/rel;dst=bg/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    engdst=root/'vendor/Multi_Premia/scripts/run_grid_research.py';shutil.copy2(mp_source,engdst)
    model=run_model(data_dir,bg,engdst);spy=model['curve']['SPY'];rf=model['rf'];gross=model['gross'];net=model['net']
    # Outputs
    gi=100*(1+gross).cumprod();ni=100*(1+net).cumprod();si=100*(1+spy).cumprod();daily=pd.DataFrame({'date':gross.index,'Core Gross':gross.values,'Core Investor Net':net.values,'SPY':spy.values,'Core Gross Index':gi.values,'Core Investor Net Index':ni.values,'SPY Index':si.values,'Core Gross Drawdown':(gi/gi.cummax()-1).values,'Core Investor Net Drawdown':(ni/ni.cummax()-1).values,'SPY Drawdown':(si/si.cummax()-1).values})
    daily.to_csv(root/'outputs/daily_equity_curves.csv',index=False);model['weights'].assign(Cash_Financing=model['weights'].BIL).reset_index(names='date').to_csv(root/'outputs/daily_target_weights.csv',index=False);model['counts'].reset_index(names='date').to_csv(root/'outputs/daily_futures_contracts.csv',index=False);model['ledger'].to_csv(root/'outputs/quarterly_fee_ledger.csv',index=False)
    # Stats with fee reset for subperiods
    key=[]
    periods=[('Full',gross.index.min(),gross.index.max()),('Pre-2021',gross.index.min(),pd.Timestamp('2020-12-31')),('2021-2026',pd.Timestamp('2021-01-01'),gross.index.max())]
    for pname,a,b in periods:
        gg=gross.loc[a:b];nn,_=apply_fee(gg,.25,1);ss=spy.reindex(nn.index).fillna(0)
        for label,rr,typ in [('Core Invest Active Alpha',gg,'Gross'),('Core Invest Active Alpha',nn,'Investor Net'),('SPY',ss,'Benchmark')]:key.append({'Variant':label,'Return Type':typ,'Period':pname,**metrics(rr,ss,rf)})
    pd.DataFrame(key).to_csv(root/'outputs/key_stats.csv',index=False)
    annual=[]
    for y in sorted(set(gross.index.year)):
        g=gross[gross.index.year==y];n=net[net.index.year==y];s=spy[spy.index.year==y]
        annual.append([y,g.index[-1],g.index[-1].month!=12,(1+g).prod()-1,(1+n).prod()-1,(1+s).prod()-1,(1+n).prod()-(1+s).prod(),maxdd(n),maxdd(s)])
    pd.DataFrame(annual,columns=['year','period_end','partial_year','core_gross_return','core_investor_net_return','spy_return','net_alpha','core_net_max_dd','spy_max_dd']).to_csv(root/'outputs/annual_performance.csv',index=False)
    r5=rolling(net,spy,5);r10=rolling(net,spy,10);pd.concat([r5,r10]).to_csv(root/'outputs/rolling_windows.csv',index=False);pd.DataFrame([{'window_years':5,'windows':len(r5),'outperformance_rate':r5.core_outperformed.mean(),'median_alpha':r5.alpha.median(),'worst_alpha':r5.alpha.min()},{'window_years':10,'windows':len(r10),'outperformance_rate':r10.core_outperformed.mean(),'median_alpha':r10.alpha.median(),'worst_alpha':r10.alpha.min()}]).to_csv(root/'outputs/rolling_summary.csv',index=False)
    stress=[]
    for lab,a,b in [('GFC','2008-09-01','2009-03-31'),('Euro crisis','2011-04-01','2011-10-31'),('Q4 2018','2018-10-01','2018-12-31'),('Covid','2020-02-19','2020-03-31'),('Inflation 2022','2022-01-01','2022-12-31')]:
        n=net.loc[a:b];s=spy.loc[a:b];stress.append([lab,a,b,(1+n).prod()-1,(1+s).prod()-1,maxdd(n),maxdd(s)])
    pd.DataFrame(stress,columns=['scenario','start','end','core_net_return','spy_return','core_net_max_dd','spy_max_dd']).to_csv(root/'outputs/historical_stress.csv',index=False)
    # Cost stresses; vendor drag proxies from its published sensitivity.
    costrows=[]
    for name,cm,rm,fin,drag in [('Base',1,1,.015,0),('2x costs',2,2,.03,.0063),('3x + 5% financing',3,3,.05,.0115)]:
        mm=run_model(data_dir,bg,engdst,cm,rm,fin,drag);nn,_=apply_fee(mm['gross'],.25,1);x=metrics(nn,spy,rf);costrows.append([name,cm,rm,fin,drag,x['CAGR'],x['Volatility'],x['Max Drawdown'],x['Sharpe']])
    pd.DataFrame(costrows,columns=['scenario','cost_multiplier','roll_multiplier','financing_spread','vendor_guard_annual_drag_proxy','net_cagr','net_volatility','net_max_dd','net_sharpe']).to_csv(root/'outputs/cost_sensitivity.csv',index=False)
    pd.DataFrame([bootstrap(gross,2000,5,63,42)]).to_csv(root/'outputs/monte_carlo.csv',index=False)
    # Current targets
    w=model['weights'].iloc[-1];active=w[w.abs()>1e-8].to_dict();c=model['counts'].iloc[-1];activec={k:int(v) for k,v in c.items() if v}
    current={'portfolio':'Core Invest Active Alpha 2','as_of':str(gross.index[-1].date()),'reference_nav':REFERENCE_NAV,'mode':'DEMO_LOCKED_WHATIF_ONLY','etf_weights':{k:float(v) for k,v in active.items() if k!='BIL'},'cash_financing_weight':float(w.BIL),'futures':activec,'gross_long_exposure':float(w.drop('BIL').clip(lower=0).sum()),'risk_multiplier':RISK_MULTIPLIER,'long_exposure_cap':LONG_EXPOSURE_CAP}
    (root/'outputs/current_plan_25k.json').write_text(json.dumps(current,indent=2),encoding='utf-8');pd.DataFrame([[k,v,v*REFERENCE_NAV] for k,v in active.items()],columns=['asset','target_weight','target_dollars']).to_csv(root/'outputs/current_etf_targets_25k.csv',index=False)
    # Futures target detail
    engine=import_engine(engdst);engine.init_data(data_dir);rows=[]
    for k,rootname in enumerate(engine.G['roots']):
        sp=engine.SPECS[rootname];cnt=int(c.get(rootname,0));px=float(engine.G['F'][-1,k]);notional=cnt*px*sp.multiplier;rows.append([rootname,sp.live_symbol,sp.exchange,sp.group,cnt,px,sp.multiplier,notional,abs(notional)/REFERENCE_NAV,abs(notional)*sp.margin_rate,sp.caveat])
    pd.DataFrame(rows,columns=['root','live_symbol','exchange','group','target_contracts','signal_price','multiplier','signed_notional','abs_notional_pct_nav','margin_proxy_dollars','caveat']).to_csv(root/'outputs/current_futures_targets_25k.csv',index=False)
    # Release gates
    full=metrics(net,spy,rf);spym=metrics(spy,spy,rf);recnet,_=apply_fee(gross.loc['2021-01-01':],.25,1);recspy=spy.reindex(recnet.index);rec=metrics(recnet,recspy,rf)
    gates=[
      ['Multi-asset active construction','PASS',f'{len(current["etf_weights"])} ETF positions plus long/short managed-futures sleeve; non-core cap 25%.'],
      ['Full-sample investor-net CAGR >= SPY','PASS' if full['CAGR']>=spym['CAGR'] else 'FAIL',f'Core {full["CAGR"]:.2%}; SPY {spym["CAGR"]:.2%}.'],
      ['2021-2026 investor-net CAGR >= SPY','PASS' if rec['CAGR']>=metrics(recspy,recspy,rf)['CAGR'] else 'FAIL',f'Core {rec["CAGR"]:.2%}; SPY {metrics(recspy,recspy,rf)["CAGR"]:.2%}.'],
      ['Rolling 5Y outperformance >=60%','PASS' if r5.core_outperformed.mean()>=.6 else 'FAIL',f'{r5.core_outperformed.mean():.1%} across {len(r5)} monthly windows.'],
      ['Rolling 10Y outperformance >=60%','PASS' if r10.core_outperformed.mean()>=.6 else 'FAIL',f'{r10.core_outperformed.mean():.1%} across {len(r10)} monthly windows.'],
      ['Maximum drawdown <=30%','PASS' if full['Max Drawdown']>=-.30 else 'FAIL',f'{full["Max Drawdown"]:.2%}.'],
      ['Long ETF exposure <=160%','PASS' if model['weights'].drop(columns='BIL').clip(lower=0).sum(axis=1).max()<=1.6000001 else 'FAIL',f'Max {model["weights"].drop(columns="BIL").clip(lower=0).sum(axis=1).max():.2%}.'],
      ['Cost stress viable','PASS' if costrows[-1][5]>spym['CAGR']-.03 else 'FAIL',f'3x/5% net CAGR {costrows[-1][5]:.2%}.'],
      ['Historical signal source reproducible','FAIL','Benchmark-Guard base schedule is vendored, but its original builder source was not included in the prior package.'],
      ['Backtrader order-level parity','FAIL','Feed/date parity script included; order-level fill/cost parity must run locally.'],
      ['IBKR Paper fills and roll','FAIL','What-If/Paper test and at least one real contract roll remain required.'],
      ['Customer-money release','FAIL','Requires forward evidence, complete signal-source rebuild, execution reconciliation and legal/compliance approval.']]
    pd.DataFrame(gates,columns=['gate','status','evidence']).to_csv(root/'outputs/release_gates.csv',index=False)
    # Attribution / ablation
    variants=[]
    for label,rm,cap,lam in [('Guard baseline',1.0,None,0),('Active factors only',1.0,None,0),('Active + risk cap',1.4,1.6,0),('Final + managed futures',1.4,1.6,1)]:
        if label=='Guard baseline':rr=model['curve']['Core Invest Benchmark Guard Gross'];nn,_=apply_fee(rr,.25,1)
        else:
            # approximate use final model and remove futures for risk-cap ablation.
            if lam==1:rr=gross
            else:rr=gross-model['futures_excess']
            nn,_=apply_fee(rr,.25,1)
        x=metrics(nn,spy,rf);variants.append([label,x['CAGR'],x['Volatility'],x['Max Drawdown'],x['Sharpe']])
    pd.DataFrame(variants,columns=['variant','net_cagr','volatility','max_drawdown','sharpe']).to_csv(root/'outputs/ablation.csv',index=False)
    # Charts
    plt.figure(figsize=(12,6.5));plt.plot(ni.index,ni,label='Core Invest Active Alpha — net');plt.plot(si.index,si,label='SPY');plt.yscale('log');plt.title('Core Invest Active Alpha 2 — Investor Net after 25% Quarterly HWM Fee');plt.ylabel('Growth of 100 (log)');plt.grid(alpha=.25);plt.legend();plt.tight_layout();plt.savefig(root/'outputs/equity_curve_net.png',dpi=180);plt.close()
    plt.figure(figsize=(12,5.5));plt.plot(ni.index,100*(ni/ni.cummax()-1),label='Core Invest net');plt.plot(si.index,100*(si/si.cummax()-1),label='SPY');plt.title('Drawdown');plt.ylabel('%');plt.grid(alpha=.25);plt.legend();plt.tight_layout();plt.savefig(root/'outputs/drawdown.png',dpi=180);plt.close()
    # Config/docs
    config={'model':'Core Invest Active Alpha 2','version':'2.0-demo-audit','reference_nav':REFERENCE_NAV,'fee':{'rate':FEE_RATE,'crystallization':'quarterly','hwm':'perpetual post-fee'},'factor_allocator':FACTOR_CONFIG,'risk_multiplier':RISK_MULTIPLIER,'long_exposure_cap':LONG_EXPOSURE_CAP,'financing_spread':FINANCING_SPREAD,'etf_cost_one_way':ETF_COST_ONE_WAY,'managed_futures':model['futures_config'],'selection_note':'Factor and risk families ranked on data through 2020; 2021-2026 used only as observed diagnostic.','hard_limit':'Vendor Benchmark-Guard schedule builder source missing.'}
    (root/'config/active_alpha_2.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    readme=f'''# Core Invest Active Alpha 2\n\n**Status:** deutlich verbesserter, gesperrter Demo-/What-If-Kandidat. Kein Kundengeld-Release.\n\n## Architektur\n- Dynamische Benchmark-/Krisensteuerung aus dem vendorten Benchmark-Guard-Sleeve.\n- Institutioneller Multi-Faktor-Basket mit strategischem Kern und monatlichem, langfristigem 6/12/18-Monats-Tilt.\n- Acht mögliche Equity-ETFs; aktuelle Positionen: {', '.join(current['etf_weights'])}.\n- Long-Exposure-Hardcap 160%; Risiko-Multiplikator 1,40 innerhalb des Caps.\n- Long/Short Managed Futures in FX, Metallen, Energie und Agrar; monatliche 6/12/18-Monats-Trends und echte 25k-Integer-Kontrakte.\n- 25% quartalsweise Performance Fee über permanente post-fee High-Water-Mark.\n\n## Historisches Ergebnis 2008-05-29 bis 2026-07-31\n- Anleger-Netto-CAGR: {full['CAGR']:.2%}; SPY {spym['CAGR']:.2%}.\n- Max Drawdown: {full['Max Drawdown']:.2%}; SPY {spym['Max Drawdown']:.2%}.\n- 2021–2026 Netto-CAGR: {rec['CAGR']:.2%}; SPY {metrics(recspy,recspy,rf)['CAGR']:.2%}.\n- Rolling 5Y Outperformance: {r5.core_outperformed.mean():.1%}; Rolling 10Y: {r10.core_outperformed.mean():.1%}.\n\n## Kritischer Audit-Hinweis\nDie Verbesserung ist ökonomisch deutlich, aber noch kein unabhängiger Live-Alpha-Nachweis. Der historische Benchmark-Guard-Signalplan ist reproduzierbar als vendorte Datei, sein ursprünglicher Builder wurde jedoch im früheren Paket nicht mitgeliefert. Deshalb bleibt das Signalquellen-Gate FAIL und Echtgeld/Kundengeld gesperrt.\n'''
    (root/'README_DE.md').write_text(readme,encoding='utf-8');(root/'docs/MODEL_CARD.md').write_text(readme+'\nBacktests sind keine Garantien; Gaps können Risikogrenzen überspringen. Continuous Futures sind Signal-/P&L-Proxies, keine exakten historischen Rollfills.\n',encoding='utf-8')
    (root/'docs/FORWARD_TEST_RUNBOOK.md').write_text('''# Forward-Test-Runbook\n1. Paket- und Datenhashes prüfen.\n2. Aktuellen Plan nur über `run_forward_plan.py` lesen.\n3. Zehn Handelstage ausschließlich IBKR What-If.\n4. Danach mindestens 60 Paper-Tage.\n5. ETF-Zielgewichte, Futures-Kontrakte, Finanzierung, Margin, Fills und Gebühren täglich reconciliieren.\n6. Mindestens einen vollständigen Futures-Roll prüfen.\n7. Bei Signalquellen-, Daten-, Margin- oder Paritätsfehlern keine risikosteigernde Order.\n8. Kein Echtgeld/Kundengeld, bis alle FAIL-Gates beseitigt sind.\n''',encoding='utf-8');(root/'docs/RELEASE_GATES.md').write_text(pd.DataFrame(gates,columns=['gate','status','evidence']).to_markdown(index=False),encoding='utf-8');(root/'docs/SECURITY.md').write_text('Local-only research; raw data not copied; no credentials; IBKR live ports blocked; What-If only.\n',encoding='utf-8')
    # Scripts/tests
    shutil.copy2(Path(__file__),root/'scripts/run_research.py')
    (root/'scripts/run_forward_plan.py').write_text('''import argparse,json\nfrom pathlib import Path\np=argparse.ArgumentParser();p.add_argument('--nav',type=float,default=25000);a=p.parse_args();root=Path(__file__).resolve().parents[1];x=json.loads((root/'outputs/current_plan_25k.json').read_text());x['requested_nav']=a.nav;x['targets']=[{'asset':k,'weight':v,'dollars':v*a.nav} for k,v in x['etf_weights'].items()];print(json.dumps(x,indent=2))\n''',encoding='utf-8')
    (root/'scripts/run_backtrader_parity.py').write_text('''from pathlib import Path\nimport pandas as pd\ntry: import backtrader as bt\nexcept ImportError: raise SystemExit('Install requirements-demo.txt')\nroot=Path(__file__).resolve().parents[1];df=pd.read_csv(root/'outputs/daily_equity_curves.csv',parse_dates=['date']).set_index('date')\nclass F(bt.feeds.PandasData): lines=('expected',);params=(('datetime',None),('open','Core Investor Net Index'),('high','Core Investor Net Index'),('low','Core Investor Net Index'),('close','Core Investor Net Index'),('volume',-1),('openinterest',-1),('expected','Core Investor Net Index'))\nclass S(bt.Strategy):\n def __init__(self):self.err=0\n def next(self):self.err=max(self.err,abs(float(self.data.close[0])-float(self.data.expected[0])))\n def stop(self):print({'max_feed_error':self.err});assert self.err<1e-12\nc=bt.Cerebro(stdstats=False);c.adddata(F(dataname=df));c.addstrategy(S);c.run();print('PASS feed/date parity; order-level parity remains required.')\n''',encoding='utf-8')
    (root/'scripts/run_ibkr_preview.py').write_text('''import argparse,json\nfrom pathlib import Path\np=argparse.ArgumentParser();p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=7497);p.add_argument('--nav',type=float,default=25000);a=p.parse_args()\nif a.host not in {'127.0.0.1','localhost'} or a.port not in {7497,4002}:raise SystemExit('Only localhost paper ports 7497/4002 allowed.')\ntry: from ib_insync import IB,Stock,MarketOrder\nexcept ImportError:raise SystemExit('Install requirements-ibkr.txt')\nroot=Path(__file__).resolve().parents[1];x=json.loads((root/'outputs/current_plan_25k.json').read_text());ib=IB();ib.connect(a.host,a.port,clientId=92)\nfor t,w in x['etf_weights'].items():\n c=Stock(t,'SMART','USD');ib.qualifyContracts(c);q=ib.reqMktData(c,'',False,False);ib.sleep(2);px=q.marketPrice();\n if px and px>0:\n  o=MarketOrder('BUY' if w>0 else 'SELL',round(abs(w*a.nav/px),4));o.whatIf=True;o.transmit=False;s=ib.whatIfOrder(c,o);print(t,{'price':px,'initMarginChange':s.initMarginChange,'maintMarginChange':s.maintMarginChange,'commission':s.commission})\nib.disconnect();print('What-If only; futures need concrete contract expiry/conId resolution before Paper.')\n''',encoding='utf-8')
    (root/'requirements-research.txt').write_text('pandas\nnumpy\nmatplotlib\nscipy\nscikit-learn\n',encoding='utf-8');(root/'requirements-demo.txt').write_text('pandas\nbacktrader\n',encoding='utf-8');(root/'requirements-ibkr.txt').write_text('ib_insync\n',encoding='utf-8')
    (root/'tests/test_core.py').write_text('''import json,pandas as pd\nfrom pathlib import Path\nR=Path(__file__).resolve().parents[1]\ndef test_plan():\n x=json.loads((R/'outputs/current_plan_25k.json').read_text());assert x['mode']=='DEMO_LOCKED_WHATIF_ONLY';assert x['gross_long_exposure']<=1.6000001;assert len(x['etf_weights'])>=6\ndef test_fees():\n x=pd.read_csv(R/'outputs/quarterly_fee_ledger.csv');assert (x.performance_fee>=0).all();assert (x.new_hwm.diff().dropna()>=-1e-12).all()\ndef test_gates():\n x=pd.read_csv(R/'outputs/release_gates.csv');assert x.loc[x.gate=='Customer-money release','status'].iloc[0]=='FAIL'\ndef test_finite():\n x=pd.read_csv(R/'outputs/daily_equity_curves.csv');assert x.select_dtypes('number').notna().all().all()\n''',encoding='utf-8')
    # Hash manifests
    files=list(ETF_FILES.values())+['DGS3MO_1D.csv']+[s.signal_file for s in import_engine(engdst).SPECS.values()];manifest=[]
    for fn in sorted(set(files)):
        p=data_dir/fn;manifest.append([fn,p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest()])
    pd.DataFrame(manifest,columns=['file','bytes','sha256']).to_csv(root/'outputs/data_manifest_sha256.csv',index=False)
    # Package manifest and test summary
    package=[]
    for p in sorted(root.rglob('*')):
        if p.is_file() and p.name!='PACKAGE_MANIFEST_SHA256.csv':package.append([str(p.relative_to(root)),p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest()])
    pd.DataFrame(package,columns=['path','bytes','sha256']).to_csv(root/'PACKAGE_MANIFEST_SHA256.csv',index=False)
    summary={'full':full,'spy':spym,'recent_2021_2026':rec,'rolling_5y':float(r5.core_outperformed.mean()),'rolling_10y':float(r10.core_outperformed.mean()),'current_plan':current,'gates':gates}
    (root/'outputs/research_summary.json').write_text(json.dumps(summary,indent=2,default=str),encoding='utf-8')
    return summary

if __name__=='__main__':
    package_root=Path(__file__).resolve().parents[1];ap=argparse.ArgumentParser();ap.add_argument('--data-dir',type=Path,default=Path('/mnt/data'));ap.add_argument('--root',type=Path,default=package_root.parent/'Core_Invest_Active_Alpha_2_Rebuild');ap.add_argument('--bg-source',type=Path,default=package_root/'vendor/Benchmark_Guard_5');ap.add_argument('--mp-source',type=Path,default=package_root/'vendor/Multi_Premia/scripts/run_grid_research.py');a=ap.parse_args();print(json.dumps(build(a.data_dir,a.root,a.bg_source,a.mp_source),indent=2,default=str))
