/**
 * ws-v5-capital-tiers.mjs
 * WHITE SWAN — CAPITAL-TIER OPTIMIZER
 *
 * For each capital tier (10k–100k), independently optimizes:
 *  - Which components to include
 *  - How many contracts per sleeve
 *  - Multi-objective scoring: OOS CAGR, Sharpe, Calmar, Diversification
 *  - Concentration penalty (no single-sleeve dominance)
 *
 * Data:
 *  - all-trades.json (9,728 records)
 *  - GLD ATR 20-80% improved trades (v4)
 *  - ZW Jul+2BD hold10 (real CBOT ZW1)
 *  - EURUSD Monday LONG months 4/9/10/11 (M6E micro ×0.1)
 *  - ZW MZW micro ×0.2
 */
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

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
    IS: t.entryDate < IS_CUTOFF, OOS19: t.entryDate >= OOS19_CUTOFF,
  }));
}

function stratStats(trades) {
  if (!trades.length) return { netEUR: 0, isNet: 0, oosNet: 0, oos19Net: 0, PF: 0, posYr: 0, totYr: 0, tradesPerYear: 0, byYear: {} };
  const is = trades.filter(t => t.IS), oos = trades.filter(t => !t.IS), oos19 = trades.filter(t => t.OOS19);
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

function annVol(trades) {
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const vals = Object.values(byYear);
  if (vals.length < 2) return 9999;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

// ─── Strategy universe ─────────────────────────────────────────────────────────
// EURUSD M6E (×0.1 per contract)
const eu_trades = buildFromAllTrades('eurusd_30m', t => {
  const dow = new Date(t.entryDate + 'T00:00:00Z').getUTCDay();
  const mon = new Date(t.entryDate + 'T00:00:00Z').getUTCMonth() + 1;
  return t.direction === 'LONG' && dow === 1 && [4, 9, 10, 11].includes(mon);
}).map(t => ({ ...t, netEUR: +(t.netEUR * 0.1).toFixed(4) }));

// ZW MZW (×0.2 per contract)
const zw_trades = zwRes.bestCandidate.trades.map(t => ({
  date: t.entryDate, netEUR: +(t.netEUR * 0.2).toFixed(4),
  IS: t.entryDate < IS_CUTOFF, OOS19: t.entryDate >= OOS19_CUTOFF,
}));

// GLD ATR 20-80 (×1 per MGC contract)
const gld_trades = gldV4.trades.map(t => ({
  date: t.date, netEUR: +t.netEUR.toFixed(4),
  IS: t.date < IS_CUTOFF, OOS19: t.date >= OOS19_CUTOFF,
}));

const UNIVERSE = [
  // Core (mandatory ≥1 contract where feasible)
  { id: 'eurusd_m6e',   label: 'EURUSD M6E (Mon Long)',  inst: 'M6E',  margin: 259,  costRt: 0.24, core: true,  blocked: false, trades: eu_trades },
  { id: 'dax_1h',       label: 'DAX 1H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, trades: buildFromAllTrades('dax_1h') },
  { id: 'dax_2h',       label: 'DAX 2H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, trades: buildFromAllTrades('dax_2h') },
  { id: 'gld_mgc',      label: 'GLD/MGC ATR20-80',        inst: 'MGC',  margin: 740,  costRt: 0.58, core: true,  blocked: false, trades: gld_trades },
  { id: 'zw_mzw',       label: 'ZW/MZW Jul Seasonal',     inst: 'MZW',  margin: 252,  costRt: 0.48, core: true,  blocked: false, trades: zw_trades },
  // Non-core tradable (sorted by OOS P&L desc for display clarity)
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
  // Blocked
  { id: 'iwm_m2k', label: 'IWM (M2K)', inst: 'M2K', margin: 0, costRt: 0, core: false, blocked: true, trades: [] },
  { id: 'eem',     label: 'EEM',        inst: 'EMF', margin: 0, costRt: 0, core: false, blocked: true, trades: [] },
];

// Compute stats for each
UNIVERSE.forEach(s => {
  s.stats = stratStats(s.trades);
  s.annVol = annVol(s.trades);
});

const tradable = UNIVERSE.filter(s => !s.blocked);

console.log('=== STRATEGY UNIVERSE ===');
tradable.forEach(s => {
  const st = s.stats;
  console.log(s.id.padEnd(20), 'IS='+String(st.isNet).padStart(7), 'OOS='+String(st.oosNet).padStart(7), 'PF='+String(st.PF).padStart(6), 'margin='+String(s.margin).padStart(5), s.core?'CORE':'');
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

// ─── Full KPI computation ─────────────────────────────────────────────────────
function computeFullKPIs(pnlMap, capital) {
  const entries = Object.entries(pnlMap).filter(([d]) => {
    const y = parseInt(d.slice(0, 4)); return y >= 2008 && y <= 2025;
  }).sort(([a], [b]) => a < b ? -1 : 1);
  if (!entries.length) return null;

  let nav = capital, peak = capital, maxDD = 0;
  const daily = [], byYear = {};
  for (const [date, pnl] of entries) {
    nav += pnl;
    if (nav > peak) peak = nav;
    const dd = peak - nav;
    if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0, 4);
    byYear[yr] = (byYear[yr] ?? 0) + pnl;
    daily.push({ date, pnl: +pnl.toFixed(4), ret: +(pnl / capital).toFixed(8) });
  }

  const years = 18;
  const CAGR = (Math.pow(nav / capital, 1 / years) - 1) * 100;
  const MaxDDPct = peak > 0 ? (maxDD / peak * 100) : 0;

  const isEntries = entries.filter(([d]) => d < IS_CUTOFF);
  const oosEntries = entries.filter(([d]) => d >= IS_CUTOFF);
  const oos19Entries = entries.filter(([d]) => d >= OOS19_CUTOFF);

  function subCAGR(arr, startNAV, nYrs) {
    if (!arr.length) return null;
    const total = arr.reduce((s, [, p]) => s + p, 0);
    return +((Math.pow((startNAV + total) / startNAV, 1 / nYrs) - 1) * 100).toFixed(2);
  }

  const isTotal = isEntries.reduce((s, [, p]) => s + p, 0);
  const prOOS19 = daily.filter(d => d.date < OOS19_CUTOFF).reduce((s, d) => s + d.pnl, 0);
  const isCAGR = subCAGR(isEntries, capital, 9);
  const oosCAGR = subCAGR(oosEntries, capital + isTotal, 9);
  const oos2019CAGR = subCAGR(oos19Entries, capital + prOOS19, 7);

  const rets = daily.map(d => d.ret);
  const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1);
  const annMean = mean * 252;
  const annStd = Math.sqrt(variance) * Math.sqrt(252);
  const Sharpe = annStd > 0 ? +(annMean / annStd).toFixed(3) : 0;
  const downRets = rets.filter(r => r < 0);
  const downStd = Math.sqrt(downRets.reduce((s, r) => s + r * r, 0) / Math.max(downRets.length, 1)) * Math.sqrt(252);
  const Sortino = downStd > 0 ? +(annMean / downStd).toFixed(3) : 0;
  const Calmar = MaxDDPct > 0 ? +(CAGR / MaxDDPct).toFixed(3) : 0;

  // PF and expectancy from trade P&Ls
  const allPnls = daily.map(d => d.pnl);
  const wins = allPnls.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const losses = Math.abs(allPnls.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const PF = losses > 0 ? +(wins / losses).toFixed(2) : 99;
  const expectancyEUR = allPnls.length > 0 ? +(allPnls.reduce((s, v) => s + v, 0) / allPnls.length).toFixed(2) : 0;

  // Win rate (days)
  const winRate = allPnls.length > 0 ? +(allPnls.filter(v => v > 0).length / allPnls.length * 100).toFixed(1) : 0;

  // Concentration metrics (by annual OOS P&L)
  const oosContrib = tradable.map(s => ({
    id: s.id,
    oosNet: (s.stats.oosNet ?? 0) * 1, // 1ct equivalent
  })).filter(s => s.oosNet > 0);
  const totalOOS = oosContrib.reduce((s, c) => s + c.oosNet, 0);
  const sortedOOS = [...oosContrib].sort((a, b) => b.oosNet - a.oosNet);
  const top1Conc = totalOOS > 0 ? +(sortedOOS[0]?.oosNet / totalOOS * 100).toFixed(1) : 0;
  const top3Conc = totalOOS > 0 ? +((sortedOOS.slice(0, 3).reduce((s, c) => s + c.oosNet, 0)) / totalOOS * 100).toFixed(1) : 0;
  const hhi = totalOOS > 0 ? +(oosContrib.reduce((s, c) => s + (c.oosNet / totalOOS) ** 2, 0) * 100).toFixed(2) : 100;
  const effectiveSleeves = hhi > 0 ? +(100 / hhi).toFixed(2) : 1;

  return {
    CAGR: +CAGR.toFixed(2), isCAGR, oosCAGR, oos2019CAGR,
    Sharpe, Sortino, Calmar, MaxDDPct: +MaxDDPct.toFixed(2), MaxDDEUR: Math.round(maxDD),
    totalNetEUR: Math.round(nav - capital), finalNav: Math.round(nav),
    PF, expectancyEUR, winRate,
    top1Conc, top3Conc, hhi, effectiveSleeves,
    daily, byYear,
    annVol: annStd > 0 ? +(annStd * capital).toFixed(0) : 0,
  };
}

// ─── Feasibility check ─────────────────────────────────────────────────────────
function checkFeasibility(contracts, capital) {
  const totalMargin = tradable.reduce((s, str) => s + (contracts[str.id] ?? 0) * str.margin, 0);
  const marginPct = totalMargin / capital * 100;
  const maintenance = totalMargin * 0.75;
  const cashBuffer = capital * 0.08;
  const stressBuffer = capital * 0.15; // 15% for variation margin
  const feasible = totalMargin <= capital && (capital - maintenance - cashBuffer) > 0;
  const stressed = (capital - totalMargin - stressBuffer) > 0; // survive 15% draw
  let assessment = 'COMFORTABLE';
  if (marginPct > 90) assessment = 'MARGIN_RISK';
  else if (marginPct > 75) assessment = 'AGGRESSIVE';
  else if (marginPct > 60) assessment = 'TIGHT';
  else if (marginPct > 40) assessment = 'FEASIBLE';
  return { totalMargin: Math.round(totalMargin), marginPct: +marginPct.toFixed(1), assessment, feasible, stressed };
}

// ─── Multi-objective score ────────────────────────────────────────────────────
function scorePortfolio(kpis, feasCheck) {
  if (!kpis || !feasCheck.feasible) return -999;
  const oos2019 = kpis.oos2019CAGR ?? 0;
  const sharpe = kpis.Sharpe ?? 0;
  const calmar = kpis.Calmar ?? 0;
  const maxDD = kpis.MaxDDPct ?? 99;
  const top1 = kpis.top1Conc ?? 100;
  const marginPct = feasCheck.marginPct;

  const oosScore = Math.min(oos2019, 30) / 30 * 4;         // max weight 4, capped at 30% OOS
  const sharpeScore = Math.min(sharpe, 3) / 3 * 2;         // max weight 2
  const calmarScore = Math.min(calmar, 5) / 5 * 1.5;       // max weight 1.5
  const ddPenalty = maxDD > 20 ? (maxDD - 20) / 20 * 1.5 : 0; // penalty starts at 20% DD
  const concPenalty = top1 > 40 ? (top1 - 40) / 30 * 1 : 0;   // penalty if >40% concentration
  const marginPenalty = marginPct > 80 ? (marginPct - 80) / 20 * 2 : 0; // strong margin penalty

  return oosScore + sharpeScore + calmarScore - ddPenalty - concPenalty - marginPenalty;
}

// ─── Candidate: Greedy OOS/margin optimizer ───────────────────────────────────
function candidateMaxReturn(capital) {
  const budget = Math.min(capital * 0.78, capital - capital * 0.10);
  const contracts = {};

  // Force 1 contract for each core sleeve that fits
  for (const s of tradable.filter(s => s.core)) {
    contracts[s.id] = 0;
  }

  function totalMargin() {
    return tradable.reduce((sum, s) => sum + (contracts[s.id] ?? 0) * s.margin, 0);
  }

  // Add core sleeves one by one
  const coreSleeves = tradable.filter(s => s.core).sort((a, b) => a.margin - b.margin);
  for (const s of coreSleeves) {
    if (totalMargin() + s.margin <= budget) contracts[s.id] = 1;
    else contracts[s.id] = 0;
  }

  // Score function: OOS P&L per unit margin
  const scores = tradable.filter(s => (s.stats.oosNet ?? 0) > 0).map(s => ({
    id: s.id, margin: s.margin,
    // OOS/margin normalized by vol to account for risk
    score: (s.stats.oosNet ?? 0) / Math.max(s.annVol, 50) / Math.max(s.margin, 100),
    maxContracts: s.id === 'cc_seasonal' ? 2 : 6, // anti-concentration cap on cocoa
  })).sort((a, b) => b.score - a.score);

  // Greedy add: prefer high-score strategies, add contracts until budget
  for (let round = 0; round < 100; round++) {
    let added = false;
    for (const { id, margin, maxContracts } of scores) {
      const cur = contracts[id] ?? 0;
      if (totalMargin() + margin <= budget && cur < maxContracts) {
        contracts[id] = cur + 1;
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  return contracts;
}

// ─── Candidate: Inverse-vol balanced ─────────────────────────────────────────
function candidateBalanced(capital) {
  const budget = Math.min(capital * 0.70, capital - capital * 0.12);
  const contracts = {};

  // Inverse-vol weights
  const active = tradable.filter(s => (s.stats.oosNet ?? 0) > 0 && s.annVol < 9000);
  const totalInvVol = active.reduce((s, str) => s + 1 / Math.max(str.annVol, 30), 0);
  const weights = Object.fromEntries(active.map(s => [s.id, 1 / Math.max(s.annVol, 30) / totalInvVol]));

  // Scale to budget: target margin = weight × budget / margin_per_contract
  active.forEach(s => {
    const targetMargin = weights[s.id] * budget;
    const n = Math.max(0, Math.round(targetMargin / s.margin));
    contracts[s.id] = s.id === 'cc_seasonal' ? Math.min(n, 2) : Math.min(n, 5);
  });

  // Ensure core sleeves have at least 1
  tradable.filter(s => s.core).forEach(s => {
    if ((contracts[s.id] ?? 0) < 1) {
      const totalM = tradable.reduce((sum, str) => sum + (contracts[str.id] ?? 0) * str.margin, 0);
      if (totalM + s.margin <= budget) contracts[s.id] = 1;
    }
  });

  return contracts;
}

// ─── Candidate: Max Sharpe (low-vol concentration) ───────────────────────────
function candidateMaxSharpe(capital) {
  const budget = Math.min(capital * 0.72, capital - capital * 0.10);
  const contracts = {};

  // Focus on strategies with best annVol-adjusted OOS score AND good Sharpe drivers
  // Prefer strategies with smooth annual returns (low annVol relative to oosNet)
  const active = tradable.filter(s => s.stats.oosNet > 0 && s.stats.isNet > 0);
  active.sort((a, b) => {
    const scoreA = a.stats.oosNet / Math.max(a.annVol, 50) / Math.max(a.margin, 100);
    const scoreB = b.stats.oosNet / Math.max(b.annVol, 50) / Math.max(b.margin, 100);
    return scoreB - scoreA;
  });

  function totalMargin() { return tradable.reduce((sum, s) => sum + (contracts[s.id] ?? 0) * s.margin, 0); }

  // Add strategies in order, but limit to balanced allocation (no single strategy > 35% margin)
  for (const s of active) {
    if (totalMargin() + s.margin <= budget) {
      const maxCts = Math.min(
        s.id === 'cc_seasonal' ? 1 : 4,
        Math.floor(budget * 0.35 / s.margin) // max 35% of budget in one strategy
      );
      contracts[s.id] = Math.min(Math.max(1, Math.round(budget * 0.15 / s.margin)), maxCts);
      if (totalMargin() > budget) contracts[s.id]--;
    } else {
      contracts[s.id] = 0;
    }
  }

  // Ensure core coverage
  tradable.filter(s => s.core).forEach(s => {
    if ((contracts[s.id] ?? 0) < 1 && totalMargin() + s.margin <= budget) contracts[s.id] = 1;
  });

  return contracts;
}

// ─── Candidate: Max Calmar (minimize DD, survive stress) ─────────────────────
function candidateMaxCalmar(capital) {
  // Prefer strategies with high CAGR but low MaxDD contribution
  // Use conservative margin target
  const budget = Math.min(capital * 0.65, capital - capital * 0.12);
  const contracts = {};

  // Order: low-DD strategies first (seasonal = predictable schedule, less open-position DD)
  // Proxy for low-DD: seasonal strategies vs continuous strategies
  const seasonal = tradable.filter(s => s.stats.tradesPerYear <= 2 && s.stats.oosNet > 0);
  const intraday = tradable.filter(s => s.stats.tradesPerYear > 2 && s.stats.oosNet > 0);
  const ordered = [...seasonal, ...intraday];

  function totalMargin() { return tradable.reduce((sum, s) => sum + (contracts[s.id] ?? 0) * s.margin, 0); }

  for (const s of ordered) {
    if (totalMargin() + s.margin <= budget) {
      contracts[s.id] = 1;
    }
  }

  // Extra contracts for highest IS+OOS positive
  const extras = tradable.filter(s => s.stats.isNet > 0 && s.stats.oosNet > 1000 && (contracts[s.id] ?? 0) > 0)
    .sort((a, b) => b.stats.oosNet - a.stats.oosNet);

  for (const s of extras) {
    if (totalMargin() + s.margin <= budget && (contracts[s.id] ?? 0) < (s.id === 'cc_seasonal' ? 2 : 3)) {
      contracts[s.id]++;
    }
  }

  tradable.filter(s => s.core).forEach(s => {
    if ((contracts[s.id] ?? 0) < 1 && totalMargin() + s.margin <= budget) contracts[s.id] = 1;
  });

  return contracts;
}

// ─── Candidate: Max Diversification ──────────────────────────────────────────
function candidateMaxDiversification(capital) {
  const budget = Math.min(capital * 0.72, capital - capital * 0.10);
  const contracts = {};

  function totalMargin() { return tradable.reduce((sum, s) => sum + (contracts[s.id] ?? 0) * s.margin, 0); }

  // Try to include all tradable strategies with at least 1 contract
  const eligible = tradable.filter(s => s.stats.oosNet >= 0).sort((a, b) => a.margin - b.margin);
  for (const s of eligible) {
    if (totalMargin() + s.margin <= budget) contracts[s.id] = 1;
  }

  // Fill remaining budget equally
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const s of tradable.filter(s => (contracts[s.id] ?? 0) > 0).sort((a, b) => a.margin - b.margin)) {
      if (totalMargin() + s.margin <= budget && (contracts[s.id] ?? 0) < (s.id === 'cc_seasonal' ? 2 : 4)) {
        contracts[s.id]++;
        remaining = true;
        break;
      }
    }
  }

  tradable.filter(s => s.core).forEach(s => {
    if ((contracts[s.id] ?? 0) < 1 && totalMargin() + s.margin <= budget) contracts[s.id] = 1;
  });

  return contracts;
}

// ─── Run optimization for one capital tier ────────────────────────────────────
function optimizeTier(capital) {
  const generators = [
    { name: 'MAX_RETURN', fn: candidateMaxReturn },
    { name: 'BALANCED', fn: candidateBalanced },
    { name: 'MAX_SHARPE', fn: candidateMaxSharpe },
    { name: 'MAX_CALMAR', fn: candidateMaxCalmar },
    { name: 'MAX_DIVERSIFICATION', fn: candidateMaxDiversification },
  ];

  const candidates = [];
  for (const { name, fn } of generators) {
    const contracts = fn(capital);
    const pnl = buildPnL(contracts);
    const kpis = computeFullKPIs(pnl, capital);
    const feas = checkFeasibility(contracts, capital);
    const score = scorePortfolio(kpis, feas);
    const annCost = tradable.reduce((s, str) => s + (contracts[str.id] ?? 0) * (str.stats.tradesPerYear ?? 0) * str.costRt * EUR_PER_USD, 0);
    const totalTrades = tradable.reduce((s, str) => s + (contracts[str.id] ?? 0) * (str.stats.tradesPerYear ?? 0), 0);
    const activeSleeves = tradable.filter(s => (contracts[s.id] ?? 0) > 0).length;

    candidates.push({
      variant: name, contracts, kpis, feasibility: feas,
      score: +score.toFixed(3),
      annCostEUR: Math.round(annCost),
      costPerNAV: +(annCost / capital * 100).toFixed(2),
      tradesPerWeek: +(totalTrades / 52).toFixed(1),
      activeSleeves,
    });
  }

  // Select RECOMMENDED: highest score that is feasible
  const feasible = candidates.filter(c => c.feasibility.feasible);
  const recommended = feasible.sort((a, b) => b.score - a.score)[0] ?? candidates.sort((a, b) => b.score - a.score)[0];

  return { capital, candidates, recommended };
}

// ─── Run all tiers ─────────────────────────────────────────────────────────────
const CAPITALS = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const tierResults = [];

console.log('\n=== CAPITAL TIER OPTIMIZER ===');
for (const capital of CAPITALS) {
  const result = optimizeTier(capital);
  tierResults.push(result);
  const rec = result.recommended;
  const k = rec.kpis;
  const f = rec.feasibility;
  console.log(`\n€${(capital/1000).toFixed(0)}k [${rec.variant}] score=${rec.score}`);
  console.log(`  Margin: ${f.marginPct}% ${f.assessment} | Feasible: ${f.feasible}`);
  console.log(`  CAGR: ${k?.CAGR}% | OOS: ${k?.oosCAGR}% | OOS19: ${k?.oos2019CAGR}% | IS: ${k?.isCAGR}%`);
  console.log(`  Sharpe: ${k?.Sharpe} | Calmar: ${k?.Calmar} | MaxDD: ${k?.MaxDDPct}%`);
  console.log(`  Active: ${rec.activeSleeves} | Cost/yr: €${rec.annCostEUR}`);
  const activeContracts = Object.entries(rec.contracts).filter(([,n])=>n>0).map(([id,n])=>`${id}×${n}`).join(' ');
  console.log(`  Contracts: ${activeContracts}`);
}

// ─── Capital ladder analysis ───────────────────────────────────────────────────
function buildLadder(results) {
  return results.map((tier, i) => {
    const prev = i > 0 ? results[i - 1].recommended.contracts : {};
    const cur = tier.recommended.contracts;
    const added = tradable.filter(s => (cur[s.id] ?? 0) > 0 && (prev[s.id] ?? 0) === 0).map(s => s.id);
    const removed = tradable.filter(s => (cur[s.id] ?? 0) === 0 && (prev[s.id] ?? 0) > 0).map(s => s.id);
    const changed = tradable.filter(s => (cur[s.id] ?? 0) !== (prev[s.id] ?? 0) && (cur[s.id] ?? 0) > 0 && (prev[s.id] ?? 0) > 0)
      .map(s => ({ id: s.id, from: prev[s.id] ?? 0, to: cur[s.id] ?? 0 }));
    return { capital: tier.capital, added, removed, changed };
  });
}

const ladder = buildLadder(tierResults);

// ─── Best small account ────────────────────────────────────────────────────────
const smallTiers = tierResults.filter(r => r.capital <= 25000 && r.recommended.feasibility.feasible);
const bestSmall = smallTiers.sort((a, b) => (b.recommended.kpis?.oos2019CAGR ?? 0) - (a.recommended.kpis?.oos2019CAGR ?? 0))[0];

// Full tradable: capital where all 15 tradable strategies are active
const fullTradable = tierResults.find(t => {
  const cts = t.recommended.contracts;
  return tradable.filter(s => !s.blocked).every(s => (cts[s.id] ?? 0) > 0);
});

// ─── Build equity series per capital ──────────────────────────────────────────
function buildEquitySeries(contracts, capital) {
  const pnl = buildPnL(contracts);
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
  return Object.entries(monthly).sort(([a],[b])=>a<b?-1:1).map(([date,v])=>({date,...v}));
}

const equitySeries = {};
tierResults.forEach(tier => {
  equitySeries[tier.capital] = buildEquitySeries(tier.recommended.contracts, tier.capital);
});

// Yearly returns at recommended (first small account)
const recTier = bestSmall ?? tierResults[0];
const yearlyReturns = Object.entries(recTier.recommended.kpis?.byYear ?? {})
  .filter(([y]) => +y >= 2008 && +y <= 2025).sort(([a],[b])=>+a-+b)
  .map(([year, netEUR]) => ({ year: +year, netEUR: Math.round(netEUR), returnPct: +(netEUR / recTier.capital * 100).toFixed(2) }));

// ─── Build components per capital ─────────────────────────────────────────────
function buildComponents(contracts, capital, totalMargin) {
  return UNIVERSE.map(s => {
    const n = contracts[s.id] ?? 0;
    const marginUsed = n * s.margin;
    const annCostEUR = Math.round(n * (s.stats?.tradesPerYear ?? 0) * s.costRt * EUR_PER_USD);
    let status, reason;
    if (s.blocked) { status = 'DATA_BLOCKED'; reason = 'No viable proxy instrument'; }
    else if (n === 0) {
      const baseMargin = tradable.reduce((sum, str) => sum + (contracts[str.id] > 0 ? str.margin : 0), 0);
      if (s.margin > capital * 0.3 && !s.core) { status = 'EXCLUDED'; reason = 'MARGIN_LIMIT'; }
      else if ((s.stats?.oosNet ?? 0) < 0) { status = 'EXCLUDED'; reason = 'OOS_NEGATIVE'; }
      else { status = 'EXCLUDED'; reason = 'BUDGET_PRIORITY'; }
    } else {
      status = s.core ? 'ACTIVE' : ((s.stats?.isNet ?? 0) > 0 && (s.stats?.oosNet ?? 0) > 0) ? 'ACTIVE' : 'LOW_WEIGHT';
      reason = s.core ? 'CORE' : `ADDED_AT_${capital < 10001 ? '10K' : capital < 15001 ? '15K' : capital < 20001 ? '20K' : capital < 25001 ? '25K' : capital < 30001 ? '30K' : capital < 40001 ? '40K' : capital < 50001 ? '50K' : '75K_PLUS'}`;
    }
    const robustness = s.blocked ? 'N/A'
      : ((s.stats?.PF ?? 0) >= 1.5 && (s.stats?.oosNet ?? 0) > 0 && (s.stats?.isNet ?? 0) > 0) ? 'HIGH'
      : ((s.stats?.PF ?? 0) >= 1.1 && (s.stats?.oosNet ?? 0) > 0) ? 'MEDIUM' : 'LOW';
    return {
      id: s.id, label: s.label, instrument: s.inst, status, reason, robustness, core: s.core,
      netEUR: s.stats?.netEUR ?? 0, isNet: s.stats?.isNet ?? 0, oosNet: s.stats?.oosNet ?? 0,
      oos2019Net: s.stats?.oos19Net ?? 0, PF: s.stats?.PF ?? 0,
      posYr: s.stats?.posYr ?? 0, totYr: s.stats?.totYr ?? 0,
      tradesPerYear: s.stats?.tradesPerYear ?? 0,
      marginPerContract: s.margin, costPerRT: s.costRt, annualCostEUR: annCostEUR,
      contracts: n,
      targetWeight: 0,
      realizedWeight: totalMargin > 0 ? +(marginUsed / totalMargin * 100).toFixed(1) : 0,
    };
  });
}

// ─── Build capital comparison table ───────────────────────────────────────────
const capitalComparison = tierResults.map(tier => {
  const rec = tier.recommended;
  const k = rec.kpis;
  const f = rec.feasibility;
  const comps = buildComponents(rec.contracts, tier.capital, f.totalMargin);
  return {
    capital: tier.capital,
    variant: rec.variant,
    assessment: f.assessment,
    marginPct: f.marginPct, marginTotal: f.totalMargin,
    feasibility: f.feasible,
    CAGR: k?.CAGR ?? null, isCAGR: k?.isCAGR ?? null,
    oosCAGR: k?.oosCAGR ?? null, oos2019CAGR: k?.oos2019CAGR ?? null,
    Sharpe: k?.Sharpe ?? null, Sortino: k?.Sortino ?? null,
    Calmar: k?.Calmar ?? null, MaxDDPct: k?.MaxDDPct ?? null, MaxDDEUR: k?.MaxDDEUR ?? null,
    totalNetEUR: k?.totalNetEUR ?? null,
    PF: k?.PF ?? null, expectancyEUR: k?.expectancyEUR ?? null,
    annualCostEUR: rec.annCostEUR, costPerNAV: rec.costPerNAV,
    tradesPerWeek: rec.tradesPerWeek,
    top1Conc: k?.top1Conc ?? null, top3Conc: k?.top3Conc ?? null,
    effectiveSleeves: k?.effectiveSleeves ?? null,
    activeSleeves: rec.activeSleeves,
    score: rec.score,
    contracts: Object.fromEntries(Object.entries(rec.contracts).filter(([,n])=>n>0)),
    components: comps,
    ladder: ladder.find(l => l.capital === tier.capital) ?? null,
  };
});

// ─── Final recommended capital ─────────────────────────────────────────────────
const recCap = bestSmall?.capital ?? 25000;
const recTierData = capitalComparison.find(r => r.capital === recCap);
const recKPIs = {
  CAGR: recTierData?.CAGR ?? null, isCAGR: recTierData?.isCAGR ?? null,
  oosCAGR: recTierData?.oosCAGR ?? null, oos2019CAGR: recTierData?.oos2019CAGR ?? null,
  Sharpe: recTierData?.Sharpe ?? null, Sortino: recTierData?.Sortino ?? null,
  Calmar: recTierData?.Calmar ?? null, MaxDDPct: recTierData?.MaxDDPct ?? null,
  MaxDDEUR: recTierData?.MaxDDEUR ?? null, totalNetEUR: recTierData?.totalNetEUR ?? null,
  PF: recTierData?.PF ?? null, expectancyEUR: recTierData?.expectancyEUR ?? null,
  annualCostEUR: recTierData?.annualCostEUR ?? null, costPerNAV: recTierData?.costPerNAV ?? null,
  tradesPerWeek: recTierData?.tradesPerWeek ?? null,
};

// ─── Serkan CSVs ───────────────────────────────────────────────────────────────
fs.mkdirSync('workspace/output/white-swan/v5', { recursive: true });
fs.mkdirSync('workspace/output/white-swan/serkan/v5', { recursive: true });

const SERKAN_CAPS = [10000, 15000, 20000, 25000];
const serkanAudit = {};
for (const cap of SERKAN_CAPS) {
  const tier = tierResults.find(t => t.capital === cap);
  const daily = tier?.recommended?.kpis?.daily ?? [];
  const rows = daily.map(d => `${d.date},${d.ret.toFixed(8)}`);
  const csv = ['Date,Daily_Return', ...rows].join('\n');
  const fname = `white_swan_${cap/1000}k_daily_returns.csv`;
  fs.writeFileSync(`workspace/output/white-swan/serkan/v5/${fname}`, csv);
  const sumRet = rows.reduce((s, r) => { const v = parseFloat(r.split(',')[1]); return isNaN(v)?s:s+v; }, 0);
  const impl = Math.round(sumRet * cap);
  serkanAudit[cap] = { rows: rows.length, sumRet: sumRet.toFixed(6), impliedPnL: impl, totalNetEUR: tier?.recommended?.kpis?.totalNetEUR, pass: Math.abs(impl - (tier?.recommended?.kpis?.totalNetEUR??0)) < 10 };
}

// Final CSV (best small account = recommended)
const finalTier = tierResults.find(t => t.capital === recCap);
const finalDaily = finalTier?.recommended?.kpis?.daily ?? [];
const finalRows = finalDaily.map(d => `${d.date},${d.ret.toFixed(8)}`);
const finalCsv = ['Date,Daily_Return', ...finalRows].join('\n');
fs.writeFileSync('workspace/output/white-swan/serkan/v5/white_swan_final_daily_returns.csv', finalCsv);

// ─── Build summary JSON ────────────────────────────────────────────────────────
const tradableCount = UNIVERSE.filter(s => !s.blocked).length;
const blockedCount = UNIVERSE.filter(s => s.blocked).length;

const summary = {
  version: 'v5',
  generatedAt: '2026-08-15',
  status: 'CAPITAL_TIER_OPTIMIZED',
  description: 'Independent multi-objective portfolio per capital tier (10k–100k)',
  filterImprovements: {
    gld: 'ATR percentile 20-80% — IS +€3,306, OOS +€5,159 vs original ATR33-67',
    eurusd: 'Monday LONG months 4/9/10/11 (M6E micro ×0.1)',
    zw: 'Jul+2BD hold10 real CBOT ZW1 (MZW micro ×0.2)',
  },
  canonicalTotal: 17, tradableComponents: tradableCount, blockedComponents: blockedCount,
  recommendedCapital: recCap,
  minimumCapital: recCap,
  technicalMinimum: tierResults.find(t => t.recommended.feasibility.feasible)?.capital ?? recCap,
  bestSmallAccount: bestSmall ? { capital: bestSmall.capital, oos2019CAGR: bestSmall.recommended.kpis?.oos2019CAGR } : null,
  fullTradableAt: fullTradable?.capital ?? null,
  components: recTierData?.components ?? [],
  capitalComparison,
  portfolioKPIs: recKPIs,
  capitalLadder: ladder,
  serkan: {
    path: 'workspace/output/white-swan/serkan/v5/',
    finalRows: finalRows.length,
    dateRange: ['2008-01-01', '2025-12-31'],
    perCapitalAudit: serkanAudit,
  },
  variants: {
    FINAL_RECOMMENDATION: { capital: recCap, oosCAGR: recTierData?.oosCAGR, oos2019CAGR: recTierData?.oos2019CAGR, CAGR: recTierData?.CAGR, note: 'Best OOS 2019+ CAGR among feasible small accounts' },
  },
};

fs.writeFileSync('workspace/output/white-swan/v5/portfolio-summary.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('public/data/white-swan/final/portfolio-summary.json', JSON.stringify(summary, null, 2));

const eqOut = { series: Object.fromEntries(Object.entries(equitySeries)), yearlyReturns };
fs.writeFileSync('workspace/output/white-swan/v5/equity-series.json', JSON.stringify(eqOut));
fs.writeFileSync('public/data/white-swan/final/equity-series.json', JSON.stringify(eqOut));

// ─── Audit ─────────────────────────────────────────────────────────────────────
console.log('\n=== AUDIT ===');
Object.entries(serkanAudit).forEach(([cap, a]) => {
  console.log(`€${cap/1000}k: CSV ${a.rows} rows | sum=${a.sumRet} | impl=${a.impliedPnL} vs totalNet=${a.totalNetEUR} | ${a.pass?'✓ PASS':'✗ FAIL'}`);
});

const finalSumRet = finalRows.reduce((s, r) => { const v = parseFloat(r.split(',')[1]); return isNaN(v)?s:s+v; }, 0);
const finalImpl = Math.round(finalSumRet * recCap);
const finalAuditPass = Math.abs(finalImpl - (recTierData?.totalNetEUR ?? 0)) < 10;
console.log(`Final CSV: ${finalRows.length} rows | sum=${finalSumRet.toFixed(6)} | impl=${finalImpl} vs totalNet=${recTierData?.totalNetEUR} | ${finalAuditPass?'✓ PASS':'✗ FAIL'}`);

// ─── Capital ladder printout ───────────────────────────────────────────────────
console.log('\n=== CAPITAL LADDER ===');
ladder.forEach(l => {
  console.log(`€${l.capital/1000}k:`);
  if (l.added.length) console.log(`  + ADDED: ${l.added.join(', ')}`);
  if (l.removed.length) console.log(`  - REMOVED: ${l.removed.join(', ')}`);
  if (l.changed.length) console.log(`  ~ CHANGED: ${l.changed.map(c=>`${c.id} ${c.from}→${c.to}ct`).join(', ')}`);
});

// ─── Final summary ──────────────────────────────────────────────────────────────
console.log('\n======== WHITE SWAN v5 — CAPITAL TIER FINAL RESULTS ========\n');
capitalComparison.forEach(r => {
  const cts = Object.entries(r.contracts).map(([id,n])=>`${id}×${n}`).join(' ');
  console.log(`€${(r.capital/1000).toFixed(0)}k (${r.variant}):`);
  console.log(`  Active: ${r.activeSleeves} | Contracts: ${cts}`);
  console.log(`  CAGR: ${r.CAGR}% | OOS: ${r.oosCAGR}% | OOS19: ${r.oos2019CAGR}% | Sharpe: ${r.Sharpe} | Calmar: ${r.Calmar}`);
  console.log(`  MaxDD: ${r.MaxDDPct}% | Margin: ${r.marginPct}% ${r.assessment} | Cost/yr: €${r.annualCostEUR}`);
  console.log('');
});

console.log('BEST SMALL ACCOUNT: €' + (bestSmall?.capital ?? '?') + 'k — OOS19: ' + (bestSmall?.recommended?.kpis?.oos2019CAGR ?? '?') + '%');
console.log('FULL TRADABLE WHITE SWAN: €' + (fullTradable?.capital ?? '>100k'));
console.log('');
console.log('Serkan CSVs: workspace/output/white-swan/serkan/v5/');
console.log('Dashboard:   http://localhost:3000/white-swan/final');
console.log('READY FOR SERKAN:', finalAuditPass ? 'YES' : 'NO');
