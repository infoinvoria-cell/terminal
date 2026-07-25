import type { PatternDirection, PatternHolding } from "./patternSelection";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_CALMAR_FORMULA_VERSION,
  SEASONALITY_DRAWDOWN_METHOD_VERSION,
  SEASONALITY_HOLDING_GRID_VERSION,
  SEASONALITY_METRIC_FORMULA_VERSION,
  SEASONALITY_PATTERN_SELECTION_VERSION,
  SEASONALITY_QUALITY_RISK_INPUT_VERSION,
  SEASONALITY_RESULT_IDENTITY_VERSION,
  SEASONALITY_SHARPE_FORMULA_VERSION,
} from "./versions";

export type SeasonalitySourceType = "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
export type SeasonalityResultType =
  | "historical_pattern_metrics"
  | "fixed_backtest"
  | "strict_walk_forward_oos"
  | "scanner_rank";

export interface SeasonalityPatternIdentity {
  direction: PatternDirection;
  startSlot: number;
  holdingDays: PatternHolding;
}

export interface SeasonalityIdentityEnvelope {
  identityVersion: string;
  assetId: string;
  monitoringSymbol: string;
  sourceType: SeasonalitySourceType;
  sourcePathOrProviderSymbol: string;
  sourceFingerprint: string;
  calculationVersion: string;
  metricFormulaVersion: string;
  drawdownMethodVersion: string;
  calmarFormulaVersion: string;
  qualityRiskInputVersion: string;
  sharpeFormulaVersion: string;
  holdingGridVersion: string;
  patternSelectionVersion: string;
}

export interface SeasonalityResultIdentity extends SeasonalityIdentityEnvelope {
  resultType: SeasonalityResultType;
  requestedSampleYears: number | "MAX";
  includedYears: number[];
  excludedYears: Array<{ year: number; reason: string }>;
  patternIdentity?: SeasonalityPatternIdentity | null;
}

export function buildSeasonalityIdentityEnvelope(input: {
  assetId: string;
  monitoringSymbol: string;
  sourceType: SeasonalitySourceType;
  sourcePathOrProviderSymbol: string;
  sourceFingerprint: string;
}): SeasonalityIdentityEnvelope {
  return {
    identityVersion: SEASONALITY_RESULT_IDENTITY_VERSION,
    assetId: input.assetId,
    monitoringSymbol: input.monitoringSymbol,
    sourceType: input.sourceType,
    sourcePathOrProviderSymbol: input.sourcePathOrProviderSymbol,
    sourceFingerprint: input.sourceFingerprint,
    calculationVersion: SEASONALITY_CALCULATION_VERSION,
    metricFormulaVersion: SEASONALITY_METRIC_FORMULA_VERSION,
    drawdownMethodVersion: SEASONALITY_DRAWDOWN_METHOD_VERSION,
    calmarFormulaVersion: SEASONALITY_CALMAR_FORMULA_VERSION,
    qualityRiskInputVersion: SEASONALITY_QUALITY_RISK_INPUT_VERSION,
    sharpeFormulaVersion: SEASONALITY_SHARPE_FORMULA_VERSION,
    holdingGridVersion: SEASONALITY_HOLDING_GRID_VERSION,
    patternSelectionVersion: SEASONALITY_PATTERN_SELECTION_VERSION,
  };
}

export function buildSeasonalityResultIdentity(input: {
  base: SeasonalityIdentityEnvelope;
  resultType: SeasonalityResultType;
  requestedSampleYears: number | "MAX";
  includedYears: number[];
  excludedYears: Array<{ year: number; reason: string }>;
  patternIdentity?: SeasonalityPatternIdentity | null;
}): SeasonalityResultIdentity {
  return {
    ...input.base,
    resultType: input.resultType,
    requestedSampleYears: input.requestedSampleYears,
    includedYears: [...input.includedYears],
    excludedYears: [...input.excludedYears],
    patternIdentity: input.patternIdentity ?? null,
  };
}
