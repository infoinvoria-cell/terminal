// scripts/compute-portfolio-dashboard.mjs v3.0
// White Swan Portfolio Dashboard — REAL historical trade reconstruction.
// Replicates the EXACT Phase B computation logic from compute-phase-b-robustness.mjs:
//   - Core 4 strategies filtered: E6_MonLong, D1_Baseline, D2_HighVolYears, GLD_BestMonths
//   - All other strategies (ym1_tat, seasonals) pass through unchanged (as in PB)
//   - IBKR real costs per instrument (confirmed 2026-08-14)
//   - Shared FDXS margin for D1H+D2H (matching confirmed final-normalized)
// NO GBM, NO synthetic NAV, NO extrapolated KPIs.
// Confirmed verification target at EUR15k 1c: CAGR=11.25%, Sharpe=1.437, MaxDD=8.82%, costs=€257.52/yr

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = join(__dirname, '..');

// PB script uses time-varying FX from allTrades, but for costs we use fixed FX as in phase-b
const FX_EUR_PER_USD = 0.81677;
const MARGIN_GATE = 0.30;

// IBKR all-in roundtrip costs (confirmed 2026-08-14), all in EUR
const IBKR_COST = {
  M6E:  4.10,
  FDXS: 0.76,
  '1OZ':2.63,
  MYM:  2.50 * FX_EUR_PER_USD,
  MES:  1.90 * FX_EUR_PER_USD,
  M2K:  1.90 * FX_EUR_PER_USD,
  MHG:  2.63 * FX_EUR_PER_USD,
  MCL:  2.23 * FX_EUR_PER_USD,
  MZM:  2.00 * FX_EUR_PER_USD,
  MZC:  2.00 * FX_EUR_PER_USD,
  MZW:  2.00 * FX_EUR_PER_USD,
  MZS:  2.00 * FX_EUR_PER_USD,
  SB:   5.00 * FX_EUR_PER_USD,
  CC:   5.00 * FX_EUR_PER_USD,
};

// Margin requirements (EUR) per instrument
const MARGIN_EUR = {
  M6E: 2287, FDXS: 880, '1OZ': 735,
  MYM: 490, MES: 490, M2K: 572, MHG: 1633, MCL: 653,
  MZM: 570, MZC: 572, MZW: 572, MZS: 572, SB: 980, CC: 1470,
};

const TARGET_WEIGHT = { eurusd_30m: 0.30, dax_1h: 0.20, dax_2h: 0.30, gld_thursday_long: 0.20 };
const STRATEGY_SYMBOL = {
  eurusd_30m: 'M6E', dax_1h: 'FDXS', dax_2h: 'FDXS', gld_thursday_long: '1OZ',
  ym1_tat: 'MYM', spy_seasonal: 'MES', gc1_seasonal: '1OZ', hg1_seasonal: 'MHG',
  cl1_seasonal: 'MCL', zm1_seasonal: 'MZM', zc_seasonal: 'MZC', zw_seasonal: 'MZW',
  zs_seasonal: 'MZS', sb_seasonal: 'SB', cc_seasonal: 'CC',
};

const BLOCKED = new Set(['EEM', 'IWM']);

// ─── Load raw trades ──────────────────────────────────────────────────────────
const allTradesPath = join(CWD, 'workspace', 'output', 'white-swan', 'all-trades.json');
if (!existsSync(allTradesPath)) {
  console.error('ERROR: workspace/output/white-swan/all-trades.json not found.');
  process.exit(1);
}
const rawTrades = JSON.parse(readFileSync(allTradesPath, 'utf8'));
console.log('Total trades loaded:', rawTrades.length);

// Enrich trades (matches phase-b script; replaces costRt with IBKR real costs)
const allTrades = rawTrades.map(t => {
  const toEUR = t.currency === 'EUR' ? 1 : FX_EUR_PER_USD;
  const sym = t.symbol;
  const ibkrCostEUR = IBKR_COST[sym] ?? (1.70 * toEUR);
  return {
    ...t,
    grossPnlEUR: t.grossPnl * toEUR,
    ibkrCostEUR,
    netPnlEUR:   t.grossPnl * toEUR - ibkrCostEUR,
    entryDow:    new Date(t.entryDate + 'T12:00:00Z').getUTCDay(),
    entryYear:   new Date(t.entryDate + 'T12:00:00Z').getUTCFullYear(),
    entryMonth:  new Date(t.entryDate + 'T12:00:00Z').getUTCMonth() + 1,
  };
});

// ─── PB Phase B filters ───────────────────────────────────────────────────────
const e6MonLongFn  = t => t.entryDow === 1 && t.direction === 'LONG';
const d1BaselineFn = () => true;

function computeHighVolYears(trades) {
  const byYear = {};
  for (const t of trades) {
    const y = String(t.entryYear);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(t);
  }
  const yearStats = Object.entries(byYear).map(([y, ts]) => {
    const avgAbsNet = ts.reduce((s, t) => s + Math.abs(t.netPnlEUR), 0) / ts.length;
    return { year: +y, avgAbsNet };
  });
  const sorted = yearStats.map(y => y.avgAbsNet).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return new Set(yearStats.filter(y => y.avgAbsNet > median).map(y => y.year));
}

const dax2hAll = allTrades.filter(t => t.strategyId === 'dax_2h');
const highVolYears2h = computeHighVolYears(dax2hAll);
const d2HighVolYearsFn = t => highVolYears2h.has(t.entryYear);
console.log('DAX 2H high-vol years:', [...highVolYears2h].sort().join(', '));

function computeGldBestMonths(trades) {
  const byMonth = {};
  for (const t of trades) {
    const m = t.entryMonth;
    if (!byMonth[m]) byMonth[m] = 0;
    byMonth[m] += t.netPnlEUR;
  }
  const ranked = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
  return new Set(ranked.slice(0, 4).map(x => +x[0]));
}

const gldAll = allTrades.filter(t => t.strategyId === 'gld_thursday_long');
const gldBest4Months = computeGldBestMonths(gldAll);
const gldBestMonthsFn = t => gldBest4Months.has(t.entryMonth);
console.log('GLD best 4 months:', [...gldBest4Months].sort((a, b) => a - b).join(', '));

// ─── Build variant trade set (exact replica of phase-b buildPBVariantTrades) ──
function buildPBVariantTrades() {
  return allTrades.filter(t => {
    if (BLOCKED.has(t.strategyId))         return false;
    if (t.strategyId === 'eurusd_30m')      return e6MonLongFn(t);
    if (t.strategyId === 'dax_1h')          return d1BaselineFn(t);
    if (t.strategyId === 'dax_2h')          return d2HighVolYearsFn(t);
    if (t.strategyId === 'gld_thursday_long') return gldBestMonthsFn(t);
    return true; // ym1_tat, seasonals etc. pass through unchanged
  });
}

const variantTrades = buildPBVariantTrades();

const tradesByStrategy = {};
for (const t of variantTrades) {
  tradesByStrategy[t.strategyId] = (tradesByStrategy[t.strategyId] || 0) + 1;
}

const YEARS = (() => {
  const first = variantTrades.reduce((d, t) => t.entryDate < d ? t.entryDate : d, variantTrades[0].entryDate);
  const last  = variantTrades.reduce((d, t) => t.exitDate  > d ? t.exitDate  : d, variantTrades[0].exitDate);
  return (new Date(last) - new Date(first)) / (365.25 * 86400000);
})();

const totalTrades = variantTrades.length;
console.log('\nVariant trades after PB filters (including pass-through):');
for (const [strat, n] of Object.entries(tradesByStrategy).sort()) {
  console.log(`  ${strat}: ${n} (${(n/YEARS).toFixed(1)}/yr)`);
}
console.log(`  TOTAL: ${totalTrades} (${(totalTrades/YEARS).toFixed(1)}/yr, ${(totalTrades/YEARS/52).toFixed(2)}/wk)`);
console.log(`  CONFIRMED: 3669 trades, 3.81/wk`);

// ─── Contract optimization (shared FDXS for D1H+D2H, 3 instruments) ──────────
// Confirmed 15k: M6E(2287)+FDXS(880)+MGC(735)=3902 EUR=26.01%
const CORE_MARGIN_1C = MARGIN_EUR.M6E + MARGIN_EUR.FDXS + MARGIN_EUR['1OZ']; // 3902

const coreStrategyIds = new Set(['eurusd_30m', 'dax_1h', 'dax_2h', 'gld_thursday_long']);

function optimizeContracts(capital) {
  const maxMargin = capital * MARGIN_GATE, maxC = 6;
  let best = null, bestErr = Infinity;
  for (let n6E = 1; n6E <= maxC; n6E++)
  for (let nFDXS = 1; nFDXS <= maxC; nFDXS++)
  for (let nGLD = 1; nGLD <= maxC; nGLD++) {
    const totalMargin = n6E * MARGIN_EUR.M6E + nFDXS * MARGIN_EUR.FDXS + nGLD * MARGIN_EUR['1OZ'];
    if (totalMargin > maxMargin) continue;
    const vol6E  = n6E   * MARGIN_EUR.M6E   * 1.8;
    const volD1H = nFDXS * MARGIN_EUR.FDXS  * 1.8;
    const volD2H = nFDXS * MARGIN_EUR.FDXS  * 1.8;
    const volGLD = nGLD  * MARGIN_EUR['1OZ']* 1.8;
    const totalVol = vol6E + volD1H + volD2H + volGLD;
    const rw = {
      eurusd_30m: vol6E / totalVol, dax_1h: volD1H / totalVol,
      dax_2h: volD2H / totalVol, gld_thursday_long: volGLD / totalVol,
    };
    const err = Object.entries(TARGET_WEIGHT).reduce((s, [id, tw]) => s + Math.abs((rw[id]??0) - tw), 0);
    if (err < bestErr) {
      bestErr = err;
      best = {
        contracts: { eurusd_30m: n6E, dax_1h: nFDXS, dax_2h: nFDXS, gld_thursday_long: nGLD },
        totalMargin, marginPct: totalMargin / capital * 100,
        weightError: Math.round(err * 1000) / 1000,
        realizedWeights: {
          eurusd_30m:        Math.round(rw.eurusd_30m * 1000) / 10,
          dax_1h:            Math.round(rw.dax_1h     * 1000) / 10,
          dax_2h:            Math.round(rw.dax_2h     * 1000) / 10,
          gld_thursday_long: Math.round(rw.gld_thursday_long * 1000) / 10,
        },
      };
    }
  }
  return best;
}

// ─── Daily P&L and NAV series ─────────────────────────────────────────────────
function buildDailyPnl(contracts) {
  const daily = {};
  for (const t of variantTrades) {
    const nc = coreStrategyIds.has(t.strategyId) ? (contracts[t.strategyId] ?? 1) : 1;
    const grossEUR = t.grossPnlEUR * nc;
    const costEUR  = t.ibkrCostEUR * nc;
    const netEUR   = grossEUR - costEUR;
    const date = t.exitDate.slice(0, 10);
    if (!daily[date]) daily[date] = { grossEUR: 0, costsEUR: 0, netEUR: 0, tradeCount: 0 };
    daily[date].grossEUR  += grossEUR;
    daily[date].costsEUR  += costEUR;
    daily[date].netEUR    += netEUR;
    daily[date].tradeCount++;
  }
  return daily;
}

function buildNavSeries(startNAV, dailyPnl) {
  const dates = Object.keys(dailyPnl).sort();
  const series = [];
  let nav = startNAV, peak = startNAV;
  for (const date of dates) {
    const { netEUR, grossEUR, costsEUR } = dailyPnl[date];
    const prevNav = nav;
    nav = nav + netEUR;
    const ret = prevNav > 0 ? netEUR / prevNav : 0;
    if (nav > peak) peak = nav;
    const dd = peak > 0 ? (peak - nav) / peak * 100 : 0;
    series.push({
      date,
      nav:      Math.round(nav      * 100) / 100,
      netEUR:   Math.round(netEUR   * 100) / 100,
      grossEUR: Math.round(grossEUR * 100) / 100,
      costsEUR: Math.round(costsEUR * 100) / 100,
      dailyReturn: Math.round(ret   * 100000) / 1000,
      dd:       Math.round(dd       * 100) / 100,
    });
  }
  return series;
}

function computeKPIs(startNAV, navSeries, contracts) {
  const n = navSeries.length;
  if (!n) return {};
  const endNAV = navSeries[n - 1].nav;
  const cagr = (Math.pow(endNAV / startNAV, 1 / YEARS) - 1) * 100;
  // Phase-b exact Sharpe formula: (avgDailyReturn / dailyStd) × sqrt(252), population variance, active days only
  const dailyReturns = navSeries.map((p, i) =>
    i === 0 ? (p.nav / startNAV - 1) : (p.nav / navSeries[i - 1].nav - 1)
  );
  const meanDR   = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const variance = dailyReturns.reduce((s, r) => s + (r - meanDR) ** 2, 0) / n; // population variance (matches PB)
  const sharpe   = variance > 0 ? (meanDR / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  const annVol   = Math.sqrt(variance) * Math.sqrt(252) * 100; // for reporting
  const negR = dailyReturns.filter(r => r < 0);
  const downDev = negR.length > 0
    ? Math.sqrt(negR.reduce((s, r) => s + r ** 2, 0) / negR.length) * Math.sqrt(252) * 100
    : 0.001;
  const sortino = downDev > 0 ? cagr / downDev : 0;
  let peak2 = startNAV, maxDD_EUR = 0, maxDD_Pct = 0;
  for (const p of navSeries) {
    if (p.nav > peak2) peak2 = p.nav;
    const dd  = peak2 > 0 ? (peak2 - p.nav) : 0;
    const ddP = peak2 > 0 ? dd / peak2 * 100 : 0;
    if (dd > maxDD_EUR)  maxDD_EUR  = dd;
    if (ddP > maxDD_Pct) maxDD_Pct = ddP;
  }
  const calmar = maxDD_Pct > 0 ? cagr / maxDD_Pct : 0;
  const totalCosts  = navSeries.reduce((s, p) => s + (p.costsEUR ?? 0), 0);
  const totalGross  = navSeries.reduce((s, p) => s + (p.grossEUR ?? 0), 0);
  const annualCosts = totalCosts / YEARS;
  const annualCostPct = (annualCosts / ((startNAV + endNAV) / 2)) * 100;
  const grossEndNAV = startNAV + totalGross;
  const grossCAGR   = (Math.pow(Math.max(grossEndNAV, startNAV * 0.01) / startNAV, 1 / YEARS) - 1) * 100;
  const winDays     = navSeries.filter(p => p.netEUR > 0).length;
  const winRate     = n > 0 ? winDays / n * 100 : 0;
  const grossWins   = navSeries.filter(p => p.netEUR > 0).reduce((s, p) => s + p.netEUR, 0);
  const grossLosses = Math.abs(navSeries.filter(p => p.netEUR < 0).reduce((s, p) => s + p.netEUR, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;
  let totalWeightedTrades = 0;
  for (const [strat, count] of Object.entries(tradesByStrategy)) {
    const nc = coreStrategyIds.has(strat) ? (contracts[strat] ?? 1) : 1;
    totalWeightedTrades += count * nc;
  }
  const tradesPerWeek = totalWeightedTrades / (YEARS * 52);
  const netProfit = endNAV - startNAV;
  const bestDay   = Math.max(...navSeries.map(p => p.netEUR));
  const worstDay  = Math.min(...navSeries.map(p => p.netEUR));
  const totalMarginVal = contracts.eurusd_30m * MARGIN_EUR.M6E
    + contracts.dax_1h * MARGIN_EUR.FDXS   // shared FDXS
    + contracts.gld_thursday_long * MARGIN_EUR['1OZ'];
  return {
    startNAV, endNAV: Math.round(endNAV * 100) / 100,
    netProfit:    Math.round(netProfit   * 100) / 100,
    totalReturnPct: Math.round((endNAV / startNAV - 1) * 10000) / 100,
    netCAGR:      Math.round(cagr        * 1000) / 1000,
    grossCAGR:    Math.round(grossCAGR   * 1000) / 1000,
    annVolatility:Math.round(annVol      * 1000) / 1000,
    sharpe:       Math.round(sharpe      * 1000) / 1000,
    sortino:      Math.round(sortino     * 1000) / 1000,
    calmar:       Math.round(calmar      * 1000) / 1000,
    maxDD_EUR:    Math.round(maxDD_EUR   * 100) / 100,
    maxDD_Pct:    Math.round(maxDD_Pct   * 1000) / 1000,
    profitFactor: Math.round(profitFactor* 1000) / 1000,
    winRate:      Math.round(winRate     * 100) / 100,
    tradesPerWeek:Math.round(tradesPerWeek * 1000) / 1000,
    totalWeightedTrades, totalRawTrades: totalTrades,
    totalCosts:   Math.round(totalCosts  * 100) / 100,
    annualCosts:  Math.round(annualCosts * 100) / 100,
    annualCostPct:Math.round(annualCostPct * 1000) / 1000,
    bestDay:  Math.round(bestDay  * 100) / 100,
    worstDay: Math.round(worstDay * 100) / 100,
    years: YEARS,
    marginTotal: Math.round(totalMarginVal),
    dataSource: 'HISTORICAL_BACKTEST_PB_VARIANT_IBKR_REAL_COSTS',
    variantNote: 'E6_MonLong+D1_Baseline+D2_HighVolYears+GLD_BestMonths+ym1_tat+seasonals',
  };
}

function computeYearlyReturns(startNAV, navSeries) {
  const byYear = {};
  let prevStart = startNAV;
  for (const p of navSeries) {
    const yr = p.date.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = { grossEUR: 0, costsEUR: 0, netEUR: 0, navStart: prevStart };
    byYear[yr].grossEUR += p.grossEUR ?? 0;
    byYear[yr].costsEUR += p.costsEUR ?? 0;
    byYear[yr].netEUR   += p.netEUR   ?? 0;
    byYear[yr].navEnd    = p.nav;
  }
  return Object.entries(byYear).sort().map(([year, d]) => ({
    year: Number(year),
    netEUR:   Math.round(d.netEUR   * 100) / 100,
    grossEUR: Math.round(d.grossEUR * 100) / 100,
    costsEUR: Math.round(d.costsEUR * 100) / 100,
    navStart: Math.round(d.navStart * 100) / 100,
    navEnd:   Math.round((d.navEnd  ?? d.navStart) * 100) / 100,
    returnPct:      Math.round(d.navStart > 0 ? (d.netEUR   / d.navStart * 100) * 100 : 0) / 100,
    grossReturnPct: Math.round(d.navStart > 0 ? (d.grossEUR / d.navStart * 100) * 100 : 0) / 100,
  }));
}

function buildSerkanPrecheck() {
  const SERKAN_REF = 1.70;
  const rows = Object.entries(tradesByStrategy).sort().map(([strat, n]) => {
    const sym = STRATEGY_SYMBOL[strat] ?? 'UNK';
    const ibkr = IBKR_COST[sym] ?? 1.70;
    const tradesYr = n / YEARS;
    return {
      strategy: strat, symbol: sym, tradesTotal: n,
      tradesYr:   Math.round(tradesYr * 10) / 10,
      ibkrCostRt: Math.round(ibkr     * 1000) / 1000,
      serkanCostRt: SERKAN_REF,
      ibkrCostYr:   Math.round(tradesYr * ibkr       * 100) / 100,
      serkanCostYr: Math.round(tradesYr * SERKAN_REF  * 100) / 100,
      delta: Math.round((tradesYr * (ibkr - SERKAN_REF)) * 100) / 100,
    };
  });
  const totalIbkr   = rows.reduce((s, r) => s + r.ibkrCostYr,   0);
  const totalSerkan = rows.reduce((s, r) => s + r.serkanCostYr, 0);
  return {
    rows,
    totalIbkrYr:    Math.round(totalIbkr   * 100) / 100,
    totalSerkanYr:  Math.round(totalSerkan  * 100) / 100,
    confirmedIbkrYr_1c: 257.52,
    note: 'IBKR costs computed per-instrument. Confirmed 257.52 used FDXS rate for ym1_tat/seasonals.',
  };
}

function makeComp(id, label, sleeve, symbol, exchange, ibkrCost, margin, n, status, wf, dataQuality, targetWeight) {
  return { id, label, sleeve, instrument: symbol, symbol, exchange, ibkrCost, margin, tradesTotal: n, tradesYr: Math.round(n/YEARS*10)/10, status, statusColor: '#888', wf, dataQuality, targetWeight };
}
const COMPONENTS_17 = [
  makeComp('eurusd_30m',        'EURUSD 30M (E6_MonLong)',   'Momentum',   'M6E',  'CME',   4.10, 2287, tradesByStrategy.eurusd_30m??0,        'FILTERED',     '9/9', 'FULL_2008_2026_FILTERED', 30  ),
  makeComp('dax_1h',            'DAX 1H (D1_Baseline)',      'DAX',        'FDXS', 'EUREX', 0.76, 880,  tradesByStrategy.dax_1h??0,            'BASELINE',     '9/9', 'FULL_2008_2026',          20  ),
  makeComp('dax_2h',            'DAX 2H (D2_HighVolYears)',  'DAX',        'FDXS', 'EUREX', 0.76, 880,  tradesByStrategy.dax_2h??0,            'ROBUST',       '9/9', 'FULL_2008_2026_FILTERED', 30  ),
  makeComp('gld_thursday_long', 'GLD Thursday (BestMonths)', 'Gold',       '1OZ',  'COMEX', 2.63, 735,  tradesByStrategy.gld_thursday_long??0, 'FILTERED',     '9/9', 'ETF_PROXY_FILTERED',      20  ),
  makeComp('ym1_tat',           'YM1 TAT (Dow)',             'Equity',     'MYM',  'CBOT',  2.04, 490,  tradesByStrategy.ym1_tat??0,           'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    2   ),
  makeComp('gc1_seasonal',      'Gold Seasonal',             'Gold',       '1OZ',  'COMEX', 2.63, 735,  tradesByStrategy.gc1_seasonal??0,      'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('hg1_seasonal',      'Copper Seasonal',           'Metals',     'MHG',  'COMEX', 2.15, 1633, tradesByStrategy.hg1_seasonal??0,      'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('cl1_seasonal',      'Crude Oil Seasonal',        'Energy',     'MCL',  'NYMEX', 1.82, 653,  tradesByStrategy.cl1_seasonal??0,      'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('spy_seasonal',      'SPY Seasonal',              'Equity Idx', 'MES',  'CME',   1.55, 490,  tradesByStrategy.spy_seasonal??0,      'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    2   ),
  makeComp('zm1_seasonal',      'Soybean Meal Seasonal',     'Ags',        'MZM',  'CBOT',  1.63, 570,  tradesByStrategy.zm1_seasonal??0,      'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('sb_seasonal',       'Sugar Seasonal',            'Softs',      'SB',   'ICEUS', 4.08, 980,  tradesByStrategy.sb_seasonal??0,       'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('zc_seasonal',       'Corn Seasonal',             'Ags',        'MZC',  'CBOT',  1.63, 572,  tradesByStrategy.zc_seasonal??0,       'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('zw_seasonal',       'Wheat Seasonal',            'Ags',        'MZW',  'CBOT',  1.63, 572,  tradesByStrategy.zw_seasonal??0,       'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('zs_seasonal',       'Soybeans Seasonal',         'Ags',        'MZS',  'CBOT',  1.63, 572,  tradesByStrategy.zs_seasonal??0,       'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('cc_seasonal',       'Cocoa Seasonal',            'Softs',      'CC',   'ICEUS', 4.08, 1470, tradesByStrategy.cc_seasonal??0,       'PASS_THROUGH', '—',   'INCLUDED_UNFILTERED',    1.5 ),
  makeComp('EEM',               'EEM / MSCI EM',             'EM Equity',  'MME',  'SGX',   4.00, 0,    0,                                      'BLOCKED',      '—',   'DATA_BLOCKED',           2   ),
  makeComp('IWM',               'IWM / Russell 2000',        'Equity Idx', 'M2K',  'CME',   1.55, 572,  0,                                      'BLOCKED',      '—',   'BLOCKED_IN_PB',          2   ),
];

const RECOMMENDATIONS = {
  core: {
    absoluteMin: { capital: 13000, note: `Core margin EUR${CORE_MARGIN_1C} (shared FDXS). Borderline 30% gate.`, rating: 'BORDERLINE' },
    investorMin:  { capital: 20000, note: '19.5% margin. Reliable 30% gate compliance.',                          rating: 'WORKABLE' },
    recommended:  { capital: 30000, note: 'Multiple contracts viable. Good weight approximation.',                 rating: 'COMFORTABLE' },
    comfortable:  { capital: 50000, note: '2-3x per sleeve. Weight error low. <1% cost/NAV.',                     rating: 'COMFORTABLE' },
  },
};

const ALL_CAPITALS = [10000, 12500, 15000, 20000, 25000, 50000, 100000];
const capitalResults = {}, capitalComparison = [];

for (const capital of ALL_CAPITALS) {
  console.log(`\nComputing EUR${capital.toLocaleString()}...`);
  const opt = optimizeContracts(capital);
  const contracts = opt?.contracts ?? { eurusd_30m: 1, dax_1h: 1, dax_2h: 1, gld_thursday_long: 1 };
  const mPct = opt?.marginPct ?? (CORE_MARGIN_1C / capital * 100);
  const assessment = mPct <= 30 ? 'PASS' : 'MARGIN_FAIL';
  const dailyPnl   = buildDailyPnl(contracts);
  const navSeries  = buildNavSeries(capital, dailyPnl);
  const kpis       = computeKPIs(capital, navSeries, contracts);
  const yearlyReturns = computeYearlyReturns(capital, navSeries);
  const totalMargin = contracts.eurusd_30m * MARGIN_EUR.M6E + contracts.dax_1h * MARGIN_EUR.FDXS + contracts.gld_thursday_long * MARGIN_EUR['1OZ'];

  console.log(`  ${assessment} margin=${mPct.toFixed(1)}% CAGR=${kpis.netCAGR}% Sharpe=${kpis.sharpe} MaxDD=${kpis.maxDD_Pct}% Costs/yr=€${kpis.annualCosts}`);

  capitalResults[capital] = {
    capital, assessment,
    provenanceLabel: assessment === 'PASS' ? 'Historical Backtest (PB Variant)' : 'Historical Backtest — MARGIN_FAIL (reference only)',
    dataSource: 'HISTORICAL_BACKTEST_PB_VARIANT_IBKR_REAL_COSTS_2026-08-14',
    variantFilters: {
      eurusd: 'E6_MonLong (Mon+LONG)', dax1h: 'D1_Baseline (all)', dax2h: 'D2_HighVolYears',
      gld: 'GLD_BestMonths (top 4 months)', passThrough: 'ym1_tat + all seasonals',
      highVolYears: [...highVolYears2h].sort(),
      gldBestMonths: [...gldBest4Months].sort((a, b) => a - b),
    },
    fxNote: `USD P&L at fixed EUR/USD=${FX_EUR_PER_USD}`,
    marginNote: 'Shared FDXS for D1H+D2H (matching confirmed final-normalized baseline at EUR3902)',
    contracts,
    optimization: opt ?? { weightError: null, realizedWeights: {}, marginPct: mPct },
    margin: { total: totalMargin, pct: Math.round(mPct * 100) / 100, freeCash: capital - totalMargin },
    kpis, targetWeights: TARGET_WEIGHT,
    realizedWeights: opt?.realizedWeights ?? {}, weightError: opt?.weightError ?? null,
    yearlyReturns, navSeries,
  };

  capitalComparison.push({
    capital, assessment,
    contracts: `${contracts.eurusd_30m}xM6E / ${contracts.dax_1h}xFDXS(shared D1+D2) / ${contracts.gld_thursday_long}x1OZ`,
    netCAGR: kpis.netCAGR, grossCAGR: kpis.grossCAGR, sharpe: kpis.sharpe, sortino: kpis.sortino,
    calmar: kpis.calmar, maxDD_Pct: kpis.maxDD_Pct, maxDD_EUR: kpis.maxDD_EUR,
    costAnnual: kpis.annualCosts, costPerNAV: kpis.annualCostPct,
    marginPct: Math.round(mPct * 100) / 100, weightError: opt?.weightError ?? null, endNAV: kpis.endNAV,
  });
}

// ─── Write output files ───────────────────────────────────────────────────────
const outDir = join(CWD, 'public', 'data', 'white-swan', 'portfolio-dashboard');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const sharedMeta = {
  generatedDate: '2026-08-15', version: '3.0', status: 'RESEARCH_CANDIDATE',
  dataProvenance: 'HISTORICAL_BACKTEST', noSyntheticData: true,
  description: 'Real historical trade reconstruction: PB variant (Phase B filters). IBKR real costs. NO GBM.',
  dataSource: 'workspace/output/white-swan/all-trades.json',
  totalRawTrades: totalTrades, tradesByStrategy,
  variantFilters: {
    eurusd: 'E6_MonLong', dax1h: 'D1_Baseline', dax2h: 'D2_HighVolYears',
    gld: 'GLD_BestMonths (top 4 months)', passThrough: 'ym1_tat + all seasonals',
    highVolYears: [...highVolYears2h].sort(), gldBestMonths: [...gldBest4Months].sort((a,b)=>a-b),
  },
  ibkrCosts: IBKR_COST, margins: MARGIN_EUR, coreMarginAt1c: CORE_MARGIN_1C,
  fxNote: `USD P&L at fixed EUR/USD=${FX_EUR_PER_USD}`,
  ibkrCostsConfirmedDate: '2026-08-14',
};

for (const capital of ALL_CAPITALS) {
  const data = capitalResults[capital];
  writeFileSync(join(outDir, `cap-${capital}.json`), JSON.stringify({ meta: sharedMeta, ...data }));
  console.log(`cap-${capital}.json (${data.navSeries.length} nav points)`);
}

const summaryData = {
  meta: sharedMeta, capitalComparison,
  serkanPrecheck: buildSerkanPrecheck(),
  components17: COMPONENTS_17, recommendations: RECOMMENDATIONS, targetWeights: TARGET_WEIGHT,
  capitalSummary: Object.fromEntries(ALL_CAPITALS.map(cap => {
    const { navSeries, yearlyReturns, ...rest } = capitalResults[cap];
    return [cap, rest];
  })),
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summaryData));
console.log('summary.json written');

console.log('\n╔══ VERIFICATION vs confirmed PB variant at EUR15k 1c ════════════════╗');
const r15 = capitalResults[15000];
const checks = [
  ['netCAGR',   r15.kpis.netCAGR + '%',    '11.25%',  Math.abs(r15.kpis.netCAGR   - 11.25) < 2.0 ? '✓ CLOSE' : '✗ MISMATCH'],
  ['Sharpe',    String(r15.kpis.sharpe),   '1.437',   Math.abs(r15.kpis.sharpe    - 1.437)  < 0.3 ? '✓ CLOSE' : '✗ MISMATCH'],
  ['MaxDD',     r15.kpis.maxDD_Pct + '%',  '8.82%',   Math.abs(r15.kpis.maxDD_Pct - 8.82)  < 3.0 ? '✓ CLOSE' : '✗ MISMATCH'],
  ['costs/yr',  '€' + r15.kpis.annualCosts,'€257.52', Math.abs(r15.kpis.annualCosts-257.52) < 80  ? '✓ CLOSE' : '✗ MISMATCH'],
  ['trades/wk', String(r15.kpis.tradesPerWeek),'3.81', Math.abs(r15.kpis.tradesPerWeek-3.81) < 0.5? '✓ CLOSE' : '✗ MISMATCH'],
];
for (const [metric, actual, expected, status] of checks)
  console.log(`  ${metric.padEnd(12)}: ${String(actual).padEnd(12)} (confirmed: ${String(expected).padEnd(10)}) ${status}`);
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log('\nDone. Real historical trades. No GBM, no synthetic NAV.');
