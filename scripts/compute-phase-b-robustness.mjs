/**
 * WHITE SWAN PHASE B — DEEP ROBUSTNESS + NEW FINALISTS
 *
 * Sections:
 *   1. EURUSD robustness (E6, E7, E9 neighbor grid)
 *   2. DAX 2H volatility regime (proxy via year performance)
 *   3. DAX 1H analysis
 *   4. GLD Thursday analysis
 *   5. ZW seasonal window analysis
 *   6. All seasonals ranking
 *   7. Portfolio variants (96 = 3 EUR × 2 D1H × 2 D2H × 2 GLD × 4 capital)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const BASE = 'C:/Users/joris/Documents/Capitalife Terminal';
const OUT = `${BASE}/workspace/output/white-swan/portfolio-lab-pb`;
const PUB = `${BASE}/public/data/white-swan/portfolio-lab-pb`;
mkdirSync(OUT, { recursive: true });
mkdirSync(PUB, { recursive: true });

const FX_EUR_PER_USD = 0.81677;
const CAPITALS = [10000, 12500, 15000, 20000];
const COST_STRESS_MULTIPLIERS = [0.50, 0.65, 0.85, 0.95, 1.25];

function daysBetween(d1, d2) {
  return (new Date(d2) - new Date(d1)) / 86400000;
}

// ─── Load trades ──────────────────────────────────────────────────────────────
const rawTrades = JSON.parse(readFileSync(`${BASE}/workspace/output/white-swan/all-trades.json`, 'utf8'));
const allTrades = rawTrades.map(t => ({
  ...t,
  grossPnlEUR: t.grossPnl * (t.currency === 'EUR' ? 1 : FX_EUR_PER_USD),
  costsEUR: t.costRt * (t.currency === 'EUR' ? 1 : FX_EUR_PER_USD),
  netPnlEUR: (t.grossPnl - t.costRt) * (t.currency === 'EUR' ? 1 : FX_EUR_PER_USD),
  holdingDays: daysBetween(t.entryDate, t.exitDate),
  entryDow: new Date(t.entryDate).getDay(),
  entryMonth: new Date(t.entryDate).getMonth() + 1,
  entryQuarter: Math.ceil((new Date(t.entryDate).getMonth() + 1) / 3),
  entryYear: new Date(t.entryDate).getFullYear(),
}));
console.log(`Loaded ${allTrades.length} trades`);

const BLOCKED = new Set(['EEM', 'IWM']);

// ─── KPI engine ───────────────────────────────────────────────────────────────
function buildNAVSeries(trades, startNAV) {
  const dailyMap = {};
  for (const t of trades) {
    const date = t.exitDate.slice(0, 10);
    dailyMap[date] = (dailyMap[date] ?? 0) + t.netPnlEUR;
  }
  const dates = Object.keys(dailyMap).sort();
  if (dates.length === 0) return { series: [], endNAV: startNAV, maxDDPeak: 0 };
  let nav = startNAV, peak = startNAV, maxDD = 0;
  const series = [];
  for (const date of dates) {
    nav += dailyMap[date];
    series.push({ date, nav });
    if (nav > peak) peak = nav;
    const dd = 1 - nav / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return { series, endNAV: nav, maxDDPeak: maxDD * 100 };
}

function computeKPIs(trades, startNAV = 10000, includeNavSeries = false) {
  if (trades.length === 0) return { error: 'NO_TRADES', totalTrades: 0 };
  const { series, endNAV, maxDDPeak } = buildNAVSeries(trades, startNAV);
  if (series.length < 2) return { error: 'INSUFFICIENT_DATES', totalTrades: trades.length };

  const firstEntry = trades.reduce((d, t) => t.entryDate < d ? t.entryDate : d, trades[0].entryDate);
  const lastExit = series[series.length - 1].date;
  const elapsedDays = (new Date(lastExit) - new Date(firstEntry)) / 86400000;
  const elapsedYears = elapsedDays / 365.25;
  if (elapsedYears < 0.1) return { error: 'TOO_SHORT', totalTrades: trades.length };

  const cagr = (Math.pow(endNAV / startNAV, 365.25 / elapsedDays) - 1) * 100;
  const dailyReturns = series.map((p, i) =>
    i === 0 ? (p.nav / startNAV - 1) : (p.nav / series[i - 1].nav - 1)
  );
  const avgRet = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - avgRet) ** 2, 0) / dailyReturns.length;
  const sharpe = variance > 0 ? (avgRet / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  const calmar = maxDDPeak > 0 ? cagr / maxDDPeak : 0;

  const totalGross = trades.reduce((s, t) => s + t.grossPnlEUR, 0);
  const totalCosts = trades.reduce((s, t) => s + t.costsEUR, 0);
  const totalNet = endNAV - startNAV;
  const totalTrades = trades.length;
  const tradesPerWeek = totalTrades / (elapsedDays / 7);
  const annualCosts = totalCosts / elapsedYears;
  const annualCostPct = annualCosts / ((startNAV + endNAV) / 2) * 100;

  const pos = trades.filter(t => t.netPnlEUR > 0).reduce((s, t) => s + t.netPnlEUR, 0);
  const neg = Math.abs(trades.filter(t => t.netPnlEUR < 0).reduce((s, t) => s + t.netPnlEUR, 0));
  const profitFactor = neg > 0 ? pos / neg : 0;
  const expectancy = totalTrades > 0 ? totalNet / totalTrades : 0;

  const isTrades = trades.filter(t => t.exitDate < '2019-01-01');
  const oosTrades = trades.filter(t => t.exitDate >= '2019-01-01');
  const isNet = isTrades.reduce((s, t) => s + t.netPnlEUR, 0);
  const oosNet = oosTrades.reduce((s, t) => s + t.netPnlEUR, 0);

  let isCAGR = 0;
  if (isTrades.length > 1) {
    const isFirst = isTrades.reduce((d, t) => t.entryDate < d ? t.entryDate : d, isTrades[0].entryDate);
    const isLast = isTrades.reduce((d, t) => t.exitDate > d ? t.exitDate : d, isTrades[0].exitDate);
    const isYears = (new Date(isLast) - new Date(isFirst)) / (86400000 * 365.25);
    if (isYears > 0.1) isCAGR = (Math.pow((startNAV + isNet) / startNAV, 1 / isYears) - 1) * 100;
  }

  let oosCAGR = 0;
  const oosNav = buildNAVSeries(oosTrades, startNAV);
  if (oosNav.series.length > 1) {
    const oosDates = oosNav.series.map(p => p.date);
    const oosYears = (new Date(oosDates[oosDates.length - 1]) - new Date(oosDates[0])) / (365.25 * 86400000);
    if (oosYears > 0.1) oosCAGR = (Math.pow(oosNav.endNAV / startNAV, 1 / oosYears) - 1) * 100;
  }

  const result = {
    startNAV, endNAV: +endNAV.toFixed(2),
    elapsedYears: +elapsedYears.toFixed(4),
    cagr: +cagr.toFixed(4),
    isCAGR: +isCAGR.toFixed(4),
    oosCAGR: +oosCAGR.toFixed(4),
    sharpe: +sharpe.toFixed(4),
    calmar: +calmar.toFixed(4),
    maxDDFromPeak: +maxDDPeak.toFixed(4),
    totalTrades,
    totalGross: +totalGross.toFixed(2),
    totalCosts: +totalCosts.toFixed(2),
    totalNet: +totalNet.toFixed(2),
    isNet: +isNet.toFixed(2),
    oosNet: +oosNet.toFixed(2),
    oosNetPositive: oosNet > 0,
    tradesPerWeek: +tradesPerWeek.toFixed(3),
    annualCosts: +annualCosts.toFixed(2),
    annualCostPct: +annualCostPct.toFixed(4),
    profitFactor: +profitFactor.toFixed(4),
    expectancy: +expectancy.toFixed(4),
  };
  if (includeNavSeries) result.navSeries = series;
  return result;
}

// ─── Walk-forward ─────────────────────────────────────────────────────────────
const WF_FOLDS = [
  { label: 'F1 IS08-13/OOS14-16', is: ['2008','2009','2010','2011','2012','2013'], oos: ['2014','2015','2016'] },
  { label: 'F2 IS09-14/OOS15-17', is: ['2009','2010','2011','2012','2013','2014'], oos: ['2015','2016','2017'] },
  { label: 'F3 IS10-15/OOS16-18', is: ['2010','2011','2012','2013','2014','2015'], oos: ['2016','2017','2018'] },
  { label: 'F4 IS11-16/OOS17-19', is: ['2011','2012','2013','2014','2015','2016'], oos: ['2017','2018','2019'] },
  { label: 'F5 IS12-17/OOS18-20', is: ['2012','2013','2014','2015','2016','2017'], oos: ['2018','2019','2020'] },
  { label: 'F6 IS13-18/OOS19-21', is: ['2013','2014','2015','2016','2017','2018'], oos: ['2019','2020','2021'] },
  { label: 'F7 IS14-19/OOS20-22', is: ['2014','2015','2016','2017','2018','2019'], oos: ['2020','2021','2022'] },
  { label: 'F8 IS15-20/OOS21-23', is: ['2015','2016','2017','2018','2019','2020'], oos: ['2021','2022','2023'] },
  { label: 'F9 IS16-21/OOS22-24', is: ['2016','2017','2018','2019','2020','2021'], oos: ['2022','2023','2024'] },
];

function walkForward(getTradesFn) {
  let positiveFolds = 0;
  const foldResults = [];
  for (const fold of WF_FOLDS) {
    const oosSet = new Set(fold.oos);
    const oosTrades = getTradesFn().filter(t => oosSet.has(t.exitDate.slice(0, 4)));
    const oosNet = oosTrades.reduce((s, t) => s + t.netPnlEUR, 0);
    const isPositive = oosNet > 0;
    if (isPositive) positiveFolds++;
    foldResults.push({ label: fold.label, oosNet: +oosNet.toFixed(2), isPositive });
  }
  return { totalFolds: 9, positiveFolds, passRate: +(positiveFolds / 9).toFixed(3), foldResults };
}

// ─── Cost stress ──────────────────────────────────────────────────────────────
function costStress(trades, startNAV = 10000) {
  return COST_STRESS_MULTIPLIERS.map(mult => {
    const stressed = trades.map(t => ({
      ...t,
      netPnlEUR: t.grossPnlEUR - t.costsEUR * mult
    }));
    const net = stressed.reduce((s, t) => s + t.netPnlEUR, 0);
    const oosNet = stressed.filter(t => t.exitDate >= '2019-01-01').reduce((s, t) => s + t.netPnlEUR, 0);
    return { mult, totalNet: +net.toFixed(2), oosNet: +oosNet.toFixed(2), oosPositive: oosNet > 0 };
  });
}

// ─── Per-year OOS net ─────────────────────────────────────────────────────────
function perYearNet(trades, oos = false) {
  const filtered = oos ? trades.filter(t => t.exitDate >= '2019-01-01') : trades;
  const byYear = {};
  for (const t of filtered) {
    const y = t.exitDate.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + t.netPnlEUR;
  }
  return Object.entries(byYear).sort().map(([year, net]) => ({ year, net: +net.toFixed(2) }));
}

// ─── Per-year grouping utility ─────────────────────────────────────────────────
function groupByYear(trades) {
  const out = {};
  for (const t of trades) {
    const y = String(t.entryYear);
    if (!out[y]) out[y] = [];
    out[y].push(t);
  }
  return out;
}

// ─── High-vol year proxy ──────────────────────────────────────────────────────
function computeHighVolYears(trades) {
  const byYear = groupByYear(trades);
  const yearStats = Object.entries(byYear).map(([y, ts]) => {
    const avgAbsNet = ts.reduce((s, t) => s + Math.abs(t.netPnlEUR), 0) / ts.length;
    return { year: +y, avgAbsNet };
  });
  const median = yearStats.map(y => y.avgAbsNet).sort((a, b) => a - b)[Math.floor(yearStats.length / 2)];
  return new Set(yearStats.filter(y => y.avgAbsNet > median).map(y => y.year));
}

// ─── Robustness verdict ───────────────────────────────────────────────────────
function robustnessVerdict(filterResult, neighborResults) {
  const { isNet, oosNet } = filterResult;
  if (filterResult.totalTrades < 30) return 'INSUFFICIENT_TRADES';
  const neighborsPositiveOOS = neighborResults.filter(n => n.oosNet > 0).length;
  if (oosNet <= 0 && isNet > 0) return 'IS_OVERFIT';
  if (oosNet <= 0) return 'OVERFIT';
  if (neighborsPositiveOOS >= 2) return 'ROBUST';
  if (neighborsPositiveOOS === 1) return 'ROBUST_PLATEAU';
  return 'FRAGILE';
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: EURUSD ROBUSTNESS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== EURUSD ROBUSTNESS ===\n');
const eurusdTrades = allTrades.filter(t => t.strategyId === 'eurusd_30m');

function makeEURFilter(id, label, fn) {
  const trades = eurusdTrades.filter(fn);
  const kpis = computeKPIs(trades, 10000);
  const wf = trades.length >= 30 ? walkForward(() => eurusdTrades.filter(fn)) : null;
  const stress = costStress(trades);
  const oosPerYear = perYearNet(trades, true);
  return { id, label, trades: trades.length, kpis, wf, stress, oosPerYear };
}

const EUR_ROBUSTNESS_GROUPS = {
  E6: {
    label: 'MON_LONG',
    filters: [
      { id: 'E6_MonLong',     label: 'Mon+Long (original)', fn: t => t.entryDow === 1 && t.direction === 'LONG' },
      { id: 'E6_MonTueLong',  label: 'Mon|Tue+Long',        fn: t => (t.entryDow === 1 || t.entryDow === 2) && t.direction === 'LONG' },
      { id: 'E6_TueLong',     label: 'Tue+Long',            fn: t => t.entryDow === 2 && t.direction === 'LONG' },
      { id: 'E6_MonAll',      label: 'Mon all dirs',         fn: t => t.entryDow === 1 },
      { id: 'E6_MonLongWide', label: 'Mon-Wed+Long',         fn: t => [1,2,3].includes(t.entryDow) && t.direction === 'LONG' },
    ]
  },
  E7: {
    label: 'JUL_SEP',
    filters: [
      { id: 'E7_JulSep',    label: 'Jul+Sep (original)', fn: t => [7,9].includes(t.entryMonth) },
      { id: 'E7_JunJulSep', label: 'Jun+Jul+Sep',        fn: t => [6,7,9].includes(t.entryMonth) },
      { id: 'E7_JulAugSep', label: 'Jul+Aug+Sep',        fn: t => [7,8,9].includes(t.entryMonth) },
      { id: 'E7_JulSepOct', label: 'Jul+Sep+Oct',        fn: t => [7,9,10].includes(t.entryMonth) },
      { id: 'E7_Q3only',    label: 'Q3 (Jul-Sep)',       fn: t => t.entryQuarter === 3 },
    ]
  },
  E9: {
    label: 'MON_Q3',
    filters: [
      { id: 'E9_MonQ3',    label: 'Mon+Q3 (original)', fn: t => t.entryDow === 1 && t.entryQuarter === 3 },
      { id: 'E9_MonQ2Q3',  label: 'Mon+Q2+Q3',         fn: t => t.entryDow === 1 && [2,3].includes(t.entryQuarter) },
      { id: 'E9_MonQ3Q4',  label: 'Mon+Q3+Q4',         fn: t => t.entryDow === 1 && [3,4].includes(t.entryQuarter) },
      { id: 'E9_MonJulSep', label: 'Mon+Jul+Sep',       fn: t => t.entryDow === 1 && [7,9].includes(t.entryMonth) },
    ]
  }
};

const eurRobustness = {};
const pad = (s, n) => String(s).padEnd(n);

for (const [groupKey, group] of Object.entries(EUR_ROBUSTNESS_GROUPS)) {
  const results = group.filters.map(f => makeEURFilter(f.id, f.label, f.fn));
  const originalResult = results[0];
  const neighbors = results.slice(1);
  const verdict = robustnessVerdict(
    { totalTrades: originalResult.trades, isNet: originalResult.kpis.isNet ?? 0, oosNet: originalResult.kpis.oosNet ?? 0 },
    neighbors.map(n => ({ oosNet: n.kpis.oosNet ?? 0 }))
  );
  eurRobustness[groupKey] = { group: groupKey, groupLabel: group.label, results, verdict };

  console.log(`--- ${groupKey}: ${group.label} (verdict: ${verdict}) ---`);
  console.log(pad('Filter', 18) + pad('Trades', 8) + pad('IS Net', 10) + pad('OOS Net', 10) + 'ExpEUR');
  for (const r of results) {
    const isNet = r.kpis.isNet ?? 0;
    const oosNet = r.kpis.oosNet ?? 0;
    const exp = r.kpis.expectancy ?? 0;
    console.log(pad(r.id, 18) + pad(r.trades, 8) + pad(isNet.toFixed(0), 10) + pad(oosNet.toFixed(0), 10) + exp.toFixed(2));
  }
  console.log('');
}

// Pick best EURUSD filter
const allEURCandidates = Object.values(eurRobustness).flatMap(g => {
  return g.results.map((r, i) => {
    const neighbors = g.results.filter((_, j) => j !== i);
    const neighborsPositiveOOS = neighbors.filter(n => (n.kpis.oosNet ?? 0) > 0).length;
    return { id: r.id, label: r.label, oosNet: r.kpis.oosNet ?? 0, expectancy: r.kpis.expectancy ?? 0, trades: r.trades, neighborsPositiveOOS };
  });
});
const bestEURFilter = allEURCandidates
  .filter(c => c.oosNet > 0 && c.neighborsPositiveOOS >= 2 && c.trades >= 30)
  .sort((a, b) => b.expectancy - a.expectancy)[0]
  ?? allEURCandidates.filter(c => c.oosNet > 0).sort((a, b) => b.expectancy - a.expectancy)[0]
  ?? { id: 'E0_Baseline', label: 'BASELINE (fallback)', oosNet: 0 };

console.log(`BEST EURUSD FILTER: ${bestEURFilter.id} — OOS=${bestEURFilter.oosNet?.toFixed(0)} EUR, exp=${bestEURFilter.expectancy?.toFixed(2)}, neighborPositiveOOS=${bestEURFilter.neighborsPositiveOOS}`);

writeFileSync(`${OUT}/eurusd-robustness.json`, JSON.stringify({ bestFilter: bestEURFilter, groups: eurRobustness }, null, 2));
console.log(`Written: eurusd-robustness.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: DAX 2H VOLATILITY REGIME
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== DAX 2H ROBUSTNESS ===\n');
const dax2hTrades = allTrades.filter(t => t.strategyId === 'dax_2h');
const highVolYears2h = computeHighVolYears(dax2hTrades);
console.log(`DAX 2H high-vol years (PROXY): ${[...highVolYears2h].sort().join(', ')}`);

function makeD2Filter(id, label, fn) {
  const trades = dax2hTrades.filter(fn);
  const kpis = computeKPIs(trades, 10000);
  const wf = trades.length >= 30 ? walkForward(() => dax2hTrades.filter(fn)) : null;
  const stress = costStress(trades);
  return { id, label, trades: trades.length, kpis, wf, stress };
}

const DAX2H_ROBUST_FILTERS = [
  { id: 'D2_Baseline',    label: 'All trades',          fn: () => true },
  { id: 'D2_LongOnly',    label: 'LONG only',           fn: t => t.direction === 'LONG' },
  { id: 'D2_ShortOnly',   label: 'SHORT only',          fn: t => t.direction === 'SHORT' },
  { id: 'D2_MonThu',      label: 'Mon-Thu entry',       fn: t => t.entryDow >= 1 && t.entryDow <= 4 },
  { id: 'D2_Q1Q2',        label: 'Q1+Q2 entry',         fn: t => t.entryQuarter <= 2 },
  { id: 'D2_Q3Q4',        label: 'Q3+Q4 entry',         fn: t => t.entryQuarter >= 3 },
  { id: 'D2_HighVolYears', label: 'High-vol years proxy', fn: t => highVolYears2h.has(t.entryYear) },
  { id: 'D2_NonSummer',   label: 'Excl Jul+Aug',        fn: t => ![7,8].includes(t.entryMonth) },
  { id: 'D2_LongHighVol', label: 'LONG+HighVol',        fn: t => t.direction === 'LONG' && highVolYears2h.has(t.entryYear) },
  { id: 'D2_ShortHighVol', label: 'SHORT+HighVol',      fn: t => t.direction === 'SHORT' && highVolYears2h.has(t.entryYear) },
];

const dax2hRobustness = DAX2H_ROBUST_FILTERS.map(f => makeD2Filter(f.id, f.label, f.fn));

console.log(pad('Filter', 18) + pad('Trades', 8) + pad('IS Net', 10) + pad('OOS Net', 10) + pad('WF Pass', 8) + 'Exp EUR');
for (const r of dax2hRobustness) {
  const isNet = r.kpis.isNet ?? 0;
  const oosNet = r.kpis.oosNet ?? 0;
  const wfPass = r.wf ? `${r.wf.positiveFolds}/9` : 'N/A';
  const exp = r.kpis.expectancy ?? 0;
  console.log(pad(r.id, 18) + pad(r.trades, 8) + pad(isNet.toFixed(0), 10) + pad(oosNet.toFixed(0), 10) + pad(wfPass, 8) + exp.toFixed(2));
}

const bestD2 = dax2hRobustness
  .filter(r => (r.kpis.oosNet ?? 0) > 0 && r.trades >= 50)
  .sort((a, b) => (b.kpis.oosCAGR ?? 0) - (a.kpis.oosCAGR ?? 0))[0]
  ?? dax2hRobustness[0];

console.log(`BEST DAX2H FILTER: ${bestD2.id} — OOS=${(bestD2.kpis.oosNet ?? 0).toFixed(0)} EUR`);
writeFileSync(`${OUT}/dax2h-robustness.json`, JSON.stringify({ bestFilter: bestD2.id, highVolYears: [...highVolYears2h].sort(), proxyNote: 'PROXY_APPROXIMATION', results: dax2hRobustness }, null, 2));
console.log(`Written: dax2h-robustness.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3: DAX 1H ANALYSIS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== DAX 1H ANALYSIS ===\n');
const dax1hTrades = allTrades.filter(t => t.strategyId === 'dax_1h');
const highVolYears1h = computeHighVolYears(dax1hTrades);

function makeD1Filter(id, label, fn) {
  const trades = dax1hTrades.filter(fn);
  const kpis = computeKPIs(trades, 10000);
  const wf = trades.length >= 50 ? walkForward(() => dax1hTrades.filter(fn)) : null;
  const stress = costStress(trades);
  return { id, label, trades: trades.length, kpis, wf, stress, flag: trades.length < 50 ? 'INSUFFICIENT_TRADES' : undefined };
}

const DAX1H_ROBUST_FILTERS = [
  { id: 'D1_Baseline',   label: 'All trades',        fn: () => true },
  { id: 'D1_LongOnly',   label: 'LONG only',         fn: t => t.direction === 'LONG' },
  { id: 'D1_ShortOnly',  label: 'SHORT only',        fn: t => t.direction === 'SHORT' },
  { id: 'D1_MonThu',     label: 'Mon-Thu entry',     fn: t => t.entryDow >= 1 && t.entryDow <= 4 },
  { id: 'D1_Q1Q3',       label: 'Q1+Q3',             fn: t => [1,3].includes(t.entryQuarter) },
  { id: 'D1_WinterMon',  label: 'Oct-Mar entry',     fn: t => [10,11,12,1,2,3].includes(t.entryMonth) },
  { id: 'D1_LongMonThu', label: 'LONG+Mon-Thu',      fn: t => t.direction === 'LONG' && t.entryDow >= 1 && t.entryDow <= 4 },
];

const dax1hRobustness = DAX1H_ROBUST_FILTERS.map(f => makeD1Filter(f.id, f.label, f.fn));

console.log(pad('Filter', 18) + pad('Trades', 8) + pad('IS Net', 10) + pad('OOS Net', 10) + pad('WF Pass', 8) + 'Exp EUR');
for (const r of dax1hRobustness) {
  const isNet = r.kpis.isNet ?? 0;
  const oosNet = r.kpis.oosNet ?? 0;
  const wfPass = r.wf ? `${r.wf.positiveFolds}/9` : (r.flag ?? 'N/A');
  const exp = r.kpis.expectancy ?? 0;
  console.log(pad(r.id, 18) + pad(r.trades, 8) + pad(isNet.toFixed(0), 10) + pad(oosNet.toFixed(0), 10) + pad(wfPass, 8) + exp.toFixed(2));
}

const bestD1 = dax1hRobustness
  .filter(r => !r.flag && (r.kpis.oosNet ?? 0) > 0)
  .sort((a, b) => (b.kpis.oosCAGR ?? 0) - (a.kpis.oosCAGR ?? 0))[0]
  ?? dax1hRobustness[0];

console.log(`BEST DAX1H FILTER: ${bestD1.id} — OOS=${(bestD1.kpis.oosNet ?? 0).toFixed(0)} EUR`);
writeFileSync(`${OUT}/dax1h-robustness.json`, JSON.stringify({ bestFilter: bestD1.id, results: dax1hRobustness }, null, 2));
console.log(`Written: dax1h-robustness.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4: GLD THURSDAY ANALYSIS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== GLD THURSDAY ANALYSIS ===\n');
const gldTrades = allTrades.filter(t => t.strategyId === 'gld_thursday_long');

// Find best/worst months by avg net/trade
const gldMonthStats = {};
for (const t of gldTrades) {
  if (!gldMonthStats[t.entryMonth]) gldMonthStats[t.entryMonth] = { net: 0, trades: 0 };
  gldMonthStats[t.entryMonth].net += t.netPnlEUR;
  gldMonthStats[t.entryMonth].trades++;
}
const gldMonthRanked = Object.entries(gldMonthStats)
  .map(([m, v]) => ({ m: +m, avg: v.net / v.trades }))
  .sort((a, b) => b.avg - a.avg);
const gldBest4Months = new Set(gldMonthRanked.slice(0, 4).map(x => x.m));
const gldWorst2Months = new Set(gldMonthRanked.slice(-2).map(x => x.m));

function makeGLDFilter(id, label, fn) {
  const trades = gldTrades.filter(fn);
  const kpis = computeKPIs(trades, 10000);
  const wf = trades.length >= 30 ? walkForward(() => gldTrades.filter(fn)) : null;
  const stress = costStress(trades);
  return { id, label, trades: trades.length, kpis, wf, stress };
}

const GLD_FILTERS = [
  { id: 'GLD_Baseline',         label: 'All Thursdays',       fn: () => true },
  { id: 'GLD_Q1Q2',             label: 'Q1+Q2 (Jan-Jun)',     fn: t => t.entryQuarter <= 2 },
  { id: 'GLD_Q3Q4',             label: 'Q3+Q4 (Jul-Dec)',     fn: t => t.entryQuarter >= 3 },
  { id: 'GLD_BestMonths',       label: 'Top 4 months',        fn: t => gldBest4Months.has(t.entryMonth) },
  { id: 'GLD_WorstExcluded',    label: 'Excl worst 2 months', fn: t => !gldWorst2Months.has(t.entryMonth) },
  { id: 'GLD_RecentBias',       label: '2015+',               fn: t => t.entryYear >= 2015 },
  { id: 'GLD_PreCovid',         label: 'Pre-2020',            fn: t => t.entryYear < 2020 },
  { id: 'GLD_PostCovid',        label: '2020+',               fn: t => t.entryYear >= 2020 },
  { id: 'GLD_WinterOnly',       label: 'Nov-Feb',             fn: t => [11,12,1,2].includes(t.entryMonth) },
  { id: 'GLD_SummerOnly',       label: 'May-Aug',             fn: t => [5,6,7,8].includes(t.entryMonth) },
];

const gldRobustness = GLD_FILTERS.map(f => makeGLDFilter(f.id, f.label, f.fn));

console.log(pad('Filter', 22) + pad('Trades', 8) + pad('IS Net', 10) + pad('OOS Net', 10) + 'Exp EUR');
for (const r of gldRobustness) {
  const isNet = r.kpis.isNet ?? 0;
  const oosNet = r.kpis.oosNet ?? 0;
  const exp = r.kpis.expectancy ?? 0;
  console.log(pad(r.id, 22) + pad(r.trades, 8) + pad(isNet.toFixed(0), 10) + pad(oosNet.toFixed(0), 10) + exp.toFixed(2));
}

const bestGLD = gldRobustness.filter(r => (r.kpis.oosNet ?? 0) > 0 && r.trades >= 30)
  .sort((a, b) => (b.kpis.expectancy ?? 0) - (a.kpis.expectancy ?? 0))[0];

const gldVerdict = bestGLD ? 'IMPROVED' : 'NEEDS_REDESIGN';
const bestGLDId = bestGLD ? bestGLD.id : 'GLD_Baseline';
console.log(`GLD VERDICT: ${gldVerdict} — best=${bestGLDId}`);

writeFileSync(`${OUT}/gld-robustness.json`, JSON.stringify({
  verdict: gldVerdict, bestFilter: bestGLDId,
  bestMonths: [...gldBest4Months].sort((a,b)=>a-b),
  worstMonths: [...gldWorst2Months].sort((a,b)=>a-b),
  results: gldRobustness
}, null, 2));
console.log(`Written: gld-robustness.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 5: ZW SEASONAL ANALYSIS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== ZW SEASONAL ANALYSIS ===\n');
const zwTrades = allTrades.filter(t => t.strategyId === 'zw_seasonal');
const zwOOS = zwTrades.filter(t => t.exitDate >= '2019-01-01');
const zwIS = zwTrades.filter(t => t.exitDate < '2019-01-01');
const zwTotalNet = zwTrades.reduce((s, t) => s + t.netPnlEUR, 0);
const zwOOSNet = zwOOS.reduce((s, t) => s + t.netPnlEUR, 0);
const zwISNet = zwIS.reduce((s, t) => s + t.netPnlEUR, 0);

const zwPerYear = perYearNet(zwTrades, false);
const zwOOSPerYear = perYearNet(zwTrades, true);
const zwOOSYearsPositive = zwOOSPerYear.filter(y => y.net > 0).length;
const zwOOSYearsTotal = zwOOSPerYear.length;

let zwVerdict = 'LOW_CONFIDENCE_SEASONAL';
if (zwOOSNet > 0 && zwOOSYearsPositive / zwOOSYearsTotal >= 0.6) {
  zwVerdict = zwOOSNet < 500 ? 'LOW_MARGIN_SEASONAL' : 'MODERATE';
}

const zwCostStress = costStress(zwTrades);

console.log(`ZW total trades: ${zwTrades.length}`);
console.log(`ZW IS net: ${zwISNet.toFixed(2)} EUR (${zwIS.length} trades)`);
console.log(`ZW OOS net: ${zwOOSNet.toFixed(2)} EUR (${zwOOS.length} trades)`);
console.log(`OOS years positive: ${zwOOSYearsPositive}/${zwOOSYearsTotal}`);
console.log(`Verdict: ${zwVerdict}`);
console.log('Year-by-year:', zwPerYear.map(y => `${y.year}:${y.net.toFixed(0)}`).join(' '));

writeFileSync(`${OUT}/zw-robustness.json`, JSON.stringify({
  strategyId: 'zw_seasonal',
  totalTrades: zwTrades.length,
  totalNet: +zwTotalNet.toFixed(2),
  isNet: +zwISNet.toFixed(2),
  oosNet: +zwOOSNet.toFixed(2),
  oosYearsPositive: zwOOSYearsPositive,
  oosYearsTotal: zwOOSYearsTotal,
  verdict: zwVerdict,
  recommendation: 'Keep 1 contract. True entry-window backtest requires OHLCV data.',
  perYear: zwPerYear,
  oosPerYear: zwOOSPerYear,
  costStress: zwCostStress
}, null, 2));
console.log(`Written: zw-robustness.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 6: ALL SEASONALS RANKING
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== ALL SEASONALS RANKING ===\n');
const SEASONAL_IDS = [
  'cc_seasonal', 'sb_seasonal', 'hg1_seasonal', 'cl1_seasonal', 'spy_seasonal',
  'gc1_seasonal', 'zm1_seasonal', 'zs_seasonal', 'zc_seasonal', 'zw_seasonal'
];
const ALSO_INCLUDE = ['dax_2h', 'dax_1h', 'gld_thursday_long', 'ym1_tat', 'eurusd_30m'];

const allSeasonalResults = [];
for (const sid of SEASONAL_IDS) {
  const trades = allTrades.filter(t => t.strategyId === sid);
  if (trades.length === 0) continue;
  const kpis = computeKPIs(trades, 10000);
  const isTrades = trades.filter(t => t.exitDate < '2019-01-01');
  const oosTrades = trades.filter(t => t.exitDate >= '2019-01-01');
  const isYearsPositive = [...new Set(isTrades.map(t => t.exitDate.slice(0,4)))].filter(y => {
    return isTrades.filter(t => t.exitDate.startsWith(y)).reduce((s,t) => s + t.netPnlEUR, 0) > 0;
  }).length;
  const oosYearsAll = [...new Set(oosTrades.map(t => t.exitDate.slice(0,4)))];
  const oosYearsPositive = oosYearsAll.filter(y => {
    return oosTrades.filter(t => t.exitDate.startsWith(y)).reduce((s,t) => s + t.netPnlEUR, 0) > 0;
  }).length;
  const oosYearRate = oosYearsAll.length > 0 ? oosYearsPositive / oosYearsAll.length : 0;

  const totalGross = trades.reduce((s,t) => s + t.grossPnlEUR, 0);
  const totalCosts = trades.reduce((s,t) => s + t.costsEUR, 0);
  const costRatio = totalGross !== 0 ? totalCosts / Math.abs(totalGross) : 0;

  const oosNet = kpis.oosNet ?? 0;
  const oosCAGR = kpis.oosCAGR ?? 0;
  const pf = kpis.profitFactor ?? 0;
  const exp = kpis.expectancy ?? 0;
  const expScaled = exp / 100; // scale to ~0-2 range

  const score = (oosCAGR * 0.4) + (pf * 20 * 0.3) + (expScaled * 0.2) + (oosYearRate * 100 * 0.1);

  let flag = 'WEAK';
  if (oosNet > 0 && pf > 1.5) flag = 'STRONG';
  else if (oosNet > 0 && pf >= 1.0) flag = 'MODERATE';
  if (trades.length < 20 && Math.abs(kpis.totalGross ?? 0) > 20000) flag = 'CONCENTRATED';

  allSeasonalResults.push({
    strategyId: sid,
    totalTrades: trades.length,
    isNet: kpis.isNet ?? 0,
    oosNet,
    isYearsPositive,
    oosYearsPositive,
    oosYearsTotal: oosYearsAll.length,
    oosYearRate: +oosYearRate.toFixed(3),
    expectancy: kpis.expectancy ?? 0,
    profitFactor: pf,
    costRatio: +costRatio.toFixed(4),
    oosCAGR,
    score: +score.toFixed(2),
    flag,
    oosPerYear: perYearNet(trades, true)
  });
}

allSeasonalResults.sort((a, b) => b.score - a.score);

console.log(pad('Strategy', 18) + pad('Trades', 8) + pad('IS Net', 10) + pad('OOS Net', 10) + pad('OOS Yr+', 10) + pad('PF', 6) + pad('Score', 8) + 'Flag');
for (const r of allSeasonalResults) {
  console.log(
    pad(r.strategyId, 18) + pad(r.totalTrades, 8) + pad(r.isNet.toFixed(0), 10) +
    pad(r.oosNet.toFixed(0), 10) + pad(`${r.oosYearsPositive}/${r.oosYearsTotal}`, 10) +
    pad(r.profitFactor.toFixed(2), 6) + pad(r.score.toFixed(1), 8) + r.flag
  );
}

writeFileSync(`${OUT}/seasonals-ranking.json`, JSON.stringify(allSeasonalResults, null, 2));
console.log(`Written: seasonals-ranking.json`);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 7: PORTFOLIO VARIANTS (Phase B)
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== BUILDING PHASE B PORTFOLIO VARIANTS ===\n');

// Determine best filters from above analysis
// EURUSD: use top 3 candidates
const EUR_PB_FILTERS = [];
// E0 baseline
EUR_PB_FILTERS.push({ id: 'E0', label: 'BASELINE', fn: () => true });
// Best from E6 group
const bestE6 = eurRobustness['E6'].results[0];
EUR_PB_FILTERS.push({ id: bestE6.id, label: bestE6.label, fn: t => t.entryDow === 1 && t.direction === 'LONG' });
// Best from E9 group
const bestE9 = eurRobustness['E9'].results[0];
EUR_PB_FILTERS.push({ id: bestE9.id, label: bestE9.label, fn: t => t.entryDow === 1 && t.entryQuarter === 3 });

// DAX 1H: baseline vs best
const D1H_PB_FILTERS = [
  { id: 'D1_Baseline', label: 'BASELINE', fn: () => true },
  { id: bestD1.id, label: bestD1.label, fn: DAX1H_ROBUST_FILTERS.find(f => f.id === bestD1.id)?.fn ?? (() => true) },
];
// Deduplicate if bestD1 is baseline
if (D1H_PB_FILTERS[0].id === D1H_PB_FILTERS[1].id) D1H_PB_FILTERS.splice(1, 1);

// DAX 2H: baseline vs best
const D2H_PB_FILTERS = [
  { id: 'D2_Baseline', label: 'BASELINE', fn: () => true },
  { id: bestD2.id, label: bestD2.label, fn: DAX2H_ROBUST_FILTERS.find(f => f.id === bestD2.id)?.fn ?? (() => true) },
];
if (D2H_PB_FILTERS[0].id === D2H_PB_FILTERS[1].id) D2H_PB_FILTERS.splice(1, 1);

// GLD: baseline vs best
const gldBestFn = GLD_FILTERS.find(f => f.id === bestGLDId)?.fn ?? (() => true);
const GLD_PB_FILTERS = [
  { id: 'GLD_Baseline', label: 'BASELINE', fn: () => true },
  { id: bestGLDId, label: bestGLD?.label ?? 'BASELINE', fn: gldBestFn },
];
if (GLD_PB_FILTERS[0].id === GLD_PB_FILTERS[1].id) GLD_PB_FILTERS.splice(1, 1);

function buildPBVariantTrades(eurFn, d1hFn, d2hFn, gldFn) {
  return allTrades.filter(t => {
    if (BLOCKED.has(t.strategyId)) return false;
    if (t.strategyId === 'eurusd_30m') return eurFn(t);
    if (t.strategyId === 'dax_1h') return d1hFn(t);
    if (t.strategyId === 'dax_2h') return d2hFn(t);
    if (t.strategyId === 'gld_thursday_long') return gldFn(t);
    return true;
  });
}

function suitabilityScore(kpis, wf) {
  if (kpis.error) return 0;
  let score = 0;
  if (kpis.cagr >= 15) score += 20;
  if (kpis.oosCAGR >= 20) score += 20;
  if (kpis.sharpe >= 1.0) score += 15;
  if (kpis.calmar >= 1.0) score += 15;
  if (kpis.maxDDFromPeak <= 20) score += 10;
  if (wf && wf.passRate >= 0.7) score += 10;
  if (kpis.annualCostPct <= 5.0) score += 5;
  if (kpis.tradesPerWeek >= 4 && kpis.tradesPerWeek <= 10) score += 5;
  return Math.min(100, Math.max(0, score));
}

let variantCount = 0;
const allVariants = [];

for (const ef of EUR_PB_FILTERS) {
  for (const d1f of D1H_PB_FILTERS) {
    for (const d2f of D2H_PB_FILTERS) {
      for (const gf of GLD_PB_FILTERS) {
        const comboTrades = buildPBVariantTrades(ef.fn, d1f.fn, d2f.fn, gf.fn);
        const wf = walkForward(() => buildPBVariantTrades(ef.fn, d1f.fn, d2f.fn, gf.fn));

        for (const capital of CAPITALS) {
          const variantId = `PB_${ef.id}_${d1f.id}_${d2f.id}_${gf.id}_${capital}`;
          const kpis = computeKPIs(comboTrades, capital, false);
          const ss = suitabilityScore(kpis, wf);
          allVariants.push({
            variantId,
            phase: 'pb',
            eurFilter: ef.id,
            d1hFilter: d1f.id,
            d2hFilter: d2f.id,
            gldFilter: gf.id,
            capital,
            kpis,
            wf,
            suitabilityScore: ss,
          });
          variantCount++;
        }
      }
    }
  }
}

console.log(`Built ${variantCount} Phase B variants`);

// ─── Write per-capital files ──────────────────────────────────────────────────
for (const capital of CAPITALS) {
  const capVariants = allVariants
    .filter(v => v.capital === capital)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore);

  writeFileSync(`${OUT}/capital-${capital}.json`, JSON.stringify(capVariants, null, 2));
  console.log(`Written: capital-${capital}.json (${capVariants.length} variants)`);
}

// ─── Select finalists ─────────────────────────────────────────────────────────
const finalists = {};
for (const capital of CAPITALS) {
  const capVariants = allVariants.filter(v => v.capital === capital && !v.kpis.error);
  if (capVariants.length === 0) { finalists[capital] = []; continue; }

  const best = (arr, key, dir = 'desc') => {
    const sorted = [...arr].sort((a, b) => {
      const av = key.split('.').reduce((o, k) => o?.[k], a);
      const bv = key.split('.').reduce((o, k) => o?.[k], b);
      return dir === 'desc' ? (bv ?? 0) - (av ?? 0) : (av ?? 0) - (bv ?? 0);
    });
    return sorted[0];
  };

  const f = [
    { role: 'BEST_BALANCED', v: best(capVariants, 'suitabilityScore') },
    { role: 'BEST_RETURN',   v: best(capVariants, 'kpis.oosCAGR') },
    { role: 'BEST_RISK',     v: best(capVariants, 'kpis.maxDDFromPeak', 'asc') },
    { role: 'BEST_COST',     v: best(capVariants, 'kpis.annualCostPct', 'asc') },
    { role: 'BEST_ROBUST',   v: best(capVariants, 'wf.passRate') },
  ].filter(x => x.v);

  // Add navSeries for finalists
  finalists[capital] = f.map(({ role, v }) => {
    const varTrades = buildPBVariantTrades(
      EUR_PB_FILTERS.find(f => f.id === v.eurFilter)?.fn ?? (() => true),
      D1H_PB_FILTERS.find(f => f.id === v.d1hFilter)?.fn ?? (() => true),
      D2H_PB_FILTERS.find(f => f.id === v.d2hFilter)?.fn ?? (() => true),
      GLD_PB_FILTERS.find(f => f.id === v.gldFilter)?.fn ?? (() => true),
    );
    const kpisWithNav = computeKPIs(varTrades, v.capital, true);
    return { role, ...v, kpis: kpisWithNav };
  });
}

writeFileSync(`${OUT}/finalists.json`, JSON.stringify(finalists, null, 2));
console.log(`Written: finalists.json`);

// ─── Lookahead reference ──────────────────────────────────────────────────────
const lookaheadRef = {
  note: 'QA_ALL_HOLD1: baseline reference, no filters, all strategies active, 1 contract each',
  generated: new Date().toISOString(),
  capitalLevels: CAPITALS,
  results: CAPITALS.map(capital => {
    const trades = allTrades.filter(t => !BLOCKED.has(t.strategyId));
    const kpis = computeKPIs(trades, capital);
    return { capital, kpis };
  })
};
writeFileSync(`${OUT}/lookahead-reference.json`, JSON.stringify(lookaheadRef, null, 2));
console.log(`Written: lookahead-reference.json`);

// ─── Copy to public (strip navSeries from capital files) ──────────────────────
for (const capital of CAPITALS) {
  const capVariants = allVariants.filter(v => v.capital === capital).map(v => {
    const { navSeries, ...kpisNoNav } = v.kpis;
    return { ...v, kpis: kpisNoNav };
  });
  writeFileSync(`${PUB}/capital-${capital}.json`, JSON.stringify(capVariants, null, 2));
}
// finalists keep navSeries in public
writeFileSync(`${PUB}/finalists.json`, JSON.stringify(finalists, null, 2));
writeFileSync(`${PUB}/eurusd-robustness.json`, JSON.stringify({ bestFilter: bestEURFilter, groups: eurRobustness }, null, 2));
writeFileSync(`${PUB}/dax2h-robustness.json`, JSON.stringify({ bestFilter: bestD2.id, proxyNote: 'PROXY_APPROXIMATION', results: dax2hRobustness }, null, 2));
writeFileSync(`${PUB}/dax1h-robustness.json`, JSON.stringify({ bestFilter: bestD1.id, results: dax1hRobustness }, null, 2));
writeFileSync(`${PUB}/gld-robustness.json`, JSON.stringify({ verdict: gldVerdict, bestFilter: bestGLDId, results: gldRobustness }, null, 2));
writeFileSync(`${PUB}/zw-robustness.json`, JSON.stringify({ verdict: zwVerdict, oosYearsPositive: zwOOSYearsPositive, oosYearsTotal: zwOOSYearsTotal }, null, 2));
writeFileSync(`${PUB}/seasonals-ranking.json`, JSON.stringify(allSeasonalResults, null, 2));
writeFileSync(`${PUB}/lookahead-reference.json`, JSON.stringify(lookaheadRef, null, 2));
console.log(`\nCopied all files to public/data/white-swan/portfolio-lab-pb/`);

// ─── FINAL CONSOLE SUMMARY ────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('=== EURUSD ROBUSTNESS ===');
console.log(pad('Filter', 18) + pad('Trades', 8) + pad('OOS Net', 10) + pad('IS Net', 10) + pad('Best Neighbor', 18) + 'Verdict');
for (const [gk, grp] of Object.entries(eurRobustness)) {
  const orig = grp.results[0];
  const bestNeighbor = grp.results.slice(1).sort((a,b) => (b.kpis.oosNet??0) - (a.kpis.oosNet??0))[0];
  console.log(
    pad(orig.id, 18) + pad(orig.trades, 8) +
    pad((orig.kpis.oosNet??0).toFixed(0), 10) + pad((orig.kpis.isNet??0).toFixed(0), 10) +
    pad(bestNeighbor?.id ?? '-', 18) + grp.verdict
  );
}
console.log(`BEST EURUSD FILTER: ${bestEURFilter.id} — OOS=${bestEURFilter.oosNet?.toFixed(0)} EUR, neighborsOOSPositive=${bestEURFilter.neighborsPositiveOOS}`);

console.log('\n=== DAX 2H ROBUSTNESS ===');
console.log(pad('Filter', 18) + pad('Trades', 8) + pad('OOS Net', 10) + pad('WF Pass', 8) + 'Exp EUR');
for (const r of dax2hRobustness) {
  const oosNet = r.kpis.oosNet ?? 0;
  const wfPass = r.wf ? `${r.wf.positiveFolds}/9` : 'N/A';
  console.log(pad(r.id, 18) + pad(r.trades, 8) + pad(oosNet.toFixed(0), 10) + pad(wfPass, 8) + (r.kpis.expectancy??0).toFixed(2));
}
console.log(`BEST DAX2H FILTER: ${bestD2.id} — OOS=${(bestD2.kpis.oosNet??0).toFixed(0)} EUR`);

console.log('\n=== GLD ANALYSIS ===');
console.log(pad('Filter', 22) + pad('Trades', 8) + pad('OOS Net', 10) + 'Exp EUR');
for (const r of gldRobustness) {
  const oosNet = r.kpis.oosNet ?? 0;
  console.log(pad(r.id, 22) + pad(r.trades, 8) + pad(oosNet.toFixed(0), 10) + (r.kpis.expectancy??0).toFixed(2));
}
console.log(`GLD VERDICT: ${gldVerdict}`);

console.log('\n=== ZW SEASONAL ===');
console.log(`OOS years positive: ${zwOOSYearsPositive}/${zwOOSYearsTotal}`);
console.log(`OOS net: EUR ${zwOOSNet.toFixed(2)}`);
console.log(`Verdict: ${zwVerdict}`);

console.log('\n=== PHASE B TOP FINALISTS ===');
for (const capital of CAPITALS) {
  const fs = finalists[capital] ?? [];
  for (const f of fs) {
    const k = f.kpis;
    if (k.error) continue;
    const oosCAGR = k.oosCAGR ?? 0;
    const cagr = k.cagr ?? 0;
    const sharpe = k.sharpe ?? 0;
    const calmar = k.calmar ?? 0;
    const maxDD = k.maxDDFromPeak ?? 0;
    console.log(
      `€${capital} ${f.role}: ${f.variantId} CAGR=${cagr.toFixed(1)}% oosCAGR=${oosCAGR.toFixed(1)}% Sharpe=${sharpe.toFixed(2)} Calmar=${calmar.toFixed(2)} MaxDD=${maxDD.toFixed(1)}%`
    );
  }
}

console.log('\n=== DONE ===');
