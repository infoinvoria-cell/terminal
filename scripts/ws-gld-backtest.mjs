// White Swan: GLD/MGC Thursday Long backtest with real GC daily OHLCV
import fs from 'fs';
import path from 'path';

// Phase 3: Daily ECB FX sweep — replaces constant EUR_PER_USD = 0.81677
// Source: ECB reference rates EXR.D.USD.EUR.SP00.A via Frankfurter proxy
// Rate = USD per 1 EUR. Conversion: EUR = USD / rate
const _ecbRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/ecb_eurusd_daily.json', 'utf8'));
const _ecbObs = _ecbRaw.observations; // { "2006-12-29": 1.317, ... }
function fxRate(date) {
  if (_ecbObs[date]) return _ecbObs[date];
  // Prior-business-day fallback for weekends and holidays
  const d = new Date(date + 'T00:00:00Z');
  for (let i = 1; i <= 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const s = d.toISOString().slice(0, 10);
    if (_ecbObs[s]) return _ecbObs[s];
  }
  return 1.20; // emergency fallback — should never trigger for 2008+
}
// FX_ACCOUNTING: DAILY_ECB_SWEEP — EUR_PNL = USD_PNL / fxRate(date)
// FX_SOURCE: ECB EXR.D.USD.EUR.SP00.A via frankfurter.dev
const MGC_MULTIPLIER = 10;   // 10 oz per MGC contract
// IBKR Tiered pricing: $0.25 IBKR/side + $0.70 COMEX exchange/side + $0.01 NFA/side = $0.96/side → $1.92 RT
// No $0.05 clearing give-up: IBKR is both executing and carrying broker; give-up only applies to third-party clearing arrangements.
const MGC_COST_ENTRY = 0.96;  // USD — paid on entry date
const MGC_COST_EXIT  = 0.96;  // USD — paid on exit date
const MGC_COST_RT    = 1.92;  // USD round-trip total (entry + exit)
// Overnight position fees: IBKR Pro futures accounts charge debit interest on negative cash balances only.
// For a fully-funded White Swan account, net_debit_balance ≈ 0 → overnight_fee ≈ 0.
// Formula: overnight_fee_per_day = max(0, debit_balance × overnight_benchmark_rate / 365)
// Parameterised separately; set to 0 for well-funded baseline.
const MGC_OVERNIGHT_FEE_PER_DAY = 0.00;  // USD/day — update with actual account debit rate if margin is not fully cash-covered
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
    const netUSD   = grossUSD - MGC_COST_RT;  // MGC_COST_RT = entry + exit
    const netEUR   = netUSD / fxRate(exitBar.date);  // daily ECB rate on exit/booking date

    // Canonical position tracking — v6.3: genuine daily open-position MTM + correct cost placement
    // Cost model: execution_cost_on_entry (entryDate), overnight_fee_per_hold_day, execution_cost_on_exit (exitDate)
    const holdDayDates   = [];
    const holdDayCloses  = [];
    const dailyMtmUSD    = [];     // gross price MTM per held day (no costs — costs placed on execution dates)
    const dailyCostUSD   = [];     // execution or overnight cost charged on each day
    const dailyNetUSD    = [];     // net P&L per day = dailyMtmUSD + dailyCostUSD (costs are negative)
    for (let k = bIdx + 1; k <= bIdx + holdBars; k++) {
      if (k >= bars.length) break;
      const prev  = bars[k - 1];
      const cur   = bars[k];
      const isFirst = k === bIdx + 1;
      const isLast  = k === bIdx + holdBars;
      const mtm = +((cur.close - prev.close) * MGC_MULTIPLIER).toFixed(4);
      // Entry execution cost charged on first hold day (position opened at prior close = entry bar)
      // Exit execution cost charged on last hold day (position closed at exit bar close)
      // Overnight fee charged on every hold day between entry and exit (exclusive of entry/exit day costs)
      const cost = -(isFirst ? MGC_COST_ENTRY : 0)
                   -(isLast  ? MGC_COST_EXIT  : 0)
                   -(MGC_OVERNIGHT_FEE_PER_DAY);
      holdDayDates.push(cur.date);
      holdDayCloses.push(cur.close);
      dailyMtmUSD.push(mtm);
      dailyCostUSD.push(+cost.toFixed(4));
      dailyNetUSD.push(+(mtm + cost).toFixed(4));
    }
    const dailyMtmEUR  = dailyMtmUSD.map((v, idx) => +(v / fxRate(holdDayDates[idx])).toFixed(4));
    const dailyNetEUR  = dailyNetUSD.map((v, idx) => +(v / fxRate(holdDayDates[idx])).toFixed(4));

    trades.push({
      date: b.date, netEUR, grossUSD,
      year: getYear(b.date), IS: b.date < IS_CUTOFF,
      // v6.3 canonical position fields
      entryDate: b.date, entryPrice: b.close,
      exitDate: exitBar.date, exitPrice: exitBar.close,
      costEntryUSD: MGC_COST_ENTRY, costExitUSD: MGC_COST_EXIT,
      overnightFeePerDayUSD: MGC_OVERNIGHT_FEE_PER_DAY,
      holdDayDates, holdDayCloses,
      dailyMtmUSD, dailyMtmEUR,    // gross price MTM only
      dailyCostUSD, dailyNetUSD, dailyNetEUR,  // costs on execution dates + net
    });
  }
  if (!trades.length) return { label, n: 0, netEUR: 0, isNetEUR: 0, oosNetEUR: 0, costRatioPct: 999, PF: 0, expEUR: 0, posYr: 0, totYr: 0, trades: [] };
  const net   = trades.reduce((s, r) => s + r.netEUR, 0);
  const gross = trades.reduce((s, r) => s + r.grossUSD / fxRate(r.exitDate), 0);
  const costs = trades.reduce((s, r) => s + MGC_COST_RT / fxRate(r.exitDate), 0);
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
    trades, // v6.3: full per-trade data with daily MTM
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

// Save full results (summary only — no trades in main file to keep size manageable)
fs.mkdirSync('workspace/output/white-swan/repair', { recursive: true });
const summaryResults = results.map(r => { const { trades: _, ...rest } = r; return rest; });
const summaryCandidates = candidates.map(r => { const { trades: _, ...rest } = r; return rest; });
fs.writeFileSync('workspace/output/white-swan/repair/gld-backtest-results.json', JSON.stringify({
  bars: bars.length,
  thursdayBars: thursdayBars.filter(b=>b.ma200).length,
  mgcCostRtUSD: MGC_COST_RT,
  results: summaryResults, candidates: summaryCandidates,
}, null, 2));

// Save v6.3 canonical trade-level MTM for the best candidate (highest OOS net)
const best = results.filter(r => r.isNetEUR > 0 && r.oosNetEUR > 0 && r.PF > 1 && r.n >= 30)
  .sort((a, b) => b.oosNetEUR - a.oosNetEUR)[0];
if (best) {
  fs.writeFileSync('workspace/output/white-swan/repair/gld-mtm-canonical-v63.json', JSON.stringify({
    label: best.label, n: best.n, isNetEUR: best.isNetEUR, oosNetEUR: best.oosNetEUR, PF: best.PF,
    mgcCostRtUSD: MGC_COST_RT, mgcMultiplier: MGC_MULTIPLIER,
    note: 'v6.3 canonical: genuine daily open-position MTM. entryDate/exitDate/holdDayDates/holdDayCloses/dailyMtmEUR per trade.',
    trades: best.trades,
  }, null, 2));
  console.log(`\nSaved gld-mtm-canonical-v63.json — best: ${best.label}, n=${best.n}, OOS=${best.oosNetEUR} EUR`);
  // Print 3 sample trades to verify daily MTM structure
  console.log('\nSample trade (v6.3 position fields):');
  const sample = best.trades[0];
  console.log(JSON.stringify({ entryDate: sample.entryDate, entryPrice: sample.entryPrice, exitDate: sample.exitDate, exitPrice: sample.exitPrice, holdDayDates: sample.holdDayDates, holdDayCloses: sample.holdDayCloses, dailyMtmUSD: sample.dailyMtmUSD, dailyMtmEUR: sample.dailyMtmEUR, netEUR: sample.netEUR }, null, 2));
}
console.log('\nSaved gld-backtest-results.json');
