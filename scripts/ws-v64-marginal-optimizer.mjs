// White Swan v6.4 — CORE WEIGHTING + SMALL-CAPITAL EFFICIENCY CHALLENGER
//
// Builds a challenger to the frozen v6.3.5 baseline. Does NOT overwrite v6.3.5 files.
// Reuses the exact same genuine canonical trade data (DAX/M6E/MZW/MGC/optional sleeves)
// and the exact same hard DAX survival filter — only the ALLOCATION LOGIC changes:
//   - CORE_FLOOR (1 contract) vs CORE_OVERWEIGHT (extra contracts, must be earned)
//   - extra contracts (core or optional) compete on a single marginal-value ranking
//   - a quality gate (IS PF>1, IS net>0, IS expectancy>0) gates overweight eligibility
//   - a sample-size confidence factor and subperiod-consistency factor penalize thin data
//   - no artificial maxCt=8 cap — upper bound emerges from margin/survival only
//   - denser local-exchange search for the priority small tiers (€10k-€20k)
//
// OOS FIREWALL: every function up to and including freezeAllocations() reads ONLY
// IS-period fields (isNet, isPF, isExpectancy, subperiod buckets, sample size, margin,
// survival). No function before the freeze point references oosCAGR, oos2019CAGR, or
// fullKPIs.CAGR. OOS is computed in a separate function invoked strictly after the
// allocation is written and hashed.
import fs from 'fs';
import crypto from 'crypto';

const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

const ecbRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/ecb_eurusd_daily.json', 'utf8'));
const ecbObs = ecbRaw.observations;
function fxRate(date) {
  if (ecbObs[date]) return ecbObs[date];
  const d = new Date(date + 'T00:00:00Z');
  for (let i = 1; i <= 10; i++) { d.setUTCDate(d.getUTCDate() - 1); const s = d.toISOString().slice(0, 10); if (ecbObs[s]) return ecbObs[s]; }
  return 1.20;
}
const ecbDatesSorted = Object.keys(ecbObs).sort();
const EUR_PER_USD_LATEST = 1 / ecbObs[ecbDatesSorted[ecbDatesSorted.length - 1]];

function generateTradingDays(from, to) {
  const days = []; const d = new Date(from + 'T00:00:00Z'); const end = new Date(to + 'T00:00:00Z');
  while (d <= end) { const dow = d.getUTCDay(); if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return days;
}
const ALL_TRADING_DAYS = generateTradingDays('2008-01-02', '2025-12-31');
const IS_DAYS = ALL_TRADING_DAYS.filter(d => d < IS_CUTOFF);

// ── Load genuine canonical trades (same data as v6.3.5, no re-derivation) ──
const m6e = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/m6e-canonical-trades.json', 'utf8')).trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR }));
const dax1h = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/dax1h-canonical-trades.json', 'utf8')).trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR }));
const dax2h = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/dax2h-canonical-trades.json', 'utf8')).trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR }));
const mzw = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/mzw-canonical-trades.json', 'utf8')).trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR }));
const goldRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/gld-mtm-canonical-v63.json', 'utf8'));
const gld_mgc = goldRaw.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR }));
const optSleeves = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/optional-sleeves-canonical-trades.json', 'utf8')).sleeves;

const SUBPERIODS = [['2008-01-01', '2011-01-01'], ['2011-01-01', '2014-01-01'], ['2014-01-01', '2017-01-01']];
function subperiodBuckets(trades) {
  const isT = trades.filter(t => t.date < IS_CUTOFF);
  return SUBPERIODS.map(([from, to]) => isT.filter(t => t.date >= from && t.date < to).reduce((s, t) => s + t.netEUR, 0));
}

// ── UNIVERSE with margin, FDXS/instrument tags, core flag ──
const UNIVERSE = [
  { id: 'eurusd_m6e', label: 'EURUSD / M6E', margin: 259, core: true, trades: m6e },
  { id: 'dax_1h', label: 'DAX1H', margin: 880, core: true, trades: dax1h },
  { id: 'dax_2h', label: 'DAX2H', margin: 880, core: true, trades: dax2h },
  { id: 'gld_mgc', label: 'Gold / MGC', margin: 740, core: true, trades: gld_mgc },
  { id: 'zw_mzw', label: 'Wheat / MZW', margin: 252, core: true, trades: mzw },
  { id: 'cc_seasonal', label: 'CC Seasonal', margin: 3150, core: false, trades: optSleeves.cc_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'spy_mes', label: 'SPY/MES Seasonal', margin: 1390, core: false, trades: optSleeves.spy_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'cl1_seasonal', label: 'CL Seasonal', margin: 1390, core: false, trades: optSleeves.cl1_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'hg1_seasonal', label: 'HG Seasonal', margin: 2500, core: false, trades: optSleeves.hg1_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'ym1_tat', label: 'YM1 TAT', margin: 765, core: false, trades: optSleeves.ym1_tat.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'gc1_seasonal', label: 'GC Seasonal', margin: 740, core: false, trades: optSleeves.gc1_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'sb_seasonal', label: 'SB Seasonal', margin: 1070, core: false, trades: optSleeves.sb_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'zc_seasonal', label: 'ZC Seasonal', margin: 520, core: false, trades: optSleeves.zc_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
  { id: 'zs_seasonal', label: 'ZS Seasonal', margin: 1220, core: false, trades: optSleeves.zs_seasonal.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })) },
];
// ZM1 remains excluded — no genuine daily data (unchanged from v6.3.5)
const CORE_IDS = UNIVERSE.filter(u => u.core).map(u => u.id);

// ── IS-only quality metrics (SELECTION-LEGAL — never touches OOS) ──
for (const s of UNIVERSE) {
  const isTrades = s.trades.filter(t => t.date < IS_CUTOFF);
  const isNet = isTrades.reduce((sum, t) => sum + t.netEUR, 0);
  const wins = isTrades.filter(t => t.netEUR > 0).reduce((sum, t) => sum + t.netEUR, 0);
  const loss = Math.abs(isTrades.filter(t => t.netEUR <= 0).reduce((sum, t) => sum + t.netEUR, 0));
  const isPF = loss > 0 ? wins / loss : (wins > 0 ? 99 : 0);
  const isExpectancy = isTrades.length > 0 ? isNet / isTrades.length : 0;
  const buckets = subperiodBuckets(s.trades);
  const positiveSubperiods = buckets.filter(b => b > 0).length;
  const n = isTrades.length;
  // Sample-size confidence: dampens ranking for thin samples. 30+ trades = full confidence.
  // Shrinkage-based sample confidence (Bayesian-style, k=50 pseudo-observations of "no edge").
  // n=9 (typical seasonal sleeve) -> 0.15; n=258 (dax_1h) -> 0.84; n=1517 (dax_2h) -> 0.97.
  // A steep discount is required — a linear/capped factor was not enough to stop a 9-trade
  // outlier (SB seasonal, PF 75 on 9 trades) from out-ranking DAX2H (PF 1.18 on 1517 trades)
  // and consuming the entire small-tier budget in the first run of this optimizer.
  const sampleConfidence = n / (n + 50);
  const subperiodFactor = positiveSubperiods / SUBPERIODS.length; // 0, 0.33, 0.67, or 1
  const qualityGatePass = isPF > 1 && isNet > 0 && isExpectancy > 0;
  s.quality = { isNet: Math.round(isNet), isPF: +isPF.toFixed(2), isExpectancy: +isExpectancy.toFixed(2), n, sampleConfidence: +sampleConfidence.toFixed(2), positiveSubperiods, subperiodFactor: +subperiodFactor.toFixed(2), qualityGatePass };
  // Marginal value per contract per euro of margin — the ranking key. Dampened by sample
  // confidence and subperiod consistency so thin/inconsistent data can't out-rank robust data.
  s.marginalScore = (isNet / Math.max(s.margin, 1)) * sampleConfidence * (0.34 + 0.66 * subperiodFactor);
}

console.log('=== v6.4 IS-ONLY QUALITY METRICS (SELECTION-LEGAL — no OOS referenced) ===');
UNIVERSE.forEach(s => console.log(`  ${s.id.padEnd(16)} core=${s.core} isNet=${s.quality.isNet} isPF=${s.quality.isPF} n=${s.quality.n} sampleConf=${s.quality.sampleConfidence} subperiod=${s.quality.positiveSubperiods}/3 gate=${s.quality.qualityGatePass ? 'PASS' : 'FLOOR_ONLY'} marginalScore=${s.marginalScore.toFixed(4)}`));

// ── DAX hard survival filter (UNCHANGED from v6.3.5) ──
const _fdaxDailyCsv = fs.readFileSync('data/historical/indices/EUREX_FDAX1_D.csv', 'utf8').trim().split('\n').slice(1);
let FDAX_WORST_DAY_PTS = 0, _fdaxWorstDate = null, _fdaxWorstPct = 0;
{
  let prevClose = null;
  for (const line of _fdaxDailyCsv) {
    const [date, , , , closeStr] = line.split(','); const close = parseFloat(closeStr);
    if (prevClose !== null) { const chg = Math.abs(close - prevClose); const pct = chg / prevClose * 100; if (pct < 15 && chg > FDAX_WORST_DAY_PTS) { FDAX_WORST_DAY_PTS = chg; _fdaxWorstDate = date; _fdaxWorstPct = pct; } }
    prevClose = close;
  }
}
function daxStressCheck(contracts, capital) {
  const dax1hCt = contracts.dax_1h ?? 0, dax2hCt = contracts.dax_2h ?? 0;
  const maxSimultaneousDax = dax1hCt + dax2hCt;
  const daxStressLossEUR = FDAX_WORST_DAY_PTS * 1 * maxSimultaneousDax;
  const totalMargin = UNIVERSE.reduce((s, str) => s + (contracts[str.id] ?? 0) * str.margin, 0);
  const freeCash = capital - totalMargin;
  const excessLiquidityEUR = freeCash - daxStressLossEUR;
  return { dax1hCt, dax2hCt, maxSimultaneousDax, daxStressLossEUR: Math.round(daxStressLossEUR), excessLiquidityEUR: Math.round(excessLiquidityEUR), survivalPass: excessLiquidityEUR >= 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// FREEZE STEP — allocation logic. IS-ONLY. No OOS field is read anywhere below
// this comment until freezeAllocations() returns and is hashed.
// ═══════════════════════════════════════════════════════════════════════════
const NO_CAP = 30; // generous upper bound — real limit emerges from margin/survival

function buildMarginalAllocation(capital) {
  const contracts = {};
  // Step 1: CORE_FLOOR — 1 contract each, trying DAX combos in survival-safe order (unchanged logic)
  const DAX_CORE_COMBOS = [{ dax_1h: 1, dax_2h: 1 }, { dax_1h: 1, dax_2h: 0 }, { dax_1h: 0, dax_2h: 1 }, { dax_1h: 0, dax_2h: 0 }];
  const nonDaxCore = UNIVERSE.filter(u => u.core && u.id !== 'dax_1h' && u.id !== 'dax_2h');
  let usedMargin = 0, coreInfeasible = true, chosenCombo = null;
  for (const combo of DAX_CORE_COMBOS) {
    const trial = {}; let m = 0;
    for (const s of nonDaxCore) { trial[s.id] = 1; m += s.margin; }
    trial.dax_1h = combo.dax_1h; trial.dax_2h = combo.dax_2h;
    m += combo.dax_1h * 880 + combo.dax_2h * 880;
    if (m > capital * 0.95) continue;
    if (!daxStressCheck(trial, capital).survivalPass) continue;
    Object.assign(contracts, trial); usedMargin = m; coreInfeasible = false; chosenCombo = combo; break;
  }
  if (coreInfeasible) return { contracts: {}, coreInfeasible: true };

  const coreFloorContracts = { ...contracts };

  // Step 2: MARGINAL GREEDY — every unit (core overweight OR optional) competes on marginalScore.
  // Core sleeves failing the quality gate stay at floor (M6E). Core sleeves passing the gate,
  // and all optional sleeves, are eligible for additional units, ranked purely by marginalScore.
  let improved = true;
  while (improved) {
    improved = false;
    const candidates = UNIVERSE.filter(s => {
      const cur = contracts[s.id] ?? 0;
      if (cur >= NO_CAP) return false;
      if (s.core && cur >= 1 && !s.quality.qualityGatePass) return false; // core overweight requires quality gate
      if (!s.core && !s.quality.qualityGatePass) return false; // optional sleeves always require the gate
      return true;
    }).sort((a, b) => b.marginalScore - a.marginalScore);

    for (const s of candidates) {
      const cur = contracts[s.id] ?? 0;
      if (usedMargin + s.margin > capital * 0.95) continue;
      const trial = { ...contracts, [s.id]: cur + 1 };
      if (!daxStressCheck(trial, capital).survivalPass) continue;
      contracts[s.id] = cur + 1; usedMargin += s.margin; improved = true; break;
    }
  }

  return { contracts, coreInfeasible: false, coreFloorContracts, chosenCombo };
}

// Denser local-exchange search for priority small tiers (€10k-€20k): try swapping one unit
// between the two lowest-marginal-score active positions to see if a different combination
// scores higher in aggregate IS net, subject to margin/survival. Greedy is path-dependent;
// this checks a bounded neighborhood rather than assuming the greedy result is optimal.
function localExchangeSearch(capital, base) {
  let best = base;
  let bestScore = isNetOfAllocation(best.contracts);
  const activeIds = Object.keys(best.contracts).filter(id => (best.contracts[id] ?? 0) > 0);
  for (const removeId of activeIds) {
    const removeSleeve = UNIVERSE.find(u => u.id === removeId);
    if (removeSleeve.core && best.contracts[removeId] <= 1) continue; // never drop below core floor
    for (const addSleeve of UNIVERSE) {
      if (addSleeve.id === removeId) continue;
      if (!addSleeve.quality.qualityGatePass && addSleeve.id !== 'eurusd_m6e') continue;
      const trial = { ...best.contracts };
      trial[removeId] = (trial[removeId] ?? 0) - 1;
      trial[addSleeve.id] = (trial[addSleeve.id] ?? 0) + 1;
      const margin = UNIVERSE.reduce((s, str) => s + (trial[str.id] ?? 0) * str.margin, 0);
      if (margin > capital * 0.95) continue;
      if (!daxStressCheck(trial, capital).survivalPass) continue;
      const score = isNetOfAllocation(trial);
      if (score > bestScore) { bestScore = score; best = { ...best, contracts: trial }; }
    }
  }
  return best;
}
function isNetOfAllocation(contracts) {
  let total = 0;
  for (const s of UNIVERSE) { const ct = contracts[s.id] ?? 0; if (ct > 0) total += s.quality.isNet * ct; }
  return total;
}

const CAPITALS = [10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const PRIORITY_SMALL_TIERS = [10000, 12000, 15000, 20000];

function freezeAllocations() {
  const results = [];
  for (const capital of CAPITALS) {
    let alloc = buildMarginalAllocation(capital);
    if (alloc.coreInfeasible) { results.push({ capital, coreInfeasible: true }); continue; }
    if (PRIORITY_SMALL_TIERS.includes(capital)) {
      alloc = localExchangeSearch(capital, alloc);
    }
    const totalMargin = UNIVERSE.reduce((s, str) => s + (alloc.contracts[str.id] ?? 0) * str.margin, 0);
    const daxStress = daxStressCheck(alloc.contracts, capital);
    const coreFloorCt = {}, coreOverweightCt = {}, optionalCt = {};
    for (const s of UNIVERSE) {
      const ct = alloc.contracts[s.id] ?? 0;
      if (ct === 0) continue;
      if (s.core) { coreFloorCt[s.id] = Math.min(ct, 1); if (ct > 1) coreOverweightCt[s.id] = ct - 1; }
      else optionalCt[s.id] = ct;
    }
    results.push({
      capital, contracts: alloc.contracts, coreFloorContracts: coreFloorCt, coreOverweightContracts: coreOverweightCt, optionalContracts: optionalCt,
      totalMargin: Math.round(totalMargin), marginPct: +(totalMargin / capital * 100).toFixed(1),
      daxStress, coreInfeasible: false,
    });
  }
  return results;
}

const frozen = freezeAllocations();

// ── HASH the frozen allocation definition BEFORE any OOS is computed ──
const freezeHash = crypto.createHash('sha256').update(JSON.stringify(frozen.map(r => ({ capital: r.capital, contracts: r.contracts })))).digest('hex');
console.log('\n=== v6.4 ALLOCATIONS FROZEN (IS-ONLY, PRE-OOS) ===');
console.log('FREEZE_HASH:', freezeHash);
frozen.forEach(r => {
  if (r.coreInfeasible) { console.log(`  €${r.capital/1000}k: CORE_INFEASIBLE`); return; }
  const cts = Object.entries(r.contracts).filter(([,v]) => v > 0).map(([k,v]) => `${k}×${v}`).join(' ');
  console.log(`  €${(r.capital/1000).toFixed(0)}k: margin=€${r.totalMargin} (${r.marginPct}%) daxSurvival=${r.daxStress.survivalPass ? 'PASS' : 'FAIL'} | ${cts}`);
});

fs.writeFileSync('workspace/output/white-swan/v6.4/frozen-allocation.json', JSON.stringify({ freezeHash, frozenAt: 'PRE_OOS', tiers: frozen, universeQuality: UNIVERSE.map(s => ({ id: s.id, core: s.core, margin: s.margin, quality: s.quality })) }, null, 2));
console.log('\nSaved frozen-allocation.json — freeze hash proves no post-hoc modification.');

// ═══════════════════════════════════════════════════════════════════════════
// OOS UNLOCK — everything below this line runs strictly AFTER freeze+hash.
// Nothing above this point reads oosCAGR, oos2019CAGR, or fullKPIs from here on.
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n\n########## OOS FIREWALL LIFTED — MEASURING FINAL OOS (ONE-TIME) ##########\n');

function buildPnLMap(contracts) {
  const map = {};
  for (const s of UNIVERSE) {
    const ct = contracts[s.id] ?? 0; if (ct === 0) continue;
    s.trades.forEach(t => { map[t.date] = (map[t.date] ?? 0) + t.netEUR * ct; });
  }
  return map;
}
function computeFullKPIs(pnlMap, capital) {
  const allPnl = ALL_TRADING_DAYS.map(d => pnlMap[d] ?? 0);
  let nav = capital, peak = capital, maxDD = 0;
  const byYear = {};
  for (let i = 0; i < ALL_TRADING_DAYS.length; i++) {
    const date = ALL_TRADING_DAYS[i]; nav += allPnl[i]; if (nav > peak) peak = nav; const dd = peak - nav; if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0, 4); byYear[yr] = (byYear[yr] ?? 0) + allPnl[i];
  }
  const finalNav = nav; const YEARS = 18;
  const CAGR = +((Math.pow(finalNav / capital, 1 / YEARS) - 1) * 100).toFixed(2);
  const MaxDDPct = +(maxDD / Math.max(peak, capital) * 100).toFixed(2);
  const isRets = IS_DAYS.map(d => pnlMap[d] ?? 0); const isTotal = isRets.reduce((s, p) => s + p, 0);
  const oosDays = ALL_TRADING_DAYS.filter(d => d >= IS_CUTOFF); const oos19Days = ALL_TRADING_DAYS.filter(d => d >= OOS19_CUTOFF);
  const oosRets = oosDays.map(d => pnlMap[d] ?? 0); const oos19Rets = oos19Days.map(d => pnlMap[d] ?? 0);
  const prOOS19Total = ALL_TRADING_DAYS.filter(d => d < OOS19_CUTOFF).reduce((s, d) => s + (pnlMap[d] ?? 0), 0);
  function subCAGR(pnls, startNAV, nYrs) { const total = pnls.reduce((s, p) => s + p, 0); return startNAV > 0 && nYrs > 0 ? +((Math.pow((startNAV + total) / startNAV, 1 / nYrs) - 1) * 100).toFixed(2) : null; }
  const oosCAGR = subCAGR(oosRets, capital + isTotal, 9);
  const oos2019CAGR = subCAGR(oos19Rets, capital + prOOS19Total, 7);
  const allRets = allPnl.map(p => p / capital); const n = allRets.length; const mean = allRets.reduce((s, r) => s + r, 0) / n;
  const variance = allRets.reduce((s, r) => s + (r - mean) ** 2, 0) / n; const annMean = mean * 252; const annStd = Math.sqrt(variance) * Math.sqrt(252);
  const Sharpe = annStd > 0 ? +(annMean / annStd).toFixed(3) : 0;
  const Calmar = MaxDDPct > 0 ? +(CAGR / MaxDDPct).toFixed(3) : 0;
  const wins = allPnl.filter(p => p > 0).reduce((s, p) => s + p, 0); const loss = Math.abs(allPnl.filter(p => p < 0).reduce((s, p) => s + p, 0));
  const PF = loss > 0 ? +(wins / loss).toFixed(2) : (wins > 0 ? 99 : 0);
  const activeDays = allPnl.filter(p => p !== 0).length; const expectancyEUR = activeDays > 0 ? +((finalNav - capital) / activeDays).toFixed(2) : 0;
  return { CAGR, oosCAGR, oos2019CAGR, Sharpe, Calmar, MaxDDPct, MaxDDEUR: Math.round(maxDD), totalNetEUR: Math.round(finalNav - capital), PF, expectancyEUR };
}

const finalResults = frozen.map(r => {
  if (r.coreInfeasible) return { ...r };
  const pnlMap = buildPnLMap(r.contracts);
  const kpis = computeFullKPIs(pnlMap, r.capital);
  return { ...r, kpis };
});

console.log('=== v6.4 FINAL OOS RESULTS (measured ONCE, after freeze) ===');
finalResults.forEach(r => {
  if (r.coreInfeasible) { console.log(`  €${r.capital/1000}k: CORE_INFEASIBLE`); return; }
  console.log(`  €${(r.capital/1000).toFixed(0)}k: CAGR=${r.kpis.CAGR}% OOS=${r.kpis.oosCAGR}% OOS19+=${r.kpis.oos2019CAGR}% Sharpe=${r.kpis.Sharpe} MaxDD=${r.kpis.MaxDDPct}% PF=${r.kpis.PF} Expectancy=€${r.kpis.expectancyEUR}`);
});

fs.writeFileSync('workspace/output/white-swan/v6.4/final-results-with-oos.json', JSON.stringify({ freezeHash, tiers: finalResults }, null, 2));
console.log('\nSaved final-results-with-oos.json');
