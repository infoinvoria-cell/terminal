/**
 * Re-run GLD ATRmed_1d to extract per-trade dates and P&L.
 * Output: workspace/output/white-swan/v2/gld_atrmed_trades.json
 */
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const MGC_MULTIPLIER = 10;
const MGC_COST_RT = 0.58;
const IS_CUTOFF = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

const gcRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/gc_daily_raw.json', 'utf8'));
const bars = [];
for (let i = 0; i < gcRaw.ts.length; i++) {
  if (!gcRaw.close[i]) continue;
  bars.push({
    date: new Date(gcRaw.ts[i] * 1000).toISOString().slice(0, 10),
    open: gcRaw.open[i], high: gcRaw.high[i], low: gcRaw.low[i], close: gcRaw.close[i],
  });
}
bars.sort((a, b) => a.date < b.date ? -1 : 1);

// Compute indicators
function sma(arr, period, i) {
  if (i < period - 1) return null;
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += arr[j].close;
  return s / period;
}
function atr14(arr, i) {
  if (i < 14) return null;
  let sum = 0;
  for (let j = i - 13; j <= i; j++) {
    const tr = Math.max(arr[j].high - arr[j].low, Math.abs(arr[j].high - arr[j-1].close), Math.abs(arr[j].low - arr[j-1].close));
    sum += tr;
  }
  return sum / 14;
}
for (let i = 0; i < bars.length; i++) {
  bars[i].ma200 = sma(bars, 200, i);
  bars[i].atr = atr14(bars, i);
  bars[i].mom5 = i >= 5 ? (bars[i].close - bars[i-5].close) / bars[i-5].close * 100 : null;
}
// ATR percentile rolling 252d
for (let i = 0; i < bars.length; i++) {
  if (i < 252 || !bars[i].atr) { bars[i].atrPct = null; continue; }
  const vals = bars.slice(i - 252, i + 1).map(b => b.atr).filter(v => v !== null).sort((a, b) => a - b);
  bars[i].atrPct = vals.indexOf(bars[i].atr) / vals.length;
}

const getDow = d => new Date(d + 'T00:00:00Z').getUTCDay();
const getYear = d => parseInt(d.slice(0, 4));

// ATRmed_1d strategy
const trades = [];
const thursdays = bars.filter(b => getDow(b.date) === 4 && getYear(b.date) >= 2008 && b.ma200 && b.atr && b.atrPct != null);

for (const b of thursdays) {
  if (b.atrPct < 0.33 || b.atrPct >= 0.67) continue;
  const bIdx = bars.indexOf(b);
  let exitBar = null;
  for (let k = bIdx + 1; k < bars.length; k++) {
    exitBar = bars[k];
    break;
  }
  if (!exitBar) continue;
  const grossUSD = (exitBar.close - b.close) * MGC_MULTIPLIER;
  const netUSD = grossUSD - MGC_COST_RT;
  const netEUR = netUSD * EUR_PER_USD;
  trades.push({
    date: b.date,
    exitDate: exitBar.date,
    entryClose: b.close,
    exitClose: exitBar.close,
    grossUSD,
    netEUR: +netEUR.toFixed(4),
    IS: b.date < IS_CUTOFF,
    OOS19: b.date >= OOS19_CUTOFF,
  });
}

const net = trades.reduce((s, t) => s + t.netEUR, 0);
const IS = trades.filter(t => t.IS);
const OOS = trades.filter(t => !t.IS);
const OOS19 = trades.filter(t => t.OOS19);
const wins = trades.filter(t => t.netEUR > 0).reduce((s,t) => s+t.netEUR,0);
const loss = Math.abs(trades.filter(t => t.netEUR < 0).reduce((s,t) => s+t.netEUR,0));

console.log('GLD ATRmed_1d trades:', trades.length);
console.log('Net EUR:', net.toFixed(0));
console.log('IS:', IS.reduce((s,t)=>s+t.netEUR,0).toFixed(0), 'n='+IS.length);
console.log('OOS:', OOS.reduce((s,t)=>s+t.netEUR,0).toFixed(0), 'n='+OOS.length);
console.log('OOS19:', OOS19.reduce((s,t)=>s+t.netEUR,0).toFixed(0), 'n='+OOS19.length);
console.log('PF:', (wins/loss).toFixed(2));

fs.mkdirSync('workspace/output/white-swan/v2', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/v2/gld_atrmed_trades.json', JSON.stringify({ trades, net, isNet: IS.reduce((s,t)=>s+t.netEUR,0), oosNet: OOS.reduce((s,t)=>s+t.netEUR,0) }, null, 2));
console.log('Written gld_atrmed_trades.json');
