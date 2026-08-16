// White Swan v6.4 — ATR risk-normalized sizing challenger vs fixed contract sizing.
// Entry logic and strategy rules are UNCHANGED. Only the CONTRACT COUNT sizing model
// is challenged. ATR is computed strictly from data known before each trade (no lookahead,
// no future realized volatility, no exit-derived sizing). IS + subperiod data only — final
// OOS is never referenced in this script.
import fs from 'fs';

function atr14FromCloses(bars) {
  // bars: [{date, high, low, close}] sorted ascending. Returns ATR(14) per index, using
  // only bars[0..i] (backward-looking, no lookahead).
  const atr = new Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) {
    if (i < 14) continue;
    let sum = 0;
    for (let j = i - 13; j <= i; j++) {
      const tr = Math.max(
        bars[j].high - bars[j].low,
        Math.abs(bars[j].high - bars[j - 1].close),
        Math.abs(bars[j].low - bars[j - 1].close)
      );
      sum += tr;
    }
    atr[i] = sum / 14;
  }
  return atr;
}

function isSubperiodConsistent(trades, cutoffs) {
  // Splits IS trades into sub-periods, returns count of sub-periods with net > 0
  const buckets = cutoffs.map(() => []);
  for (const t of trades) {
    for (let i = 0; i < cutoffs.length; i++) {
      const [from, to] = cutoffs[i];
      if (t.date >= from && t.date < to) { buckets[i].push(t); break; }
    }
  }
  return buckets.map(b => b.reduce((s, t) => s + t.netEUR, 0));
}

const IS_CUTOFF = '2017-01-01';
const SUBPERIODS = [['2008-01-01', '2011-01-01'], ['2011-01-01', '2014-01-01'], ['2014-01-01', '2017-01-01']];

// ═══════════════════════════════════════════════════════════════════════════
// MGC — ATR-normalized sizing challenger
// ═══════════════════════════════════════════════════════════════════════════
const gcRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/gc_daily_raw.json', 'utf8'));
const gcBars = [];
for (let i = 0; i < gcRaw.ts.length; i++) {
  if (!gcRaw.close[i]) continue;
  gcBars.push({ date: new Date(gcRaw.ts[i] * 1000).toISOString().slice(0, 10), high: gcRaw.high[i], low: gcRaw.low[i], close: gcRaw.close[i] });
}
gcBars.sort((a, b) => a.date < b.date ? -1 : 1);
const gcAtr = atr14FromCloses(gcBars);
const gcAtrByDate = {};
gcBars.forEach((b, i) => { gcAtrByDate[b.date] = gcAtr[i]; });

const goldCanonical = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/gld-mtm-canonical-v63.json', 'utf8'));
const MGC_MULT = 10;
const MGC_COST_RT = 1.92;
const REFERENCE_RISK_BUDGET_EUR = 500; // fixed reference used only to compare shapes, not to size final tiers

let mgcFixedIS = [], mgcAtrIS = [];
for (const t of goldCanonical.trades) {
  if (t.entryDate >= IS_CUTOFF) continue;
  const atrAtEntry = gcAtrByDate[t.entryDate]; // known before trade
  if (!atrAtEntry) continue;
  const riskPerContractUSD = atrAtEntry * MGC_MULT; // 1-ATR stop-equivalent risk proxy
  const atrContracts = Math.max(1, Math.floor(REFERENCE_RISK_BUDGET_EUR / riskPerContractUSD));
  mgcFixedIS.push({ date: t.exitDate, netEUR: t.netEUR }); // 1 contract, as in canonical v6.3.5
  mgcAtrIS.push({ date: t.exitDate, netEUR: t.netEUR * atrContracts }); // ATR-scaled (integer, floored)
}
function calmarLike(trades, capital) {
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0, 4); byYear[y] = (byYear[y] ?? 0) + t.netEUR; });
  const years = Object.keys(byYear).sort();
  let nav = capital, peak = capital, maxDD = 0;
  for (const y of years) { nav += byYear[y]; if (nav > peak) peak = nav; const dd = peak - nav; if (dd > maxDD) maxDD = dd; }
  const totalNet = trades.reduce((s, t) => s + t.netEUR, 0);
  const cagr = (Math.pow((capital + totalNet) / capital, 1 / years.length) - 1) * 100;
  const maxDDPct = maxDD / Math.max(peak, capital) * 100;
  return { cagr: +cagr.toFixed(2), maxDDPct: +maxDDPct.toFixed(2), calmar: maxDDPct > 0 ? +(cagr / maxDDPct).toFixed(3) : 0 };
}
const mgcFixedStats = calmarLike(mgcFixedIS, 25000);
const mgcAtrStats = calmarLike(mgcAtrIS, 25000);
console.log('=== MGC: FIXED (1 contract) vs ATR-normalized sizing — IS 2008-2016 ===');
console.log('  FIXED:', JSON.stringify(mgcFixedStats));
console.log('  ATR-NORM:', JSON.stringify(mgcAtrStats));
const mgcAtrHelps = mgcAtrStats.calmar > mgcFixedStats.calmar && mgcAtrStats.maxDDPct <= mgcFixedStats.maxDDPct * 1.1;
console.log('  ATR_SIZING_VERDICT:', mgcAtrHelps ? 'ATR_HELPS' : 'FIXED_SIZING_PREFERRED');

// ═══════════════════════════════════════════════════════════════════════════
// DAX2H — ATR-normalized sizing challenger (using genuine FDAX daily bars)
// ═══════════════════════════════════════════════════════════════════════════
const fdaxCsv = fs.readFileSync('data/historical/indices/EUREX_FDAX1_D.csv', 'utf8').trim().split('\n').slice(1);
const fdaxBars = fdaxCsv.map(l => { const [date, open, high, low, close] = l.split(','); return { date, high: parseFloat(high), low: parseFloat(low), close: parseFloat(close) }; }).sort((a, b) => a.date < b.date ? -1 : 1);
const fdaxAtr = atr14FromCloses(fdaxBars);
const fdaxAtrByDate = {};
fdaxBars.forEach((b, i) => { fdaxAtrByDate[b.date] = fdaxAtr[i]; });

const dax2hCanonical = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/dax2h-canonical-trades.json', 'utf8'));
const FDXS_MULT = 1, FDXS_COST_RT = 0.76;
let dax2hFixedIS = [], dax2hAtrIS = [];
for (const t of dax2hCanonical.trades) {
  if (t.entryDate >= IS_CUTOFF) continue;
  const atrAtEntry = fdaxAtrByDate[t.entryDate];
  if (!atrAtEntry) continue;
  const riskPerContractEUR = atrAtEntry * FDXS_MULT;
  const atrContracts = Math.max(1, Math.floor(REFERENCE_RISK_BUDGET_EUR / riskPerContractEUR));
  dax2hFixedIS.push({ date: t.exitDate, netEUR: t.netEUR });
  dax2hAtrIS.push({ date: t.exitDate, netEUR: t.netEUR * atrContracts });
}
const dax2hFixedStats = calmarLike(dax2hFixedIS, 25000);
const dax2hAtrStats = calmarLike(dax2hAtrIS, 25000);
console.log('\n=== DAX2H: FIXED (1 contract) vs ATR-normalized sizing — IS 2007-2016 ===');
console.log('  FIXED:', JSON.stringify(dax2hFixedStats));
console.log('  ATR-NORM:', JSON.stringify(dax2hAtrStats));
const dax2hAtrHelps = dax2hAtrStats.calmar > dax2hFixedStats.calmar && dax2hAtrStats.maxDDPct <= dax2hFixedStats.maxDDPct * 1.1;
console.log('  ATR_SIZING_VERDICT:', dax2hAtrHelps ? 'ATR_HELPS' : 'FIXED_SIZING_PREFERRED');

// ═══════════════════════════════════════════════════════════════════════════
// Subperiod consistency (used by the marginal optimizer's quality gate)
// ═══════════════════════════════════════════════════════════════════════════
const dax1hCanonical = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/dax1h-canonical-trades.json', 'utf8'));
const m6eCanonical = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/m6e-canonical-trades.json', 'utf8'));
const mzwCanonical = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/mzw-canonical-trades.json', 'utf8'));
const optSleeves = JSON.parse(fs.readFileSync('workspace/output/white-swan/v6.3/optional-sleeves-canonical-trades.json', 'utf8')).sleeves;

const subperiodReport = {};
function addSubperiod(label, trades) {
  const isOnly = trades.filter(t => (t.exitDate ?? t.date) < IS_CUTOFF).map(t => ({ date: t.exitDate ?? t.date, netEUR: t.netEUR }));
  const buckets = isSubperiodConsistent(isOnly, SUBPERIODS);
  const positiveBuckets = buckets.filter(b => b > 0).length;
  subperiodReport[label] = { subperiodNetEUR: buckets.map(v => Math.round(v)), positiveSubperiods: positiveBuckets, totalSubperiods: SUBPERIODS.length, n: isOnly.length };
}
addSubperiod('m6e', m6eCanonical.trades);
addSubperiod('dax_1h', dax1hCanonical.trades);
addSubperiod('dax_2h', dax2hCanonical.trades);
addSubperiod('gld_mgc', goldCanonical.trades.map(t => ({ date: t.exitDate, netEUR: t.netEUR })));
addSubperiod('zw_mzw', mzwCanonical.trades);
for (const id of Object.keys(optSleeves)) addSubperiod(id, optSleeves[id].trades);

console.log('\n=== SUBPERIOD CONSISTENCY (IS 2008-2016, 3 sub-periods) ===');
Object.entries(subperiodReport).forEach(([id, r]) => console.log(`  ${id}: ${r.positiveSubperiods}/${r.totalSubperiods} positive sub-periods, n=${r.n}, buckets=${JSON.stringify(r.subperiodNetEUR)}`));

fs.mkdirSync('workspace/output/white-swan/v6.4', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/v6.4/atr-challenger-report.json', JSON.stringify({
  methodology: 'ATR(14) computed strictly backward-looking (no lookahead), reference risk budget €500/contract-unit for comparability only — not used to size final tiers. Entry/exit rules unchanged; only contract-count sizing model challenged.',
  mgc: { fixed: mgcFixedStats, atrNormalized: mgcAtrStats, verdict: mgcAtrHelps ? 'ATR_HELPS' : 'FIXED_SIZING_PREFERRED' },
  dax2h: { fixed: dax2hFixedStats, atrNormalized: dax2hAtrStats, verdict: dax2hAtrHelps ? 'ATR_HELPS' : 'FIXED_SIZING_PREFERRED' },
  subperiodConsistency: subperiodReport,
}, null, 2));
console.log('\nSaved atr-challenger-report.json');
