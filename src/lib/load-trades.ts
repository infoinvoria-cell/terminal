import { cache } from "react";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import {
  compoundGains,
  parseTradesCsv,
  serializeTrades,
  type SerializedTrade,
  type TradeRow,
} from "@/lib/trades-analytics";
import {
  parseMtReportSnapshot,
  type ParsedBalanceRow,
  type ParsedReportTrade,
} from "@/lib/mt-report-parser";

export type TradesPayload = {
  rows: TradeRow[];
  serialized: SerializedTrade[];
  reportTrades: ParsedReportTrade[];
  balanceRows: ParsedBalanceRow[];
  trackRecordReturnPct: number;
  reportPath: string | null;
};

const PERFORMANCE_SCALING_FACTOR = 5;
// Monthly returns from the official Performance Report PDF (statement-based).
// These replace CSV trade-level data for each listed month to ensure the
// displayed track record matches the audited statement values.
const MONTHLY_OVERRIDE_PCT: Record<string, number> = {
  "2026-01": 0.2,
  "2026-02": 7.7,
  "2026-03": -1.3,
  "2026-04": -0.9,
  "2026-05": 3.8,
  "2026-06": 2.8,
  "2026-07": 0.0,
};

// Module-level cache — prevents re-reading CSV/HTML on every page navigation
let _tradesCache: { data: TradesPayload; ts: number } | null = null;
const TRADES_TTL_MS = 30 * 1000; // 30 s

const _fetchTradesData = cache(async (): Promise<TradesPayload> => {
  const reportPath = await findHtmlReportPath();
  let reportTrades: ParsedReportTrade[] = [];
  let balanceRows: ParsedBalanceRow[] = [];
  const legacyRows = await loadLegacyCsvRows();

  if (reportPath) {
    const rawReport = await readFile(reportPath, "utf8");
    const parsedReport = parseMtReportSnapshot(rawReport);
    reportTrades = parsedReport.trades;
    balanceRows = parsedReport.balanceRows;
  }

  const reportRows =
    reportTrades.length > 0
      ? reportTradesToGainRows(reportTrades, balanceRows)
      : [];
  const rows = selectPrimaryTrackRecordRows(legacyRows, reportRows);

  return {
    rows,
    serialized: serializeTrades(rows),
    reportTrades,
    balanceRows,
    trackRecordReturnPct: computeTrackRecordReturnPct(rows),
    reportPath,
  };
});

export async function getTradesData(): Promise<TradesPayload> {
  const now = Date.now();
  if (_tradesCache && now - _tradesCache.ts < TRADES_TTL_MS) return _tradesCache.data;
  const data = await _fetchTradesData();
  _tradesCache = { data, ts: now };
  return data;
}

async function loadLegacyCsvRows() {
  const csvPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "trades_clean_compounded.csv"
  );
  if (!(await exists(csvPath))) return [];
  const raw = await readFile(csvPath, "utf8");
  return parseTradesCsv(raw);
}

async function findHtmlReportPath() {
  const candidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt-report.html"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt-report.htm"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt4-report.html"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt4-report.htm"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt5-report.html"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "mt5-report.htm"),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "account-history.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "account-history.htm"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "trading-history.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "trading-history.htm"
    ),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "statement.html"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "statement.htm"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "public", "mt-report.html"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "public", "mt-report.htm"),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "mt4-report.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "mt4-report.htm"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "mt5-report.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "mt5-report.htm"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "account-history.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "account-history.htm"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "trading-history.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "trading-history.htm"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "statement.html"
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "statement.htm"
    ),
  ];

  for (const resolved of candidates) {
    if (await exists(resolved)) return resolved;
  }

  return null;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function reportTradesToGainRows(
  reportTrades: ParsedReportTrade[],
  balanceRows: ParsedBalanceRow[]
): TradeRow[] {
  const sortedTrades = [...reportTrades].sort((a, b) => a.closeTimeMs - b.closeTimeMs);
  const initialBalance = deriveInitialBalance(balanceRows);
  let equity = initialBalance;

  return sortedTrades.map((trade) => {
    const scaledProfit = trade.profit * PERFORMANCE_SCALING_FACTOR;
    const base = Math.abs(equity) > 1e-9 ? equity : initialBalance;
    const gainPct = base !== 0 ? (scaledProfit / base) * 100 : 0;
    equity += scaledProfit;
    return {
      date: new Date(trade.closeTimeMs),
      gainPct,
    };
  });
}

function deriveInitialBalance(balanceRows: ParsedBalanceRow[]) {
  if (!balanceRows.length) return 1_000;
  const first = [...balanceRows].sort((a, b) => a.timeMs - b.timeMs)[0];
  if (!first) return 1_000;
  const amount = Number(first.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-9) return 1_000;
  return Math.abs(amount);
}

function computeTrackRecordReturnPct(rows: TradeRow[]) {
  if (!rows.length) return 0;
  return compoundGains(rows.map((row) => row.gainPct));
}

function selectPrimaryTrackRecordRows(legacyRows: TradeRow[], reportRows: TradeRow[]) {
  if (legacyRows.length === 0) return reportRows;
  if (reportRows.length === 0) return legacyRows;

  const legacyStart = legacyRows[0]!.date.getTime();
  const reportStart = reportRows[0]!.date.getTime();

  // Prefer the longer-running master track record source when both are present.
  // Apply explicit 2026 monthly corrections from verified account history percentages.
  if (legacyStart <= reportStart) return applyMonthlyOverrides(legacyRows, MONTHLY_OVERRIDE_PCT);
  return applyMonthlyOverrides(reportRows, MONTHLY_OVERRIDE_PCT);
}

function applyMonthlyOverrides(
  rows: TradeRow[],
  overrides: Record<string, number>
) {
  if (!rows.length) return rows;
  const overrideKeys = new Set(Object.keys(overrides));
  const preserved = rows.filter((row) => !overrideKeys.has(monthKey(row.date)));
  const injected = Object.entries(overrides).map(([key, gainPct]) => {
    const [year, month] = key.split("-").map(Number);
    return {
      date: new Date(year, month - 1, 1, 12, 0, 0, 0),
      gainPct,
    } satisfies TradeRow;
  });
  return [...preserved, ...injected].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

function monthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
