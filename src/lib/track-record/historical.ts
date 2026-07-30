import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import performanceMonthly from "@/data/capitalife/performance-monthly.json";
import whiteSwanOfficialKpis from "@/data/capitalife/white-swan-official-kpis.json";
import { account2Trades } from "@/lib/capitalife-data";
import type {
  ClosedTradeRow,
  MonthlyReturnRow,
  TrackRecordMetricRow,
  TrackRecordSnapshotBundle,
} from "@/lib/track-record/types";
import { sha256Json, stableId } from "@/lib/track-record/utils";

const CALCULATION_VERSION = "track-record-v2.0.0";
const ACCOUNT_1_ID = "historical-tactical-account-1";
const ACCOUNT_2_ID = "historical-tactical-account-2-visible";
const MONTHLY_ID = "historical-tactical-combined";
const ACCOUNT_1_PATH = "src/data/capitalife/account1-mt4-trades.json";

type LocalStatement = {
  meta: {
    broker?: string;
    currency?: string;
    statement_generated?: string;
    statement_period_first_close?: string;
    statement_period_last_close?: string;
    total_closed_trades?: number;
  };
  trades: Array<{
    ticket?: string | number;
    open_time?: string;
    close_time?: string;
    type?: string;
    size?: number;
    symbol?: string;
    open_price?: number;
    close_price?: number;
    commission?: number;
    swap?: number;
    profit?: number;
  }>;
};

export function getHistoricalTrackRecordSummary() {
  const statement = loadLocalStatement();
  const monthlyRows = buildHistoricalMonthlyReturns();
  const closedTrades = buildHistoricalClosedTrades(statement);
  return {
    monthlySource: "src/data/capitalife/performance-monthly.json",
    statementSource: ACCOUNT_1_PATH,
    myfxbookVisibleSource: "src/data/capitalife/account2-myfxbook-visible-trades.json",
    officialKpisSource: "src/data/capitalife/white-swan-official-kpis.json",
    baselinePeriod: performanceMonthly.meta.period,
    firstReliableDate: "2024-04-11",
    lastReliableDate: "2026-07-01",
    monthlyReturnCount: monthlyRows.length,
    monthlyReturns: monthlyRows.map((row) => ({ month: row.monthUtc, returnPct: row.returnPct })),
    normalizedClosedTradeCount: closedTrades.length,
    historicalDataQuality: statement
      ? "partial" as const
      : "insufficient" as const,
    account1: {
      statementAvailableLocally: Boolean(statement),
      statementGenerated: statement?.meta.statement_generated ?? null,
      statementPeriodFirstClose: statement?.meta.statement_period_first_close ?? null,
      statementPeriodLastClose: statement?.meta.statement_period_last_close ?? null,
      totalClosedTrades: statement?.meta.total_closed_trades ?? 0,
    },
    account2: {
      source: account2Trades.meta.source,
      visibleTrades: account2Trades.meta.total_visible_trades,
      note: account2Trades.meta.note,
    },
    official: {
      combinedReturnPct: whiteSwanOfficialKpis.official_kpis.combined_return_pct,
      compoundedReturnPct: whiteSwanOfficialKpis.official_kpis.compounded_return_pct,
      maxDrawdownPct: whiteSwanOfficialKpis.official_kpis.max_drawdown_pct,
      annualizedReturnPct: whiteSwanOfficialKpis.official_kpis.annualized_return_pct,
    },
  };
}

export function buildHistoricalTrackRecordBundle(): TrackRecordSnapshotBundle {
  const statement = loadLocalStatement();
  const runAt = new Date().toISOString();
  const monthlyReturns = buildHistoricalMonthlyReturns();
  const closedTrades = buildHistoricalClosedTrades(statement);
  const accounts = [
    {
      source: "broker_raw" as const,
      provider: "historical" as const,
      providerAccountId: ACCOUNT_1_ID,
      accountLabel: "White Swan Tactical - historisches Konto 1",
      broker: statement?.meta.broker ?? null,
      brokerTimezone: null,
      currency: statement?.meta.currency ?? "EUR",
      accountNumberMasked: null,
      darwinTicker: null,
      isDemo: null,
      firstSeenAtUtc: "2024-04-11T00:00:00.000Z",
      lastSeenAtUtc: "2026-07-01T00:00:00.000Z",
    },
    {
      source: "myfxbook" as const,
      provider: "historical" as const,
      providerAccountId: ACCOUNT_2_ID,
      accountLabel: "White Swan Tactical - Myfxbook-Sichtkonto",
      broker: null,
      brokerTimezone: null,
      currency: null,
      accountNumberMasked: null,
      darwinTicker: null,
      isDemo: null,
      firstSeenAtUtc: "2024-04-11T00:00:00.000Z",
      lastSeenAtUtc: "2026-07-01T00:00:00.000Z",
    },
  ];

  return {
    rawSnapshots: [],
    accounts,
    dailyEquity: [],
    dailyReturns: [],
    monthlyReturns,
    openPositions: [],
    closedTrades,
    cashflows: [],
    metrics: buildHistoricalMetrics(runAt, monthlyReturns, closedTrades),
    syncStatus: [{
      source: "broker_raw",
      provider: "historical",
      providerAccountId: MONTHLY_ID,
      lastAttemptAtUtc: runAt,
      lastSuccessAtUtc: runAt,
      staleAfterUtc: null,
      health: statement ? "ok" : "idle",
      message: statement
        ? `Historische Basis normalisiert: ${monthlyReturns.length} Monate, ${closedTrades.length} lokal verfügbare Trades`
        : `Historische Monatsbasis verfügbar; lokale Statement-Rohdatei ${ACCOUNT_1_PATH} fehlt`,
      requestsUsed: 0,
      mode: "live",
    }],
    unavailable: [
      "Keine vollständige tägliche Equity-Zeitreihe vorhanden.",
      "Account 1 Statement ist nur für 01.04.2026 bis 02.07.2026 vollständig maschinenlesbar.",
      "Account 2 enthält nur öffentlich sichtbare Myfxbook-Transaktionen und darf nicht als vollständige Trade-Historie gelten.",
      "Broker-Zeitzone der lokalen Statementdatei ist nicht belegt; lokale Zeitstempel werden nicht als UTC ausgegeben.",
    ],
  };
}

function buildHistoricalMonthlyReturns(): MonthlyReturnRow[] {
  return performanceMonthly.monthly_returns
    .filter((row) => Number.isFinite(row.return_pct))
    .map((row) => ({
      source: "broker_raw",
      provider: "historical",
      providerAccountId: MONTHLY_ID,
      monthUtc: row.month,
      returnPct: row.return_pct,
      sourceDocument: performanceMonthly.meta.source,
      calculationVersion: CALCULATION_VERSION,
    }));
}

function buildHistoricalClosedTrades(statement: LocalStatement | null): ClosedTradeRow[] {
  const account1 = (statement?.trades ?? []).map((trade): ClosedTradeRow => ({
    source: "broker_raw",
    provider: "historical",
    providerAccountId: ACCOUNT_1_ID,
    stableTradeId: stableId([ACCOUNT_1_ID, trade.ticket, trade.open_time, trade.close_time]),
    providerTradeId: trade.ticket === undefined ? null : String(trade.ticket),
    symbol: trade.symbol ?? null,
    direction: trade.type ?? null,
    openedAtUtc: null,
    openedAtLocal: trade.open_time ?? null,
    closedAtUtc: null,
    closedAtLocal: trade.close_time ?? null,
    brokerTimezone: null,
    size: finiteOrNull(trade.size),
    sizeUnit: "lot",
    openPrice: finiteOrNull(trade.open_price),
    closePrice: finiteOrNull(trade.close_price),
    takeProfit: null,
    stopLoss: null,
    profit: finiteOrNull(trade.profit),
    commission: finiteOrNull(trade.commission),
    interest: finiteOrNull(trade.swap),
    pips: null,
    rawPayloadHash: sha256Json(trade),
  }));

  const account2 = account2Trades.trades.map((trade): ClosedTradeRow => ({
    source: "myfxbook",
    provider: "historical",
    providerAccountId: ACCOUNT_2_ID,
    stableTradeId: stableId([ACCOUNT_2_ID, trade.close_time, trade.symbol, trade.direction, trade.gain_pct]),
    providerTradeId: null,
    symbol: trade.symbol,
    direction: trade.direction,
    openedAtUtc: null,
    openedAtLocal: null,
    closedAtUtc: `${trade.close_time}Z`,
    closedAtLocal: trade.close_time,
    brokerTimezone: "UTC (source assumption not independently verified)",
    size: null,
    sizeUnit: null,
    openPrice: null,
    closePrice: null,
    takeProfit: null,
    stopLoss: null,
    profit: null,
    commission: null,
    interest: null,
    pips: null,
    rawPayloadHash: sha256Json(trade),
  }));
  return [...account1, ...account2];
}

function buildHistoricalMetrics(
  asOfUtc: string,
  monthlyReturns: MonthlyReturnRow[],
  trades: ClosedTradeRow[],
): TrackRecordMetricRow[] {
  const compounded = monthlyReturns.reduce((value, row) => value * (1 + row.returnPct / 100), 1);
  const elapsedYears = (Date.parse("2026-07-01T00:00:00Z") - Date.parse("2024-04-11T00:00:00Z")) / (365.2425 * 86_400_000);
  const recalculatedAnnualized = (compounded ** (1 / elapsedYears) - 1) * 100;
  const account1Trades = trades.filter((trade) => trade.providerAccountId === ACCOUNT_1_ID);
  const profitRows = account1Trades.filter((trade) => typeof trade.profit === "number");
  const grossProfit = profitRows.reduce((sum, trade) => sum + Math.max(0, trade.profit ?? 0), 0);
  const grossLoss = Math.abs(profitRows.reduce((sum, trade) => sum + Math.min(0, trade.profit ?? 0), 0));
  const winning = profitRows.filter((trade) => (trade.profit ?? 0) > 0);
  const source = "Performance Report + lokale Teilstatements; keine Quellenvermischung";
  const make = (metricName: string, metricValue: number | string, verified: boolean): TrackRecordMetricRow => ({
    source: "internal_computed",
    provider: "historical",
    providerAccountId: MONTHLY_ID,
    metricScope: "account",
    metricName,
    metricValue,
    metricDateUtc: "2026-07-01T00:00:00.000Z",
    asOfUtc,
    isVerified: verified,
    calculationSource: `${source}; ${CALCULATION_VERSION}`,
  });

  return [
    make("monthly_geometric_total_return_pct", round((compounded - 1) * 100, 2), false),
    make("annualized_return_recalculated_pct", round(recalculatedAnnualized, 2), false),
    make("annualized_return_reported_pct", whiteSwanOfficialKpis.official_kpis.annualized_return_pct, true),
    make("annualization_difference_percentage_points", round(recalculatedAnnualized - whiteSwanOfficialKpis.official_kpis.annualized_return_pct, 2), false),
    make("max_drawdown_reported_pct", whiteSwanOfficialKpis.official_kpis.max_drawdown_pct, true),
    make("sharpe_reported", whiteSwanOfficialKpis.official_kpis.sharpe, true),
    make("calmar_reported", whiteSwanOfficialKpis.official_kpis.calmar, true),
    make("partial_statement_trade_count", account1Trades.length, false),
    make("partial_statement_win_rate_pct", profitRows.length ? round((winning.length / profitRows.length) * 100, 2) : 0, false),
    make("partial_statement_profit_factor", grossLoss > 0 ? round(grossProfit / grossLoss, 4) : "nicht berechenbar", false),
  ];
}

function loadLocalStatement(): LocalStatement | null {
  const absolutePath = path.join(process.cwd(), ACCOUNT_1_PATH);
  if (!existsSync(absolutePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as LocalStatement;
    return Array.isArray(parsed.trades) ? parsed : null;
  } catch {
    return null;
  }
}

function finiteOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
