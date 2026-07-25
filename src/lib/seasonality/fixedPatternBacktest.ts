/**
 * Fixed Pattern Backtest
 * Applies a specific (locked) pattern to every year in the visible sample.
 * This is NOT the same as a strict Walk-Forward OOS test.
 */

import type { DailyBar } from "./walkForward/types";
import { analyzeSampleYears } from "./yearWindow";
import type { PatternDirection, PatternHolding } from "./patternSelection";
import { slotToApproxDate } from "./patternSelection";
import { buildSeasonalityResultIdentity, type SeasonalityResultIdentity } from "./resultIdentity";
import { computeTradingViewMetrics } from "./tradingViewMetrics";
import {
  buildYearSlotLookup,
  computeBarLevelRiskMetricsFromTrades,
  getPatternTradeForYear,
  type PatternTradeAuditMetrics,
  type PatternTradePath,
} from "./barLevelRisk";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_CALMAR_FORMULA_VERSION,
  SEASONALITY_DRAWDOWN_METHOD_VERSION,
  SEASONALITY_HOLDING_GRID_VERSION,
  SEASONALITY_METRIC_FORMULA_VERSION,
  SEASONALITY_PATTERN_SELECTION_VERSION,
  SEASONALITY_QUALITY_RISK_INPUT_VERSION,
  SEASONALITY_SHARPE_FORMULA_VERSION,
} from "./versions";

export interface FixedBacktestTrade {
  year: number;
  entrySlot: number;
  exitSlot: number;
  entryDate: string | null;
  exitDate: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  strategyReturn: number | null;
  validTrade: boolean;
  missingReason: string | null;
}

export interface FixedBacktestResult {
  lockedPatternId: string;
  assetId: string;
  direction: PatternDirection;
  startSlot: number;
  holdingDays: PatternHolding;
  entryDateLabel: string;
  exitDateLabel: string;
  sampleStartYear: number;
  sampleEndYear: number;
  excludedCurrentYear: number;
  requestedSampleYears: number | "MAX";
  expectedYears: number[];
  includedYears: number[];
  excludedYears: Array<{ year: number; reason: string }>;
  trades: FixedBacktestTrade[];
  validTradeCount: number;
  missingYears: Array<{ year: number; reason: string }>;
  coveredYears: number[];
  winRate: number;
  avgPerformance: number;
  compoundReturn: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpe: number | null;
  calmar: number | null;
  sortino: number | null;
  equitySeries: Array<{ year: number; equity: number; annualReturn: number }>;
  dataSource: string;
  sourceFingerprint?: string;
  backadjustmentStatus: string;
  resultType: "fixed_backtest";
  identity?: SeasonalityResultIdentity;
  generatedAt: string;
  auditMetrics?: PatternTradeAuditMetrics;
}

export function runFixedPatternBacktest(
  allBars: DailyBar[],
  assetId: string,
  direction: PatternDirection,
  startSlot: number,
  holdingDays: PatternHolding,
  lookbackYears = 20,
  backadjustmentStatus = "assumed_backadjusted",
  csvPath = "",
  sourceFingerprint = "",
  monitoringSymbol = assetId,
): FixedBacktestResult {
  const sorted = [...allBars].sort((a, b) => a.date.localeCompare(b.date));
  const sample = analyzeSampleYears(sorted, lookbackYears);
  const sampleYears = sample.includedYears;
  const currentYear = new Date().getFullYear();
  const exitSlot = startSlot + holdingDays;
  const lookup = buildYearSlotLookup(sorted, sampleYears);

  const trades: FixedBacktestTrade[] = [];
  const validTradePaths: PatternTradePath[] = [];
  const validReturns: number[] = [];
  const coveredYears: number[] = [];
  const missingYears: Array<{ year: number; reason: string }> = [];

  for (const year of sampleYears) {
    const { trade, missingReason } = getPatternTradeForYear(lookup, year, startSlot, holdingDays, direction);
    if (!trade) {
      const entry = lookup.yearMap.get(year)?.barsBySlot.get(startSlot) ?? null;
      missingYears.push({ year, reason: missingReason ?? "unknown_trade_error" });
      trades.push({
        year,
        entrySlot: startSlot,
        exitSlot,
        entryDate: entry?.date ?? null,
        exitDate: null,
        entryPrice: entry?.close ?? null,
        exitPrice: null,
        strategyReturn: null,
        validTrade: false,
        missingReason: missingReason ?? "unknown_trade_error",
      });
      continue;
    }

    validTradePaths.push(trade);
    validReturns.push(trade.strategyReturn);
    coveredYears.push(year);
    trades.push({
      year,
      entrySlot: startSlot,
      exitSlot,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entryPrice: parseFloat(trade.entryPrice.toFixed(2)),
      exitPrice: parseFloat(trade.exitPrice.toFixed(2)),
      strategyReturn: parseFloat(trade.strategyReturn.toFixed(6)),
      validTrade: true,
      missingReason: null,
    });
  }

  const n = validReturns.length;
  const wins = validReturns.filter((value) => value > 0).length;
  const metrics = computeTradingViewMetrics(validReturns);
  const barLevelRisk = computeBarLevelRiskMetricsFromTrades(validTradePaths);

  let realizedEquity = 1;
  const equitySeries: FixedBacktestResult["equitySeries"] = [];
  for (const trade of trades) {
    if (!trade.validTrade || trade.strategyReturn == null) {
      continue;
    }
    realizedEquity *= 1 + trade.strategyReturn;
    equitySeries.push({
      year: trade.year,
      equity: parseFloat(((realizedEquity - 1) * 100).toFixed(2)),
      annualReturn: parseFloat((trade.strategyReturn * 100).toFixed(2)),
    });
  }

  const downsideVariance = validReturns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / Math.max(n, 1);
  const downsideStd = Math.sqrt(downsideVariance);
  const patternId = `${assetId}-${direction}-S${startSlot}-H${holdingDays}`;

  return {
    lockedPatternId: patternId,
    assetId,
    direction,
    startSlot,
    holdingDays,
    entryDateLabel: slotToApproxDate(startSlot),
    exitDateLabel: slotToApproxDate(exitSlot),
    sampleStartYear: sampleYears[0] ?? currentYear - lookbackYears,
    sampleEndYear: sampleYears[sampleYears.length - 1] ?? currentYear - 1,
    excludedCurrentYear: currentYear,
    requestedSampleYears: sample.requestedSampleYears,
    expectedYears: sampleYears,
    includedYears: sample.includedYears,
    excludedYears: sample.excludedYears,
    trades,
    validTradeCount: n,
    missingYears,
    coveredYears,
    winRate: n > 0 ? parseFloat(((wins / n) * 100).toFixed(2)) : 0,
    avgPerformance: parseFloat(metrics.averageReturn.toFixed(6)),
    compoundReturn: parseFloat(metrics.compoundReturn.toFixed(6)),
    maxDrawdown: parseFloat(barLevelRisk.maxDrawdown.toFixed(6)),
    profitFactor: parseFloat(metrics.profitFactor.toFixed(3)),
    sharpe: metrics.sharpe != null ? parseFloat(metrics.sharpe.toFixed(3)) : null,
    calmar: barLevelRisk.calmar != null ? parseFloat(barLevelRisk.calmar.toFixed(3)) : null,
    sortino: downsideStd > 0.001 ? parseFloat((metrics.averageReturn / downsideStd).toFixed(3)) : null,
    equitySeries,
    dataSource: csvPath,
    sourceFingerprint,
    backadjustmentStatus,
    resultType: "fixed_backtest",
    identity: buildSeasonalityResultIdentity({
      base: {
        identityVersion: "seasonality_result_identity_v1",
        assetId,
        monitoringSymbol,
        sourceType: sourceFingerprint.startsWith("yahoo:")
          ? "existing_yahoo_provider"
          : "manual_tv_csv",
        sourcePathOrProviderSymbol: csvPath,
        sourceFingerprint,
        calculationVersion: SEASONALITY_CALCULATION_VERSION,
        metricFormulaVersion: SEASONALITY_METRIC_FORMULA_VERSION,
        drawdownMethodVersion: SEASONALITY_DRAWDOWN_METHOD_VERSION,
        calmarFormulaVersion: SEASONALITY_CALMAR_FORMULA_VERSION,
        qualityRiskInputVersion: SEASONALITY_QUALITY_RISK_INPUT_VERSION,
        sharpeFormulaVersion: SEASONALITY_SHARPE_FORMULA_VERSION,
        holdingGridVersion: SEASONALITY_HOLDING_GRID_VERSION,
        patternSelectionVersion: SEASONALITY_PATTERN_SELECTION_VERSION,
      },
      resultType: "fixed_backtest",
      requestedSampleYears: sample.requestedSampleYears,
      includedYears: sample.includedYears,
      excludedYears: sample.excludedYears,
      patternIdentity: { direction, startSlot, holdingDays },
    }),
    generatedAt: new Date().toISOString(),
    auditMetrics: {
      tradeCloseMaxDrawdown: metrics.maxDrawdown,
      tradeCloseCalmar: metrics.calmar,
    },
  };
}
