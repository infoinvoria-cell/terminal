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

// Indizes tab → package events (Macro Valuation Alpha, signal-exit). The Agrar engine
// (/strategy-tester/run) only supports agriculture symbols, so indices feed the SAME
// MonitoringStrategyWorkspace via this events adapter (identical to the intraday path).
const EVENTS_FILE_BY_SYMBOL: Record<string, string> = {
  "YM1!": "CBOT_MINI_YM1_events.json",
  "UKX!": "TVC_UKX_events.json",
  "NQ1!": "CME_MINI_NQ1_events.json",
  "FDAX1!": "EUREX_FDAX1_events.json",
  "ES1!": "CME_MINI_ES1_events.json",
};

type EventTrade = {
  direction: string;
  entryTime?: string;
  exitTime?: string | null;
  entry?: number;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string;
  net_pnl?: number;
  net_return_pct?: number;
  cum_return_pct?: number;
};

type EventsFile = {
  strategyId?: string;
  strategyName?: string;
  symbol?: string;
  tvSymbol?: string;
  timeframe?: string;
  source?: string;
  status?: string;
  warnings?: string[];
  note?: string;
  generatedAt?: string;
  openTrade?: boolean;
  trades?: EventTrade[];
};

function normalizeTradeTime(value: string | undefined | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length >= 19 && raw[4] === "-" && raw[7] === "-") return `${raw.slice(0, 19)}Z`;
  if (raw.length === 10 && raw[4] === "-" && raw[7] === "-") return `${raw}T00:00:00Z`;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = decodeURIComponent(searchParams.get("symbol") ?? "").trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const fileName = EVENTS_FILE_BY_SYMBOL[symbol];
  if (!fileName) {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "macro_valuation" as const,
        status: "blocked" as const,
        blocker: `No indices events file configured for symbol '${symbol}'.`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 404 },
    );
  }

  const resolvedPath = path.join(process.cwd(), "public/generated/monitoring/strategies", fileName);
  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "macro_valuation" as const,
        status: "blocked" as const,
        blocker: `Events file not found for ${symbol}: ${fileName}`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 404 },
    );
  }

  let json: EventsFile;
  try {
    json = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as EventsFile;
  } catch {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "macro_valuation" as const,
        status: "failed" as const,
        blocker: `Failed to parse events file: ${fileName}`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 500 },
    );
  }

  // Only closed trades count for backtest metrics. Package events are all closed
  // (openTrade=false); guard anyway so an open trade never inflates the curve.
  const rawTrades = (json.trades ?? []).filter(
    (t) => t.exitTime != null && t.exit != null && t.entry != null,
  );

  if (!rawTrades.length) {
    return NextResponse.json(
      {
        runId: crypto.randomUUID(),
        symbol,
        strategyKind: "macro_valuation" as const,
        status: "blocked" as const,
        blocker: `No closed trades in events for ${symbol} (${json.status ?? "no_data"}).`,
      } satisfies MonitoringStrategyRunResponse,
      { status: 200 },
    );
  }

  // computeMetrics expects returnPct in PERCENT (e.g. -0.43 = -0.43%) and reads
  // cumulativeReturnPct directly. Use the package's authoritative cumReturnPct for the
  // equity/netReturn so the tester matches the strategy export exactly; fall back to an
  // additive running sum only if the package omitted it.
  let additiveCum = 0;
  const trades: MonitoringMvaTrade[] = rawTrades.map((t, i) => {
    const returnPct = t.net_return_pct ?? 0;
    additiveCum += returnPct;
    const cumulativeReturnPct = t.cum_return_pct ?? additiveCum;
    const entryDate = normalizeTradeTime(t.entryTime) ?? String(t.entryTime ?? "");
    const exitDate = normalizeTradeTime(t.exitTime) ?? entryDate;
    return {
      tradeNo: i + 1,
      direction: (String(t.direction).toUpperCase() === "SHORT" ? "SHORT" : "LONG") as "LONG" | "SHORT",
      entryDate,
      exitDate: exitDate ?? entryDate,
      entryPrice: t.entry as number,
      exitPrice: (t.exit ?? t.entry) as number,
      returnPct,
      pnlNet: returnPct,
      cumulativePnl: cumulativeReturnPct,
      cumulativeReturnPct,
    };
  });

  const metrics = computeMetrics(trades);
  const equityCurve = buildEquityCurve(trades);
  const generatedAt = json.generatedAt ?? new Date().toISOString();

  const result: MonitoringStrategyTestResult = {
    symbol,
    strategyKind: "macro_valuation",
    runMode: "engine_simulation",
    metrics,
    trades,
    equityCurve,
    cacheIdentity: {
      symbol,
      strategyKind: "macro_valuation",
      inputsHash: "indices_package_events_json",
      historicalCsvFingerprint: fileName,
      strategyCsvFingerprint: fileName,
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
    strategyName: json.strategyName ?? "Macro Valuation Alpha",
    tvSymbol: json.tvSymbol ?? null,
    timeframe: json.timeframe ?? "1D",
    source: json.source ?? "indices_strategy_package",
    engineVersion: null,
    engineParity: null,
    engineStatus: json.status ?? null,
    engineStartDate: trades[0]?.entryDate ?? null,
    macroFiltersDisabled: [],
    tradeCounts: { total: trades.length },
    dateRange: { first: trades[0]?.entryDate ?? undefined, last: trades[trades.length - 1]?.exitDate ?? undefined },
    generatedAt,
  };

  const response = {
    runId: crypto.randomUUID(),
    symbol,
    strategyKind: "macro_valuation" as const,
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
