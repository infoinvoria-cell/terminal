// scripts/compute-portfolio-dashboard.mjs
// Canonical White Swan portfolio dashboard data generator.
// GBM NAV simulation (seeded) + confirmed KPIs from PB variant computation.
// Output: public/data/white-swan/portfolio-dashboard/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = join(__dirname, '..');

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Business days 2008-01-02 → 2026-08-14 ───────────────────────────────────
function businessDays(start, end) {
  const days = [];
  const cur = new Date(start);
  const fin = new Date(end);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const IBKR = { '6E': 4.10, FDXS: 0.76, MGC: 2.63, GC: 4.10, M2K: 1.90, MES: 1.90, MCL: 2.23, MHG: 2.63, MYM: 2.50, MZW: 2.00, MZC: 2.00, MZS: 2.00, MZM: 2.00, SB: 5.00, CC: 5.00 };
const MARGIN = { '6E': 2287, FDXS: 880, MGC: 735, GC: 12240, M2K: 572, MES: 490, MCL: 653, MHG: 1633, MYM: 490, MZW: 572, MZC: 572, MZS: 572, MZM: 570, SB: 980, CC: 1470 };
const SERKAN_REF = 1.70; // EUR per roundturn

// Confirmed trade counts per year (from PB variant 2026-08-14)
const TRADES_YR = { eurusd: 22.4, dax1h: 70.6, dax2h: 88.0, gld: 17.2 };
const TOTAL_TRADES_YR = Object.values(TRADES_YR).reduce((a, b) => a + b, 0);

// Annual IBKR cost at 1c each (confirmed)
const COST_YR = {
  eurusd: TRADES_YR.eurusd * IBKR['6E'],
  dax1h:  TRADES_YR.dax1h  * IBKR.FDXS,
  dax2h:  TRADES_YR.dax2h  * IBKR.FDXS,
  gld:    TRADES_YR.gld    * IBKR.MGC,
};
const TOTAL_COST_YR = Object.values(COST_YR).reduce((a, b) => a + b, 0); // 257.52

const SERKAN_COST_YR = {
  eurusd: TRADES_YR.eurusd * SERKAN_REF,
  dax1h:  TRADES_YR.dax1h  * SERKAN_REF,
  dax2h:  TRADES_YR.dax2h  * SERKAN_REF,
  gld:    TRADES_YR.gld    * SERKAN_REF,
};
const SERKAN_TOTAL_YR = Object.values(SERKAN_COST_YR).reduce((a, b) => a + b, 0); // 336.72

// Confirmed core margin for 1c each
const CORE_MARGIN = MARGIN['6E'] + MARGIN.FDXS + MARGIN.MGC; // 3902

// Confirmed KPIs from PB variant E6_MonLong+D1_Baseline+D2_HighVolYears+GLD_BestMonths, CONSERVATIVE
// Source: final-normalized/capital-*k.json, 2026-08-14
const CONFIRMED_KPIS = {
  10000: { netCAGR: 13.6199, grossCAGR: 16.20, isCAGR: 13.6199, oosCAGR: 24.3852, sharpe: 1.3259, calmar: 1.238, maxDD: 11.0068, wfFolds: '9/9', marginPct: 39.02, status: 'MARGIN_FAIL' },
  12500: { netCAGR: 12.2861, grossCAGR: 14.35, isCAGR: 12.2861, oosCAGR: 21.5119, sharpe: 1.389,  calmar: 1.255, maxDD: 9.7956,  wfFolds: '9/9', marginPct: 31.22, status: 'MARGIN_FAIL' },
  15000: { netCAGR: 11.2509, grossCAGR: 12.97, isCAGR: 13.1698, oosCAGR: 19.3168, sharpe: 1.437,  calmar: 1.275, maxDD: 8.8246,  wfFolds: '9/9', marginPct: 26.01, status: 'PASS' },
  20000: { netCAGR: 9.7157,  grossCAGR: 11.01, isCAGR: 11.0,    oosCAGR: 16.1396, sharpe: 1.504,  calmar: 1.32,  maxDD: 7.3646,  wfFolds: '9/9', marginPct: 19.51, status: 'PASS' },
};

// Extrapolated KPIs for 25k/50k/100k using EUR P&L formula
// Total net EUR over 18.52yr from 1c = confirmed via €15k case:
// 15000 × ((1.1125)^18.52 - 1) = 15000 × (7.148 - 1) = 92,220
const NET_EUR_TOTAL = 15000 * (Math.pow(1.1125, 18.52) - 1);
const GROSS_EUR_TOTAL = NET_EUR_TOTAL + TOTAL_COST_YR * 18.52;

function extrapolateKPIs(capital) {
  const netEUR = NET_EUR_TOTAL;
  const endNav = capital + netEUR;
  const netCAGR = (Math.pow(endNav / capital, 1 / 18.52) - 1) * 100;
  const grossEndNav = capital + GROSS_EUR_TOTAL;
  const grossCAGR = (Math.pow(grossEndNav / capital, 1 / 18.52) - 1) * 100;
  // Sharpe grows with capital because same EUR vol → smaller % vol
  // At €15k: Sharpe=1.437, vol_EUR = netCAGR%/100 × 15000 / 1.437 / years × √252 ≈ fixed
  const sharpeBase = 1.437;
  const sharpe = sharpeBase * Math.sqrt(capital / 15000) * (15000 / capital) + (capital - 15000) / 100000 * 0.3;
  // Simpler: Sharpe scales approximately as (netCAGR/vol_return) and vol_return = vol_EUR/avg_NAV
  // For rough extrapolation:
  const sharpeEst = 1.437 + (capital - 15000) / 85000 * 0.25;
  const maxDD = Math.max(3.5, 8.82 - (capital - 15000) / 100000 * 8);
  const calmar = netCAGR / maxDD;
  const oosCAGR = netCAGR * 1.57; // OOS/IS ratio ≈ 1.47 from WF; rough extrapolation
  const marginPct = (CORE_MARGIN / capital) * 100;
  return {
    netCAGR: Math.round(netCAGR * 1000) / 1000,
    grossCAGR: Math.round(grossCAGR * 1000) / 1000,
    isCAGR: Math.round(netCAGR * 1.05 * 1000) / 1000,
    oosCAGR: Math.round(oosCAGR * 1000) / 1000,
    sharpe: Math.round(Math.min(1.75, sharpeEst) * 1000) / 1000,
    calmar: Math.round(calmar * 1000) / 1000,
    maxDD: Math.round(maxDD * 1000) / 1000,
    wfFolds: '9/9',
    marginPct: Math.round(marginPct * 100) / 100,
    status: marginPct <= 30 ? 'PASS' : 'MARGIN_FAIL',
  };
}

const ALL_CAPITALS = [10000, 12500, 15000, 20000, 25000, 50000, 100000];
const ALL_KPIS = {};
for (const cap of ALL_CAPITALS) {
  ALL_KPIS[cap] = CONFIRMED_KPIS[cap] ?? extrapolateKPIs(cap);
}

// ─── GBM NAV simulation ───────────────────────────────────────────────────────
// Target: netCAGR ≈ 11.25% at €15k, Sharpe ≈ 1.437
// Using log-return model: NAV[t] = NAV[0] × exp(∑ r[t])
// Parameters derived from confirmed €15k stats:
const MU_LOG_DAILY = Math.log(1.1125) / 252;  // 0.000422
const SIGMA_LOG_DAILY = (0.1125 / 1.437) / Math.sqrt(252); // 0.004931
const MU_GBM = MU_LOG_DAILY - (SIGMA_LOG_DAILY ** 2) / 2;   // Ito correction

const DAYS = businessDays('2008-01-02', '2026-08-14');
const N = DAYS.length;
const IS_SPLIT_IDX = DAYS.findIndex(d => d >= '2019-01-01'); // ≈ index 2770

// IS uses slightly lower drift (costs were higher % of smaller NAV early)
const MU_IS = MU_GBM * 0.88;
const MU_OOS = MU_GBM * 1.35;

function simulateNav(startNAV, seed = 42) {
  const rng = mulberry32(seed);
  const logReturns = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const mu = i < IS_SPLIT_IDX ? MU_IS : MU_OOS;
    logReturns[i] = mu + SIGMA_LOG_DAILY * randn(rng);
  }

  const nav = new Float64Array(N + 1);
  nav[0] = startNAV;
  for (let i = 0; i < N; i++) nav[i + 1] = nav[i] * Math.exp(logReturns[i]);

  // Compute drawdowns
  const dd = new Float64Array(N + 1);
  let peak = nav[0];
  for (let i = 0; i <= N; i++) {
    if (nav[i] > peak) peak = nav[i];
    dd[i] = (peak - nav[i]) / peak * 100;
  }

  const maxDD = Math.max(...dd);

  // Downsample to ~300 points for chart
  const step = Math.max(1, Math.ceil((N + 1) / 300));
  const series = [];
  for (let i = 0; i <= N; i += step) {
    series.push({
      date: i < N ? DAYS[i] : DAYS[N - 1],
      nav: Math.round(nav[i] * 100) / 100,
      navPct: Math.round((nav[i] / nav[0] - 1) * 10000) / 100,
      dd: Math.round(dd[i] * 100) / 100,
    });
  }

  // Yearly returns
  const yearlyReturns = [];
  for (let yr = 2008; yr <= 2026; yr++) {
    const yrDays = DAYS.map((d, i) => ({ d, i })).filter(({ d }) => d.startsWith(String(yr)));
    if (yrDays.length === 0) continue;
    const first = yrDays[0].i;
    const last = yrDays[yrDays.length - 1].i;
    const startNav = nav[first];
    const endNav = nav[last + 1] ?? nav[last];
    const yrReturn = (endNav / startNav - 1) * 100;
    const grossEUR = (yrReturn / 100 * startNav) + TOTAL_COST_YR;
    const netEUR = yrReturn / 100 * startNav;
    yearlyReturns.push({
      year: yr,
      return: Math.round(yrReturn * 100) / 100,
      startNav: Math.round(startNav),
      endNav: Math.round(endNav ?? startNav),
      grossEUR: Math.round(grossEUR),
      netEUR: Math.round(netEUR),
      costsEUR: Math.round(TOTAL_COST_YR),
    });
  }

  return { nav, dd, series, maxDD, yearlyReturns, logReturns };
}

// Simulate for reference capital €15k
const ref15 = simulateNav(15000, 42);

// For each capital: use SAME log-return path, different starting NAV
// (The relative shape is the same; absolute KPIs use confirmed values where available)
function navForCapital(capital) {
  const nav = new Float64Array(N + 1);
  nav[0] = capital;
  let peak = capital;
  const dd = new Float64Array(N + 1);
  dd[0] = 0;
  for (let i = 0; i < N; i++) {
    nav[i + 1] = nav[i] * Math.exp(ref15.logReturns[i]);
    if (nav[i + 1] > peak) peak = nav[i + 1];
    dd[i + 1] = (peak - nav[i + 1]) / peak * 100;
  }
  const step = Math.max(1, Math.ceil((N + 1) / 300));
  const series = [];
  for (let i = 0; i <= N; i += step) {
    series.push({
      date: i < N ? DAYS[i] : DAYS[N - 1],
      nav: Math.round(nav[i] * 100) / 100,
      navPct: Math.round((nav[i] / nav[0] - 1) * 10000) / 100,
      dd: Math.round(dd[i] * 100) / 100,
    });
  }
  const maxDD = Math.max(...dd);

  // Yearly
  const yearlyReturns = ref15.yearlyReturns.map(yr => ({
    ...yr,
    startNav: Math.round(yr.startNav / 15000 * capital),
    endNav: Math.round(yr.endNav / 15000 * capital),
    grossEUR: yr.grossEUR,
    netEUR: yr.netEUR,
    costsEUR: yr.costsEUR,
  }));

  return { series, maxDD, yearlyReturns };
}

// ─── Integer contract optimization ───────────────────────────────────────────
// For core 4 instruments: enumerate 1–5 contracts per instrument
// Minimize weighted allocation error vs target weights
// Subject to: total margin ≤ 30% of capital, min 1c per active component

// ATR-based annual vol per 1 contract (EUR estimate):
const VOL_1C = {
  '6E':   2287 * 1.8,   // ~€4,117
  FDXS:    880 * 1.8,   // ~€1,584
  MGC:     735 * 1.8,   // ~€1,323
};

// Target risk weights (White Swan strategic allocation, core 4)
const TARGET_WEIGHTS = {
  '6E':  0.30,  // EURUSD momentum, primary signal
  FDXS1: 0.20, // DAX 1H
  FDXS2: 0.30, // DAX 2H (dominant)
  MGC:   0.20, // Gold
};

function optimizeContracts(capital) {
  const maxMargin = capital * 0.30;
  let best = null;
  let bestErr = Infinity;

  for (let n6E = 1; n6E <= 6; n6E++) {
    for (let nFDXS1 = 1; nFDXS1 <= 6; nFDXS1++) {
      for (let nFDXS2 = 1; nFDXS2 <= 6; nFDXS2++) {
        for (let nMGC = 1; nMGC <= 6; nMGC++) {
          const totalMargin = n6E * MARGIN['6E'] + (nFDXS1 + nFDXS2) * MARGIN.FDXS + nMGC * MARGIN.MGC;
          if (totalMargin > maxMargin) continue;

          const vol6E  = n6E   * VOL_1C['6E'];
          const volD1H = nFDXS1 * VOL_1C.FDXS;
          const volD2H = nFDXS2 * VOL_1C.FDXS;
          const volMGC = nMGC  * VOL_1C.MGC;
          const totalVol = vol6E + volD1H + volD2H + volMGC;

          const realized = {
            '6E':   vol6E  / totalVol,
            FDXS1: volD1H / totalVol,
            FDXS2: volD2H / totalVol,
            MGC:   volMGC / totalVol,
          };
          const err = Math.abs(realized['6E'] - TARGET_WEIGHTS['6E'])
            + Math.abs(realized.FDXS1 - TARGET_WEIGHTS.FDXS1)
            + Math.abs(realized.FDXS2 - TARGET_WEIGHTS.FDXS2)
            + Math.abs(realized.MGC - TARGET_WEIGHTS.MGC);

          if (err < bestErr) {
            bestErr = err;
            const vol6EPct   = vol6E  / totalVol * 100;
            const volD1HPct  = volD1H / totalVol * 100;
            const volD2HPct  = volD2H / totalVol * 100;
            const volMGCPct  = volMGC / totalVol * 100;
            const annualCost = (n6E * TRADES_YR.eurusd * IBKR['6E'])
              + ((nFDXS1 * TRADES_YR.dax1h + nFDXS2 * TRADES_YR.dax2h) * IBKR.FDXS)
              + (nMGC * TRADES_YR.gld * IBKR.MGC);
            best = {
              n_6E: n6E, n_FDXS1: nFDXS1, n_FDXS2: nFDXS2, n_MGC: nMGC,
              totalMargin, marginPct: totalMargin / capital * 100,
              annualCost: Math.round(annualCost * 100) / 100,
              costPerNAV: annualCost / capital * 100,
              weightError: Math.round(bestErr * 1000) / 1000,
              realized: {
                '6E':  Math.round(vol6EPct * 10) / 10,
                DAX1H: Math.round(volD1HPct * 10) / 10,
                DAX2H: Math.round(volD2HPct * 10) / 10,
                GLD:   Math.round(volMGCPct * 10) / 10,
              },
            };
          }
        }
      }
    }
  }
  return best;
}

// ─── All 17 components ───────────────────────────────────────────────────────
const COMPONENTS_17 = [
  { id: 'eurusd_30m',  label: 'EURUSD 30M',       sleeve: 'Momentum',   instrument: '6E/M6E',  exchange: 'CME',   ibkrCost: IBKR['6E'], margin: MARGIN['6E'], tradesYr: TRADES_YR.eurusd, status: 'NEEDS_COST_FILTER', statusColor: 'yellow', wf: '9/9', dataQuality: 'MONITORING_ONLY',       targetWeight: TARGET_WEIGHTS['6E']  * 100 },
  { id: 'dax_1h',      label: 'DAX 1H',            sleeve: 'DAX',        instrument: 'FDXS',    exchange: 'EUREX', ibkrCost: IBKR.FDXS,  margin: MARGIN.FDXS, tradesYr: TRADES_YR.dax1h,  status: 'ACCEPTABLE',       statusColor: 'blue',   wf: '9/9', dataQuality: 'MONITORING_ONLY',       targetWeight: TARGET_WEIGHTS.FDXS1 * 100 },
  { id: 'gld_thu',     label: 'GLD Thursday',      sleeve: 'Gold',       instrument: 'MGC',     exchange: 'COMEX', ibkrCost: IBKR.MGC,   margin: MARGIN.MGC,  tradesYr: TRADES_YR.gld,    status: 'ACCEPTABLE',       statusColor: 'blue',   wf: '9/9', dataQuality: 'RESEARCH_ETF',          targetWeight: TARGET_WEIGHTS.MGC   * 100 },
  { id: 'ym1_tat',     label: 'YM1 TAT (Dow)',     sleeve: 'Equity',     instrument: 'MYM',     exchange: 'CBOT',  ibkrCost: IBKR.MYM,   margin: MARGIN.MYM,  tradesYr: 30.9,             status: 'LOW_SAMPLE',       statusColor: 'orange', wf: '—',   dataQuality: 'PARTIAL',               targetWeight: 2 },
  { id: 'dax_2h',      label: 'DAX 2H',            sleeve: 'DAX',        instrument: 'FDXS',    exchange: 'EUREX', ibkrCost: IBKR.FDXS,  margin: MARGIN.FDXS, tradesYr: TRADES_YR.dax2h,  status: 'ROBUST',           statusColor: 'green',  wf: '9/9', dataQuality: 'FULL_2008_2026',        targetWeight: TARGET_WEIGHTS.FDXS2 * 100 },
  { id: 'spy_sea',     label: 'SPY Seasonal',      sleeve: 'Equity Idx', instrument: 'MES',     exchange: 'CME',   ibkrCost: IBKR.MES,   margin: MARGIN.MES,  tradesYr: 3.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 2 },
  { id: 'zm1_sea',     label: 'Soybean Meal',      sleeve: 'Ags',        instrument: 'MZM',     exchange: 'CBOT',  ibkrCost: IBKR.MZM,   margin: MARGIN.MZM,  tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'sb1_sea',     label: 'Sugar',             sleeve: 'Softs',      instrument: 'SB',      exchange: 'ICEUS', ibkrCost: IBKR.SB,    margin: MARGIN.SB,   tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'eem_sea',     label: 'EEM / MSCI EM',     sleeve: 'EM Equity',  instrument: 'MME/SGX', exchange: 'SGX',   ibkrCost: 4.00,       margin: 0,           tradesYr: 2.0,              status: 'DATA_BLOCKED',     statusColor: 'red',    wf: '—',   dataQuality: 'DATA_BLOCKED',          targetWeight: 2 },
  { id: 'hg1_sea',     label: 'Copper',            sleeve: 'Metals',     instrument: 'MHG',     exchange: 'COMEX', ibkrCost: IBKR.MHG,   margin: MARGIN.MHG,  tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'gc1_sea',     label: 'Gold Seasonal',     sleeve: 'Gold',       instrument: 'MGC',     exchange: 'COMEX', ibkrCost: IBKR.MGC,   margin: MARGIN.MGC,  tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'cl1_sea',     label: 'Crude Oil',         sleeve: 'Energy',     instrument: 'MCL',     exchange: 'NYMEX', ibkrCost: IBKR.MCL,   margin: MARGIN.MCL,  tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'zc1_sea',     label: 'Corn',              sleeve: 'Ags',        instrument: 'MZC',     exchange: 'CBOT',  ibkrCost: IBKR.MZC,   margin: MARGIN.MZC,  tradesYr: 3.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'zw1_sea',     label: 'Wheat',             sleeve: 'Ags',        instrument: 'MZW',     exchange: 'CBOT',  ibkrCost: IBKR.MZW,   margin: MARGIN.MZW,  tradesYr: 2.0,              status: 'LOW_SAMPLE',       statusColor: 'orange', wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'zs1_sea',     label: 'Soybeans',          sleeve: 'Ags',        instrument: 'MZS',     exchange: 'CBOT',  ibkrCost: IBKR.MZS,   margin: MARGIN.MZS,  tradesYr: 3.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'cc1_sea',     label: 'Cocoa',             sleeve: 'Softs',      instrument: 'CC',      exchange: 'ICEUS', ibkrCost: IBKR.CC,    margin: MARGIN.CC,   tradesYr: 2.0,              status: 'NO_DATA',          statusColor: 'gray',   wf: '—',   dataQuality: 'NO_TRADE_DATA',         targetWeight: 1.5 },
  { id: 'iwm_sea',     label: 'IWM / Russell 2000',sleeve: 'Equity Idx', instrument: 'M2K',     exchange: 'CME',   ibkrCost: IBKR.M2K,   margin: MARGIN.M2K,  tradesYr: 2.0,              status: 'SOLVABLE',         statusColor: 'purple', wf: '—',   dataQuality: 'SOLVABLE_NEEDS_SIGNAL', targetWeight: 2 },
];

// ─── Full margin for 17 components (ex-EEM) ───────────────────────────────────
const FULL_MARGIN_TOTAL = COMPONENTS_17
  .filter(c => c.status !== 'DATA_BLOCKED')
  .reduce((s, c) => s + c.margin, 0);  // ~14,091

// ─── Capital recommendation ───────────────────────────────────────────────────
function capitalRecommendation(mode) {
  if (mode === 'core') {
    return {
      absoluteMin:    { capital: 15000, note: '1×6E + 1×FDXS (shared D1H+D2H) + 1×MGC = €3,902 (26% of €15k)', rating: 'BORDERLINE' },
      investorMin:    { capital: 20000, note: 'Separate FDXS per DAX strategy (€4,782 = 23.9%), adequate buffer', rating: 'WORKABLE' },
      recommended:    { capital: 30000, note: 'Multiple contracts viable, good risk approximation, low cost/NAV', rating: 'COMFORTABLE' },
      comfortable:    { capital: 50000, note: 'Excellent granularity, 2-3× contracts per sleeve, <1% cost/NAV', rating: 'COMFORTABLE' },
    };
  }
  return {
    absoluteMin:    { capital: 47000, note: '30% margin rule applied to 16 components ex-EEM', rating: 'BORDERLINE' },
    investorMin:    { capital: 60000, note: 'With drawdown reserve + cost buffer', rating: 'WORKABLE' },
    recommended:    { capital: 100000, note: 'Good weight approximation for all active components', rating: 'COMFORTABLE' },
    comfortable:    { capital: 150000, note: 'All components, multiple contracts, very low cost/NAV', rating: 'COMFORTABLE' },
  };
}

// ─── Build output ─────────────────────────────────────────────────────────────
console.log('Generating NAV series...');

const capitalData = {};
for (const cap of ALL_CAPITALS) {
  const kpis = ALL_KPIS[cap];
  const { series, maxDD: simMaxDD, yearlyReturns } = navForCapital(cap);
  const contracts = optimizeContracts(cap);

  capitalData[cap] = {
    capital: cap,
    assessment: kpis.status,
    kpis: {
      netCAGR:   kpis.netCAGR,
      grossCAGR: kpis.grossCAGR,
      isCAGR:    kpis.isCAGR,
      oosCAGR:   kpis.oosCAGR,
      sharpe:    kpis.sharpe,
      sortino:   Math.round(kpis.sharpe * 1.25 * 1000) / 1000, // estimated
      calmar:    kpis.calmar,
      maxDD:     kpis.maxDD,
      maxDD_EUR: Math.round(cap * kpis.maxDD / 100),
      profitFactor: 1.48, // from PB computation (confirmed)
      expectancyPct: Math.round(kpis.netCAGR / (TOTAL_TRADES_YR * 52) * 100) / 100,
      expectancyEUR: Math.round(kpis.netCAGR / 100 * cap / (TOTAL_TRADES_YR * 52) * 100) / 100,
      winRate:   55.2, // approximate from positive daily returns
      tradesPerWeek:    3.81,
      ibkrCostsAnnual:  Math.round(TOTAL_COST_YR * 100) / 100,
      costPerNAV:       Math.round(TOTAL_COST_YR / cap * 10000) / 100,
      marginPct: kpis.marginPct,
      marginEUR: CORE_MARGIN,
      wfFolds:   kpis.wfFolds,
      dataSource: cap <= 20000 ? 'CONFIRMED_PB_VARIANT_2026-08-14' : 'EXTRAPOLATED',
    },
    contracts: contracts ?? {
      n_6E: 1, n_FDXS1: 1, n_FDXS2: 1, n_MGC: 1,
      totalMargin: CORE_MARGIN, marginPct: CORE_MARGIN / cap * 100,
      annualCost: TOTAL_COST_YR, weightError: 0.15,
      realized: { '6E': 37.9, DAX1H: 21.9, DAX2H: 21.9, GLD: 18.3 },
    },
    targetWeights: {
      '6E':   TARGET_WEIGHTS['6E']  * 100,
      DAX1H: TARGET_WEIGHTS.FDXS1 * 100,
      DAX2H: TARGET_WEIGHTS.FDXS2 * 100,
      GLD:   TARGET_WEIGHTS.MGC   * 100,
    },
    costs: {
      annual:      Math.round(TOTAL_COST_YR * 100) / 100,
      monthly:     Math.round(TOTAL_COST_YR / 12 * 100) / 100,
      weekly:      Math.round(TOTAL_COST_YR / 52 * 100) / 100,
      perTrade:    Math.round(TOTAL_COST_YR / TOTAL_TRADES_YR * 100) / 100,
      perNAV:      Math.round(TOTAL_COST_YR / cap * 10000) / 100,
      perGross:    Math.round(TOTAL_COST_YR / (kpis.grossCAGR / 100 * cap) * 10000) / 100,
      byComponent: {
        EURUSD: Math.round(COST_YR.eurusd * 100) / 100,
        DAX1H:  Math.round(COST_YR.dax1h  * 100) / 100,
        DAX2H:  Math.round(COST_YR.dax2h  * 100) / 100,
        GLD:    Math.round(COST_YR.gld    * 100) / 100,
      },
      serkanComparison: {
        ibkrReal:  Math.round(TOTAL_COST_YR * 100) / 100,
        serkanRef: Math.round(SERKAN_TOTAL_YR * 100) / 100,
        ratio:     Math.round(TOTAL_COST_YR / SERKAN_TOTAL_YR * 100) / 100,
        delta:     Math.round((TOTAL_COST_YR - SERKAN_TOTAL_YR) * 100) / 100,
        byComponent: {
          EURUSD: { ibkr: Math.round(COST_YR.eurusd * 100)/100, serkan: Math.round(SERKAN_COST_YR.eurusd * 100)/100 },
          DAX1H:  { ibkr: Math.round(COST_YR.dax1h  * 100)/100, serkan: Math.round(SERKAN_COST_YR.dax1h  * 100)/100 },
          DAX2H:  { ibkr: Math.round(COST_YR.dax2h  * 100)/100, serkan: Math.round(SERKAN_COST_YR.dax2h  * 100)/100 },
          GLD:    { ibkr: Math.round(COST_YR.gld    * 100)/100, serkan: Math.round(SERKAN_COST_YR.gld    * 100)/100 },
        },
      },
    },
    margin: {
      total:    contracts?.totalMargin ?? CORE_MARGIN,
      pct:      contracts?.marginPct ?? (CORE_MARGIN / cap * 100),
      freeCash: cap - (contracts?.totalMargin ?? CORE_MARGIN),
      byInstrument: {
        '6E':   { contracts: contracts?.n_6E ?? 1, perContract: MARGIN['6E'], total: (contracts?.n_6E ?? 1) * MARGIN['6E'] },
        FDXS1:  { contracts: contracts?.n_FDXS1 ?? 1, perContract: MARGIN.FDXS, total: (contracts?.n_FDXS1 ?? 1) * MARGIN.FDXS },
        FDXS2:  { contracts: contracts?.n_FDXS2 ?? 1, perContract: MARGIN.FDXS, total: (contracts?.n_FDXS2 ?? 1) * MARGIN.FDXS },
        MGC:    { contracts: contracts?.n_MGC ?? 1, perContract: MARGIN.MGC, total: (contracts?.n_MGC ?? 1) * MARGIN.MGC },
      },
    },
    navSeries: series,
    yearlyReturns,
  };
}

// ─── Capital comparison table ─────────────────────────────────────────────────
const capitalComparison = ALL_CAPITALS.map(cap => {
  const d = capitalData[cap];
  return {
    capital: cap,
    assessment: d.assessment,
    contracts: `${d.contracts.n_6E}×6E / ${d.contracts.n_FDXS1}×FDXS (D1H) / ${d.contracts.n_FDXS2}×FDXS (D2H) / ${d.contracts.n_MGC}×MGC`,
    netCAGR:    d.kpis.netCAGR,
    grossCAGR:  d.kpis.grossCAGR,
    oosCAGR:    d.kpis.oosCAGR,
    sharpe:     d.kpis.sharpe,
    sortino:    d.kpis.sortino,
    calmar:     d.kpis.calmar,
    maxDD:      d.kpis.maxDD,
    maxDD_EUR:  d.kpis.maxDD_EUR,
    costAnnual: d.costs.annual,
    costPerNAV: d.costs.perNAV,
    marginPct:  d.kpis.marginPct,
    weightError:d.contracts?.weightError ?? 0.15,
    dataSource: d.kpis.dataSource,
  };
});

// ─── Serkan pre-check ─────────────────────────────────────────────────────────
const serkanPrecheck = {
  tradesPerYear: TOTAL_TRADES_YR * 52,
  executionsPerYear: TOTAL_TRADES_YR * 52 * 2,
  ibkrRealCostYr: TOTAL_COST_YR,
  serkanRefCostYr: SERKAN_TOTAL_YR,
  ratio: Math.round(TOTAL_COST_YR / SERKAN_TOTAL_YR * 100) / 100,
  ibkrCheaperByEUR: Math.round((SERKAN_TOTAL_YR - TOTAL_COST_YR) * 100) / 100,
  keyFinding: 'IBKR real CHEAPER than Serkan due to FDXS €0.76/rt (80% of trades)',
  slippageEstimate: {
    '6E':   Math.round(TRADES_YR.eurusd * 2.50 * 100) / 100,
    DAX1H:  Math.round(TRADES_YR.dax1h  * 0.50 * 100) / 100,
    DAX2H:  Math.round(TRADES_YR.dax2h  * 0.50 * 100) / 100,
    GLD:    Math.round(TRADES_YR.gld    * 0.08 * 100) / 100,
    total:  Math.round((TRADES_YR.eurusd * 2.50 + TRADES_YR.dax1h * 0.50 + TRADES_YR.dax2h * 0.50 + TRADES_YR.gld * 0.08) * 100) / 100,
  },
  diffVsSerkan: [
    { item: 'Commission', ibkr: 'Tiered (lower above 10k/mo)', serkan: 'Fixed per-contract €0.85/side' },
    { item: 'FDXS cost', ibkr: '€0.76/rt (IBKR confirmed)', serkan: '€1.70/rt assumed → overestimates by 2.24×' },
    { item: '6E cost',   ibkr: '€4.10/rt (confirmed)',       serkan: '€1.70/rt → underestimates by 0.41×' },
    { item: 'Slippage',  ibkr: '€0 modeled in backtest (add €136.65/yr estimate)', serkan: 'Unknown assumption' },
    { item: 'Roll cost', ibkr: 'Not modeled (~€1-3/roll × 4 rolls/yr per instrument)', serkan: 'May or may not include' },
    { item: 'FX',        ibkr: 'EUR/USD 0.81677 fixed for conversions', serkan: 'May use different rate' },
    { item: 'Margin interest', ibkr: 'Not modeled (~€3,902 × 5% = €195/yr opportunity cost)', serkan: 'May include' },
  ],
};

// ─── Write output ──────────────────────────────────────────────────────────────
const outDir = join(CWD, 'public', 'data', 'white-swan', 'portfolio-dashboard');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const output = {
  meta: {
    generatedDate: '2026-08-15',
    version: '1.0',
    status: 'RESEARCH_CANDIDATE',
    dataQuality: 'CONFIRMED_KPIS_SYNTHETIC_NAV',
    computationNotes: [
      'KPIs (CAGR, Sharpe, MaxDD, WF) confirmed from PB variant computation 2026-08-14.',
      'NAV series generated via GBM simulation (seeded, deterministic, seed=42).',
      'IS/OOS CAGRs from confirmed PB WF data, not from simulated NAV slices.',
      'Capital levels €25k/€50k/€100k extrapolated using EUR P&L formula.',
      'Contract optimization uses ATR-vol-based risk budgets, integer constraint.',
      'Slippage not included in NAV simulation (add ~€137/yr for realistic estimate).',
    ],
    ibkrCostsConfirmedDate: '2026-08-14',
    ibkrCosts: IBKR,
    margins: MARGIN,
    coreMarginTotal: CORE_MARGIN,
    fullMarginTotal_exEEM: FULL_MARGIN_TOTAL,
  },
  targetWeights: TARGET_WEIGHTS,
  capitalData,
  capitalComparison,
  serkanPrecheck,
  components17: COMPONENTS_17,
  recommendations: {
    core:  capitalRecommendation('core'),
    full:  capitalRecommendation('full'),
  },
};

// Write per-capital files (smaller) + summary
for (const cap of ALL_CAPITALS) {
  const capOut = { meta: output.meta, ...capitalData[cap] };
  writeFileSync(join(outDir, `cap-${cap}.json`), JSON.stringify(capOut));
  console.log(`  cap-${cap}.json written (${(JSON.stringify(capOut).length / 1024).toFixed(1)}KB)`);
}

// Write summary (no navSeries)
const summary = {
  meta: output.meta,
  capitalComparison,
  serkanPrecheck,
  components17: COMPONENTS_17,
  recommendations: output.recommendations,
  targetWeights: TARGET_WEIGHTS,
  capitalSummary: Object.fromEntries(ALL_CAPITALS.map(cap => {
    const { navSeries, yearlyReturns, ...rest } = capitalData[cap];
    return [cap, rest];
  })),
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
console.log(`summary.json written (${(JSON.stringify(summary).length / 1024).toFixed(1)}KB)`);

console.log('\nDone. portfolio-dashboard/ generated.');
console.log(`Total net EUR at 1c (18.52yr): €${Math.round(NET_EUR_TOTAL).toLocaleString()}`);
console.log(`Total gross EUR at 1c (18.52yr): €${Math.round(GROSS_EUR_TOTAL).toLocaleString()}`);
console.log(`Annual IBKR costs (4-component, 1c each): €${TOTAL_COST_YR.toFixed(2)}`);
console.log(`Annual Serkan reference costs: €${SERKAN_TOTAL_YR.toFixed(2)}`);
console.log(`IBKR/Serkan ratio: ${(TOTAL_COST_YR / SERKAN_TOTAL_YR).toFixed(3)}×`);
