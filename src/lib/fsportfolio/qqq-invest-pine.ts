// QQQ Invest Pine — Pure Pine strategy reimplementation on QQQ OHLC
// Pine script: White Swan - Capitalife | NAS EMA
// Strategy: Long/Cash dip-in-uptrend using SMA400 (trend filter) + SMA5 (entry/exit)
// Regime filter disabled by default (all toggles false → allowRegime = true always)

export type QQQInvestPineOptions = {
  initialCapital: number;
  contractPercent: number;
  ma1Length: number;
  ma2Length: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  useCompound: boolean;
  lowerClose: boolean;
  startDate: string;
  endDate: string;
  commissionPerContract: number;
  executionMode: "close" | "next_open";
  cashReturn: number;
};

export type QQQInvestPineTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  returnPct: number;
  exitReason: "signal" | "take_profit" | "stop_loss" | "end_of_data";
};

export type QQQInvestPineEquityPoint = {
  date: string;
  equity: number;
  cumulativeReturnPct: number;
  dailyReturnPct: number;
  drawdownPct: number;
  inMarket: boolean;
  signal: "long" | "cash";
};

export type QQQInvestPineSummary = {
  firstDate: string | null;
  lastDate: string | null;
  dataPoints: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
  profitFactor: number | null;
  totalReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  averageGainPct: number | null;
  averageLossPct: number | null;
  payoffRatio: number | null;
  timeInMarketPct: number | null;
  currentSignal: "long" | "cash";
  lastTradeDate: string | null;
  options: QQQInvestPineOptions;
};

export type OhlcBarLite = {
  date: string;
  open: number;
  close: number;
};

export const QQQ_INVEST_PINE_DEFAULTS: QQQInvestPineOptions = {
  initialCapital: 10_000,
  contractPercent: 50,
  ma1Length: 400,
  ma2Length: 5,
  stopLossPercent: 25,
  takeProfitPercent: 2,
  useCompound: false,
  lowerClose: false,
  startDate: "1995-01-01",
  endDate: "2099-01-01",
  commissionPerContract: 0.005,
  executionMode: "next_open",
  cashReturn: 0,
};

export function calculateSMA(values: number[], length: number, endIndex: number): number | null {
  if (endIndex < length - 1) return null;
  let sum = 0;
  for (let index = endIndex - length + 1; index <= endIndex; index++) {
    sum += values[index]!;
  }
  return sum / length;
}

export function buildQQQInvestPineTrades(
  bars: OhlcBarLite[],
  options: QQQInvestPineOptions = QQQ_INVEST_PINE_DEFAULTS,
): QQQInvestPineTrade[] {
  const {
    initialCapital, contractPercent, ma1Length, ma2Length,
    stopLossPercent, takeProfitPercent, commissionPerContract,
    executionMode, startDate, endDate,
  } = options;

  const closes = bars.map((bar) => bar.close);
  const opens = bars.map((bar) => bar.open);
  const N = bars.length;

  const trades: QQQInvestPineTrade[] = [];

  let inPosition = false;
  let entryDate: string | null = null;
  let entryPrice = 0;
  let buyPrice = 0;
  let quantity = 0;
  let entryCommission = 0;

  // Pending entry (next_open mode): buy signal fired, entry executes at next bar's open
  let pendingBuy: { signalBarIndex: number; buyPriceRef: number } | null = null;

  for (let index = 0; index < N; index++) {
    const bar = bars[index]!;
    const date = bar.date;

    if (date < startDate || date > endDate) continue;

    const ma1 = calculateSMA(closes, ma1Length, index);
    const ma2 = calculateSMA(closes, ma2Length, index);
    const close = closes[index]!;
    const open = opens[index]!;

    // Handle pending buy entry at this bar's open (next_open mode)
    if (pendingBuy !== null && !inPosition) {
      entryPrice = executionMode === "next_open" ? open : closes[pendingBuy.signalBarIndex]!;
      buyPrice = pendingBuy.buyPriceRef;
      quantity = (initialCapital * contractPercent / 100) / entryPrice;
      entryCommission = quantity * commissionPerContract;
      entryDate = date;
      inPosition = true;
      pendingBuy = null;
    }

    // Check SL/TP while in position (checked against close of each bar vs buyPrice)
    if (inPosition) {
      const priceChange = ((close - buyPrice) / buyPrice) * 100;
      const slHit = priceChange <= -stopLossPercent;
      const tpHit = priceChange >= takeProfitPercent;

      if (slHit || tpHit) {
        const exitPrice = close;
        const exitCommission = quantity * commissionPerContract;
        const grossPnl = quantity * (exitPrice - entryPrice);
        const netPnl = grossPnl - entryCommission - exitCommission;

        trades.push({
          entryDate: entryDate!,
          exitDate: date,
          entryPrice: round4(entryPrice),
          exitPrice: round4(exitPrice),
          quantity: round6(quantity),
          grossPnl: round4(grossPnl),
          commission: round4(entryCommission + exitCommission),
          netPnl: round4(netPnl),
          returnPct: round4((exitPrice - entryPrice) / entryPrice * 100),
          exitReason: slHit ? "stop_loss" : "take_profit",
        });

        inPosition = false;
        entryDate = null;
        continue;
      }
    }

    // Check sell signal while in position (close > SMA5)
    if (inPosition && ma2 !== null) {
      const sellCondition = close > ma2;
      if (sellCondition) {
        const exitPrice = close;
        const exitCommission = quantity * commissionPerContract;
        const grossPnl = quantity * (exitPrice - entryPrice);
        const netPnl = grossPnl - entryCommission - exitCommission;

        trades.push({
          entryDate: entryDate!,
          exitDate: date,
          entryPrice: round4(entryPrice),
          exitPrice: round4(exitPrice),
          quantity: round6(quantity),
          grossPnl: round4(grossPnl),
          commission: round4(entryCommission + exitCommission),
          netPnl: round4(netPnl),
          returnPct: round4((exitPrice - entryPrice) / entryPrice * 100),
          exitReason: "signal",
        });

        inPosition = false;
        entryDate = null;
      }
    }

    // Check buy signal (no position, no pending buy, SMA400 and SMA5 ready)
    if (!inPosition && pendingBuy === null && ma1 !== null && ma2 !== null) {
      const buyCondition = close > ma1 && close < ma2;
      if (buyCondition) {
        if (executionMode === "close") {
          // Execute immediately at this bar's close
          entryPrice = close;
          buyPrice = open; // Pine: buyPrice := open (signal bar's open)
          quantity = (initialCapital * contractPercent / 100) / entryPrice;
          entryCommission = quantity * commissionPerContract;
          entryDate = date;
          inPosition = true;
        } else {
          // next_open: schedule entry at next bar's open
          pendingBuy = { signalBarIndex: index, buyPriceRef: open };
        }
      }
    }
  }

  // Close any open position at end of data
  if (inPosition && entryDate !== null) {
    const lastBar = bars[N - 1]!;
    const exitPrice = lastBar.close;
    const exitCommission = quantity * commissionPerContract;
    const grossPnl = quantity * (exitPrice - entryPrice);
    const netPnl = grossPnl - entryCommission - exitCommission;

    trades.push({
      entryDate,
      exitDate: lastBar.date,
      entryPrice: round4(entryPrice),
      exitPrice: round4(exitPrice),
      quantity: round6(quantity),
      grossPnl: round4(grossPnl),
      commission: round4(entryCommission + exitCommission),
      netPnl: round4(netPnl),
      returnPct: round4((exitPrice - entryPrice) / entryPrice * 100),
      exitReason: "end_of_data",
    });
  }

  return trades;
}

export function buildQQQInvestPineEquity(
  bars: OhlcBarLite[],
  trades: QQQInvestPineTrade[],
  options: QQQInvestPineOptions = QQQ_INVEST_PINE_DEFAULTS,
): QQQInvestPineEquityPoint[] {
  const { initialCapital, startDate, endDate } = options;

  // Build a date → trade result map for fast lookup
  const tradeExitMap = new Map<string, { netPnl: number; entryDate: string }>();
  for (const trade of trades) {
    tradeExitMap.set(trade.exitDate, { netPnl: trade.netPnl, entryDate: trade.entryDate });
  }

  // Track which dates are in-market (long) using a sorted interval approach
  const longIntervals: Array<{ start: string; end: string }> = trades.map((trade) => ({
    start: trade.entryDate,
    end: trade.exitDate,
  }));

  function isInMarket(date: string): boolean {
    return longIntervals.some((interval) => date >= interval.start && date <= interval.end);
  }

  // Build running equity from closed trade PnL + unrealized
  // For daily equity, we track: entry equity + running position mark-to-market
  let closedPnl = 0;
  const sortedTrades = [...trades].sort((left, right) => left.entryDate.localeCompare(right.entryDate));

  // Build a map of entry equity per trade
  const tradeEntryEquity = new Map<string, number>();
  {
    let running = initialCapital;
    for (const trade of sortedTrades) {
      tradeEntryEquity.set(trade.entryDate, running);
      running += trade.netPnl;
    }
  }

  // For daily mark-to-market, find current open trade (if any) for each date
  const activeTradeAtDate = new Map<string, QQQInvestPineTrade>();
  for (const trade of trades) {
    // Mark all dates in [entryDate, exitDate) as belonging to this trade
    const start = new Date(`${trade.entryDate}T00:00:00Z`);
    const end = new Date(`${trade.exitDate}T00:00:00Z`);
    const cursor = new Date(start);
    while (cursor <= end) {
      const d = cursor.toISOString().slice(0, 10);
      activeTradeAtDate.set(d, trade);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const barsInRange = bars.filter((bar) => bar.date >= startDate && bar.date <= endDate);
  if (!barsInRange.length) return [];

  const points: QQQInvestPineEquityPoint[] = [];
  let prevEquity = initialCapital;
  let peakEquity = initialCapital;
  let cumulativeClosedPnl = 0;

  // Build map of trade exit date → cumulative closed PnL after that exit
  const closedPnlAfterExit = new Map<string, number>();
  {
    let running = 0;
    for (const trade of sortedTrades) {
      running += trade.netPnl;
      closedPnlAfterExit.set(trade.exitDate, running);
    }
  }

  // Build cumulative closed PnL at each date
  // At any date, cumulative closed pnl = sum of netPnl for trades that exited on or before that date
  const exitDates = sortedTrades.map((trade) => trade.exitDate).sort();

  function getCumulativeClosedPnl(date: string): number {
    let total = 0;
    for (const trade of sortedTrades) {
      if (trade.exitDate <= date) total += trade.netPnl;
    }
    return total;
  }

  // Build open position price for mark-to-market
  const closePriceByDate = new Map(bars.map((bar) => [bar.date, bar.close]));

  for (const bar of barsInRange) {
    const date = bar.date;
    const activeTrade = activeTradeAtDate.get(date);
    const inMarket = Boolean(activeTrade);

    const cumClosed = getCumulativeClosedPnl(date);
    let unrealized = 0;
    if (activeTrade && date >= activeTrade.entryDate && date < activeTrade.exitDate) {
      // Unrealized: current close vs entry price
      const currentClose = closePriceByDate.get(date) ?? bar.close;
      unrealized = activeTrade.quantity * (currentClose - activeTrade.entryPrice);
    }

    const equity = initialCapital + cumClosed + unrealized;
    const dailyReturnPct = prevEquity > 0 ? (equity - prevEquity) / prevEquity * 100 : 0;
    const cumulativeReturnPct = (equity / initialCapital - 1) * 100;
    if (equity > peakEquity) peakEquity = equity;
    const drawdownPct = peakEquity > 0 ? (equity - peakEquity) / peakEquity * 100 : 0;

    points.push({
      date,
      equity: round2(equity),
      cumulativeReturnPct: round4(cumulativeReturnPct),
      dailyReturnPct: round4(dailyReturnPct),
      drawdownPct: round4(drawdownPct),
      inMarket,
      signal: inMarket ? "long" : "cash",
    });

    prevEquity = equity;
  }

  return points;
}

export function summarizeQQQInvestPine(
  trades: QQQInvestPineTrade[],
  equity: QQQInvestPineEquityPoint[],
  options: QQQInvestPineOptions,
): QQQInvestPineSummary {
  const { initialCapital } = options;
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));

  const firstPoint = equity[0];
  const lastPoint = equity.at(-1);
  const totalReturnPct = lastPoint ? (lastPoint.equity / initialCapital - 1) * 100 : 0;

  let cagrPct: number | null = null;
  if (firstPoint && lastPoint && firstPoint.date !== lastPoint.date) {
    const years = (new Date(lastPoint.date).getTime() - new Date(firstPoint.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years > 0) {
      cagrPct = (Math.pow(lastPoint.equity / initialCapital, 1 / years) - 1) * 100;
    }
  }

  const maxDrawdownPct = equity.length ? Math.abs(Math.min(...equity.map((point) => point.drawdownPct), 0)) : 0;
  const inMarketDays = equity.filter((point) => point.inMarket).length;
  const timeInMarketPct = equity.length ? (inMarketDays / equity.length) * 100 : null;

  const averageGainPct = wins.length ? wins.reduce((sum, trade) => sum + trade.returnPct, 0) / wins.length : null;
  const averageLossPct = losses.length ? Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0)) / losses.length : null;

  const lastTrade = trades.at(-1);
  const currentSignal: "long" | "cash" =
    lastTrade && lastPoint && lastTrade.exitDate >= lastPoint.date ? "long" : "cash";

  return {
    firstDate: firstPoint?.date ?? null,
    lastDate: lastPoint?.date ?? null,
    dataPoints: equity.length,
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct: trades.length ? round4((wins.length / trades.length) * 100) : null,
    profitFactor: grossLoss > 0 ? round4(grossProfit / grossLoss) : null,
    totalReturnPct: round4(totalReturnPct),
    cagrPct: cagrPct !== null ? round4(cagrPct) : null,
    maxDrawdownPct: round4(maxDrawdownPct),
    averageGainPct: averageGainPct !== null ? round4(averageGainPct) : null,
    averageLossPct: averageLossPct !== null ? round4(averageLossPct) : null,
    payoffRatio: averageGainPct !== null && averageLossPct ? round4(averageGainPct / averageLossPct) : null,
    timeInMarketPct: timeInMarketPct !== null ? round4(timeInMarketPct) : null,
    currentSignal,
    lastTradeDate: lastTrade?.exitDate ?? null,
    options,
  };
}

export function calculateQQQInvestPineSeries(
  bars: OhlcBarLite[],
  options: Partial<QQQInvestPineOptions> = {},
) {
  const merged: QQQInvestPineOptions = { ...QQQ_INVEST_PINE_DEFAULTS, ...options };
  const trades = buildQQQInvestPineTrades(bars, merged);
  const equity = buildQQQInvestPineEquity(bars, trades, merged);
  const summary = summarizeQQQInvestPine(trades, equity, merged);
  return { trades, equity, summary };
}

function round2(value: number) { return Math.round(value * 100) / 100; }
function round4(value: number) { return Math.round(value * 10_000) / 10_000; }
function round6(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
