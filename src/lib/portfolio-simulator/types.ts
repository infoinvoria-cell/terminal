export type EvidenceType = "CANONICAL" | "CANONICAL_SUMMARY" | "RECONSTRUCTED" | "NOT_AVAILABLE";

export type PortfolioMode = "white-swan" | "core-invest" | "combined";

export type TimeRangeKey = "1Y" | "3Y" | "5Y" | "MAX";

export type CurrencyMode = "USD" | "EUR";

export type ExecutionFeasibility =
  | "MODEL_OK"
  | "EXECUTION_EXACT"
  | "EXECUTION_APPROXIMATE"
  | "NOT_GRANULAR"
  | "EXECUTION_DATA_PENDING";

export type CapitalRequirementRecord = {
  strategyId: string;
  displayName: string;
  family: string;
  portfolioWeightPct: number;
  historicalSizingMode: string;
  historicalReferenceInstrument: string | null;
  historicalReferenceQuantity: number | "NOT_FIXED" | null;
  historicalReferenceUnit: string;
  historicalReferenceCapitalUsd?: number | null;
  evidenceType: EvidenceType;
  authoritativeEvidenceType: string;
  largestLossEvidenceType: string;
  largestReliableWinUsd: number | null;
  largestReliableLossUsd: number | null;
  reconstructedLargestLossUsd: number | null;
  largestLossUsedForCapitalCalculation: number | null;
  maxDrawdownUsd: number | null;
  maxDrawdownPct: number | "NOT_DEFINED_WITHOUT_CAPITAL_BASE" | null;
  hasHardStop: boolean;
  plannedRiskPerReferenceUnit: number | "NOT_DEFINED" | "NOT_APPLICABLE_NO_HARD_STOP" | null;
  capitalForWorstLossAt1Pct: number | null;
  capitalForWorstLossAt2Pct: number | null;
  capitalForWorstLossAt3Pct: number | null;
  capitalForWorstLossAt5Pct: number | null;
  capitalForWorstLossAt10Pct: number | null;
  modelReferenceUnits: number;
  fractionalReferenceUnitsRequired?: number | null;
  minimumBrokerExecutableUnit: number | null;
  sourceArtifact: string;
  canonicalStatus: string | null;
  canonicalSummaryAvailable: boolean;
  canonicalLargestLossAvailable: boolean;
  confidence: string | null;
  granularityClassification: string | null;
};

export type PortfolioSeriesPoint = {
  date: string;
  cumulativePct: number;
};

export type PortfolioTradeRow = {
  id: string;
  portfolio: "White Swan" | "Core Invest";
  strategy: string;
  family: string;
  evidenceType: EvidenceType;
  direction: string;
  signalInstrument: string;
  executionInstrument: string;
  modelQuantity: number | null;
  executableQuantity: number | null;
  executionFeasibility: ExecutionFeasibility;
  entryDate: string;
  exitDate: string;
  entry: number | null;
  exit: number | null;
  pnlUsd: number;
  pnlPct: number | null;
  status: "CANONICAL" | "RECONSTRUCTED" | "UNAVAILABLE";
};

export type PortfolioDefinition = {
  id: "white-swan" | "core-invest";
  label: "White Swan" | "Core Invest";
  sourceLabel: string;
  componentsCount: number;
  weightsSumPct: number;
  performanceSeries: PortfolioSeriesPoint[];
  capitalRequirements: CapitalRequirementRecord[];
  tradeRows: PortfolioTradeRow[];
};

export type ScenarioConfig = {
  mode: PortfolioMode;
  accountSize: number;
  currency: CurrencyMode;
  whiteSwanPct: number;
  coreInvestPct: number;
  range: TimeRangeKey;
};

export type ScenarioPoint = {
  date: string;
  equity: number;
  drawdownPct: number;
  returnPct: number;
};

export type ScenarioMetric = {
  endingEquity: number;
  netProfit: number;
  totalReturnPct: number;
  cagr: number | null;
  sharpe: number | null;
  calmar: number | null;
  maxDrawdownPct: number | null;
  winRate: number | null;
  profitFactor: number | null;
  trades: number;
  worstTradeUsd: number | null;
  bestTradeUsd: number | null;
};

export type ScenarioContributionRow = {
  key: string;
  portfolio: "White Swan" | "Core Invest";
  strategy: string;
  family: string;
  internalWeightPct: number;
  effectiveAccountWeightPct: number;
  historicalPnlContributionUsd: number | null;
  historicalLossContributionUsd: number | null;
  historicalDrawdownContributionUsd: number | null;
};

export type ScenarioCapitalRow = CapitalRequirementRecord & {
  sleeveCapitalUsd: number;
  effectiveAccountWeightPct: number;
  modelReferenceUnitsEffective: number;
  historicalLossAsPctOfSleeve: number | null;
  weightedLossContributionUsd: number | null;
  executionFeasibility: ExecutionFeasibility;
  executableUnits: number | null;
  executionTranslation?: WhiteSwanExecutionTranslation | null;
};

export type WhiteSwanExecutionScenarioStatus =
  | "EXACTLY_EXECUTABLE"
  | "APPROXIMATELY_EXECUTABLE"
  | "NOT_GRANULAR_ENOUGH"
  | "MARGIN_BLOCKED"
  | "BROKER_UNAVAILABLE"
  | "PERMISSION_PENDING"
  | "DATA_PENDING";

export type WhiteSwanExposureStatus = "EXACT" | "APPROXIMATE" | "NOT_GRANULAR_ENOUGH";
export type WhiteSwanMarginStatus = "PASS" | "BLOCKED" | "DATA_PENDING" | "NOT_APPLICABLE";
export type WhiteSwanBrokerOrderStatus = "PASS" | "DATA_PENDING" | "REJECTED" | "NOT_APPLICABLE";
export type WhiteSwanCapitalAffordabilityStatus = "PASS" | "BLOCKED" | "DATA_PENDING" | "NOT_APPLICABLE";
export type WhiteSwanBrokerAvailabilityStatus =
  | "AVAILABLE"
  | "ODD_LOT_ROUTING_POSSIBLE"
  | "BROKER_UNAVAILABLE"
  | "PERMISSION_PENDING"
  | "FUTURE_PRODUCT_PENDING_LAUNCH"
  | "DATA_PENDING";
export type WhiteSwanQuantityStepStatus = "RESOLVED" | "DATA_PENDING";
export type WhiteSwanMarginConfidence = "BROKER_VERIFIED" | "OFFICIAL_REFERENCE" | "DATA_PENDING";

export type WhiteSwanExecutionTranslation = {
  profileId: string;
  accountCurrency: "USD" | "EUR";
  accountEquity: number;
  whiteSwanSleeveCapital: number;
  internalWeightPct: number;
  effectiveTotalAccountWeightPct: number;
  capitalScalingPolicy: string;
  referenceSizingBasis: string;
  referenceCapitalUsd: number | null;
  referenceCapitalPolicy: "CANONICAL" | "DERIVED_FROM_RISK_PACKAGE" | "PROPOSED_EXECUTION_POLICY";
  referenceCapitalPolicyLabel: string;
  historicalReferenceUnits: number;
  historicalQuantityAtSignal: number | null;
  scenarioScaledQuantityTarget: number;
  referenceUnit: string;
  modelReferenceQty: number | null;
  referenceExposureUnit: string;
  modelExposureInReferenceUnits: number;
  economicExposureUnit: string;
  economicExposure: number | null;
  candidateExposurePerBrokerUnit: number;
  futureContractExposureUnit: string;
  futureUnitExposure: number | null;
  brokerExposureInReferenceUnits: number;
  modelTargetExposure: number;
  modelTargetBrokerQuantity: number;
  idealFutureQty: number | null;
  selectedInstrument: string;
  selectedIbkrSymbol: string;
  selectedSecType: "CASH" | "FUT" | "STK";
  selectedExchange: string;
  signalBenchmark: string | null;
  executionBenchmark: string | null;
  benchmarkMethodologyMismatch: string | null;
  benchmarkBasisStatus?: string | null;
  conversionMethod?: string | null;
  executionFidelityStatus: "FAITHFUL_MAPPING" | "APPROXIMATE_MAPPING" | "NO_FAITHFUL_FUTURES_MAPPING";
  brokerQuantity: number;
  candidateFloorQuantity: number;
  candidateCeilQuantity: number;
  candidateUnitExposureRatio: number;
  executableExposure: number;
  absoluteExposureError: number;
  relativeExposureErrorPct: number;
  routeMinimumQuantity: number | null;
  actualQuantityStep: number | null;
  quantityStepStatus: WhiteSwanQuantityStepStatus;
  routeType: string | null;
  oddLotEligibility: string | null;
  accountEntityAssumption: string | null;
  markPrice: number | null;
  priceInstrument: string | null;
  priceTimestamp: string | null;
  priceSource: string | null;
  priceStatus: "LIVE" | "SNAPSHOT" | "DATA_PENDING";
  executionReferencePrice?: number | null;
  executionReferencePriceInstrument?: string | null;
  executionReferencePriceTimestamp?: string | null;
  executionReferencePriceSource?: string | null;
  executionReferencePriceStatus?: string | null;
  goldOuncesEquivalent?: number | null;
  resolvedContractRootSymbol?: string | null;
  resolvedContractEligibleDeliveryMonths?: (string | number)[] | null;
  resolvedContractRule?: string | null;
  resolvedContractExpiry?: string | null;
  resolvedContractLabel?: string | null;
  resolvedContractStatus?: string | null;
  brokerQualificationStatus?: string | null;
  brokerQualifiedConId?: number | null;
  brokerQualifiedLocalSymbol?: string | null;
  brokerQualifiedMultiplier?: number | null;
  brokerQualifiedMinTick?: number | null;
  brokerQualifiedTradingClass?: string | null;
  availableFundsChange?: number | null;
  commissionEstimate?: number | null;
  positionNotionalAccountCurrency: number | null;
  cashRequired: number | null;
  initialMargin: number | null;
  maintenanceMargin: number | null;
  marginSourceType: "IBKR_WHAT_IF" | "IBKR_API" | "IBKR_OFFICIAL_TABLE" | "EXCHANGE_REFERENCE" | "UNAVAILABLE";
  marginConfidence: WhiteSwanMarginConfidence;
  marginTimestamp: string | null;
  marginCurrency: string | null;
  marginPct: number | null;
  marginUtilizationPct: number | null;
  remainingCashAfterMargin: number | null;
  freeCashPct: number | null;
  historicalLossReferenceUsd: number | null;
  executableHistoricalLossImpactUsd: number | null;
  minimumAccountForAnyFaithfulExecutionUsd: number | null;
  minimumAccountForApproximateExecutionUsd: number | null;
  minimumAccountForExactExecutionUsd: number | null;
  minimumAccountForBrokerExecutionUsd: number | null;
  minimumAccountForBrokerExecutionVerifiedUsd: number | null;
  brokerAvailabilityStatus: WhiteSwanBrokerAvailabilityStatus;
  brokerOrderStatus: WhiteSwanBrokerOrderStatus;
  exposureStatus: WhiteSwanExposureStatus;
  marginStatus: WhiteSwanMarginStatus;
  capitalAffordabilityStatus: WhiteSwanCapitalAffordabilityStatus;
  finalExecutionStatus: WhiteSwanExecutionScenarioStatus;
  status: WhiteSwanExecutionScenarioStatus;
  statusReason: string;
  sourceUrl: string;
  sourceType: string;
  retrievedAtUtc: string;
};

export type ScenarioTradeRow = PortfolioTradeRow & {
  runningEquity: number;
  portfolioContributionUsd: number;
};

export type MonteCarloSummary = {
  method: "monthly_block_bootstrap";
  runs: number;
  seed: number;
  blockLength: number;
  medianTerminalEquity: number;
  p05TerminalEquity: number;
  p95TerminalEquity: number;
  probabilityBelowStartPct: number;
  medianMaxDrawdownPct: number;
  p95MaxDrawdownPct: number;
};

export type PortfolioLabBootstrap = {
  generatedAt: string;
  whiteSwan: PortfolioDefinition;
  coreInvest: PortfolioDefinition;
  defaultScenario: ScenarioConfig;
  availableRanges: TimeRangeKey[];
};
