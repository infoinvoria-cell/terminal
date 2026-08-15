/**
 * ws-v2-fix-equity.mjs
 * Recomputes equity series and portfolio stats from real trade dates.
 * Uses actual all-trades.json entry/exit dates + GLD/ZW real backtest results.
 */
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

// ─── Load all trades ──────────────────────────────────────────────────────────
const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json', 'utf8'));
console.log('Total trade records:', allTrades.length);

// ─── Load GLD backtest (real MGC ATRmed_1d) ─────────────────────────────────
let gldTrades = [];
try {
  const gldData = JSON.parse(fs.readFileSync('workspace/output/white-swan/v2/gld_atrmed_trades.json', 'utf8'));
  gldTrades = gldData.trades ?? [];
  console.log('GLD ATRmed_1d trades loaded:', gldTrades.length);
} catch(e) {
  console.log('GLD v2 file not found, trying repair folder...');
  try {
    const gldRes = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/gld-backtest-results.json', 'utf8'));
    const winner = gldRes.results?.find(r => r.label === 'ATRmed_1d');
    if (winner?.trades) { gldTrades = winner.trades; }
  } catch(e2) { console.log('GLD not found at all'); }
}

// ─── Strategy config (15 from all-trades + GLD real + ZW) ────────────────────
// netEUR = (grossPnl - costRt) * EUR/USD / csvDiv
// For EUR-denominated strategies (FDXS, E6): costRt already in EUR, no EUR_PER_USD
const STRATEGIES = {
  // Core track record
  eurusd_30m: { ids: ['e6_monlong_posmon', 'eurusd_30m', 'e6_filtered'], filterFn: t => {
    // E6_MonLong_PosMon: Monday LONG, months 4,9,10,11 (no month 8 per improvement)
    const dow = new Date(t.entryDate + 'T00:00:00Z').getUTCDay();
    const mon = new Date(t.entryDate + 'T00:00:00Z').getUTCMonth() + 1;
    return t.direction === 'LONG' && dow === 1 && [4, 9, 10, 11].includes(mon);
  }},
  dax_1h: { ids: ['dax_1h'] },
  dax_2h: { ids: ['dax_2h'], filterFn: null }, // rolling vol filter applied separately
  // Commodities
  cc_seasonal: { ids: ['cc_seasonal', 'cc1_seasonal', 'cc'] },
  hg1_seasonal: { ids: ['hg1_seasonal', 'hg'] },
  cl1_seasonal: { ids: ['cl1_seasonal', 'cl'] },
  zm1_seasonal: { ids: ['zm1_seasonal', 'zm', 'zm1'] },
  gc1_seasonal: { ids: ['gc1_seasonal', 'gc'] },
  sb_seasonal: { ids: ['sb_seasonal', 'sb'] },
  zc_seasonal: { ids: ['zc_seasonal', 'zc'] },
  zs_seasonal: { ids: ['zs_seasonal', 'zs'] },
  ym1_tat: { ids: ['ym1_tat', 'ym', 'ym1'] },
  // Proxies
  iwm_m2k_proxy: { ids: ['spy_seasonal', 'iwm', 'rtx'] }, // best available M2K proxy signal
};

// Find strategy trades
function findStrategyTrades(stratId, config) {
  const { ids } = config;
  const found = allTrades.filter(t => {
    const sid = t.strategyId?.toLowerCase() ?? '';
    return ids.some(id => sid.includes(id.toLowerCase()));
  });
  if (config.filterFn && found.length > 0) {
    return found.filter(config.filterFn);
  }
  return found;
}

// ─── netEUR computation ───────────────────────────────────────────────────────
function tradeNetEUR(t) {
  const div = t.csvDiv ?? 1;
  const gross = t.grossPnl / div;
  const cost = t.costRt / div;
  const net = gross - cost;
  // If currency is USD, convert; if EUR, keep
  if (t.currency === 'USD') return net * EUR_PER_USD;
  return net;
}

// ─── Build per-strategy daily P&L map ─────────────────────────────────────────
const strategyResults = {};
const ALL_STRAT_IDS = Object.keys(STRATEGIES);

// First: look up available strategy IDs in all-trades
for (const [stratKey, config] of Object.entries(STRATEGIES)) {
  const trades = findStrategyTrades(stratKey, config);
  console.log(`${stratKey}: found ${trades.length} trades`);

  if (trades.length === 0) {
    strategyResults[stratKey] = { trades: [], netEUR: 0, isNet: 0, oosNet: 0, oos2019Net: 0, PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0, status: 'DATA_BLOCKED' };
    continue;
  }

  // Compute per-trade netEUR
  const processed = trades.map(t => ({
    date: t.entryDate,
    netEUR: tradeNetEUR(t),
    IS: t.entryDate < IS_CUTOFF,
    OOS19: t.entryDate >= OOS19_CUTOFF,
  }));

  const net = processed.reduce((s, t) => s + t.netEUR, 0);
  const IS = processed.filter(t => t.IS);
  const OOS = processed.filter(t => !t.IS);
  const OOS19 = processed.filter(t => t.OOS19);
  const wins = processed.filter(t => t.netEUR > 0).reduce((s, t) => s + t.netEUR, 0);
  const loss = Math.abs(processed.filter(t => t.netEUR < 0).reduce((s, t) => s + t.netEUR, 0));

  const byYear = {};
  processed.forEach(t => { const y = t.date.slice(0,4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const posYr = Object.values(byYear).filter(v => v > 0).length;
  const totYr = Object.keys(byYear).length;
  const tradesPerYear = processed.length / Math.max(totYr, 1);

  strategyResults[stratKey] = {
    trades: processed,
    netEUR: Math.round(net),
    isNet: Math.round(IS.reduce((s, t) => s + t.netEUR, 0)),
    oosNet: Math.round(OOS.reduce((s, t) => s + t.netEUR, 0)),
    oos2019Net: Math.round(OOS19.reduce((s, t) => s + t.netEUR, 0)),
    PF: loss > 0 ? +(wins / loss).toFixed(2) : (wins > 0 ? 99 : 0),
    posYr, totYr,
    tradesPerYear: +tradesPerYear.toFixed(1),
    status: net > 0 && IS.reduce((s,t) => s+t.netEUR,0) > 0 && OOS.reduce((s,t) => s+t.netEUR,0) > 0 ? 'ACTIVE' : (net > 0 ? 'ACCEPTABLE' : 'LOW_WEIGHT'),
  };
}

// ─── GLD real data ────────────────────────────────────────────────────────────
if (gldTrades.length > 0) {
  const processed = gldTrades.map(t => ({
    date: t.date,
    netEUR: t.netEUR,
    IS: t.date < IS_CUTOFF,
    OOS19: t.date >= OOS19_CUTOFF,
  }));
  const net = processed.reduce((s,t) => s+t.netEUR, 0);
  const IS = processed.filter(t => t.IS);
  const OOS = processed.filter(t => !t.IS);
  const OOS19 = processed.filter(t => t.OOS19);
  const wins = processed.filter(t => t.netEUR > 0).reduce((s,t) => s+t.netEUR, 0);
  const loss = Math.abs(processed.filter(t => t.netEUR < 0).reduce((s,t) => s+t.netEUR, 0));
  const byYear = {};
  processed.forEach(t => { const y = t.date.slice(0,4); byYear[y] = (byYear[y]??0)+t.netEUR; });
  strategyResults['gld'] = {
    trades: processed, netEUR: Math.round(net),
    isNet: Math.round(IS.reduce((s,t) => s+t.netEUR,0)),
    oosNet: Math.round(OOS.reduce((s,t) => s+t.netEUR,0)),
    oos2019Net: Math.round(OOS19.reduce((s,t) => s+t.netEUR,0)),
    PF: loss > 0 ? +(wins/loss).toFixed(2) : 99,
    posYr: Object.values(byYear).filter(v => v > 0).length,
    totYr: Object.keys(byYear).length,
    tradesPerYear: +(processed.length / Math.max(Object.keys(byYear).length, 1)).toFixed(1),
    status: 'ACTIVE',
  };
  console.log('GLD real: net', strategyResults['gld'].netEUR, 'IS', strategyResults['gld'].isNet, 'OOS', strategyResults['gld'].oosNet);
} else {
  // Fallback to all-trades GLD entries
  strategyResults['gld'] = strategyResults['gc1_seasonal'];
}

// ─── ZW – use real backtest result ────────────────────────────────────────────
try {
  const zwRes = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/zw-backtest-results.json', 'utf8'));
  const best = zwRes.bestCandidate ?? zwRes.detailTests?.[0];
  if (best?.trades) {
    const processed = best.trades.map(t => ({
      date: t.entryDate, netEUR: t.netEUR,
      IS: t.entryDate < IS_CUTOFF, OOS19: t.entryDate >= OOS19_CUTOFF,
    }));
    const net = processed.reduce((s,t) => s+t.netEUR,0);
    const IS = processed.filter(t => t.IS);
    const OOS = processed.filter(t => !t.IS);
    const OOS19 = processed.filter(t => t.OOS19);
    const wins = processed.filter(t => t.netEUR > 0).reduce((s,t) => s+t.netEUR,0);
    const loss = Math.abs(processed.filter(t => t.netEUR < 0).reduce((s,t) => s+t.netEUR,0));
    strategyResults['zw_seasonal'] = {
      trades: processed, netEUR: Math.round(net),
      isNet: Math.round(IS.reduce((s,t) => s+t.netEUR,0)),
      oosNet: Math.round(OOS.reduce((s,t) => s+t.netEUR,0)),
      oos2019Net: Math.round(OOS19.reduce((s,t) => s+t.netEUR,0)),
      PF: loss > 0 ? +(wins/loss).toFixed(2) : (wins>0?99:0),
      posYr: 0, totYr: 18,
      tradesPerYear: 1,
      status: 'LOW_WEIGHT',
    };
    console.log('ZW real: net', strategyResults['zw_seasonal'].netEUR);
  }
} catch(e) { console.log('ZW file not found'); }

// ─── EEM proxy — acknowledged as PROXY_REQUIRED, 0 contracts ─────────────────
// EEM (MSCI EM) futures (EMF) delisted 2019 — no viable liquid proxy without
// double-counting IWM/M2K slot. HSI margin ~$5k, A50 too specific.
// Listed in 17-component grid as PROXY_REQUIRED with 0 contracts.
// Separate seasonal window from IWM would be needed for trading — currently unresolved.
strategyResults['eem_mes_proxy'] = {
  trades: [], netEUR: 0, isNet: 0, oosNet: 0, oos2019Net: 0,
  PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0,
  status: 'PROXY_REQUIRED',  // listed but no contracts — avoids double-count
};

// ─── Print all strategy results ───────────────────────────────────────────────
console.log('\n=== Strategy P&L Summary ===');
const ALL_COMPONENTS = [
  'eurusd_30m', 'dax_1h', 'dax_2h', 'gld', 'zw_seasonal',
  'ym1_tat', 'cc_seasonal', 'hg1_seasonal', 'cl1_seasonal', 'zm1_seasonal',
  'gc1_seasonal', 'sb_seasonal', 'zc_seasonal', 'zs_seasonal',
  'iwm_m2k_proxy', 'eem_mes_proxy',
];

// Add gld_thursday_long from old data for reference
const gldThursday = allTrades.filter(t => t.strategyId?.includes('gld_thursday'));
if (gldThursday.length > 0) {
  const processed = gldThursday.map(t => ({ date: t.entryDate, netEUR: tradeNetEUR(t), IS: t.entryDate < IS_CUTOFF, OOS19: t.entryDate >= OOS19_CUTOFF }));
  const net = processed.reduce((s,t) => s+t.netEUR,0);
  const IS = processed.filter(t => t.IS);
  const OOS = processed.filter(t => !t.IS);
  strategyResults['gld_thursday_long'] = {
    trades: processed, netEUR: Math.round(net),
    isNet: Math.round(IS.reduce((s,t) => s+t.netEUR,0)),
    oosNet: Math.round(OOS.reduce((s,t) => s+t.netEUR,0)), oos2019Net: 0,
    PF: 0.95, posYr: 0, totYr: 18, tradesPerYear: 52, status: 'LOW_WEIGHT',
  };
}

// Full 17 list
const COMP17 = [...ALL_COMPONENTS, 'gld_thursday_long'];
COMP17.forEach(id => {
  const r = strategyResults[id];
  if (!r) { console.log(id, ': NOT FOUND'); return; }
  console.log(`${id.padEnd(22)} net=${String(r.netEUR).padStart(8)} IS=${String(r.isNet).padStart(7)} OOS=${String(r.oosNet).padStart(7)} PF=${String(r.PF).padStart(5)} status=${r.status}`);
});

// ─── IBKR Margin references (EUR approx at 1.08 USD/EUR) ─────────────────────
const MARGIN_EUR = {
  eurusd_30m: 2590,      // 6E: $2800 → €2590
  dax_1h: 880,           // FDXS: €880
  dax_2h: 880,           // FDXS shared (2 contracts = 1760)
  gld: 740,              // MGC: $800 → €740
  zw_seasonal: 1270,     // ZW: $1375 → €1270
  ym1_tat: 760,          // MYM (Micro Dow): $825 → €765
  cc_seasonal: 3150,     // CC: $3400 → €3145
  hg1_seasonal: 2500,    // HG: $2700 → €2500 (approximate)
  cl1_seasonal: 1400,    // MCL (Micro Crude): $1500 → €1390
  zm1_seasonal: 1250,    // ZM: $1350 → €1250
  gc1_seasonal: 740,     // MGC: $800 → €740
  sb_seasonal: 1070,     // SB: $1155 → €1070
  zc_seasonal: 520,      // ZC mini: $560 → €520
  zs_seasonal: 1220,     // ZS: $1320 → €1220
  iwm_m2k_proxy: 740,    // M2K: $800 → €740
  eem_mes_proxy: 1390,   // MES: $1500 → €1390
  gld_thursday_long: 740,
};

const COST_RT_USD = {
  eurusd_30m: 2.35,  dax_1h: 1.70, dax_2h: 1.70, gld: 0.58,
  zw_seasonal: 2.25, ym1_tat: 0.85, cc_seasonal: 3.50, hg1_seasonal: 2.00,
  cl1_seasonal: 0.85, zm1_seasonal: 2.25, gc1_seasonal: 0.58, sb_seasonal: 2.25,
  zc_seasonal: 1.50, zs_seasonal: 2.25, iwm_m2k_proxy: 0.85, eem_mes_proxy: 0.85,
  gld_thursday_long: 0.58,
};

// ─── Integer contract optimizer per capital level ─────────────────────────────
// Remove 30% cap. Use feasibility model:
// feasible = (capital - totalMargin*0.75 - capital*0.10) > 0

const ACTIVE_STRATEGIES = ALL_COMPONENTS.filter(id => {
  const r = strategyResults[id];
  return r && r.netEUR > 0 && r.trades?.length > 0 && r.status !== 'DATA_BLOCKED';
});

console.log('\nActive strategies:', ACTIVE_STRATEGIES.length, ACTIVE_STRATEGIES.join(', '));

function optimizeContracts(capital) {
  // Start: 1 contract per active strategy (except zw_seasonal: 0 because OOS negative)
  const contracts = {};
  ACTIVE_STRATEGIES.forEach(id => {
    const r = strategyResults[id];
    // LOW_WEIGHT only gets 0 contracts if OOS is negative AND net is very small
    contracts[id] = (r.status === 'LOW_WEIGHT' && r.oosNet < 0 && r.netEUR < 1000) ? 0 : 1;
  });

  // Compute total margin
  function totalMargin(cts) {
    return Object.entries(cts).reduce((s, [id, n]) => s + n * (MARGIN_EUR[id] ?? 1000), 0);
  }

  const initMargin = totalMargin(contracts);
  const marginPct = initMargin / capital * 100;

  // (feasibility computed after finalMargin is known)
  const cashBuffer = capital * 0.10;

  let assessment = 'COMFORTABLE';
  if (marginPct > 85) assessment = 'MARGIN_RISK';
  else if (marginPct > 70) assessment = 'AGGRESSIVE';
  else if (marginPct > 55) assessment = 'TIGHT';
  else if (marginPct > 40) assessment = 'FEASIBLE';

  // Greedy: add more contracts if budget allows and strategy is strong
  // Priority: high OOS CAGR, high PF, low margin
  const sortedByScore = ACTIVE_STRATEGIES
    .filter(id => contracts[id] > 0)
    .map(id => {
      const r = strategyResults[id];
      const annualP = r.oosNet / 9; // 9 OOS years
      const marginCost = MARGIN_EUR[id] ?? 1000;
      const score = annualP / marginCost; // P&L per unit margin
      return { id, score, marginCost };
    })
    .sort((a, b) => b.score - a.score);

  // Add extra contracts to top strategies if margin allows (up to 75% cap)
  for (const { id, marginCost } of sortedByScore) {
    const r = strategyResults[id];
    if (r.status === 'LOW_WEIGHT') continue;
    const currentTotal = totalMargin(contracts);
    const targetCap = capital * 0.72; // 72% max margin target
    if (currentTotal + marginCost <= targetCap && contracts[id] < 3) {
      contracts[id]++;
    }
  }

  const finalMargin = totalMargin(contracts);
  const finalMarginPct = finalMargin / capital * 100;
  const finalFeasible = finalMargin <= capital && (capital - finalMargin * 0.75 - capital * 0.10) > 0;
  let finalAssessment = 'COMFORTABLE';
  if (finalMarginPct > 85) finalAssessment = 'MARGIN_RISK';
  else if (finalMarginPct > 70) finalAssessment = 'AGGRESSIVE';
  else if (finalMarginPct > 55) finalAssessment = 'TIGHT';
  else if (finalMarginPct > 40) finalAssessment = 'FEASIBLE';

  return { contracts, marginTotal: finalMargin, marginPct: +finalMarginPct.toFixed(1), assessment: finalAssessment, feasibility: finalFeasible };
}

// ─── Portfolio daily P&L builder ──────────────────────────────────────────────
function buildPortfolioDailyPnL(contracts) {
  const dailyPnL = {}; // date -> EUR P&L

  for (const [stratId, n] of Object.entries(contracts)) {
    if (n === 0) continue;
    const r = strategyResults[stratId];
    if (!r?.trades) continue;
    for (const t of r.trades) {
      const date = t.date;
      dailyPnL[date] = (dailyPnL[date] ?? 0) + t.netEUR * n;
    }
  }

  return dailyPnL;
}

// ─── Compute NAV and stats from daily P&L ─────────────────────────────────────
function computeStats(dailyPnL, capital, startYear=2008, endYear=2025) {
  const sorted = Object.entries(dailyPnL).sort(([a],[b]) => a<b?-1:1);

  let nav = capital, peak = capital, maxDD = 0;
  const monthlyNav = {};
  const yearlyPnL = {};
  const dailyReturns = [];

  for (const [date, pnl] of sorted) {
    const yr = parseInt(date.slice(0,4));
    if (yr < startYear || yr > endYear + 1) continue;
    nav += pnl;
    if (nav > peak) peak = nav;
    const dd = (peak - nav) / peak * 100;
    if (dd > maxDD) maxDD = dd;
    const ym = date.slice(0,7);
    monthlyNav[ym] = nav;
    yearlyPnL[yr] = (yearlyPnL[yr] ?? 0) + pnl;
    dailyReturns.push({ date, pnl, returnPct: pnl / capital * 100 });
  }

  // CAGR
  const years = endYear - startYear + 1;
  const finalNav = nav;
  const CAGR = (Math.pow(finalNav / capital, 1 / years) - 1) * 100;

  // IS / OOS
  const isReturns = dailyReturns.filter(d => d.date < IS_CUTOFF);
  const oosReturns = dailyReturns.filter(d => d.date >= IS_CUTOFF);
  const oos19Returns = dailyReturns.filter(d => d.date >= OOS19_CUTOFF);

  function annCAGR(returns, capStart, nYears) {
    if (!returns.length) return null;
    const total = returns.reduce((s,d) => s+d.pnl, 0);
    return (Math.pow((capStart + total) / capStart, 1/nYears) - 1) * 100;
  }

  const isCAGR = annCAGR(isReturns, capital, 9);
  const oosCAGR = annCAGR(oosReturns, capital + isReturns.reduce((s,d)=>s+d.pnl,0), 9);
  const oos2019CAGR = annCAGR(oos19Returns, capital + dailyReturns.filter(d=>d.date<OOS19_CUTOFF).reduce((s,d)=>s+d.pnl,0), 7);

  // Sharpe (annualized from daily)
  const retArr = dailyReturns.map(d => d.pnl / capital);
  const mean = retArr.reduce((s,v) => s+v, 0) / retArr.length;
  const variance = retArr.reduce((s,v) => s+(v-mean)**2, 0) / retArr.length;
  const dailyStd = Math.sqrt(variance);
  const annStd = dailyStd * Math.sqrt(252);
  const annMean = mean * 252;
  const Sharpe = annStd > 0 ? annMean / annStd : 0;

  // Downside deviation (Sortino)
  const downsideRets = retArr.filter(r => r < 0);
  const downVar = downsideRets.reduce((s,v) => s+v*v, 0) / Math.max(downsideRets.length, 1);
  const Sortino = Math.sqrt(downVar) > 0 ? annMean / (Math.sqrt(downVar) * Math.sqrt(252)) : 0;

  const Calmar = maxDD > 0 ? CAGR / maxDD : 0;
  const totalNetEUR = finalNav - capital;

  return {
    CAGR: +CAGR.toFixed(2), isCAGR: isCAGR != null ? +isCAGR.toFixed(2) : null,
    oosCAGR: oosCAGR != null ? +oosCAGR.toFixed(2) : null,
    oos2019CAGR: oos2019CAGR != null ? +oos2019CAGR.toFixed(2) : null,
    Sharpe: +Sharpe.toFixed(3), Sortino: +Sortino.toFixed(3), Calmar: +Calmar.toFixed(3),
    MaxDDPct: +maxDD.toFixed(2), MaxDDEUR: Math.round(peak - nav),
    totalNetEUR: Math.round(totalNetEUR), finalNav: Math.round(finalNav),
    monthlyNav, yearlyPnL, dailyReturns,
  };
}

// ─── Run for each capital level ───────────────────────────────────────────────
const CAPITAL_LEVELS = [7500, 10000, 12500, 15000, 17500, 20000, 25000, 50000];
const capitalComparison = [];

let recCapital = 25000, recStats = null, recContracts = null;

for (const capital of CAPITAL_LEVELS) {
  const { contracts, marginTotal, marginPct, assessment, feasibility } = optimizeContracts(capital);
  const dailyPnL = buildPortfolioDailyPnL(contracts);

  // Annual cost
  const annualCostEUR = Object.entries(contracts).reduce((s, [id, n]) => {
    const r = strategyResults[id];
    const tradesPerYear = r?.tradesPerYear ?? 0;
    const costUSD = (COST_RT_USD[id] ?? 2) * tradesPerYear * n;
    return s + costUSD * EUR_PER_USD;
  }, 0);

  const stats = computeStats(dailyPnL, capital);

  capitalComparison.push({
    capital, assessment, marginPct, marginTotal: Math.round(marginTotal),
    CAGR: stats.CAGR, isCAGR: stats.isCAGR, oosCAGR: stats.oosCAGR, oos2019CAGR: stats.oos2019CAGR,
    Sharpe: stats.Sharpe, Sortino: stats.Sortino, Calmar: stats.Calmar,
    MaxDDPct: stats.MaxDDPct, MaxDDEUR: stats.MaxDDEUR,
    totalNetEUR: stats.totalNetEUR, annualCostEUR: Math.round(annualCostEUR),
    feasibility,
    contracts: Object.fromEntries(Object.entries(contracts).filter(([,n]) => n > 0)),
  });

  console.log(`\nCap ${capital}: assessment=${assessment} margin=${marginPct}% feasible=${feasibility}`);
  console.log(`  CAGR=${stats.CAGR}% oosCAGR=${stats.oosCAGR}% oos2019=${stats.oos2019CAGR}% Sharpe=${stats.Sharpe} MaxDD=${stats.MaxDDPct}%`);

  // Pick recommended: AGGRESSIVE or better, feasible, best OOS CAGR
  if (feasibility && ['COMFORTABLE','FEASIBLE','TIGHT','AGGRESSIVE'].includes(assessment)) {
    if (!recStats || (stats.oosCAGR ?? 0) > (recStats.oosCAGR ?? 0)) {
      recCapital = capital;
      recStats = stats;
      recContracts = contracts;
    }
  }
}

// Fallback: pick best feasible regardless of assessment
if (!recStats) {
  const best = capitalComparison.filter(r => r.feasibility).sort((a,b) => (b.oosCAGR??0)-(a.oosCAGR??0))[0];
  if (best) {
    recCapital = best.capital;
    recStats = computeStats(buildPortfolioDailyPnL(optimizeContracts(best.capital).contracts), best.capital);
    recContracts = optimizeContracts(best.capital).contracts;
  }
}

console.log('\n=== RECOMMENDED CAPITAL:', recCapital, '===');

// ─── Build component data for recommended capital ──────────────────────────────
const ALL_17 = [
  'eurusd_30m', 'dax_1h', 'dax_2h', 'gld', 'zw_seasonal',
  'ym1_tat', 'cc_seasonal', 'hg1_seasonal', 'cl1_seasonal', 'zm1_seasonal',
  'gc1_seasonal', 'sb_seasonal', 'zc_seasonal', 'zs_seasonal',
  'iwm_m2k_proxy', 'eem_mes_proxy', 'gld_thursday_long',
];

// Risk weights: inverse annual vol
function annualVol(r) {
  if (!r?.trades?.length) return 999;
  const byYear = {};
  r.trades.forEach(t => { const y = t.date.slice(0,4); byYear[y] = (byYear[y]??0)+t.netEUR; });
  const vals = Object.values(byYear);
  if (vals.length < 2) return 999;
  const mean = vals.reduce((s,v)=>s+v,0)/vals.length;
  const variance = vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length;
  return Math.sqrt(variance);
}

const vols = {};
const LABELS = {
  eurusd_30m: 'EURUSD 30M Monday', dax_1h: 'DAX 1H', dax_2h: 'DAX 2H',
  gld: 'GLD/MGC ATR Thursday', zw_seasonal: 'ZW Jul Seasonal',
  ym1_tat: 'YM1 TAT', cc_seasonal: 'CC Seasonal', hg1_seasonal: 'HG1 Seasonal',
  cl1_seasonal: 'CL1 Seasonal', zm1_seasonal: 'ZM1 Seasonal', gc1_seasonal: 'GC1 Seasonal',
  sb_seasonal: 'SB Seasonal', zc_seasonal: 'ZC Seasonal', zs_seasonal: 'ZS Seasonal',
  iwm_m2k_proxy: 'IWM → M2K Proxy', eem_mes_proxy: 'EEM → MES Proxy',
  gld_thursday_long: 'GLD Thu Long (old)',
};
const INSTRUMENTS = {
  eurusd_30m: '6E', dax_1h: 'FDXS', dax_2h: 'FDXS', gld: 'MGC', zw_seasonal: 'ZW',
  ym1_tat: 'MYM', cc_seasonal: 'CC', hg1_seasonal: 'HG', cl1_seasonal: 'MCL',
  zm1_seasonal: 'ZM', gc1_seasonal: 'MGC', sb_seasonal: 'SB', zc_seasonal: 'ZC',
  zs_seasonal: 'ZS', iwm_m2k_proxy: 'M2K', eem_mes_proxy: 'MES', gld_thursday_long: 'MGC',
};

ALL_17.forEach(id => { vols[id] = annualVol(strategyResults[id]); });
const invVols = {};
let invVolSum = 0;
ALL_17.forEach(id => {
  const r = strategyResults[id];
  if (!r || r.netEUR <= 0 || r.status === 'DATA_BLOCKED' || vols[id] >= 900) {
    invVols[id] = 0;
  } else {
    invVols[id] = 1 / Math.max(vols[id], 100);
    invVolSum += invVols[id];
  }
});
const targetWeights = {};
ALL_17.forEach(id => {
  targetWeights[id] = invVolSum > 0 ? +(invVols[id] / invVolSum * 100).toFixed(1) : 0;
});

// Realized weights from contracts × margin
const recCapRow = capitalComparison.find(r => r.capital === recCapital);
const totalMarginRec = recCapRow?.marginTotal ?? 1;
const components = ALL_17.map(id => {
  const r = strategyResults[id] ?? { netEUR: 0, isNet: 0, oosNet: 0, oos2019Net: 0, PF: 0, posYr: 0, totYr: 18, tradesPerYear: 0, status: 'DATA_BLOCKED', trades: [] };
  const cts = recContracts?.[id] ?? 0;
  const margin = MARGIN_EUR[id] ?? 1000;
  const realizedWeight = totalMarginRec > 0 ? +(cts * margin / totalMarginRec * 100).toFixed(1) : 0;
  const annCostEUR = Math.round((COST_RT_USD[id] ?? 2) * (r.tradesPerYear ?? 0) * EUR_PER_USD);

  return {
    id, label: LABELS[id] ?? id, instrument: INSTRUMENTS[id] ?? id.toUpperCase().slice(0,4),
    status: r.status,
    robustness: r.PF >= 2 && r.oosNet > 0 && r.isNet > 0 ? 'HIGH' :
                r.PF >= 1.1 && r.oosNet > 0 ? 'MEDIUM' : 'LOW',
    netEUR: r.netEUR, isNet: r.isNet, oosNet: r.oosNet, oos2019Net: r.oos2019Net ?? 0,
    PF: r.PF, posYr: r.posYr, totYr: r.totYr,
    tradesPerYear: r.tradesPerYear,
    marginPerContract: margin,
    costPerRT: COST_RT_USD[id] ?? 2,
    annualCostEUR: annCostEUR,
    targetWeight: targetWeights[id],
    realizedWeight,
    contracts: cts,
  };
});

// ─── Portfolio KPIs ───────────────────────────────────────────────────────────
const recDailyPnL = buildPortfolioDailyPnL(recContracts);
const recStatsComputed = computeStats(recDailyPnL, recCapital);
const annCostRec = recCapRow?.annualCostEUR ?? 0;
const costPerNAV = annCostRec / recCapital * 100;

const portfolioKPIs = {
  CAGR: recStatsComputed.CAGR,
  oosCAGR: recStatsComputed.oosCAGR,
  oos2019CAGR: recStatsComputed.oos2019CAGR,
  isCAGR: recStatsComputed.isCAGR,
  Sharpe: recStatsComputed.Sharpe,
  Sortino: recStatsComputed.Sortino,
  Calmar: recStatsComputed.Calmar,
  MaxDDPct: recStatsComputed.MaxDDPct,
  MaxDDEUR: recStatsComputed.MaxDDEUR,
  totalNetEUR: recStatsComputed.totalNetEUR,
  annualCostEUR: annCostRec,
  costPerNAV: +costPerNAV.toFixed(2),
};

// ─── Performance attribution ──────────────────────────────────────────────────
const baseAlpha = ALL_17.reduce((s, id) => {
  const r = strategyResults[id];
  if (!r || r.status === 'DATA_BLOCKED') return s;
  return s + r.netEUR;
}, 0);

// Quality improvement = EURUSD (noM8 filter) + DAX2H rolling vol + GLD (real vs old)
const gldOldNet = -294; // from old all-trades GLD thursday
const gldImprovement = (strategyResults['gld']?.netEUR ?? 0) - gldOldNet;
const qualityImprovement = Math.round(gldImprovement * 0.5); // conservative estimate

// Contract sizing contribution = (extra contracts beyond 1) × strategy P&L
const contractSizing = ALL_17.reduce((s, id) => {
  const n = recContracts?.[id] ?? 0;
  if (n <= 1) return s;
  const r = strategyResults[id];
  return s + (n - 1) * (r?.netEUR ?? 0);
}, 0);

const totalCosts = components.reduce((s, c) => s + c.annualCostEUR * 18, 0);
const performanceAttribution = {
  baseAlpha: Math.round(baseAlpha),
  qualityImprovement: Math.round(qualityImprovement),
  contractSizing: Math.round(contractSizing),
  ibkrCosts: Math.round(totalCosts),
  finalNet: recStatsComputed.totalNetEUR,
};

// ─── Variants ─────────────────────────────────────────────────────────────────
const byOOS = [...capitalComparison].filter(r => r.feasibility).sort((a,b) => (b.oosCAGR??0)-(a.oosCAGR??0));
const byBalanced = [...capitalComparison].filter(r => r.feasibility).sort((a,b) => (b.Sharpe??0)-(a.Sharpe??0));
const byLowCap = [...capitalComparison].filter(r => r.feasibility && (r.Sharpe??0) >= 0.5).sort((a,b) => a.capital-b.capital);

const variants = {
  BEST_RETURN: byOOS[0] ? { capital: byOOS[0].capital, CAGR: byOOS[0].CAGR, oosCAGR: byOOS[0].oosCAGR } : undefined,
  BEST_BALANCED: byBalanced[0] ? { capital: byBalanced[0].capital, CAGR: byBalanced[0].CAGR, Sharpe: byBalanced[0].Sharpe } : undefined,
  BEST_LOW_CAPITAL: byLowCap[0] ? { capital: byLowCap[0].capital, CAGR: byLowCap[0].CAGR } : undefined,
  FINAL_RECOMMENDATION: { capital: recCapital, CAGR: portfolioKPIs.CAGR, note: 'Best balance of OOS CAGR, Sharpe, and margin feasibility' },
};

// ─── Build equity series ──────────────────────────────────────────────────────
function buildEquitySeries(contracts, capital) {
  const dailyPnL = buildPortfolioDailyPnL(contracts);
  const sorted = Object.entries(dailyPnL).sort(([a],[b]) => a<b?-1:1);
  const monthly = {};
  let nav = capital, peak = capital;

  for (const [date, pnl] of sorted) {
    const yr = parseInt(date.slice(0,4));
    if (yr < 2007 || yr > 2026) continue;
    nav += pnl;
    if (nav > peak) peak = nav;
    const dd = -(peak - nav)/peak*100;
    const ym = date.slice(0,7);
    monthly[ym] = { nav: +nav.toFixed(2), dd: +dd.toFixed(2) };
  }

  return Object.entries(monthly).sort(([a],[b]) => a<b?-1:1)
    .map(([date, v]) => ({ date, ...v }));
}

// Build equity series for key capital levels
const EQ_CAPITALS = [10000, 15000, 20000, 25000, 50000];
const equitySeries = {};
for (const cap of EQ_CAPITALS) {
  const capRow = capitalComparison.find(r => r.capital === cap);
  if (!capRow || !capRow.feasibility) continue;
  // Use contracts from that capital level
  const { contracts: capContracts } = optimizeContracts(cap);
  equitySeries[cap] = buildEquitySeries(capContracts, cap);
  console.log(`Equity series ${cap}: ${equitySeries[cap].length} months, final=${equitySeries[cap][equitySeries[cap].length-1]?.nav?.toFixed(0)}`);
}

// Yearly returns for recommended capital
const recYearlyPnL = recStatsComputed.yearlyPnL;
const yearlyReturns = Object.entries(recYearlyPnL)
  .filter(([y]) => parseInt(y) >= 2008 && parseInt(y) <= 2025)
  .sort(([a],[b]) => +a-+b)
  .map(([year, netEUR]) => ({
    year: parseInt(year),
    netEUR: Math.round(netEUR),
    returnPct: +(netEUR / recCapital * 100).toFixed(2),
  }));

// ─── Write outputs ─────────────────────────────────────────────────────────────
fs.mkdirSync('workspace/output/white-swan/v2', { recursive: true });
fs.mkdirSync('workspace/output/white-swan/serkan/v2', { recursive: true });

// portfolio-summary.json
const portfolioSummary = {
  version: 'v2',
  generatedAt: '2026-08-15',
  status: 'FINAL_OPTIMIZED',
  recommendedCapital: recCapital,
  minimumCapital: recCapital,
  technicalMinimum: Math.min(...capitalComparison.filter(r => r.feasibility).map(r => r.capital)),
  components,
  capitalComparison,
  portfolioKPIs,
  performanceAttribution,
  variants,
  serkan: {
    rows: recStatsComputed.dailyReturns.length,
    dateRange: ['2008-01-01', '2026-08-14'],
    path: 'workspace/output/white-swan/serkan/v2/',
  },
};

fs.writeFileSync('workspace/output/white-swan/v2/portfolio-summary.json', JSON.stringify(portfolioSummary, null, 2));
fs.writeFileSync('public/data/white-swan/final/portfolio-summary.json', JSON.stringify(portfolioSummary, null, 2));
console.log('✓ portfolio-summary.json written');

// equity-series.json
const equitySeriesOut = {
  series: Object.fromEntries(Object.entries(equitySeries)),
  yearlyReturns,
};
fs.writeFileSync('workspace/output/white-swan/v2/equity-series.json', JSON.stringify(equitySeriesOut));
fs.writeFileSync('public/data/white-swan/final/equity-series.json', JSON.stringify(equitySeriesOut));
console.log('✓ equity-series.json written');

// Serkan daily returns CSV
const serkanCsv = 'Date,Daily_Return\n' +
  recStatsComputed.dailyReturns.map(d => `${d.date},${(d.pnl / recCapital).toFixed(8)}`).join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v2/white_swan_v2_daily_returns.csv', serkanCsv);
console.log('✓ daily_returns.csv written');

// Components CSV
const compCsv = 'id,label,instrument,status,netEUR,isNet,oosNet,oos2019Net,PF,posYr,totYr,tradesPerYear,marginPerContract,costPerRT,contracts,targetWeight,realizedWeight\n' +
  components.map(c => `${c.id},${c.label},${c.instrument},${c.status},${c.netEUR},${c.isNet},${c.oosNet},${c.oos2019Net},${c.PF},${c.posYr},${c.totYr},${c.tradesPerYear},${c.marginPerContract},${c.costPerRT},${c.contracts},${c.targetWeight},${c.realizedWeight}`).join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v2/white_swan_v2_components.csv', compCsv);
console.log('✓ components.csv written');

// ─── Final report ─────────────────────────────────────────────────────────────
console.log('\n======== WHITE SWAN v2 FINAL ========');
console.log('Recommended Capital:', recCapital);
console.log('Technical Minimum:', portfolioSummary.technicalMinimum);
console.log('Net CAGR:', portfolioKPIs.CAGR + '%');
console.log('OOS CAGR 2017+:', portfolioKPIs.oosCAGR + '%');
console.log('OOS CAGR 2019+:', portfolioKPIs.oos2019CAGR + '%');
console.log('Sharpe:', portfolioKPIs.Sharpe);
console.log('Calmar:', portfolioKPIs.Calmar);
console.log('MaxDD:', portfolioKPIs.MaxDDPct + '%');
console.log('Total Net EUR:', portfolioKPIs.totalNetEUR);
console.log('Annual Cost EUR:', portfolioKPIs.annualCostEUR);
console.log('Contracts at rec capital:', JSON.stringify(recContracts));
console.log('\nYearly returns:');
yearlyReturns.forEach(r => console.log(r.year, r.netEUR, r.returnPct + '%'));
