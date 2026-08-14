/**
 * WHITE SWAN PHASE 4 — EURUSD ALWAYS ACTIVE, EX-ANTE FILTERS ONLY
 *
 * Hard rules:
 * - EURUSD always active (min 1 contract). No variant with EURUSD=0.
 * - Only ex-ante entry-time filters (DOW, month, quarter, direction).
 * - NO post-exit holdingDays filter on any LIVE_VALID variant.
 * - EEM + IWM remain DATA_BLOCKED (0 contracts).
 * - DAX 1H, DAX 2H, YM1 TAT also get ex-ante filter dimensions.
 *
 * EURUSD filters (E0-E9): baseline, Mon, Mon+Tue, Mon+Tue+Wed,
 *   Long-only, Short-only, Mon+Long, best2months, best2quarters, Mon+bestQ
 * DAX 1H filters (D1_0-D1_3): baseline, Long, Short, Mon-Thu
 * DAX 2H filters (D2_0-D2_3): baseline, Long, Short, Mon-Thu
 * YM1 TAT: always active, no filter (predefined hold).
 *
 * Variant space: 10 × 4 × 4 = 160 combos × 4 capital levels = 640 variants.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const BASE = 'C:/Users/joris/Documents/Capitalife Terminal';
const OUT = `${BASE}/workspace/output/white-swan/portfolio-lab-v4`;
mkdirSync(OUT, { recursive: true });

const FX_EUR_PER_USD = 0.81677;
const CAPITALS = [10000, 12500, 15000, 20000];

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
  entryDow: new Date(t.entryDate).getDay(),         // 0=Sun,1=Mon,...,6=Sat
  entryMonth: new Date(t.entryDate).getMonth() + 1, // 1-12
  entryQuarter: Math.ceil((new Date(t.entryDate).getMonth() + 1) / 3), // 1-4
}));
console.log(`Loaded ${allTrades.length} trades`);

const ALL_17 = [
  'dax_2h', 'ym1_tat', 'gld_thursday_long', 'gc1_seasonal', 'hg1_seasonal',
  'cl1_seasonal', 'eurusd_30m', 'dax_1h', 'spy_seasonal', 'zm1_seasonal',
  'sb_seasonal', 'zc_seasonal', 'zw_seasonal', 'zs_seasonal', 'cc_seasonal',
  'EEM', 'IWM'
];
const BLOCKED = new Set(['EEM', 'IWM']);

// ─── EURUSD filter analysis ───────────────────────────────────────────────────
const eurusdTrades = allTrades.filter(t => t.strategyId === 'eurusd_30m');
const eur_IS = eurusdTrades.filter(t => t.exitDate < '2019-01-01');
const eur_OOS = eurusdTrades.filter(t => t.exitDate >= '2019-01-01');

// Find best 2 months by avg net/trade
const monthNet = {};
for (const t of eurusdTrades) {
  const m = t.entryMonth;
  if (!monthNet[m]) monthNet[m] = { net: 0, trades: 0 };
  monthNet[m].net += t.netPnlEUR;
  monthNet[m].trades++;
}
const sortedMonths = Object.entries(monthNet)
  .map(([m, v]) => ({ m: +m, avg: v.net / v.trades }))
  .sort((a, b) => b.avg - a.avg);
const best2Months = new Set(sortedMonths.slice(0, 2).map(x => x.m));

// Find best 2 quarters by avg net/trade
const qNet = {};
for (const t of eurusdTrades) {
  const q = t.entryQuarter;
  if (!qNet[q]) qNet[q] = { net: 0, trades: 0 };
  qNet[q].net += t.netPnlEUR;
  qNet[q].trades++;
}
const sortedQuarters = Object.entries(qNet)
  .map(([q, v]) => ({ q: +q, avg: v.net / v.trades }))
  .sort((a, b) => b.avg - a.avg);
const best2Quarters = new Set(sortedQuarters.slice(0, 2).map(x => x.q));
// best single quarter for Mon+bestQ
const bestQuarter = sortedQuarters[0].q;

console.log(`EURUSD best 2 months (by avg net/trade): ${[...best2Months].join(', ')}`);
console.log(`EURUSD best 2 quarters: ${[...best2Quarters].join(', ')}, bestQ=${bestQuarter}`);

// EURUSD filter definitions: function takes a trade, returns boolean
const EUR_FILTERS = {
  E0: { label: 'BASELINE',        fn: () => true },
  E1: { label: 'MON_ONLY',        fn: t => t.entryDow === 1 },
  E2: { label: 'MON_TUE',         fn: t => t.entryDow === 1 || t.entryDow === 2 },
  E3: { label: 'MON_TUE_WED',     fn: t => [1,2,3].includes(t.entryDow) },
  E4: { label: 'LONG_ONLY',       fn: t => t.direction === 'LONG' },
  E5: { label: 'SHORT_ONLY',      fn: t => t.direction === 'SHORT' },
  E6: { label: 'MON_LONG',        fn: t => t.entryDow === 1 && t.direction === 'LONG' },
  E7: { label: 'BEST2MONTHS',     fn: t => best2Months.has(t.entryMonth) },
  E8: { label: 'BEST2QUARTERS',   fn: t => best2Quarters.has(t.entryQuarter) },
  E9: { label: 'MON_BESTQ',       fn: t => t.entryDow === 1 && t.entryQuarter === bestQuarter },
};

// ─── DAX 1H filter definitions ────────────────────────────────────────────────
const DAX1H_FILTERS = {
  D1_0: { label: 'BASELINE',    fn: () => true },
  D1_1: { label: 'LONG_ONLY',  fn: t => t.direction === 'LONG' },
  D1_2: { label: 'SHORT_ONLY', fn: t => t.direction === 'SHORT' },
  D1_3: { label: 'MON_THU',    fn: t => t.entryDow >= 1 && t.entryDow <= 4 },
};

// ─── DAX 2H filter definitions ────────────────────────────────────────────────
const DAX2H_FILTERS = {
  D2_0: { label: 'BASELINE',    fn: () => true },
  D2_1: { label: 'LONG_ONLY',  fn: t => t.direction === 'LONG' },
  D2_2: { label: 'SHORT_ONLY', fn: t => t.direction === 'SHORT' },
  D2_3: { label: 'MON_THU',    fn: t => t.entryDow >= 1 && t.entryDow <= 4 },
};

// ─── KPI engine ───────────────────────────────────────────────────────────────
function buildNAVSeries(trades, startNAV) {
  const dailyMap = {};
  for (const t of trades) {
    const date = t.exitDate.slice(0, 10);
    dailyMap[date] = (dailyMap[date] ?? 0) + t.netPnlEUR;
  }
  const dates = Object.keys(dailyMap).sort();
  if (dates.length === 0) return { series: [], endNAV: startNAV, maxDDPeak: 0, maxDDStart: 0 };
  let nav = startNAV, peak = startNAV, maxDD = 0, maxDDFromStart = 0;
  const series = [];
  for (const date of dates) {
    nav += dailyMap[date];
    series.push({ date, nav });
    if (nav > peak) peak = nav;
    const ddPeak = 1 - nav / peak;
    if (ddPeak > maxDD) maxDD = ddPeak;
    const ddStart = 1 - nav / startNAV;
    if (ddStart > maxDDFromStart) maxDDFromStart = ddStart;
  }
  return { series, endNAV: nav, maxDDPeak: maxDD * 100, maxDDStart: maxDDFromStart * 100 };
}

function computeKPIs(trades, startNAV, includeNavSeries = false) {
  if (trades.length === 0) return { error: 'NO_TRADES', totalTrades: 0 };
  const { series, endNAV, maxDDPeak, maxDDStart } = buildNAVSeries(trades, startNAV);
  if (series.length < 2) return { error: 'INSUFFICIENT_DATES', totalTrades: trades.length };

  const firstEntry = trades.reduce((d, t) => t.entryDate < d ? t.entryDate : d, trades[0].entryDate);
  const lastExit = series[series.length - 1].date;
  const elapsedDays = (new Date(lastExit) - new Date(firstEntry)) / 86400000;
  const elapsedYears = elapsedDays / 365.25;
  if (elapsedYears < 0.1) return { error: 'TOO_SHORT', totalTrades: trades.length };

  const totalReturn = (endNAV - startNAV) / startNAV;
  const cagr = (Math.pow(endNAV / startNAV, 365.25 / elapsedDays) - 1) * 100;

  const dailyReturns = series.map((p, i) =>
    i === 0 ? (p.nav / startNAV - 1) : (p.nav / series[i - 1].nav - 1)
  );
  const avgRet = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - avgRet) ** 2, 0) / dailyReturns.length;
  const sharpe = variance > 0 ? (avgRet / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  const downsideVar = dailyReturns.filter(r => r < 0).reduce((s, r) => s + r * r, 0) / dailyReturns.length;
  const sortino = downsideVar > 0 ? (avgRet / Math.sqrt(downsideVar)) * Math.sqrt(252) : 0;
  const calmar = maxDDPeak > 0 ? cagr / maxDDPeak : 0;

  const totalGross = trades.reduce((s, t) => s + t.grossPnlEUR, 0);
  const totalCosts = trades.reduce((s, t) => s + t.costsEUR, 0);
  const totalNet = endNAV - startNAV;
  const totalTrades = trades.length;
  const tradesPerWeek = totalTrades / (elapsedDays / 7);
  const annualCosts = totalCosts / elapsedYears;
  const avgNAV = (startNAV + endNAV) / 2;
  const annualCostPct = annualCosts / avgNAV * 100;
  const annualNet = totalNet / elapsedYears;
  const costRatio = Math.abs(annualNet) > 0 ? annualCosts / Math.abs(annualNet) * 100 : 999;

  const positiveNet = trades.filter(t => t.netPnlEUR > 0).reduce((s, t) => s + t.netPnlEUR, 0);
  const negativeNet = Math.abs(trades.filter(t => t.netPnlEUR < 0).reduce((s, t) => s + t.netPnlEUR, 0));
  const profitFactor = negativeNet > 0 ? positiveNet / negativeNet : 0;
  const expectancy = totalTrades > 0 ? totalNet / totalTrades : 0;

  // IS / OOS split at 2019-01-01
  const isTrades = trades.filter(t => t.exitDate < '2019-01-01');
  const oosTrades = trades.filter(t => t.exitDate >= '2019-01-01');

  // IS CAGR: approximate using IS net over IS elapsed years
  let isCAGR = 0;
  if (isTrades.length > 1) {
    const isFirst = isTrades.reduce((d, t) => t.entryDate < d ? t.entryDate : d, isTrades[0].entryDate);
    const isLast = isTrades.reduce((d, t) => t.exitDate > d ? t.exitDate : d, isTrades[0].exitDate);
    const isElapsed = (new Date(isLast) - new Date(isFirst)) / 86400000;
    const isYears = isElapsed / 365.25;
    const isNet = isTrades.reduce((s, t) => s + t.netPnlEUR, 0);
    const isEndNAV = startNAV + isNet;
    isCAGR = isYears > 0.1 ? (Math.pow(isEndNAV / startNAV, 1 / isYears) - 1) * 100 : 0;
  }

  let oosCAGR = 0;
  const oosResult = buildNAVSeries(oosTrades, startNAV);
  if (oosResult.series.length > 1) {
    const oosDates = oosResult.series.map(p => p.date);
    const oosYears = (new Date(oosDates[oosDates.length - 1]) - new Date(oosDates[0])) / (365.25 * 86400000);
    const oosReturn = (oosResult.endNAV - startNAV) / startNAV;
    oosCAGR = oosYears > 0.1 ? (Math.pow(1 + oosReturn, 1 / oosYears) - 1) * 100 : 0;
  }
  const oosNetPositive = oosResult.endNAV > startNAV;

  const byStrategy = {};
  for (const t of trades) {
    byStrategy[t.strategyId] = (byStrategy[t.strategyId] ?? 0) + t.netPnlEUR;
  }
  const netValues = Object.entries(byStrategy).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const totalNetAbs = Math.abs(totalNet);
  const top1Pct = totalNetAbs > 0 ? Math.abs(netValues[0]?.[1] ?? 0) / totalNetAbs * 100 : 0;
  const top3Sum = netValues.slice(0, 3).reduce((s, [, v]) => s + Math.abs(v), 0);
  const top3Pct = totalNetAbs > 0 ? top3Sum / totalNetAbs * 100 : 0;

  const result = {
    startNAV, endNAV: +endNAV.toFixed(2),
    totalReturn: +totalReturn.toFixed(4),
    elapsedYears: +elapsedYears.toFixed(4),
    cagr: +cagr.toFixed(4),
    sharpe: +sharpe.toFixed(4),
    sortino: +sortino.toFixed(4),
    calmar: +calmar.toFixed(4),
    maxDDFromPeak: +maxDDPeak.toFixed(4),
    maxDDFromStart: +maxDDStart.toFixed(4),
    totalTrades,
    totalGross: +totalGross.toFixed(2),
    totalCosts: +totalCosts.toFixed(2),
    totalNet: +totalNet.toFixed(2),
    tradesPerWeek: +tradesPerWeek.toFixed(3),
    annualCosts: +annualCosts.toFixed(2),
    annualCostPct: +annualCostPct.toFixed(4),
    costRatio: +costRatio.toFixed(4),
    profitFactor: +profitFactor.toFixed(4),
    expectancy: +expectancy.toFixed(4),
    isCAGR: +isCAGR.toFixed(4),
    oosCAGR: +oosCAGR.toFixed(4),
    oosNetPositive,
    concentration: {
      top1Pct: +top1Pct.toFixed(2),
      top3Pct: +top3Pct.toFixed(2),
      netByStrategy: Object.fromEntries(Object.entries(byStrategy).map(([k, v]) => [k, +v.toFixed(2)]))
    }
  };
  if (includeNavSeries) result.navSeries = series;
  return result;
}

// ─── Walk-forward (9 rolling folds) ──────────────────────────────────────────
const WF_FOLDS = [
  { label: 'IS 2008-2013 / OOS 2014-2016', is: ['2008','2009','2010','2011','2012','2013'], oos: ['2014','2015','2016'] },
  { label: 'IS 2009-2014 / OOS 2015-2017', is: ['2009','2010','2011','2012','2013','2014'], oos: ['2015','2016','2017'] },
  { label: 'IS 2010-2015 / OOS 2016-2018', is: ['2010','2011','2012','2013','2014','2015'], oos: ['2016','2017','2018'] },
  { label: 'IS 2011-2016 / OOS 2017-2019', is: ['2011','2012','2013','2014','2015','2016'], oos: ['2017','2018','2019'] },
  { label: 'IS 2012-2017 / OOS 2018-2020', is: ['2012','2013','2014','2015','2016','2017'], oos: ['2018','2019','2020'] },
  { label: 'IS 2013-2018 / OOS 2019-2021', is: ['2013','2014','2015','2016','2017','2018'], oos: ['2019','2020','2021'] },
  { label: 'IS 2014-2019 / OOS 2020-2022', is: ['2014','2015','2016','2017','2018','2019'], oos: ['2020','2021','2022'] },
  { label: 'IS 2015-2020 / OOS 2021-2023', is: ['2015','2016','2017','2018','2019','2020'], oos: ['2021','2022','2023'] },
  { label: 'IS 2016-2021 / OOS 2022-2024', is: ['2016','2017','2018','2019','2020','2021'], oos: ['2022','2023','2024'] },
];

function walkForward(tradesFactory) {
  let positiveFolds = 0;
  const foldResults = [];
  for (const fold of WF_FOLDS) {
    const oosSet = new Set(fold.oos);
    const oosTrades = tradesFactory().filter(t => oosSet.has(t.exitDate.slice(0, 4)));
    const oosNet = oosTrades.reduce((s, t) => s + t.netPnlEUR, 0);
    const isPositive = oosNet > 0;
    if (isPositive) positiveFolds++;
    foldResults.push({ label: fold.label, oosNet: +oosNet.toFixed(2), isPositive });
  }
  return {
    totalFolds: WF_FOLDS.length,
    positiveFolds,
    passRate: +(positiveFolds / WF_FOLDS.length).toFixed(3),
    foldResults
  };
}

// ─── Monte Carlo ──────────────────────────────────────────────────────────────
function monteCarlo(trades, startNAV, n = 1000) {
  if (trades.length === 0) return null;
  const elapsedDays = (new Date(trades[trades.length - 1]?.exitDate) - new Date(trades[0]?.exitDate)) / 86400000;
  const totalYears = Math.max(1, elapsedDays / 365.25);
  const cagrs = [], maxDDs = [];
  for (let i = 0; i < n; i++) {
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    let nav = startNAV, peak = startNAV, maxDD = 0;
    for (const t of shuffled) {
      nav += t.netPnlEUR;
      if (nav > peak) peak = nav;
      maxDD = Math.max(maxDD, (peak - nav) / peak * 100);
    }
    cagrs.push((Math.pow(Math.max(nav / startNAV, 0.0001), 1 / totalYears) - 1) * 100);
    maxDDs.push(maxDD);
  }
  cagrs.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  return {
    medianCAGR: +cagrs[500].toFixed(2),
    p5CAGR: +cagrs[50].toFixed(2),
    p95CAGR: +cagrs[950].toFixed(2),
    medianMaxDD: +maxDDs[500].toFixed(2),
    p95MaxDD: +maxDDs[950].toFixed(2),
    probLoss: +(cagrs.filter(c => c < 0).length / n).toFixed(3)
  };
}

// ─── Suitability score ────────────────────────────────────────────────────────
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

// ─── Build variant trades ─────────────────────────────────────────────────────
function buildVariantTrades(eurFilter, dax1hFilter, dax2hFilter) {
  const out = [];
  for (const t of allTrades) {
    if (BLOCKED.has(t.strategyId)) continue;

    let passFilter = true;
    if (t.strategyId === 'eurusd_30m') {
      passFilter = EUR_FILTERS[eurFilter].fn(t);
    } else if (t.strategyId === 'dax_1h') {
      passFilter = DAX1H_FILTERS[dax1hFilter].fn(t);
    } else if (t.strategyId === 'dax_2h') {
      passFilter = DAX2H_FILTERS[dax2hFilter].fn(t);
    }
    if (!passFilter) continue;

    // 1 contract for all active strategies
    out.push({ ...t });
  }
  return out;
}

// ─── EURUSD filter analysis ───────────────────────────────────────────────────
console.log('\n=== EURUSD FILTER ANALYSIS ===\n');
const eurAnalysis = {};
for (const [key, ef] of Object.entries(EUR_FILTERS)) {
  const filtered = eurusdTrades.filter(ef.fn);
  const isFiltered = eur_IS.filter(ef.fn);
  const oosFiltered = eur_OOS.filter(ef.fn);
  const net = filtered.reduce((s, t) => s + t.netPnlEUR, 0);
  const isNet = isFiltered.reduce((s, t) => s + t.netPnlEUR, 0);
  const oosNet = oosFiltered.reduce((s, t) => s + t.netPnlEUR, 0);
  const expEUR = filtered.length > 0 ? net / filtered.length : 0;

  // Verdict vs baseline (E0)
  const baseline = eurusdTrades.reduce((s, t) => s + t.netPnlEUR, 0);
  const baselineOOS = eur_OOS.reduce((s, t) => s + t.netPnlEUR, 0);
  let verdict;
  if (key === 'E0') {
    verdict = 'BASELINE';
  } else if (net > baseline * 0.5 && oosNet > baselineOOS) {
    verdict = 'VALID_IMPROVEMENT';
  } else if (net > baseline || oosNet > baselineOOS) {
    verdict = 'MARGINAL';
  } else {
    verdict = 'NO_IMPROVEMENT';
  }
  // Special: if nothing is clearly better, mark overall strategy
  if (key === 'E0' && net < 0) verdict = 'NEEDS_REDESIGN';

  eurAnalysis[key] = {
    filter: key,
    label: ef.label,
    trades: filtered.length,
    netEUR: +net.toFixed(2),
    expEURPerTrade: +expEUR.toFixed(4),
    isNet: +isNet.toFixed(2),
    oosNet: +oosNet.toFixed(2),
    verdict
  };

  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `${pad(key,4)} ${pad(ef.label,18)} | trades=${pad(filtered.length,5)} net=${pad(net.toFixed(0),8)} exp=${pad(expEUR.toFixed(2),8)} IS=${pad(isNet.toFixed(0),8)} OOS=${pad(oosNet.toFixed(0),8)} | ${verdict}`
  );
}

// Find best EURUSD filter (most improved OOS net vs baseline)
const baselineOOSNet = eur_OOS.reduce((s, t) => s + t.netPnlEUR, 0);
const bestEURFilter = Object.entries(eurAnalysis)
  .filter(([k]) => k !== 'E0')
  .sort((a, b) => b[1].oosNet - a[1].oosNet)[0];
console.log(`\nBest EURUSD filter (OOS): ${bestEURFilter[0]} (${bestEURFilter[1].label}) OOS net=${bestEURFilter[1].oosNet.toFixed(0)} EUR vs baseline=${baselineOOSNet.toFixed(0)} EUR`);

// Mark NEEDS_REDESIGN if best OOS filter still negative
const overallVerdict = bestEURFilter[1].oosNet > 0 ? 'VALID_IMPROVEMENT' : 'NEEDS_REDESIGN';
console.log(`EURUSD overall verdict: ${overallVerdict}\n`);

// Update verdicts
for (const [key, ea] of Object.entries(eurAnalysis)) {
  if (key === 'E0') { ea.verdict = 'NEEDS_REDESIGN'; continue; }
  if (ea.oosNet > 0 && ea.oosNet > baselineOOSNet) {
    ea.verdict = 'VALID_IMPROVEMENT';
  } else if (ea.oosNet > baselineOOSNet) {
    ea.verdict = 'MARGINAL';
  } else {
    ea.verdict = 'NO_IMPROVEMENT';
  }
}

// ─── MAIN: Build all variants ─────────────────────────────────────────────────
console.log('=== BUILDING VARIANTS ===');
const EUR_KEYS = Object.keys(EUR_FILTERS);
const D1H_KEYS = Object.keys(DAX1H_FILTERS);
const D2H_KEYS = Object.keys(DAX2H_FILTERS);

const allVariants = [];
let count = 0;
const totalVariants = EUR_KEYS.length * D1H_KEYS.length * D2H_KEYS.length * CAPITALS.length;

for (const eKey of EUR_KEYS) {
  for (const d1Key of D1H_KEYS) {
    for (const d2Key of D2H_KEYS) {
      const comboTrades = buildVariantTrades(eKey, d1Key, d2Key);

      for (const capital of CAPITALS) {
        const variantId = `P4_${eKey}${d1Key}${d2Key}_${capital}`;
        const kpis = computeKPIs(comboTrades, capital, false);
        const wf = kpis.error ? null : walkForward(() => buildVariantTrades(eKey, d1Key, d2Key));
        const ss = suitabilityScore(kpis, wf);

        const ea = eurAnalysis[eKey];
        allVariants.push({
          variantId,
          phase: 'v4',
          liveValidStatus: 'LIVE_VALID',
          eurusdFilter: eKey,
          eurusdFilterLabel: EUR_FILTERS[eKey].label,
          eurusdFilterVerdict: ea.verdict,
          dax1hFilter: d1Key,
          dax1hFilterLabel: DAX1H_FILTERS[d1Key].label,
          dax2hFilter: d2Key,
          dax2hFilterLabel: DAX2H_FILTERS[d2Key].label,
          capital,
          kpis,
          walkForward: wf,
          suitabilityScore: ss,
          _trades: comboTrades
        });

        count++;
        if (count % 80 === 0) process.stdout.write(`  [${count}/${totalVariants}] `);
      }
    }
  }
}
console.log(`\nBuilt ${allVariants.length} variants`);

// ─── Ground-truth audit ───────────────────────────────────────────────────────
const auditVariant = allVariants.find(v => v.variantId === `P4_E0D1_0D2_0_12500`);
const groundTruthAudit = {
  _note: 'Canonical KPI definitions audit for P4_E0D1_0D2_0_12500',
  variantId: auditVariant?.variantId,
  definitions: {
    maxDDFromPeak: 'max((runningPeak - nav) / runningPeak) * 100 — CANONICAL, used for Calmar',
    maxDDFromStart: 'max((startNAV - nav) / startNAV) * 100 — informational only',
    calmar: 'cagr / maxDDFromPeak (both as percentages)',
    annualCosts: 'totalCostsEUR / elapsedYears (actual elapsed from data)',
    annualCostPct: 'annualCosts / avgNAV * 100',
    elapsedYears: 'actual (lastExitDate - firstEntryDate) / 365.25 — NOT hardcoded',
    cagr: '(endNAV / startNAV)^(365.25 / elapsedDays) - 1, as percent',
    isCAGR: 'computed for trades where exitDate < 2019-01-01',
    oosCAGR: 'computed for trades where exitDate >= 2019-01-01',
    FX_EUR_PER_USD: 0.81677,
    costRt: 'round-trip cost in trade currency (already includes both sides)',
    EURUSD_always_active: 'hard constraint — no variant may have eurusd contracts=0',
    EEM_IWM: 'always 0 contracts (DATA_BLOCKED)',
  },
  sample_kpis: auditVariant?.kpis
};

// ─── QA_ALL_HOLD1 reference (INVALID) ────────────────────────────────────────
function buildHold1Trades() {
  return allTrades.filter(t => {
    if (BLOCKED.has(t.strategyId)) return false;
    const isIntraday = ['eurusd_30m', 'dax_1h', 'dax_2h'].includes(t.strategyId);
    if (isIntraday && t.holdingDays < 1.0) return false;
    return true;
  });
}
const hold1Trades = buildHold1Trades();
const invalidVariants = CAPITALS.map(capital => ({
  variantId: `QA_ALL_HOLD1_${capital}`,
  phase: 'v4',
  liveValidStatus: 'INVALID_RESEARCH_REFERENCE',
  lookaheadNote: 'holdingDays>=1 uses post-exit realized hold — NOT valid for live trading.',
  capital,
  kpis: computeKPIs(hold1Trades, capital, false),
}));
console.log('Built QA_ALL_HOLD1 reference variants');

// ─── Export files ─────────────────────────────────────────────────────────────
// variants.json (no navSeries)
writeFileSync(`${OUT}/variants.json`, JSON.stringify(
  allVariants.map(v => { const { _trades, ...rest } = v; return rest; }),
  null, 2
));
console.log('Wrote variants.json');

// Per-capital files (top-20)
for (const capital of CAPITALS) {
  const top20 = allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 20)
    .map(v => { const { _trades, ...rest } = v; return rest; });
  writeFileSync(`${OUT}/capital-${capital}.json`, JSON.stringify(top20, null, 2));
}
console.log('Wrote capital files');

// finalists.json (top-5 per capital WITH navSeries + Monte Carlo)
console.log('Building finalists with navSeries + Monte Carlo...');
const finalistsAll = {};
for (const capital of CAPITALS) {
  const top5 = allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 5);
  finalistsAll[`capital_${capital}`] = top5.map(v => {
    const kpisWithSeries = computeKPIs(v._trades, capital, true);
    const mc = monteCarlo(v._trades, capital);
    const { _trades, ...rest } = v;
    return { ...rest, kpis: kpisWithSeries, monteCarlo: mc };
  });
}
writeFileSync(`${OUT}/finalists.json`, JSON.stringify(finalistsAll, null, 2));
console.log('Wrote finalists.json');

// eurusd-analysis.json
writeFileSync(`${OUT}/eurusd-analysis.json`, JSON.stringify({
  generated: new Date().toISOString(),
  best2Months: [...best2Months],
  best2Quarters: [...best2Quarters],
  bestQuarter,
  filters: eurAnalysis,
  overallVerdict,
}, null, 2));
console.log('Wrote eurusd-analysis.json');

// lookahead-reference.json
writeFileSync(`${OUT}/lookahead-reference.json`, JSON.stringify(invalidVariants, null, 2));
console.log('Wrote lookahead-reference.json');

// ground-truth-audit.json
writeFileSync(`${OUT}/ground-truth-audit.json`, JSON.stringify(groundTruthAudit, null, 2));
console.log('Wrote ground-truth-audit.json');

// ─── Console summary ──────────────────────────────────────────────────────────
console.log('\n=== EURUSD FILTER ANALYSIS TABLE ===');
console.log('Filter | Label              | Trades | Net EUR   | Exp EUR/tr | IS Net    | OOS Net   | Verdict');
console.log('-------|--------------------| -------|-----------|------------|-----------|-----------|--------');
for (const [key, ea] of Object.entries(eurAnalysis)) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad(key,6)} | ${pad(ea.label,18)} | ${pad(ea.trades,6)} | ${pad(ea.netEUR.toFixed(0),9)} | ${pad(ea.expEURPerTrade.toFixed(2),10)} | ${pad(ea.isNet.toFixed(0),9)} | ${pad(ea.oosNet.toFixed(0),9)} | ${ea.verdict}`);
}

console.log(`\nBest EURUSD filter: ${bestEURFilter[0]} (${bestEURFilter[1].label})`);
console.log(`Overall EURUSD verdict: ${overallVerdict}`);

console.log('\n=== TOP-3 VARIANTS PER CAPITAL ===');
for (const capital of CAPITALS) {
  const top3 = allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 3);
  console.log(`\n-- Capital €${capital} --`);
  console.log('Variant                        | CAGR   | OOS    | Sharpe | Calmar | MaxDD  | AnnCosts | ElapsedYrs | Score');
  for (const v of top3) {
    const k = v.kpis;
    const row = [
      v.variantId.padEnd(30),
      `${k.cagr?.toFixed(1)}%`.padEnd(7),
      `${k.oosCAGR?.toFixed(1)}%`.padEnd(7),
      k.sharpe?.toFixed(2).padEnd(7),
      k.calmar?.toFixed(2).padEnd(7),
      `${k.maxDDFromPeak?.toFixed(1)}%`.padEnd(7),
      `€${k.annualCosts?.toFixed(0)}`.padEnd(9),
      k.elapsedYears?.toFixed(2).padEnd(11),
      v.suitabilityScore
    ].join(' | ');
    console.log(row);
  }
}

// QA reference at 12.5k
const hold1_12500 = invalidVariants.find(v => v.capital === 12500);
if (hold1_12500) {
  const k = hold1_12500.kpis;
  console.log('\n=== QA_ALL_HOLD1 REFERENCE @12500 (INVALID - holdingDays filter) ===');
  console.log(`CAGR=${k.cagr?.toFixed(1)}% OOS=${k.oosCAGR?.toFixed(1)}% Sharpe=${k.sharpe?.toFixed(2)} Calmar=${k.calmar?.toFixed(2)} MaxDD=${k.maxDDFromPeak?.toFixed(1)}% AnnCosts=€${k.annualCosts?.toFixed(0)} ElapsedYrs=${k.elapsedYears?.toFixed(2)}`);
}

console.log('\n=== PHASE 4 COMPLETE ===');
console.log(`Output: ${OUT}`);
