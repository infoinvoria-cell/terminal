/**
 * ws-v6.2-clean.mjs
 * WHITE SWAN — v6.2 CLEAN SELECTION (NO OOS LEAKAGE)
 *
 * FORENSIC CORRECTIONS over v6.1:
 *
 * 1. DAILY MTM STATUS (per strategy):
 *    eurusd_m6e    → INTRADAY_EXACT  (exitDate==entryDate, realized P&L = daily P&L)
 *    dax_1h        → PARTIAL_INTRADAY (most trades intraday; multi-day trades use exit-date
 *                    realized P&L — DAILY_MTM_BLOCKED for multi-day fraction; no daily DAX price file)
 *    dax_2h        → PARTIAL_INTRADAY (same as dax_1h)
 *    gld_mgc       → DAILY_MTM_BLOCKED_NO_POSITION_DATA
 *                    (gc_daily_raw.json has GC prices but gld_atr2080_trades.json has only
 *                     date+netEUR, no entry/exit prices/dates → MTM reconstruction impossible)
 *    zw_mzw        → DAILY_MTM_BLOCKED_NO_PRICE_DATA (exitDate exists; no daily ZW prices)
 *    cc/spy/cl/all → DAILY_MTM_BLOCKED_NO_PRICE_DATA
 *    GLD ETF       → NOT USED. Price source is GC (Comex Gold Futures) via gc_daily_raw.json.
 *
 * 2. OOS2019 LEAKAGE REMOVAL:
 *    All OOS2019 and OOS references REMOVED from:
 *      - scorePortfolio()      (was primary selection criterion — ILLEGAL_SELECTION_USE)
 *      - extraGreedy()         (was sorting by oosNet — ILLEGAL_SELECTION_USE)
 *      - concentration (HHI)   (was computed from oos19Net — changed to isNet)
 *    OOS2019 is CALCULATED ONLY AFTER portfolio is frozen (OOS_EVALUATION_METRICS).
 *
 * 3. 0.82 HARDCODE REMOVED:
 *    Replaced with a scan over 8 budget levels (0.60 → 0.88).
 *    The optimal budget emerges from IS-based scoring.
 *    A single IS-optimal allocation strategy is used (greedy by IS-return/margin).
 *
 * 4. MARGIN/SURVIVAL:
 *    FEASIBILITY_UNVERIFIED until real daily MTM is possible.
 *    Reported honestly with worst-day GC estimate for gold exposure.
 *
 * SELECTION INPUTS (legal):  isCAGR, isSharpe, isCalmar, isMaxDD, isPF, IS-HHI, marginPct
 * OOS EVALUATION (post-freeze only): oosCAGR, oos2019CAGR, full-period CAGR/Sharpe/MaxDD
 */
import fs from 'fs';

const EUR_PER_USD  = 0.81677;
const IS_CUTOFF    = '2017-01-01';
const OOS19_CUTOFF = '2019-01-01';

// ─── MTM STATUS TABLE ─────────────────────────────────────────────────────────
const MTM_STATUS = {
  eurusd_m6e:  'INTRADAY_EXACT',
  dax_1h:      'PARTIAL_INTRADAY_BLOCKED',
  dax_2h:      'PARTIAL_INTRADAY_BLOCKED',
  gld_mgc:     'DAILY_MTM_BLOCKED_NO_POSITION_DATA',
  zw_mzw:      'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  cc_seasonal: 'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  spy_mes:     'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  cl1_seasonal:'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  gc1_seasonal:'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  hg1_seasonal:'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  zm1_seasonal:'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  ym1_tat:     'PARTIAL_INTRADAY_BLOCKED',
  sb_seasonal: 'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  zc_seasonal: 'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
  zs_seasonal: 'DAILY_MTM_BLOCKED_NO_PRICE_DATA',
};

// ─── GOLD INSTRUMENT DECLARATION ─────────────────────────────────────────────
const GOLD_META = {
  GOLD_PRICE_SOURCE:        'GC (Comex Gold Futures) — workspace/output/white-swan/gc_daily_raw.json',
  GOLD_TRADING_INSTRUMENT:  'MGC (Micro Gold Contract)',
  GOLD_CONTRACT_MULTIPLIER: '10 troy oz per contract',
  GOLD_MARGIN_INSTRUMENT:   'MGC — IBKR initial margin ~$800 (≈€654)',
  GLD_USED_ANYWHERE:        'NO — GLD ETF price not used. ws-gld-backtest.mjs uses GC OHLCV.',
  NOTE:                     'gld_atr2080_trades.json stores only date+netEUR (no entry/exit dates/prices). Daily MTM reconstruction impossible despite gc_daily_raw.json being available.',
};

// ─── TRADING DAYS ─────────────────────────────────────────────────────────────
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
const IS_DAYS   = ALL_TRADING_DAYS.filter(d => d <  IS_CUTOFF);
const OOS_DAYS  = ALL_TRADING_DAYS.filter(d => d >= IS_CUTOFF);
const OOS19_DAYS= ALL_TRADING_DAYS.filter(d => d >= OOS19_CUTOFF);

console.log(`Trading days: total=${ALL_TRADING_DAYS.length}, IS=${IS_DAYS.length}, OOS=${OOS_DAYS.length}, OOS19=${OOS19_DAYS.length}`);

// ─── Load data ────────────────────────────────────────────────────────────────
const allTrades = JSON.parse(fs.readFileSync('workspace/output/white-swan/all-trades.json', 'utf8'));
const gldV4 = JSON.parse(fs.readFileSync('workspace/output/white-swan/v4/gld_atr2080_trades.json', 'utf8'));
const zwRes = JSON.parse(fs.readFileSync('workspace/output/white-swan/repair/zw-backtest-results.json', 'utf8'));

function tradeNetEUR(t) {
  const div = t.csvDiv ?? 1;
  const net = (t.grossPnl - t.costRt) / div;
  return t.currency === 'USD' ? net * EUR_PER_USD : net;
}

// v6.1+: P&L booked on exitDate (not entryDate). Intraday: exitDate==entryDate (no change).
function buildFromAllTrades(stratId, filterFn) {
  return allTrades
    .filter(t => t.strategyId === stratId && (!filterFn || filterFn(t)))
    .map(t => ({ date: t.exitDate ?? t.entryDate, netEUR: +tradeNetEUR(t).toFixed(4) }));
}

// ─── Strategy statistics (IS-period only for selection) ───────────────────────
function stratStats(trades) {
  if (!trades.length) return {
    netEUR: 0, isNet: 0, oosNet: 0, oos19Net: 0, PF: 0,
    posYr: 0, totYr: 0, tradesPerYear: 0, byYear: {},
    // IS-specific
    isPF: 0, isWin: 0, isN: 0,
  };
  const isTrades  = trades.filter(t => t.date < IS_CUTOFF);
  const oosTrades = trades.filter(t => t.date >= IS_CUTOFF);
  const oos19Tr   = trades.filter(t => t.date >= OOS19_CUTOFF);

  function computePF(tr) {
    const w = tr.filter(t => t.netEUR > 0).reduce((s, t) => s + t.netEUR, 0);
    const l = Math.abs(tr.filter(t => t.netEUR < 0).reduce((s, t) => s + t.netEUR, 0));
    return l > 0 ? +(w / l).toFixed(2) : (w > 0 ? 99 : 0);
  }

  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0,4); byYear[y] = (byYear[y]??0) + t.netEUR; });
  const posYr = Object.values(byYear).filter(v => v > 0).length;
  const totYr = Object.keys(byYear).length;

  return {
    netEUR:        Math.round(trades.reduce((s,t)=>s+t.netEUR,0)),
    isNet:         Math.round(isTrades.reduce((s,t)=>s+t.netEUR,0)),
    oosNet:        Math.round(oosTrades.reduce((s,t)=>s+t.netEUR,0)),
    oos19Net:      Math.round(oos19Tr.reduce((s,t)=>s+t.netEUR,0)),
    PF:            computePF(trades),
    isPF:          computePF(isTrades),    // IS-only PF for selection
    isWin:         isTrades.filter(t=>t.netEUR>0).length,
    isN:           isTrades.length,
    posYr, totYr, tradesPerYear: +(trades.length / Math.max(totYr,1)).toFixed(1),
    byYear,
  };
}

function annVolFromYears(trades) {
  const byYear = {};
  trades.forEach(t => { const y = t.date.slice(0,4); byYear[y] = (byYear[y]??0) + t.netEUR; });
  const vals = Object.values(byYear);
  if (vals.length < 2) return 9999;
  const mean = vals.reduce((s,v)=>s+v,0)/vals.length;
  return Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length);
}

// ─── Strategy universe ─────────────────────────────────────────────────────────
// eurusd filter: Day-of-week on entryDate (trade OPEN decision), exitDate used for P&L booking
const eu_trades = allTrades.filter(t => {
  if (t.strategyId !== 'eurusd_30m') return false;
  const dow = new Date(t.entryDate + 'T00:00:00Z').getUTCDay();
  const mon = new Date(t.entryDate + 'T00:00:00Z').getUTCMonth() + 1;
  return t.direction === 'LONG' && dow === 1 && [4, 9, 10, 11].includes(mon);
}).map(t => ({ date: t.exitDate ?? t.entryDate, netEUR: +(tradeNetEUR(t) * 0.1).toFixed(4) }));

// ZW: exit-date booking (exitDate present in zw-backtest-results.json)
const zw_trades = zwRes.bestCandidate.trades.map(t => ({
  date: t.exitDate ?? t.entryDate, netEUR: +(t.netEUR * 0.2).toFixed(4),
}));

// GLD: only `date` field (single trade date, no entry/exit). Treated as exit date.
// GOLD_PRICE_SOURCE: GC futures (gc_daily_raw.json). NOT GLD ETF.
const gld_trades = gldV4.trades.map(t => ({ date: t.date, netEUR: +t.netEUR.toFixed(4) }));

const UNIVERSE = [
  // ── Core 5 ────────────────────────────────────────────────────────────────
  { id: 'eurusd_m6e',   label: 'EURUSD M6E Monday Long', inst: 'M6E',  margin: 259,  costRt: 0.24, core: true,  blocked: false, maxCt: 8,  trades: eu_trades },
  { id: 'dax_1h',       label: 'DAX 1H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, maxCt: 8,  trades: buildFromAllTrades('dax_1h') },
  { id: 'dax_2h',       label: 'DAX 2H',                  inst: 'FDXS', margin: 880,  costRt: 1.70, core: true,  blocked: false, maxCt: 8,  trades: buildFromAllTrades('dax_2h') },
  { id: 'gld_mgc',      label: 'GLD/MGC ATR20-80',        inst: 'MGC',  margin: 740,  costRt: 0.58, core: true,  blocked: false, maxCt: 8,  trades: gld_trades },
  { id: 'zw_mzw',       label: 'ZW/MZW Jul Seasonal',     inst: 'MZW',  margin: 252,  costRt: 0.48, core: true,  blocked: false, maxCt: 8,  trades: zw_trades },
  // ── Non-core tradable ──────────────────────────────────────────────────────
  { id: 'cc_seasonal',  label: 'CC Seasonal',              inst: 'CC',   margin: 3150, costRt: 3.50, core: false, blocked: false, maxCt: 2,  trades: buildFromAllTrades('cc_seasonal') },
  { id: 'spy_mes',      label: 'SPY/MES S&P Seasonal',    inst: 'MES',  margin: 1390, costRt: 0.85, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('spy_seasonal') },
  { id: 'cl1_seasonal', label: 'CL Seasonal',              inst: 'MCL',  margin: 1390, costRt: 0.85, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('cl1_seasonal') },
  { id: 'hg1_seasonal', label: 'HG Seasonal',              inst: 'MHG',  margin: 2500, costRt: 2.00, core: false, blocked: false, maxCt: 4,  trades: buildFromAllTrades('hg1_seasonal') },
  { id: 'zm1_seasonal', label: 'ZM Seasonal',              inst: 'MZM',  margin: 1250, costRt: 2.25, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('zm1_seasonal') },
  { id: 'ym1_tat',      label: 'YM1 TAT',                  inst: 'MYM',  margin: 765,  costRt: 0.85, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('ym1_tat') },
  { id: 'gc1_seasonal', label: 'GC Seasonal',              inst: 'MGC',  margin: 740,  costRt: 0.58, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('gc1_seasonal') },
  { id: 'sb_seasonal',  label: 'SB Seasonal',              inst: 'SB',   margin: 1070, costRt: 2.25, core: false, blocked: false, maxCt: 4,  trades: buildFromAllTrades('sb_seasonal') },
  { id: 'zc_seasonal',  label: 'ZC Seasonal',              inst: 'MZC',  margin: 520,  costRt: 1.50, core: false, blocked: false, maxCt: 8,  trades: buildFromAllTrades('zc_seasonal') },
  { id: 'zs_seasonal',  label: 'ZS Seasonal',              inst: 'MZS',  margin: 1220, costRt: 2.25, core: false, blocked: false, maxCt: 4,  trades: buildFromAllTrades('zs_seasonal') },
  // ── Blocked ───────────────────────────────────────────────────────────────
  { id: 'iwm_m2k', label: 'IWM (M2K) — DATA BLOCKED', inst: 'M2K', margin: 0, costRt: 0, core: false, blocked: true, maxCt: 0, trades: [] },
  { id: 'eem',     label: 'EEM — DATA BLOCKED',        inst: 'EMF', margin: 0, costRt: 0, core: false, blocked: true, maxCt: 0, trades: [] },
];

UNIVERSE.forEach(s => { s.stats = stratStats(s.trades); s.annVol = annVolFromYears(s.trades); });

const tradable = UNIVERSE.filter(s => !s.blocked);
const CORE_IDS = UNIVERSE.filter(s => s.core).map(s => s.id);
const CORE_MIN_MARGIN = UNIVERSE.filter(s => s.core).reduce((sum, s) => sum + s.margin, 0);

// ─── IS-based strategy ranking for allocation ─────────────────────────────────
// Sort by IS net P&L per margin dollar (IS-only metric, no OOS)
// This is the ONLY allocation criterion used in v6.2
function isReturnPerMargin(s) {
  const isNet = s.stats.isNet ?? 0;
  return isNet > 0 ? isNet / s.margin : -999;
}

// ─── Daily P&L map builder ────────────────────────────────────────────────────
function buildPnL(contracts) {
  const map = {};
  tradable.forEach(s => {
    const n = contracts[s.id] ?? 0;
    if (n === 0) return;
    s.trades.forEach(t => { map[t.date] = (map[t.date] ?? 0) + t.netEUR * n; });
  });
  return map;
}

// ─── IS-only KPIs (SELECTION METRICS — no OOS data) ──────────────────────────
function computeISKPIs(pnlMap, capital) {
  const isRets = IS_DAYS.map(d => (pnlMap[d] ?? 0) / capital);
  const isPnl  = IS_DAYS.map(d => pnlMap[d] ?? 0);

  // IS NAV and MaxDD
  let nav = capital, peak = capital, maxDD = 0;
  for (let i = 0; i < IS_DAYS.length; i++) {
    nav += isPnl[i];
    if (nav > peak) peak = nav;
    const dd = peak - nav;
    if (dd > maxDD) maxDD = dd;
  }
  const isTotal = isPnl.reduce((s, p) => s + p, 0);
  const IS_YEARS = 9;
  const isCAGR = +((Math.pow((capital + isTotal) / capital, 1/IS_YEARS) - 1) * 100).toFixed(2);
  const isMaxDDPct = +(maxDD / Math.max(peak, capital) * 100).toFixed(2);
  const isMaxDDEUR = Math.round(maxDD);

  // IS Sharpe (over all IS trading days, 0-fill)
  const n = isRets.length;
  const mean = isRets.reduce((s,r)=>s+r,0)/n;
  const variance = isRets.reduce((s,r)=>s+(r-mean)**2,0)/n;
  const annMean = mean * 252;
  const annStd  = Math.sqrt(variance) * Math.sqrt(252);
  const isSharpe = annStd > 0 ? +(annMean / annStd).toFixed(3) : 0;

  // IS Calmar
  const isCalmar = isMaxDDPct > 0 ? +(isCAGR / isMaxDDPct).toFixed(3) : 0;

  // IS Profit Factor
  const isWins = isPnl.filter(p => p > 0).reduce((s,p)=>s+p, 0);
  const isLoss = Math.abs(isPnl.filter(p => p < 0).reduce((s,p)=>s+p, 0));
  const isPF   = isLoss > 0 ? +(isWins/isLoss).toFixed(3) : (isWins > 0 ? 99 : 0);

  // IS concentration (HHI) — by IS P&L per strategy (NOT OOS)
  const totalIS = tradable.reduce((s, str) => s + Math.max(str.stats.isNet ?? 0, 0), 0);
  const isTop1Conc = totalIS > 0 ? +(Math.max(...tradable.map(str => Math.max(str.stats.isNet ?? 0, 0))) / totalIS * 100).toFixed(1) : 100;
  const sortedIS = tradable.map(str => Math.max(str.stats.isNet ?? 0, 0)).sort((a,b)=>b-a);
  const isTop3Conc = totalIS > 0 ? +((sortedIS.slice(0,3).reduce((s,v)=>s+v,0)) / totalIS * 100).toFixed(1) : 100;
  const isHHI = totalIS > 0 ? +(tradable.reduce((s, str) => {
    const share = Math.max(str.stats.isNet ?? 0, 0) / totalIS;
    return s + share * share;
  }, 0) * 100).toFixed(2) : 100;
  const isEffectiveSleeves = isHHI > 0 ? +(100 / isHHI).toFixed(2) : 1;

  return {
    isCAGR, isSharpe, isCalmar, isMaxDDPct, isMaxDDEUR,
    isPF, isTop1Conc, isTop3Conc, isHHI, isEffectiveSleeves,
  };
}

// ─── Full KPIs (OOS EVALUATION METRICS — computed AFTER portfolio freeze) ─────
function computeFullKPIs(pnlMap, capital) {
  const allRets = ALL_TRADING_DAYS.map(d => (pnlMap[d] ?? 0) / capital);
  const allPnl  = ALL_TRADING_DAYS.map(d => pnlMap[d] ?? 0);

  let nav = capital, peak = capital, maxDD = 0;
  const monthly = {}, byYear = {};
  for (let i = 0; i < ALL_TRADING_DAYS.length; i++) {
    const date = ALL_TRADING_DAYS[i];
    nav += allPnl[i];
    if (nav > peak) peak = nav;
    const dd = peak - nav;
    if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0,4);
    byYear[yr] = (byYear[yr]??0) + allPnl[i];
    const ym = date.slice(0,7);
    monthly[ym] = { nav: +nav.toFixed(2), dd: +(-((peak-nav)/Math.max(peak,capital)*100)).toFixed(2) };
  }

  const finalNav = nav;
  const YEARS = 18;
  const CAGR = +((Math.pow(finalNav/capital, 1/YEARS)-1)*100).toFixed(2);
  const MaxDDPct = +(maxDD/Math.max(peak,capital)*100).toFixed(2);

  const isRets  = IS_DAYS.map(d => pnlMap[d]??0);
  const oosRets = OOS_DAYS.map(d => pnlMap[d]??0);
  const oos19Rets= OOS19_DAYS.map(d => pnlMap[d]??0);
  const isTotal  = isRets.reduce((s,r)=>s+r,0);
  const prOOS19Total = ALL_TRADING_DAYS.filter(d=>d<OOS19_CUTOFF).reduce((s,d)=>s+(pnlMap[d]??0),0);

  function subCAGR(pnls, startNAV, nYrs) {
    const total = pnls.reduce((s,p)=>s+p,0);
    if (startNAV<=0||nYrs<=0) return null;
    return +((Math.pow((startNAV+total)/startNAV, 1/nYrs)-1)*100).toFixed(2);
  }
  const isCAGR      = subCAGR(isRets, capital, 9);
  const oosCAGR     = subCAGR(oosRets, capital+isTotal, 9);
  const oos2019CAGR = subCAGR(oos19Rets, capital+prOOS19Total, 7);

  // Full-period Sharpe
  const n = allRets.length;
  const mean = allRets.reduce((s,r)=>s+r,0)/n;
  const variance = allRets.reduce((s,r)=>s+(r-mean)**2,0)/n;
  const annMean = mean*252;
  const annStd  = Math.sqrt(variance)*Math.sqrt(252);
  const Sharpe  = annStd>0 ? +(annMean/annStd).toFixed(3) : 0;

  const downRets = allRets.filter(r=>r<0);
  const downVar  = downRets.length>0 ? downRets.reduce((s,r)=>s+r*r,0)/n : 0;
  const Sortino  = downVar>0 ? +(annMean/(Math.sqrt(downVar)*Math.sqrt(252))).toFixed(3) : 0;
  const Calmar   = MaxDDPct>0 ? +(CAGR/MaxDDPct).toFixed(3) : 0;

  // Full PF and expectancy
  const wins = allPnl.filter(p=>p>0).reduce((s,p)=>s+p,0);
  const loss = Math.abs(allPnl.filter(p=>p<0).reduce((s,p)=>s+p,0));
  const PF   = loss>0 ? +(wins/loss).toFixed(2) : (wins>0?99:0);
  const activeDays = allPnl.filter(p=>p!==0).length;
  const expectancyEUR = activeDays>0 ? +((finalNav-capital)/activeDays).toFixed(2) : 0;
  const winRate = activeDays>0 ? +(allPnl.filter(p=>p>0).length/activeDays*100).toFixed(1) : 0;

  const dailySeries = Object.entries(monthly).sort(([a],[b])=>a<b?-1:1).map(([date,v])=>({date,...v}));

  return {
    CAGR, isCAGR, oosCAGR, oos2019CAGR,
    Sharpe, Sortino, Calmar, MaxDDPct, MaxDDEUR: Math.round(maxDD),
    totalNetEUR: Math.round(finalNav-capital), finalNav: Math.round(finalNav),
    PF, expectancyEUR, winRate, byYear, dailySeries,
  };
}

// ─── Feasibility (margin check only — FEASIBILITY_UNVERIFIED until real MTM) ──
function checkFeasibility(contracts, capital) {
  const totalMargin = tradable.reduce((s, str) => s + (contracts[str.id]??0)*str.margin, 0);
  const marginPct   = totalMargin / capital * 100;
  let assessment = 'COMFORTABLE';
  if (marginPct > 90) assessment = 'MARGIN_RISK';
  else if (marginPct > 78) assessment = 'AGGRESSIVE';
  else if (marginPct > 65) assessment = 'TIGHT';
  else if (marginPct > 45) assessment = 'FEASIBLE';
  const corePass = CORE_IDS.every(id => (contracts[id]??0) >= 1);
  return {
    totalMargin: Math.round(totalMargin), marginPct: +marginPct.toFixed(1),
    assessment, feasible: totalMargin <= capital * 0.95,
    corePass, corePassStr: corePass ? 'CORE 5/5 ✓' : 'CORE FAIL ✗',
    survivalStatus: 'FEASIBILITY_UNVERIFIED — real daily MTM not computed for multi-day positions',
  };
}

// ─── IS-ONLY scoring (v6.2 CLEAN — no OOS reference) ─────────────────────────
function scorePortfolio(isKPIs, feasCheck) {
  if (!isKPIs || !feasCheck.feasible || !feasCheck.corePass) return -999;

  // SELECTION INPUTS: IS metrics only
  const isCAGR   = isKPIs.isCAGR   ?? 0;  // IS CAGR: full in-sample period performance
  const isSharpe = isKPIs.isSharpe ?? 0;  // IS Sharpe: risk-adjusted IS return
  const isCalmar = isKPIs.isCalmar ?? 0;  // IS Calmar: DD-adjusted IS return
  const isPF     = isKPIs.isPF     ?? 1;  // IS Profit Factor
  const isMaxDD  = isKPIs.isMaxDDPct ?? 99;
  const effSl    = isKPIs.isEffectiveSleeves ?? 1;
  const top1     = isKPIs.isTop1Conc ?? 100;
  const marginPct= feasCheck.marginPct;

  // Performance (IS-only)
  const cagrScore  = Math.min(isCAGR,  25) / 25 * 3.0;   // weight 3.0
  const sharpeScore= Math.min(isSharpe, 3) /  3 * 2.0;   // weight 2.0
  const calmarScore= Math.min(isCalmar, 4) /  4 * 1.5;   // weight 1.5
  const pfScore    = Math.min(Math.max(isPF-1, 0), 1.5) / 1.5 * 0.5; // weight 0.5

  // Diversification (IS-based)
  const divScore   = Math.min(effSl, 5) / 5 * 1.0;       // weight 1.0

  // Penalties
  const ddPenalty  = isMaxDD > 25 ? (isMaxDD - 25) / 25 * 1.5 : 0;
  const marginPen  = marginPct > 88 ? (marginPct - 88) / 5 * 2.0 : 0;
  const concPen    = top1 > 60 ? (top1 - 60) / 40 * 1.0 : 0;

  // Total weight = 3.0 + 2.0 + 1.5 + 0.5 + 1.0 = 8.0
  return cagrScore + sharpeScore + calmarScore + pfScore + divScore - ddPenalty - marginPen - concPen;
}

// ─── Portfolio builder (IS-based allocation — no OOS) ────────────────────────
function buildWithCoreEnforced(capital, budgetPct) {
  const budget = capital * budgetPct;
  const contracts = {};

  // Step 1: Allocate core minimums
  let usedMargin = 0;
  for (const s of UNIVERSE.filter(u => u.core && !u.blocked)) {
    contracts[s.id] = 1;
    usedMargin += s.margin;
  }
  if (usedMargin > budget) return { contracts, coreInfeasible: true, usedMargin };

  // Step 2: Greedy extra — sorted by IS return per margin dollar (IS ONLY, no OOS)
  const ranked = tradable
    .filter(s => isReturnPerMargin(s) > 0)   // only strategies with positive IS return
    .sort((a, b) => isReturnPerMargin(b) - isReturnPerMargin(a));

  // Multi-pass greedy: add 1 contract at a time in ranked order until budget exhausted
  let improved = true;
  while (improved) {
    improved = false;
    for (const s of ranked) {
      const cur = contracts[s.id] ?? 0;
      if (cur >= s.maxCt) continue;
      if (usedMargin + s.margin > budget) continue;
      contracts[s.id] = cur + 1;
      usedMargin += s.margin;
      improved = true;
      break;  // restart ranking pass after each addition
    }
  }

  return { contracts, coreInfeasible: false, usedMargin };
}

// ─── Optimize one tier ────────────────────────────────────────────────────────
// Budget scan — no fixed 0.82 target. Optimal budget emerges from IS scoring.
const BUDGET_SCAN = [0.60, 0.65, 0.70, 0.75, 0.78, 0.82, 0.85, 0.88];

function optimizeTier(capital) {
  const results = [];
  for (const budgetPct of BUDGET_SCAN) {
    const { contracts, coreInfeasible, usedMargin } = buildWithCoreEnforced(capital, budgetPct);
    const name = `BUDGET_${Math.round(budgetPct * 100)}`;
    if (coreInfeasible) {
      results.push({ name, budgetPct, contracts, isKPIs: null, fullKPIs: null, feasibility: null, score: -999, coreInfeasible: true, usedMargin });
      continue;
    }
    const pnlMap  = buildPnL(contracts);
    const isKPIs  = computeISKPIs(pnlMap, capital);     // SELECTION METRICS
    const fullKPIs= computeFullKPIs(pnlMap, capital);   // OOS EVALUATION — after freeze
    const feas    = checkFeasibility(contracts, capital);
    const score   = scorePortfolio(isKPIs, feas);
    const activeSleeves = tradable.filter(s => (contracts[s.id]??0)>0).length;
    const annCost = tradable.reduce((s, str) =>
      s + (contracts[str.id]??0) * (str.stats.tradesPerYear??0) * str.costRt * EUR_PER_USD, 0);
    results.push({
      name, budgetPct, contracts, isKPIs, fullKPIs, feasibility: feas,
      score: +score.toFixed(3), activeSleeves, annCostEUR: Math.round(annCost),
      usedMargin, actualMarginPct: +(usedMargin/capital*100).toFixed(1),
      coreInfeasible: false,
    });
  }

  // RECOMMENDED: highest IS score that is feasible AND has core 5/5
  const feasible = results.filter(r => !r.coreInfeasible && r.feasibility?.feasible && r.feasibility?.corePass);
  const recommended = feasible.sort((a,b) => b.score - a.score)[0]
    ?? results.sort((a,b) => b.score - a.score)[0];

  return { capital, candidates: results, recommended };
}

// ─── Run all tiers ─────────────────────────────────────────────────────────────
const CAPITALS = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

console.log('\n=== WHITE SWAN v6.2 CLEAN — IS-ONLY SELECTION ===');
console.log(`Core min margin: €${CORE_MIN_MARGIN} (${(CORE_MIN_MARGIN/10000*100).toFixed(1)}% of €10k)`);
console.log('\n=== OOS2019 REFERENCE AUDIT ===');
console.log('scorePortfolio(): uses isCAGR, isSharpe, isCalmar, isPF, isMaxDD, isEffectiveSleeves, marginPct');
console.log('  → MEASUREMENT_ONLY OOS2019 refs (computed after freeze, not used for selection)');
console.log('  → ILLEGAL_SELECTION_USE refs: NONE (v6.2 clean)');
console.log('extraGreedy(): sorts by isNet/margin (IS-only)');
console.log('  → No OOS reference in allocation');
console.log('');

const tierResults = [];
for (const capital of CAPITALS) {
  const result = optimizeTier(capital);
  tierResults.push(result);
  const rec  = result.recommended;
  const isk  = rec.isKPIs;
  const fkp  = rec.fullKPIs;
  const f    = rec.feasibility;
  const coreFlag = f?.corePass ? '✓ CORE 5/5' : '✗ CORE FAIL';
  console.log(`\n€${(capital/1000).toFixed(0)}k [${rec.name}] ${coreFlag} score=${rec.score} budget=${rec.budgetPct} actual=${rec.actualMarginPct}%`);
  console.log(`  Margin: €${f?.totalMargin} = ${f?.marginPct}% ${f?.assessment}`);
  console.log(`  SELECTION (IS-only): isCAGR=${isk?.isCAGR}% isSharpe=${isk?.isSharpe} isCalmar=${isk?.isCalmar} isMaxDD=${isk?.isMaxDDPct}% isPF=${isk?.isPF}`);
  console.log(`  EVALUATION (OOS post-freeze): CAGR=${fkp?.CAGR}% oosCAGR=${fkp?.oosCAGR}% oos2019CAGR=${fkp?.oos2019CAGR}% Sharpe=${fkp?.Sharpe} MaxDD=${fkp?.MaxDDPct}%`);
  const cts = Object.entries(rec.contracts).filter(([,n])=>n>0).map(([id,n])=>`${id}×${n}`).join(' ');
  console.log(`  Contracts: ${cts}`);
}

// ─── Capital ladder ────────────────────────────────────────────────────────────
const ladder = tierResults.map((tier, i) => {
  const prev = i > 0 ? tierResults[i-1].recommended.contracts : {};
  const cur  = tier.recommended.contracts;
  const added   = tradable.filter(s => (cur[s.id]??0)>0 && (prev[s.id]??0)===0).map(s=>s.id);
  const removed = tradable.filter(s => (cur[s.id]??0)===0 && (prev[s.id]??0)>0).map(s=>s.id);
  const changed = tradable.filter(s => (cur[s.id]??0)!==(prev[s.id]??0) && (cur[s.id]??0)>0 && (prev[s.id]??0)>0)
    .map(s => ({ id: s.id, from: prev[s.id]??0, to: cur[s.id]??0 }));
  return { capital: tier.capital, added, removed, changed };
});

// ─── Best small account — IS-based selection (no OOS19) ───────────────────────
// v6.2: uses IS Calmar (DD-adjusted IS return) — most complete IS robustness metric
// isCalmar = isCAGR / isMaxDDPct — rewards IS CAGR and penalizes IS MaxDD simultaneously
const bestSmall = tierResults
  .filter(r => r.capital <= 25000 && r.recommended.feasibility?.feasible)
  .sort((a,b) => (b.recommended.isKPIs?.isCalmar??0) - (a.recommended.isKPIs?.isCalmar??0))[0];

const fullTradable = tierResults.find(t => {
  const cts = t.recommended.contracts;
  return tradable.every(s => (cts[s.id]??0) > 0);
});

tierResults.sort((a,b) => a.capital - b.capital);

// ─── Serkan CSVs ──────────────────────────────────────────────────────────────
fs.mkdirSync('workspace/output/white-swan/v6.2', { recursive: true });
fs.mkdirSync('workspace/output/white-swan/serkan/v6.2', { recursive: true });

const SERKAN_CAPS = [10000, 15000, 20000, 25000];
const serkanAudit = {};
for (const cap of SERKAN_CAPS) {
  const tier = tierResults.find(t => t.capital === cap);
  const pnl  = buildPnL(tier?.recommended?.contracts ?? {});
  const rows  = ALL_TRADING_DAYS.map(d => `${d},${((pnl[d]??0)/cap).toFixed(8)}`);
  const csv   = ['Date,Daily_Return', ...rows].join('\n');
  const fname = `white_swan_${cap/1000}k_daily_returns.csv`;
  fs.writeFileSync(`workspace/output/white-swan/serkan/v6.2/${fname}`, csv);
  const implPnL = Math.round(rows.reduce((s,r)=>s+parseFloat(r.split(',')[1]),0) * cap);
  const totalNet = tier?.recommended?.fullKPIs?.totalNetEUR ?? 0;
  serkanAudit[cap] = { rows: rows.length, impliedPnL: implPnL, totalNetEUR: totalNet, pass: Math.abs(implPnL-totalNet)<50 };
}

// Final CSV (recommended capital)
const recCap  = bestSmall?.capital ?? 25000;
const recTier = tierResults.find(t => t.capital === recCap);
const finalPnL= buildPnL(recTier?.recommended?.contracts ?? {});
const finalRows= ALL_TRADING_DAYS.map(d => `${d},${((finalPnL[d]??0)/recCap).toFixed(8)}`);
fs.writeFileSync('workspace/output/white-swan/serkan/v6.2/white_swan_final_daily_returns.csv', ['Date,Daily_Return',...finalRows].join('\n'));

// ─── Equity series ────────────────────────────────────────────────────────────
const equitySeries = {};
tierResults.forEach(tier => equitySeries[tier.capital] = tier.recommended.fullKPIs?.dailySeries ?? []);
const yearlyReturns = Object.entries(recTier?.recommended?.fullKPIs?.byYear ?? {})
  .filter(([y])=>+y>=2008&&+y<=2025).sort(([a],[b])=>+a-+b)
  .map(([year,netEUR])=>({ year:+year, netEUR:Math.round(netEUR), returnPct: +(netEUR/recCap*100).toFixed(2) }));

// ─── Build per-tier components ─────────────────────────────────────────────────
function buildComponents(contracts, totalMargin) {
  return UNIVERSE.map(s => {
    const n = contracts[s.id] ?? 0;
    const marginUsed = n * s.margin;
    let status, reason;
    if (s.blocked) { status='DATA_BLOCKED'; reason='No viable proxy instrument'; }
    else if (n===0) { status='EXCLUDED'; reason=s.core?'CORE_BUDGET_OVERRUN':'BUDGET_PRIORITY'; }
    else { status='ACTIVE'; reason=s.core?'CORE':'ADDED_BY_OPTIMIZER'; }
    const robustness = s.blocked ? 'N/A'
      : ((s.stats?.isPF??0)>=1.5 && (s.stats?.isNet??0)>0) ? 'HIGH'
      : ((s.stats?.isPF??0)>=1.1 && (s.stats?.isNet??0)>0) ? 'MEDIUM' : 'LOW';
    return {
      id:s.id, label:s.label, instrument:s.inst, status, reason, robustness, core:s.core,
      mtmStatus: MTM_STATUS[s.id] ?? 'UNKNOWN',
      netEUR:s.stats?.netEUR??0, isNet:s.stats?.isNet??0, oosNet:s.stats?.oosNet??0,
      oos2019Net:s.stats?.oos19Net??0, PF:s.stats?.PF??0, isPF:s.stats?.isPF??0,
      posYr:s.stats?.posYr??0, totYr:s.stats?.totYr??0, tradesPerYear:s.stats?.tradesPerYear??0,
      marginPerContract:s.margin, costPerRT:s.costRt,
      annualCostEUR:Math.round(n*(s.stats?.tradesPerYear??0)*s.costRt*EUR_PER_USD),
      contracts:n, targetWeight:0,
      realizedWeight:totalMargin>0 ? +(marginUsed/totalMargin*100).toFixed(1) : 0,
    };
  });
}

// ─── Build summary JSON ────────────────────────────────────────────────────────
const capitalComparison = tierResults.map(tier => {
  const rec = tier.recommended;
  const isk = rec.isKPIs;
  const fkp = rec.fullKPIs;
  const f   = rec.feasibility;
  const comps = buildComponents(rec.contracts, f?.totalMargin ?? 0);
  const lad   = ladder.find(l => l.capital === tier.capital) ?? null;
  return {
    capital: tier.capital, budgetUsed: rec.budgetPct, actualMarginPct: rec.actualMarginPct,
    assessment: f?.assessment, marginPct: f?.marginPct, marginTotal: f?.totalMargin,
    feasibility: f?.feasible, corePass: f?.corePass, corePassStr: f?.corePassStr,
    survivalStatus: f?.survivalStatus,
    // SELECTION METRICS (IS-only)
    selectionMetrics: {
      isCAGR: isk?.isCAGR, isSharpe: isk?.isSharpe, isCalmar: isk?.isCalmar,
      isMaxDDPct: isk?.isMaxDDPct, isMaxDDEUR: isk?.isMaxDDEUR, isPF: isk?.isPF,
      isTop1Conc: isk?.isTop1Conc, isTop3Conc: isk?.isTop3Conc,
      isEffectiveSleeves: isk?.isEffectiveSleeves,
    },
    // OOS EVALUATION METRICS (post-freeze — measurement only)
    oosEvaluation: {
      CAGR: fkp?.CAGR, isCAGR: fkp?.isCAGR, oosCAGR: fkp?.oosCAGR, oos2019CAGR: fkp?.oos2019CAGR,
      Sharpe: fkp?.Sharpe, Sortino: fkp?.Sortino, Calmar: fkp?.Calmar,
      MaxDDPct: fkp?.MaxDDPct, MaxDDEUR: fkp?.MaxDDEUR, totalNetEUR: fkp?.totalNetEUR,
      PF: fkp?.PF, expectancyEUR: fkp?.expectancyEUR, winRate: fkp?.winRate,
    },
    score: rec.score, activeSleeves: rec.activeSleeves, annCostEUR: rec.annCostEUR,
    contracts: Object.fromEntries(Object.entries(rec.contracts).filter(([,n])=>n>0)),
    components: comps, ladder: lad,
    // Convenience fields for dashboard compatibility
    CAGR: fkp?.CAGR, isCAGR: fkp?.isCAGR, oosCAGR: fkp?.oosCAGR, oos2019CAGR: fkp?.oos2019CAGR,
    Sharpe: fkp?.Sharpe, Sortino: fkp?.Sortino, Calmar: fkp?.Calmar,
    MaxDDPct: fkp?.MaxDDPct, MaxDDEUR: fkp?.MaxDDEUR, totalNetEUR: fkp?.totalNetEUR,
    PF: fkp?.PF, expectancyEUR: fkp?.expectancyEUR, winRate: fkp?.winRate,
    stressMarginNeeded: fkp ? Math.round((fkp.MaxDDEUR ?? 0) * 1.5) : null,
    corePassStr: f?.corePassStr,
  };
});

const recCapData = capitalComparison.find(r => r.capital === recCap);

const summary = {
  version: 'v6.2',
  generatedAt: '2026-08-16',
  status: 'IS_ONLY_SELECTION_NO_OOS_LEAKAGE',
  description: 'v6.2: IS-only selection scoring. No OOS2019 in optimizer. Budget scan replaces hardcoded 0.82. Exit-date P&L (v6.1). DAILY_MTM_BLOCKED flagged per sleeve.',
  navMethodNote: 'P&L booked on exit date for all strategies (v6.1 correction). Daily NAV = realized exit-date P&L accumulated. MaxDD reflects realized P&L only — intraday MTM not modeled for multi-day positions (DAILY_MTM_BLOCKED). FEASIBILITY_UNVERIFIED until real daily MTM available.',
  oos2019LeakageStatus: 'REMOVED — scorePortfolio() uses IS-only metrics. extraGreedy() sorts by IS return per margin dollar. OOS2019 computed AFTER freeze as evaluation-only.',
  hardcoded082Status: 'REMOVED — replaced with 8-point budget scan [0.60..0.88]. Optimal budget emerges from IS scoring.',
  goldMeta: GOLD_META,
  mtmStatusByStrategy: MTM_STATUS,
  coreMinMargin: CORE_MIN_MARGIN,
  canonicalTotal: 17, tradableComponents: UNIVERSE.filter(s=>!s.blocked).length,
  blockedComponents: UNIVERSE.filter(s=>s.blocked).length,
  recommendedCapital: recCap,
  bestSmallAccount: bestSmall ? {
    capital: bestSmall.capital, isCalmar: bestSmall.recommended.isKPIs?.isCalmar,
    isCAGR: bestSmall.recommended.isKPIs?.isCAGR,
    selectionCriterion: 'isCalmar (IS Calmar ratio — DD-adjusted IS return, no OOS reference)',
  } : null,
  fullTradableAt: fullTradable?.capital ?? null,
  components: recCapData?.components ?? [],
  capitalComparison,
  portfolioKPIs: {
    // OOS evaluation of recommended capital — post-freeze
    CAGR: recCapData?.CAGR, isCAGR: recCapData?.isCAGR,
    oosCAGR: recCapData?.oosCAGR, oos2019CAGR: recCapData?.oos2019CAGR,
    Sharpe: recCapData?.Sharpe, Sortino: recCapData?.Sortino, Calmar: recCapData?.Calmar,
    MaxDDPct: recCapData?.MaxDDPct, MaxDDEUR: recCapData?.MaxDDEUR,
    totalNetEUR: recCapData?.totalNetEUR,
  },
  capitalLadder: ladder,
  serkan: {
    path: 'workspace/output/white-swan/serkan/v6.2/',
    navMethod: 'EXIT_DATE_REALIZED_PNL',
    mtmNote: 'Daily returns represent exit-date realized P&L / capital. Zero on non-trade days and during holds. NOT mark-to-market.',
    finalRows: finalRows.length, dateRange: ['2008-01-02','2025-12-31'],
    perCapitalAudit: serkanAudit,
  },
  selectionScoring: {
    method: 'IS-only (cagrScore×3.0 + sharpeScore×2.0 + calmarScore×1.5 + pfScore×0.5 + divScore×1.0 - ddPenalty - marginPenalty - concPenalty)',
    inputs: ['isCAGR','isSharpe','isCalmar','isPF','isMaxDDPct','isEffectiveSleeves','marginPct'],
    oosInputs: 'NONE — OOS2019 and OOS period excluded from scoring',
  },
  budgetScan: BUDGET_SCAN,
};

fs.writeFileSync('workspace/output/white-swan/v6.2/portfolio-summary.json', JSON.stringify(summary, null, 2));
fs.writeFileSync('public/data/white-swan/final/portfolio-summary.json',     JSON.stringify(summary, null, 2));
fs.writeFileSync('workspace/output/white-swan/v6.2/equity-series.json', JSON.stringify({ series: equitySeries, yearlyReturns }));
fs.writeFileSync('public/data/white-swan/final/equity-series.json',     JSON.stringify({ series: equitySeries, yearlyReturns }));

// ─── GC worst-day margin stress (8×MGC at recommended capital) ───────────────
const gcRaw = JSON.parse(fs.readFileSync('workspace/output/white-swan/gc_daily_raw.json', 'utf8'));
const gcPrices = {};
for (let i=0;i<gcRaw.ts.length;i++) {
  const date = new Date(gcRaw.ts[i]*1000).toISOString().slice(0,10);
  gcPrices[date] = gcRaw.close[i];
}
const gcDates = Object.keys(gcPrices).sort().filter(d=>d>='2008-01-01'&&d<='2025-12-31');
const gcMoves = [];
for (let i=1;i<gcDates.length;i++) {
  const chg = Math.abs(gcPrices[gcDates[i]] - gcPrices[gcDates[i-1]]);
  const pct  = chg / gcPrices[gcDates[i-1]] * 100;
  if (pct < 10) gcMoves.push({ date: gcDates[i], chg, pct });  // filter roll artifacts >10%
}
gcMoves.sort((a,b) => b.chg - a.chg);
const gcWorstDay = gcMoves[0];
const mgc8WorstEUR = Math.round(gcWorstDay.chg * 10 * 8 * EUR_PER_USD);

// ─── Final verdict ────────────────────────────────────────────────────────────
const recIsk = recTier?.recommended?.isKPIs;
const recFkp = recTier?.recommended?.fullKPIs;
const recFeas= recTier?.recommended?.feasibility;
const allCorePass = tierResults.every(t => t.recommended.feasibility?.corePass);
const allFeasible  = tierResults.every(t => t.recommended.feasibility?.feasible);

console.log('\n\n=== V6.2 VERDICT ===');
console.log('');
console.log('GOLD_PRICE_SOURCE:         ' + GOLD_META.GOLD_PRICE_SOURCE);
console.log('GOLD_TRADING_INSTRUMENT:   ' + GOLD_META.GOLD_TRADING_INSTRUMENT);
console.log('GOLD_CONTRACT_MULTIPLIER:  ' + GOLD_META.GOLD_CONTRACT_MULTIPLIER);
console.log('GOLD_MARGIN_INSTRUMENT:    ' + GOLD_META.GOLD_MARGIN_INSTRUMENT);
console.log('GLD_USED_ANYWHERE:         ' + GOLD_META.GLD_USED_ANYWHERE);
console.log('');
console.log('REAL_DAILY_MTM:            NOT_ACHIEVABLE — gld_atr2080_trades.json has no entry/exit dates/prices; no daily price files for seasonal strategies');
console.log('EXIT_LUMP_SUM_REMOVED:     YES — v6.1 switched from entryDate to exitDate; maintained in v6.2');
console.log('');
console.log('OOS_SELECTION_REFERENCES:  ');
console.log('  scorePortfolio() oos2019CAGR weight=5.0 → ILLEGAL_SELECTION_USE → REMOVED in v6.2');
console.log('  extraGreedyReturn() sort by oosNet       → ILLEGAL_SELECTION_USE → REMOVED in v6.2');
console.log('  extraBalanced() filter oosNet>0          → ILLEGAL_SELECTION_USE → REMOVED in v6.2');
console.log('  extraMaxSharpe() sort by oosNet/vol      → ILLEGAL_SELECTION_USE → REMOVED in v6.2');
console.log('  extraMaxCalmar() filter/sort by oosNet   → ILLEGAL_SELECTION_USE → REMOVED in v6.2');
console.log('  computeFullKPIs() oos2019CAGR calc       → MEASUREMENT_ONLY → KEPT (post-freeze only)');
console.log('  stratStats() oos19Net calculation        → MEASUREMENT_ONLY → KEPT');
console.log('OOS_LEAKAGE_REMOVED:       YES — 5 ILLEGAL_SELECTION_USE refs removed');
console.log('');
console.log('82_PERCENT_HARDCODE_REMOVED: YES — replaced with budget scan ' + JSON.stringify(BUDGET_SCAN));
console.log('  Winning budget at each tier:');
tierResults.forEach(t => {
  const rec = t.recommended;
  console.log(`    €${(t.capital/1000).toFixed(0)}k: budget=${rec.budgetPct} actual=${rec.actualMarginPct}%`);
});
console.log('');
console.log('GC_WORST_DAY_REAL:         $'+gcWorstDay.chg.toFixed(1)+'/oz on '+gcWorstDay.date+' ('+gcWorstDay.pct.toFixed(2)+'%)');
console.log('MGC_8CT_WORST_DAY_EUR:     €'+mgc8WorstEUR+' (vs free cash per capital tier:)');
tierResults.forEach(t => {
  const marg = t.recommended.feasibility?.totalMargin ?? 0;
  const freeCash = t.capital - marg;
  const gldCts = t.recommended.contracts.gld_mgc ?? 0;
  const worstForTier = Math.round(gcWorstDay.chg * 10 * gldCts * EUR_PER_USD);
  console.log(`    €${(t.capital/1000).toFixed(0)}k: margin=€${marg} free=€${freeCash} gld×${gldCts} worst-day=€${worstForTier} survival=${freeCash>worstForTier?'MARGIN_SAFE':'MARGIN_CALL_RISK'}`);
});
console.log('');
console.log('10K_SURVIVAL:              FEASIBILITY_UNVERIFIED — real daily MTM not computed');
console.log('ALL_TIERS_SURVIVAL:        FEASIBILITY_UNVERIFIED — real daily MTM not computed');
console.log('');
console.log('SERKAN_DAILY_RETURN_VALID: EXIT_DATE_REALIZED — not genuine daily MTM; DAILY_MTM_BLOCKED per sleeve');
console.log('MAXDD_VALID:               UNDERSTATED — based on exit-date realized P&L only, no intraday MTM');
console.log('SHARPE_VALID:              CONDITIONAL — all 4696 trading days denominator correct; numerator uses exit-date realized P&L');
console.log('CORE_QUALITY:              ' + (allCorePass ? 'CORE 5/5 ALL TIERS' : 'PARTIAL_FAIL'));
console.log('');
console.log('SELECTION_METRICS (IS-only, used for portfolio choice):');
tierResults.forEach(t => {
  const isk = t.recommended.isKPIs;
  console.log(`  €${(t.capital/1000).toFixed(0)}k: isCAGR=${isk?.isCAGR}% isSharpe=${isk?.isSharpe} isCalmar=${isk?.isCalmar} isMaxDD=${isk?.isMaxDDPct}% isPF=${isk?.isPF}`);
});
console.log('');
console.log('OOS_EVALUATION_METRICS (post-freeze, measurement only):');
tierResults.forEach(t => {
  const fkp = t.recommended.fullKPIs;
  console.log(`  €${(t.capital/1000).toFixed(0)}k: CAGR=${fkp?.CAGR}% oosCAGR=${fkp?.oosCAGR}% oos2019CAGR=${fkp?.oos2019CAGR}% Sharpe=${fkp?.Sharpe} MaxDD=${fkp?.MaxDDPct}%`);
});
console.log('');
console.log('SERKAN AUDIT:');
Object.entries(serkanAudit).forEach(([cap, a]) => {
  console.log(`  €${+cap/1000}k: rows=${a.rows} impliedPnL=€${a.impliedPnL} net=€${a.totalNetEUR} ${a.pass?'✓ PASS':'✗ FAIL'}`);
});
console.log('');
console.log('BEST SMALL ACCOUNT:       €'+recCap+' (selected by isCalmar='+recIsk?.isCalmar+')');
console.log('FULL TRADABLE WHITE SWAN: '+(fullTradable?'€'+fullTradable.capital:'€>100k'));
console.log('');

// Determine final status
const v62Status = allCorePass && allFeasible ? 'V6_2_VALIDATED_WITH_CAVEATS' : 'V6_2_REQUIRES_CORRECTION';
console.log('V6.2_STATUS: ' + v62Status);
console.log('');
console.log('CAVEATS THAT PREVENT FULL V6_2_VALIDATED:');
console.log('  1. REAL_DAILY_MTM: NOT ACHIEVABLE without reconstructing gld_atr2080 from raw GC data with entry/exit tracking');
console.log('  2. MAXDD: understated (exit-date realized only, no intraday MTM for multi-day positions)');
console.log('  3. FEASIBILITY_UNVERIFIED: margin survival not proven without true variation-margin simulation');
console.log('  4. GLD×8 concentration: at small capitals, worst-case GC move far exceeds free cash');
console.log('');
console.log('WHAT IS VALIDATED IN v6.2:');
console.log('  ✓ IS-ONLY selection — no OOS2019 influence on portfolio choice');
console.log('  ✓ Budget scan replaces hardcoded 0.82');
console.log('  ✓ Exit-date P&L (no entry-date lump-sum)');
console.log('  ✓ Core 5/5 enforced at all tiers');
console.log('  ✓ GLD uses GC futures prices, not GLD ETF');
console.log('  ✓ OOS2019 cleanly separated as post-freeze evaluation-only metric');
console.log('  ✓ Selection/Evaluation metrics clearly separated in output JSON');
