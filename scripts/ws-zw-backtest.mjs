// White Swan: ZW Seasonal backtest with entry/hold window heatmap on real OHLCV
import fs from 'fs';

const EUR_PER_USD = 0.81677;
// ZW contract: 5000 bu, tick=$12.50/0.25c
// ZW multiplier: $50/point (1 point = 1 cent/bu * 5000bu / 100 = $50)
const ZW_MULTIPLIER = 50;   // USD per point (cents/bushel)
const ZW_COST_RT = 2.25;    // USD round-trip IBKR (ZW)
const IS_CUTOFF = '2017-01-01';
const START_YEAR = 2008;

// Load ZW full history
const raw = fs.readFileSync('workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv', 'utf8');
const lines = raw.trim().split('\n');
const bars = [];
for (const line of lines.slice(1)) {
  const [date, open, high, low, close] = line.split(',');
  if (!date || !close || isNaN(parseFloat(close))) continue;
  const y = parseInt(date.slice(0, 4));
  if (y < START_YEAR - 1) continue;
  bars.push({ date, open: +open, high: +high, low: +low, close: +close });
}
bars.sort((a, b) => (a.date < b.date ? -1 : 1));
console.log('ZW bars:', bars.length, 'from', bars[0].date, 'to', bars[bars.length-1].date);

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
  bars[i].mom5  = i >= 5 ? (bars[i].close - bars[i-5].close) / bars[i-5].close * 100 : null;
}
const ATR_WINDOW = 252;
for (let i = 0; i < bars.length; i++) {
  if (i < ATR_WINDOW || !bars[i].atr) { bars[i].atrPct = null; continue; }
  const vals = bars.slice(i - ATR_WINDOW, i + 1).map(b => b.atr).filter(v => v !== null).sort((a,b) => a-b);
  const rank = vals.indexOf(bars[i].atr);
  bars[i].atrPct = rank / vals.length;
}

const zwByDate = {};
bars.forEach(b => { zwByDate[b.date] = b; });

// ── Calendar helpers ─────────────────────────────────────────────────────────
const getDow   = d => new Date(d + 'T00:00:00Z').getUTCDay();
const getMonth = d => new Date(d + 'T00:00:00Z').getUTCMonth() + 1;
const getYear  = d => parseInt(d.slice(0, 4));
const addBD    = (idx, n) => { // add n business days from bar index
  let count = 0, k = idx;
  const dir = n > 0 ? 1 : -1;
  const abs = Math.abs(n);
  while (count < abs && k + dir >= 0 && k + dir < bars.length) {
    k += dir;
    count++;
  }
  return k;
};

// ── Original seasonal thesis: ~day-of-year entry ─────────────────────────────
// Based on zw-investigation.json: wheat seasonal Long typically enters around
// mid-June to mid-August (summer low before harvest rally).
// Original used: start around trading day ~128-195 of year, hold ~10-18 days.
// Let's use day-of-year approach: find the Nth trading day of each year.

function getTradingDaysOfYear(year) {
  return bars.filter(b => getYear(b.date) === year);
}

// Seasonal entry: day-of-year offset from calendar day
// Original pattern caches show S=128-195, H=10-18
// Let's test entry around June-Aug (month 6-8) with varying hold

// Strategy: Long entry on first trading day on or after "anchor" calendar day
// Anchor = month M, day D in year Y
function firstTDonOrAfter(year, month, day) {
  const target = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].date >= target && getYear(bars[i].date) === year) return i;
  }
  return -1;
}

// ── Main seasonal test function ──────────────────────────────────────────────
function testSeasonal({ anchorMonth, anchorDay, anchorOffset, holdBars, filterFn, label }) {
  const trades = [];
  for (let year = START_YEAR; year <= 2025; year++) {
    // Find anchor bar index
    let anchorIdx = firstTDonOrAfter(year, anchorMonth, anchorDay);
    if (anchorIdx < 0) continue;
    // Apply offset (trading days)
    const entryIdx = addBD(anchorIdx, anchorOffset);
    if (entryIdx < 0 || entryIdx >= bars.length) continue;
    const entryBar = bars[entryIdx];
    if (getYear(entryBar.date) !== year) continue; // overshot into next year
    if (!entryBar.ma200 || !entryBar.atr) continue;
    // Apply regime filter
    if (!filterFn(entryBar)) continue;
    // Exit
    const exitIdx = addBD(entryIdx, holdBars);
    if (exitIdx >= bars.length) continue;
    const exitBar = bars[exitIdx];
    const grossUSD = (exitBar.close - entryBar.close) * ZW_MULTIPLIER;
    const netUSD   = grossUSD - ZW_COST_RT;
    const netEUR   = netUSD * EUR_PER_USD;
    trades.push({
      year, entryDate: entryBar.date, exitDate: exitBar.date,
      entryClose: entryBar.close, exitClose: exitBar.close,
      grossUSD, netUSD, netEUR,
      IS: entryBar.date < IS_CUTOFF,
    });
  }
  if (!trades.length) return { label, n: 0, netEUR: 0, isNetEUR: 0, oosNetEUR: 0, PF: 0, expEUR: 0 };
  const net  = trades.reduce((s, r) => s + r.netEUR, 0);
  const IS   = trades.filter(r => r.IS);
  const OOS  = trades.filter(r => !r.IS);
  const wins = trades.filter(r => r.netEUR > 0).reduce((s, r) => s + r.netEUR, 0);
  const loss = Math.abs(trades.filter(r => r.netEUR <= 0).reduce((s, r) => s + r.netEUR, 0));
  const gross= trades.reduce((s, r) => s + Math.abs(r.grossUSD) * EUR_PER_USD, 0);
  const costs= trades.length * ZW_COST_RT * EUR_PER_USD;
  const byYear = {};
  trades.forEach(r => { byYear[r.year] = (byYear[r.year] ?? 0) + r.netEUR; });
  return {
    label, n: trades.length,
    netEUR: Math.round(net),
    isNetEUR: Math.round(IS.reduce((s, r) => s + r.netEUR, 0)),
    isN: IS.length,
    isExp: IS.length ? +(IS.reduce((s, r) => s + r.netEUR, 0) / IS.length).toFixed(1) : 0,
    oosNetEUR: Math.round(OOS.reduce((s, r) => s + r.netEUR, 0)),
    oosN: OOS.length,
    oosExp: OOS.length ? +(OOS.reduce((s, r) => s + r.netEUR, 0) / OOS.length).toFixed(1) : 0,
    costRatioPct: gross > 0 ? +(costs / gross * 100).toFixed(1) : 0,
    PF: loss > 0 ? +(wins / loss).toFixed(2) : (wins > 0 ? 99 : 0),
    expEUR: +(net / trades.length).toFixed(1),
    posYr: Object.values(byYear).filter(v => v > 0).length,
    totYr: Object.keys(byYear).length,
    byYear,
    trades,
  };
}

// ── 1. Heatmap: Entry offset × Hold for baseline (no regime filter) ───────────
// Anchor: July 1 (classic wheat seasonal low area)
console.log('\n=== ZW Seasonal — Entry Offset × Hold Heatmap (anchor=Jul 1, no filter) ===');
console.log('Offset\\Hold |  5d    10d    15d    18d    20d');
const OFFSETS = [-5, -3, -1, 0, 1, 3, 5, 8, 10];
const HOLDS   = [5, 8, 10, 12, 15, 18, 20];
const heatmap = [];
for (const offset of OFFSETS) {
  const row = { offset, results: [] };
  let line = `off=${String(offset).padStart(3)} | `;
  for (const hold of HOLDS) {
    const r = testSeasonal({ anchorMonth: 7, anchorDay: 1, anchorOffset: offset, holdBars: hold, filterFn: () => true, label: `off${offset}_h${hold}` });
    row.results.push({ hold, ...r });
    line += `${String(r.netEUR).padStart(6)}(${r.PF}) `;
  }
  heatmap.push(row);
  console.log(line);
}

// ── 2. Best entry area — detailed IS/OOS ─────────────────────────────────────
console.log('\n=== Best anchors detailed (anchor=Jul1, off=0..5, h=10..18) ===');
const detailTests = [];
for (const anchor of [{ m: 6, d: 15 }, { m: 7, d: 1 }, { m: 7, d: 15 }, { m: 8, d: 1 }]) {
  for (const offset of [-2, 0, 2, 5]) {
    for (const hold of [8, 10, 12, 15, 18]) {
      const r = testSeasonal({ anchorMonth: anchor.m, anchorDay: anchor.d, anchorOffset: offset, holdBars: hold, filterFn: () => true, label: `${anchor.m}/${anchor.d}+${offset}d_h${hold}` });
      if (r.n > 0) detailTests.push(r);
    }
  }
}
detailTests.sort((a, b) => b.oosNetEUR - a.oosNetEUR);
console.log('Label | n | Net | IS(n,exp) | OOS(n,exp) | PF | posYr');
detailTests.slice(0, 20).forEach(r => {
  console.log(`${r.label.padEnd(22)} n=${r.n} net=${String(r.netEUR).padStart(6)} IS=${String(r.isNetEUR).padStart(6)}(${r.isN},${r.isExp}) OOS=${String(r.oosNetEUR).padStart(6)}(${r.oosN},${r.oosExp}) PF=${r.PF} posYr=${r.posYr}/${r.totYr}`);
});

// ── 3. Best candidate + regime filter test ────────────────────────────────────
// Pick the best anchor from detailed tests
const best = detailTests.filter(r => r.isNetEUR > 0 && r.oosNetEUR > 0 && r.PF > 1)[0];
console.log('\n=== Best candidate (IS>0 OOS>0 PF>1) ===');
if (best) {
  console.log('Best:', best.label, '→ n=' + best.n, 'net=' + best.netEUR, 'IS=' + best.isNetEUR, 'OOS=' + best.oosNetEUR, 'PF=' + best.PF, 'posYr=' + best.posYr + '/' + best.totYr);

  // Now test regime filters on best config (re-parse label)
  const [anchorPart, holdPart] = best.label.split('_h');
  const hold = parseInt(holdPart);
  const [mdPart, offPart] = anchorPart.split('+');
  const [m, d] = mdPart.split('/').map(Number);
  const offset = parseInt(offPart);

  console.log('\n=== Regime filters on best config ===');
  const regimeTests = [
    { label: 'No_filter',           filterFn: () => true },
    { label: 'MA200_above',         filterFn: b => b.close > b.ma200 },
    { label: 'MA200_below',         filterFn: b => b.close < b.ma200 },
    { label: 'MA100_above',         filterFn: b => b.close > b.ma100 },
    { label: 'ATRpct_low (<0.4)',   filterFn: b => b.atrPct < 0.4 },
    { label: 'ATRpct_med',         filterFn: b => b.atrPct >= 0.3 && b.atrPct < 0.7 },
    { label: 'ATRpct_high (>0.6)', filterFn: b => b.atrPct > 0.6 },
    { label: 'mom5_pos',           filterFn: b => b.mom5 > 0 },
    { label: 'mom5_neg',           filterFn: b => b.mom5 < 0 },
  ].map(t => testSeasonal({ anchorMonth: m, anchorDay: d, anchorOffset: offset, holdBars: hold, filterFn: t.filterFn, label: t.label }));
  regimeTests.sort((a, b) => b.oosNetEUR - a.oosNetEUR);
  regimeTests.forEach(r => {
    if (r.n === 0) return;
    console.log(`${r.label.padEnd(22)} n=${r.n} net=${String(r.netEUR).padStart(6)} IS=${String(r.isNetEUR).padStart(6)}(${r.isN}) OOS=${String(r.oosNetEUR).padStart(6)}(${r.oosN}) PF=${r.PF} posYr=${r.posYr}/${r.totYr}`);
  });
}

// ── 4. Leave-one-year-out on best candidate ───────────────────────────────────
console.log('\n=== LOO (July1, off=0, h=10) ===');
for (let year = START_YEAR; year <= 2025; year++) {
  const r = testSeasonal({
    anchorMonth: 7, anchorDay: 1, anchorOffset: 0, holdBars: 10,
    filterFn: b => getYear(b.date) !== year,
    label: `excl_${year}`
  });
  console.log(`Excl ${year}: n=${r.n} net=${String(r.netEUR).padStart(6)} IS=${r.isNetEUR} OOS=${r.oosNetEUR} PF=${r.PF}`);
}

// ── 5. Save results ───────────────────────────────────────────────────────────
const output = {
  zwBars: bars.length, dataRange: [bars[0].date, bars[bars.length-1].date],
  heatmap, detailTests: detailTests.slice(0, 30),
  bestCandidate: best ?? null,
};
fs.mkdirSync('workspace/output/white-swan/repair', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/repair/zw-backtest-results.json', JSON.stringify(output, null, 2));
console.log('\nSaved zw-backtest-results.json');
