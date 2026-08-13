import type {
  CapitalRequirementRecord,
  ScenarioConfig,
  WhiteSwanExecutionScenarioStatus,
  WhiteSwanExecutionTranslation,
  WhiteSwanExposureStatus,
  WhiteSwanMarginStatus,
  WhiteSwanBrokerAvailabilityStatus,
  WhiteSwanBrokerOrderStatus,
  WhiteSwanCapitalAffordabilityStatus,
  WhiteSwanMarginConfidence,
} from "@/lib/portfolio-simulator/types";
import {
  getWhiteSwanMarkSnapshot,
  getWhiteSwanMarkPrice,
  WHITE_SWAN_EXECUTION_PROFILES,
  WHITE_SWAN_EXECUTION_TRUTH,
  type WhiteSwanExecutionEntry,
} from "@/lib/white-swan/execution-truth";

const EXACT_THRESHOLD_PCT = 2;
const APPROXIMATE_THRESHOLD_PCT = 15;

export const WHITE_SWAN_EXECUTION_SCALING_POLICY_V1 = {
  id: "WHITE_SWAN_EXECUTION_SCALING_POLICY_V1",
  referenceWorstTradeLossPct: 10,
  interpretation: "MODEL_SCALING_CONVENTION_ONLY",
  seasonalReferenceCapitalThreshold: "capitalForWorstLossAt10Pct",
  marginFallbackRateByAssetClass: {
    fx: 0.04,
    future: 0.12,
    etf: 1,
  },
  maxMarginUtilizationPct: 65,
} as const;

const DYNAMIC_REFERENCE_QUANTITY: Record<string, number> = {
  FP10_GLD_THURSDAY_LONG: 791.848783827324,
  FP10_YM1_TAT: 1.097448275862069,
};

const CONTRACT_EQUIVALENT_RATIO: Record<string, number> = {
  FDXS: 0.04,
  MYM: 0.1,
  MZM: 0.1,
  MHG: 0.1,
  MGC: 0.1,
  "1OZ": 0.01,
  MCL: 0.1,
  MZC: 0.1,
  MZW: 0.1,
  MZS: 0.1,
  CC: 1,
  SB: 1,
  MES: 1,
  EI: 1,
  M2K: 1,
  M6E: 1,
} as const;

const ENTRY_BY_ID = new Map(
  WHITE_SWAN_EXECUTION_TRUTH.map((entry) => [entry.canonicalStrategyId, entry]),
);

export const WHITE_SWAN_EXECUTION_SCENARIO_PROFILES = {
  WHITE_SWAN_IBKR_10K_USD_V1: WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1,
  WHITE_SWAN_IBKR_20K_USD_V1: {
    ...WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1,
    id: "WHITE_SWAN_IBKR_20K_USD_V1",
    accountEquity: 20_000,
  },
  WHITE_SWAN_IBKR_50K_USD_V1: {
    ...WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1,
    id: "WHITE_SWAN_IBKR_50K_USD_V1",
    accountEquity: 50_000,
  },
  WHITE_SWAN_IBKR_100K_USD_V1: {
    ...WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1,
    id: "WHITE_SWAN_IBKR_100K_USD_V1",
    accountEquity: 100_000,
  },
  WHITE_SWAN_IBKR_10K_EUR_V1: WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_EUR_V1,
} as const;

function getScenarioProfile(config: ScenarioConfig) {
  if (config.currency === "USD") {
    if (config.accountSize === 10_000) return WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1;
    if (config.accountSize === 20_000) return WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_20K_USD_V1;
    if (config.accountSize === 50_000) return WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_50K_USD_V1;
    if (config.accountSize === 100_000) return WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_100K_USD_V1;
    return {
      ...WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1,
      id: `WHITE_SWAN_IBKR_${Math.round(config.accountSize)}_USD_DYNAMIC_V1`,
      accountEquity: config.accountSize,
    };
  }

  if (config.accountSize === 10_000) return WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_10K_EUR_V1;
  return {
    ...WHITE_SWAN_EXECUTION_SCENARIO_PROFILES.WHITE_SWAN_IBKR_10K_EUR_V1,
    id: `WHITE_SWAN_IBKR_${Math.round(config.accountSize)}_EUR_DYNAMIC_V1`,
    accountEquity: config.accountSize,
  };
}

function toUsd(
  value: number | null,
  accountCurrency: "USD" | "EUR",
  fxRateEurUsd: number,
) {
  if (value == null) return null;
  return accountCurrency === "USD" ? value : Number((value * fxRateEurUsd).toFixed(2));
}

function chooseExistingMargin(
  entry: WhiteSwanExecutionEntry,
  accountCurrency: "USD" | "EUR",
) {
  const sizing = accountCurrency === "USD" ? entry.usd10k : entry.eur10k;
  return {
    initialMargin: sizing.initialMargin && sizing.initialMargin > 0 ? sizing.initialMargin : null,
    maintenanceMargin: sizing.maintenanceMargin && sizing.maintenanceMargin > 0 ? sizing.maintenanceMargin : null,
    minimumAccountRequired:
      sizing.minimumAccountRequired && sizing.minimumAccountRequired > 0
        ? sizing.minimumAccountRequired
        : null,
  };
}

function contractEquivalentRatio(entry: WhiteSwanExecutionEntry) {
  return CONTRACT_EQUIVALENT_RATIO[entry.ibkrSymbol as keyof typeof CONTRACT_EQUIVALENT_RATIO] ?? 1;
}

function classifyFromError(relativeExposureErrorPct: number): WhiteSwanExposureStatus {
  if (relativeExposureErrorPct <= EXACT_THRESHOLD_PCT) return "EXACT";
  if (relativeExposureErrorPct <= APPROXIMATE_THRESHOLD_PCT) return "APPROXIMATE";
  return "NOT_GRANULAR_ENOUGH";
}

function isSeasonalScalingRow(row: CapitalRequirementRecord) {
  return (
    row.historicalSizingMode === "one_standard_contract_calendar_pattern" ||
    row.historicalSizingMode === "one_share_calendar_pattern"
  );
}

function deriveReferenceCapital(row: CapitalRequirementRecord): {
  referenceCapitalUsd: number | null;
  policy: WhiteSwanExecutionTranslation["referenceCapitalPolicy"];
  label: string;
} {
  if (row.historicalReferenceCapitalUsd != null && row.historicalReferenceCapitalUsd > 0) {
    return {
      referenceCapitalUsd: row.historicalReferenceCapitalUsd,
      policy: "CANONICAL",
      label: "Canonical historical reference capital",
    };
  }

  if (
    row.historicalSizingMode === "fixed_risk_package_unit" &&
    row.capitalForWorstLossAt1Pct != null &&
    row.capitalForWorstLossAt1Pct > 0
  ) {
    return {
      referenceCapitalUsd: row.capitalForWorstLossAt1Pct,
      policy: "DERIVED_FROM_RISK_PACKAGE",
      label: "Derived from accepted 1% worst-loss package capital",
    };
  }

  if (row.capitalForWorstLossAt10Pct != null && row.capitalForWorstLossAt10Pct > 0) {
    return {
      referenceCapitalUsd: row.capitalForWorstLossAt10Pct,
      policy: "PROPOSED_EXECUTION_POLICY",
      label: "10% worst-trade reference normalization",
    };
  }

  return {
    referenceCapitalUsd: null,
    policy: "PROPOSED_EXECUTION_POLICY",
    label: "No fixed capital reference available",
  };
}

function deriveModelTargetBrokerQuantity(
  row: CapitalRequirementRecord,
  entry: WhiteSwanExecutionEntry,
  sleeveCapitalUsd: number,
  referenceCapitalUsd: number | null,
) {
  if (row.historicalSizingMode === "dynamic_equity_backtest") {
    const referenceQuantity = DYNAMIC_REFERENCE_QUANTITY[row.strategyId] ?? 0;
    const scale =
      referenceCapitalUsd != null && referenceCapitalUsd > 0
        ? sleeveCapitalUsd / referenceCapitalUsd
        : 0;
    const scaledBrokerQuantity = referenceQuantity * scale;
    return {
      historicalReferenceUnits: 1,
      historicalQuantityAtSignal: referenceQuantity,
      scenarioScaledQuantityTarget: Number(scaledBrokerQuantity.toFixed(6)),
      modelTargetBrokerQuantity: Number(scaledBrokerQuantity.toFixed(6)),
      referenceSizingBasis: "dynamic_equity_backtest_100k_scaled",
    };
  }

  if (
    row.historicalSizingMode === "fixed_risk_package_unit" &&
    typeof row.plannedRiskPerReferenceUnit === "number" &&
    row.plannedRiskPerReferenceUnit > 0
  ) {
    const riskPerMinUnit =
      (entry.usd10k.riskPerMinimumUnit && entry.usd10k.riskPerMinimumUnit > 0
        ? entry.usd10k.riskPerMinimumUnit
        : entry.eur10k.riskPerMinimumUnit) ?? 0;
    const scale =
      referenceCapitalUsd != null && referenceCapitalUsd > 0
        ? sleeveCapitalUsd / referenceCapitalUsd
        : 0;
    const canonicalPackageUnit =
      entry.ibkrSymbol === "M6E" && row.minimumBrokerExecutableUnit != null && row.minimumBrokerExecutableUnit > 0
        ? row.minimumBrokerExecutableUnit
        : entry.minimumQuantity ?? 1;
    const referenceBrokerQuantity =
      riskPerMinUnit > 0
        ? (row.plannedRiskPerReferenceUnit / riskPerMinUnit) * canonicalPackageUnit
        : 0;
    return {
      historicalReferenceUnits: 1,
      historicalQuantityAtSignal: Number(referenceBrokerQuantity.toFixed(6)),
      scenarioScaledQuantityTarget: Number((row.modelReferenceUnits * scale).toFixed(6)),
      modelTargetBrokerQuantity: Number((referenceBrokerQuantity * row.modelReferenceUnits * scale).toFixed(6)),
      referenceSizingBasis: "fixed_risk_package_scaled",
    };
  }

  const scale =
    referenceCapitalUsd != null && referenceCapitalUsd > 0
      ? sleeveCapitalUsd / referenceCapitalUsd
      : 0;
  const standardEquivalentQuantity = row.modelReferenceUnits * scale;
  const brokerQuantity = standardEquivalentQuantity / contractEquivalentRatio(entry);
  return {
    historicalReferenceUnits: row.historicalReferenceQuantity === "NOT_FIXED" ? 1 : Number(row.historicalReferenceQuantity ?? 1),
    historicalQuantityAtSignal:
      row.historicalReferenceQuantity === "NOT_FIXED"
        ? null
        : Number(row.historicalReferenceQuantity ?? 1),
    scenarioScaledQuantityTarget: Number(standardEquivalentQuantity.toFixed(6)),
    modelTargetBrokerQuantity: Number(brokerQuantity.toFixed(6)),
    referenceSizingBasis:
      row.historicalSizingMode === "one_share_calendar_pattern"
        ? "one_share_calendar_pattern_scaled"
        : "one_standard_contract_calendar_pattern_scaled",
  };
}

function getReferenceExposureUnit(entry: WhiteSwanExecutionEntry) {
  if (entry.ibkrSymbol === "M6E") return "EUR_NOTIONAL";
  if (entry.signalInstrument === "SPY") return "USD_EQUITY_NOTIONAL";
  if (entry.signalInstrument === "IWM") return "USD_EQUITY_NOTIONAL";
  if (entry.signalInstrument === "EEM") return "USD_EQUITY_NOTIONAL";
  if (entry.signalInstrument === "GLD") return "USD_GOLD_NOTIONAL";
  if (entry.assetClass === "future") {
    if (entry.ibkrSymbol === "FDXS") return "FDAX_EQUIVALENT";
    if (entry.ibkrSymbol === "MYM") return "YM_EQUIVALENT";
    if (entry.ibkrSymbol === "MES") return "SPX_FUTURES_EQUIVALENT";
    if (entry.ibkrSymbol === "M2K") return "RUSSELL2000_FUTURES_EQUIVALENT";
    if (entry.ibkrSymbol === "MME") return "MSCI_EM_INDEX_FUTURES_EQUIVALENT";
    if (entry.ibkrSymbol === "MGC" || entry.ibkrSymbol === "1OZ") return "GC_EQUIVALENT";
    if (entry.ibkrSymbol === "MCL") return "CL_EQUIVALENT";
    if (entry.ibkrSymbol === "MZC") return "ZC_EQUIVALENT";
    if (entry.ibkrSymbol === "MZW") return "ZW_EQUIVALENT";
    if (entry.ibkrSymbol === "MZS") return "ZS_EQUIVALENT";
    if (entry.ibkrSymbol === "MZM") return "ZM_EQUIVALENT";
    if (entry.ibkrSymbol === "MHG") return "HG_EQUIVALENT";
    if (entry.ibkrSymbol === "CC") return "CC_CONTRACTS";
    if (entry.ibkrSymbol === "SB") return "SB_CONTRACTS";
  }
  return "REFERENCE_UNITS";
}

function getCandidateExposurePerBrokerUnit(entry: WhiteSwanExecutionEntry) {
  if (entry.ibkrSymbol === "M6E") return 12_500;
  return contractEquivalentRatio(entry);
}

function getReferenceUnit(entry: WhiteSwanExecutionEntry, row: CapitalRequirementRecord) {
  if (entry.ibkrSymbol === "M6E") return "EUR_NOTIONAL";
  if (entry.signalInstrument === "SPY") return "SPY_SHARE";
  if (entry.signalInstrument === "IWM") return "IWM_SHARE";
  if (entry.signalInstrument === "EEM") return "EEM_SHARE";
  if (entry.signalInstrument === "GLD") return "GLD_SHARE";
  if (row.historicalReferenceUnit?.includes("GC1!")) return "GC_STANDARD_CONTRACT";
  if (row.historicalReferenceUnit?.includes("FDAX1!")) return "FDAX_STANDARD_CONTRACT";
  if (row.historicalReferenceUnit?.includes("YM1!")) return "YM_STANDARD_CONTRACT";
  return "REFERENCE_UNIT";
}

function getFutureContractExposureUnit(entry: WhiteSwanExecutionEntry) {
  if (entry.ibkrSymbol === "M6E") return "M6E_CONTRACT";
  if (entry.ibkrSymbol === "MES") return "MES_CONTRACT";
  if (entry.ibkrSymbol === "M2K") return "M2K_CONTRACT";
  if (entry.ibkrSymbol === "MME") return "MME_CONTRACT";
  if (entry.ibkrSymbol === "1OZ") return "ONE_OUNCE_GOLD_FUTURE";
  if (entry.ibkrSymbol === "FDXS") return "FDXS_CONTRACT";
  if (entry.ibkrSymbol === "MYM") return "MYM_CONTRACT";
  if (entry.ibkrSymbol === "MZM") return "MZM_CONTRACT";
  if (entry.ibkrSymbol === "MHG") return "MHG_CONTRACT";
  if (entry.ibkrSymbol === "MCL") return "MCL_CONTRACT";
  if (entry.ibkrSymbol === "MZC") return "MZC_CONTRACT";
  if (entry.ibkrSymbol === "MZW") return "MZW_CONTRACT";
  if (entry.ibkrSymbol === "MZS") return "MZS_CONTRACT";
  if (entry.ibkrSymbol === "CC") return "CC_CONTRACT";
  if (entry.ibkrSymbol === "SB") return "SB_CONTRACT";
  return "FUTURE_CONTRACT";
}

function isShareToFutureConversion(entry: WhiteSwanExecutionEntry) {
  return entry.signalInstrument === "SPY" || entry.signalInstrument === "IWM" || entry.signalInstrument === "EEM" || entry.signalInstrument === "GLD";
}

function roundBrokerQuantity(
  entry: WhiteSwanExecutionEntry,
  targetBrokerQuantity: number,
) {
  if (!Number.isFinite(targetBrokerQuantity) || targetBrokerQuantity <= 0) {
    return { floorQty: 0, ceilQty: 0 };
  }
  if (entry.fractionalEligible) {
    const rounded = Number(targetBrokerQuantity.toFixed(6));
    return { floorQty: rounded, ceilQty: rounded };
  }
  const step = entry.quantityStep ?? entry.minimumQuantity ?? 1;
  const minQty = entry.minimumQuantity ?? step;
  const floorRaw = Math.floor(targetBrokerQuantity / step) * step;
  const ceilRaw = Math.ceil(targetBrokerQuantity / step) * step;
  const floorQty = floorRaw >= minQty ? floorRaw : 0;
  const ceilQty = ceilRaw >= minQty ? ceilRaw : minQty;
  return { floorQty, ceilQty };
}

function convertExecutionStatus(status: WhiteSwanExecutionScenarioStatus) {
  if (status === "EXACTLY_EXECUTABLE") return "EXECUTION_EXACT" as const;
  if (status === "APPROXIMATELY_EXECUTABLE") return "EXECUTION_APPROXIMATE" as const;
  if (status === "DATA_PENDING") return "EXECUTION_DATA_PENDING" as const;
  return "NOT_GRANULAR" as const;
}

export function resolveWhiteSwanExecutionTranslation(
  row: CapitalRequirementRecord,
  config: ScenarioConfig,
  sleeveCapitalUsd: number,
  effectiveTotalAccountWeightPct: number,
): WhiteSwanExecutionTranslation | null {
  const entry = ENTRY_BY_ID.get(row.strategyId);
  if (!entry) return null;

  const profile = getScenarioProfile(config);
  const referenceCapital = deriveReferenceCapital(row);
  const model = deriveModelTargetBrokerQuantity(row, entry, sleeveCapitalUsd, referenceCapital.referenceCapitalUsd);

  const routeMinimumQuantity = entry.minimumQuantity;
  const actualQuantityStep = entry.assetClass === "fx" && entry.ibkrSymbol === "EUR"
    ? null
    : (entry.quantityStep ?? entry.minimumQuantity ?? null);
  const quantityStepStatus =
    entry.assetClass === "fx" && entry.ibkrSymbol === "EUR" ? "DATA_PENDING" : "RESOLVED";
  const oddLotEligibility =
    entry.assetClass === "fx" && entry.ibkrSymbol === "EUR"
      ? "Below IDEALPRO minimum may route as odd lot; production leveraged path not yet validated."
      : null;
  const routeType =
    entry.assetClass === "fx" && entry.ibkrSymbol === "EUR"
      ? "IDEALPRO_OR_ODD_LOT_UNVERIFIED"
      : entry.assetClass === "etf"
        ? "SMART_STK_OR_FRACTIONAL_STK"
        : "DIRECT_FUTURES";

  const roundingEntry =
    entry.assetClass === "fx" && entry.ibkrSymbol === "EUR"
      ? { ...entry, quantityStep: 1, minimumQuantity: 1 }
      : entry;

  const markSnapshot = getWhiteSwanMarkSnapshot(entry);
  const markPriceRaw = markSnapshot.price > 0 ? Number(markSnapshot.price.toFixed(6)) : null;
  const priceStatus =
    markPriceRaw == null
      ? "DATA_PENDING"
      : markSnapshot.source.includes("runtime") ? "LIVE" : "SNAPSHOT";
  const referenceUnit = getReferenceUnit(entry, row);
  const referenceExposureUnit = getReferenceExposureUnit(entry);
  const futureContractExposureUnit = getFutureContractExposureUnit(entry);
  const signalBenchmark =
    entry.signalInstrument === "EEM" ? "MSCI Emerging Markets Index (Net)" :
    entry.signalInstrument === "SPY" ? "S&P 500 via SPY ETF" :
    entry.signalInstrument === "IWM" ? "Russell 2000 via IWM ETF" :
    entry.signalInstrument === "GLD" ? "Gold via GLD ETF" :
    entry.signalInstrument === "EURUSD" ? "EUR/USD FX rate" :
    null;
  const executionBenchmark =
    entry.ibkrSymbol === "MME" ? "MSCI Emerging Markets Index (Price)" :
    entry.ibkrSymbol === "MES" ? "S&P 500 futures index notional" :
    entry.ibkrSymbol === "M2K" ? "Russell 2000 futures index notional" :
    entry.ibkrSymbol === "1OZ" && entry.signalInstrument === "GLD" ? "1-ounce COMEX gold future" :
    entry.ibkrSymbol === "M6E" ? "EUR notional per M6E contract" :
    null;
  const benchmarkMethodologyMismatch =
    entry.signalInstrument === "EEM"
      ? "EEM benchmark = MSCI Emerging Markets Index (Net); MME future = MSCI Emerging Markets price index future."
      : null;
  const executionFidelityStatus =
    entry.signalInstrument === "EEM"
      ? "APPROXIMATE_MAPPING"
      : "FAITHFUL_MAPPING";

  let modelReferenceQty: number | null = model.modelTargetBrokerQuantity;
  let economicExposureUnit = referenceExposureUnit;
  let economicExposure: number | null = model.modelTargetBrokerQuantity;
  let futureUnitExposure: number | null = null;
  let idealFutureQty: number | null = null;
  let candidateExposurePerBrokerUnit = getCandidateExposurePerBrokerUnit(entry);

  if (entry.ibkrSymbol === "M6E") {
    modelReferenceQty = model.modelTargetBrokerQuantity;
    economicExposureUnit = "EUR_NOTIONAL";
    economicExposure = model.modelTargetBrokerQuantity;
    futureUnitExposure = 12_500;
    idealFutureQty = economicExposure != null ? Number((economicExposure / futureUnitExposure).toFixed(6)) : null;
    candidateExposurePerBrokerUnit = futureUnitExposure;
  } else if (isShareToFutureConversion(entry)) {
    modelReferenceQty = model.modelTargetBrokerQuantity;
    economicExposureUnit = entry.signalInstrument === "GLD" ? "USD_GOLD_NOTIONAL" : "USD_EQUITY_NOTIONAL";
    economicExposure =
      modelReferenceQty != null && markPriceRaw != null
        ? Number((modelReferenceQty * markPriceRaw).toFixed(6))
        : null;
    futureUnitExposure = null;
    idealFutureQty = null;
    candidateExposurePerBrokerUnit = 0;
  } else {
    const standardEquivalentQty = Number(
      (model.modelTargetBrokerQuantity * contractEquivalentRatio(entry)).toFixed(6),
    );
    modelReferenceQty = standardEquivalentQty;
    economicExposureUnit = referenceExposureUnit;
    economicExposure = standardEquivalentQty;
    futureUnitExposure = contractEquivalentRatio(entry);
    idealFutureQty = model.modelTargetBrokerQuantity;
    candidateExposurePerBrokerUnit = futureUnitExposure;
  }

  const roundedTargetQty = idealFutureQty ?? 0;
  const roundedCandidates = roundBrokerQuantity(roundingEntry, roundedTargetQty);
  const floorExposure =
    economicExposure != null && futureUnitExposure != null
      ? Number((roundedCandidates.floorQty * futureUnitExposure).toFixed(6))
      : 0;
  const ceilExposure =
    economicExposure != null && futureUnitExposure != null
      ? Number((roundedCandidates.ceilQty * futureUnitExposure).toFixed(6))
      : 0;

  const floorErrorPct =
    economicExposure != null && economicExposure > 0
      ? (Math.abs(floorExposure - economicExposure) / economicExposure) * 100
      : 100;
  const ceilErrorPct =
    economicExposure != null && economicExposure > 0
      ? (Math.abs(ceilExposure - economicExposure) / economicExposure) * 100
      : 100;

  const preferCeil = roundedCandidates.ceilQty > 0 && ceilErrorPct < floorErrorPct;
  const brokerQuantity = idealFutureQty == null ? 0 : preferCeil ? roundedCandidates.ceilQty : roundedCandidates.floorQty;
  const brokerExposureInReferenceUnits =
    economicExposure != null && futureUnitExposure != null
      ? Number((brokerQuantity * futureUnitExposure).toFixed(6))
      : 0;
  const absoluteExposureError = Number(
    ((economicExposure == null ? 0 : brokerExposureInReferenceUnits - economicExposure)).toFixed(6),
  );
  const relativeExposureErrorPct =
    economicExposure != null && economicExposure > 0
      ? Number(
          (
            (Math.abs(brokerExposureInReferenceUnits - economicExposure) /
              economicExposure) *
            100
          ).toFixed(4),
        )
      : 100;

  const conversionDataPending =
    model.modelTargetBrokerQuantity > 0 &&
    (economicExposure == null || futureUnitExposure == null || idealFutureQty == null);
  const exposureStatus =
    conversionDataPending
      ? "NOT_GRANULAR_ENOUGH"
      : classifyFromError(relativeExposureErrorPct);
  const markPrice = brokerQuantity > 0 ? markPriceRaw : markPriceRaw;
  const existingMargin =
    entry.assetClass === "fx"
      ? { initialMargin: null, maintenanceMargin: null, minimumAccountRequired: null }
      : chooseExistingMargin(entry, profile.accountCurrency);
  const positionNotionalAccountCurrency =
    brokerQuantity > 0 && markPrice != null
      ? Number(
          (
            brokerQuantity * markPrice * (entry.assetClass === "future" ? (entry.multiplier ?? 1) : 1)
          ).toFixed(2),
        )
      : 0;
  const quoteNotional = positionNotionalAccountCurrency;
  const cashRequired =
    brokerQuantity > 0
      ? Number((quoteNotional + (entry.assetClass === "future" ? 0 : 1)).toFixed(2))
      : null;
  const fallbackMargin = null;
  const initialMargin =
    entry.assetClass === "etf"
      ? null
      : existingMargin.initialMargin ?? fallbackMargin;
  const maintenanceMargin =
    entry.assetClass === "etf"
      ? null
      : existingMargin.maintenanceMargin ??
        (initialMargin != null ? Number((initialMargin * 0.9).toFixed(2)) : null);

  const marginSourceType: WhiteSwanExecutionTranslation["marginSourceType"] =
    existingMargin.initialMargin != null
      ? "IBKR_OFFICIAL_TABLE"
      : fallbackMargin != null
        ? "EXCHANGE_REFERENCE"
        : "UNAVAILABLE";
  const marginConfidence: WhiteSwanMarginConfidence =
    entry.assetClass !== "etf" && existingMargin.initialMargin != null
      ? "OFFICIAL_REFERENCE"
      : "DATA_PENDING";
  const marginTimestamp = existingMargin.initialMargin != null ? entry.primarySource.retrievedAtUtc : null;
  const marginCurrency = initialMargin != null ? profile.accountCurrency : null;
  const marginPct =
    initialMargin != null && quoteNotional > 0
      ? Number(((initialMargin / quoteNotional) * 100).toFixed(4))
      : null;
  const marginUtilizationPct =
    initialMargin != null && profile.accountEquity > 0
      ? Number(((initialMargin / profile.accountEquity) * 100).toFixed(2))
      : null;
  const remainingCashAfterMargin =
    initialMargin != null ? Number((profile.accountEquity - initialMargin).toFixed(2)) : null;
  const freeCashPct =
    remainingCashAfterMargin != null && profile.accountEquity > 0
      ? Number(((remainingCashAfterMargin / profile.accountEquity) * 100).toFixed(2))
      : null;

  let marginStatus: WhiteSwanMarginStatus = "NOT_APPLICABLE";
  let capitalAffordabilityStatus: WhiteSwanCapitalAffordabilityStatus = "NOT_APPLICABLE";
  if (brokerQuantity > 0 && exposureStatus !== "NOT_GRANULAR_ENOUGH") {
    if (entry.assetClass === "future" || entry.assetClass === "fx") {
      marginStatus =
        initialMargin == null
          ? "DATA_PENDING"
          : marginUtilizationPct != null &&
              marginUtilizationPct > WHITE_SWAN_EXECUTION_SCALING_POLICY_V1.maxMarginUtilizationPct
            ? "BLOCKED"
            : "PASS";
      capitalAffordabilityStatus = marginStatus === "BLOCKED" ? "BLOCKED" : marginStatus === "PASS" ? "PASS" : "DATA_PENDING";
    } else {
      marginStatus = "NOT_APPLICABLE";
      capitalAffordabilityStatus =
        cashRequired == null
          ? "DATA_PENDING"
          : cashRequired > profile.accountEquity
            ? "BLOCKED"
            : "PASS";
    }
  }

  let brokerAvailabilityStatus: WhiteSwanBrokerAvailabilityStatus = "AVAILABLE";
  if (entry.assetClass === "fx" && entry.ibkrSymbol === "EUR") {
    brokerAvailabilityStatus = quantityStepStatus === "DATA_PENDING" ? "DATA_PENDING" : "AVAILABLE";
  } else if (entry.productionInstrument === "TCL") {
    brokerAvailabilityStatus = "FUTURE_PRODUCT_PENDING_LAUNCH";
  } else if (
    entry.assetClass === "etf" &&
    brokerQuantity > 0 &&
    !Number.isInteger(brokerQuantity)
  ) {
    brokerAvailabilityStatus = "DATA_PENDING";
  }

  const brokerOrderStatus: WhiteSwanBrokerOrderStatus =
    brokerQuantity <= 0 || exposureStatus === "NOT_GRANULAR_ENOUGH"
      ? "NOT_APPLICABLE"
      : brokerAvailabilityStatus === "DATA_PENDING"
        ? "DATA_PENDING"
        : "PASS";

  let finalExecutionStatus: WhiteSwanExecutionScenarioStatus;
  let statusReason: string;

  if (referenceCapital.referenceCapitalUsd == null) {
    finalExecutionStatus = "DATA_PENDING";
    statusReason = "NO_REFERENCE_CAPITAL_BASIS";
  } else if (model.modelTargetBrokerQuantity <= 0) {
    finalExecutionStatus = "NOT_GRANULAR_ENOUGH";
    statusReason = "TARGET_EXPOSURE_BELOW_MINIMUM_BROKER_STEP";
  } else if (conversionDataPending) {
    finalExecutionStatus = "DATA_PENDING";
    statusReason = "ECONOMIC_TO_FUTURES_CONVERSION_DATA_PENDING";
  } else if (exposureStatus === "NOT_GRANULAR_ENOUGH" || brokerQuantity <= 0) {
    finalExecutionStatus = "NOT_GRANULAR_ENOUGH";
    statusReason = "EXPOSURE_GRANULARITY_REJECTED_BEFORE_MARGIN";
  } else if (capitalAffordabilityStatus === "BLOCKED") {
    finalExecutionStatus = "MARGIN_BLOCKED";
    statusReason = entry.assetClass === "etf" ? "CASH_REQUIRED_EXCEEDS_SLEEVE_CAPITAL" : "INITIAL_MARGIN_EXCEEDS_SLEEVE_CAPITAL";
  } else if (
    brokerAvailabilityStatus === "DATA_PENDING" ||
    quantityStepStatus === "DATA_PENDING"
  ) {
    finalExecutionStatus = "DATA_PENDING";
    statusReason = "BROKER_ROUTE_OR_STEP_NOT_YET_VERIFIED";
  } else if (marginStatus === "DATA_PENDING") {
    finalExecutionStatus = "DATA_PENDING";
    statusReason = "MARGIN_DATA_MISSING_FOR_NONZERO_BROKER_QTY";
  } else if (marginStatus === "BLOCKED") {
    finalExecutionStatus = "MARGIN_BLOCKED";
    statusReason = "INITIAL_MARGIN_EXCEEDS_PROPOSED_MAX_UTILIZATION";
  } else {
    finalExecutionStatus =
      exposureStatus === "EXACT"
        ? "EXACTLY_EXECUTABLE"
        : exposureStatus === "APPROXIMATE"
          ? "APPROXIMATELY_EXECUTABLE"
          : "NOT_GRANULAR_ENOUGH";
    statusReason =
      finalExecutionStatus === "EXACTLY_EXECUTABLE"
        ? "EXECUTION_ERROR_WITHIN_EXACT_THRESHOLD"
        : finalExecutionStatus === "APPROXIMATELY_EXECUTABLE"
          ? "EXECUTION_ERROR_WITHIN_APPROXIMATE_THRESHOLD"
          : "EXECUTION_ERROR_EXCEEDS_APPROXIMATION_THRESHOLD";
  }

  const minimumAccountForAnyFaithfulExecutionUsd =
    model.modelTargetBrokerQuantity > 0 &&
    brokerQuantity > 0 &&
    (initialMargin != null || cashRequired != null)
      ? Number(
          Math.max(
            (brokerQuantity / model.modelTargetBrokerQuantity) * sleeveCapitalUsd,
            toUsd(initialMargin ?? cashRequired, profile.accountCurrency, profile.fxRateEurUsd) ?? 0,
          ).toFixed(2),
        )
      : null;

  const minimumAccountForApproximateExecutionUsd =
    finalExecutionStatus === "NOT_GRANULAR_ENOUGH" || initialMargin == null
      ? minimumAccountForAnyFaithfulExecutionUsd
      : toUsd(initialMargin, profile.accountCurrency, profile.fxRateEurUsd);

  const minimumAccountForExactExecutionUsd =
    finalExecutionStatus === "EXACTLY_EXECUTABLE"
      ? toUsd(initialMargin ?? cashRequired, profile.accountCurrency, profile.fxRateEurUsd)
      : null;
  const minimumAccountForBrokerExecutionUsd = toUsd(initialMargin ?? cashRequired, profile.accountCurrency, profile.fxRateEurUsd);
  const minimumAccountForBrokerExecutionVerifiedUsd = null;

  const executableHistoricalLossImpactUsd =
    row.largestReliableLossUsd != null
      ? Number(
          (row.largestReliableLossUsd * brokerExposureInReferenceUnits).toFixed(2),
        )
      : null;

  return {
    profileId: profile.id,
    accountCurrency: profile.accountCurrency,
    accountEquity: profile.accountEquity,
    whiteSwanSleeveCapital: Number(sleeveCapitalUsd.toFixed(2)),
    internalWeightPct: row.portfolioWeightPct,
    effectiveTotalAccountWeightPct,
    capitalScalingPolicy: WHITE_SWAN_EXECUTION_SCALING_POLICY_V1.id,
    referenceSizingBasis: model.referenceSizingBasis,
    referenceCapitalUsd: referenceCapital.referenceCapitalUsd,
    referenceCapitalPolicy: referenceCapital.policy,
    referenceCapitalPolicyLabel: referenceCapital.label,
    historicalReferenceUnits: model.historicalReferenceUnits,
    historicalQuantityAtSignal: model.historicalQuantityAtSignal,
    scenarioScaledQuantityTarget: model.scenarioScaledQuantityTarget,
    referenceUnit,
    modelReferenceQty,
    referenceExposureUnit,
    modelExposureInReferenceUnits: economicExposure ?? 0,
    economicExposureUnit,
    economicExposure,
    candidateExposurePerBrokerUnit,
    futureContractExposureUnit,
    futureUnitExposure,
    brokerExposureInReferenceUnits,
    modelTargetExposure: economicExposure ?? 0,
    modelTargetBrokerQuantity: modelReferenceQty ?? 0,
    idealFutureQty,
    selectedInstrument: entry.executionInstrument,
    selectedIbkrSymbol: entry.ibkrSymbol,
    selectedSecType: entry.secType,
    selectedExchange: entry.exchange,
    signalBenchmark,
    executionBenchmark,
    benchmarkMethodologyMismatch,
    executionFidelityStatus,
    brokerQuantity,
    candidateFloorQuantity: roundedCandidates.floorQty,
    candidateCeilQuantity: roundedCandidates.ceilQty,
    candidateUnitExposureRatio: candidateExposurePerBrokerUnit,
    executableExposure: brokerExposureInReferenceUnits,
    absoluteExposureError,
    relativeExposureErrorPct,
    routeMinimumQuantity,
    actualQuantityStep,
    quantityStepStatus,
    routeType,
    oddLotEligibility,
    accountEntityAssumption:
      entry.assetClass === "fx"
        ? "IBKR margin account, intended leveraged FX route, exact entity/profile still not locked"
        : entry.assetClass === "etf"
          ? "Cash-account affordability evaluated locally; fractional eligibility and exact IBKR entity still unverified"
          : "IBKR non-IRA margin account assumption",
    markPrice,
    priceInstrument: entry.signalInstrument,
    priceTimestamp: markSnapshot.asOfUtc || null,
    priceSource: markSnapshot.source || null,
    priceStatus,
    positionNotionalAccountCurrency,
    cashRequired,
    initialMargin,
    maintenanceMargin,
    marginSourceType,
    marginConfidence,
    marginTimestamp,
    marginCurrency,
    marginPct,
    marginUtilizationPct,
    remainingCashAfterMargin,
    freeCashPct,
    historicalLossReferenceUsd: row.largestReliableLossUsd,
    executableHistoricalLossImpactUsd,
    minimumAccountForAnyFaithfulExecutionUsd,
    minimumAccountForApproximateExecutionUsd,
    minimumAccountForExactExecutionUsd,
    minimumAccountForBrokerExecutionUsd,
    minimumAccountForBrokerExecutionVerifiedUsd,
    brokerAvailabilityStatus,
    brokerOrderStatus,
    exposureStatus,
    marginStatus,
    capitalAffordabilityStatus,
    finalExecutionStatus,
    status: finalExecutionStatus,
    statusReason,
    sourceUrl: entry.primarySource.sourceUrl,
    sourceType: entry.primarySource.sourceType,
    retrievedAtUtc: entry.primarySource.retrievedAtUtc,
  };
}

export function mapExecutionTranslationToFeasibility(
  translation: WhiteSwanExecutionTranslation | null,
) {
  return translation ? convertExecutionStatus(translation.finalExecutionStatus) : ("EXECUTION_DATA_PENDING" as const);
}

export function buildWhiteSwanExecutionMatrix(
  rows: CapitalRequirementRecord[],
  whiteSwanPct = 100,
) {
  const configs: ScenarioConfig[] = [
    { mode: "white-swan", accountSize: 10_000, currency: "USD", whiteSwanPct, coreInvestPct: 0, range: "MAX" },
    { mode: "white-swan", accountSize: 20_000, currency: "USD", whiteSwanPct, coreInvestPct: 0, range: "MAX" },
    { mode: "white-swan", accountSize: 50_000, currency: "USD", whiteSwanPct, coreInvestPct: 0, range: "MAX" },
    { mode: "white-swan", accountSize: 100_000, currency: "USD", whiteSwanPct, coreInvestPct: 0, range: "MAX" },
    { mode: "white-swan", accountSize: 10_000, currency: "EUR", whiteSwanPct, coreInvestPct: 0, range: "MAX" },
  ];

  return configs.map((config) => {
    const sleeveCapitalUsd =
      config.currency === "USD"
        ? config.accountSize * (whiteSwanPct / 100)
        : config.accountSize *
          WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_EUR_V1.fxRateEurUsd *
          (whiteSwanPct / 100);
    return {
      profileId: getScenarioProfile(config).id,
      accountSize: config.accountSize,
      currency: config.currency,
      rows: rows
        .map((row) =>
          resolveWhiteSwanExecutionTranslation(
            row,
            config,
            sleeveCapitalUsd,
            Number((row.portfolioWeightPct * (whiteSwanPct / 100)).toFixed(4)),
          ),
        )
        .filter((row): row is WhiteSwanExecutionTranslation => row !== null),
    };
  });
}
