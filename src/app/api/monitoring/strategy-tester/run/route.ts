import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { aggregateStrategyResults } from "@/lib/monitoring/strategyTester/portfolioAggregation";
import { runMacroValuationEngine, runMacroValuationWalkForward } from "@/lib/monitoring/strategyTester/engines/macroValuation";
import { loadCsvReferenceTrades } from "@/lib/monitoring/strategyTester/engines/macroValuation/csvReference";
import { computeMetrics, buildEquityCurve } from "@/lib/monitoring/strategyTester/engines/macroValuation/metrics";
import { computeAgriReferencePortfolioMetrics } from "@/lib/monitoring/strategyTester/agriReferenceMetrics";
import { AGRI_ALL_SYMBOLS, AGRI_DEFAULT_BACKTEST_START, AGRI_DISABLED_MACRO_SYMBOLS, AGRI_LIVE_START_DATE } from "@/lib/monitoring/strategyTester/constants";
import { applyRiskReadinessGuard, getAgriAssetStatus, getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";
import type {
  MonitoringStrategyHistoryMode,
  MonitoringStrategyPortfolioMode,
  MonitoringStrategyRunResponse,
  MonitoringStrategyTestResult,
} from "@/lib/monitoring/strategyTester/types";

export const runtime = "nodejs";

function makeRunId(): string {
  return crypto.randomUUID();
}

function buildBlocked(runId: string, symbol: string, blocker: string): MonitoringStrategyRunResponse {
  return {
    runId,
    symbol,
    strategyKind: "macro_valuation",
    status: "blocked",
    blocker,
  };
}

function normalizeSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(
    input
      .map((value) => String(value ?? "").trim().toUpperCase())
      .filter(Boolean),
  ));
}

function toCsvReferenceResult(symbol: string): MonitoringStrategyTestResult | null {
  const trades = loadCsvReferenceTrades(symbol);
  if (!trades) return null;
  const metrics = computeMetrics(trades);
  const agriAudit = getAgriAssetStatus(symbol);
  return {
    symbol,
    strategyKind: "macro_valuation",
    runMode: "csv_reference_replay",
    metrics,
    trades,
    equityCurve: buildEquityCurve(trades),
    cacheIdentity: {
      symbol,
      strategyKind: "macro_valuation",
      inputsHash: "csv_reference",
      historicalCsvFingerprint: "csv_reference",
      strategyCsvFingerprint: "csv_reference",
      engineVersionHash: "csv_reference_replay_v1",
      executionProfileVersion: "csv_reference",
      quantValidationMode: "fixed_backtest",
      generatedAt: new Date().toISOString(),
      inputMode: "missing_xlsx_metric_only",
      parityBasis: "tradingview_export_metrics_only",
    },
    parityStatus: "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN",
    inputAvailability: "missing_input_xlsx",
    agriAudit,
  };
}

// Pre-built strategy events files (no Python engine required).
// v2 files have a `trades` array with entry/exit prices; returns are computed from prices.
const AGRI_STRATEGY_EVENTS_FILES: Record<string, string> = {
  "ZW1!": "CBOT_ZW1_v2_events.json",
  "ZC1!": "CBOT_ZC1_v2_events.json",
  "ZS1!": "CBOT_ZS1_v2_events.json",
  "CC1!": "ICEUS_CC1_v2_events.json",
  "KC1!": "ICEUS_KC1_v2_events.json",
  "OJ1!": "ICEUS_OJ1_v2_events.json",
  "SB1!": "ICEUS_SB1_v2_events.json",
  "CT1!": "ICEUS_CT1_v2_events.json",
};

type StrategyEventsV2Trade = {
  direction: string;
  entryTime?: string;
  exitTime?: string | null;
  entry?: number;
  exit?: number | null;
  sl?: number | null;
  tp?: number | null;
  exitReason?: string;
  net_return_pct?: number;
  cum_return_pct?: number;
};

type StrategyEventsV2File = {
  symbol?: string;
  tvSymbol?: string;
  strategyName?: string;
  generatedAt?: string;
  trades?: StrategyEventsV2Trade[];
};

function toStrategyEventsResult(symbol: string): MonitoringStrategyTestResult | null {
  const fileName = AGRI_STRATEGY_EVENTS_FILES[symbol];
  if (!fileName) return null;

  const filePath = path.join(process.cwd(), "public/generated/monitoring/strategies", fileName);
  if (!fs.existsSync(filePath)) return null;

  let json: StrategyEventsV2File;
  try {
    json = JSON.parse(fs.readFileSync(filePath, "utf-8")) as StrategyEventsV2File;
  } catch {
    return null;
  }

  const rawTrades = (json.trades ?? []).filter(
    (t) => t.exitTime != null && t.exit != null && t.entry != null,
  );
  if (!rawTrades.length) return null;

  let additiveCum = 0;
  const trades = rawTrades.map((t, i) => {
    const entryPrice = t.entry as number;
    const exitPrice = t.exit as number;
    const direction = String(t.direction).toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const rawReturn = entryPrice > 0
      ? (direction === "SHORT"
        ? ((entryPrice - exitPrice) / entryPrice) * 100
        : ((exitPrice - entryPrice) / entryPrice) * 100)
      : 0;
    const returnPct = t.net_return_pct ?? rawReturn;
    additiveCum += returnPct;
    const cumulativeReturnPct = t.cum_return_pct ?? additiveCum;
    const entryDate = String(t.entryTime ?? "").replace("T00:00:00Z", "").replace("T00:00:00", "");
    const exitDate = String(t.exitTime ?? entryDate).replace("T00:00:00Z", "").replace("T00:00:00", "");
    return {
      tradeNo: i + 1,
      direction: direction as "LONG" | "SHORT",
      entryDate,
      exitDate,
      entryPrice,
      exitPrice,
      returnPct,
      pnlNet: returnPct,
      cumulativePnl: cumulativeReturnPct,
      cumulativeReturnPct,
    };
  });

  const metrics = computeMetrics(trades);
  const equityCurve = buildEquityCurve(trades);
  const generatedAt = json.generatedAt ?? new Date().toISOString();
  const agriAudit = getAgriAssetStatus(symbol);

  return {
    symbol,
    strategyKind: "macro_valuation",
    runMode: "csv_reference_replay",
    metrics,
    trades,
    equityCurve,
    cacheIdentity: {
      symbol,
      strategyKind: "macro_valuation",
      inputsHash: "strategy_events_v2",
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
    agriAudit,
    liveSignal: null,
    walkForward: null,
  };
}

function buildPortfolioResponse(
  runId: string,
  results: MonitoringStrategyTestResult[],
  focusedSymbolInput: string | undefined,
  portfolioMode: MonitoringStrategyPortfolioMode,
  weights: Record<string, number> | undefined,
  runMode: string,
  historyMode: MonitoringStrategyHistoryMode,
  backtestStart: string | null,
): MonitoringStrategyRunResponse {
  const focusedResult = results.find((result) => result.symbol === focusedSymbolInput) ?? results[0];
  const selectedSymbols = results.map((result) => result.symbol);
  const combined = aggregateStrategyResults(results, {
    portfolioMode,
    weights,
    fromDate: runMode === "live_signal" ? AGRI_LIVE_START_DATE : backtestStart,
  });
  const agriStatus = getAgriFinalStatus();
  const isFullMacroSelection = selectedSymbols.length === AGRI_ALL_SYMBOLS.length
    && AGRI_ALL_SYMBOLS.every((symbol) => selectedSymbols.includes(symbol));
  const referenceMetrics = selectedSymbols.length > 1
    ? computeAgriReferencePortfolioMetrics(selectedSymbols, backtestStart)
    : null;

  return {
    runId,
    symbol: focusedResult.symbol,
    strategyKind: "macro_valuation",
    status: "passed",
    result: focusedResult,
    selectedSymbols,
    focusedSymbol: focusedResult.symbol,
    mode: selectedSymbols.length > 1 ? "portfolio" : "single",
    portfolioMode,
    perAsset: Object.fromEntries(results.map((result) => [result.symbol, result])),
    combined,
    historyMode,
    backtestStart,
    dataHealth: Object.fromEntries(selectedSymbols.map((symbol) => [symbol, agriStatus.assets[symbol]?.dataHealth ?? null])),
    liveReadiness: Object.fromEntries(selectedSymbols.map((symbol) => [symbol, agriStatus.assets[symbol]?.liveReadiness ?? null])),
    referenceComparison: referenceMetrics
      ? {
          referenceName: isFullMacroSelection ? "Python Macro-6" : "Custom Basket",
          tradeDelta: combined.metrics.totalTrades - referenceMetrics.metrics.totalTrades,
          returnDelta: combined.metrics.netReturnPct != null
            ? combined.metrics.netReturnPct - referenceMetrics.metrics.netReturnPct
            : null,
          referenceTrades: referenceMetrics.metrics.totalTrades,
          referenceReturnPct: referenceMetrics.metrics.netReturnPct,
          startDate: backtestStart,
          provenanceDelta: isFullMacroSelection
            ? `${agriStatus.portfolio?.note ?? "Reference comparison only."} Backtest start: ${backtestStart ?? "full history"}.`
            : `Reference comparison only. Basket reference rebuilt from agri_final_selected_trades.csv from ${backtestStart ?? "full history"}.`,
        }
      : null,
  };
}

export async function POST(request: NextRequest) {
  let body: {
    symbol?: string;
    symbols?: string[];
    focusedSymbol?: string;
    strategyKind?: string;
    runMode?: string;
    strategyFamily?: string;
    portfolioMode?: MonitoringStrategyPortfolioMode;
    historyMode?: MonitoringStrategyHistoryMode;
    weights?: Record<string, number>;
    useFinalRegistry?: boolean;
    customInputs?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = makeRunId();
  const symbols = normalizeSymbols(body.symbols);
  const fallbackSymbol = String(body.symbol ?? "").trim().toUpperCase();
  const selectedSymbols = symbols.length ? symbols : (fallbackSymbol ? [fallbackSymbol] : []);
  const focusedSymbol = String(body.focusedSymbol ?? selectedSymbols[0] ?? "").trim().toUpperCase();
  const primarySymbol = focusedSymbol || selectedSymbols[0] || fallbackSymbol;

  if (!selectedSymbols.length) {
    return NextResponse.json({ error: "symbol or symbols is required" }, { status: 400 });
  }
  if ((body.strategyKind ?? "macro_valuation") !== "macro_valuation") {
    return NextResponse.json(buildBlocked(runId, primarySymbol, "Only macro_valuation is supported."), { status: 400 });
  }
  if (selectedSymbols.some((symbol) => AGRI_DISABLED_MACRO_SYMBOLS.includes(symbol as (typeof AGRI_DISABLED_MACRO_SYMBOLS)[number]))) {
    return NextResponse.json(
      buildBlocked(runId, primarySymbol, "SB1! and CT1! are disabled in the frozen agri macro system."),
      { status: 400 },
    );
  }

  const runMode = String(body.runMode ?? "engine_simulation");
  const portfolioMode = body.portfolioMode ?? (selectedSymbols.length > 1 ? "selected_equal_weight" : "single");
  const historyMode: MonitoringStrategyHistoryMode = body.historyMode === "full" ? "full" : "default_2000";
  const backtestStart = historyMode === "full" ? null : AGRI_DEFAULT_BACKTEST_START;
  try {
    if (runMode === "csv_reference_replay") {
      const results = selectedSymbols.map((symbol) => {
        const result = toCsvReferenceResult(symbol);
        if (!result) {
          throw new Error(`No CSV/XLSX reference available for ${symbol}.`);
        }
        return result;
      });
      return NextResponse.json(buildPortfolioResponse(runId, results, focusedSymbol, portfolioMode, body.weights, runMode, historyMode, backtestStart));
    }

    if (runMode === "walk_forward") {
      const results = await Promise.all(selectedSymbols.map(async (symbol) => {
        const run = await runMacroValuationWalkForward(symbol, body.customInputs, { startDate: backtestStart });
        const agriBase = getAgriAssetStatus(symbol);
        const liveReadiness = applyRiskReadinessGuard(
          agriBase?.liveReadiness ?? {
            status: "CONFIG_INCOMPLETE",
            reason: "CONFIG_INCOMPLETE",
            blockers: ["Missing agri audit"],
          },
          {
            signal: run.liveSignal?.signal,
            entryPrice: run.liveSignal?.entryPrice,
            stopLoss: run.liveSignal?.stopLoss,
            takeProfit: run.liveSignal?.takeProfit,
          },
        );
        return {
          symbol,
          strategyKind: "macro_valuation",
          runMode: "walk_forward",
          metrics: run.metrics,
          trades: run.trades,
          equityCurve: run.equityCurve,
          cacheIdentity: run.cacheIdentity,
          parityStatus: run.validation?.parityStatus ?? "CUSTOM_INPUTS_NOT_PARITY_VALIDATED",
          inputAvailability: run.inputAvailability,
          inputSource: run.inputSource,
          openTrade: run.openTrade ? {
            direction: run.openTrade.direction,
            entryTime: run.openTrade.entryTime,
            entryPrice: run.openTrade.entryPrice,
            stopLossPrice: run.openTrade.stopLossPrice,
            takeProfitPrice: run.openTrade.takeProfitPrice,
          } : null,
          liveSignal: run.liveSignal,
          rawTrades: run.rawTrades,
          costSummary: run.costSummary,
          referenceKpis: run.referenceKpis,
          agriAudit: agriBase ? { ...agriBase, liveReadiness } : null,
          visualModel: run.visualModel,
          validation: run.validation,
          walkForward: run.walkForward,
          dataBinding: run.dataBinding,
          warnings: run.warnings,
          dataCoverage: run.dataCoverage,
          resolverDiagnostics: run.resolverDiagnostics,
          dataMode: run.dataMode,
          dataSourceMap: run.dataSourceMap,
        } satisfies MonitoringStrategyTestResult;
      }));

      return NextResponse.json(buildPortfolioResponse(runId, results, focusedSymbol, portfolioMode, body.weights, runMode, historyMode, backtestStart));
    }

    const effectiveRunMode =
      runMode === "engine_vs_csv_validation"
        ? "engine_vs_csv_validation"
        : runMode === "live_signal"
          ? "live_signal"
          : "engine_simulation";

    const results = await Promise.all(selectedSymbols.map(async (symbol) => {
      let run: Awaited<ReturnType<typeof runMacroValuationEngine>>;
      try {
        run = await runMacroValuationEngine(symbol, body.customInputs, { startDate: backtestStart });
      } catch (engineErr) {
        // Engine unavailable (Python runner or workspace missing) — fall back to pre-built data.
        const csvResult = toCsvReferenceResult(symbol) ?? toStrategyEventsResult(symbol);
        if (csvResult) return csvResult;
        throw engineErr;
      }
      const agriBase = getAgriAssetStatus(symbol);
      const liveReadiness = applyRiskReadinessGuard(
        agriBase?.liveReadiness ?? {
          status: "CONFIG_INCOMPLETE",
          reason: "CONFIG_INCOMPLETE",
          blockers: ["Missing agri audit"],
        },
        {
          signal: run.liveSignal?.signal,
          entryPrice: run.liveSignal?.entryPrice,
          stopLoss: run.liveSignal?.stopLoss,
          takeProfit: run.liveSignal?.takeProfit,
        },
      );

      return {
        symbol,
        strategyKind: "macro_valuation",
        runMode: effectiveRunMode,
        metrics: run.metrics,
        trades: run.trades,
        equityCurve: run.equityCurve,
        cacheIdentity: run.cacheIdentity,
        parityStatus: run.validation?.parityStatus ?? (body.customInputs ? "CUSTOM_INPUTS_NOT_PARITY_VALIDATED" : "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN"),
        inputAvailability: run.inputAvailability,
        inputSource: run.inputSource,
        openTrade: run.openTrade ? {
          direction: run.openTrade.direction,
          entryTime: run.openTrade.entryTime,
          entryPrice: run.openTrade.entryPrice,
          stopLossPrice: run.openTrade.stopLossPrice,
          takeProfitPrice: run.openTrade.takeProfitPrice,
        } : null,
        liveSignal: run.liveSignal,
        rawTrades: run.rawTrades,
        costSummary: run.costSummary,
        referenceKpis: run.referenceKpis,
        agriAudit: agriBase ? { ...agriBase, liveReadiness } : null,
        visualModel: run.visualModel,
        validation: run.validation,
        walkForward: null,
        dataBinding: run.dataBinding,
        warnings: run.warnings,
        dataCoverage: run.dataCoverage,
        resolverDiagnostics: run.resolverDiagnostics,
        dataMode: run.dataMode,
        dataSourceMap: run.dataSourceMap,
      } satisfies MonitoringStrategyTestResult;
    }));

    return NextResponse.json(buildPortfolioResponse(runId, results, focusedSymbol, portfolioMode, body.weights, runMode, historyMode, backtestStart));
  } catch (error) {
    return NextResponse.json({
      runId,
      symbol: primarySymbol,
      strategyKind: "macro_valuation",
      status: "failed",
      blocker: error instanceof Error ? error.message : "Unknown engine error",
    } satisfies MonitoringStrategyRunResponse, { status: 500 });
  }
}
