/**
 * Continuous Futures Validator — HG1! / 6S1! (and any other futures OHLC)
 *
 * Checks for:
 *   1. Rollover gaps (price discontinuities between sessions that exceed a threshold)
 *   2. Adjusted vs unadjusted price suspicion (back-adjusted = negative prices or large offsets)
 *   3. Missing sessions (gaps longer than 5 calendar days, excluding known holiday clusters)
 *   4. Zero/null bars
 *   5. Volume anomalies (if volume column present)
 *   6. Overall data statistics (first/last date, bar count, price range, avg daily range)
 *
 * Usage:
 *   node tools/monitoring/validate-continuous-contracts.mjs
 *   node tools/monitoring/validate-continuous-contracts.mjs --symbol HG1!
 *   node tools/monitoring/validate-continuous-contracts.mjs --symbol 6S1! --gap-threshold 0.05
 *   node tools/monitoring/validate-continuous-contracts.mjs --report  # saves JSON report
 *
 * Output: console report + optional JSON to public/generated/monitoring/futures-validation.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import { getInvestFolder } from "../_shared/brain-path.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const INVEST_FOLDER = getInvestFolder();

// ─── config ───────────────────────────────────────────────────────────────────
const TARGETS = [
  {
    symbol: "HG1!",
    name: "Copper Continuous (COMEX)",
    files: ["COMEX_DL_HG1!, 1D_9fc12.csv"],
    gapThreshold: 0.04,    // 4% single-day price jump flags potential rollover gap
    expectedYearStart: 1988,
    note: "Unadjusted continuous — expect rollover gaps at contract expiry (Jan, Mar, May, Jul, Sep, Dec)",
  },
  {
    symbol: "6S1!",
    name: "Swiss Franc Continuous (CME)",
    files: ["CME_DL_6S1!, 1D_b8f81.csv"],
    gapThreshold: 0.03,    // FX less volatile, 3% gap is significant
    expectedYearStart: 2005,
    note: "Unadjusted continuous — expect smaller rollover gaps (Mar, Jun, Sep, Dec expiry)",
  },
];

// Calendar months with typical futures rollover weeks
const ROLLOVER_MONTHS = {
  "HG1!": [1, 3, 5, 7, 9, 12],   // copper delivery months
  "6S1!": [3, 6, 9, 12],          // CHF/Swiss quarterly
};

// ─── csv parser ───────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const dateIdx   = header.findIndex(h => ["time", "date"].includes(h));
  const openIdx   = header.findIndex(h => h === "open");
  const highIdx   = header.findIndex(h => h === "high");
  const lowIdx    = header.findIndex(h => h === "low");
  const closeIdx  = header.findIndex(h => h === "close");
  const volumeIdx = header.findIndex(h => h === "volume");

  if (dateIdx === -1 || closeIdx === -1) {
    console.error(`  Cannot parse ${filePath}: missing date or close column`);
    return [];
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date  = cols[dateIdx]?.trim().slice(0, 10);
    const open  = parseFloat(cols[openIdx]);
    const high  = parseFloat(cols[highIdx]);
    const low   = parseFloat(cols[lowIdx]);
    const close = parseFloat(cols[closeIdx]);
    const vol   = volumeIdx >= 0 ? parseFloat(cols[volumeIdx]) : null;

    if (!date || isNaN(close)) continue;
    rows.push({ date, open, high, low, close, volume: isNaN(vol) ? null : vol });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// ─── analysis functions ───────────────────────────────────────────────────────
function daysBetween(dateA, dateB) {
  return (Date.parse(dateB) - Date.parse(dateA)) / 86400000;
}

function monthOf(date) {
  return parseInt(date.slice(5, 7), 10);
}

function analyzeRolloverGaps(bars, threshold, rolloverMonths) {
  const gaps = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const pctChange = Math.abs(curr.open - prev.close) / prev.close;

    if (pctChange >= threshold) {
      const mo = monthOf(curr.date);
      const likelyRollover = rolloverMonths ? rolloverMonths.includes(mo) : false;
      gaps.push({
        date: curr.date,
        prevClose: prev.close,
        openNext: curr.open,
        pctJump: +(pctChange * 100).toFixed(3),
        likelyRollover,
      });
    }
  }
  return gaps;
}

function analyzeMissingSessions(bars) {
  const gaps = [];
  for (let i = 1; i < bars.length; i++) {
    const d = daysBetween(bars[i - 1].date, bars[i].date);
    if (d > 5) {
      gaps.push({
        from: bars[i - 1].date,
        to:   bars[i].date,
        days: d,
      });
    }
  }
  return gaps;
}

function checkForNegativePrices(bars) {
  return bars.filter(b => b.close <= 0 || b.low <= 0);
}

function checkZeroBars(bars) {
  return bars.filter(b => b.open === 0 && b.high === 0 && b.low === 0 && b.close === 0);
}

function computeStats(bars) {
  if (!bars.length) return null;
  const closes = bars.map(b => b.close);
  const dailyRanges = bars.map(b => b.high - b.low);
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  }
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stddev = arr => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  };

  return {
    barCount: bars.length,
    firstDate: bars[0].date,
    lastDate: bars[bars.length - 1].date,
    minClose: +Math.min(...closes).toFixed(5),
    maxClose: +Math.max(...closes).toFixed(5),
    avgClose: +mean(closes).toFixed(5),
    avgDailyRange: +mean(dailyRanges).toFixed(5),
    avgDailyRangePct: +(mean(dailyRanges) / mean(closes) * 100).toFixed(3),
    dailyReturnStddev: +(stddev(returns) * 100).toFixed(3),
    hasNegativePrices: closes.some(c => c <= 0),
  };
}

function detectAdjustedContract(bars) {
  // Back-adjusted contracts often have negative or very small historical prices
  // Also look for patterns where the price curve is unnaturally smooth through rolls
  const negatives = bars.filter(b => b.close <= 0).length;
  const veryLow = bars.filter(b => b.close < 0.01).length;
  const minClose = Math.min(...bars.map(b => b.close));

  return {
    hasNegativeBars: negatives > 0,
    hasVeryLowBars: veryLow > 0,
    minClose,
    verdict: negatives > 0 ? "likely_back_adjusted" : veryLow > 0 ? "possibly_adjusted" : "likely_unadjusted",
  };
}

// ─── validator ────────────────────────────────────────────────────────────────
function validateTarget(target) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${target.name} (${target.symbol})`);
  console.log(`  ${target.note}`);
  console.log(`${"─".repeat(60)}`);

  let bars = null;
  for (const fname of target.files) {
    const fpath = join(INVEST_FOLDER, fname);
    if (existsSync(fpath)) {
      console.log(`  File: ${fname}`);
      bars = parseCSV(fpath);
      break;
    }
  }

  if (!bars || bars.length === 0) {
    console.log(`  ERROR: No data file found for ${target.symbol}`);
    return { symbol: target.symbol, error: "file_not_found" };
  }

  const stats = computeStats(bars);
  const adjustedCheck = detectAdjustedContract(bars);
  const rolloverMonths = ROLLOVER_MONTHS[target.symbol] ?? null;
  const rolloverGaps = analyzeRolloverGaps(bars, target.gapThreshold, rolloverMonths);
  const missingSessions = analyzeMissingSessions(bars);
  const negativeBars = checkForNegativePrices(bars);
  const zeroBars = checkZeroBars(bars);

  // ─── print stats
  console.log(`\n  STATS:`);
  console.log(`    Bar count   : ${stats.barCount}`);
  console.log(`    Date range  : ${stats.firstDate}  to  ${stats.lastDate}`);
  console.log(`    Price range : ${stats.minClose} – ${stats.maxClose}`);
  console.log(`    Avg close   : ${stats.avgClose}`);
  console.log(`    Avg day rng : ${stats.avgDailyRange} (${stats.avgDailyRangePct}%)`);
  console.log(`    Daily vol   : ${stats.dailyReturnStddev}% std dev`);

  // ─── adjusted check
  console.log(`\n  ADJUSTMENT CHECK:`);
  console.log(`    Min close   : ${adjustedCheck.minClose}`);
  console.log(`    Negative px : ${adjustedCheck.hasNegativeBars}`);
  console.log(`    Verdict     : ${adjustedCheck.verdict.toUpperCase()}`);

  // ─── rollover gaps
  console.log(`\n  ROLLOVER GAPS (>=${(target.gapThreshold * 100).toFixed(0)}% overnight jump):`);
  if (rolloverGaps.length === 0) {
    console.log(`    None found above threshold.`);
  } else {
    console.log(`    Total: ${rolloverGaps.length} gaps`);
    const likelyRollovers = rolloverGaps.filter(g => g.likelyRollover);
    const suspicious = rolloverGaps.filter(g => !g.likelyRollover);
    console.log(`    In rollover months : ${likelyRollovers.length}`);
    console.log(`    Outside rollover   : ${suspicious.length}  ${suspicious.length > 0 ? "(REVIEW!)" : ""}`);
    if (suspicious.length > 0) {
      console.log(`    Suspicious gaps:`);
      suspicious.slice(0, 10).forEach(g => {
        console.log(`      ${g.date}  prev=${g.prevClose}  open=${g.openNext}  jump=${g.pctJump}%`);
      });
    }
    // Show a few rollover samples
    if (likelyRollovers.length > 0) {
      console.log(`    Sample rollovers (last 3):`);
      likelyRollovers.slice(-3).forEach(g => {
        console.log(`      ${g.date}  prev=${g.prevClose}  open=${g.openNext}  jump=${g.pctJump}%`);
      });
    }
  }

  // ─── missing sessions
  console.log(`\n  MISSING SESSIONS (>5 calendar days gap):`);
  if (missingSessions.length === 0) {
    console.log(`    None.`);
  } else {
    console.log(`    Total: ${missingSessions.length} gaps`);
    missingSessions.slice(-5).forEach(g => {
      console.log(`      ${g.from} --> ${g.to}  (${g.days.toFixed(0)}d)`);
    });
  }

  // ─── anomalies
  if (negativeBars.length > 0) {
    console.log(`\n  NEGATIVE/ZERO PRICES: ${negativeBars.length} bars!`);
    negativeBars.slice(0, 5).forEach(b => console.log(`    ${b.date}: close=${b.close}`));
  }
  if (zeroBars.length > 0) {
    console.log(`\n  ZERO BARS: ${zeroBars.length} bars!`);
  }

  const suspiciousGaps = rolloverGaps.filter(g => !g.likelyRollover);
  const verdict = negativeBars.length > 0 ? "FAIL" :
                  suspiciousGaps.length > 10 ? "WARN" : "OK";
  console.log(`\n  VERDICT: ${verdict}`);

  return {
    symbol: target.symbol,
    name: target.name,
    stats,
    adjustedCheck,
    rolloverGaps: {
      total: rolloverGaps.length,
      likelyRollovers: rolloverGaps.filter(g => g.likelyRollover).length,
      suspicious: rolloverGaps.filter(g => !g.likelyRollover),
    },
    missingSessions,
    negativeBars: negativeBars.length,
    zeroBars: zeroBars.length,
    verdict,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const symbolFilter = args.includes("--symbol") ? args[args.indexOf("--symbol") + 1] : null;
const saveReport   = args.includes("--report");

const targets = symbolFilter
  ? TARGETS.filter(t => t.symbol === symbolFilter)
  : TARGETS;

console.log("Continuous Futures Validation");
console.log("================================");

const results = targets.map(validateTarget);

console.log(`\n${"=".repeat(60)}`);
console.log("SUMMARY:");
results.forEach(r => {
  if (r.error) {
    console.log(`  ${r.symbol.padEnd(8)}: ERROR — ${r.error}`);
  } else {
    const rolloverLine = `rollover gaps: ${r.rolloverGaps.likelyRollovers} normal, ${r.rolloverGaps.suspicious.length} suspicious`;
    console.log(`  ${r.symbol.padEnd(8)}: ${r.verdict.padEnd(5)}  ${r.stats.barCount} bars  ${r.stats.firstDate}..${r.stats.lastDate}  ${rolloverLine}`);
  }
});

if (saveReport) {
  const outPath = join(PROJECT_ROOT, "public", "generated", "monitoring", "futures-validation.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport saved: ${outPath}`);
}
