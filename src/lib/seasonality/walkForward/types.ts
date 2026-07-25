// Walk-Forward Seasonal Grid Test — Type Definitions
// Historical CSV research only. NOT a live trading signal.
// V2 Anchored Expanding + Manual Frozen Rule types appended below.

export type WFDirection = "LONG" | "SHORT";

export type WFSampleType = "IN_SAMPLE" | "OUT_OF_SAMPLE" | "CURRENT_YEAR_PROVISIONAL";

export type WFTradeStatus =
  | "EXECUTED"
  | "NO_TRADE_ENTRY_NOT_FOUND"
  | "NO_TRADE_EXIT_NOT_FOUND"
  | "NO_DATA";

export type WFCurrentYearStatus =
  | "UPCOMING"
  | "ACTIVE"
  | "COMPLETED_PROVISIONAL"
  | "NOT_ENOUGH_CURRENT_YEAR_DATA";

export type WFRankingMetric = "stabilityScore";

export type WFResearchGateStatus =
  | "PASSED_RESEARCH_GATE"
  | "FAILED_RESEARCH_GATE"
  | "INSUFFICIENT_DATA";

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WalkForwardConfig {
  assetId: string;
  trainingYears: number;
  testYears: number;
  stepYears: number;
  holdingDaysMin: number;
  holdingDaysMax: number;
  directions: WFDirection[];
  transactionCostBps: number;
  rankingMetric: WFRankingMetric;
  /** Entry rule: open of first available trading day on or after entryMonthDay */
  entryExecutionRule: "open_on_or_after";
  /** Exit rule: close after exactly holdingTradingDays held sessions */
  exitExecutionRule: "close_after_holding_days";
}

export interface WFResearchGateCriteria {
  minOosTradeCount: number;
  minOosCompoundedReturn: number;
  minOosAverageReturn: number;
  minOosWinRate: number;       // fraction, e.g. 0.50
  maxOosMaxDrawdown: number;   // fraction, e.g. 0.30
}

export interface WFResearchGateResult {
  status: WFResearchGateStatus;
  criteria: WFResearchGateCriteria;
  failures: string[];
  canBeConsideredStableSeasonalPattern: boolean;
  canBePromotedToLiveSignal: false;
}

export interface WFTradeMetrics {
  tradeCount: number;
  compoundedReturn: number;
  averageReturn: number;
  medianReturn: number;
  winRate: number;
  standardDeviation: number;
  maxDrawdown: number;
  profitFactor: number;
  positiveYears: number;
  negativeYears: number;
}

export interface SeasonalPatternCandidate {
  direction: WFDirection;
  entryMonthDay: string; // MM-DD
  holdingTradingDays: number;
  stabilityScore: number;
  trainingMetrics: WFTradeMetrics;
}

export interface SeasonalTrade {
  year: number;
  direction: WFDirection;
  plannedEntryMonthDay: string;
  actualEntryDate: string;
  actualExitDate: string;
  entryPrice: number;
  exitPrice: number;
  grossReturn: number;
  netReturn: number;
  source: "historical_csv_walk_forward";
  sampleType: WFSampleType;
}

export interface WalkForwardFold {
  foldId: number;
  trainingStartYear: number;
  trainingEndYear: number;
  testYear: number;
  selectedCandidate: SeasonalPatternCandidate | null;
  trainingMetrics: WFTradeMetrics | null;
  oosTrade: SeasonalTrade | null;
  oosTradeStatus: WFTradeStatus;
  oosNoTradeReason: string | null;
  oosGrossReturn: number | null;
  oosNetReturn: number | null;
}

export interface WFOosSummary {
  foldCount: number;
  oosTradeCount: number;
  oosCompoundedReturn: number;
  oosAverageReturn: number;
  oosMedianReturn: number;
  oosWinRate: number;
  oosProfitFactor: number;
  oosMaxDrawdown: number;
  positiveTestYears: number;
  negativeTestYears: number;
  bestTestYear: number | null;
  worstTestYear: number | null;
}

export interface WFCurrentYearPlan {
  year: number;
  trainingStartYear: number;
  trainingEndYear: number;
  selectedDirection: WFDirection | null;
  selectedEntryMonthDay: string | null;
  selectedHoldingTradingDays: number | null;
  plannedEntryDate: string | null;
  plannedExitDate: string | null;
  status: WFCurrentYearStatus;
  actualEntryPrice: number | null;
  actualExitPrice: number | null;
  returnToDate: number | null;
  finalReturn: number | null;
  stabilityScore: number | null;
  trainingMetrics: WFTradeMetrics | null;
  /** Quality gate result for the current year pattern */
  researchGate: WFResearchGateResult;
}

export interface WalkForwardResult {
  asset: {
    assetId: string;
    displayName: string;
    symbol: string;
    monitoringSymbol?: string;
  };
  resultIdentity?: {
    assetId: string;
    monitoringSymbol: string;
    sourceType: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
    sourcePathOrProviderSymbol: string;
    sourceFingerprint: string;
    calculationVersion: string;
    walkForwardConfigVersion: string;
    requestedSampleYears: "MAX";
    includedYears: number[];
    excludedYears: Array<{ year: number; reason: string }>;
    resultType: "strict_walk_forward_oos";
  };
  dataSource: {
    type: "historical_csv_walk_forward";
    csvPath: string;
    csvFingerprint: string;
    firstDate: string;
    lastDate: string;
    bars: number;
    completeYears: number;
    completeYearsList: number[];
  };
  config: WalkForwardConfig;
  foldResults: WalkForwardFold[];
  oosSummary: WFOosSummary;
  /** Research Quality Gate evaluation on the OOS summary */
  researchGate: WFResearchGateResult;
  currentYearPlan: WFCurrentYearPlan | null;
  topCandidatesLastTrainingWindow: SeasonalPatternCandidate[];
  warnings: string[];
  generatedAt: string;
  calculationDurationMs: number;
  noLookAheadConfirmed: true;
  currentYearExcludedFromCompletedOos: true;
  usedAsLiveSignal: false;
  globalLiveSignalsChanged: false;
  monitoringChanged: false;
  customEnginePilotsChanged: false;
}

// ─── Default quality gate criteria ───────────────────────────────────────────

export const DEFAULT_RESEARCH_GATE_CRITERIA: WFResearchGateCriteria = {
  minOosTradeCount: 8,
  minOosCompoundedReturn: 0,
  minOosAverageReturn: 0,
  minOosWinRate: 0.50,
  maxOosMaxDrawdown: 0.30,
};

// ─── V2: Validation modes ─────────────────────────────────────────────────────

export type WFValidationMode = "ROLLING_FIXED_TRAINING" | "ANCHORED_EXPANDING";
export type WFRuleSelectionMode = "AUTO_GRID" | "MANUAL_FROZEN_RULE";

export type WFFreezeEvidence =
  | "SYSTEM_FROZEN_BEFORE_OOS"
  | "USER_ATTESTED_BEFORE_OOS"
  | "RETROSPECTIVE_AFTER_OOS";

export type AnchoredFoldStatus =
  | "VALID_OOS"
  | "VALID_OOS_USER_ATTESTED"
  | "PROVISIONAL_INCOMPLETE_OOS"
  | "INVALID_LEAKAGE"
  | "INVALID_MISSING_DATA"
  | "BLOCKED_NOT_FROZEN";

// ─── V2: SeasonalRuleVersion ──────────────────────────────────────────────────

export interface SeasonalRuleVersion {
  ruleVersionId: string;
  experimentId: string;
  symbol: string;
  displayName: string;
  createdAt: string;
  sourceMode: WFRuleSelectionMode;
  freezeEvidence: WFFreezeEvidence;
  frozenBeforeOosStart: boolean;
  trainingStartYear: number;
  trainingEndYear: number;
  intendedOosStartYear: number;
  intendedOosEndYear: number;
  direction: WFDirection;
  entryMonthDay: string;     // MM-DD
  holdingTradingDays: number;
  commissionBps: number;
  slippageBps: number;
  rationale: string;
  userNotes: string;
  validForOosEvaluation: boolean;
}

// ─── V2: Anchored fold ────────────────────────────────────────────────────────

export interface AnchoredWalkForwardFold {
  foldId: number;
  experimentId: string;
  symbol: string;
  backadjustmentStatus: string;
  trainingStartYear: number;
  trainingEndYear: number;
  oosStartYear: number;
  oosEndYear: number;
  ruleVersionId: string;
  ruleFreezeEvidence: WFFreezeEvidence;
  selectedFromTrainingOnly: boolean;
  lookaheadCheckPassed: boolean;
  validityStatus: AnchoredFoldStatus;
  validationWarnings: string[];
  trainingMetrics: WFTradeMetrics | null;
  oosTrades: SeasonalTrade[];
  oosMetrics: WFTradeMetrics | null;
  generatedAt: string;
}

// ─── V2: Stitched OOS ────────────────────────────────────────────────────────

export interface StitchedOosResult {
  validFoldIds: number[];
  userAttestedFoldIds: number[];
  excludedFoldIds: number[];
  provisionalFoldIds: number[];
  oosTradeCount: number;
  oosCompoundedReturn: number;
  oosAverageReturn: number;
  oosWinRate: number;
  oosMaxDrawdown: number;
  oosProfitFactor: number;
  positiveOosFolds: number;
  negativeOosFolds: number;
  smallSampleWarning: boolean;
  profitConcentrationWarning: boolean;
  dominantFoldId: number | null;
  dominantFoldProfitShare: number | null;
  researchGate: WFResearchGateResult;
  generatedAt: string;
}

// ─── V2: Robustness heatmap ───────────────────────────────────────────────────

export interface RobustnessCell {
  entryShift: number;   // -2..+2 trading days
  holdingShift: number; // -2..+2 days
  holdingDays: number;  // actual holding = base + shift
  oosReturn: number;
  winRate: number;
  profitFactor: number;
  foldCount: number;
}

export type RobustnessClassification = "ROBUST" | "FRAGILE" | "INCONCLUSIVE";

export interface RobustnessResult {
  baseRuleVersionId: string;
  baseEntryMonthDay: string;
  baseHoldingTradingDays: number;
  cells: RobustnessCell[];
  classification: RobustnessClassification;
  classificationReason: string;
  generatedAt: string;
}

// ─── V2: Walk-Forward Experiment ─────────────────────────────────────────────

export interface WalkForwardExperiment {
  experimentId: string;
  asset: {
    assetId: string;
    displayName: string;
    symbol: string;
    monitoringSymbol?: string;
  };
  dataSource: {
    type: "historical_csv_walk_forward";
    csvPath: string;
    csvFingerprint: string;
    firstDate: string;
    lastDate: string;
    bars: number;
    completeYears: number;
    completeYearsList: number[];
  };
  validationMode: WFValidationMode;
  ruleSelectionMode: WFRuleSelectionMode;
  config: {
    anchorYear: number;
    oosBlockYears: number;
    holdingDaysMin: number;
    holdingDaysMax: number;
    directions: WFDirection[];
    transactionCostBps: number;
  };
  ruleVersions: SeasonalRuleVersion[];
  folds: AnchoredWalkForwardFold[];
  stitchedOosResult: StitchedOosResult | null;
  robustnessResult: RobustnessResult | null;
  warnings: string[];
  generatedAt: string;
  calculationDurationMs: number;
  noLookAheadConfirmed: true;
  usedAsLiveSignal: false;
  canBePromotedToLiveSignal: false;
  globalLiveSignalsChanged: false;
  monitoringChanged: false;
}

// ─── Saved seasonal pattern (display model) ──────────────────────────────────

export type SavedPatternValidationMode = "Rolling OOS" | "Anchored Expanding OOS" | "Manual Frozen Rule";
export type SavedPatternStatus = "Validated" | "User-attested" | "Provisional" | "Failed Gate" | "Invalid Leakage";
export type SavedPatternResearchRating = "Strong" | "Excellent";

export interface SavedPatternAtrSafetyStop {
  useAtrSafetyStop: true;
  atrLength: 14;
  atrMultiplier: 2.0;
  stopMode: "safety_only";
}

export interface SavedPatternOosTrade {
  year: number;
  direction: WFDirection;
  entryDate: string;
  exitDate: string;
  entryPrice: number | null;
  exitPrice: number | null;
  returnPct: number | null;
  entrySlot: number | null;
  holdingTradingDays: number | null;
}

export interface SavedSeasonalPattern {
  patternId: string;
  assetId: string;
  symbol: string;
  displayName: string;
  name: string;
  ruleVersion: string;
  direction: WFDirection;
  entryMonthDay: string;
  holdingTradingDays: number;
  validationMode: SavedPatternValidationMode;
  gateStatus: WFResearchGateStatus;
  /** Compounded OOS return (fraction, e.g. -0.484 = -48.4%) */
  oosReturn: number | null;
  oosCompoundedReturn: number | null;
  oosMaxDrawdown: number | null;
  oosWinRate: number | null;
  oosProfitFactor: number | null;
  oosTradeCount: number | null;
  sampleSize: number | null;
  robustnessStatus: "ROBUST" | "FRAGILE" | "INCONCLUSIVE" | null;
  status: SavedPatternStatus;
  currentYearStatus: WFCurrentYearStatus | null;
  plannedEntryDate: string | null;
  plannedExitDate: string | null;
  experimentId: string | null;
  savedAt: string;
  researchRating?: SavedPatternResearchRating | null;
  qualityScore?: number | null;
  oosAverageReturn?: number | null;
  oosSharpe?: number | null;
  oosCalmar?: number | null;
  parameterStability?: number | null;
  sourceFingerprint?: string | null;
  researchOnly?: true;
  portfolioGroupId?: "seasonal_patterns";
  atrSafetyStop?: SavedPatternAtrSafetyStop;
  oosTradesDetailed?: SavedPatternOosTrade[];
  usedAsLiveSignal: false;
  canBePromotedToLiveSignal: false;
}
