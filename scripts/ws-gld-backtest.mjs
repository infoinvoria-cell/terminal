// White Swan: GLD/MGC Thursday Long backtest with real GC daily OHLCV
import fs from 'fs';
import path from 'path';

const EUR_PER_USD = 0.81677;
const MGC_MULTIPLIER = 10;   // 10 oz per MGC contract
const MGC_COST_RT = 0.58;    // USD round-trip IBKR
const IS_CUTOFF = '2017-01-01';
const START_YEAR = 2008;

// ── Load GC data ─────────────────────────────────────────────────────────────
const gcRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/gc_daily_raw.json', 'utf8'));
const bars = [];
for (let i = 0; i < gcRaw.ts.length; i++) {
  if (!gcRaw.close[i]) continue;
  bars.push({
    date: new Date(gcRaw.ts[i] * 1000).toISOString().slice(0, 10),
    open: gcRaw.open[i], high: gcRaw.high[i], low: gcRaw.low[i], close: gcRaw.close[i],
  });
}
bars.sort((a, b) => (a.date < b.date ? -1 : 1));

// ── Indicators ───────────────────────────────────────────────────────────────
function sma(arr, period, i) {
  if (i < period - 1) return null;
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += arr[j].close;
  return s / period;
}
function atr14(arr, i) {
  const p = 14;
  if (i < p) return null;
  let sum = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const tr = Math.max(arr[j].high - arr[j].low, Math.abs(arr[j].high - arr[j-1].close), Math.abs(arr[j].low - arr[j-1].close));
    sum += tr;
  }
  return sum / p;
}

for (let i = 0; i < bars.length; i++) {
  bars[i].ma50  = sma(bars, 50, i);
  bars[i].ma100 = sma(bars, 100, i);
  bars[i].ma200 = sma(bars, 200, i);
  bars[i].atr   = atr14(bars, i);
  bars[i].ma50slope = (i >= 55 && bars[i].ma50 && sma(bars, 50, i-5))
    ? (bars[i].ma50 - sma(bars, 50, i-5)) / sma(bars, 50, i-5) * 100
    : null;
  // weekly momentum: compare close vs close 5bd ago
  bars[i].mom5 = i >= 5 ? (bars[i].close - bars[i-5].close) / bars[i-5].close * 100 : null;
}

// ATR percentile rolling 252d
const ATR_WINDOW = 252;
for (let i = 0; i < bars.length; i++) {
  if (i < ATR_WINDOW || !bars[i].atr) { bars[i].atrPct = null; continue; }
  const vals = bars.slice(i - ATR_WINDOW, i + 1).map(b => b.atr).filter(v => v !== null).sort((a,b) => a-b);
  const rank = vals.indexOf(bars[i].atr);
  bars[i].atrPct = rank / vals.length;
}

const gcByDate = {};
bars.forEach(b => { gcByDate[b.date] = b; });

// ── Helpers ───────────────────────────────────────────────────────────────────
const getDow   = d => new Date(d + 'T00:00:00Z').getUTCDay();
const getMonth = d => new Date(d + 'T00:00:00Z').getUTCMonth() + 1;
const getYear  = d => parseInt(d.slice(0, 4));

const thursdayBars = bars.filter(b => getDow(b.date) === 4 && getYear(b.date) >= START_YEAR);
console.log('Thursday bars (2008+, with MA200):', thursdayBars.filter(b => b.ma200).length);

// ── Strategy tester ───────────────────────────────────────────────────────────
function testStrategy({ label, filterFn, holdBars }) {
  const trades = [];
  for (const b of thursdayBars) {
    if (!b.ma200 || !b.atr) continue;
    if (!filterFn(b)) continue;
    const bIdx = bars.indexOf(b);
    let fwd = 0;
    let exitBar = null;
    for (let k = bIdx + 1; k < bars.length; k++) {
      fwd++;
      if (fwd === holdBars) { exitBar = bars[k]; break; }
    }
    if (!exitBar) continue;
    const grossUSD = (exitBar.close - b.close) * MGC_MULTIPLIER;
    const netUSD   = grossUSD - MGC_COST_RT;
    const netEUR   = netUSD * EUR_PER_USD;
    trades.push({ date: b.date, netEUR, grossUSD, year: getYear(b.date), IS: b.date < IS_CUTOFF });
  }
  if (!trades.length) return { label, n: 0, netEUR: 0, isNetEUR: 0, oosNetEUR: 0, costRatioPct: 999, PF: 0, expEUR: 0, posYr: 0, totYr: 0 };
  const net   = trades.reduce((s, r) => s + r.netEUR, 0);
  const gross = trades.reduce((s, r) => s + r.grossUSD * EUR_PER_USD, 0);
  const costs = trades.length * MGC_COST_RT * EUR_PER_USD;
  const IS    = trades.filter(r => r.IS);
  const OOS   = trades.filter(r => !r.IS);
  const wins  = trades.filter(r => r.netEUR > 0).reduce((s, r) => s + r.netEUR, 0);
  const loss  = Math.abs(trades.filter(r => r.netEUR <= 0).reduce((s, r) => s + r.netEUR, 0));
  const byYear = {};
  trades.forEach(r => { byYear[r.year] = (byYear[r.year] ?? 0) + r.netEUR; });
  return {
    label, n: trades.length,
    netEUR:    Math.round(net),
    isNetEUR:  Math.round(IS.reduce((s, r) => s + r.netEUR, 0)),
    isN: IS.length,
    isExp: IS.length ? +(IS.reduce((s, r) => s + r.netEUR, 0) / IS.length).toFixed(2) : 0,
    oosNetEUR: Math.round(OOS.reduce((s, r) => s + r.netEUR, 0)),
    oosN: OOS.length,
    oosExp: OOS.length ? +(OOS.reduce((s, r) => s + r.netEUR, 0) / OOS.length).toFixed(2) : 0,
    costRatioPct: gross > 0 ? +(costs / gross * 100).toFixed(1) : 999,
    PF:   loss > 0 ? +(wins / loss).toFixed(2) : (wins > 0 ? 99 : 0),
    expEUR: +(net / trades.length).toFixed(2),
    posYr:  Object.values(byYear).filter(v => v > 0).length,
    totYr:  Object.keys(byYear).length,
    byYear,
  };
}

// ── Test matrix ──────────────────────────────────────────────────────────────
const tests = [];
for (const hold of [1, 2, 3]) {
  tests.push(
    { label: `Baseline_${hold}d`,               filterFn: () => true, holdBars: hold },
    { label: `MA200above_${hold}d`,              filterFn: b => b.close > b.ma200, holdBars: hold },
    { label: `MA100above_${hold}d`,              filterFn: b => b.close > b.ma100, holdBars: hold },
    { label: `MA50above_${hold}d`,               filterFn: b => b.close > b.ma50, holdBars: hold },
    { label: `MA200above_slope+_${hold}d`,       filterFn: b => b.close > b.ma200 && b.ma50slope > 0, holdBars: hold },
    { label: `MA100above_slope+_${hold}d`,       filterFn: b => b.close > b.ma100 && b.ma50slope > 0, holdBars: hold },
    { label: `MA200above_lowATR_${hold}d`,       filterFn: b => b.close > b.ma200 && b.atrPct < 0.5, holdBars: hold },
    { label: `MA200above_highATR_${hold}d`,      filterFn: b => b.close > b.ma200 && b.atrPct >= 0.5, holdBars: hold },
    { label: `MA100above_lowATR_${hold}d`,       filterFn: b => b.close > b.ma100 && b.atrPct < 0.5, holdBars: hold },
    { label: `MA100above_mom5pos_${hold}d`,      filterFn: b => b.close > b.ma100 && b.mom5 > 0, holdBars: hold },
    { label: `MA200above_mom5pos_${hold}d`,      filterFn: b => b.close > b.ma200 && b.mom5 > 0, holdBars: hold },
    { label: `MA200above_slope+_lowATR_${hold}d`,filterFn: b => b.close > b.ma200 && b.ma50slope > 0 && b.atrPct < 0.5, holdBars: hold },
    { label: `ATRlow_${hold}d`,                  filterFn: b => b.atrPct < 0.33, holdBars: hold },
    { label: `ATRmed_${hold}d`,                  filterFn: b => b.atrPct >= 0.33 && b.atrPct < 0.67, holdBars: hold },
    { label: `ATRhigh_${hold}d`,                 filterFn: b => b.atrPct >= 0.67, holdBars: hold },
  );
}

const results = tests.map(t => testStrategy(t));
// Sort by OOS net
results.sort((a, b) => b.oosNetEUR - a.oosNetEUR);

console.log('\n=== GLD/MGC Thursday Long — Sorted by OOS Net EUR ===');
console.log('Label | n | Net | IS(n,exp) | OOS(n,exp) | CR% | PF | posYr/tot');
for (const r of results) {
  if (r.n === 0) continue;
  console.log(
    `${r.label.padEnd(36)} n=${String(r.n).padStart(3)} net=${String(r.netEUR).padStart(5)} ` +
    `IS=${String(r.isNetEUR).padStart(5)}(${r.isN},${r.isExp}) ` +
    `OOS=${String(r.oosNetEUR).padStart(5)}(${r.oosN},${r.oosExp}) ` +
    `CR=${r.costRatioPct}% PF=${r.PF} posYr=${r.posYr}/${r.totYr}`
  );
}

// Find best: IS>0 AND OOS>0 AND PF>1
const candidates = results.filter(r => r.isNetEUR > 0 && r.oosNetEUR > 0 && r.PF > 1 && r.n >= 30);
console.log('\n=== CANDIDATES (IS>0, OOS>0, PF>1, n>=30) ===');
candidates.forEach(r => console.log(r.label, '→ net=' + r.netEUR, 'IS=' + r.isNetEUR, 'OOS=' + r.oosNetEUR, 'PF=' + r.PF, 'n=' + r.n, 'posYr=' + r.posYr + '/' + r.totYr));

// Save full results
fs.mkdirSync('workspace/output/white-swan/repair', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/repair/gld-backtest-results.json', JSON.stringify({ bars: bars.length, thursdayBars: thursdayBars.filter(b=>b.ma200).length, results, candidates }, null, 2));
console.log('\nSaved gld-backtest-results.json');
