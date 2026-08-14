/**
 * WHITE SWAN 17/17 LIVE-VALID QUALITY VARIANTS — PHASE 3
 *
 * Builds 128 live-valid variants across 4 dimensions × 4 capital levels.
 * All variants are ex-ante valid — NO holdingDays filter on any LIVE_VALID variant.
 * 4 INVALID_RESEARCH_REFERENCE (QA_ALL_HOLD1) variants added for comparison.
 *
 * Dimension A: EURUSD treatment (A0=active, A1=inactive, A2=Mon-only, A3=Mon+Tue-only)
 * Dimension B: DAX 1H treatment (B0=active, B1=inactive)
 * Dimension C: DAX 2H treatment (C0=active, C1=inactive)
 * Dimension D: YM1 TAT treatment (D0=active, D1=inactive)
 *
 * Contract allocation: 1 per active non-blocked strategy (same as v2 D1 scale).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const BASE = 'C:/Users/joris/Documents/Capitalife Terminal';
const OUT = `${BASE}/workspace/output/white-swan/portfolio-lab-v3`;
mkdirSync(OUT, { recursive: true });

const FX_EUR_PER_USD = 0.81677;

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
  entryDow: new Date(t.entryDate).getDay(), // 0=Sun,1=Mon,2=Tue,...,6=Sat
}));
console.log(`Loaded ${allTrades.length} trades`);

// ─── Strategy registry ────────────────────────────────────────────────────────
const ALL_17 = [
  'dax_2h', 'ym1_tat', 'gld_thursday_long', 'gc1_seasonal', 'hg1_seasonal',
  'cl1_seasonal', 'eurusd_30m', 'dax_1h', 'spy_seasonal', 'zm1_seasonal',
  'sb_seasonal', 'zc_seasonal', 'zw_seasonal', 'zs_seasonal', 'cc_seasonal',
  'EEM', 'IWM'
];
const BLOCKED = new Set(['EEM', 'IWM']);
const CAPITALS = [10000, 12500, 15000, 20000];

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

  const firstDate = new Date(series[0].date);
  const lastDate = new Date(series[series.length - 1].date);
  const elapsedDays = (lastDate - firstDate) / 86400000;
  const years = elapsedDays / 365.25;
  if (years < 0.1) return { error: 'TOO_SHORT', totalTrades: trades.length };

  const totalReturn = (endNAV - startNAV) / startNAV;
  const cagr = (Math.pow(endNAV / startNAV, 365.25 / elapsedDays) - 1) * 100;

  // Daily returns for Sharpe/Sortino
  const dailyReturns = series.map((p, i) =>
    i === 0 ? (p.nav / startNAV - 1) : (p.nav / series[i - 1].nav - 1)
  );
  const avgRet = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - avgRet) ** 2, 0) / dailyReturns.length;
  const sharpe = variance > 0 ? (avgRet / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  const downsideVar = dailyReturns.filter(r => r < 0).reduce((s, r) => s + r * r, 0) / dailyReturns.length;
  const sortino = downsideVar > 0 ? (avgRet / Math.sqrt(downsideVar)) * Math.sqrt(252) : 0;
  const calmar = maxDDPeak > 0 ? cagr / maxDDPeak : 0;

  // Costs
  const totalGross = trades.reduce((s, t) => s + t.grossPnlEUR, 0);
  const totalCosts = trades.reduce((s, t) => s + t.costsEUR, 0);
  const totalNet = endNAV - startNAV;
  const totalTrades = trades.length;
  const tradesPerWeek = totalTrades / (elapsedDays / 7);
  const annualCosts = totalCosts / years;
  const avgNAV = (startNAV + endNAV) / 2;
  const annualCostPct = annualCosts / avgNAV * 100;
  const annualNet = totalNet / years;
  const costRatio = Math.abs(annualNet) > 0 ? annualCosts / Math.abs(annualNet) * 100 : 999;

  // Expectancy, Profit Factor
  const positiveNet = trades.filter(t => t.netPnlEUR > 0).reduce((s, t) => s + t.netPnlEUR, 0);
  const negativeNet = Math.abs(trades.filter(t => t.netPnlEUR < 0).reduce((s, t) => s + t.netPnlEUR, 0));
  const profitFactor = negativeNet > 0 ? positiveNet / negativeNet : 0;
  const expectancy = totalTrades > 0 ? totalNet / totalTrades : 0;

  // IS / OOS
  const isTrades = trades.filter(t => t.exitDate < '2019-01-01');
  const oosTrades = trades.filter(t => t.exitDate >= '2019-01-01');
  const isNet = isTrades.reduce((s, t) => s + t.netPnlEUR, 0);
  const isYears = 11;
  const isCAGR = isNet !== 0 ? (Math.pow(1 + isNet / startNAV, 1 / isYears) - 1) * 100 : 0;

  const oosResult = buildNAVSeries(oosTrades, startNAV);
  const oosSorted = oosResult.series.map(p => p.date);
  const oosYears = oosSorted.length > 1
    ? (new Date(oosSorted[oosSorted.length - 1]) - new Date(oosSorted[0])) / (365.25 * 86400000)
    : 0;
  const oosReturn = (oosResult.endNAV - startNAV) / startNAV;
  const oosCAGR = oosYears > 0.1 ? (Math.pow(1 + oosReturn, 1 / oosYears) - 1) * 100 : 0;
  const oosNetPositive = oosResult.endNAV > startNAV;

  // Concentration
  const byStrategy = {};
  for (const t of trades) {
    byStrategy[t.strategyId] = (byStrategy[t.strategyId] ?? 0) + t.netPnlEUR;
  }
  const netValues = Object.entries(byStrategy).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const totalNetAbs = Math.abs(totalNet);
  const top1Pct = totalNetAbs > 0 ? Math.abs(netValues[0]?.[1] ?? 0) / totalNetAbs * 100 : 0;
  const top3Sum = netValues.slice(0, 3).reduce((s, [, v]) => s + Math.abs(v), 0);
  const top3Pct = totalNetAbs > 0 ? top3Sum / totalNetAbs * 100 : 0;
  const hhi = totalNet !== 0
    ? Object.values(byStrategy).reduce((s, v) => s + (v / totalNet) ** 2, 0)
    : 1;

  const result = {
    startNAV, endNAV,
    totalReturn: totalReturn * 100,
    cagr: +cagr.toFixed(4),
    sharpe: +sharpe.toFixed(4),
    sortino: +sortino.toFixed(4),
    calmar: +calmar.toFixed(4),
    maxDDFromPeak: +maxDDPeak.toFixed(4),
    maxDDFromStart: +maxDDStart.toFixed(4),
    totalTrades, totalGross: +totalGross.toFixed(2),
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
      hhi: +hhi.toFixed(4),
      netByStrategy: Object.fromEntries(Object.entries(byStrategy).map(([k, v]) => [k, +v.toFixed(2)]))
    }
  };

  if (includeNavSeries) result.navSeries = series;
  return result;
}

// ─── Walk-forward (9 rolling folds, IS=6yr, OOS=3yr) ─────────────────────────
const WF_FOLDS = [
  { is: ['2008','2009','2010','2011','2012','2013'], oos: ['2014','2015','2016'] },
  { is: ['2009','2010','2011','2012','2013','2014'], oos: ['2015','2016','2017'] },
  { is: ['2010','2011','2012','2013','2014','2015'], oos: ['2016','2017','2018'] },
  { is: ['2011','2012','2013','2014','2015','2016'], oos: ['2017','2018','2019'] },
  { is: ['2012','2013','2014','2015','2016','2017'], oos: ['2018','2019','2020'] },
  { is: ['2013','2014','2015','2016','2017','2018'], oos: ['2019','2020','2021'] },
  { is: ['2014','2015','2016','2017','2018','2019'], oos: ['2020','2021','2022'] },
  { is: ['2015','2016','2017','2018','2019','2020'], oos: ['2021','2022','2023'] },
  { is: ['2016','2017','2018','2019','2020','2021'], oos: ['2022','2023','2024'] },
];

function walkForward(filteredTradesFactory) {
  let positiveFolds = 0;
  const foldResults = [];
  for (const fold of WF_FOLDS) {
    const oosSet = new Set(fold.oos);
    const oosTrades = filteredTradesFactory().filter(t => oosSet.has(t.exitDate.slice(0, 4)));
    const oosNet = oosTrades.reduce((s, t) => s + t.netPnlEUR, 0);
    const isPositive = oosNet > 0;
    if (isPositive) positiveFolds++;
    foldResults.push({
      label: `IS ${fold.is[0]}-${fold.is[5]} / OOS ${fold.oos[0]}-${fold.oos[2]}`,
      oosNet: +oosNet.toFixed(2),
      isPositive
    });
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
  const elapsedDays = trades.length > 0
    ? (new Date(trades[trades.length - 1]?.exitDate) - new Date(trades[0]?.exitDate)) / 86400000
    : 365 * 16;
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
    cagrs.push((Math.pow(nav / startNAV, 1 / totalYears) - 1) * 100);
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

// ─── Scoring ──────────────────────────────────────────────────────────────────
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
  if (kpis.tradesPerWeek >= 4 && kpis.tradesPerWeek <= 8) score += 5;
  return Math.min(100, Math.max(0, score));
}

function robustnessScore(kpis) {
  if (kpis.error) return 0;
  let score = 0;
  if (kpis.oosNetPositive) score += 15;
  if (kpis.oosCAGR > 3) score += 10;
  if (kpis.oosCAGR > 8) score += 10;
  if (kpis.costRatio < 15) score += 10;
  else if (kpis.costRatio < 30) score += 5;
  if (kpis.tradesPerWeek >= 4 && kpis.tradesPerWeek <= 8) score += 5;
  if (kpis.concentration.top1Pct > 60) score -= 15;
  else if (kpis.concentration.top1Pct > 40) score -= 8;
  if (kpis.maxDDFromStart < 15) score += 10;
  else if (kpis.maxDDFromStart < 25) score += 5;
  return Math.max(0, Math.min(100, score));
}

// ─── Trade filter for a variant config ───────────────────────────────────────
function buildVariantTrades(stratCfg) {
  const out = [];
  for (const t of allTrades) {
    const cfg = stratCfg[t.strategyId];
    if (!cfg || cfg.contracts === 0) continue;
    // Apply ex-ante DOW filter for EURUSD
    if (t.strategyId === 'eurusd_30m' && cfg.dowFilter) {
      if (!cfg.dowFilter.includes(t.entryDow)) continue;
    }
    const sg = t.grossPnlEUR * cfg.contracts;
    const sc = t.costsEUR * cfg.contracts;
    out.push({ ...t, grossPnlEUR: sg, costsEUR: sc, netPnlEUR: sg - sc });
  }
  return out;
}

// ─── Build strategy config for a dimension combo ─────────────────────────────
function buildStratCfg(dimA, dimB, dimC, dimD) {
  const cfg = {};
  for (const id of ALL_17) {
    if (BLOCKED.has(id)) {
      cfg[id] = { contracts: 0, filter: 'BLOCKED', status: 'DATA_BLOCKED' };
      continue;
    }
    if (id === 'eurusd_30m') {
      if (dimA === 'A1') {
        cfg[id] = { contracts: 0, filter: 'INACTIVE', status: 'READY_DEACTIVATED' };
      } else if (dimA === 'A2') {
        cfg[id] = { contracts: 1, filter: 'DOW_MON', dowFilter: [1], status: 'READY' };
      } else if (dimA === 'A3') {
        cfg[id] = { contracts: 1, filter: 'DOW_MON_TUE', dowFilter: [1, 2], status: 'READY' };
      } else {
        cfg[id] = { contracts: 1, filter: 'NONE', status: 'READY' };
      }
      continue;
    }
    if (id === 'dax_1h') {
      cfg[id] = dimB === 'B1'
        ? { contracts: 0, filter: 'INACTIVE', status: 'READY_DEACTIVATED' }
        : { contracts: 1, filter: 'NONE', status: 'READY' };
      continue;
    }
    if (id === 'dax_2h') {
      cfg[id] = dimC === 'C1'
        ? { contracts: 0, filter: 'INACTIVE', status: 'READY_DEACTIVATED' }
        : { contracts: 1, filter: 'NONE', status: 'READY' };
      continue;
    }
    if (id === 'ym1_tat') {
      cfg[id] = dimD === 'D1'
        ? { contracts: 0, filter: 'INACTIVE', status: 'READY_DEACTIVATED' }
        : { contracts: 1, filter: 'NONE', status: 'READY' };
      continue;
    }
    cfg[id] = { contracts: 1, filter: 'NONE', status: 'READY' };
  }
  return cfg;
}

// ─── Labels ───────────────────────────────────────────────────────────────────
const DIM_A_LABELS = {
  A0: 'EUR_ACTIVE', A1: 'EUR_INACTIVE', A2: 'EUR_MON_ONLY', A3: 'EUR_MON_TUE_ONLY'
};
const DIM_B_LABELS = { B0: 'DAX1H_ACTIVE', B1: 'DAX1H_INACTIVE' };
const DIM_C_LABELS = { C0: 'DAX2H_ACTIVE', C1: 'DAX2H_INACTIVE' };
const DIM_D_LABELS = { D0: 'YM1_ACTIVE', D1: 'YM1_INACTIVE' };

function filterDescription(dimA, dimB, dimC, dimD) {
  const parts = [];
  if (dimA === 'A0') parts.push('EURUSD active (no filter)');
  else if (dimA === 'A1') parts.push('EURUSD=0 contracts');
  else if (dimA === 'A2') parts.push('EURUSD Mon-only (DOW filter)');
  else if (dimA === 'A3') parts.push('EURUSD Mon+Tue-only (DOW filter)');
  parts.push(dimB === 'B0' ? 'DAX 1H active' : 'DAX 1H=0 contracts');
  parts.push(dimC === 'C0' ? 'DAX 2H active' : 'DAX 2H=0 contracts');
  parts.push(dimD === 'D0' ? 'YM1 TAT active' : 'YM1 TAT=0 contracts');
  return parts.join(', ');
}

// ─── Target thresholds ────────────────────────────────────────────────────────
function checkThresholds(kpis, wf) {
  return {
    cagrGt15: { pass: kpis.cagr >= 15, actual: kpis.cagr },
    oosCAGRGt20: { pass: kpis.oosCAGR >= 20, actual: kpis.oosCAGR },
    tradesPerWeek4to8: { pass: kpis.tradesPerWeek >= 4 && kpis.tradesPerWeek <= 8, actual: kpis.tradesPerWeek },
    sharpeGt1: { pass: kpis.sharpe >= 1.0, actual: kpis.sharpe },
    calmarGt1: { pass: kpis.calmar >= 1.0, actual: kpis.calmar },
    costRatioLt50: { pass: kpis.costRatio < 50, actual: kpis.costRatio },
    noLookahead: { pass: true, actual: 'LIVE_VALID_BY_CONSTRUCTION' },
    wfPassRateGt70: { pass: wf && wf.passRate >= 0.7, actual: wf?.passRate }
  };
}

// ─── MAIN: Build 128 live-valid variants ─────────────────────────────────────
console.log('\n=== WHITE SWAN PHASE 3: LIVE-VALID QUALITY VARIANTS ===\n');

const DIM_A = ['A0', 'A1', 'A2', 'A3'];
const DIM_B = ['B0', 'B1'];
const DIM_C = ['C0', 'C1'];
const DIM_D = ['D0', 'D1'];

const allVariants = [];
let count = 0;

for (const dimA of DIM_A) {
  for (const dimB of DIM_B) {
    for (const dimC of DIM_C) {
      for (const dimD of DIM_D) {
        const family = `LV_${dimA}${dimB}${dimC}${dimD}`;
        const stratCfg = buildStratCfg(dimA, dimB, dimC, dimD);

        for (const capital of CAPITALS) {
          const variantId = `${family}_${capital}`;
          const trades = buildVariantTrades(stratCfg);
          const kpis = computeKPIs(trades, capital, false);
          const wf = kpis.error ? null : walkForward(() => buildVariantTrades(stratCfg));
          const ss = suitabilityScore(kpis, wf);
          const rs = robustnessScore(kpis);

          const strategyDetail = {};
          for (const id of ALL_17) {
            const c = stratCfg[id];
            strategyDetail[id] = {
              contracts: c?.contracts ?? 0,
              filter: c?.filter ?? 'NONE',
              status: c?.status ?? 'READY',
              ...(c?.dowFilter ? { dowFilter: c.dowFilter } : {})
            };
          }

          allVariants.push({
            variantId,
            family,
            phase: 'v3',
            constraint: '17_17_LIVE_VALID',
            liveValidStatus: 'LIVE_VALID',
            capital,
            dimA, dimB, dimC, dimD,
            dimALabel: DIM_A_LABELS[dimA],
            dimBLabel: DIM_B_LABELS[dimB],
            dimCLabel: DIM_C_LABELS[dimC],
            dimDLabel: DIM_D_LABELS[dimD],
            filterDescription: filterDescription(dimA, dimB, dimC, dimD),
            kpis,
            walkForward: wf,
            robustnessScore: rs,
            suitabilityScore: ss,
            strategyDetail,
            _trades: trades // temp, stripped before export
          });

          count++;
          if (count % 32 === 0) process.stdout.write(`  [${count}/128 variants] `);
        }
      }
    }
  }
}
console.log(`\nBuilt ${allVariants.length} live-valid variants`);

// ─── Build 4 INVALID_RESEARCH_REFERENCE (QA_ALL_HOLD1) variants ──────────────
console.log('Building INVALID_RESEARCH_REFERENCE (QA_ALL_HOLD1) variants...');

function buildHold1Trades(capital) {
  const out = [];
  for (const t of allTrades) {
    // All 17 active, but eurusd_30m / dax_1h / dax_2h filtered by holdingDays >= 1
    if (BLOCKED.has(t.strategyId)) continue;
    const isIntraday = ['eurusd_30m', 'dax_1h', 'dax_2h'].includes(t.strategyId);
    if (isIntraday && t.holdingDays < 1.0) continue;
    out.push({ ...t }); // 1 contract, no scaling needed
  }
  return out;
}

const invalidVariants = [];
for (const capital of CAPITALS) {
  const trades = buildHold1Trades(capital);
  const kpis = computeKPIs(trades, capital, false);
  invalidVariants.push({
    variantId: `QA_ALL_HOLD1_${capital}`,
    family: 'QA_ALL_HOLD1',
    phase: 'v3',
    liveValidStatus: 'INVALID_RESEARCH_REFERENCE',
    lookaheadNote: 'holdingDays>=1 filter uses post-exit realized hold time. Stop-based exits only — hold duration unknown at entry. NOT valid for live trading.',
    capital,
    kpis,
    _trades: trades
  });
}
console.log('Built 4 INVALID_RESEARCH_REFERENCE variants');

// ─── Export variants.json (no navSeries) ─────────────────────────────────────
const variantsExport = allVariants.map(v => {
  const { _trades, ...rest } = v;
  return { ...rest, kpis: { ...rest.kpis, navSeries: undefined } };
});
writeFileSync(`${OUT}/variants.json`, JSON.stringify(variantsExport, null, 2));
console.log('Wrote variants.json');

// ─── Per-capital files (top-20) ───────────────────────────────────────────────
for (const capital of CAPITALS) {
  const capVariants = allVariants
    .filter(v => v.capital === capital)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 20)
    .map(v => { const { _trades, ...rest } = v; return { ...rest, kpis: { ...rest.kpis, navSeries: undefined } }; });
  writeFileSync(`${OUT}/capital-${capital}.json`, JSON.stringify(capVariants, null, 2));
}
console.log('Wrote capital files');

// ─── Finalists: top-5 per capital WITH navSeries and Monte Carlo ──────────────
console.log('Building finalists with navSeries + Monte Carlo...');
const finalistsAll = {};
for (const capital of CAPITALS) {
  const top5 = allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 5);

  finalistsAll[`capital_${capital}`] = top5.map(v => {
    const kpisWithSeries = computeKPIs(v._trades, capital, true);
    const mc = v._trades.length > 0 ? monteCarlo(v._trades, capital) : null;
    const { _trades, ...rest } = v;
    return { ...rest, kpis: kpisWithSeries, monteCarlo: mc };
  });
}
writeFileSync(`${OUT}/finalists.json`, JSON.stringify(finalistsAll, null, 2));
console.log('Wrote finalists.json');

// ─── Lookahead reference file ─────────────────────────────────────────────────
const lookaheadExport = invalidVariants.map(v => {
  const { _trades, ...rest } = v;
  return { ...rest, kpis: { ...rest.kpis, navSeries: undefined } };
});
writeFileSync(`${OUT}/lookahead-reference.json`, JSON.stringify(lookaheadExport, null, 2));
console.log('Wrote lookahead-reference.json');

// ─── Live-valid report (markdown) ─────────────────────────────────────────────
function topN(capital, n = 5) {
  return allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, n);
}

function threshRow(v) {
  const t = checkThresholds(v.kpis, v.walkForward);
  const k = v.kpis;
  return `| ${v.variantId} | ${k.cagr?.toFixed(1)}% ${t.cagrGt15.pass ? 'PASS' : 'FAIL'} | ${k.oosCAGR?.toFixed(1)}% ${t.oosCAGRGt20.pass ? 'PASS' : 'FAIL'} | ${k.tradesPerWeek?.toFixed(1)} ${t.tradesPerWeek4to8.pass ? 'PASS' : 'FAIL'} | ${k.sharpe?.toFixed(2)} ${t.sharpeGt1.pass ? 'PASS' : 'FAIL'} | ${k.calmar?.toFixed(2)} ${t.calmarGt1.pass ? 'PASS' : 'FAIL'} | ${k.costRatio?.toFixed(1)}% ${t.costRatioLt50.pass ? 'PASS' : 'FAIL'} | ${v.walkForward?.passRate?.toFixed(2)} ${t.wfPassRateGt70.pass ? 'PASS' : 'FAIL'} |`;
}

const mdLines = [
  '# WHITE SWAN PHASE 3 — LIVE-VALID QUALITY VARIANTS',
  '',
  `**Generated:** ${new Date().toISOString()}`,
  `**Constraint:** 17/17 components. No holdingDays filter on any LIVE_VALID variant.`,
  `**Variants:** 128 live-valid + 4 INVALID_RESEARCH_REFERENCE`,
  '',
  '## Live-Valid Thesis',
  '',
  '- EURUSD: every DOW is negative — only valid live decision is inactive (A1) or DOW filter (A2/A3)',
  '- DAX 2H: baseline already positive (+10,994 EUR). Active by default (C0).',
  '- DAX 1H: slightly positive baseline (+1,379 EUR). Test both active/inactive.',
  '- YM1 TAT: predefined 1-day hold — always clean.',
  '',
  '## Dimension Space',
  '',
  '| Dim | Code | Description |',
  '|-----|------|-------------|',
  '| A | A0 | EURUSD active, no filter (-5,274 EUR drag) |',
  '| A | A1 | EURUSD inactive (0 contracts) — RECOMMENDED |',
  '| A | A2 | EURUSD Mon-only (ex-ante DOW filter) |',
  '| A | A3 | EURUSD Mon+Tue-only (ex-ante DOW filter) |',
  '| B | B0 | DAX 1H active |',
  '| B | B1 | DAX 1H inactive |',
  '| C | C0 | DAX 2H active |',
  '| C | C1 | DAX 2H inactive |',
  '| D | D0 | YM1 TAT active |',
  '| D | D1 | YM1 TAT inactive |',
  '',
];

for (const capital of CAPITALS) {
  const top5 = topN(capital, 5);
  mdLines.push(`## Capital €${capital.toLocaleString()} — Top 5`);
  mdLines.push('');
  mdLines.push('| Variant | CAGR>=15% | OOS CAGR>=20% | Trades/wk 4-8 | Sharpe>=1 | Calmar>=1 | CostRatio<50% | WF>=70% |');
  mdLines.push('|---------|-----------|---------------|---------------|-----------|-----------|---------------|---------|');
  for (const v of top5) mdLines.push(threshRow(v));
  mdLines.push('');
}

// Add QA_ALL_HOLD1 reference
const hold1at12500 = invalidVariants.find(v => v.capital === 12500);
if (hold1at12500 && !hold1at12500.kpis.error) {
  const k = hold1at12500.kpis;
  mdLines.push('## INVALID_RESEARCH_REFERENCE — QA_ALL_HOLD1 at €12,500 (LOOKAHEAD)');
  mdLines.push('');
  mdLines.push(`- CAGR: ${k.cagr?.toFixed(2)}%`);
  mdLines.push(`- OOS CAGR: ${k.oosCAGR?.toFixed(2)}%`);
  mdLines.push(`- Sharpe: ${k.sharpe?.toFixed(2)}`);
  mdLines.push(`- Calmar: ${k.calmar?.toFixed(2)}`);
  mdLines.push(`- MaxDD from peak: ${k.maxDDFromPeak?.toFixed(2)}%`);
  mdLines.push(`- NOTE: This is a LOOKAHEAD variant — holdingDays filter uses post-exit realized hold time.`);
  mdLines.push('');
}

writeFileSync(`${OUT}/live-valid-report.md`, mdLines.join('\n'));
console.log('Wrote live-valid-report.md');

// ─── CONSOLE SUMMARY ──────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('PHASE 3 FINAL SUMMARY');
console.log('='.repeat(70));
console.log(`Total live-valid variants: ${allVariants.length}`);
console.log('');

for (const capital of CAPITALS) {
  const best = allVariants
    .filter(v => v.capital === capital && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)[0];
  if (!best) { console.log(`€${capital}: No valid variant`); continue; }
  const k = best.kpis;
  const wf = best.walkForward;
  const t = checkThresholds(k, wf);
  console.log(`\n--- BEST at €${capital.toLocaleString()} ---`);
  console.log(`  Variant:      ${best.variantId}`);
  console.log(`  Filter:       ${best.filterDescription}`);
  console.log(`  Suitability:  ${best.suitabilityScore}/100`);
  console.log(`  CAGR:         ${k.cagr?.toFixed(2)}%  [target>=15%: ${t.cagrGt15.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  OOS CAGR:     ${k.oosCAGR?.toFixed(2)}%  [target>=20%: ${t.oosCAGRGt20.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  Sharpe:       ${k.sharpe?.toFixed(2)}  [target>=1.0: ${t.sharpeGt1.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  Calmar:       ${k.calmar?.toFixed(2)}  [target>=1.0: ${t.calmarGt1.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  MaxDD(peak):  ${k.maxDDFromPeak?.toFixed(2)}%`);
  console.log(`  Trades/wk:    ${k.tradesPerWeek?.toFixed(2)}  [target 4-8: ${t.tradesPerWeek4to8.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  CostRatio:    ${k.costRatio?.toFixed(1)}%  [target<50%: ${t.costRatioLt50.pass ? 'PASS' : 'FAIL'}]`);
  console.log(`  WF pass rate: ${wf?.positiveFolds}/${wf?.totalFolds}=${wf?.passRate?.toFixed(2)}  [target>=0.7: ${t.wfPassRateGt70.pass ? 'PASS' : 'FAIL'}]`);
}

// QA_ALL_HOLD1 reference at 12.5k
const hold1ref = invalidVariants.find(v => v.capital === 12500);
if (hold1ref && !hold1ref.kpis.error) {
  const k = hold1ref.kpis;
  console.log('\n--- QA_ALL_HOLD1 REFERENCE (INVALID, LOOKAHEAD) at €12,500 ---');
  console.log(`  CAGR: ${k.cagr?.toFixed(2)}%  OOS CAGR: ${k.oosCAGR?.toFixed(2)}%  Sharpe: ${k.sharpe?.toFixed(2)}  Calmar: ${k.calmar?.toFixed(2)}`);

  // Gap analysis vs best live-valid at 12.5k
  const bestLV = allVariants
    .filter(v => v.capital === 12500 && !v.kpis.error)
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)[0];
  if (bestLV) {
    const lk = bestLV.kpis;
    const cagrGap = k.cagr - lk.kpis?.cagr ?? (k.cagr - lk.kpis?.cagr);
    const oosGap = k.oosCAGR - (lk.kpis?.oosCAGR ?? 0);
    console.log('\n--- GAP ANALYSIS: QA_ALL_HOLD1 vs Best Live-Valid at €12,500 ---');
    console.log(`  Best live-valid: ${bestLV.variantId}`);
    console.log(`  CAGR:     QA=${k.cagr?.toFixed(2)}%  LV=${lk.cagr?.toFixed(2)}%  gap=${((k.cagr ?? 0) - (lk.cagr ?? 0)).toFixed(2)}pp`);
    console.log(`  OOS CAGR: QA=${k.oosCAGR?.toFixed(2)}%  LV=${lk.oosCAGR?.toFixed(2)}%  gap=${((k.oosCAGR ?? 0) - (lk.oosCAGR ?? 0)).toFixed(2)}pp`);
    console.log(`  Sharpe:   QA=${k.sharpe?.toFixed(2)}  LV=${lk.sharpe?.toFixed(2)}`);
    console.log(`  -> OOS edge retained: ${(lk.oosCAGR / k.oosCAGR * 100).toFixed(1)}% of QA_ALL_HOLD1 OOS CAGR`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`Output: ${OUT}`);
console.log('Files: variants.json, capital-{10000,12500,15000,20000}.json, finalists.json,');
console.log('       live-valid-report.md, lookahead-reference.json');
console.log('='.repeat(70));
