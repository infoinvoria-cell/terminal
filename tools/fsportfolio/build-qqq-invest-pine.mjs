// Build script: QQQ Invest Pine — compute Pine strategy on QQQ OHLC, write JSON files
// Usage: node tools/fsportfolio/build-qqq-invest-pine.mjs
// No TypeScript required — pure Node.js ESM

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const QQQ_CSV = path.join(
  projectRoot,
  "src",
  "data",
  "capitalife",
  "fsportfolio",
  "ohlc",
  "QQQ.csv",
);
const OUT_DIR = path.join(
  projectRoot,
  "src",
  "data",
  "capitalife",
  "fsportfolio",
  "backtests",
);

// Pine strategy defaults (matching QQQ_pine.txt exactly)
const OPTIONS = {
  initialCapital: 10_000,
  contractPercent: 50,        // 50% of capital per trade
  ma1Length: 400,             // SMA400 = long-term trend filter
  ma2Length: 5,               // SMA5  = short-term entry/exit trigger
  stopLossPercent: 25,        // Safety stop: -25% vs buyPrice
  takeProfitPercent: 2,       // Safety profit: +2% vs buyPrice
  useCompound: false,         // Fixed capital basis, no compounding
  startDate: "1995-01-01",
  endDate: "2099-01-01",
  commissionPerContract: 0.005, // IB rate: $0.005 per share
  executionMode: "next_open", // Signal on close, entry at next bar's open
};

// ─── CSV reader ──────────────────────────────────────────────────────────────

function readQQQCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`CSV too short: ${filePath}`);
  const headers = lines[0].split(",").map((cell) => cell.trim());
  const timeIdx = headers.indexOf("time");
  const openIdx = headers.indexOf("open");
  const closeIdx = headers.indexOf("close");
  if (timeIdx < 0 || openIdx < 0 || closeIdx < 0)
    throw new Error(`Missing columns in CSV: ${headers.join(", ")}`);
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((cell) => cell.trim());
      return {
        date: cells[timeIdx] ?? "",
        open: parseFloat(cells[openIdx] ?? "NaN"),
        close: parseFloat(cells[closeIdx] ?? "NaN"),
      };
    })
    .filter(
      (bar) => bar.date && !Number.isNaN(bar.open) && !Number.isNaN(bar.close),
    );
}

// ─── SMA ─────────────────────────────────────────────────────────────────────

function computeSMA(closes, length, endIdx) {
  if (endIdx < length - 1) return null;
  let sum = 0;
  for (let i = endIdx - length + 1; i <= endIdx; i++) sum += closes[i];
  return sum / length;
}

// ─── Pine strategy ───────────────────────────────────────────────────────────
// Signal logic (all regime toggles default = false → allowRegime = true always):
//   Buy:  close > SMA400  AND  close < SMA5  AND  no position
//   Sell: close > SMA5   AND  in position
//   SL:   (close - buyPrice) / buyPrice <= -0.25
//   TP:   (close - buyPrice) / buyPrice >=  0.02
//   buyPrice := open of SIGNAL bar (Pine model)
//   Execution: next bar's open (next_open mode)

function buildTrades(bars, options) {
  const {
    initialCapital,
    contractPercent,
    ma1Length,
    ma2Length,
    stopLossPercent,
    takeProfitPercent,
    commissionPerContract,
    executionMode,
    startDate,
    endDate,
  } = options;

  const closes = bars.map((b) => b.close);
  const opens = bars.map((b) => b.open);
  const N = bars.length;
  const trades = [];

  let inPosition = false;
  let entryDate = null;
  let entryPrice = 0;
  let buyPrice = 0; // Signal bar's open (Pine model)
  let qty = 0;
  let entryCommission = 0;

  // next_open: pending buy from previous bar's signal
  let pendingBuy = null; // { signalBarIdx, buyPriceRef }

  for (let i = 0; i < N; i++) {
    const bar = bars[i];
    const date = bar.date;
    if (date < startDate || date > endDate) continue;

    const ma1 = computeSMA(closes, ma1Length, i);
    const ma2 = computeSMA(closes, ma2Length, i);
    const close = closes[i];
    const open = opens[i];

    // Execute pending buy at this bar's open
    if (pendingBuy !== null && !inPosition) {
      entryPrice = executionMode === "next_open" ? open : closes[pendingBuy.signalBarIdx];
      buyPrice = pendingBuy.buyPriceRef;
      qty = (initialCapital * contractPercent / 100) / entryPrice;
      entryCommission = qty * commissionPerContract;
      entryDate = date;
      inPosition = true;
      pendingBuy = null;
    }

    // Check SL / TP while in position (Pine checks close vs buyPrice)
    if (inPosition) {
      const priceChange = ((close - buyPrice) / buyPrice) * 100;
      const slHit = priceChange <= -stopLossPercent;
      const tpHit = priceChange >= takeProfitPercent;

      if (slHit || tpHit) {
        const exitPrice = close;
        const exitComm = qty * commissionPerContract;
        const grossPnl = qty * (exitPrice - entryPrice);
        const netPnl = grossPnl - entryCommission - exitComm;
        trades.push({
          entryDate,
          exitDate: date,
          entryPrice: r4(entryPrice),
          exitPrice: r4(exitPrice),
          quantity: r6(qty),
          grossPnl: r4(grossPnl),
          commission: r4(entryCommission + exitComm),
          netPnl: r4(netPnl),
          returnPct: r4(((exitPrice - entryPrice) / entryPrice) * 100),
          exitReason: slHit ? "stop_loss" : "take_profit",
        });
        inPosition = false;
        entryDate = null;
        // After SL/TP: can still check buy signal below
      }
    }

    // Check sell signal (close > SMA5) while in position
    if (inPosition && ma2 !== null) {
      if (close > ma2) {
        const exitPrice = close;
        const exitComm = qty * commissionPerContract;
        const grossPnl = qty * (exitPrice - entryPrice);
        const netPnl = grossPnl - entryCommission - exitComm;
        trades.push({
          entryDate,
          exitDate: date,
          entryPrice: r4(entryPrice),
          exitPrice: r4(exitPrice),
          quantity: r6(qty),
          grossPnl: r4(grossPnl),
          commission: r4(entryCommission + exitComm),
          netPnl: r4(netPnl),
          returnPct: r4(((exitPrice - entryPrice) / entryPrice) * 100),
          exitReason: "signal",
        });
        inPosition = false;
        entryDate = null;
      }
    }

    // Check buy signal (no position, no pending, SMA values ready)
    if (!inPosition && pendingBuy === null && ma1 !== null && ma2 !== null) {
      if (close > ma1 && close < ma2) {
        if (executionMode === "close") {
          entryPrice = close;
          buyPrice = open; // signal bar's open
          qty = (initialCapital * contractPercent / 100) / entryPrice;
          entryCommission = qty * commissionPerContract;
          entryDate = date;
          inPosition = true;
        } else {
          // schedule entry at next bar's open
          pendingBuy = { signalBarIdx: i, buyPriceRef: open };
        }
      }
    }
  }

  // Close any open position at end of data
  if (inPosition && entryDate !== null) {
    const last = bars[N - 1];
    const exitPrice = last.close;
    const exitComm = qty * commissionPerContract;
    const grossPnl = qty * (exitPrice - entryPrice);
    const netPnl = grossPnl - entryCommission - exitComm;
    trades.push({
      entryDate,
      exitDate: last.date,
      entryPrice: r4(entryPrice),
      exitPrice: r4(exitPrice),
      quantity: r6(qty),
      grossPnl: r4(grossPnl),
      commission: r4(entryCommission + exitComm),
      netPnl: r4(netPnl),
      returnPct: r4(((exitPrice - entryPrice) / entryPrice) * 100),
      exitReason: "end_of_data",
    });
  }

  return trades;
}

function buildEquityAndDailyReturns(bars, trades, options) {
  const { initialCapital, startDate, endDate } = options;

  const closePriceMap = new Map(bars.map((b) => [b.date, b.close]));

  // Sort trades by entry date
  const sortedTrades = [...trades].sort((a, b) =>
    a.entryDate.localeCompare(b.entryDate),
  );

  // For each date: find active trade and compute equity
  // active trade: entryDate <= date <= exitDate (inclusive)
  const barsInRange = bars.filter(
    (bar) => bar.date >= startDate && bar.date <= endDate,
  );

  const equity = [];
  let peakEquity = initialCapital;
  let prevEquity = initialCapital;

  // Track closed PnL up to and including each date
  // Build list of (exitDate, cumulativePnl) for fast lookup
  let cumulativePnl = 0;
  const cumulativeAtExit = new Map();
  for (const trade of sortedTrades) {
    cumulativePnl += trade.netPnl;
    cumulativeAtExit.set(trade.exitDate, cumulativePnl);
  }

  // For efficient lookup: sorted exit dates
  const exitDatesAsc = sortedTrades.map((t) => t.exitDate).sort();

  function getClosedPnlAt(date) {
    let total = 0;
    for (const trade of sortedTrades) {
      if (trade.exitDate <= date) total += trade.netPnl;
      else break; // sorted
    }
    return total;
  }

  // Build open-trade lookup: for a given date, which trade is active?
  function getActiveTrade(date) {
    for (const trade of sortedTrades) {
      if (trade.entryDate <= date && trade.exitDate > date) return trade;
    }
    return null;
  }

  const dailyReturns = {};

  for (const bar of barsInRange) {
    const date = bar.date;
    const closedPnl = getClosedPnlAt(date);
    const activeTrade = getActiveTrade(date);

    let unrealized = 0;
    if (activeTrade) {
      const currentClose = closePriceMap.get(date) ?? bar.close;
      unrealized = activeTrade.quantity * (currentClose - activeTrade.entryPrice);
    }

    const currentEquity = initialCapital + closedPnl + unrealized;
    const dailyReturnPct =
      prevEquity > 0 ? (currentEquity - prevEquity) / prevEquity : 0;

    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdownPct =
      peakEquity > 0 ? (currentEquity - peakEquity) / peakEquity : 0;

    equity.push({
      date,
      equity: r2(currentEquity),
      cumulativeReturnPct: r4((currentEquity / initialCapital - 1) * 100),
      dailyReturnPct: r4(dailyReturnPct * 100),
      drawdownPct: r4(drawdownPct * 100),
      inMarket: Boolean(activeTrade),
      signal: activeTrade ? "long" : "cash",
    });

    dailyReturns[date] = dailyReturnPct;
    prevEquity = currentEquity;
  }

  return { equity, dailyReturns };
}

function summarize(trades, equity, options) {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));

  const first = equity[0];
  const last = equity.at(-1);
  const totalReturnPct = last
    ? r4((last.equity / options.initialCapital - 1) * 100)
    : 0;

  let cagrPct = null;
  if (first && last && first.date !== last.date) {
    const years =
      (new Date(last.date) - new Date(first.date)) /
      (365.25 * 24 * 3600 * 1000);
    if (years > 0) {
      cagrPct = r4(
        (Math.pow(last.equity / options.initialCapital, 1 / years) - 1) * 100,
      );
    }
  }

  const maxDrawdownPct = r4(
    Math.abs(Math.min(...equity.map((p) => p.drawdownPct), 0)),
  );
  const inMarketDays = equity.filter((p) => p.inMarket).length;
  const avgGain =
    wins.length
      ? r4(wins.reduce((s, t) => s + t.returnPct, 0) / wins.length)
      : null;
  const avgLoss =
    losses.length
      ? r4(
          Math.abs(
            losses.reduce((s, t) => s + t.returnPct, 0) / losses.length,
          ),
        )
      : null;

  const lastTrade = trades.at(-1);
  const currentSignal =
    last && lastTrade && lastTrade.exitDate >= last.date ? "long" : "cash";

  return {
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
    dataPoints: equity.length,
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct: trades.length ? r4((wins.length / trades.length) * 100) : null,
    profitFactor: grossLoss > 0 ? r4(grossProfit / grossLoss) : null,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct,
    averageGainPct: avgGain,
    averageLossPct: avgLoss,
    payoffRatio: avgGain !== null && avgLoss ? r4(avgGain / avgLoss) : null,
    timeInMarketPct:
      equity.length ? r4((inMarketDays / equity.length) * 100) : null,
    currentSignal,
    lastTradeDate: lastTrade?.exitDate ?? null,
    options,
  };
}

function r2(v) { return Math.round(v * 100) / 100; }
function r4(v) { return Math.round(v * 10_000) / 10_000; }
function r6(v) { return Math.round(v * 1_000_000) / 1_000_000; }

// ─── Main ────────────────────────────────────────────────────────────────────

console.log("Reading QQQ.csv...");
const bars = readQQQCsv(QQQ_CSV);
console.log(`  ${bars.length} bars loaded (${bars[0]?.date} → ${bars.at(-1)?.date})`);

console.log("Computing trades...");
const trades = buildTrades(bars, OPTIONS);
console.log(`  ${trades.length} trades computed`);

console.log("Building equity curve and daily returns...");
const { equity, dailyReturns } = buildEquityAndDailyReturns(bars, trades, OPTIONS);
console.log(`  ${equity.length} equity points`);

console.log("Summarizing...");
const summary = summarize(trades, equity, OPTIONS);
console.log(`  Total Return: ${summary.totalReturnPct}%`);
console.log(`  CAGR: ${summary.cagrPct}%`);
console.log(`  Max Drawdown: -${summary.maxDrawdownPct}%`);
console.log(`  Win Rate: ${summary.winRatePct}%`);
console.log(`  Profit Factor: ${summary.profitFactor}`);
console.log(`  Trade Count: ${summary.tradeCount}`);
console.log(`  Current Signal: ${summary.currentSignal}`);

// Validate against reference expectations
const warnings = [];
if (summary.tradeCount < 580 || summary.tradeCount > 720) warnings.push(`Trade count ${summary.tradeCount} outside expected range 580–720`);
if (summary.totalReturnPct < 50 || summary.totalReturnPct > 200) warnings.push(`Total return ${summary.totalReturnPct}% outside expected range 50–200%`);
if (summary.maxDrawdownPct > 20) warnings.push(`Max drawdown ${summary.maxDrawdownPct}% exceeds 20% warning threshold`);
if (summary.winRatePct !== null && (summary.winRatePct < 65 || summary.winRatePct > 82)) warnings.push(`Win rate ${summary.winRatePct}% outside expected range 65–82%`);

if (warnings.length > 0) {
  console.warn("\n⚠ Validation warnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
} else {
  console.log("\n✓ All validation checks passed");
}

// Write output files
fs.mkdirSync(OUT_DIR, { recursive: true });

const seriesPath = path.join(OUT_DIR, "qqq-invest-pine-series.json");
const tradesPath = path.join(OUT_DIR, "qqq-invest-pine-trades.json");
const summaryPath = path.join(OUT_DIR, "qqq-invest-pine-summary.json");

// Series: include summary + equity + dailyReturns (dailyReturns needed for portfolio backtest)
fs.writeFileSync(
  seriesPath,
  JSON.stringify({ summary, equity, dailyReturns }, null, 2),
);
fs.writeFileSync(tradesPath, JSON.stringify({ summary, trades }, null, 2));
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log(`\nWrote:`);
console.log(`  ${seriesPath}`);
console.log(`  ${tradesPath}`);
console.log(`  ${summaryPath}`);
console.log("\nDone.");
