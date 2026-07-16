import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAgricultureMvaBinding } from "./bindings";
import { loadMacroValuationInputs, toInputValueMap } from "./inputs";
import { buildMergedOhlcFile } from "./ohlc";
import { runMacroValuationPythonEngine } from "./pythonRunner";
import { buildEquityCurve, computeMetrics, toMonitoringTrades } from "./metrics";
import { loadCsvReferenceTrades } from "./csvReference";
import { buildValidation } from "./validation";
import { buildVisualModel } from "./visualModel";
import { markLiveSignalStale } from "./liveSignal";
import { buildWalkForwardResult, buildWalkForwardWindows } from "./walkForward";
import type { MvaCostSummary, MvaDataMode, MvaDataSourceEntry, MvaEngineRawTrade, MvaEngineRunResult } from "./types";
import type { MonitoringStrategyRunIdentity } from "@/lib/monitoring/strategyTester/types";
import { loadAgriReferenceKpisFromTrades } from "@/lib/monitoring/strategyTester/agriReferenceMetrics";
import { AGRI_DEFAULT_BACKTEST_START } from "@/lib/monitoring/strategyTester/constants";

type EngineWindowOptions = {
  startDate?: string | null;
};

const PROJECT_ROOT = path.join(process.cwd(), "..");

/** Production Live paths — always up to date, used by default. */
const EXTERNAL_SERIES_PATHS: Record<string, string> = {
  "TVC:DXY": "workspace/output/tradingview_data_cache/D/TVC_DXY_D.json",
  "ICEUS_DLY:DXY": "workspace/output/tradingview_data_cache/D/TVC_DXY_D.json",
  "ICEUS_DLY:SB1!": "workspace/output/tradingview_data_test/full_history_validated/ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv",
  "CBOT:ZB1!": "frontend/data/market-data-cache/ref_zb__d__yahoo__backadjusted__auto__market-data-v7.json",
  "CBOT_DL:ZB1!": "frontend/data/market-data-cache/ref_zb__d__yahoo__backadjusted__auto__market-data-v7.json",
  "CBOT_DL:ZS1!": "workspace/output/tradingview_data_test/full_history_validated/CBOT_ZS1_TV_MERGED_FULL_HISTORY_daily.csv",
  "CBOT_DL:ZW1!": "workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv",
  "CBOE:VIX": "workspace/output/tradingview_data_cache/D/TVC_VIX_D.json",
  "TVC:VIX": "workspace/output/tradingview_data_cache/D/TVC_VIX_D.json",
  "COMEX_DL:GC1!": "frontend/data/market-data-cache/ref_gold__d__yahoo__backadjusted__auto__market-data-v7.json",
  "ICEUS_DLY:CC1!": "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv",
  "ICEUS_DLY:CT1!": "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv",
  "ICEUS_DLY:KC1!": "workspace/output/tradingview_data_test/full_history_validated/ICEUS_KC1_TV_MERGED_FULL_HISTORY_daily.csv",
  "NYMEX_DL:CL1!": "workspace/output/tradingview_data_cache/D/NYMEX_CL1_D.json",
  "SP:SPX": "frontend/data/market-data-cache/sp500__d__yahoo__backadjusted__auto__market-data-v7.json",
  "TVC:US10Y": "frontend/data/market-data-cache/ref_us10y__d__yahoo__backadjusted__auto__market-data-v7.json",
  "FX_IDC:USDBRL": "workspace/input/agri_research/market_data/FX_IDC_USDBRL_1D.csv",
  "FX_IDC:BRLUSD": "workspace/monitoring_strategy_infrastructure/forex/BRLUSD/ohlc/BRLUSD_1D_ohlc.csv",
};

/**
 * Reference Parity paths — CSV files downloaded from TradingView with max history.
 * These override EXTERNAL_SERIES_PATHS when present, enabling REFERENCE_PARITY mode.
 * Download instructions: workspace/output/monitoring/audit/agri_final_configs_phase1/AGRI_MISSING_REFERENCE_DATA_DOWNLOAD_LIST.md
 */
const REFERENCE_PARITY_PATHS: Record<string, string> = {
  // DXY: ICEUS_DLY feed — download ICEUS_DLY:DXY 1D max history from TradingView
  "TVC:DXY": "workspace/input/agri_research/market_data/ICEUS_DLY_DXY_1D.csv",
  "ICEUS_DLY:DXY": "workspace/input/agri_research/market_data/ICEUS_DLY_DXY_1D.csv",
  // CL1: NYMEX_DL feed — download NYMEX_DL:CL1! 1D max history from TradingView
  "NYMEX_DL:CL1!": "workspace/input/agri_research/market_data/NYMEX_DL_CL1_1D.csv",
};

/** Symbols that have reference parity overrides defined above. */
const REFERENCE_PARITY_SYMBOLS = Object.keys(REFERENCE_PARITY_PATHS);

function resolveExternalSeriesPath(symbol: string): string | null {
  const direct = EXTERNAL_SERIES_PATHS[symbol];
  if (direct && fs.existsSync(path.join(PROJECT_ROOT, direct))) {
    return direct;
  }
  if (symbol === "FX_IDC:USDBRL") {
    const fallback = EXTERNAL_SERIES_PATHS["FX_IDC:BRLUSD"];
    if (fallback && fs.existsSync(path.join(PROJECT_ROOT, fallback))) {
      return fallback;
    }
  }
  return direct ?? null;
}

function summarizeDataSource(filePath: string): Pick<MvaDataSourceEntry, "rowCount" | "startDate" | "endDate"> {
  const absolutePath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) {
    return { rowCount: null, startDate: null, endDate: null };
  }
  try {
    const suffix = path.extname(absolutePath).toLowerCase();
    if (suffix === ".csv") {
      const lines = fs.readFileSync(absolutePath, "utf-8").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length <= 1) return { rowCount: 0, startDate: null, endDate: null };
      const rows = lines.slice(1).map((line) => (line.split(",")[0] ?? "").trim().replace(/^"|"$/g, ""));
      return {
        rowCount: rows.length,
        startDate: rows[0]?.slice(0, 10) ?? null,
        endDate: rows.at(-1)?.slice(0, 10) ?? null,
      };
    }
    const payload = JSON.parse(fs.readFileSync(absolutePath, "utf-8")) as { bars?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>>; series?: { bars?: Array<Record<string, unknown>> } };
    const rows = payload.bars ?? payload.data ?? payload.series?.bars ?? [];
    const readDate = (row: Record<string, unknown>) => String(row.date ?? row.time ?? row.timestampUtc ?? "").slice(0, 10) || null;
    return {
      rowCount: rows.length,
      startDate: rows[0] ? readDate(rows[0]) : null,
      endDate: rows.at(-1) ? readDate(rows.at(-1) as Record<string, unknown>) : null,
    };
  } catch {
    return { rowCount: null, startDate: null, endDate: null };
  }
}

function getRequiredComparisonSymbols(inputs: Record<string, unknown>): string[] {
  const required = new Set<string>();
  if (Boolean(inputs.useCustomBase) && String(inputs.baseSymbol ?? "").trim()) {
    required.add(String(inputs.baseSymbol).trim());
  }
  for (const index of [1, 2, 3]) {
    if (Boolean(inputs[`use${index}`]) && String(inputs[`sym${index}`] ?? "").trim()) {
      required.add(String(inputs[`sym${index}`]).trim());
    }
  }
  return Array.from(required);
}

function filterRawTradesFromStart(rawTrades: MvaEngineRawTrade[], startDate: string): MvaEngineRawTrade[] {
  return rawTrades.filter((trade) => {
    const entryDate = String(trade.entryTime ?? "").slice(0, 10);
    const exitDate = String(trade.exitTime ?? "").slice(0, 10);
    return Boolean(exitDate) && entryDate >= startDate && exitDate >= startDate;
  });
}

function filterVisualMarkersFromStart<T extends { time: string }>(rows: T[], startDate: string): T[] {
  return rows.filter((row) => String(row.time ?? "").slice(0, 10) >= startDate);
}

function filterVisualBoxesFromStart<T extends { startTime: string }>(rows: T[], startDate: string): T[] {
  return rows.filter((row) => String(row.startTime ?? "").slice(0, 10) >= startDate);
}

function rebuildCostSummary(costSummary: MvaCostSummary | null, rawTrades: MvaEngineRawTrade[]): MvaCostSummary | null {
  if (!costSummary) return null;
  const closedTrades = rawTrades.filter((trade) => trade.exitTime && trade.exitPrice != null);
  return {
    ...costSummary,
    totalGrossPnl: closedTrades.reduce((sum, trade) => sum + Number(trade.grossPnl ?? 0), 0),
    totalNetPnl: closedTrades.reduce((sum, trade) => sum + Number(trade.netPnl ?? 0), 0),
    totalCommissionCost: closedTrades.reduce((sum, trade) => sum + Number(trade.commissionCost ?? 0), 0),
    totalSpreadCost: closedTrades.reduce((sum, trade) => sum + Number(trade.spreadCost ?? 0), 0),
    totalSlippageCost: closedTrades.reduce((sum, trade) => sum + Number(trade.slippageCost ?? 0), 0),
    totalFinancingCost: closedTrades.reduce((sum, trade) => sum + Number(trade.financingCost ?? 0), 0),
    tradeCount: closedTrades.length,
  };
}

/**
 * Builds effective series paths and detects the active data mode.
 * When all reference parity files for a symbol's required comparison series exist,
 * the mode is REFERENCE_PARITY; otherwise PRODUCTION_LIVE.
 */
function buildEffectiveSeriesPaths(requiredSymbols?: string[]): {
  paths: Record<string, string>;
  dataMode: MvaDataMode;
  dataSourceMap: MvaDataSourceEntry[];
} {
  const paths = { ...EXTERNAL_SERIES_PATHS };
  const dataSourceMap: MvaDataSourceEntry[] = [];
  const requestedSymbols = new Set((requiredSymbols ?? []).map((symbol) => String(symbol).trim()).filter(Boolean));
  const requestedParitySymbols = REFERENCE_PARITY_SYMBOLS.filter((symbol) => requestedSymbols.has(symbol));
  let usedReferenceOverride = false;
  let missingRequestedReference = false;

  for (const symbol of requestedParitySymbols) {
    const refPath = REFERENCE_PARITY_PATHS[symbol]!;
    const available = fs.existsSync(path.join(PROJECT_ROOT, refPath));
    const resolvedPath = available ? refPath : (resolveExternalSeriesPath(symbol) ?? refPath);
    if (available) {
      paths[symbol] = refPath;
      usedReferenceOverride = true;
    } else {
      missingRequestedReference = true;
    }
    dataSourceMap.push({
      symbol,
      path: resolvedPath,
      mode: available ? "REFERENCE_PARITY" : "PRODUCTION_LIVE",
      available,
      requested: true,
      ...summarizeDataSource(resolvedPath),
    });
  }

  for (const symbol of requestedSymbols) {
    if (requestedParitySymbols.includes(symbol)) continue;
    const resolvedPath = resolveExternalSeriesPath(symbol);
    if (!resolvedPath) continue;
    dataSourceMap.push({
      symbol,
      path: resolvedPath,
      mode: "PRODUCTION_LIVE",
      available: fs.existsSync(path.join(PROJECT_ROOT, resolvedPath)),
      requested: true,
      ...summarizeDataSource(resolvedPath),
    });
  }

  const dataMode: MvaDataMode = usedReferenceOverride && !missingRequestedReference ? "REFERENCE_PARITY" : "PRODUCTION_LIVE";

  return { paths, dataMode, dataSourceMap };
}

function sha12(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function buildIdentity(symbol: string, inputHash: string, ohlcFingerprint: string, csvFingerprint: string | null, runMode: MonitoringStrategyRunIdentity["quantValidationMode"]): MonitoringStrategyRunIdentity {
  return {
    symbol,
    strategyKind: "macro_valuation",
    inputsHash: inputHash,
    inputHash,
    ohlcFingerprint,
    historicalCsvFingerprint: ohlcFingerprint,
    strategyCsvFingerprint: csvFingerprint ?? "missing",
    csvFingerprint: csvFingerprint ?? undefined,
    engineVersionHash: "mva_agriculture_engine_phase_3_v1",
    executionProfileVersion: "bar_close_atr_brackets_v1",
    executionProfileHash: sha12("bar_close_atr_brackets_v1"),
    quantValidationMode: runMode,
    generatedAt: new Date().toISOString(),
    inputMode: "xlsx_defaults",
    parityBasis: csvFingerprint ? "tradingview_export_and_xlsx_inputs" : "custom_backtest_no_parity_export",
  };
}

export async function runMacroValuationEngine(
  symbol: string,
  customInputs?: Record<string, unknown>,
  options?: EngineWindowOptions,
): Promise<MvaEngineRunResult> {
  const binding = getAgricultureMvaBinding(symbol);
  if (!binding) {
    throw new Error(`Unsupported MVA agriculture symbol: ${symbol}`);
  }

  const { inputSet, inputAvailability, inputSource } = loadMacroValuationInputs(binding);
  const effectiveInputs = toInputValueMap(inputSet, customInputs);
  const inputHash = sha12(JSON.stringify(effectiveInputs));
  const mergedOhlc = await buildMergedOhlcFile(binding);
  const requiredSymbols = getRequiredComparisonSymbols(effectiveInputs);
  const { paths: effectivePaths, dataMode, dataSourceMap } = buildEffectiveSeriesPaths(requiredSymbols);

  const engine = await runMacroValuationPythonEngine({
    symbol: binding.symbol,
    displayName: binding.displayName,
    ohlcPath: mergedOhlc.mergedFilePath,
    inputs: effectiveInputs,
    inputHash,
    externalSeriesPaths: effectivePaths,
  });

  const startDate = options?.startDate ?? AGRI_DEFAULT_BACKTEST_START;
  const filteredRawTrades = startDate
    ? filterRawTradesFromStart(engine.rawTrades, startDate)
    : engine.rawTrades.slice();
  const trades = toMonitoringTrades(filteredRawTrades);
  const metrics = computeMetrics(trades);
  const equityCurve = buildEquityCurve(trades);
  const csvTrades = loadCsvReferenceTrades(binding.symbol)?.filter((trade) => {
    if (!startDate) return true;
    const entryDate = String(trade.entryDate ?? "").slice(0, 10);
    const exitDate = String(trade.exitDate ?? "").slice(0, 10);
    return entryDate >= startDate && exitDate >= startDate;
  }) ?? null;
  const validation = buildValidation(binding.symbol, trades, csvTrades);
  const liveSignal = markLiveSignalStale(engine.liveSignal, mergedOhlc.liveCacheLastBar);
  const visualModel = buildVisualModel(binding.symbol, filteredRawTrades, engine.openTrade, liveSignal);
  const csvFingerprint = binding.tradeExportXlsxPath ?? binding.tradeExportCsvPath;
  const cacheIdentity = buildIdentity(binding.symbol, inputHash, mergedOhlc.ohlcFingerprint, csvFingerprint, "fixed_backtest");
  cacheIdentity.inputMode = customInputs ? "user_modified" : inputAvailability === "xlsx_params_available" ? "xlsx_defaults" : "missing_xlsx_metric_only";
  cacheIdentity.parityBasis = validation
    ? inputAvailability === "xlsx_params_available"
      ? "tradingview_export_and_xlsx_inputs"
      : "tradingview_export_metrics_only"
    : "custom_backtest_no_parity_export";

  return {
    symbol: binding.symbol,
    displayName: binding.displayName,
    inputSet,
    inputAvailability,
    inputSource,
    dataBinding: {
      ...binding,
      ohlcFingerprint: mergedOhlc.ohlcFingerprint,
      firstDate: mergedOhlc.firstDate,
      lastDate: mergedOhlc.lastDate,
      rowCount: mergedOhlc.rowCount,
      valid: true,
      mergedOhlcPath: mergedOhlc.mergedFilePath,
      liveCacheLastBar: mergedOhlc.liveCacheLastBar,
    },
    metrics,
    trades,
    rawTrades: filteredRawTrades,
    equityCurve,
    openTrade: engine.openTrade,
    liveSignal,
    visualModel: {
      ...visualModel,
      markers: startDate ? filterVisualMarkersFromStart(visualModel.markers, startDate) : visualModel.markers,
      boxes: startDate ? filterVisualBoxesFromStart(visualModel.boxes, startDate) : visualModel.boxes,
    },
    cacheIdentity,
    validation,
    walkForward: null,
    warnings: engine.warnings,
    dataCoverage: engine.dataCoverage,
    resolverDiagnostics: engine.resolverDiagnostics,
    costSummary: rebuildCostSummary(engine.costSummary, filteredRawTrades),
    referenceKpis: loadAgriReferenceKpisFromTrades(binding.symbol, startDate),
    dataMode,
    dataSourceMap,
  };
}

export async function runMacroValuationWalkForward(
  symbol: string,
  customInputs?: Record<string, unknown>,
  options?: EngineWindowOptions,
) {
  const base = await runMacroValuationEngine(symbol, customInputs, options);
  const { paths: wfoPaths } = buildEffectiveSeriesPaths();
  const windows = buildWalkForwardWindows(base.dataBinding.firstDate, base.dataBinding.lastDate, 5, 1);
  const runs = [];
  for (const window of windows.slice(0, 6)) {
    const train = await runMacroValuationPythonEngine({
      symbol: base.symbol,
      displayName: base.displayName,
      ohlcPath: base.dataBinding.mergedOhlcPath,
      inputs: toInputValueMap(base.inputSet, customInputs),
      inputHash: base.cacheIdentity.inputsHash,
      externalSeriesPaths: wfoPaths,
      studyStart: window.trainStart,
      studyEnd: window.trainEnd,
    });
    const oos = await runMacroValuationPythonEngine({
      symbol: base.symbol,
      displayName: base.displayName,
      ohlcPath: base.dataBinding.mergedOhlcPath,
      inputs: toInputValueMap(base.inputSet, customInputs),
      inputHash: base.cacheIdentity.inputsHash,
      externalSeriesPaths: wfoPaths,
      studyStart: window.oosStart,
      studyEnd: window.oosEnd,
    });
    runs.push({
      ...window,
      train: {
        trades: toMonitoringTrades(train.rawTrades),
        inputHash: base.cacheIdentity.inputsHash,
      },
      oos: {
        trades: toMonitoringTrades(oos.rawTrades),
        inputHash: base.cacheIdentity.inputsHash,
      },
    });
  }
  return {
    ...base,
    walkForward: buildWalkForwardResult(base.symbol, runs),
  };
}
