/**
 * Agrar Seasonal Strategy Tester — Run Endpoint
 *
 * POST /api/monitoring/strategy-tester/run-agri-seasonal
 *
 * Computes real seasonal backtest results from deterministic rules + OHLC data.
 * Only handles "seasonal" kind. Valuation and Macro return honest blocked responses.
 *
 * Paper-only. No live trading. Safety Stop is modeled risk, not guaranteed fill.
 */

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAgriAssetStrategyMap } from "@/lib/agri/agri-v2-registry";
import { runSeasonalBacktest } from "@/lib/monitoring/strategyTester/engines/seasonal/seasonalBacktester";
import type {
  MonitoringStrategyHistoryMode,
  MonitoringStrategyRunResponse,
  MonitoringStrategyTestResult,
} from "@/lib/monitoring/strategyTester/types";

export const runtime = "nodejs";

function makeRunId(): string {
  return crypto.randomUUID();
}

function makeBlockedResponse(
  runId: string,
  symbol: string,
  blocker: string,
): MonitoringStrategyRunResponse {
  return {
    runId,
    symbol,
    strategyKind: "seasonal",
    status: "blocked",
    blocker,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const runId = makeRunId();
  let body: {
    symbol?: string;
    symbols?: string[];
    focusedSymbol?: string;
    historyMode?: MonitoringStrategyHistoryMode;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      makeBlockedResponse(runId, "", "Invalid request body"),
      { status: 400 },
    );
  }

  const symbol = (body.focusedSymbol ?? body.symbol ?? "").trim().toUpperCase();
  const symbols = Array.isArray(body.symbols)
    ? body.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : symbol ? [symbol] : [];

  if (symbols.length === 0) {
    return NextResponse.json(
      makeBlockedResponse(runId, symbol, "No symbol provided"),
      { status: 400 },
    );
  }

  const historyMode: MonitoringStrategyHistoryMode =
    body.historyMode === "full" ? "full" : "default_2000";

  // Single symbol or portfolio (all symbols independently)
  const perAsset: Record<string, MonitoringStrategyTestResult> = {};
  const errors: string[] = [];

  for (const sym of symbols) {
    const assetMap = getAgriAssetStrategyMap(sym);
    if (!assetMap) {
      errors.push(`${sym}: not a registered Agri asset`);
      continue;
    }
    if (!assetMap.kinds.seasonal) {
      errors.push(`${sym}: no seasonal strategies registered`);
      continue;
    }

    const result = runSeasonalBacktest(
      sym,
      assetMap.exchange,
      assetMap.strategies,
      historyMode,
    );

    if ("error" in result) {
      errors.push(`${sym}: ${result.error}`);
      continue;
    }

    const now = new Date().toISOString();
    const testResult: MonitoringStrategyTestResult = {
      symbol: sym,
      strategyKind: "seasonal",
      runMode: "engine_simulation",
      metrics: result.metrics,
      trades: result.trades,
      equityCurve: result.equityCurve,
      cacheIdentity: {
        symbol: sym,
        strategyKind: "seasonal",
        inputsHash: `seasonal_atr_stop_v1:${historyMode}`,
        historicalCsvFingerprint: `ohlc:${result.ohlcRowCount}bars:${result.ohlcEnd}`,
        strategyCsvFingerprint: "agri-v2-registry-seasonal",
        engineVersionHash: "seasonal-backtester-v1",
        executionProfileVersion: "v1",
        quantValidationMode: "fixed_backtest",
        generatedAt: now,
        inputMode: "missing_xlsx_metric_only",
        parityBasis: "custom_backtest_no_parity_export",
      },
      parityStatus: "CUSTOM_INPUTS_NOT_PARITY_VALIDATED",
      inputAvailability: "not_applicable",
      inputSource: "seasonal_rules_agri_v2_registry",
      warnings: [
        `Seasonal engine v1 — ATR-14 fixed-initial stop, ${result.ohlcRowCount} OHLC bars (${result.ohlcStart}–${result.ohlcEnd}).`,
        "Safety Stop: modeled risk limit, not guaranteed fill. Paper-only.",
        ...result.strategyBreakdown.map(
          (b) =>
            `${b.strategyId}: ${b.tradeCount} trades, net ${b.netReturnPct > 0 ? "+" : ""}${b.netReturnPct.toFixed(1)}%, WR ${b.winratePct.toFixed(0)}%`,
        ),
      ],
    };

    perAsset[sym] = testResult;
  }

  if (Object.keys(perAsset).length === 0) {
    const blocker = errors.length > 0 ? errors.join("; ") : "No results computed";
    return NextResponse.json(makeBlockedResponse(runId, symbol, blocker));
  }

  const focusedResult = perAsset[symbol] ?? Object.values(perAsset)[0];
  const response: MonitoringStrategyRunResponse = {
    runId,
    symbol,
    strategyKind: "seasonal",
    status: "passed",
    result: focusedResult,
    perAsset: symbols.length > 1 ? perAsset : undefined,
    selectedSymbols: symbols,
    focusedSymbol: symbol,
    mode: symbols.length > 1 ? "portfolio" : "single",
    portfolioMode: symbols.length > 1 ? "selected_equal_weight" : "single",
    historyMode,
    backtestStart: focusedResult.warnings?.[0]?.includes("ohlc") ? undefined : undefined,
  };

  if (errors.length > 0) {
    response.blocker = `Partial result — skipped: ${errors.join("; ")}`;
  }

  return NextResponse.json(response);
}
