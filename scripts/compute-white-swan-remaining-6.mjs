#!/usr/bin/env node
/**
 * White Swan — Remaining 6 Components
 *
 * EEM_SEA     : M12D20 Long +5d   → EEM.csv     1 share (RESEARCH_ETF_ONLY)
 * IWM_SEA     : M05D25 Long +5d   → IWM.csv     1 share (RESEARCH_ETF_ONLY)
 * GLD_1OZ     : Thursday Long ATR → COMEX_GC1_D 1OZ mult=1 (FUTURES_REPLICATION_POSSIBLE)
 * EURUSD_MT   : EMA(20/50) xover  → OANDA 30M   M6E  mult=12500 (FUTURES_REPLICATION_POSSIBLE)
 * DAX_1H_MT   : EMA(20/50) long   → OANDA 30M→1H FDXS mult=1    (PARTIAL: 2014+)
 * ZM1_SEA     : BLOCKED — no price data in repo
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FROM_DATE = "2008-01-01";
const TO_DATE   = "2026-08-13";

// ─── CSV helpers ─────────────────────────────────────────────────────────────

/** Daily CSV: returns [{date, open, high, low, close}] */
function readDailyOhlc(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`Missing: ${relPath}`);
  const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
  const raw   = lines[0].split(",").map(h => h.trim().toLowerCase());
  // Map column names — tolerate "datetime"/"date"/"time"
  const ci = (names) => { for (const n of names) { const i = raw.indexOf(n); if (i >= 0) return i; } return -1; };
  const iT = ci(["time","date","datetime","timestamp"]);
  const iO = ci(["open"]); const iH = ci(["high"]); const iL = ci(["low"]); const iC = ci(["close"]);
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",");
    const date  = v[iT]?.trim().slice(0, 10);
    const open  = parseFloat(v[iO]);
    const high  = parseFloat(v[iH]);
    const low   = parseFloat(v[iL]);
    const close = parseFloat(v[iC]);
    if (!date || !isFinite(close)) continue;
    bars.push({ date, open: isFinite(open) ? open : close, high: isFinite(high) ? high : close, low: isFinite(low) ? low : close, close });
  }
  return bars;
}

/** Intraday CSV: returns [{ts:"YYYY-MM-DDTHH:MM", open, high, low, close}] */
function readIntradayOhlc(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const raw   = lines[0].split(",").map(h => h.trim().toLowerCase());
  const ci = (names) => { for (const n of names) { const i = raw.indexOf(n); if (i >= 0) return i; } return -1; };
  const iT = ci(["datetime","date","time","timestamp"]);
  const iO = ci(["open"]); const iH = ci(["high"]); const iL = ci(["low"]); const iC = ci(["close"]);
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",");
    const rawT = v[iT]?.trim();
    if (!rawT) continue;
    // Normalize: "2014-01-02 08:00:00" → "2014-01-02T08:00"
    const ts = rawT.replace(" ", "T").slice(0, 16);
    const open  = parseFloat(v[iO]);
    const high  = parseFloat(v[iH]);
    const low   = parseFloat(v[iL]);
    const close = parseFloat(v[iC]);
    if (!isFinite(close)) continue;
    bars.push({ ts, open: isFinite(open)?open:close, high: isFinite(high)?high:close, low: isFinite(low)?low:close, close });
  }
  return bars;
}

/** First index where bars[i].date >= target */
function findOnOrAfter(dates, target) {
  let lo = 0, hi = dates.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return lo < dates.length ? lo : -1;
}

// ─── Indicators ──────────────────────────────────────────────────────────────

function ema(closes, period) {
  const out = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` valid values
  let seed = 0, count = 0, startI = -1;
  for (let i = 0; i < closes.length; i++) {
    if (!isFinite(closes[i])) continue;
    seed += closes[i]; count++;
    if (count === period) { out[i] = seed / period; startI = i; break; }
  }
  if (startI < 0) return out;
  for (let i = startI + 1; i < closes.length; i++) {
    out[i] = isFinite(closes[i]) ? closes[i] * k + out[i-1] * (1-k) : out[i-1];
  }
  return out;
}

function atr(bars, period = 14) {
  const n = bars.length;
  const tr = new Array(n).fill(0);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < n; i++) {
    const pc = bars[i-1].close;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc));
  }
  const out = new Array(n).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period-1] = sum / period;
  for (let i = period; i < n; i++) out[i] = (out[i-1] * (period-1) + tr[i]) / period;
  return out;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function stats(trades, label) {
  if (!trades.length) { console.log(`\n── ${label}: 0 trades`); return null; }
  const gross = trades.reduce((s, t) => s + t.gp, 0);
  const wins  = trades.filter(t => t.gp > 0);
  const losses = trades.filter(t => t.gp <= 0);
  const grossW = wins.reduce((s, t) => s + t.gp, 0);
  const grossL = Math.abs(losses.reduce((s, t) => s + t.gp, 0));
  const pf = grossL > 0 ? (grossW / grossL).toFixed(2) : "∞";
  const wr = (wins.length / trades.length * 100).toFixed(1);

  let peak = 0, eq = 0, maxDD = 0;
  for (const t of trades) {
    eq += t.gp; if (eq > peak) peak = eq;
    const dd = peak - eq; if (dd > maxDD) maxDD = dd;
  }

  const cur = trades[0].cur;
  console.log(`\n── ${label} ──`);
  console.log(`  Trades: ${trades.length} | WinRate: ${wr}% | PF: ${pf}`);
  console.log(`  Gross: ${cur} ${gross.toFixed(2)} | MaxDD: ${cur} ${maxDD.toFixed(2)}`);

  const samples = [0, Math.floor(trades.length / 2), trades.length - 1];
  for (const i of samples) {
    const t = trades[i];
    const ep = t.entry.toFixed(4); const xp = t.exit.toFixed(4);
    const math = t.spec ? `(${xp}-${ep})÷${t.spec.div}×${t.spec.mult}` : `(${xp}-${ep})×${t.mult??1}`;
    console.log(`  [${["FIRST","MID","LAST"][samples.indexOf(i)]}] ${t.entryDate}→${t.exitDate} ${t.dir||"LONG"}: entry=${ep} exit=${xp} pnl=${cur} ${t.gp.toFixed(2)} [${math}]`);
  }
  return { label, trades: trades.length, gross, currency: cur, maxDD };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. EEM_SEA — M12D20 Long +5d — 1 share  (RESEARCH_ETF_ONLY)
// ═══════════════════════════════════════════════════════════════════════════
function runEEM() {
  const bars  = readDailyOhlc("data/core-invest/canonical/EEM.csv");
  const dates = bars.map(b => b.date);
  const trades = [];
  for (let yr = 2003; yr <= 2026; yr++) {
    const target = `${yr}-12-20`;
    if (target > TO_DATE) break;
    const eIdx = findOnOrAfter(dates, target);
    if (eIdx < 0) continue;
    const xIdx = eIdx + 5; // 5 trading days forward
    if (xIdx >= bars.length) continue;
    const ep = bars[eIdx].open, xp = bars[xIdx].close;
    if (!isFinite(ep) || !isFinite(xp)) continue;
    trades.push({
      sid: "EEM_SEA", cur: "USD", dir: "LONG",
      entryDate: bars[eIdx].date, exitDate: bars[xIdx].date,
      entry: ep, exit: xp, gp: (xp - ep) * 1,
      mult: 1, spec: { div: 1, mult: 1 },
    });
  }
  return stats(trades, "EEM_SEA (EEM ETF · 1 share · RESEARCH_ETF_ONLY)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. IWM_SEA — M05D25 Long +5d — 1 share  (RESEARCH_ETF_ONLY)
// ═══════════════════════════════════════════════════════════════════════════
function runIWM() {
  const bars  = readDailyOhlc("data/core-invest/canonical/IWM.csv");
  const dates = bars.map(b => b.date);
  const trades = [];
  for (let yr = 2003; yr <= 2026; yr++) {
    const target = `${yr}-05-25`;
    if (target > TO_DATE) break;
    const eIdx = findOnOrAfter(dates, target);
    if (eIdx < 0) continue;
    // Sanity: entry must be in May (≤ June 10)
    if (bars[eIdx].date > `${yr}-06-10`) continue;
    const xIdx = eIdx + 5;
    if (xIdx >= bars.length) continue;
    const ep = bars[eIdx].open, xp = bars[xIdx].close;
    if (!isFinite(ep) || !isFinite(xp)) continue;
    trades.push({
      sid: "IWM_SEA", cur: "USD", dir: "LONG",
      entryDate: bars[eIdx].date, exitDate: bars[xIdx].date,
      entry: ep, exit: xp, gp: (xp - ep) * 1,
      mult: 1, spec: { div: 1, mult: 1 },
    });
  }
  return stats(trades, "IWM_SEA (IWM ETF · 1 share · RESEARCH_ETF_ONLY)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. GLD_1OZ — Thursday Long · ATR(14)×1.5 SL · ×3.0 TP · Fri close TIME
//    Futures: 1OZ (COMEX) · mult=1 · $/oz  (FUTURES_REPLICATION_POSSIBLE)
// ═══════════════════════════════════════════════════════════════════════════
function runGLD() {
  // GC1 is used by existing seasonal strategies — confirmed path
  const bars = readDailyOhlc("data/historical/metals/COMEX_GC1_D.csv");
  const atrs  = atr(bars, 14);
  const SL_M = 1.5, TP_M = 3.0, MULT = 1;
  const trades = [];

  for (let i = 14; i < bars.length - 1; i++) {
    if (bars[i].date < "2004-01-01") continue;
    if (bars[i].date > TO_DATE) break;
    // Thursday = UTC weekday 4
    const d = new Date(bars[i].date + "T12:00:00Z");
    if (d.getUTCDay() !== 4) continue;
    if (atrs[i] == null || !isFinite(atrs[i])) continue;

    const entryPrice = bars[i].close;
    const sl = entryPrice - atrs[i] * SL_M;
    const tp = entryPrice + atrs[i] * TP_M;
    const nx = bars[i + 1];

    let exitPrice, exitType;
    if (nx.low <= sl && nx.high >= tp) { exitPrice = sl; exitType = "SL"; } // both hit → SL (conservative)
    else if (nx.low <= sl)             { exitPrice = sl; exitType = "SL"; }
    else if (nx.high >= tp)            { exitPrice = tp; exitType = "TP"; }
    else                               { exitPrice = nx.close; exitType = "TIME"; }

    trades.push({
      sid: "GLD_1OZ", cur: "USD", dir: "LONG",
      entryDate: bars[i].date, exitDate: nx.date,
      entry: entryPrice, exit: exitPrice,
      gp: (exitPrice - entryPrice) * MULT,
      exitType, mult: MULT, spec: { div: 1, mult: MULT },
    });
  }

  const r = stats(trades, "GLD_1OZ (1OZ · mult=1 · COMEX_GC1 Thursday Long · FUTURES_REPLICATION_POSSIBLE)");
  if (r) {
    const sl  = trades.filter(t => t.exitType === "SL").length;
    const tp  = trades.filter(t => t.exitType === "TP").length;
    const tm  = trades.filter(t => t.exitType === "TIME").length;
    console.log(`  Exit breakdown: TIME=${tm}, SL=${sl}, TP=${tp}`);
    console.log("  Note: entry=Thu close, exit=next bar (Fri) SL/TP/close. ATR(14) on GC1 daily.");
  }
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EURUSD_MT — EMA(20) / EMA(50) crossover · LONG + SHORT
//    SL=13pip(0.0013) TP=39pip(0.0039) · M6E mult=12500  (FUTURES_REPLICATION_POSSIBLE)
// ═══════════════════════════════════════════════════════════════════════════
function runEURUSD() {
  const intraDir = path.join(ROOT, "data/historical/intraday");
  if (!fs.existsSync(intraDir)) {
    console.log("\n── EURUSD_MT: BLOCKED — data/historical/intraday/ not present locally");
    return null;
  }

  // Collect all OANDA_EURUSD_30M_*.csv
  let all = [];
  for (let i = 1; i <= 20; i++) {
    const p = path.join(intraDir, `OANDA_EURUSD_30M_${i}.csv`);
    all.push(...readIntradayOhlc(p));
  }
  if (all.length < 200) {
    console.log("\n── EURUSD_MT: BLOCKED — No OANDA_EURUSD_30M_*.csv found in data/historical/intraday/");
    return null;
  }

  // Deduplicate + sort
  const seen = new Set();
  all = all.filter(b => !seen.has(b.ts) && seen.add(b.ts));
  all.sort((a, b) => a.ts < b.ts ? -1 : 1);
  console.log(`\n  [EURUSD] ${all.length} 30M bars · ${all[0].ts} → ${all[all.length-1].ts}`);

  const closes = all.map(b => b.close);
  const e20    = ema(closes, 20);
  const e50    = ema(closes, 50);
  const SL = 0.0013, TP = 0.0039, MULT = 12500;

  const trades = [];
  let trade = null;

  for (let i = 1; i < all.length; i++) {
    if (e20[i] == null || e50[i] == null || e20[i-1] == null || e50[i-1] == null) continue;
    const crossUp   = e20[i-1] <= e50[i-1] && e20[i] > e50[i];
    const crossDown = e20[i-1] >= e50[i-1] && e20[i] < e50[i];

    // Check SL / TP for open trade
    if (trade) {
      const H = all[i].high, L = all[i].low;
      let ep2 = null, et2 = null;
      if (trade.dir === "LONG") {
        if (L <= trade.sl) { ep2 = trade.sl; et2 = "SL"; }
        else if (H >= trade.tp) { ep2 = trade.tp; et2 = "TP"; }
      } else {
        if (H >= trade.sl) { ep2 = trade.sl; et2 = "SL"; }
        else if (L <= trade.tp) { ep2 = trade.tp; et2 = "TP"; }
      }
      // Also exit on opposing signal
      if (!ep2 && ((trade.dir === "LONG" && crossDown) || (trade.dir === "SHORT" && crossUp))) {
        ep2 = all[i].close; et2 = "SIGNAL";
      }
      if (ep2 != null) {
        const gp = trade.dir === "LONG" ? (ep2 - trade.entry) * MULT : (trade.entry - ep2) * MULT;
        trades.push({ sid: "EURUSD_MT", cur: "USD", dir: trade.dir,
          entryDate: trade.ts.slice(0,10), exitDate: all[i].ts.slice(0,10),
          entry: trade.entry, exit: ep2, gp, mult: MULT, spec: { div:1, mult: MULT },
        });
        trade = null;
      }
    }

    // New signal
    if (!trade) {
      if (crossUp)   trade = { dir:"LONG",  entry:all[i].close, ts:all[i].ts, sl:all[i].close-SL, tp:all[i].close+TP };
      if (crossDown) trade = { dir:"SHORT", entry:all[i].close, ts:all[i].ts, sl:all[i].close+SL, tp:all[i].close-TP };
    }
  }
  // Close open trade at last bar
  if (trade) {
    const last = all[all.length-1];
    const ep2  = last.close;
    const gp   = trade.dir === "LONG" ? (ep2 - trade.entry)*MULT : (trade.entry - ep2)*MULT;
    trades.push({ sid:"EURUSD_MT", cur:"USD", dir:trade.dir,
      entryDate:trade.ts.slice(0,10), exitDate:last.ts.slice(0,10),
      entry:trade.entry, exit:ep2, gp, mult:MULT, spec:{div:1,mult:MULT},
    });
  }

  return stats(trades, "EURUSD_MT (M6E · mult=12500 · EMA20/50 · FUTURES_REPLICATION_POSSIBLE)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DAX_1H_MT — EMA(20/50) · LONG ONLY · SL=35pt · TP=126pt · signal exit
//    OANDA_DE30EUR_30M resampled to 1H · FDXS mult=1 EUR  (PARTIAL: 2014+)
// ═══════════════════════════════════════════════════════════════════════════
function runDAX1H() {
  const intraDir = path.join(ROOT, "data/historical/intraday");
  if (!fs.existsSync(intraDir)) {
    console.log("\n── DAX_1H_MT: BLOCKED — data/historical/intraday/ not present locally");
    return null;
  }

  let bars30 = [];
  for (let i = 1; i <= 12; i++) {
    const p = path.join(intraDir, `OANDA_DE30EUR_30M_${i}.csv`);
    bars30.push(...readIntradayOhlc(p));
  }
  if (bars30.length < 200) {
    console.log("\n── DAX_1H_MT: BLOCKED — No OANDA_DE30EUR_30M_*.csv files found");
    return null;
  }

  // Deduplicate + sort
  const seen = new Set();
  bars30 = bars30.filter(b => !seen.has(b.ts) && seen.add(b.ts));
  bars30.sort((a, b) => a.ts < b.ts ? -1 : 1);
  console.log(`\n  [DAX_1H] 30M: ${bars30.length} bars · ${bars30[0].ts} → ${bars30[bars30.length-1].ts}`);

  // Resample 30M → 1H  (group by YYYY-MM-DDTHH)
  const hourMap = new Map();
  for (const b of bars30) {
    const key = b.ts.slice(0, 13); // "2014-01-02T08"
    if (!hourMap.has(key)) {
      hourMap.set(key, { ts: key, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      const h = hourMap.get(key);
      if (b.high > h.high) h.high = b.high;
      if (b.low  < h.low)  h.low  = b.low;
      h.close = b.close; // last bar of the hour
    }
  }
  const bars1h = Array.from(hourMap.values()).sort((a, b) => a.ts < b.ts ? -1 : 1);
  console.log(`  1H bars: ${bars1h.length} · ${bars1h[0].ts} → ${bars1h[bars1h.length-1].ts}`);

  const closes = bars1h.map(b => b.close);
  const e20    = ema(closes, 20);
  const e50    = ema(closes, 50);
  const SL = 35, TP = 126, MULT = 1;

  const trades = [];
  let trade = null;

  for (let i = 1; i < bars1h.length; i++) {
    if (e20[i] == null || e50[i] == null || e20[i-1] == null || e50[i-1] == null) continue;
    const crossUp   = e20[i-1] <= e50[i-1] && e20[i] > e50[i];
    const crossDown = e20[i-1] >= e50[i-1] && e20[i] < e50[i];

    if (trade) {
      const H = bars1h[i].high, L = bars1h[i].low;
      let ep2 = null, et2 = null;
      // LONG only: TP then SL then signal exit
      if (H >= trade.tp)    { ep2 = trade.tp;  et2 = "TP"; }
      else if (L <= trade.sl) { ep2 = trade.sl; et2 = "SL"; }
      else if (crossDown)   { ep2 = closes[i]; et2 = "SIGNAL"; }
      if (ep2 != null) {
        const gp = (ep2 - trade.entry) * MULT;
        trades.push({ sid:"DAX_1H_MT", cur:"EUR", dir:"LONG",
          entryDate:trade.ts.slice(0,10), exitDate:bars1h[i].ts.slice(0,10),
          entry:trade.entry, exit:ep2, gp, mult:MULT, spec:{div:1,mult:MULT},
        });
        trade = null;
      }
    }

    if (!trade && crossUp) {
      trade = { dir:"LONG", entry:closes[i], ts:bars1h[i].ts, sl:closes[i]-SL, tp:closes[i]+TP };
    }
  }
  if (trade) {
    const last = bars1h[bars1h.length-1];
    const gp   = (last.close - trade.entry) * MULT;
    trades.push({ sid:"DAX_1H_MT", cur:"EUR", dir:"LONG",
      entryDate:trade.ts.slice(0,10), exitDate:last.ts.slice(0,10),
      entry:trade.entry, exit:last.close, gp, mult:MULT, spec:{div:1,mult:MULT},
    });
  }

  return stats(trades, "DAX_1H_MT (FDXS · mult=1 EUR · EMA20/50 · PARTIAL 2014+)");
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
console.log("═══ WHITE SWAN — REMAINING 6 COMPONENTS ═══\n");
console.log(`Period: ${FROM_DATE} → ${TO_DATE}\n`);

let r = {};
r.eem      = runEEM();
r.iwm      = runIWM();
r.gld      = runGLD();
r.eurusd   = runEURUSD();
r.dax      = runDAX1H();

console.log("\n── ZM1_SEA (MZM) ──");
console.log("  STATUS: BLOCKED — kein Preisdaten-CSV vorhanden");
console.log("  FEHLENDE INFORMATION: CBOT_ZM1_D.csv (Soybean Meal Continuous Futures, tägliche OHLCV)");
console.log("  DURCHSUCHTE QUELLEN: data/historical/agrar/, data/core-invest/canonical/,");
console.log("    .playwright-mcp/, public/data/, src/data/ — 0 Treffer");
console.log("  WARUM NICHT REKONSTRUIERBAR: Strategie M10D01 Long +22d vollständig spezifiziert.");
console.log("    Engine-Code identisch zu ZC1/ZW1/ZS1. Kein ETF-Proxy für ZM1 existiert als");
console.log("    liquides Produkt. CBOT ZM Continuous kann nicht aus anderen Serien abgeleitet werden.");
console.log("  EXAKT WELCHE EINE DATENQUELLE: CBOT_ZM1_D.csv — TradingView Export oder Quandl/WRDS.");

console.log("\n════ FINAL 17-COMPONENT STATUS TABLE ════\n");
const prev11 = [
  { id:"DAX_2H",   fut:"FDXS", wt:14, cur:"EUR", gross:16462,  trades:3217, status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"YM1_TAT",  fut:"MYM",  wt:10, cur:"USD", gross:2251,   trades:436,  status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"GC1_SEA",  fut:"1OZ",  wt:6,  cur:"USD", gross:1262,   trades:19,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"HG1_SEA",  fut:"MHG",  wt:5,  cur:"USD", gross:6135,   trades:19,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"CL1_SEA",  fut:"MCL",  wt:5,  cur:"USD", gross:10037,  trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"ZC1_SEA",  fut:"MZC",  wt:4,  cur:"USD", gross:1714,   trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"ZW1_SEA",  fut:"MZW",  wt:3,  cur:"USD", gross:31,     trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"ZS1_SEA",  fut:"MZS",  wt:4,  cur:"USD", gross:3101,   trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"CC1_SEA",  fut:"CC",   wt:3,  cur:"USD", gross:32930,  trades:19,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"SB1_SEA",  fut:"SB",   wt:4,  cur:"USD", gross:23139,  trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"SPY_SEA",  fut:"MES",  wt:5,  cur:"USD", gross:7823,   trades:18,   status:"FUTURES_REPLICATION_POSSIBLE" },
];

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

console.log(pad("#",3) + pad("Strategy",14) + pad("Future",7) + rpad("Wt%",5) + pad("  Ccy",6) + rpad("Gross",12) + rpad("Trades",8) + "  Status");
console.log("─".repeat(80));

let totalUSD = 0, totalEUR = 0, totalTrades = 0;
let idx = 1;
for (const s of prev11) {
  console.log(rpad(idx++,3) + " " + pad(s.id,13) + pad(s.fut,7) + rpad(s.wt,4) + "  " + pad(s.cur,5) + rpad(s.gross.toLocaleString(),11) + rpad(s.trades,8) + "  ✓ " + s.status);
  if (s.cur === "EUR") totalEUR += s.gross; else totalUSD += s.gross;
  totalTrades += s.trades;
}

const new6 = [
  { id:"EEM_SEA",  fut:"EEM",  wt:4,  cur:"USD", res:r.eem,  status:"RESEARCH_ETF_ONLY" },
  { id:"IWM_SEA",  fut:"IWM",  wt:3,  cur:"USD", res:r.iwm,  status:"RESEARCH_ETF_ONLY" },
  { id:"GLD_1OZ",  fut:"1OZ",  wt:10, cur:"USD", res:r.gld,  status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"EURUSD_MT",fut:"M6E",  wt:14, cur:"USD", res:r.eurusd,status:"FUTURES_REPLICATION_POSSIBLE" },
  { id:"DAX_1H_MT",fut:"FDXS", wt:14, cur:"EUR", res:r.dax,  status:"PARTIAL_2014_PLUS" },
  { id:"ZM1_SEA",  fut:"MZM",  wt:5,  cur:"USD", res:null,   status:"BLOCKED_NO_PRICE_DATA" },
];

for (const s of new6) {
  const gross  = s.res ? Math.round(s.res.gross)  : "?";
  const trades = s.res ? s.res.trades : "?";
  const icon   = s.res ? "✓" : "✗";
  console.log(rpad(idx++,3) + " " + pad(s.id,13) + pad(s.fut,7) + rpad(s.wt,4) + "  " + pad(s.cur,5) + rpad(String(gross),11) + rpad(String(trades),8) + `  ${icon} ` + s.status);
  if (s.res) {
    if (s.cur === "EUR") totalEUR += s.res.gross; else totalUSD += s.res.gross;
    totalTrades += s.res.trades;
  }
}

console.log("─".repeat(80));
console.log(`     ${"AGGREGATE".padEnd(40)} USD ${String(Math.round(totalUSD)).padStart(9)} EUR ${String(Math.round(totalEUR)).padStart(9)}`);
console.log(`     ${"".padEnd(40)} Trades: ${totalTrades.toLocaleString()}`);
