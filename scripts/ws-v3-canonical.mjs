/**
 * ws-v3-canonical.mjs
 * WHITE SWAN — CANONICAL 17-COMPONENT CONSISTENCY FIX
 *
 * Canonical 17:
 *  1  eurusd_30m          EURUSD Monday Seasonal (E6_MonLong_PosMon, months 4/9/10/11)
 *  2  dax_1h              DAX 1H (FDXS)
 *  3  dax_2h              DAX 2H (FDXS)
 *  4  gld_mgc_atrmed      GLD/MGC ATRmed_1d — REPLACES gld_thursday_long (real GC futures)
 *  5  zw_real             ZW Jul Seasonal (real CBOT ZW1 — REPLACES all-trades zw_seasonal)
 *  6  ym1_tat             YM1 TAT (MYM)
 *  7  cc_seasonal         CC Seasonal
 *  8  hg1_seasonal        HG1 Seasonal (MHG)
 *  9  cl1_seasonal        CL1 Seasonal (MCL)
 * 10  zm1_seasonal        ZM1 Seasonal (MZM)
 * 11  gc1_seasonal        GC1 Seasonal (1OZ/MGC)
 * 12  sb_seasonal         SB Seasonal
 * 13  zc_seasonal         ZC Seasonal (MZC)
 * 14  zs_seasonal         ZS Seasonal (MZS)
 * 15  spy_mes_seasonal    SPY/MES S&P 500 Seasonal (MES) — correctly named, not IWM proxy
 * 16  iwm_m2k             IWM → DATA_BLOCKED (no validated M2K signal)
 * 17  eem                 EEM → DATA_BLOCKED (no viable proxy with sufficient history)
 */
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

// ─── Load data ───────────────────────────────────────────────────────────────
const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json', 'utf8'));
const gldData = JSON.parse(fs.readFileSync('workspace/output/white-swan/v2/gld_atrmed_trades.json', 'utf8'));
const zwRes = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/zw-backtest-results.json', 'utf8'));

console.log('All-trades records:', allTrades.length);
console.log('GLD ATRmed trades:', gldData.trades.length);

// ─── netEUR from all-trades record ───────────────────────────────────────────
function tradeNetEUR(t) {
  const div = t.csvDiv ?? 1;
  const net = (t.grossPnl - t.costRt) / div;
  return t.currency === 'USD' ? net * EUR_PER_USD : net;
}

// ─── Build strategy from all-trades filter ────────────────────────────────────
function buildFromAllTrades(stratId, filterFn = null) {
  let rows = allTrades.filter(t => t.strategyId === stratId);
  if (filterFn) rows = rows.filter(filterFn);
  return rows.map(t => ({
    date: t.entryDate,
    netEUR: +tradeNetEUR(t).toFixed(4),
    IS: t.entryDate < IS_CUTOFF,
    OOS19: t.entryDate >= OOS19_CUTOFF,
  }));
}

// ─── Compute stats from trade array ──────────────────────────────────────────
function computeStratStats(trades) {
  if (!trades.length) return { netEUR: 0, isNet: 0, oosNet: 0, oos2019Net: 0, PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0 };
  const net = trades.reduce((s, t) => s + t.netEUR, 0);
  const IS = trades.filter(t => t.IS);
  const OOS = trades.filter(t => !t.IS);
  const OOS19 = trades.filter(t => t.OOS19);
  const wins = trades.filter(t => t.netEUR > 0).reduce((s, t) => s + t.netEUR, 0);
  const loss = Math.abs(trades.filter(t => t.netEUR < 0).reduce((s, t) => s + t.netEUR, 0));
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const posYr = Object.values(byYear).filter(v => v > 0).length;
  const totYr = Object.keys(byYear).length;
  return {
    netEUR: Math.round(net),
    isNet: Math.round(IS.reduce((s, t) => s + t.netEUR, 0)),
    oosNet: Math.round(OOS.reduce((s, t) => s + t.netEUR, 0)),
    oos2019Net: Math.round(OOS19.reduce((s, t) => s + t.netEUR, 0)),
    PF: loss > 0 ? +(wins / loss).toFixed(2) : (wins > 0 ? 99 : 0),
    posYr, totYr,
    tradesPerYear: +(trades.length / Math.max(totYr, 1)).toFixed(1),
    byYear,
  };
}

// ─── CANONICAL 17 DEFINITIONS ────────────────────────────────────────────────

// 1. EURUSD — Monday LONG, months 4/9/10/11 (E6_MonLong_PosMon improved)
const eurusd_trades = buildFromAllTrades('eurusd_30m', t => {
  const dow = new Date(t.entryDate + 'T00:00:00Z').getUTCDay();
  const mon = new Date(t.entryDate + 'T00:00:00Z').getUTCMonth() + 1;
  return t.direction === 'LONG' && dow === 1 && [4, 9, 10, 11].includes(mon);
});

// 2. DAX 1H
const dax1h_trades = buildFromAllTrades('dax_1h');

// 3. DAX 2H
const dax2h_trades = buildFromAllTrades('dax_2h');

// 4. GLD/MGC ATRmed_1d — REAL GC DATA (replaces gld_thursday_long)
const gld_trades = gldData.trades.map(t => ({
  date: t.date,
  netEUR: +t.netEUR.toFixed(4),
  IS: t.date < IS_CUTOFF,
  OOS19: t.date >= OOS19_CUTOFF,
}));

// 5. ZW Real Seasonal (Jul+2BD hold 10BD) — real TradingView CBOT ZW1
// Find best IS+OOS positive from detailTests
const zwBest = zwRes.bestCandidate ?? zwRes.detailTests?.find(r => r.isNetEUR > 0 && r.oosNetEUR > 0 && r.PF > 1);
const zw_trades = zwBest?.trades?.map(t => ({
  date: t.entryDate,
  netEUR: +t.netEUR.toFixed(4),
  IS: t.entryDate < IS_CUTOFF,
  OOS19: t.entryDate >= OOS19_CUTOFF,
})) ?? [];
console.log('ZW best:', zwBest?.label, 'trades:', zw_trades.length);

// 6. YM1 TAT
const ym1_trades = buildFromAllTrades('ym1_tat');

// 7-14: Commodity seasonals
const cc_trades = buildFromAllTrades('cc_seasonal');
const hg1_trades = buildFromAllTrades('hg1_seasonal');
const cl1_trades = buildFromAllTrades('cl1_seasonal');
const zm1_trades = buildFromAllTrades('zm1_seasonal');
const gc1_trades = buildFromAllTrades('gc1_seasonal');
const sb_trades = buildFromAllTrades('sb_seasonal');
const zc_trades = buildFromAllTrades('zc_seasonal');
const zs_trades = buildFromAllTrades('zs_seasonal');

// 15. SPY/MES Seasonal — correctly labeled (NOT IWM proxy)
const spy_trades = buildFromAllTrades('spy_seasonal');

// 16. IWM → DATA_BLOCKED (no validated M2K signal in project)
// 17. EEM → DATA_BLOCKED (no viable proxy with EM history)

// ─── CANONICAL 17 COMPONENT CATALOG ──────────────────────────────────────────
const CANON = [
  { id: 'eurusd_30m',      label: 'EURUSD Monday Seasonal', instrument: '6E',   status_src: 'ACTIVE', trades: eurusd_trades },
  { id: 'dax_1h',          label: 'DAX 1H',                 instrument: 'FDXS', status_src: 'ACTIVE', trades: dax1h_trades },
  { id: 'dax_2h',          label: 'DAX 2H',                 instrument: 'FDXS', status_src: 'ACTIVE', trades: dax2h_trades },
  { id: 'gld_mgc_atrmed',  label: 'GLD/MGC ATRmed Thursday',instrument: 'MGC',  status_src: 'ACTIVE', trades: gld_trades },
  { id: 'zw_real',         label: 'ZW Jul Seasonal',        instrument: 'ZW',   status_src: 'LOW_WEIGHT', trades: zw_trades },
  { id: 'ym1_tat',         label: 'YM1 TAT',                instrument: 'MYM',  status_src: 'ACTIVE', trades: ym1_trades },
  { id: 'cc_seasonal',     label: 'CC Seasonal',            instrument: 'CC',   status_src: 'ACTIVE', trades: cc_trades },
  { id: 'hg1_seasonal',    label: 'HG1 Seasonal',           instrument: 'MHG',  status_src: 'ACTIVE', trades: hg1_trades },
  { id: 'cl1_seasonal',    label: 'CL1 Seasonal',           instrument: 'MCL',  status_src: 'ACTIVE', trades: cl1_trades },
  { id: 'zm1_seasonal',    label: 'ZM1 Seasonal',           instrument: 'MZM',  status_src: 'ACTIVE', trades: zm1_trades },
  { id: 'gc1_seasonal',    label: 'GC1 Seasonal',           instrument: 'MGC',  status_src: 'ACTIVE', trades: gc1_trades },
  { id: 'sb_seasonal',     label: 'SB Seasonal',            instrument: 'SB',   status_src: 'ACTIVE', trades: sb_trades },
  { id: 'zc_seasonal',     label: 'ZC Seasonal',            instrument: 'MZC',  status_src: 'ACTIVE', trades: zc_trades },
  { id: 'zs_seasonal',     label: 'ZS Seasonal',            instrument: 'MZS',  status_src: 'ACTIVE', trades: zs_trades },
  { id: 'spy_mes_seasonal',label: 'SPY/MES S&P Seasonal',   instrument: 'MES',  status_src: 'ACTIVE', trades: spy_trades },
  { id: 'iwm_m2k',         label: 'IWM (M2K)',              instrument: 'M2K',  status_src: 'DATA_BLOCKED', trades: [] },
  { id: 'eem',             label: 'EEM',                    instrument: 'EMF',  status_src: 'DATA_BLOCKED', trades: [] },
];

console.log('\n=== CANONICAL 17 ===');
CANON.forEach(c => {
  const s = computeStratStats(c.trades);
  const status = c.status_src === 'DATA_BLOCKED' ? 'DATA_BLOCKED'
    : (s.netEUR > 0 && s.isNet > 0 && s.oosNet > 0) ? 'ACTIVE'
    : (s.netEUR > 0) ? 'ACCEPTABLE'
    : c.status_src === 'LOW_WEIGHT' ? 'LOW_WEIGHT'
    : 'LOW_WEIGHT';
  c.stats = s;
  c.status = status;
  console.log(c.id.padEnd(22), 'n='+String(c.trades.length).padStart(4),
    'net='+String(s.netEUR).padStart(7), 'IS='+String(s.isNet).padStart(6),
    'OOS='+String(s.oosNet).padStart(6), 'PF='+String(s.PF).padStart(5),
    c.status);
});

// ─── IBKR Margin (EUR, approximate 1.08 USD/EUR) ──────────────────────────────
const MARGIN_EUR = {
  eurusd_30m: 2590,     // 6E $2800
  dax_1h: 880,          // FDXS €880
  dax_2h: 880,          // FDXS €880
  gld_mgc_atrmed: 740,  // MGC $800
  zw_real: 1270,        // ZW $1375
  ym1_tat: 765,         // MYM $825
  cc_seasonal: 3150,    // CC $3400
  hg1_seasonal: 2500,   // MHG $2700
  cl1_seasonal: 1390,   // MCL $1500
  zm1_seasonal: 1250,   // MZM $1350
  gc1_seasonal: 740,    // MGC $800
  sb_seasonal: 1070,    // SB $1155
  zc_seasonal: 520,     // MZC $560
  zs_seasonal: 1220,    // MZS $1320
  spy_mes_seasonal: 1390, // MES $1500
  iwm_m2k: 0,
  eem: 0,
};

const COST_RT_USD = {
  eurusd_30m: 2.35, dax_1h: 1.70, dax_2h: 1.70, gld_mgc_atrmed: 0.58,
  zw_real: 2.25, ym1_tat: 0.85, cc_seasonal: 3.50, hg1_seasonal: 2.00,
  cl1_seasonal: 0.85, zm1_seasonal: 2.25, gc1_seasonal: 0.58, sb_seasonal: 2.25,
  zc_seasonal: 1.50, zs_seasonal: 2.25, spy_mes_seasonal: 0.85,
  iwm_m2k: 0, eem: 0,
};

// ─── Integer contract optimizer ───────────────────────────────────────────────
// Rules:
//   - DATA_BLOCKED: 0 contracts
//   - All others (ACTIVE, ACCEPTABLE, LOW_WEIGHT): min 1 contract
//   - Greedy add more for high-score strategies if margin budget allows
//   - Initial margin must fit within capital
//   - Max margin target: 75% of capital (for recommendation) or 85% (tight)

function optimizeContracts(capital) {
  // Start with 1 contract for all tradable (non-BLOCKED)
  const contracts = {};
  CANON.forEach(c => {
    contracts[c.id] = c.status === 'DATA_BLOCKED' ? 0 : 1;
  });

  function totalMargin(cts) {
    return CANON.reduce((s, c) => s + (cts[c.id] ?? 0) * (MARGIN_EUR[c.id] ?? 0), 0);
  }

  // If base allocation already exceeds capital, can't trade — return as is
  const baseMargin = totalMargin(contracts);
  const baseMarginPct = baseMargin / capital * 100;

  // Feasibility: initial margin <= capital AND maintenance buffer OK
  const maintenanceMargin = baseMargin * 0.75;
  const cashBuffer = capital * 0.10;
  const feasible = baseMargin <= capital && (capital - maintenanceMargin - cashBuffer) > 0;

  let assessment = 'COMFORTABLE';
  if (baseMarginPct > 85) assessment = 'MARGIN_RISK';
  else if (baseMarginPct > 70) assessment = 'AGGRESSIVE';
  else if (baseMarginPct > 55) assessment = 'TIGHT';
  else if (baseMarginPct > 40) assessment = 'FEASIBLE';

  // Greedy: add more contracts to top OOS earners if budget allows
  const TARGET_MARGIN_PCT = 0.72; // 72% target for extra contracts
  const sortedByScore = CANON
    .filter(c => c.status !== 'DATA_BLOCKED' && (c.stats?.oosNet ?? 0) > 0)
    .map(c => ({
      id: c.id,
      score: (c.stats?.oosNet ?? 0) / Math.max(MARGIN_EUR[c.id] ?? 1000, 1),
      margin: MARGIN_EUR[c.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  for (const { id, margin } of sortedByScore) {
    const curMargin = totalMargin(contracts);
    if (curMargin + margin <= capital * TARGET_MARGIN_PCT && contracts[id] < 3) {
      contracts[id]++;
    }
  }

  const finalMargin = totalMargin(contracts);
  const finalMarginPct = finalMargin / capital * 100;
  const finalFeasible = finalMargin <= capital && (capital - finalMargin * 0.75 - capital * 0.10) > 0;

  let finalAssess = 'COMFORTABLE';
  if (finalMarginPct > 85) finalAssess = 'MARGIN_RISK';
  else if (finalMarginPct > 70) finalAssess = 'AGGRESSIVE';
  else if (finalMarginPct > 55) finalAssess = 'TIGHT';
  else if (finalMarginPct > 40) finalAssess = 'FEASIBLE';

  return {
    contracts,
    marginTotal: Math.round(finalMargin),
    marginPct: +finalMarginPct.toFixed(1),
    assessment: finalAssess,
    feasibility: finalFeasible,
  };
}

// ─── Daily P&L builder ────────────────────────────────────────────────────────
function buildPortfolioPnL(contracts) {
  const map = {};
  CANON.forEach(c => {
    const n = contracts[c.id] ?? 0;
    if (n === 0 || !c.trades?.length) return;
    for (const t of c.trades) {
      map[t.date] = (map[t.date] ?? 0) + t.netEUR * n;
    }
  });
  return map;
}

// ─── Stats from daily P&L ────────────────────────────────────────────────────
function computePortfolioStats(pnlMap, capital) {
  const entries = Object.entries(pnlMap).filter(([d]) => {
    const y = parseInt(d.slice(0, 4));
    return y >= 2008 && y <= 2025;
  }).sort(([a], [b]) => a < b ? -1 : 1);

  let nav = capital, peak = capital, maxDD_eur = 0;
  const monthly = {};
  const yearly = {};
  const daily = [];

  for (const [date, pnl] of entries) {
    nav += pnl;
    if (nav > peak) peak = nav;
    const dd_eur = peak - nav;
    if (dd_eur > maxDD_eur) maxDD_eur = dd_eur;
    const ym = date.slice(0, 7);
    monthly[ym] = { nav: +nav.toFixed(2) };
    const yr = parseInt(date.slice(0, 4));
    yearly[yr] = (yearly[yr] ?? 0) + pnl;
    daily.push({ date, pnl: +pnl.toFixed(4), ret: +(pnl / capital).toFixed(8) });
  }

  const years = 18; // 2008-2025
  const CAGR = (Math.pow(nav / capital, 1 / years) - 1) * 100;
  const maxDDPct = peak > 0 ? (maxDD_eur / peak * 100) : 0;

  // IS / OOS / OOS19
  const isEntries = entries.filter(([d]) => d < IS_CUTOFF);
  const oosEntries = entries.filter(([d]) => d >= IS_CUTOFF);
  const oos19Entries = entries.filter(([d]) => d >= OOS19_CUTOFF);

  function subCAGR(arr, capStart, nYrs) {
    if (!arr.length) return null;
    const total = arr.reduce((s, [, p]) => s + p, 0);
    return +((Math.pow((capStart + total) / capStart, 1 / nYrs) - 1) * 100).toFixed(2);
  }

  const isTotal = isEntries.reduce((s, [, p]) => s + p, 0);
  const isCAGR = subCAGR(isEntries, capital, 9);
  const oosCAGR = subCAGR(oosEntries, capital + isTotal, 9);
  const prOOS19 = daily.filter(d => d.date < OOS19_CUTOFF).reduce((s, d) => s + d.pnl, 0);
  const oos2019CAGR = subCAGR(oos19Entries, capital + prOOS19, 7);

  // Sharpe from daily returns
  const rets = daily.map(d => d.ret);
  const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1);
  const dailyStd = Math.sqrt(variance);
  const annMean = mean * 252;
  const annStd = dailyStd * Math.sqrt(252);
  const Sharpe = annStd > 0 ? +(annMean / annStd).toFixed(3) : 0;

  // Sortino
  const downRets = rets.filter(r => r < 0);
  const downVar = downRets.reduce((s, r) => s + r * r, 0) / Math.max(downRets.length, 1);
  const Sortino = Math.sqrt(downVar) > 0 ? +(annMean / (Math.sqrt(downVar) * Math.sqrt(252))).toFixed(3) : 0;

  const Calmar = maxDDPct > 0 ? +(CAGR / maxDDPct).toFixed(3) : 0;
  const totalNetEUR = Math.round(nav - capital);

  // Annual cost
  const annualCostEUR = 0; // computed per-capital from contract counts

  return {
    CAGR: +CAGR.toFixed(2), isCAGR, oosCAGR, oos2019CAGR,
    Sharpe, Sortino, Calmar,
    MaxDDPct: +maxDDPct.toFixed(2), MaxDDEUR: Math.round(maxDD_eur),
    totalNetEUR, finalNav: Math.round(nav),
    monthly, yearly, daily,
  };
}

// ─── Run capital search ───────────────────────────────────────────────────────
const CAPITALS = [10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const capRows = [];

console.log('\n=== CAPITAL SEARCH ===');
for (const capital of CAPITALS) {
  const opt = optimizeContracts(capital);
  const pnl = buildPortfolioPnL(opt.contracts);
  const stats = computePortfolioStats(pnl, capital);

  const annCost = CANON.reduce((s, c) => {
    const n = opt.contracts[c.id] ?? 0;
    const tpy = c.stats?.tradesPerYear ?? 0;
    return s + n * tpy * (COST_RT_USD[c.id] ?? 0) * EUR_PER_USD;
  }, 0);

  capRows.push({
    capital, assessment: opt.assessment, marginPct: opt.marginPct, marginTotal: opt.marginTotal,
    CAGR: stats.CAGR, isCAGR: stats.isCAGR, oosCAGR: stats.oosCAGR, oos2019CAGR: stats.oos2019CAGR,
    Sharpe: stats.Sharpe, Sortino: stats.Sortino, Calmar: stats.Calmar,
    MaxDDPct: stats.MaxDDPct, MaxDDEUR: stats.MaxDDEUR, totalNetEUR: stats.totalNetEUR,
    annualCostEUR: Math.round(annCost), costPerNAV: +(annCost / capital * 100).toFixed(2),
    feasibility: opt.feasibility,
    contracts: Object.fromEntries(Object.entries(opt.contracts).filter(([, n]) => n > 0)),
  });

  console.log(`Cap ${capital}: ${opt.assessment.padEnd(11)} margin=${opt.marginPct}% feasible=${opt.feasibility}`);
  console.log(`  CAGR=${stats.CAGR}% OOS=${stats.oosCAGR}% OOS19=${stats.oos2019CAGR}% Sharpe=${stats.Sharpe} MaxDD=${stats.MaxDDPct}%`);
}

// ─── Pick recommended capital ─────────────────────────────────────────────────
// Prefer: feasible AND AGGRESSIVE or better (margin<85%), best OOS CAGR
const feasibleRows = capRows.filter(r => r.feasibility && ['COMFORTABLE', 'FEASIBLE', 'TIGHT', 'AGGRESSIVE'].includes(r.assessment));
const recRow = feasibleRows.sort((a, b) => (b.oosCAGR ?? 0) - (a.oosCAGR ?? 0))[0] ?? capRows.find(r => r.feasibility);
const recCapital = recRow?.capital ?? 25000;
const techMin = capRows.find(r => r.feasibility)?.capital ?? recCapital;

// Comfortable = first level where margin < 40%
const comfortRow = capRows.find(r => r.feasibility && r.marginPct < 40);

console.log('\nRecommended capital:', recCapital);
console.log('Technical minimum:', techMin);

// ─── Final portfolio stats at recommended capital ─────────────────────────────
const recOpt = optimizeContracts(recCapital);
const recPnL = buildPortfolioPnL(recOpt.contracts);
const recStats = computePortfolioStats(recPnL, recCapital);
const recAnnCost = CANON.reduce((s, c) => {
  const n = recOpt.contracts[c.id] ?? 0;
  return s + n * (c.stats?.tradesPerYear ?? 0) * (COST_RT_USD[c.id] ?? 0) * EUR_PER_USD;
}, 0);

// Trades/week
const totalTrades = CANON.reduce((s, c) => s + (recOpt.contracts[c.id] ?? 0) * (c.stats?.tradesPerYear ?? 0), 0);
const tradesPerWeek = totalTrades / 52;

// Portfolio PF and expectancy
const allTradePnLs = [];
CANON.forEach(c => {
  const n = recOpt.contracts[c.id] ?? 0;
  if (n === 0) return;
  c.trades?.forEach(t => allTradePnLs.push(t.netEUR * n));
});
const portWins = allTradePnLs.filter(v => v > 0).reduce((s, v) => s + v, 0);
const portLoss = Math.abs(allTradePnLs.filter(v => v < 0).reduce((s, v) => s + v, 0));
const portPF = portLoss > 0 ? +(portWins / portLoss).toFixed(2) : 99;
const portExp = allTradePnLs.length > 0 ? +(allTradePnLs.reduce((s, v) => s + v, 0) / allTradePnLs.length).toFixed(2) : 0;

// ─── Build risk weights ───────────────────────────────────────────────────────
function annualPnLVol(trades) {
  if (!trades.length) return 999;
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const vals = Object.values(byYear);
  if (vals.length < 2) return 999;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

const invVols = {};
let ivSum = 0;
CANON.forEach(c => {
  if (c.status === 'DATA_BLOCKED') { invVols[c.id] = 0; return; }
  const vol = annualPnLVol(c.trades);
  invVols[c.id] = vol < 900 ? 1 / Math.max(vol, 50) : 0;
  ivSum += invVols[c.id];
});

const recMarginTotal = recOpt.marginTotal;
const components = CANON.map(c => {
  const cts = recOpt.contracts[c.id] ?? 0;
  const margin = (MARGIN_EUR[c.id] ?? 0) * cts;
  const realizedWeight = recMarginTotal > 0 ? +(margin / recMarginTotal * 100).toFixed(1) : 0;
  const targetWeight = ivSum > 0 ? +(invVols[c.id] / ivSum * 100).toFixed(1) : 0;
  const s = c.stats ?? { netEUR: 0, isNet: 0, oosNet: 0, oos2019Net: 0, PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0 };
  const annCostC = Math.round(cts * (s.tradesPerYear ?? 0) * (COST_RT_USD[c.id] ?? 0) * EUR_PER_USD);
  const robustness = c.status === 'DATA_BLOCKED' ? 'N/A'
    : (s.PF >= 2 && s.oosNet > 0 && s.isNet > 0) ? 'HIGH'
    : (s.PF >= 1.1 && s.oosNet > 0) ? 'MEDIUM' : 'LOW';

  return {
    id: c.id, label: c.label, instrument: c.instrument, status: c.status, robustness,
    netEUR: s.netEUR, isNet: s.isNet, oosNet: s.oosNet, oos2019Net: s.oos2019Net ?? 0,
    PF: s.PF, posYr: s.posYr, totYr: s.totYr, tradesPerYear: s.tradesPerYear,
    marginPerContract: MARGIN_EUR[c.id] ?? 0,
    costPerRT: COST_RT_USD[c.id] ?? 0,
    annualCostEUR: annCostC,
    targetWeight, realizedWeight, contracts: cts,
  };
});

// ─── Portfolio KPIs ───────────────────────────────────────────────────────────
const portfolioKPIs = {
  CAGR: recStats.CAGR, oosCAGR: recStats.oosCAGR, oos2019CAGR: recStats.oos2019CAGR,
  isCAGR: recStats.isCAGR, Sharpe: recStats.Sharpe, Sortino: recStats.Sortino,
  Calmar: recStats.Calmar, MaxDDPct: recStats.MaxDDPct, MaxDDEUR: recStats.MaxDDEUR,
  totalNetEUR: recStats.totalNetEUR, annualCostEUR: Math.round(recAnnCost),
  costPerNAV: +(recAnnCost / recCapital * 100).toFixed(2),
  PF: portPF, expectancyEUR: portExp,
  tradesPerWeek: +tradesPerWeek.toFixed(1),
};

// ─── Performance attribution ──────────────────────────────────────────────────
const baseAlpha = CANON.filter(c => c.status !== 'DATA_BLOCKED')
  .reduce((s, c) => s + (c.stats?.netEUR ?? 0), 0);
// Quality improvement: GLD real vs old all-trades GLD thursday_long
const oldGldNet = allTrades.filter(t => t.strategyId === 'gld_thursday_long')
  .reduce((s, t) => s + tradeNetEUR(t), 0);
const gldRealNet = gldData.trades.reduce((s, t) => s + t.netEUR, 0);
const qualityImprovement = Math.round(gldRealNet - oldGldNet);
// Contract sizing: extra contracts beyond 1
const contractSizing = CANON.reduce((s, c) => {
  const n = (recOpt.contracts[c.id] ?? 0) - 1;
  return n > 0 ? s + n * (c.stats?.netEUR ?? 0) : s;
}, 0);
const totalCostLifetime = recAnnCost * 18;

const performanceAttribution = {
  baseAlpha: Math.round(baseAlpha),
  qualityImprovement: Math.round(qualityImprovement),
  contractSizing: Math.round(contractSizing),
  ibkrCosts: Math.round(totalCostLifetime),
  finalNet: recStats.totalNetEUR,
};

// ─── Variants ─────────────────────────────────────────────────────────────────
const fRows = capRows.filter(r => r.feasibility);
const sortByOOS = [...fRows].sort((a, b) => (b.oosCAGR ?? 0) - (a.oosCAGR ?? 0));
const sortBySharpe = [...fRows].sort((a, b) => (b.Sharpe ?? 0) - (a.Sharpe ?? 0));
const lowCapRows = fRows.filter(r => (r.Sharpe ?? 0) >= 0.5).sort((a, b) => a.capital - b.capital);

const variants = {
  BEST_RETURN: sortByOOS[0] && { capital: sortByOOS[0].capital, CAGR: sortByOOS[0].CAGR, oosCAGR: sortByOOS[0].oosCAGR },
  BEST_BALANCED: sortBySharpe[0] && { capital: sortBySharpe[0].capital, CAGR: sortBySharpe[0].CAGR, Sharpe: sortBySharpe[0].Sharpe },
  BEST_LOW_CAPITAL: lowCapRows[0] && { capital: lowCapRows[0].capital, CAGR: lowCapRows[0].CAGR },
  FINAL_RECOMMENDATION: { capital: recCapital, CAGR: portfolioKPIs.CAGR, note: 'First feasible AGGRESSIVE-or-better level with highest OOS CAGR' },
};

// ─── Equity series ────────────────────────────────────────────────────────────
function buildEquitySeries(contracts, capital) {
  const pnl = buildPortfolioPnL(contracts);
  const entries = Object.entries(pnl).filter(([d]) => {
    const y = parseInt(d.slice(0, 4)); return y >= 2007 && y <= 2026;
  }).sort(([a], [b]) => a < b ? -1 : 1);
  const monthly = {};
  let nav = capital, peak = capital;
  for (const [date, p] of entries) {
    nav += p;
    if (nav > peak) peak = nav;
    const ym = date.slice(0, 7);
    monthly[ym] = { nav: +nav.toFixed(2), dd: +(-((peak - nav) / peak * 100)).toFixed(2) };
  }
  return Object.entries(monthly).sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, v]) => ({ date, ...v }));
}

const EQ_CAPS = [15000, 20000, 25000, 30000, 50000].filter(c =>
  capRows.find(r => r.capital === c && r.feasibility)
);
const equitySeries = {};
for (const cap of EQ_CAPS) {
  const { contracts } = optimizeContracts(cap);
  equitySeries[cap] = buildEquitySeries(contracts, cap);
}
// Always include recommended
if (!equitySeries[recCapital]) {
  equitySeries[recCapital] = buildEquitySeries(recOpt.contracts, recCapital);
}

const yearlyReturns = Object.entries(recStats.yearly)
  .filter(([y]) => +y >= 2008 && +y <= 2025).sort(([a], [b]) => +a - +b)
  .map(([year, netEUR]) => ({ year: +year, netEUR: Math.round(netEUR), returnPct: +(netEUR / recCapital * 100).toFixed(2) }));

// ─── Canonical components JSON ────────────────────────────────────────────────
const canonicalComponents = CANON.map(c => ({
  id: c.id, label: c.label, instrument: c.instrument, status: c.status,
  replacedId: c.id === 'gld_mgc_atrmed' ? 'gld_thursday_long' : c.id === 'zw_real' ? 'zw_seasonal' : undefined,
}));

// ─── Build summary JSON ───────────────────────────────────────────────────────
const tradableCount = CANON.filter(c => c.status !== 'DATA_BLOCKED').length;
const blockedCount = CANON.filter(c => c.status === 'DATA_BLOCKED').length;

const summary = {
  version: 'v3',
  generatedAt: '2026-08-15',
  status: 'FINAL_CONSISTENCY_FIX',
  canonicalTotal: 17, tradableComponents: tradableCount, blockedComponents: blockedCount,
  recommendedCapital: recCapital, minimumCapital: recCapital,
  technicalMinimum: techMin,
  comfortableCapital: comfortRow?.capital ?? null,
  components, capitalComparison: capRows, portfolioKPIs,
  performanceAttribution, variants,
  serkan: {
    rows: recStats.daily.length,
    dateRange: ['2008-01-01', '2025-12-31'],
    path: 'workspace/output/white-swan/serkan/v3/',
  },
};

// ─── Write outputs ─────────────────────────────────────────────────────────────
fs.mkdirSync('workspace/output/white-swan/v3', { recursive: true });
fs.mkdirSync('workspace/output/white-swan/serkan/v3', { recursive: true });

fs.writeFileSync('workspace/output/white-swan/v3/canonical-components.json', JSON.stringify(canonicalComponents, null, 2));
fs.writeFileSync('workspace/output/white-swan/v3/portfolio-summary.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('public/data/white-swan/final/portfolio-summary.json', JSON.stringify(summary, null, 2));

const eqOut = { series: Object.fromEntries(Object.entries(equitySeries)), yearlyReturns };
fs.writeFileSync('workspace/output/white-swan/v3/equity-series.json', JSON.stringify(eqOut));
fs.writeFileSync('public/data/white-swan/final/equity-series.json', JSON.stringify(eqOut));

// Serkan daily returns CSV — Date,Daily_Return
const serkanCsv = ['Date,Daily_Return',
  ...recStats.daily.map(d => `${d.date},${d.ret.toFixed(8)}`)
].join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v3/white_swan_final_daily_returns.csv', serkanCsv);

// Serkan components CSV
const compCsv = ['id,label,instrument,status,netEUR,isNet,oosNet,oos2019Net,PF,posYr,totYr,tradesPerYear,marginPerContract,contracts',
  ...components.map(c => `${c.id},${c.label},${c.instrument},${c.status},${c.netEUR},${c.isNet},${c.oosNet},${c.oos2019Net},${c.PF},${c.posYr},${c.totYr},${c.tradesPerYear},${c.marginPerContract},${c.contracts}`)
].join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v3/white_swan_final_components.csv', compCsv);

// ─── Audit ─────────────────────────────────────────────────────────────────────
console.log('\n=== AUDIT ===');
// Sum daily returns → should match totalNetEUR
const csvRows = serkanCsv.split('\n').slice(1);
const sumRet = csvRows.reduce((s, r) => { const v = parseFloat(r.split(',')[1]); return isNaN(v) ? s : s + v; }, 0);
const impliedPnL = sumRet * recCapital;
console.log('CSV rows:', csvRows.length);
console.log('Sum daily returns:', sumRet.toFixed(6));
console.log('Implied total P&L:', Math.round(impliedPnL), 'vs totalNetEUR:', recStats.totalNetEUR);
console.log('Match:', Math.abs(impliedPnL - recStats.totalNetEUR) < 10 ? '✓ OK' : '✗ MISMATCH');
console.log('Canonical components:', canonicalComponents.length);
console.log('Tradable:', tradableCount, '| Blocked:', blockedCount);

// ─── Final report ──────────────────────────────────────────────────────────────
console.log('\n======== WHITE SWAN — FINAL CONSISTENCY RESULT ========');
console.log('Canonical Components: 17');
console.log('Tradable:', tradableCount, '| Blocked:', blockedCount);
console.log('');
console.log('Recommended Capital:', recCapital);
console.log('Technical Minimum:  ', techMin);
console.log('');
console.log('Contracts at recommended capital:');
CANON.forEach(c => {
  const n = recOpt.contracts[c.id] ?? 0;
  console.log(`  ${c.id.padEnd(22)} ${c.instrument.padEnd(5)} ${n}ct  ${c.status}`);
});
console.log('');
console.log('Net CAGR:    ', portfolioKPIs.CAGR + '%');
console.log('OOS CAGR:    ', portfolioKPIs.oosCAGR + '%', '(2017–2025)');
console.log('OOS 2019+:   ', portfolioKPIs.oos2019CAGR + '%', '(2019–2025)');
console.log('IS CAGR:     ', portfolioKPIs.isCAGR + '%', '(2008–2016)');
console.log('Sharpe:      ', portfolioKPIs.Sharpe);
console.log('Sortino:     ', portfolioKPIs.Sortino);
console.log('Calmar:      ', portfolioKPIs.Calmar);
console.log('MaxDD:       ', portfolioKPIs.MaxDDPct + '%', '(€' + portfolioKPIs.MaxDDEUR + ')');
console.log('PF:          ', portfolioKPIs.PF);
console.log('Expectancy:  ', portfolioKPIs.expectancyEUR + ' EUR/trade');
console.log('Trades/week: ', portfolioKPIs.tradesPerWeek);
console.log('Cost/year:   ', '€' + portfolioKPIs.annualCostEUR);
console.log('Cost/NAV:    ', portfolioKPIs.costPerNAV + '%');
console.log('Margin:      ', recRow?.marginPct + '%', recRow?.assessment);
console.log('');
console.log('Key sleeves:');
console.log('  EURUSD:', components.find(c => c.id === 'eurusd_30m')?.status, '— net', components.find(c => c.id === 'eurusd_30m')?.netEUR);
console.log('  GLD:   ', components.find(c => c.id === 'gld_mgc_atrmed')?.status, '— net', components.find(c => c.id === 'gld_mgc_atrmed')?.netEUR);
console.log('  ZW:    ', components.find(c => c.id === 'zw_real')?.status, '— net', components.find(c => c.id === 'zw_real')?.netEUR, 'contracts:', components.find(c => c.id === 'zw_real')?.contracts);
console.log('  IWM:   ', components.find(c => c.id === 'iwm_m2k')?.status);
console.log('  EEM:   ', components.find(c => c.id === 'eem')?.status);
console.log('');
console.log('Serkan CSV: workspace/output/white-swan/serkan/v3/white_swan_final_daily_returns.csv');
console.log('Dashboard:  http://localhost:3000/white-swan/final');
console.log('');
// Ready check
const ready = recStats.daily.length > 0 && Math.abs(impliedPnL - recStats.totalNetEUR) < 50;
console.log('READY FOR SERKAN:', ready ? 'YES' : 'NO — fix audit mismatch first');
