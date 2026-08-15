// White Swan: Full portfolio rebuild + Serkan CSV
// Uses: real GC daily OHLCV (GLD), real ZW daily OHLCV, existing all-trades.json
import fs from 'fs';

const EUR_PER_USD = 0.81677;
const IS_CUTOFF = '2017-01-01';

// ── Load GC bars ─────────────────────────────────────────────────────────────
const gcRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/gc_daily_raw.json', 'utf8'));
const gcBars = [];
for (let i = 0; i < gcRaw.ts.length; i++) {
  if (!gcRaw.close[i]) continue;
  gcBars.push({ date: new Date(gcRaw.ts[i]*1000).toISOString().slice(0,10), open: gcRaw.open[i], high: gcRaw.high[i], low: gcRaw.low[i], close: gcRaw.close[i] });
}
gcBars.sort((a,b) => a.date < b.date ? -1 : 1);

// Indicators for GC
function sma(arr, period, i) { if (i<period-1) return null; let s=0; for(let j=i-period+1;j<=i;j++) s+=arr[j].close; return s/period; }
function atr14(arr, i) { const p=14; if(i<p) return null; let s=0; for(let j=i-p+1;j<=i;j++) { const tr=Math.max(arr[j].high-arr[j].low, Math.abs(arr[j].high-arr[j-1].close), Math.abs(arr[j].low-arr[j-1].close)); s+=tr; } return s/p; }
for (let i=0; i<gcBars.length; i++) {
  gcBars[i].ma200 = sma(gcBars,200,i);
  gcBars[i].atr   = atr14(gcBars,i);
}
const ATR_WINDOW = 252;
for (let i=0; i<gcBars.length; i++) {
  if (i<ATR_WINDOW||!gcBars[i].atr) { gcBars[i].atrPct=null; continue; }
  const vals = gcBars.slice(i-ATR_WINDOW,i+1).map(b=>b.atr).filter(v=>v!==null).sort((a,b)=>a-b);
  gcBars[i].atrPct = vals.indexOf(gcBars[i].atr)/vals.length;
}
const gcByDate = {}; gcBars.forEach(b => { gcByDate[b.date]=b; });
const getDow = d => new Date(d+'T00:00:00Z').getUTCDay();
const getYear = d => parseInt(d.slice(0,4));
const getMonth = d => new Date(d+'T00:00:00Z').getUTCMonth()+1;

// ── Load ZW bars ─────────────────────────────────────────────────────────────
const zwRaw = fs.readFileSync('workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv', 'utf8').trim().split('\n');
const zwBars = [];
for (const line of zwRaw.slice(1)) {
  const [date, open, high, low, close] = line.split(',');
  if (!date||!close||isNaN(+close)) continue;
  if (parseInt(date.slice(0,4)) < 2007) continue;
  zwBars.push({ date, open:+open, high:+high, low:+low, close:+close });
}
zwBars.sort((a,b) => a.date<b.date?-1:1);

// ZW indicators
for (let i=0; i<zwBars.length; i++) { zwBars[i].ma200=sma(zwBars,200,i); zwBars[i].atr=atr14(zwBars,i); }
const zwByDate = {}; zwBars.forEach(b => { zwByDate[b.date]=b; });

// ── Load existing all-trades.json (non-GLD, non-ZW strategies) ───────────────
const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json','utf8'));
const strategies = ['eurusd_30m', 'dax_1h', 'dax_2h', 'ym1_tat', 'cc_seasonal'];

// E6 MonLong PosMon filter
const E6_MONTHS = [4,8,9,10,11];
function e6Filter(t) {
  return t.strategyId==='eurusd_30m' && getDow(t.entryDate)===1 && t.direction==='LONG' && E6_MONTHS.includes(getMonth(t.entryDate));
}

// ── Build GLD trades (ATRmed 1d: ATR pct 0.33-0.67, Thur close→next close) ──
const MGC_MULT = 10, MGC_COST = 0.58;
const gldTrades = [];
for (let i=0; i<gcBars.length; i++) {
  const b = gcBars[i];
  if (getDow(b.date)!==4 || getYear(b.date)<2008) continue;
  if (!b.ma200||!b.atr||b.atrPct===null) continue;
  if (b.atrPct<0.33||b.atrPct>=0.67) continue; // ATRmed filter
  const exitBar = gcBars[i+1];
  if (!exitBar) continue;
  const grossUSD = (exitBar.close - b.close) * MGC_MULT;
  const netUSD = grossUSD - MGC_COST;
  const netEUR = netUSD * EUR_PER_USD;
  gldTrades.push({ date: b.date, netEUR, grossUSD, year: getYear(b.date), IS: b.date<IS_CUTOFF, strategy:'gld_mgc_atrmed' });
}

// ── Build ZW trades (7/1 + 2 trading days, hold 10) ─────────────────────────
const ZW_MULT = 50, ZW_COST = 2.25;
const zwTrades = [];
const addBD = (arr, idx, n) => { let count=0,k=idx; while(count<n&&k+1<arr.length){k++;count++;} return k; };
for (let year=2008; year<=2025; year++) {
  const target = `${year}-07-01`;
  let anchorIdx = zwBars.findIndex(b => b.date>=target && getYear(b.date)===year);
  if (anchorIdx<0) continue;
  const entryIdx = addBD(zwBars, anchorIdx, 2);
  if (entryIdx>=zwBars.length||getYear(zwBars[entryIdx].date)!==year) continue;
  const entryBar = zwBars[entryIdx];
  const exitIdx = addBD(zwBars, entryIdx, 10);
  if (exitIdx>=zwBars.length) continue;
  const exitBar = zwBars[exitIdx];
  const grossUSD = (exitBar.close - entryBar.close) * ZW_MULT;
  const netUSD = grossUSD - ZW_COST;
  const netEUR = netUSD * EUR_PER_USD;
  zwTrades.push({ date: entryBar.date, netEUR, grossUSD, year, IS: entryBar.date<IS_CUTOFF, strategy:'zw_seasonal_jul' });
}

// ── Compile per-strategy P&L ─────────────────────────────────────────────────
function tradeStats(trades, name) {
  if (!trades.length) return { name, n:0, netEUR:0, isNet:0, oosNet:0, PF:0, exp:0 };
  const net = trades.reduce((s,t)=>s+t.netEUR,0);
  const IS = trades.filter(t=>t.IS||t.date<IS_CUTOFF);
  const OOS = trades.filter(t=>!t.IS&&t.date>=IS_CUTOFF);
  const wins = trades.filter(t=>t.netEUR>0).reduce((s,t)=>s+t.netEUR,0);
  const loss = Math.abs(trades.filter(t=>t.netEUR<=0).reduce((s,t)=>s+t.netEUR,0));
  const byYear = {};
  trades.forEach(t => { const y=(t.year||t.date?.slice(0,4)); byYear[y]=(byYear[y]??0)+t.netEUR; });
  return {
    name, n:trades.length,
    netEUR: Math.round(net),
    isNet: Math.round(IS.reduce((s,t)=>s+t.netEUR,0)), isN:IS.length,
    oosNet: Math.round(OOS.reduce((s,t)=>s+t.netEUR,0)), oosN:OOS.length,
    PF: loss>0 ? +(wins/loss).toFixed(2) : (wins>0?99:0),
    exp: +(net/trades.length).toFixed(2),
    posYr: Object.values(byYear).filter(v=>v>0).length,
    totYr: Object.keys(byYear).length,
    tradesPerYear: +(trades.length/18.5).toFixed(1),
    byYear,
  };
}

function netEUR_at(t) { return (t.grossPnl - t.costRt) * EUR_PER_USD / (t.csvDiv ?? 1); }

// E6 candidate
const e6Trades = allTrades.filter(e6Filter).map(t => ({
  date: t.entryDate, netEUR: netEUR_at(t), year: getYear(t.entryDate),
  IS: t.entryDate<IS_CUTOFF, strategy:'e6_monlong_posmon'
}));

// DAX1H, DAX2H, YM1, CC — all trades (no filter)
function stratTrades(id) {
  return allTrades.filter(t=>t.strategyId===id).map(t => ({
    date: t.entryDate, netEUR: netEUR_at(t), year: getYear(t.entryDate),
    IS: t.entryDate<IS_CUTOFF, strategy: id
  }));
}

const portfolioStrategies = {
  e6:    { trades: e6Trades,         label: 'E6_MonLong_PosMon',     contracts: 1, margin: 2200, instrument: '6E',   costPerRT: 2.40 },
  dax1h: { trades: stratTrades('dax_1h'),  label: 'DAX_1H_Baseline',      contracts: 1, margin: 880,  instrument: 'FDXS', costPerRT: 0.75 },
  dax2h: { trades: stratTrades('dax_2h'),  label: 'DAX_2H_Baseline',      contracts: 1, margin: 880,  instrument: 'FDXS', costPerRT: 0.75 },
  gld:   { trades: gldTrades,        label: 'GLD_MGC_ATRmed',        contracts: 1, margin: 822,  instrument: 'MGC',  costPerRT: 0.58 },
  zw:    { trades: zwTrades,         label: 'ZW_Seasonal_Jul',       contracts: 1, margin: 1870, instrument: 'ZW',   costPerRT: 2.25 },
  ym1:   { trades: stratTrades('ym1_tat'), label: 'YM1_TAT',              contracts: 1, margin: 1000, instrument: 'MYM',  costPerRT: 0.85 },
  cc:    { trades: stratTrades('cc_seasonal'), label: 'CC_Seasonal',   contracts: 1, margin: 1000, instrument: 'CC',   costPerRT: 1.50 },
};

console.log('\n=== Individual Strategy Stats ===');
for (const [key, s] of Object.entries(portfolioStrategies)) {
  const stats = tradeStats(s.trades, s.label);
  console.log(`${s.label.padEnd(24)} n=${String(stats.n).padStart(4)} net=${String(stats.netEUR).padStart(7)} IS=${String(stats.isNet).padStart(7)}(${stats.isN}) OOS=${String(stats.oosNet).padStart(7)}(${stats.oosN}) PF=${stats.PF} exp=${stats.exp} posYr=${stats.posYr}/${stats.totYr}`);
  s.stats = stats;
}

// ── Build daily portfolio NAV ─────────────────────────────────────────────────
// For each strategy, build a date→netEUR map
// Then aggregate by date, compute cumulative NAV at each capital level
function buildDailyPnL(trades) {
  const map = {};
  trades.forEach(t => {
    const d = t.date;
    map[d] = (map[d] ?? 0) + t.netEUR;
  });
  return map;
}

// Collect all dates
const allDates = new Set();
for (const s of Object.values(portfolioStrategies)) {
  s.dailyPnL = buildDailyPnL(s.trades);
  Object.keys(s.dailyPnL).forEach(d => allDates.add(d));
}
const sortedDates = [...allDates].sort();
console.log('\nPortfolio date range:', sortedDates[0], 'to', sortedDates[sortedDates.length-1], '(', sortedDates.length, 'active days)');

// Capital levels to test
const CAPITALS = [10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

// Total annual margin (shared FDXS: DAX1H + DAX2H share 1 FDXS = 880, not 1760)
// Core margin: 6E=2200 + FDXS=880(shared) + MGC=822 + ZW=1870 + MYM=1000 + CC=1000 = 7772
const TOTAL_MARGIN = 2200 + 880 + 822 + 1870 + 1000 + 1000; // 7772 for 1c each

function computePortfolioKPIs(capital, contracts = {}) {
  // Default: 1 contract each
  const nc = { e6:1, dax1h:1, dax2h:1, gld:1, zw:1, ym1:1, cc:1, ...contracts };
  const marginTotal = nc.e6*2200 + Math.max(nc.dax1h,nc.dax2h)*880 + nc.gld*822 + nc.zw*1870 + nc.ym1*1000 + nc.cc*1000;
  const marginPct = marginTotal / capital * 100;

  // Build NAV series
  let nav = capital;
  const navSeries = [];
  let maxNav = capital;
  let maxDD = 0;
  let maxDDPct = 0;

  for (const date of sortedDates) {
    let dayPnL = 0;
    for (const [key, s] of Object.entries(portfolioStrategies)) {
      dayPnL += (s.dailyPnL[date] ?? 0) * nc[key];
    }
    nav += dayPnL;
    navSeries.push({ date, nav, dayPnL });
    if (nav > maxNav) maxNav = nav;
    const dd = maxNav - nav;
    const ddPct = dd / maxNav * 100;
    if (ddPct > maxDDPct) { maxDDPct = ddPct; maxDD = dd; }
  }

  // CAGR
  const startNav = capital;
  const endNav = nav;
  const years = (new Date(sortedDates[sortedDates.length-1]) - new Date(sortedDates[0])) / (365.25*24*3600*1000);
  const cagr = (Math.pow(endNav/startNav, 1/years) - 1) * 100;

  // Sharpe: annual returns
  const annualReturns = {};
  navSeries.forEach(r => {
    const yr = r.date.slice(0,4);
    annualReturns[yr] = (annualReturns[yr] ?? []).concat(r.dayPnL/capital);
  });
  const annRets = Object.entries(annualReturns).map(([yr, rets]) => rets.reduce((s,v)=>s+v,0));
  const avgRet = annRets.reduce((s,v)=>s+v,0)/annRets.length;
  const stdRet = Math.sqrt(annRets.map(r=>Math.pow(r-avgRet,2)).reduce((s,v)=>s+v,0)/annRets.length);
  const sharpe = stdRet > 0 ? avgRet/stdRet : 0;

  // Total net
  const totalNet = endNav - startNav;
  const annualCost = Object.values(portfolioStrategies).reduce((s, str) => {
    return s + (str.stats.tradesPerYear ?? 0) * (str.costPerRT ?? 0) * nc[str.key ?? 'e6'] * EUR_PER_USD;
  }, 0);

  return { capital, marginTotal, marginPct: +marginPct.toFixed(1), cagr: +cagr.toFixed(2), sharpe: +sharpe.toFixed(3), maxDD: +maxDD.toFixed(0), maxDDPct: +maxDDPct.toFixed(2), totalNet: +totalNet.toFixed(0), years: +years.toFixed(1), endNav: +endNav.toFixed(0), navSeries };
}

// ── Capital comparison ────────────────────────────────────────────────────────
console.log('\n=== Capital Comparison (1c each) ===');
const capResults = [];
for (const cap of CAPITALS) {
  const r = computePortfolioKPIs(cap);
  capResults.push(r);
  const marginStatus = r.marginPct < 30 ? 'PASS' : 'MARGIN_FAIL';
  console.log(`€${String(cap).padStart(6)}: CAGR=${r.cagr}% Sharpe=${r.sharpe} MaxDD=${r.maxDDPct}% Margin=${r.marginPct}% ${marginStatus} TotalNet=€${r.totalNet}`);
}

// Find minimum viable capital (margin < 30%)
const minViable = capResults.find(r => r.marginPct < 30);
console.log('\nMinimum viable capital:', minViable ? `€${minViable.capital} (Margin=${minViable.marginPct}%)` : 'None found');

// ── Serkan daily returns CSV ──────────────────────────────────────────────────
// Use €15k as reference
const ref = computePortfolioKPIs(15000);
let csvLines = ['Date,Daily_Return'];
let runningNAV = 15000;
for (const { date, dayPnL } of ref.navSeries) {
  const dailyReturn = dayPnL / runningNAV;
  runningNAV += dayPnL;
  csvLines.push(`${date},${dailyReturn.toFixed(8)}`);
}
fs.mkdirSync('workspace/output/white-swan/serkan', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/serkan/white_swan_final_daily_returns.csv', csvLines.join('\n'));
console.log('\nSerkan CSV written:', csvLines.length-1, 'rows');

// ── Strategy-level component export ──────────────────────────────────────────
const components = Object.entries(portfolioStrategies).map(([key, s]) => ({
  id: key, label: s.label, instrument: s.instrument, contracts: 1,
  margin: s.margin, ...s.stats
}));

// ── Save full output ──────────────────────────────────────────────────────────
const output = {
  generatedAt: '2026-08-15',
  status: 'RESEARCH_CANDIDATE',
  dataSource: 'Real historical data: GC/MGC (Yahoo Finance), ZW (TradingView CBOT), other strategies (all-trades.json IBKR)',
  strategies: Object.fromEntries(Object.entries(portfolioStrategies).map(([k,s])=>[k,s.stats])),
  capitalComparison: capResults.map(r => ({ capital: r.capital, cagr: r.cagr, sharpe: r.sharpe, maxDDPct: r.maxDDPct, marginPct: r.marginPct, totalNet: r.totalNet, status: r.marginPct < 30 ? 'PASS' : 'MARGIN_FAIL' })),
  minViableCapital: minViable?.capital,
  components,
};
fs.writeFileSync('workspace/output/white-swan/repair/final-portfolio.json', JSON.stringify(output, null, 2));
console.log('Saved final-portfolio.json');
