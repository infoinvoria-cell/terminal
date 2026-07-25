/**
 * Strategy Engine Types — Phase 1: Soybeans MVP
 * Strict OOS-only portfolio discovery for robust saisonal patterns.
 */

export const STRATEGY_ENGINE_VERSION = "v1.0_soybeans_mvp_2025";

// ── Config ─────────────────────────────────────────────────────────────────

export interface StrategyEngineConfig {
  engineVersion: string;
  assetId: string;         // "soybeans"
  studyStartYear: number;  // 2000
  studyEndYear: number;    // 2025
  initialTrainingYears: number; // 10
  oosBlockYears: number;        // 2
  holdingCandidates: number[];  // [10,12,14,16,18,20]
  entryStepTradingDays: number; // 2
  maxPatternsPerAsset: number;  // 6
  discoveryPreFilter: {
    minWinRate: number;       // 60
    minAvgReturn: number;     // 0
    minProfitFactor: number;  // 0.8
  };
  qualityGate: {
    minQualityScore: number;  // 75
  };
}

// ── Per-Candidate ───────────────────────────────────────────────────────────

export interface StrategyEngineFullSampleMetrics {
  winRate: number;
  avgReturn: number;
  compoundReturn: number;
  sharpe: number | null;
  profitFactor: number;
  maxDrawdown: number;   // bar-level where available, trade-close fallback
  calmar: number | null;
  observationCount: number;
}

export interface StrategyEngineWFSummary {
  oosTrades: number;
  oosFolds: number;
  oosWinRate: number;
  oosAvgReturn: number;
  oosProfitFactor: number;
  oosMaxDrawdown: number;
  oosCompoundReturn: number;
  qualityScore: number;
  qualityStatus: string;
  parameterStability: number;
  positiveOosFolds: number;
  leakageCheckPassed: boolean;
  /** Per-fold OOS returns for portfolio stitching */
  foldOosReturns: Array<{ year: number; oosReturn: number; entrySlot: number; holdingDays: number }>;
}

export interface StrategyEngineCandidate {
  direction: "LONG" | "SHORT";
  entrySlot: number;
  exitSlot: number;
  holdingDays: number;
  windowLabel: string;    // "08 Jun – 28 Jun"
  fullSampleMetrics: StrategyEngineFullSampleMetrics;
  walkForwardSummary?: StrategyEngineWFSummary;
  robustnessStatus: "not_tested" | "insufficient" | "failed" | "weak" | "promising" | "strong" | "excellent";
  validated: boolean;
  rejectionReason?: string;
}

// ── Portfolio ───────────────────────────────────────────────────────────────

export interface PortfolioFoldYearReturn {
  year: number;
  portfolioReturn: number;
  activePatternCount: number;
  patternContributions: Array<{ slot: number; direction: string; holding: number; ret: number }>;
}

export interface StrategyEnginePortfolioResult {
  oosTrades: number;
  oosYears: number;
  oosFolds: number;
  oosWinRate: number;
  oosAvgReturn: number;
  oosCompoundReturn: number;
  oosProfitFactor: number;
  oosMaxDrawdown: number;
  oosCalmar: number | null;
  positiveYears: number;
  negativeYears: number;
  worstYear: number | null;
  worstYearReturn: number | null;
  yearlyReturns: PortfolioFoldYearReturn[];
  equitySeries: Array<{ year: number; equity: number; drawdown: number }>;
  patternContributionSummary: Array<{
    slot: number; direction: string; holding: number; windowLabel: string;
    oosTrades: number; oosAvgReturn: number; oosMaxDD: number; contribution: number;
  }>;
}

// ── Full Result ─────────────────────────────────────────────────────────────

export interface StatisticalRobustnessEvidence {
  candidateUniverseSize: number;
  preFilteredCandidates: number;
  wfTestedCandidates: number;
  selectedPatternCount: number;
  overlapConflictsRemoved: number;
  multipleTestingAdjustment: "not_implemented" | "deflated_sharpe" | "false_discovery_rate";
  significanceClaimAllowed: false;
  note: string;
}

export interface StrategyEngineAuditMetadata {
  assetId: string;
  csvSource: string;
  sourceFingerprint: string;
  studyStartYear: number;
  studyEndYear: number;
  totalBarsLoaded: number;
  totalYearsAvailable: number;
  engineVersion: string;
  calculationVersion: string;
  metricFormulaVersion: string;
  drawdownMethodVersion: string;
  qualityRiskInputVersion: string;
  holdingGridVersion: string;
  wfConfig: {
    initialTrainingYears: number;
    oosBlockYears: number;
    entryShifts: number[];
    holdingCandidates: number[];
  };
  portfolioConflictPolicy: "no_concurrent_same_asset_overlapping";
  tradingViewParityStatus: "pending_execution_parameter_verification";
  multipleTestingStatus: "not_adjusted_phase1";
  runTimestampUtc: string;
  runDurationMs: number;
}

export interface StrategyEngineResult {
  engineVersion: string;
  config: StrategyEngineConfig;
  auditMetadata: StrategyEngineAuditMetadata;
  statisticalEvidence: StatisticalRobustnessEvidence;
  validatedPatterns: StrategyEngineCandidate[];
  rejectedCandidates: StrategyEngineCandidate[];
  assetPortfolio: StrategyEnginePortfolioResult | null;
  status: "complete" | "no_patterns_validated" | "error";
  errorMessage?: string;
}

export interface StrategyEngineJobState {
  status: "idle" | "running" | "complete" | "error";
  progress: string;
  result: StrategyEngineResult | null;
  startedAt: number | null;
  errorMessage?: string;
}
