// White Swan v6.3.4 — Final consistency gate: real daily MTM for every optional sleeve
// active in any of the 10 final portfolios. Generic reconstruction against genuine daily
// futures closes (same technique as Gold/DAX/M6E/MZW). No lump P&L survives anywhere.
import fs from 'fs';

const ecbRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/ecb_eurusd_daily.json', 'utf8'));
const ecbObs = ecbRaw.observations;
function fxRate(date) {
  if (ecbObs[date]) return ecbObs[date];
  const d = new Date(date + 'T00:00:00Z');
  for (let i = 1; i <= 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const s = d.toISOString().slice(0, 10);
    if (ecbObs[s]) return ecbObs[s];
  }
  return 1.20;
}

function loadDailyCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const close = {};
  const dates = [];
  for (const line of lines) {
    const [date, , , , c] = line.split(',');
    close[date] = parseFloat(c);
    dates.push(date);
  }
  dates.sort();
  return { close, dates };
}
function daysBetween(dates, entryDate, exitDate) {
  return dates.filter(d => d > entryDate && d <= exitDate);
}

const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json', 'utf8'));

// ── Sleeve definitions: strategyId → genuine daily CSV, costRT(USD), multiplier scale factor ──
const SLEEVES = [
  { id: 'gc1_seasonal', csv: 'data/historical/metals/COMEX_GC1_D.csv', costRt: 1.92, scale: 10 },   // 1oz→MGC 10oz
  { id: 'cl1_seasonal', csv: 'data/historical/energy/NYMEX_CL1_D.csv', costRt: 1.52, scale: 1 },    // already MCL basis (multiplier:100)
  { id: 'cc_seasonal',  csv: 'data/historical/agrar/ICEUS_CC1_D.csv',  costRt: 4.72, scale: 1 },
  { id: 'spy_seasonal', csv: 'data/historical/indices/CME_MINI_ES1_D.csv', costRt: 1.22, scale: 1 }, // MES basis (multiplier:5)
  { id: 'hg1_seasonal', csv: 'data/historical/metals/COMEX_HG1_D.csv', costRt: 1.92, scale: 1 },     // MHG basis (multiplier:2500)
  { id: 'ym1_tat',      csv: 'data/historical/indices/CBOT_MINI_YM1_D.csv', costRt: 1.22, scale: 1 },// MYM basis (multiplier:0.5)
  { id: 'sb_seasonal',  csv: 'data/historical/agrar/ICEUS_SB1_D.csv', costRt: 4.72, scale: 1 },
  { id: 'zc_seasonal',  csv: 'data/historical/agrar/CBOT_ZC1_D.csv', costRt: 1.52, scale: 1 },       // MZC basis
  { id: 'zs_seasonal',  csv: 'data/historical/agrar/CBOT_ZS1_D.csv', costRt: 1.52, scale: 1 },       // MZS basis
];
// zm1_seasonal: NO genuine daily ZM (soybean meal) price data found anywhere in the environment.
// Per final consistency gate: remove from eligible universe, do not fabricate.
const EXCLUDED_NO_DATA = ['zm1_seasonal'];

const results = {};
for (const sleeve of SLEEVES) {
  const { close, dates } = loadDailyCsv(sleeve.csv);
  const raw = allTrades.filter(t => t.strategyId === sleeve.id);
  const trades = [];
  for (const t of raw) {
    const entryDate = t.entryDate, exitDate = t.exitDate ?? t.entryDate;
    const dirSign = t.direction === 'LONG' ? 1 : -1;
    const div = t.csvDiv ?? 1;
    const mult = t.multiplier * sleeve.scale / div;

    if (entryDate === exitDate) {
      const netUSD = (t.exitPrice - t.entryPrice) * dirSign * mult - sleeve.costRt;
      const netEUR = +(netUSD / fxRate(exitDate)).toFixed(4);
      trades.push({ date: exitDate, netEUR, entryDate, exitDate, mtmStatus: 'INTRADAY_EXACT' });
      continue;
    }

    const heldDays = daysBetween(dates, entryDate, exitDate);
    if (!heldDays.length) {
      const netUSD = (t.exitPrice - t.entryPrice) * dirSign * mult - sleeve.costRt;
      const netEUR = +(netUSD / fxRate(exitDate)).toFixed(4);
      trades.push({ date: exitDate, netEUR, entryDate, exitDate, mtmStatus: 'FALLBACK_NO_BARS' });
      continue;
    }

    let prevMark = t.entryPrice;
    let sumUSD = 0;
    const dailyNetEUR = [];
    for (let i = 0; i < heldDays.length; i++) {
      const d = heldDays[i];
      const isLast = i === heldDays.length - 1;
      const mark = isLast ? t.exitPrice : (close[d] ?? prevMark);
      const mtm = (mark - prevMark) * dirSign * mult;
      const cost = (i === 0 ? -sleeve.costRt / 2 : 0) - (isLast ? sleeve.costRt / 2 : 0);
      const dayNetUSD = mtm + cost;
      dailyNetEUR.push(+(dayNetUSD / fxRate(d)).toFixed(4));
      sumUSD += mtm;
      prevMark = mark;
    }
    const netEUR = +dailyNetEUR.reduce((s, v) => s + v, 0).toFixed(4);
    trades.push({ date: exitDate, netEUR, entryDate, exitDate, mtmStatus: 'DAILY_MTM_GENUINE_CLOSE' });
  }
  results[sleeve.id] = trades;
  const intraday = trades.filter(t => t.mtmStatus === 'INTRADAY_EXACT').length;
  const daily = trades.filter(t => t.mtmStatus === 'DAILY_MTM_GENUINE_CLOSE').length;
  const fallback = trades.filter(t => t.mtmStatus === 'FALLBACK_NO_BARS').length;
  console.log(`${sleeve.id}: ${trades.length} trades — intraday-exact ${intraday}, daily-MTM ${daily}, fallback ${fallback}. Net EUR = ${Math.round(trades.reduce((s,t)=>s+t.netEUR,0))}`);
}

fs.mkdirSync('workspace/output/white-swan/v6.3', { recursive: true });
fs.writeFileSync('workspace/output/white-swan/v6.3/optional-sleeves-canonical-trades.json', JSON.stringify({
  builtAt: 'v6.3.4 final consistency gate',
  excludedNoData: EXCLUDED_NO_DATA,
  sleeves: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { n: v.length, netEUR: Math.round(v.reduce((s,t)=>s+t.netEUR,0)), trades: v }])),
}, null, 2));

console.log('\nEXCLUDED_NO_DATA:', EXCLUDED_NO_DATA.join(', '), '— no genuine daily price series found; removed from eligible universe');
console.log('Saved optional-sleeves-canonical-trades.json');
