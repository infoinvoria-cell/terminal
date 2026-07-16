import "server-only";

import fs from "node:fs";
import path from "node:path";
import { computeDrawdownCurve } from "@/lib/fsportfolio/metrics";
import type { EquityPoint, OhlcBar, WhiteSwanSleeveStatus } from "@/lib/fsportfolio/types";

const QQQ_PINE_SERIES_PATH = path.join(
  process.cwd(),
  "src",
  "data",
  "capitalife",
  "fsportfolio",
  "backtests",
  "qqq-invest-pine-series.json",
);

const LOCAL_WHITE_SWAN_DIR = path.join(process.cwd(), "src", "data", "capitalife", "fsportfolio", "white-swan");

type TradeRow = {
  tradeNumber: string;
  type: string;
  timestamp: string;
};

type TradeInterval = {
  tradeNumber: string;
  entryDate: string;
  exitDate: string;
  openTrade: boolean;
};

function normalizeHeader(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findFile(dirPath: string, matcher: (name: string) => boolean): string | null {
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (matcher(entry.name)) return path.join(dirPath, entry.name);
    }
  } catch {}
  return null;
}

function parseTradeExport(filePath: string): TradeRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((cell) => cell.trim());
  const headerMap = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const tradeNumberIndex = headerMap.get("tradenummer") ?? 0;
  const typeIndex = headerMap.get("typ") ?? 1;
  const timestampIndex = headerMap.get("datumunduhrzeit") ?? 2;

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return {
      tradeNumber: cells[tradeNumberIndex] ?? "",
      type: cells[typeIndex] ?? "",
      timestamp: (cells[timestampIndex] ?? "").slice(0, 10),
    };
  });
}

function buildTradeIntervals(tradeRows: TradeRow[]) {
  const byTrade = new Map<string, { entryDate?: string; exitDate?: string; openTrade?: boolean }>();
  for (const row of tradeRows) {
    if (!row.tradeNumber || !row.timestamp) continue;
    const item = byTrade.get(row.tradeNumber) ?? {};
    const lowerType = row.type.toLowerCase();
    if (lowerType.includes("einstieg")) item.entryDate = row.timestamp;
    if (lowerType.includes("ausstieg")) {
      item.exitDate = row.timestamp;
      item.openTrade = lowerType.includes("offen");
    }
    byTrade.set(row.tradeNumber, item);
  }

  return [...byTrade.entries()]
    .map(([tradeNumber, item]) => {
      if (!item.entryDate || !item.exitDate) return null;
      return {
        tradeNumber,
        entryDate: item.entryDate,
        exitDate: item.exitDate,
        openTrade: Boolean(item.openTrade),
      } satisfies TradeInterval;
    })
    .filter((item): item is TradeInterval => item !== null)
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
}

function buildTradeSet(intervals: TradeInterval[]) {
  const heldDates = new Set<string>();
  for (const interval of intervals) {
    for (const date of dateRange(interval.entryDate, interval.exitDate)) {
      heldDates.add(date);
    }
  }
  return heldDates;
}

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function buildStatusFromTradeExport(
  tradeRows: TradeRow[],
  qqqBars: OhlcBar[],
  sleeveCapital: number,
  sourcePath: string,
  pineReferencePath: string | null,
): WhiteSwanSleeveStatus {
  const intervals = buildTradeIntervals(tradeRows);
  const heldDates = buildTradeSet(intervals);
  const dailyReturns: Record<string, number> = {};
  const equityCurve: EquityPoint[] = [];

  let equity = sleeveCapital;
  for (let index = 1; index < qqqBars.length; index += 1) {
    const previous = qqqBars[index - 1]!;
    const current = qqqBars[index]!;
    const isLong = heldDates.has(current.date);
    const dailyReturn = isLong && previous.close !== 0 ? current.close / previous.close - 1 : 0;
    dailyReturns[current.date] = Number(dailyReturn.toFixed(10));
    equity *= 1 + dailyReturn;
    equityCurve.push({ date: current.date, value: Number(equity.toFixed(2)) });
  }

  const tradeList = intervals.map((interval) => {
    const startIndex = qqqBars.findIndex((bar) => bar.date >= interval.entryDate);
    const endIndex = qqqBars.findIndex((bar) => bar.date >= interval.exitDate);
    const startBar = startIndex >= 0 ? qqqBars[startIndex] : null;
    const endBar = endIndex >= 0 ? qqqBars[endIndex] : qqqBars.at(-1) ?? null;
    const returnPct =
      startBar && endBar && startBar.close !== 0
        ? ((endBar.close / startBar.close) - 1) * 100
        : 0;

    return {
      entryDate: interval.entryDate,
      exitDate: interval.exitDate,
      returnPct: Number(returnPct.toFixed(2)),
      netProfitUsd: null,
    };
  });

  const wins = tradeList.filter((trade) => trade.returnPct > 0);
  const losses = tradeList.filter((trade) => trade.returnPct < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0));
  const averageGain = wins.length ? grossProfit / wins.length : null;
  const averageLoss = losses.length ? Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0) / losses.length) : null;
  const drawdownCurve = computeDrawdownCurve(equityCurve);
  const longDays = Object.values(dailyReturns).filter((value) => value !== 0).length;
  const forwardStartDate = null;
  const forwardStartConfirmed = false;

  return {
    source: "trade_export",
    displayName: "QQQ Invest Pine",
    sourcePath,
    tradeExportStatus: "present",
    pineReferencePath,
    pineReferenceStatus: pineReferencePath ? "present" : "missing",
    currentSignal: intervals.at(-1)?.openTrade ? "long" : "cash",
    warning:
      "QQQ Invest Pine wird aus belegtem NAS100-Trade-Export als QQQ-Long/Cash-Implementierung aufgebaut. Kein separater Live-Track-Record belegt.",
    tradeCount: tradeList.length,
    winRatePct: tradeList.length ? (wins.length / tradeList.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageGainPct: averageGain,
    averageLossPct: averageLoss,
    payoffRatio: averageGain !== null && averageLoss ? averageGain / averageLoss : null,
    maxDrawdownPct: drawdownCurve.length ? Math.abs(Math.min(...drawdownCurve.map((point) => point.value), 0)) : null,
    timeInMarketPct: equityCurve.length ? (longDays / equityCurve.length) * 100 : null,
    forwardReturnPct: null,
    forwardStartDate,
    forwardStartConfirmed,
    currentSleeveValue: equityCurve.at(-1)?.value ?? sleeveCapital,
    contributionToPortfolioPct: equityCurve.length ? (((equityCurve.at(-1)!.value / sleeveCapital) - 1) * 10) : null,
    firstTradeDate: intervals[0]?.entryDate ?? null,
    lastTradeDate: intervals.at(-1)?.exitDate ?? null,
    equityCurve,
    drawdownCurve,
    tradeList,
    dailyReturns,
  };
}

function buildCashFallback(
  qqqBars: OhlcBar[],
  sleeveCapital: number,
  pineReferencePath: string | null,
  sourcePath?: string | null,
  warning?: string,
): WhiteSwanSleeveStatus {
  const equityCurve = qqqBars.slice(1).map((bar) => ({ date: bar.date, value: sleeveCapital }));
  const drawdownCurve = equityCurve.map((point) => ({ date: point.date, value: 0 }));
  const dailyReturns = Object.fromEntries(qqqBars.slice(1).map((bar) => [bar.date, 0]));
  return {
    source: sourcePath ? "signal_script" : "cash_fallback",
    displayName: "QQQ Invest Pine",
    sourcePath: sourcePath ?? null,
    tradeExportStatus: sourcePath ? "pending" : "missing",
    pineReferencePath,
    pineReferenceStatus: pineReferencePath ? "present" : "missing",
    currentSignal: "cash",
    warning: warning ?? "Keine belegbare QQQ-Invest-Pine-Berechnung verfuegbar.",
    tradeCount: 0,
    winRatePct: null,
    profitFactor: null,
    averageGainPct: null,
    averageLossPct: null,
    payoffRatio: null,
    maxDrawdownPct: 0,
    timeInMarketPct: 0,
    forwardReturnPct: null,
    forwardStartDate: null,
    forwardStartConfirmed: false,
    currentSleeveValue: sleeveCapital,
    contributionToPortfolioPct: 0,
    firstTradeDate: null,
    lastTradeDate: null,
    equityCurve,
    drawdownCurve,
    tradeList: [],
    dailyReturns,
  };
}

type QQQPineSeriesPayload = {
  summary?: {
    firstDate?: string;
    lastDate?: string;
    dataPoints?: number;
    tradeCount?: number;
    winRatePct?: number | null;
    profitFactor?: number | null;
    totalReturnPct?: number;
    maxDrawdownPct?: number;
    timeInMarketPct?: number | null;
    averageGainPct?: number | null;
    averageLossPct?: number | null;
    payoffRatio?: number | null;
    currentSignal?: "long" | "cash";
    lastTradeDate?: string | null;
  };
  equity?: Array<{ date: string; equity: number }>;
  dailyReturns?: Record<string, number>;
};

function buildStatusFromPineSeries(
  payload: QQQPineSeriesPayload,
  sleeveCapital: number,
  pineReferencePath: string | null,
): WhiteSwanSleeveStatus {
  const summary = payload.summary ?? {};
  const rawEquity = payload.equity ?? [];
  const dailyReturns: Record<string, number> = payload.dailyReturns ?? {};

  // Scale equity curve from the JSON (which uses initialCapital=10000) to sleeveCapital
  const jsonCapital = 10_000;
  const scale = sleeveCapital / jsonCapital;
  const equityCurve: EquityPoint[] = rawEquity.map((point) => ({
    date: point.date,
    value: Number((point.equity * scale).toFixed(2)),
  }));

  const drawdownCurve = computeDrawdownCurve(equityCurve);

  const tradeCount = summary.tradeCount ?? 0;
  const winCount = Math.round((summary.winRatePct ?? 0) / 100 * tradeCount);
  const lossCount = tradeCount - winCount;

  return {
    source: "signal_script",
    displayName: "QQQ Invest Pine",
    sourcePath: QQQ_PINE_SERIES_PATH,
    tradeExportStatus: "present",
    pineReferencePath,
    pineReferenceStatus: pineReferencePath ? "present" : "missing",
    currentSignal: summary.currentSignal ?? "cash",
    warning: null,
    tradeCount,
    winRatePct: summary.winRatePct ?? null,
    profitFactor: summary.profitFactor ?? null,
    averageGainPct: summary.averageGainPct ?? null,
    averageLossPct: summary.averageLossPct ?? null,
    payoffRatio: summary.payoffRatio ?? null,
    maxDrawdownPct: summary.maxDrawdownPct ?? null,
    timeInMarketPct: summary.timeInMarketPct ?? null,
    forwardReturnPct: null,
    forwardStartDate: null,
    forwardStartConfirmed: false,
    currentSleeveValue: equityCurve.at(-1)?.value ?? sleeveCapital,
    contributionToPortfolioPct: equityCurve.length
      ? ((equityCurve.at(-1)!.value / sleeveCapital - 1) * 10)
      : null,
    firstTradeDate: summary.firstDate ?? null,
    lastTradeDate: summary.lastTradeDate ?? null,
    equityCurve,
    drawdownCurve,
    tradeList: [],
    dailyReturns,
  };
}

export function buildWhiteSwanSleeveStatus(qqqBars: OhlcBar[], sleeveCapital: number) {
  const pineReferencePath = fs.existsSync(path.join(LOCAL_WHITE_SWAN_DIR, "QQQ_pine.txt"))
    ? path.join(LOCAL_WHITE_SWAN_DIR, "QQQ_pine.txt")
    : null;

  // Primary source: pre-computed pine series from QQQ OHLC (run build:qqq-pine to regenerate)
  if (fs.existsSync(QQQ_PINE_SERIES_PATH)) {
    try {
      const payload = JSON.parse(fs.readFileSync(QQQ_PINE_SERIES_PATH, "utf8")) as QQQPineSeriesPayload;
      if (payload.equity?.length && payload.dailyReturns) {
        return buildStatusFromPineSeries(payload, sleeveCapital, pineReferencePath);
      }
    } catch {
      // fall through to NAS100 export fallback
    }
  }

  // Fallback: NAS100 trade export dates mapped onto QQQ OHLC
  // (less accurate — NAS100 prices differ from QQQ, but signal dates are similar)
  const exportPath = findFile(LOCAL_WHITE_SWAN_DIR, (name) => name === "Invest_NAS_EMA_TRADES.csv");
  if (exportPath && qqqBars.length > 1) {
    const rows = parseTradeExport(exportPath);
    if (rows.length) {
      return buildStatusFromTradeExport(rows, qqqBars, sleeveCapital, exportPath, pineReferencePath);
    }
  }

  return buildCashFallback(
    qqqBars,
    sleeveCapital,
    pineReferencePath,
    pineReferencePath,
    "Pine-Referenz vorhanden, aber keine eindeutig berechenbare QQQ-Invest-Pine-Serie aus Exportdaten.",
  );
}
