import { STRATEGY_ENGINE_VERSION } from "./types";
export { STRATEGY_ENGINE_VERSION };
import type { StrategyEngineConfig } from "./types";

export const SOYBEANS_ENGINE_CONFIG: StrategyEngineConfig = {
  engineVersion:        STRATEGY_ENGINE_VERSION,
  assetId:              "soybeans",
  studyStartYear:       2000,
  studyEndYear:         2025,
  initialTrainingYears: 10,
  oosBlockYears:        2,
  holdingCandidates:    [10, 12, 14, 16, 18, 20],
  entryStepTradingDays: 2,
  maxPatternsPerAsset:  6,
  discoveryPreFilter: {
    minWinRate:       60,
    minAvgReturn:     0,
    minProfitFactor:  0.8,
  },
  qualityGate: {
    minQualityScore: 75,
  },
};
