import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import {
  computeMetrics,
  buildEquityCurve,
} from "@/lib/monitoring/strategyTester/engines/macroValuation/metrics";
import type {
  MonitoringMvaTrade,
  MonitoringStrategyRunResponse,
  MonitoringStrategyTestResult,
} from "@/lib/monitoring/strategyTester/types";

export const runtime = "nodejs";

const EVENTS_FILE_CANDIDATES: Record<string, string[]> = {
  "DAX40 2H": [
    "OANDA_DE30EUR_2H_events.json",
    "OANDA_DE30EUR_2H_package_events.json",
    "OANDA_DE30EUR_2H_hybrid_events.json",
  ],
  "GBPUSD 30M": [
    "OANDA_GBPUSD_30M_events.json",
    "OANDA_GBPUSD_30M_package_events.json",
    "OANDA_GBPUSD_30M_hybrid_events.json",
  ],
  "DAX40 1H": [
    "OANDA_DE30EUR_1H_events.json",
    "OANDA_DE30EUR_1H_package_events.json",
    "OANDA_DE30EUR_1H_hybrid_events.json",
  ],
  "EURUSD 30M": [
    "OANDA_EURUSD_30M_events.json",
    "OANDA_EURUSD_30M_package_events.json",
    "OANDA_EURUSD_30M_hybrid_events.json",
  ],
};

type EventTrade = {
  direction: string;
  entryTime: string;
  exitTime?: string;
  entry: number;
  sl?: number;
  tp?: number;
  exit?: number;
  exitReason?: string;
  pnl?: number;
  isOpen?: boolean;
};

type EventsFile = {
  strategyId?: string;
  strategyName?: string;
  symbol?: string;
  tvSymbol?: string;
  timeframe?: string;
  source?: string;
  generatedAt?: string;
  engineVersion?: string;
  engineParity?: number | null;
  engineStatus?: string;
  engineStartDate?: string;
  macroFiltersDisabled?: string[];
  tradeCounts?: { csvHistorical?: number; engineRecent?: number; total?: number };
  dateRange?: { first?: string; last?: string };
  trades?: EventTrade[];
};

function normalizeTradeTime(value: string | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.endsWith("ZZ")) return `${raw.slice(0, -1)}`;
  if (raw.endsWith("Z") && raw.length >= 20) return `${raw.slice(0, 19)}Z`;
  if (raw.length >= 19 && raw[4] === "-" && raw[7] === "-") return `${raw.slice(0, 19)}Z`;
  if (raw.length === 16 && raw[4] === "-" && raw[7] === "-") return `${raw}:00Z`;
  return raw;
}

function pickEventsFile(strategiesDir: string, candidates: string[]): { path: string; fileName: string } | null {
  for (const fileName of candidates) {
    const resolvedPath = path.join(strategiesDir, fileName);
    if (!fs.existsSync(resolvedPath)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as EventsFile;
      const trades = Array.isArray(payload?.trades) ? payload.trades : [];
      if (trades.length) {
        return { path: resolvedPath, fileName };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = decodeURIComponent(searchParams.get("symbol") ?? "").trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const fileCandidates = EVENTS_FILE_CANDIDATES[symbol];
  if (!fileCandidates?.length) {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "intraday_1" as const,
        status: "blocked" as const,
        blocker: `No events file configured for symbol '${symbol}'.`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 404 },
    );
  }

  const strategiesDir = path.join(process.cwd(), "public/generated/monitoring/strategies");
  const resolved = pickEventsFile(strategiesDir, fileCandidates);

  if (!resolved?.path || !fs.existsSync(resolved.path)) {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "intraday_1" as const,
        status: "blocked" as const,
        blocker: `Events file not found for ${symbol}`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 404 },
    );
  }

  let json: EventsFile;
  try {
    json = JSON.parse(fs.readFileSync(resolved.path, "utf-8")) as EventsFile;
  } catch {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "intraday_1" as const,
        status: "failed" as const,
        blocker: `Failed to parse events file: ${resolved.fileName}`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 500 },
    );
  }

  const rawTrades = (json.trades ?? []).filter(
    (t) => !t.isOpen && t.exitTime && t.exit != null,
  );

  let cumulativePnl = 0;
  let cumulativeReturnPct = 0;
  const trades: MonitoringMvaTrade[] = rawTrades.map((t, i) => {
    const returnPct = t.pnl != null ? t.pnl / 100 : 0;
    cumulativePnl += returnPct;
    cumulativeReturnPct += returnPct;
    const entryDate = normalizeTradeTime(t.entryTime) ?? t.entryTime;
    const exitDate = normalizeTradeTime(t.exitTime) ?? t.entryTime;
    return {
      tradeNo: i + 1,
      direction: (t.direction.toUpperCase() === "SHORT" ? "SHORT" : "LONG") as "LONG" | "SHORT",
      entryDate,
      exitDate: exitDate ?? entryDate,
      entryPrice: t.entry,
      exitPrice: t.exit ?? t.entry,
      returnPct,
      pnlNet: returnPct,
      cumulativePnl,
      cumulativeReturnPct,
    };
  });

  const metrics = computeMetrics(trades);
  const equityCurve = buildEquityCurve(trades);
  const generatedAt = json.generatedAt ?? new Date().toISOString();

  const result: MonitoringStrategyTestResult = {
    symbol,
    strategyKind: "intraday_1",
    runMode: "engine_simulation",
    metrics,
    trades,
    equityCurve,
    cacheIdentity: {
      symbol,
      strategyKind: "intraday_1",
      inputsHash: "events_json",
      historicalCsvFingerprint: resolved.fileName,
      strategyCsvFingerprint: resolved.fileName,
      engineVersionHash: generatedAt,
      executionProfileVersion: "1.0",
      quantValidationMode: "fixed_backtest",
      generatedAt,
      inputMode: "missing_xlsx_metric_only",
      parityBasis: "tradingview_export_metrics_only",
    },
    parityStatus: "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN",
    inputAvailability: "not_applicable",
    agriAudit: null,
    liveSignal: null,
    walkForward: null,
  };

  const intradayMeta = {
    strategyName: json.strategyName ?? null,
    tvSymbol: json.tvSymbol ?? null,
    timeframe: json.timeframe ?? null,
    source: (json as EventsFile & { sourceDetail?: string }).sourceDetail ?? json.source ?? null,
    engineVersion: json.engineVersion ?? null,
    engineParity: json.engineParity ?? null,
    engineStatus: json.engineStatus ?? null,
    engineStartDate: json.engineStartDate ?? null,
    macroFiltersDisabled: json.macroFiltersDisabled ?? [],
    tradeCounts: json.tradeCounts ?? null,
    dateRange: json.dateRange ?? null,
    generatedAt,
  };

  const response = {
    runId: crypto.randomUUID(),
    symbol,
    strategyKind: "intraday_1" as const,
    status: "passed" as const,
    result,
    intradayMeta,
    selectedSymbols: [symbol],
    focusedSymbol: symbol,
    mode: "single",
    historyMode: "full_history",
    backtestStart: trades[0]?.entryDate ?? null,
  };

  return NextResponse.json(response);
}
