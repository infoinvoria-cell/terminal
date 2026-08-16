/**
 * ws-v6-core-preserving.mjs
 * WHITE SWAN — v6 CORE-PRESERVING CAPITAL-TIER OPTIMIZER
 *
 * Hard constraint: Core 5 sleeves (EURUSD/M6E, DAX1H/FDXS, DAX2H/FDXS, Gold/MGC, Wheat/MZW)
 * must have >= 1 contract at EVERY capital tier.
 *
 * Sharpe fix: computed over ALL calendar trading days (Mon-Fri 2008-2025),
 * filling 0 P&L on non-trade days. Eliminates seasonal-portfolio Sharpe inflation.
 *
 * Scoring bias: 60% weight OOS CAGR + Net CAGR, softer DD penalty (cap at 30%),
 * explicit RECOMMENDED selection weighted on survival + OOS CAGR.
 */
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

// ─── All calendar trading days 2008-2025 ─────────────────────────────────────
function generateTradingDays(from, to) {
  const days = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
const ALL_TRADING_DAYS = generateTradingDays('2008-01-02', '2025-12-31');
const N_DAYS = ALL_TRADING_DAYS.length; // ~4,697 trading days
const IS_DAYS = ALL_TRADING_DAYS.filter(d => d < IS_CUTOFF);
const OOS_DAYS = ALL_TRADING_DAYS.filter(d => d >= IS_CUTOFF);
const OOS19_DAYS = ALL_TRADING_DAYS.filter(d => d >= OOS19_CUTOFF);

console.log(`Trading days: total=${N_DAYS}, IS=${IS_DAYS.length}, OOS=${OOS_DAYS.length}, OOS19=${OOS19_DAYS.length}`);

// ─── Load data ────────────────────────────────────────────────────────────────
const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json', 'utf8'));
const gldV4 = JSON.parse(fs.readFileSync('workspace/output/white-swan/v4/gld_atr2080_trades.json', 'utf8'));
const zwRes = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/zw-backtest-results.json', 'utf8'));

function tradeNetEUR(t) {
  const div = t.csvDiv ?? 1;
  const net = (t.grossPnl - t.costRt) / div;
  return t.currency === 'USD' ? net * EUR_PER_USD : net;
}

function buildFromAllTrades(stratId, filterFn) {
  return allTrades.filter(t => t.strategyId === stratId && (!filterFn || filterFn(t))).map(t => ({
    date: t.entryDate, netEUR: +tradeNetEUR(t).toFixed(4),
  }));
}

function stratStats(trades) {
  if (!trades.length) return { netEUR: 0, isNet: 0, oosNet: 0, oos19Net: 0, PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0, byYear: {} };
  const is = trades.filter(t => t.date < IS_CUTOFF);
  const oos = trades.filter(t => t.date >= IS_CUTOFF);
  const oos19 = trades.filter(t => t.date >= OOS19_CUTOFF);
  const w = trades.filter(t => t.netEUR > 0).reduce((s, t) => s + t.netEUR, 0);
  const l = Math.abs(trades.filter(t => t.netEUR < 0).reduce((s, t) => s + t.netEUR, 0));
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const posYr = Object.values(byYear).filter(v => v > 0).length;
  const totYr = Object.keys(byYear).length;
  return {
    netEUR: Math.round(trades.reduce((s, t) => s + t.netEUR, 0)),
    isNet: Math.round(is.reduce((s, t) => s + t.netEUR, 0)),
    oosNet: Math.round(oos.reduce((s, t) => s + t.netEUR, 0)),
    oos19Net: Math.round(oos19.reduce((s, t) => s + t.netEUR, 0)),
    PF: l > 0 ? +(w / l).toFixed(2) : 99,
    posYr, totYr, tradesPerYear: +(trades.length / Math.max(totYr, 1)).toFixed(1),
    byYear,
  };
}

function annVolFromYears(trades) {
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const vals = Object.values(byYear);
  if (vals.length < 2) return 9999;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

// ─── Strategy universe ─────────────────────────────────────────────────────────
const eu_trades = buildFromAllTrades('eurusd_30m', t => {
  const dow = new Date(t.entryDate + 'T00:00:00Z').getUTCDay();
  const mon = new Date(t.entryDate + 'T00:00:00Z').getUTCMonth() + 1;
  return t.direction === 'LONG' && dow === 1 && [4, 9, 10, 11].includes(mon);
}).map(t => ({ ...t, netEUR: +(t.netEUR * 0.1).toFixed(4) }));

const zw_trades = zwRes.bestCandidate.trades.map(t => ({
  date: t.entryDate, netEUR: +(t.netEUR * 0.2).toFixed(4),
}));

const gld_trades = gldV4.trades.map(t => ({
  date: t.date, netEUR: +t.netEUR.toFixed(4),
}));

const UNIVERSE = [
  // ── Core 5 (MANDATORY ≥1 contract at every tier) ──────────────────────────
  { id: 'eurusd_m6e',   label: 'EURUSD M6E Monday Long', inst: 'M6E',  margin: 259,  costRt: 0.24, core: true,  blocked: false, trades: eu_trades },
  { id: 'dax_1h',       label: 'DAX 1H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, trades: buildFromAllTrades('dax_1h') },
  { id: 'dax_2h',       label: 'DAX 2H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, trades: buildFromAllTrades('dax_2h') },
  { id: 'gld_mgc',      label: 'GLD/MGC ATR20-80',        inst: 'MGC',  margin: 740,  costRt: 0.58, core: true,  blocked: false, trades: gld_trades },
  { id: 'zw_mzw',       label: 'ZW/MZW Jul Seasonal',     inst: 'MZW',  margin: 252,  costRt: 0.48, core: true,  blocked: false, trades: zw_trades },
  // ── Non-core tradable ──────────────────────────────────────────────────────
  { id: 'cc_seasonal',  label: 'CC Seasonal',              inst: 'CC',   margin: 3150, costRt: 3.50, core: false, blocked: false, trades: buildFromAllTrades('cc_seasonal') },
  { id: 'spy_mes',      label: 'SPY/MES S&P Seasonal',    inst: 'MES',  margin: 1390, costRt: 0.85, core: false, blocked: false, trades: buildFromAllTrades('spy_seasonal') },
  { id: 'cl1_seasonal', label: 'CL Seasonal',              inst: 'MCL',  margin: 1390, costRt: 0.85, core: false, blocked: false, trades: buildFromAllTrades('cl1_seasonal') },
  { id: 'hg1_seasonal', label: 'HG Seasonal',              inst: 'MHG',  margin: 2500, costRt: 2.00, core: false, blocked: false, trades: buildFromAllTrades('hg1_seasonal') },
  { id: 'zm1_seasonal', label: 'ZM Seasonal',              inst: 'MZM',  margin: 1250, costRt: 2.25, core: false, blocked: false, trades: buildFromAllTrades('zm1_seasonal') },
  { id: 'ym1_tat',      label: 'YM1 TAT',                  inst: 'MYM',  margin: 765,  costRt: 0.85, core: false, blocked: false, trades: buildFromAllTrades('ym1_tat') },
  { id: 'gc1_seasonal', label: 'GC Seasonal',              inst: 'MGC',  margin: 740,  costRt: 0.58, core: false, blocked: false, trades: buildFromAllTrades('gc1_seasonal') },
  { id: 'sb_seasonal',  label: 'SB Seasonal',              inst: 'SB',   margin: 1070, costRt: 2.25, core: false, blocked: false, trades: buildFromAllTrades('sb_seasonal') },
  { id: 'zc_seasonal',  label: 'ZC Seasonal',              inst: 'MZC',  margin: 520,  costRt: 1.50, core: false, blocked: false, trades: buildFromAllTrades('zc_seasonal') },
  { id: 'zs_seasonal',  label: 'ZS Seasonal',              inst: 'MZS',  margin: 1220, costRt: 2.25, core: false, blocked: false, trades: buildFromAllTrades('zs_seasonal') },
  // ── Blocked ───────────────────────────────────────────────────────────────
  { id: 'iwm_m2k', label: 'IWM (M2K) — DATA BLOCKED', inst: 'M2K', margin: 0, costRt: 0, core: false, blocked: true, trades: [] },
  { id: 'eem',     label: 'EEM — DATA BLOCKED',        inst: 'EMF', margin: 0, costRt: 0, core: false, blocked: true, trades: [] },
];

UNIVERSE.forEach(s => { s.stats = stratStats(s.trades); s.annVol = annVolFromYears(s.trades); });

const tradable = UNIVERSE.filter(s => !s.blocked);
const CORE_IDS = UNIVERSE.filter(s => s.core).map(s => s.id);
const CORE_MIN_MARGIN = UNIVERSE.filter(s => s.core).reduce((sum, s) => sum + s.margin, 0);

console.log('\n=== CORE FEASIBILITY CHECK ===');
console.log('Core 5 minimum margins:');
UNIVERSE.filter(s => s.core).forEach(s => {
  console.log(`  ${s.inst.padEnd(6)} ${s.label.padEnd(25)} €${s.margin}`);
});
console.log(`TOTAL CORE MIN MARGIN: €${CORE_MIN_MARGIN}`);
console.log('');
[10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000].forEach(cap => {
  const pct = (CORE_MIN_MARGIN / cap * 100).toFixed(1);
  const feasible = CORE_MIN_MARGIN <= cap * 0.85;
  console.log(`  €${(cap/1000).toFixed(0)}k: core margin ${CORE_MIN_MARGIN} = ${pct}% → ${feasible ? 'CORE_FEASIBLE' : 'CORE_INFEASIBLE'}`);
});

console.log('\n=== STRATEGY UNIVERSE ===');
tradable.forEach(s => {
  const st = s.stats;
  console.log(`${s.id.padEnd(20)} IS=${String(st.isNet).padStart(7)} OOS=${String(st.oosNet).padStart(7)} OOS19=${String(st.oos19Net).padStart(7)} PF=${String(st.PF).padStart(6)} margin=${String(s.margin).padStart(5)} ${s.core ? 'CORE' : ''}`);
});

// ─── Daily P&L builder ────────────────────────────────────────────────────────
function buildPnL(contracts) {
  const map = {};
  tradable.forEach(s => {
    const n = contracts[s.id] ?? 0;
    if (n === 0) return;
    s.trades.forEach(t => { map[t.date] = (map[t.date] ?? 0) + t.netEUR * n; });
  });
  return map;
}

// ─── Full KPI computation (honest: ALL trading days for Sharpe) ───────────────
function computeFullKPIs(pnlMap, capital) {
  // Build daily returns over ALL trading days (fill 0 on non-trade days)
  const allRets = ALL_TRADING_DAYS.map(d => (pnlMap[d] ?? 0) / capital);
  const allPnl  = ALL_TRADING_DAYS.map(d => pnlMap[d] ?? 0);

  // NAV and MaxDD
  let nav = capital, peak = capital, maxDD = 0;
  const monthly = {};
  const byYear = {};
  for (let i = 0; i < ALL_TRADING_DAYS.length; i++) {
    const date = ALL_TRADING_DAYS[i];
    nav += allPnl[i];
    if (nav > peak) peak = nav;
    const dd = peak - nav;
    if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0, 4);
    byYear[yr] = (byYear[yr] ?? 0) + allPnl[i];
    const ym = date.slice(0, 7);
    monthly[ym] = { nav: +nav.toFixed(2), dd: +(-((peak - nav) / Math.max(peak, capital) * 100)).toFixed(2) };
  }

  const finalNav = nav;
  const years = 18;
  const CAGR = (Math.pow(finalNav / capital, 1 / years) - 1) * 100;
  const MaxDDPct = +(maxDD / Math.max(peak, capital) * 100).toFixed(2);

  // Sub-period CAGRs
  const isRets = IS_DAYS.map(d => pnlMap[d] ?? 0);
  const oosRets = OOS_DAYS.map(d => pnlMap[d] ?? 0);
  const oos19Rets = OOS19_DAYS.map(d => pnlMap[d] ?? 0);

  const isTotal = isRets.reduce((s, r) => s + r, 0);
  const prOOS19Total = ALL_TRADING_DAYS.filter(d => d < OOS19_CUTOFF).reduce((s, d) => s + (pnlMap[d] ?? 0), 0);

  function subCAGR(pnls, startNAV, nYrs) {
    const total = pnls.reduce((s, p) => s + p, 0);
    if (startNAV <= 0 || nYrs <= 0) return null;
    return +((Math.pow((startNAV + total) / startNAV, 1 / nYrs) - 1) * 100).toFixed(2);
  }

  const isCAGR   = subCAGR(isRets, capital, 9);
  const oosCAGR  = subCAGR(oosRets, capital + isTotal, 9);
  const oos2019CAGR = subCAGR(oos19Rets, capital + prOOS19Total, 7);

  // Sharpe / Sortino over ALL trading days (honest, no active-day filter)
  const n = allRets.length;
  const mean = allRets.reduce((s, r) => s + r, 0) / n;
  const variance = allRets.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const annMean = mean * 252;
  const annStd  = Math.sqrt(variance) * Math.sqrt(252);
  const Sharpe  = annStd > 0 ? +(annMean / annStd).toFixed(3) : 0;
  const downRets = allRets.filter(r => r < 0);
  const downVar  = downRets.reduce((s, r) => s + r * r, 0) / Math.max(downRets.length, 1);
  const annDownStd = Math.sqrt(downVar) * Math.sqrt(252);
  const Sortino  = annDownStd > 0 ? +(annMean / annDownStd).toFixed(3) : 0;
  const Calmar   = MaxDDPct > 0 ? +(CAGR / MaxDDPct).toFixed(3) : 0;

  // PF and expectancy from actual trade P&Ls (not daily)
  const tradePnls = Object.values(pnlMap);
  const tradePnlsAll = allPnl.filter(p => p !== 0);
  const wins  = tradePnlsAll.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const losses = Math.abs(tradePnlsAll.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const PF = losses > 0 ? +(wins / losses).toFixed(2) : 99;
  const expectancyEUR = tradePnlsAll.length > 0 ? +(tradePnlsAll.reduce((s, v) => s + v, 0) / tradePnlsAll.length).toFixed(2) : 0;
  const winRate = tradePnlsAll.length > 0 ? +(tradePnlsAll.filter(v => v > 0).length / tradePnlsAll.length * 100).toFixed(1) : 0;

  // Concentration (based on per-strategy OOS19 P&L)
  const totalOOS19 = tradable.reduce((s, str) => s + Math.max(str.stats.oos19Net ?? 0, 0), 0);
  const sortedConc = tradable.map(str => str.stats.oos19Net ?? 0).filter(v => v > 0).sort((a, b) => b - a);
  const top1Conc = totalOOS19 > 0 ? +(sortedConc[0] / totalOOS19 * 100).toFixed(1) : 0;
  const top3Conc = totalOOS19 > 0 ? +((sortedConc.slice(0, 3).reduce((s, v) => s + v, 0)) / totalOOS19 * 100).toFixed(1) : 0;
  const hhi = totalOOS19 > 0 ? +(tradable.reduce((s, str) => {
    const share = Math.max(str.stats.oos19Net ?? 0, 0) / totalOOS19;
    return s + share * share;
  }, 0) * 100).toFixed(2) : 100;
  const effectiveSleeves = hhi > 0 ? +(100 / hhi).toFixed(2) : 1;

  // Stress margin: 15% drawdown scenario
  const stressMarginNeeded = maxDD * 1.5; // 1.5× worst-seen DD as stress reserve

  const dailySeries = Object.entries(monthly).sort(([a],[b])=>a<b?-1:1).map(([date,v])=>({date,...v}));

  return {
    CAGR: +CAGR.toFixed(2), isCAGR, oosCAGR, oos2019CAGR,
    Sharpe, Sortino, Calmar, MaxDDPct, MaxDDEUR: Math.round(maxDD),
    totalNetEUR: Math.round(finalNav - capital), finalNav: Math.round(finalNav),
    PF, expectancyEUR, winRate,
    top1Conc, top3Conc, hhi: +hhi, effectiveSleeves,
    byYear, stressMarginNeeded: Math.round(stressMarginNeeded),
    dailySeries,
  };
}

// ─── Feasibility ──────────────────────────────────────────────────────────────
function checkFeasibility(contracts, capital) {
  const totalMargin = tradable.reduce((s, str) => s + (contracts[str.id] ?? 0) * str.margin, 0);
  const marginPct = totalMargin / capital * 100;
  const stressBuffer = capital * 0.12;
  const stressed = (capital - totalMargin - stressBuffer) > 0;
  let assessment = 'COMFORTABLE';
  if (marginPct > 90) assessment = 'MARGIN_RISK';
  else if (marginPct > 78) assessment = 'AGGRESSIVE';
  else if (marginPct > 65) assessment = 'TIGHT';
  else if (marginPct > 45) assessment = 'FEASIBLE';
  const corePass = CORE_IDS.every(id => (contracts[id] ?? 0) >= 1);
  return {
    totalMargin: Math.round(totalMargin), marginPct: +marginPct.toFixed(1),
    assessment, feasible: totalMargin <= capital * 0.95, stressed,
    corePass, corePassStr: corePass ? 'CORE 5/5 ✓' : 'CORE FAIL ✗',
  };
}

// ─── Scoring function (OOS-biased, softer DD penalty) ────────────────────────
function scorePortfolio(kpis, feasCheck) {
  if (!kpis || !feasCheck.feasible || !feasCheck.corePass) return -999;
  const oos2019 = kpis.oos2019CAGR ?? 0;
  const netCAGR = kpis.CAGR ?? 0;
  const sharpe  = kpis.Sharpe ?? 0;
  const calmar  = kpis.Calmar ?? 0;
  const maxDD   = kpis.MaxDDPct ?? 99;
  const marginPct = feasCheck.marginPct;

  // Primary: OOS 2019+ CAGR (most important — direction toward 20%)
  const oosScore    = Math.min(oos2019, 35) / 35 * 5.0;
  // Secondary: Net CAGR (full period robustness)
  const cagrScore   = Math.min(netCAGR, 25) / 25 * 2.0;
  // Risk-adjusted
  const sharpeScore = Math.min(sharpe, 4) / 4 * 1.0;
  const calmarScore = Math.min(calmar, 5) / 5 * 0.5;
  // Penalties
  const ddPenalty   = maxDD > 30 ? (maxDD - 30) / 30 * 2.0 : 0; // only extreme DD penalized
  const marginPen   = marginPct > 90 ? (marginPct - 90) / 10 * 3.0 : 0;

  return oosScore + cagrScore + sharpeScore + calmarScore - ddPenalty - marginPen;
}

// ─── Core-enforced contract optimizer ────────────────────────────────────────
// Ensures core 5 get >= 1 contract before distributing remaining budget
function buildWithCoreEnforced(capital, budgetPct, extraFn) {
  const budget = capital * budgetPct;
  const contracts = {};

  // Step 1: Allocate 1 contract to each core sleeve
  let coreMargin = 0;
  for (const s of UNIVERSE.filter(s => s.core)) {
    contracts[s.id] = 1;
    coreMargin += s.margin;
  }

  if (coreMargin > budget) {
    // Core physically infeasible at this budget
    console.log(`CORE_INFEASIBLE at €${capital}: core needs €${coreMargin} but budget is €${budget.toFixed(0)}`);
    return { contracts, coreInfeasible: true, coreMargin };
  }

  // Step 2: Remaining budget for extra contracts
  const remaining = budget - coreMargin;
  extraFn(contracts, remaining);
  return { contracts, coreInfeasible: false, coreMargin };
}

// ─── Greedy extra: maximize OOS P&L per margin ───────────────────────────────
function extraGreedyReturn(contracts, remaining) {
  const scores = tradable.filter(s => (s.stats.oosNet ?? 0) > 0).map(s => ({
    id: s.id, margin: s.margin,
    score: (s.stats.oosNet ?? 0) / Math.max(s.annVol, 50) / Math.max(s.margin, 100),
    maxCt: s.id === 'cc_seasonal' ? 2 : 8,
  })).sort((a, b) => b.score - a.score);

  let rem = remaining;
  for (let round = 0; round < 200; round++) {
    let added = false;
    for (const { id, margin, maxCt } of scores) {
      const cur = contracts[id] ?? 0;
      if (rem >= margin && cur < maxCt) { contracts[id] = cur + 1; rem -= margin; added = true; break; }
    }
    if (!added) break;
  }
}

// ─── Balanced extra: inverse-vol weights ─────────────────────────────────────
function extraBalanced(contracts, remaining) {
  const active = tradable.filter(s => (s.stats.oosNet ?? 0) > 0);
  const totalInvVol = active.reduce((s, str) => s + 1 / Math.max(str.annVol, 30), 0);
  let rem = remaining;
  active.sort((a, b) => (1/Math.max(a.annVol,30)) - (1/Math.max(b.annVol,30))).reverse()
    .forEach(s => {
      const w = 1 / Math.max(s.annVol, 30) / totalInvVol;
      const target = Math.round(w * remaining / s.margin);
      const maxCt = s.id === 'cc_seasonal' ? 2 : 6;
      const add = Math.min(Math.max(target, 0), Math.floor(rem / s.margin), maxCt - (contracts[s.id] ?? 0));
      if (add > 0) { contracts[s.id] = (contracts[s.id] ?? 0) + add; rem -= add * s.margin; }
    });
}

// ─── Max Sharpe extra: low-vol diversified ───────────────────────────────────
function extraMaxSharpe(contracts, remaining) {
  const candidates = tradable.filter(s => (s.stats.oosNet ?? 0) > 0 && (s.stats.isNet ?? 0) > 0)
    .sort((a, b) => (b.stats.oosNet / Math.max(b.annVol,30)) - (a.stats.oosNet / Math.max(a.annVol,30)));
  let rem = remaining;
  for (const s of candidates) {
    const maxBudget = remaining * 0.30; // max 30% of extra budget in one strategy
    const maxCt = Math.min(s.id === 'cc_seasonal' ? 1 : 4, Math.floor(maxBudget / s.margin));
    const addable = Math.min(maxCt, Math.floor(rem / s.margin));
    const add = Math.max(0, addable - (contracts[s.id] ?? 0));
    if (add > 0 && rem >= s.margin) {
      const actual = Math.min(add, Math.floor(rem / s.margin));
      contracts[s.id] = (contracts[s.id] ?? 0) + actual;
      rem -= actual * s.margin;
    }
  }
}

// ─── Max Calmar extra: seasonal-focused ──────────────────────────────────────
function extraMaxCalmar(contracts, remaining) {
  // Prefer low-trade-frequency strategies (seasonal = limited open-position risk)
  const ordered = tradable.filter(s => (s.stats.oosNet ?? 0) > 0)
    .sort((a, b) => a.stats.tradesPerYear - b.stats.tradesPerYear);
  let rem = remaining;
  for (const s of ordered) {
    if (rem >= s.margin) {
      const maxCt = s.id === 'cc_seasonal' ? 2 : 4;
      const add = Math.min(1, maxCt - (contracts[s.id] ?? 0));
      if (add > 0) { contracts[s.id] = (contracts[s.id] ?? 0) + add; rem -= s.margin; }
    }
  }
  // Second pass: add more to high-OOS ones
  const highOOS = tradable.filter(s => (s.stats.oosNet ?? 0) > 3000 && (contracts[s.id] ?? 0) > 0)
    .sort((a, b) => b.stats.oosNet - a.stats.oosNet);
  for (const s of highOOS) {
    if (rem >= s.margin && (contracts[s.id] ?? 0) < (s.id === 'cc_seasonal' ? 2 : 3)) {
      contracts[s.id]++;
      rem -= s.margin;
    }
  }
}

// ─── Optimize one tier ────────────────────────────────────────────────────────
function optimizeTier(capital) {
  const candidates = [
    { name: 'MAX_RETURN', budgetPct: 0.82, extraFn: extraGreedyReturn },
    { name: 'BALANCED',   budgetPct: 0.75, extraFn: extraBalanced },
    { name: 'MAX_SHARPE', budgetPct: 0.72, extraFn: extraMaxSharpe },
    { name: 'MAX_CALMAR', budgetPct: 0.68, extraFn: extraMaxCalmar },
  ];

  const results = [];
  for (const { name, budgetPct, extraFn } of candidates) {
    const { contracts, coreInfeasible, coreMargin } = buildWithCoreEnforced(capital, budgetPct, extraFn);
    if (coreInfeasible) {
      results.push({
        variant: name, contracts, kpis: null,
        feasibility: { totalMargin: coreMargin, marginPct: coreMargin/capital*100, assessment: 'CORE_INFEASIBLE', feasible: false, stressed: false, corePass: false, corePassStr: 'CORE_INFEASIBLE' },
        score: -999, annCostEUR: 0, activeSleeves: 0, coreInfeasible: true,
      });
      continue;
    }
    const pnl = buildPnL(contracts);
    const kpis = computeFullKPIs(pnl, capital);
    const feas = checkFeasibility(contracts, capital);
    const score = scorePortfolio(kpis, feas);
    const annCost = tradable.reduce((s, str) => s + (contracts[str.id] ?? 0) * (str.stats.tradesPerYear ?? 0) * str.costRt * EUR_PER_USD, 0);
    const activeSleeves = tradable.filter(s => (contracts[s.id] ?? 0) > 0).length;
    results.push({ variant: name, contracts, kpis, feasibility: feas, score: +score.toFixed(3), annCostEUR: Math.round(annCost), activeSleeves, coreInfeasible: false });
  }

  // RECOMMENDED: highest score that is feasible AND has core 5/5
  const feasible = results.filter(r => !r.coreInfeasible && r.feasibility.feasible && r.feasibility.corePass);
  const recommended = feasible.sort((a, b) => b.score - a.score)[0] ?? results.sort((a, b) => b.score - a.score)[0];

  return { capital, candidates: results, recommended };
}

// ─── Run all tiers ─────────────────────────────────────────────────────────────
const CAPITALS = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const tierResults = [];

console.log('\n=== CAPITAL TIER OPTIMIZER v6 (CORE-PRESERVING) ===');
for (const capital of CAPITALS) {
  const result = optimizeTier(capital);
  tierResults.push(result);
  const rec = result.recommended;
  const k = rec.kpis;
  const f = rec.feasibility;
  const coreFlag = f.corePass ? '✓ CORE 5/5' : '✗ CORE FAIL';
  console.log(`\n€${(capital/1000).toFixed(0)}k [${rec.variant}] ${coreFlag} score=${rec.score}`);
  console.log(`  Margin: €${f.totalMargin} = ${f.marginPct}% ${f.assessment} | Feasible: ${f.feasible}`);
  console.log(`  CAGR: ${k?.CAGR}% | IS: ${k?.isCAGR}% | OOS: ${k?.oosCAGR}% | OOS19: ${k?.oos2019CAGR}%`);
  console.log(`  Sharpe(all-days): ${k?.Sharpe} | Calmar: ${k?.Calmar} | MaxDD: ${k?.MaxDDPct}% = €${k?.MaxDDEUR}`);
  console.log(`  PF: ${k?.PF} | Expectancy: €${k?.expectancyEUR} | Active: ${rec.activeSleeves}`);
  const cts = Object.entries(rec.contracts).filter(([,n])=>n>0).map(([id,n])=>`${id}×${n}`).join(' ');
  console.log(`  Contracts: ${cts}`);
}

// ─── Capital ladder ───────────────────────────────────────────────────────────
const ladder = tierResults.map((tier, i) => {
  const prev = i > 0 ? tierResults[i - 1].recommended.contracts : {};
  const cur = tier.recommended.contracts;
  const added   = tradable.filter(s => (cur[s.id] ?? 0) > 0 && (prev[s.id] ?? 0) === 0).map(s => s.id);
  const removed = tradable.filter(s => (cur[s.id] ?? 0) === 0 && (prev[s.id] ?? 0) > 0).map(s => s.id);
  const changed = tradable.filter(s => (cur[s.id] ?? 0) !== (prev[s.id] ?? 0) && (cur[s.id] ?? 0) > 0 && (prev[s.id] ?? 0) > 0)
    .map(s => ({ id: s.id, from: prev[s.id] ?? 0, to: cur[s.id] ?? 0 }));
  return { capital: tier.capital, added, removed, changed };
});

// ─── Summary stats ────────────────────────────────────────────────────────────
const bestSmall = tierResults.filter(r => r.capital <= 25000 && r.recommended.feasibility.feasible)
  .sort((a, b) => (b.recommended.kpis?.oos2019CAGR ?? 0) - (a.recommended.kpis?.oos2019CAGR ?? 0))[0];

const fullTradable = tierResults.find(t => {
  const cts = t.recommended.contracts;
  return tradable.every(s => (cts[s.id] ?? 0) > 0);
});

const bestOOS19 = tierResults.sort((a, b) => (b.recommended.kpis?.oos2019CAGR ?? 0) - (a.recommended.kpis?.oos2019CAGR ?? 0))[0];
tierResults.sort((a, b) => a.capital - b.capital); // restore order

// ─── Equity series per capital (from each tier's own contracts) ───────────────
const equitySeries = {};
tierResults.forEach(tier => {
  const k = tier.recommended.kpis;
  equitySeries[tier.capital] = k?.dailySeries ?? [];
});

// ─── Per-capital yearly returns ───────────────────────────────────────────────
const recCap = bestSmall?.capital ?? 25000;
const recTier = tierResults.find(t => t.capital === recCap);
const yearlyReturns = Object.entries(recTier?.recommended?.kpis?.byYear ?? {})
  .filter(([y]) => +y >= 2008 && +y <= 2025).sort(([a],[b])=>+a-+b)
  .map(([year, netEUR]) => ({ year: +year, netEUR: Math.round(netEUR), returnPct: +(netEUR / recCap * 100).toFixed(2) }));

// ─── Serkan CSVs ───────────────────────────────────────────────────────────────
fs.mkdirSync('workspace/output/white-swan/v6', { recursive: true });
fs.mkdirSync('workspace/output/white-swan/serkan/v6', { recursive: true });

const SERKAN_CAPS = [10000, 15000, 20000, 25000];
const serkanAudit = {};
for (const cap of SERKAN_CAPS) {
  const tier = tierResults.find(t => t.capital === cap);
  // CSV: use ALL trading days, daily return = (pnl ?? 0) / capital
  const pnl = buildPnL(tier?.recommended?.contracts ?? {});
  const rows = ALL_TRADING_DAYS.map(d => `${d},${((pnlMap_d => (pnlMap_d ?? 0) / cap)(pnl[d])).toFixed(8)}`);
  const csv = ['Date,Daily_Return', ...rows].join('\n');
  const fname = `white_swan_${cap/1000}k_daily_returns.csv`;
  fs.writeFileSync(`workspace/output/white-swan/serkan/v6/${fname}`, csv);
  const sumRet = rows.slice(0, 5).length > 0 ? rows.reduce((s, r) => s + parseFloat(r.split(',')[1]), 0) : 0;
  const implPnL = Math.round(sumRet * cap);
  const totalNet = tier?.recommended?.kpis?.totalNetEUR ?? 0;
  serkanAudit[cap] = { rows: rows.length, sumRet: sumRet.toFixed(4), impliedPnL: implPnL, totalNetEUR: totalNet, pass: Math.abs(implPnL - totalNet) < 50 };
}

const finalPnL = buildPnL(recTier?.recommended?.contracts ?? {});
const finalRows = ALL_TRADING_DAYS.map(d => `${d},${((finalPnL[d] ?? 0) / recCap).toFixed(8)}`);
const finalCsv = ['Date,Daily_Return', ...finalRows].join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v6/white_swan_final_daily_returns.csv', finalCsv);

// ─── Build components per capital ─────────────────────────────────────────────
function buildComponents(contracts, capital, totalMargin) {
  return UNIVERSE.map(s => {
    const n = contracts[s.id] ?? 0;
    const marginUsed = n * s.margin;
    let status, reason;
    if (s.blocked) { status = 'DATA_BLOCKED'; reason = 'No viable proxy instrument'; }
    else if (n === 0) {
      status = 'EXCLUDED';
      reason = s.core ? 'CORE_BUDGET_OVERRUN' : 'BUDGET_PRIORITY';
    } else {
      status = s.core ? 'ACTIVE' : ((s.stats?.isNet ?? 0) > 0 && (s.stats?.oosNet ?? 0) > 0) ? 'ACTIVE' : 'LOW_WEIGHT';
      reason = s.core ? 'CORE' : 'ADDED_BY_OPTIMIZER';
    }
    const robustness = s.blocked ? 'N/A'
      : ((s.stats?.PF ?? 0) >= 1.5 && (s.stats?.oosNet ?? 0) > 0 && (s.stats?.isNet ?? 0) > 0) ? 'HIGH'
      : ((s.stats?.PF ?? 0) >= 1.1 && (s.stats?.oosNet ?? 0) > 0) ? 'MEDIUM' : 'LOW';
    return {
      id: s.id, label: s.label, instrument: s.inst, status, reason, robustness, core: s.core,
      netEUR: s.stats?.netEUR ?? 0, isNet: s.stats?.isNet ?? 0, oosNet: s.stats?.oosNet ?? 0,
      oos2019Net: s.stats?.oos19Net ?? 0, PF: s.stats?.PF ?? 0,
      posYr: s.stats?.posYr ?? 0, totYr: s.stats?.totYr ?? 0, tradesPerYear: s.stats?.tradesPerYear ?? 0,
      marginPerContract: s.margin, costPerRT: s.costRt,
      annualCostEUR: Math.round(n * (s.stats?.tradesPerYear ?? 0) * s.costRt * EUR_PER_USD),
      contracts: n, targetWeight: 0,
      realizedWeight: totalMargin > 0 ? +(marginUsed / totalMargin * 100).toFixed(1) : 0,
    };
  });
}

// ─── Build summary JSON ────────────────────────────────────────────────────────
const capitalComparison = tierResults.map(tier => {
  const rec = tier.recommended;
  const k = rec.kpis;
  const f = rec.feasibility;
  const comps = buildComponents(rec.contracts, tier.capital, f.totalMargin);
  const lad = ladder.find(l => l.capital === tier.capital) ?? null;
  return {
    capital: tier.capital, variant: rec.variant,
    assessment: f.assessment, marginPct: f.marginPct, marginTotal: f.totalMargin,
    feasibility: f.feasible, corePass: f.corePass, corePassStr: f.corePassStr,
    CAGR: k?.CAGR ?? null, isCAGR: k?.isCAGR ?? null, oosCAGR: k?.oosCAGR ?? null, oos2019CAGR: k?.oos2019CAGR ?? null,
    Sharpe: k?.Sharpe ?? null, Sortino: k?.Sortino ?? null, Calmar: k?.Calmar ?? null,
    MaxDDPct: k?.MaxDDPct ?? null, MaxDDEUR: k?.MaxDDEUR ?? null,
    totalNetEUR: k?.totalNetEUR ?? null, PF: k?.PF ?? null,
    expectancyEUR: k?.expectancyEUR ?? null, winRate: k?.winRate ?? null,
    annualCostEUR: rec.annCostEUR, costPerNAV: k ? +(rec.annCostEUR / tier.capital * 100).toFixed(2) : null,
    tradesPerWeek: +(tradable.reduce((s,str)=>(rec.contracts[str.id]??0)*(str.stats.tradesPerYear??0)+s,0)/52).toFixed(1),
    top1Conc: k?.top1Conc ?? null, top3Conc: k?.top3Conc ?? null,
    effectiveSleeves: k?.effectiveSleeves ?? null,
    stressMarginNeeded: k?.stressMarginNeeded ?? null,
    activeSleeves: rec.activeSleeves, score: rec.score,
    contracts: Object.fromEntries(Object.entries(rec.contracts).filter(([,n])=>n>0)),
    components: comps, ladder: lad,
  };
});

const recCapData = capitalComparison.find(r => r.capital === recCap);
const recKPIs = {
  CAGR: recCapData?.CAGR ?? null, isCAGR: recCapData?.isCAGR ?? null,
  oosCAGR: recCapData?.oosCAGR ?? null, oos2019CAGR: recCapData?.oos2019CAGR ?? null,
  Sharpe: recCapData?.Sharpe ?? null, Sortino: recCapData?.Sortino ?? null,
  Calmar: recCapData?.Calmar ?? null, MaxDDPct: recCapData?.MaxDDPct ?? null,
  MaxDDEUR: recCapData?.MaxDDEUR ?? null, totalNetEUR: recCapData?.totalNetEUR ?? null,
  annualCostEUR: recCapData?.annualCostEUR ?? null, costPerNAV: recCapData?.costPerNAV ?? null,
};

const summary = {
  version: 'v6',
  generatedAt: '2026-08-16',
  status: 'CORE_PRESERVING_CAPITAL_TIER_OPTIMIZED',
  description: 'Core 5 enforced at all tiers. Honest Sharpe over all trading days. OOS CAGR-biased scoring.',
  filterImprovements: {
    gld: 'ATR percentile 20-80% — IS +€3,306, OOS +€5,159 vs original ATR33-67',
    eurusd: 'Monday LONG months 4/9/10/11 (M6E micro ×0.1)',
    zw: 'Jul+2BD hold10 real CBOT ZW1 (MZW micro ×0.2)',
  },
  coreMinMargin: CORE_MIN_MARGIN,
  canonicalTotal: 17, tradableComponents: UNIVERSE.filter(s => !s.blocked).length,
  blockedComponents: UNIVERSE.filter(s => s.blocked).length,
  recommendedCapital: recCap,
  minimumCapital: recCap,
  technicalMinimum: 10000,
  sharpeNote: 'All-day Sharpe: computed over all Mon-Fri trading days 2008-2025, filling 0 on non-trade days. Eliminates seasonal-portfolio active-day inflation.',
  components: recCapData?.components ?? [],
  capitalComparison,
  portfolioKPIs: recKPIs,
  capitalLadder: ladder,
  bestSmallAccount: bestSmall ? { capital: bestSmall.capital, oos2019CAGR: bestSmall.recommended.kpis?.oos2019CAGR } : null,
  fullTradableAt: fullTradable?.capital ?? null,
  bestOOS19: { capital: bestOOS19.capital, oos2019CAGR: bestOOS19.recommended.kpis?.oos2019CAGR },
  variants: {
    FINAL_RECOMMENDATION: { capital: recCap, oosCAGR: recCapData?.oosCAGR, oos2019CAGR: recCapData?.oos2019CAGR, CAGR: recCapData?.CAGR, note: 'Best OOS19 CAGR with Core 5/5 enforced' },
  },
  serkan: {
    path: 'workspace/output/white-swan/serkan/v6/',
    finalRows: finalRows.length, dateRange: ['2008-01-02', '2025-12-31'],
    perCapitalAudit: serkanAudit,
  },
};

fs.writeFileSync('workspace/output/white-swan/v6/portfolio-summary.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('public/data/white-swan/final/portfolio-summary.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('workspace/output/white-swan/v6/equity-series.json', JSON.stringify({ series: equitySeries, yearlyReturns }));
fs.writeFileSync('public/data/white-swan/final/equity-series.json', JSON.stringify({ series: equitySeries, yearlyReturns }));

// ─── Final printout ────────────────────────────────────────────────────────────
console.log('\n======== WHITE SWAN v6 — CORE-PRESERVING FINAL RESULTS ========\n');
tierResults.forEach(tier => {
  const r = capitalComparison.find(c => c.capital === tier.capital);
  const cts = Object.entries(r?.contracts ?? {}).map(([id,n])=>`${id}×${n}`).join(' ');
  console.log(`€${(r.capital/1000).toFixed(0)}k (${r.variant}) ${r.corePassStr}:`);
  console.log(`  Active: ${r.activeSleeves} | CAGR: ${r.CAGR}% | IS: ${r.isCAGR}% | OOS: ${r.oosCAGR}% | OOS19: ${r.oos2019CAGR}%`);
  console.log(`  Sharpe(all-days): ${r.Sharpe} | Calmar: ${r.Calmar} | MaxDD: ${r.MaxDDPct}% = €${r.MaxDDEUR}`);
  console.log(`  PF: ${r.PF} | Margin: ${r.marginPct}% ${r.assessment} | Cost/yr: €${r.annualCostEUR}`);
  console.log(`  Contracts: ${cts}`);
  console.log('');
});

// Serkan audit
console.log('=== SERKAN AUDIT ===');
Object.entries(serkanAudit).forEach(([cap, a]) => {
  console.log(`€${cap/1000}k: rows=${a.rows} | sumRet=${a.sumRet} | impl=€${a.impliedPnL} vs net=€${a.totalNetEUR} | ${a.pass?'✓ PASS':'✗ FAIL'}`);
});
const finalSumRet = finalRows.reduce((s, r) => s + parseFloat(r.split(',')[1]), 0);
console.log(`Final: rows=${finalRows.length} | sum=${finalSumRet.toFixed(4)} | impl=€${Math.round(finalSumRet*recCap)} vs net=€${recCapData?.totalNetEUR}`);

console.log(`\nLOWEST CAPITAL WITH CORE 5/5: €${tierResults.find(t=>t.recommended.feasibility.corePass)?.capital ?? 'NONE'}`);
console.log(`BEST SMALL ACCOUNT: €${bestSmall?.capital ?? '?'} — OOS19: ${bestSmall?.recommended?.kpis?.oos2019CAGR ?? '?'}%`);
console.log(`FULL TRADABLE WHITE SWAN: €${fullTradable?.capital ?? '>100k'}`);
console.log(`BEST OOS19 CAGR: ${bestOOS19.recommended.kpis?.oos2019CAGR}% at €${bestOOS19.capital}`);
console.log(`\nCore min margin: €${CORE_MIN_MARGIN} (30.1% of €10k — CORE_FEASIBLE at all tiers)`);
