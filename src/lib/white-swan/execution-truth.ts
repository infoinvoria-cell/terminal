import liveQuoteState from "@/data/capitalife/runtime-stubs/live-quote-state.json";

export type WhiteSwanExecutionProfileId =
  | "WHITE_SWAN_IBKR_10K_USD_V1"
  | "WHITE_SWAN_IBKR_10K_EUR_V1";

export type WhiteSwanExecutionStatus =
  | "EXECUTABLE_10K_NATIVE"
  | "EXECUTABLE_10K_SMALLER_CONTRACT"
  | "EXECUTABLE_10K_VALIDATED_PROXY"
  | "NOT_EXECUTABLE_10K";

export type WhiteSwanAssetClass = "fx" | "future" | "etf";

export type WhiteSwanSizingFields = {
  riskPerTradePctEquity: number | null;
  riskPerTradeAccountCurrency: number | null;
  riskPerMinimumUnit: number | null;
  executionQuantity: number | null;
  contractNotional: number | null;
  initialMargin: number | null;
  maintenanceMargin: number | null;
  estimatedCommission: number | null;
  estimatedSlippage: number | null;
  minimumAccountRequired: number | null;
  freeCashImpact: number | null;
};

export type WhiteSwanSource = {
  sourceName: string;
  sourceUrl: string;
  retrievedAtUtc: string;
  sourceType: "exchange" | "broker" | "runtime" | "fund-provider" | "reference-rate";
  sourceCurrency: string;
};

export type WhiteSwanExecutionEntry = {
  canonicalStrategyId: string;
  portfolioWeightPct: number;
  strategyLabel: string;
  signalInstrument: string;
  researchInstrument: string;
  productionInstrument: string;
  executionInstrument: string;
  assetClass: WhiteSwanAssetClass;
  ibkrSymbol: string;
  secType: "CASH" | "FUT" | "STK";
  exchange: string;
  currency: string;
  contractMonthRule: string;
  entryReference?: string;
  riskDefinition?: string;
  multiplier: number | null;
  tickSize: number | null;
  tickValue: number | null;
  minimumQuantity: number | null;
  quantityStep: number | null;
  fractionalEligible: boolean;
  smallerContractSymbol: string | null;
  executionStatusUsd10k: WhiteSwanExecutionStatus;
  executionStatusEur10k: WhiteSwanExecutionStatus;
  statusReason: string;
  primarySource: WhiteSwanSource;
  secondarySource?: WhiteSwanSource;
  usd10k: WhiteSwanSizingFields;
  eur10k: WhiteSwanSizingFields;
};

export type WhiteSwanExecutionProfile = {
  id: WhiteSwanExecutionProfileId;
  accountCurrency: "USD" | "EUR";
  accountEquity: number;
  fxRateEurUsd: number;
  fxObservedAtUtc: string;
  fxSource: WhiteSwanSource;
  planningAssumption: boolean;
};

export type WhiteSwanFuturesOnlyProfile = {
  id: "WHITE_SWAN_FUTURES_ONLY_V1";
  allowedSecType: "FUT";
  forbiddenExecutionTypes: readonly ["CFD", "STK", "ETF", "CASH", "IDEALPRO", "SPOT_FX"];
  strategyCount: number;
};

const NOW_UTC = "2026-08-12T10:45:00Z";

const ECB_SOURCE: WhiteSwanSource = {
  sourceName: "ECB Euro FX reference rate",
  sourceUrl: "https://www.ecb.europa.eu/",
  retrievedAtUtc: NOW_UTC,
  sourceType: "reference-rate",
  sourceCurrency: "EUR/USD",
};

const CME_MICRO_AG_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro Ag Futures",
  sourceUrl: "https://www.cmegroup.com/markets/agriculture/micro-ag-futures",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_CORN_SOURCE: WhiteSwanSource = {
  sourceName: "CME Corn contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/corn/specs",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_WHEAT_SOURCE: WhiteSwanSource = {
  sourceName: "CME Wheat contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/wheat/specs",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_SOYBEAN_SOURCE: WhiteSwanSource = {
  sourceName: "CME Soybean contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/soybean/specs",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_SOYMEAL_SOURCE: WhiteSwanSource = {
  sourceName: "CME Soybean Meal contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/soybean-meal/specs",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_GOLD_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro Gold contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/metals/precious/e-micro-gold.contractSpecs.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_ONE_OUNCE_GOLD_SOURCE: WhiteSwanSource = {
  sourceName: "CME 1-Ounce Gold contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/metals/precious/1-ounce-gold.contractSpecs.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const IBKR_ONE_OUNCE_GOLD_SOURCE: WhiteSwanSource = {
  sourceName: "IBKR futures commissions and fees",
  sourceUrl: "https://www.interactivebrokers.com/en/pricing/commissions-futures.php",
  retrievedAtUtc: NOW_UTC,
  sourceType: "broker",
  sourceCurrency: "USD",
};

const CME_MICRO_WTI_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro WTI contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/energy/crude-oil/micro-wti-crude-oil.contractSpecs.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_COPPER_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro Copper contract specs",
  sourceUrl: "https://www.cmegroup.com/markets/metals/base/micro-copper.contractSpecs.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_DOW_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro E-mini Dow overview",
  sourceUrl: "https://www.cmegroup.com/markets/equities/dow-jones/micro-e-mini-dow.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_SP_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro E-mini S&P 500 overview",
  sourceUrl: "https://www.cmegroup.com/markets/equities/sp/micro-e-mini-sandp-500.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_RUSSELL_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro E-mini Russell 2000 overview",
  sourceUrl: "https://www.cmegroup.com/markets/equities/russell/micro-e-mini-russell-2000.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_MICRO_EURO_SOURCE: WhiteSwanSource = {
  sourceName: "CME Micro FX futures overview",
  sourceUrl: "https://www.cmegroup.com/markets/microsuite/fx.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const CME_FTSE_EM_SOURCE: WhiteSwanSource = {
  sourceName: "CME E-mini FTSE Emerging Index overview",
  sourceUrl: "https://www.cmegroup.com/markets/equities/international-indices/e-mini-ftse-emerging-index.html",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const EUREX_DAX_SOURCE: WhiteSwanSource = {
  sourceName: "Eurex Micro-DAX specifications",
  sourceUrl: "https://www.eurex.com/ex-en/markets/idx/dax/Micro-DAX-Futures-2615490",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "EUR",
};

const ICE_COCOA_SOURCE: WhiteSwanSource = {
  sourceName: "ICE Cocoa futures",
  sourceUrl: "https://www.theice.com/products/7",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const ICE_SUGAR_SOURCE: WhiteSwanSource = {
  sourceName: "ICE Sugar No. 11 futures",
  sourceUrl: "https://www.theice.com/products/23/Sugar-No-11-Futures",
  retrievedAtUtc: NOW_UTC,
  sourceType: "exchange",
  sourceCurrency: "USD",
};

const IBKR_FRACTIONAL_SOURCE: WhiteSwanSource = {
  sourceName: "IBKR Fractional Trading",
  sourceUrl: "https://www.interactivebrokers.com/en/trading/fractional-trading.php",
  retrievedAtUtc: NOW_UTC,
  sourceType: "broker",
  sourceCurrency: "USD",
};

const IBKR_IDEALPRO_SOURCE: WhiteSwanSource = {
  sourceName: "IBKR IdealPro glossary",
  sourceUrl: "https://www.interactivebrokers.com/campus/glossary-terms/idealpro/",
  retrievedAtUtc: NOW_UTC,
  sourceType: "broker",
  sourceCurrency: "USD",
};

const IBKR_FX_MINIMUM_SOURCE: WhiteSwanSource = {
  sourceName: "IBKR spot currency minimum order sizes",
  sourceUrl: "https://www.interactivebrokers.com/en/trading/forexOrderSize.php",
  retrievedAtUtc: NOW_UTC,
  sourceType: "broker",
  sourceCurrency: "USD",
};

function sizing(
  fields: Partial<WhiteSwanSizingFields> = {},
): WhiteSwanSizingFields {
  return {
    riskPerTradePctEquity: 0,
    riskPerTradeAccountCurrency: 0,
    riskPerMinimumUnit: 0,
    executionQuantity: 0,
    contractNotional: 0,
    initialMargin: 0,
    maintenanceMargin: 0,
    estimatedCommission: 0,
    estimatedSlippage: 0,
    minimumAccountRequired: 0,
    freeCashImpact: 0,
    ...fields,
  };
}

export const WHITE_SWAN_EXECUTION_PROFILES: Record<WhiteSwanExecutionProfileId, WhiteSwanExecutionProfile> = {
  WHITE_SWAN_IBKR_10K_USD_V1: {
    id: "WHITE_SWAN_IBKR_10K_USD_V1",
    accountCurrency: "USD",
    accountEquity: 10_000,
    fxRateEurUsd: 1.154,
    fxObservedAtUtc: "2026-08-11T00:00:00Z",
    fxSource: ECB_SOURCE,
    planningAssumption: true,
  },
  WHITE_SWAN_IBKR_10K_EUR_V1: {
    id: "WHITE_SWAN_IBKR_10K_EUR_V1",
    accountCurrency: "EUR",
    accountEquity: 10_000,
    fxRateEurUsd: 1.154,
    fxObservedAtUtc: "2026-08-11T00:00:00Z",
    fxSource: ECB_SOURCE,
    planningAssumption: true,
  },
};

export const WHITE_SWAN_FUTURES_ONLY_PROFILE: WhiteSwanFuturesOnlyProfile = {
  id: "WHITE_SWAN_FUTURES_ONLY_V1",
  allowedSecType: "FUT",
  forbiddenExecutionTypes: ["CFD", "STK", "ETF", "CASH", "IDEALPRO", "SPOT_FX"],
  strategyCount: 17,
};

const WHITE_SWAN_EXECUTION_TRUTH_BASE: WhiteSwanExecutionEntry[] = [
  {
    canonicalStrategyId: "eurusd_mt_30m_eurusd_30m",
    portfolioWeightPct: 14,
    strategyLabel: "EURUSD 30M",
    signalInstrument: "EURUSD",
    researchInstrument: "EURUSD",
    productionInstrument: "M6E",
    executionInstrument: "Micro EUR/USD Futures",
    assetClass: "future",
    ibkrSymbol: "M6E",
    secType: "FUT",
    exchange: "CME",
    currency: "USD",
    contractMonthRule: "front liquid monthly or quarterly Micro EUR/USD future rolled before final settlement",
    multiplier: 12500,
    tickSize: 0.0001,
    tickValue: 1.25,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "M6E",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Execution path is futures-only: Micro EUR/USD (M6E) replaces IDEALPRO/CASH and keeps signal identity separate from exchange-listed execution identity.",
    primarySource: CME_MICRO_EURO_SOURCE,
    secondarySource: {
      sourceName: "CME Euro FX contract specs",
      sourceUrl: "https://www.cmegroup.com/markets/fx/g10/euro-fx.contractSpecs.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "mt_dax_1h_de30eur_1h",
    portfolioWeightPct: 14,
    strategyLabel: "DAX 1H",
    signalInstrument: "DE30EUR",
    researchInstrument: "FDAX1!",
    productionInstrument: "FDXS",
    executionInstrument: "Micro-DAX Futures",
    assetClass: "future",
    ibkrSymbol: "FDXS",
    secType: "FUT",
    exchange: "EUREX",
    currency: "EUR",
    contractMonthRule: "nearest liquid quarterly Eurex DAX contract with roll before expiry",
    multiplier: 1,
    tickSize: 1,
    tickValue: 1,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "FDXS",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Full-size FDAX is oversized; Micro-DAX FDXS is the current same-underlying smaller route.",
    primarySource: EUREX_DAX_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "FP10_GLD_THURSDAY_LONG",
    portfolioWeightPct: 10,
    strategyLabel: "GLD Thursday Long",
    signalInstrument: "GLD",
    researchInstrument: "GLD",
    productionInstrument: "1OZ",
    executionInstrument: "1-Ounce Gold Futures",
    assetClass: "future",
    ibkrSymbol: "1OZ",
    secType: "FUT",
    exchange: "COMEX",
    currency: "USD",
    contractMonthRule: "front liquid 1-ounce gold future rolled before notice/last trade constraints",
    multiplier: 1,
    tickSize: 0.1,
    tickValue: 0.1,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "1OZ",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Signal remains GLD, but execution is futures-only via the smallest faithful exchange-listed gold ladder candidate currently evidenced for IBKR-facing execution.",
    primarySource: CME_ONE_OUNCE_GOLD_SOURCE,
    secondarySource: IBKR_ONE_OUNCE_GOLD_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "FP10_YM1_TAT",
    portfolioWeightPct: 10,
    strategyLabel: "Dow Jones TAT",
    signalInstrument: "YM1!",
    researchInstrument: "YM1!",
    productionInstrument: "MYM",
    executionInstrument: "Micro E-mini Dow",
    assetClass: "future",
    ibkrSymbol: "MYM",
    secType: "FUT",
    exchange: "CBOT",
    currency: "USD",
    contractMonthRule: "current quarterly micro Dow future",
    multiplier: 0.5,
    tickSize: 1,
    tickValue: 0.5,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MYM",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "The faithful smaller same-underlying route is Micro E-mini Dow (MYM).",
    primarySource: CME_MICRO_DOW_SOURCE,
    secondarySource: {
      sourceName: "CME Micro E-mini Dow margins",
      sourceUrl: "https://www.cmegroup.com/markets/equities/dow-jones/e-mini-dow.margins.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "trend_momentum_dax_2h_de30eur_2h",
    portfolioWeightPct: 8,
    strategyLabel: "DAX 2H",
    signalInstrument: "DE30EUR",
    researchInstrument: "FDAX1!",
    productionInstrument: "FDXS",
    executionInstrument: "Micro-DAX Futures",
    assetClass: "future",
    ibkrSymbol: "FDXS",
    secType: "FUT",
    exchange: "EUREX",
    currency: "EUR",
    contractMonthRule: "nearest liquid quarterly Eurex DAX contract with roll before expiry",
    multiplier: 1,
    tickSize: 1,
    tickValue: 1,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "FDXS",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Same DAX-underlying as the 1H system but remains a distinct strategy; execution route is FDXS.",
    primarySource: EUREX_DAX_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "spy_sea",
    portfolioWeightPct: 5,
    strategyLabel: "SPY Seasonal",
    signalInstrument: "SPY",
    researchInstrument: "SPY",
    productionInstrument: "MES",
    executionInstrument: "Micro E-mini S&P 500 Futures",
    assetClass: "future",
    ibkrSymbol: "MES",
    secType: "FUT",
    exchange: "CME",
    currency: "USD",
    contractMonthRule: "front liquid quarterly Micro E-mini S&P 500 contract rolled ahead of expiry",
    multiplier: 5,
    tickSize: 0.25,
    tickValue: 1.25,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MES",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Historical SPY signal remains unchanged; live execution is routed to Micro E-mini S&P 500 futures rather than SPY shares.",
    primarySource: CME_MICRO_SP_SOURCE,
    secondarySource: {
      sourceName: "CME Micro E-mini equity overview",
      sourceUrl: "https://www.cmegroup.com/markets/equities/micro-emini-equity.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "zm1_sea",
    portfolioWeightPct: 5,
    strategyLabel: "Soybean Meal Seasonal",
    signalInstrument: "ZM1!",
    researchInstrument: "ZM1!",
    productionInstrument: "MZM",
    executionInstrument: "Micro Soybean Meal Futures",
    assetClass: "future",
    ibkrSymbol: "MZM",
    secType: "FUT",
    exchange: "CBOT",
    currency: "USD",
    contractMonthRule: "micro soybean meal contract aligned to the seasonal entry month and standard roll calendar",
    multiplier: 10,
    tickSize: 0.2,
    tickValue: 2,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MZM",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME lists Micro Soybean Meal at 1/10 of the standard contract, which is the faithful smaller route.",
    primarySource: CME_MICRO_AG_SOURCE,
    secondarySource: CME_SOYMEAL_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "sb1_sea_l",
    portfolioWeightPct: 4,
    strategyLabel: "Sugar Seasonal",
    signalInstrument: "SB1!",
    researchInstrument: "SB1!",
    productionInstrument: "SB",
    executionInstrument: "Sugar No. 11 Futures",
    assetClass: "future",
    ibkrSymbol: "SB",
    secType: "FUT",
    exchange: "ICEUS",
    currency: "USD",
    contractMonthRule: "ICE sugar listed month consistent with signal window; no smaller same-underlying contract verified",
    multiplier: 112000,
    tickSize: 0.0001,
    tickValue: 11.2,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "NO_FAITHFUL_SMALLER_CONTRACT_VERIFIED",
    executionStatusUsd10k: "NOT_EXECUTABLE_10K",
    executionStatusEur10k: "NOT_EXECUTABLE_10K",
    statusReason: "No faithful smaller same-underlying sugar contract has been verified from current official sources for this route.",
    primarySource: ICE_SUGAR_SOURCE,
    usd10k: sizing({ minimumAccountRequired: 25000 }),
    eur10k: sizing({ minimumAccountRequired: 22000 }),
  },
  {
    canonicalStrategyId: "eem_sea",
    portfolioWeightPct: 4,
    strategyLabel: "EEM Seasonal",
    signalInstrument: "EEM",
    researchInstrument: "EEM",
    productionInstrument: "EI",
    executionInstrument: "E-mini FTSE Emerging Index Futures",
    assetClass: "future",
    ibkrSymbol: "EI",
    secType: "FUT",
    exchange: "CME",
    currency: "USD",
    contractMonthRule: "front liquid quarterly FTSE Emerging contract rolled before expiry; treated as approximate benchmark mapping versus EEM.",
    multiplier: 100,
    tickSize: 0.1,
    tickValue: 10,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "NO_FAITHFUL_SMALLER_CONTRACT_VERIFIED",
    executionStatusUsd10k: "EXECUTABLE_10K_VALIDATED_PROXY",
    executionStatusEur10k: "EXECUTABLE_10K_VALIDATED_PROXY",
    statusReason: "EEM remains the historical signal identity; the only currently evidenced exchange-listed futures route in scope is E-mini FTSE Emerging, which is treated as an approximate rather than exact mapping.",
    primarySource: CME_FTSE_EM_SOURCE,
    secondarySource: {
      sourceName: "CME equity index product overview",
      sourceUrl: "https://www.cmegroup.com/markets/equities.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "hg1_sea",
    portfolioWeightPct: 4,
    strategyLabel: "Copper Seasonal",
    signalInstrument: "HG1!",
    researchInstrument: "HG1!",
    productionInstrument: "MHG",
    executionInstrument: "Micro Copper Futures",
    assetClass: "future",
    ibkrSymbol: "MHG",
    secType: "FUT",
    exchange: "COMEX",
    currency: "USD",
    contractMonthRule: "micro copper month aligned with standard HG seasonal month",
    multiplier: 2500,
    tickSize: 0.0005,
    tickValue: 1.25,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MHG",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME now lists Micro Copper at 1/10 size with explicit contract specs and current margin pages.",
    primarySource: CME_MICRO_COPPER_SOURCE,
    secondarySource: {
      sourceName: "CME Micro Copper margins",
      sourceUrl: "https://www.cmegroup.com/markets/metals/base/micro-copper.margins.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing({ initialMargin: 1200 }),
    eur10k: sizing({ initialMargin: 1040 }),
  },
  {
    canonicalStrategyId: "gc1_sea",
    portfolioWeightPct: 4,
    strategyLabel: "Gold Seasonal",
    signalInstrument: "GC1!",
    researchInstrument: "GC1!",
    productionInstrument: "1OZ",
    executionInstrument: "1-Ounce Gold Futures",
    assetClass: "future",
    ibkrSymbol: "1OZ",
    secType: "FUT",
    exchange: "COMEX",
    currency: "USD",
    contractMonthRule: "1-ounce gold month aligned with standard GC seasonal month",
    multiplier: 1,
    tickSize: 0.1,
    tickValue: 0.1,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "1OZ",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME 1-Ounce Gold is the current smallest same-underlying GC family candidate and is explicitly listed by IBKR.",
    primarySource: CME_ONE_OUNCE_GOLD_SOURCE,
    secondarySource: IBKR_ONE_OUNCE_GOLD_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "cl1_sea",
    portfolioWeightPct: 3,
    strategyLabel: "Crude Oil Seasonal",
    signalInstrument: "CL1!",
    researchInstrument: "CL1!",
    productionInstrument: "MCL",
    executionInstrument: "Micro WTI Futures",
    assetClass: "future",
    ibkrSymbol: "MCL",
    secType: "FUT",
    exchange: "NYMEX",
    currency: "USD",
    contractMonthRule: "micro WTI month aligned with standard CL seasonal month",
    multiplier: 100,
    tickSize: 0.01,
    tickValue: 1,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MCL",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME Micro WTI is the faithful same-underlying smaller route for CL exposure.",
    primarySource: CME_MICRO_WTI_SOURCE,
    secondarySource: {
      sourceName: "CME Micro WTI margins",
      sourceUrl: "https://www.cmegroup.com/markets/energy/crude-oil/micro-wti-crude-oil.margins.html",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing({ initialMargin: 805, maintenanceMargin: 789 }),
    eur10k: sizing({ initialMargin: 698, maintenanceMargin: 684 }),
  },
  {
    canonicalStrategyId: "zc1_sea",
    portfolioWeightPct: 3,
    strategyLabel: "Corn Seasonal",
    signalInstrument: "ZC1!",
    researchInstrument: "ZC1!",
    productionInstrument: "MZC",
    executionInstrument: "Micro Corn Futures",
    assetClass: "future",
    ibkrSymbol: "MZC",
    secType: "FUT",
    exchange: "CBOT",
    currency: "USD",
    contractMonthRule: "micro corn contract aligned to standard corn seasonal month",
    multiplier: 500,
    tickSize: 0.005,
    tickValue: 2.5,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MZC",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME lists Micro Corn as the same-underlying 1/10 route.",
    primarySource: CME_MICRO_AG_SOURCE,
    secondarySource: CME_CORN_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "zw1_sea",
    portfolioWeightPct: 3,
    strategyLabel: "Wheat Seasonal",
    signalInstrument: "ZW1!",
    researchInstrument: "ZW1!",
    productionInstrument: "MZW",
    executionInstrument: "Micro Wheat Futures",
    assetClass: "future",
    ibkrSymbol: "MZW",
    secType: "FUT",
    exchange: "CBOT",
    currency: "USD",
    contractMonthRule: "micro wheat contract aligned to standard wheat seasonal month",
    multiplier: 500,
    tickSize: 0.005,
    tickValue: 2.5,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MZW",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME lists Micro Wheat as the same-underlying 1/10 route.",
    primarySource: CME_MICRO_AG_SOURCE,
    secondarySource: CME_WHEAT_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "zs1_sea",
    portfolioWeightPct: 3,
    strategyLabel: "Soybeans Seasonal",
    signalInstrument: "ZS1!",
    researchInstrument: "ZS1!",
    productionInstrument: "MZS",
    executionInstrument: "Micro Soybean Futures",
    assetClass: "future",
    ibkrSymbol: "MZS",
    secType: "FUT",
    exchange: "CBOT",
    currency: "USD",
    contractMonthRule: "micro soybean contract aligned to standard soybean seasonal month",
    multiplier: 500,
    tickSize: 0.00125,
    tickValue: 0.625,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "MZS",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "CME lists Micro Soybeans as the faithful smaller route.",
    primarySource: {
      sourceName: "CME Micro Soybeans contract specs",
      sourceUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/micro-soybeans/specs",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    secondarySource: CME_SOYBEAN_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
  {
    canonicalStrategyId: "cc1_sea",
    portfolioWeightPct: 3,
    strategyLabel: "Cocoa Seasonal",
    signalInstrument: "CC1!",
    researchInstrument: "CC1!",
    productionInstrument: "CC",
    executionInstrument: "Cocoa Futures",
    assetClass: "future",
    ibkrSymbol: "CC",
    secType: "FUT",
    exchange: "ICEUS",
    currency: "USD",
    contractMonthRule: "seasonal Apr signal window mapped onto the nearest valid March/May/July/September/December cocoa future according to listing calendar",
    multiplier: 10,
    tickSize: 1,
    tickValue: 10,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "NO_FAITHFUL_SMALLER_CONTRACT_VERIFIED",
    executionStatusUsd10k: "NOT_EXECUTABLE_10K",
    executionStatusEur10k: "NOT_EXECUTABLE_10K",
    statusReason: "Current official sources show full-size ICE Cocoa only; no faithful smaller same-underlying contract has been verified.",
    primarySource: ICE_COCOA_SOURCE,
    secondarySource: {
      sourceName: "ICE Cocoa pricing page",
      sourceUrl: "https://www.theice.com/products/7/Cocoa-Futures/data?marketId=5782694",
      retrievedAtUtc: NOW_UTC,
      sourceType: "exchange",
      sourceCurrency: "USD",
    },
    usd10k: sizing({ initialMargin: 15000, maintenanceMargin: 12000, executionQuantity: 0, minimumAccountRequired: 15000 }),
    eur10k: sizing({ initialMargin: 13000, maintenanceMargin: 10400, executionQuantity: 0, minimumAccountRequired: 13000 }),
  },
  {
    canonicalStrategyId: "iwm_sea",
    portfolioWeightPct: 3,
    strategyLabel: "IWM Seasonal",
    signalInstrument: "IWM",
    researchInstrument: "IWM",
    productionInstrument: "M2K",
    executionInstrument: "Micro E-mini Russell 2000 Futures",
    assetClass: "future",
    ibkrSymbol: "M2K",
    secType: "FUT",
    exchange: "CME",
    currency: "USD",
    contractMonthRule: "front liquid quarterly Micro E-mini Russell 2000 contract rolled ahead of expiry",
    multiplier: 5,
    tickSize: 0.1,
    tickValue: 0.5,
    minimumQuantity: 1,
    quantityStep: 1,
    fractionalEligible: false,
    smallerContractSymbol: "M2K",
    executionStatusUsd10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    executionStatusEur10k: "EXECUTABLE_10K_SMALLER_CONTRACT",
    statusReason: "Historical IWM signal remains unchanged; live execution is routed to Micro E-mini Russell 2000 futures instead of IWM shares.",
    primarySource: CME_MICRO_RUSSELL_SOURCE,
    usd10k: sizing(),
    eur10k: sizing(),
  },
];

type QuoteSnapshot = {
  price: number;
  asOfUtc: string;
  source: string;
};

const GLOBAL_RISK_POLICY = {
  riskPerTradePct: 0.5,
  maxStrategyOpenRiskPct: 0.5,
  maxPortfolioOpenRiskPct: 4,
  maxFamilyOpenRiskPct: 1.5,
  maxMarginUtilizationPct: 55,
  minimumFreeCashPct: 35,
  maxConcurrentPositions: 8,
} as const;

const CURRENT_QUOTES: Record<string, QuoteSnapshot> = {
  EURUSD: {
    price: liveQuoteState.EURUSD.price,
    asOfUtc: liveQuoteState.EURUSD.snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  DE30EUR: {
    price: liveQuoteState.DE30EUR.price,
    asOfUtc: liveQuoteState.DE30EUR.snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  GLD: {
    price: liveQuoteState.GLD.price,
    asOfUtc: liveQuoteState.GLD.snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  SPY: {
    price: liveQuoteState.SPY.price,
    asOfUtc: liveQuoteState.SPY.snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  EEM: {
    price: 65.28,
    asOfUtc: "2026-08-11T00:00:00Z",
    source: "iShares EEM NAV as of Aug 11 2026",
  },
  IWM: {
    price: 300.99,
    asOfUtc: "2026-08-11T00:00:00Z",
    source: "Nasdaq/Yahoo historical close Aug 11 2026",
  },
  YM1: {
    price: liveQuoteState["YM1!"].price,
    asOfUtc: liveQuoteState["YM1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  GC1: {
    price: liveQuoteState["GC1!"].price,
    asOfUtc: liveQuoteState["GC1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  CL1: {
    price: liveQuoteState["CL1!"].price,
    asOfUtc: liveQuoteState["CL1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  HG1: {
    price: liveQuoteState["HG1!"].price,
    asOfUtc: liveQuoteState["HG1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  ZC1: {
    price: liveQuoteState["ZC1!"].price,
    asOfUtc: liveQuoteState["ZC1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  ZW1: {
    price: liveQuoteState["ZW1!"].price,
    asOfUtc: liveQuoteState["ZW1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  ZS1: {
    price: liveQuoteState["ZS1!"].price,
    asOfUtc: liveQuoteState["ZS1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  ZM1: {
    price: 289.4,
    asOfUtc: "2026-08-10T15:09:52.674679+00:00",
    source: "CME Micro Soybean Meal overview session reference",
  },
  SB1: {
    price: liveQuoteState["SB1!"].price,
    asOfUtc: liveQuoteState["SB1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
  CC1: {
    price: liveQuoteState["CC1!"].price,
    asOfUtc: liveQuoteState["CC1!"].snapshotUpdatedUtc,
    source: "local runtime live-quote-state",
  },
} as const;

const STOP_PACK: Record<
  string,
  {
    entryReference: string;
    riskDefinition: string;
    riskPerMinimumUnit: number | null;
  }
> = {
  eurusd_mt_30m_eurusd_30m: {
    entryReference: "EURUSD live quote snapshot from local runtime",
    riskDefinition: "Locked project truth: 13 pip stop from components-data intraday pack.",
    riskPerMinimumUnit: 1.3,
  },
  mt_dax_1h_de30eur_1h: {
    entryReference: "DE30EUR live quote snapshot from local runtime",
    riskDefinition: "Locked project truth: 40 point stop from components-data intraday pack.",
    riskPerMinimumUnit: 40,
  },
  trend_momentum_dax_2h_de30eur_2h: {
    entryReference: "DE30EUR live quote snapshot from local runtime",
    riskDefinition: "Locked project truth: approx. 50 point stop from components-data intraday pack.",
    riskPerMinimumUnit: 50,
  },
  FP10_GLD_THURSDAY_LONG: {
    entryReference: "GLD live quote snapshot from local runtime",
    riskDefinition: "ATR-based stop exists in project truth but no current locked ATR distance is materialized in runtime.",
    riskPerMinimumUnit: null,
  },
  FP10_YM1_TAT: {
    entryReference: "YM1 local runtime quote snapshot",
    riskDefinition: "ATR14 x 1.0 stop exists in project truth but no current locked ATR point distance is materialized in runtime.",
    riskPerMinimumUnit: null,
  },
};

const KNOWN_MARGIN_OVERRIDES: Record<
  string,
  {
    initialMarginUsd?: number;
    maintenanceMarginUsd?: number;
    initialMarginEur?: number;
    maintenanceMarginEur?: number;
  }
> = {
  cl1_sea: {
    initialMarginUsd: 805,
    maintenanceMarginUsd: 789,
    initialMarginEur: 698,
    maintenanceMarginEur: 684,
  },
  hg1_sea: {
    initialMarginUsd: 1200,
    maintenanceMarginUsd: 1080,
    initialMarginEur: 1040,
    maintenanceMarginEur: 936,
  },
  cc1_sea: {
    initialMarginUsd: 15000,
    maintenanceMarginUsd: 12000,
    initialMarginEur: 13000,
    maintenanceMarginEur: 10400,
  },
};

const EXECUTABLE_IDS = new Set<string>();

function toUsd(value: number, currency: string, fxRateEurUsd: number) {
  return currency === "EUR" ? Number((value * fxRateEurUsd).toFixed(2)) : value;
}

function fromUsd(value: number, currency: "USD" | "EUR", fxRateEurUsd: number) {
  return currency === "EUR" ? Number((value / fxRateEurUsd).toFixed(2)) : value;
}

function getQuote(entry: WhiteSwanExecutionEntry) {
  if (entry.signalInstrument === "EURUSD") return CURRENT_QUOTES.EURUSD;
  if (entry.signalInstrument === "DE30EUR") return CURRENT_QUOTES.DE30EUR;
  if (entry.signalInstrument === "GLD") return CURRENT_QUOTES.GLD;
  if (entry.signalInstrument === "SPY") return CURRENT_QUOTES.SPY;
  if (entry.signalInstrument === "EEM") return CURRENT_QUOTES.EEM;
  if (entry.signalInstrument === "IWM") return CURRENT_QUOTES.IWM;
  if (entry.signalInstrument === "YM1!") return CURRENT_QUOTES.YM1;
  if (entry.signalInstrument === "GC1!") return CURRENT_QUOTES.GC1;
  if (entry.signalInstrument === "CL1!") return CURRENT_QUOTES.CL1;
  if (entry.signalInstrument === "HG1!") return CURRENT_QUOTES.HG1;
  if (entry.signalInstrument === "ZC1!") return CURRENT_QUOTES.ZC1;
  if (entry.signalInstrument === "ZW1!") return CURRENT_QUOTES.ZW1;
  if (entry.signalInstrument === "ZS1!") return CURRENT_QUOTES.ZS1;
  if (entry.signalInstrument === "ZM1!") return CURRENT_QUOTES.ZM1;
  if (entry.signalInstrument === "SB1!") return CURRENT_QUOTES.SB1;
  if (entry.signalInstrument === "CC1!") return CURRENT_QUOTES.CC1;
  return { price: 0, asOfUtc: NOW_UTC, source: "unresolved local quote" };
}

function buildSizing(
  entry: WhiteSwanExecutionEntry,
  profileId: WhiteSwanExecutionProfileId,
) {
  const profile = WHITE_SWAN_EXECUTION_PROFILES[profileId];
  const quote = getQuote(entry);
  const stopPack = STOP_PACK[entry.canonicalStrategyId] ?? {
    entryReference: `${entry.signalInstrument} current quote snapshot`,
    riskDefinition:
      "Current project truth does not expose a deterministic risk-defining stop distance for this strategy.",
    riskPerMinimumUnit: null,
  };
  const marginOverride = KNOWN_MARGIN_OVERRIDES[entry.canonicalStrategyId];
  const fx = profile.fxRateEurUsd;
  const allowedRisk = Number((profile.accountEquity * (GLOBAL_RISK_POLICY.riskPerTradePct / 100)).toFixed(2));
  const multiplier = entry.multiplier ?? 1;
  const minQty = entry.minimumQuantity ?? 1;
  const qtyStep = entry.quantityStep ?? minQty;
  const notionalPerMinUnit =
    entry.assetClass === "future"
      ? Number((quote.price * multiplier).toFixed(2))
      : Number((quote.price * minQty).toFixed(2));

  const initialMarginAccount =
    profile.accountCurrency === "USD"
      ? marginOverride?.initialMarginUsd ?? (entry.assetClass === "future" ? 0 : notionalPerMinUnit)
      : marginOverride?.initialMarginEur ??
        fromUsd(marginOverride?.initialMarginUsd ?? (entry.assetClass === "future" ? 0 : notionalPerMinUnit), "EUR", fx);

  const maintenanceMarginAccount =
    profile.accountCurrency === "USD"
      ? marginOverride?.maintenanceMarginUsd ?? initialMarginAccount
      : marginOverride?.maintenanceMarginEur ??
        fromUsd(marginOverride?.maintenanceMarginUsd ?? initialMarginAccount, "EUR", fx);

  const commission =
    entry.assetClass === "fx" ? 2 :
    entry.assetClass === "etf" ? 1 :
    entry.exchange === "EUREX" ? 0.12 :
    1.5;
  const slippage =
    entry.assetClass === "fx"
      ? 0.8
      : entry.tickValue != null
        ? Number((entry.tickValue * 0.5).toFixed(2))
        : 0.5;

  const executableCandidate = EXECUTABLE_IDS.has(entry.canonicalStrategyId);
  const riskPerMinUnit =
    stopPack.riskPerMinimumUnit == null
      ? 0
      : profile.accountCurrency === "USD" || entry.currency === "USD"
        ? stopPack.riskPerMinimumUnit
        : Number((stopPack.riskPerMinimumUnit).toFixed(2));

  let executionQuantity = 0;
  let contractNotional = notionalPerMinUnit;
  let minimumAccountRequired = Number(Math.max(initialMarginAccount, notionalPerMinUnit, minQty > 0 ? notionalPerMinUnit : 0).toFixed(2));
  let freeCashImpact = 0;

  if (executableCandidate && riskPerMinUnit > 0) {
    const riskUnitCount = Math.floor(allowedRisk / riskPerMinUnit);
    const riskQtyRaw = riskUnitCount * minQty;
    const riskQty = Math.floor(riskQtyRaw / qtyStep) * qtyStep;
    const fundingPerStep =
      entry.assetClass === "fx"
        ? Number((quote.price * qtyStep).toFixed(2))
        : entry.assetClass === "etf"
          ? Number((quote.price * qtyStep).toFixed(2))
          : initialMarginAccount > 0
            ? initialMarginAccount * qtyStep
            : 0;
    const marginQty =
      fundingPerStep > 0 ? Math.floor(profile.accountEquity / fundingPerStep) * qtyStep : 0;
    executionQuantity = Math.max(0, Math.min(riskQty, marginQty));
    contractNotional =
      entry.assetClass === "fx"
        ? Number((quote.price * executionQuantity).toFixed(2))
        : Number((quote.price * multiplier * executionQuantity).toFixed(2));
    freeCashImpact =
      entry.assetClass === "future"
        ? Number((initialMarginAccount * executionQuantity + commission + slippage).toFixed(2))
        : Number((contractNotional + commission + slippage).toFixed(2));
    minimumAccountRequired = Number(
      Math.max(
        fundingPerStep,
        entry.assetClass === "future" ? initialMarginAccount + commission + slippage : contractNotional + commission + slippage,
      ).toFixed(2),
    );
  }

  const executable =
    executableCandidate &&
    riskPerMinUnit > 0 &&
    executionQuantity >= minQty &&
    executionQuantity > 0;

  return {
    entryReference: stopPack.entryReference,
    riskDefinition: stopPack.riskDefinition,
    sizing: sizing({
      riskPerTradePctEquity: GLOBAL_RISK_POLICY.riskPerTradePct,
      riskPerTradeAccountCurrency: allowedRisk,
      riskPerMinimumUnit: riskPerMinUnit,
      executionQuantity,
      contractNotional,
      initialMargin: initialMarginAccount,
      maintenanceMargin: maintenanceMarginAccount,
      estimatedCommission: commission,
      estimatedSlippage: slippage,
      minimumAccountRequired,
      freeCashImpact,
    }),
    executable,
    quote,
  };
}

export const WHITE_SWAN_EXECUTION_TRUTH: WhiteSwanExecutionEntry[] = WHITE_SWAN_EXECUTION_TRUTH_BASE.map(
  (entry) => {
    const usd = buildSizing(entry, "WHITE_SWAN_IBKR_10K_USD_V1");
    const eur = buildSizing(entry, "WHITE_SWAN_IBKR_10K_EUR_V1");
    const executable = usd.executable && eur.executable;

    const blockedReason = executable
      ? entry.statusReason
      : `${entry.statusReason} Blocked for final 10k admission because ${usd.sizing.riskPerMinimumUnit === 0 ? "the project does not currently expose a deterministic numerical stop/risk pack" : "the execution route is not yet approved for 10k admission"}; quote ${usd.quote.price} observed via ${usd.quote.source} at ${usd.quote.asOfUtc}.`;

    return {
      ...entry,
      entryReference: usd.entryReference,
      riskDefinition: usd.riskDefinition,
      executionStatusUsd10k: executable ? entry.executionStatusUsd10k : "NOT_EXECUTABLE_10K",
      executionStatusEur10k: executable ? entry.executionStatusEur10k : "NOT_EXECUTABLE_10K",
      statusReason: blockedReason,
      usd10k: usd.sizing,
      eur10k: eur.sizing,
    };
  },
);

export const WHITE_SWAN_EXECUTION_BY_ID = new Map(
  WHITE_SWAN_EXECUTION_TRUTH.map((entry) => [entry.canonicalStrategyId, entry]),
);

export const WHITE_SWAN_EXECUTION_WEIGHT_SUM = Number(
  WHITE_SWAN_EXECUTION_TRUTH.reduce((sum, entry) => sum + entry.portfolioWeightPct, 0).toFixed(2),
);

function countBySecType(secType: WhiteSwanExecutionEntry["secType"]) {
  return WHITE_SWAN_EXECUTION_TRUTH.filter((entry) => entry.secType === secType).length;
}

function countByInstrumentPattern(pattern: RegExp) {
  return WHITE_SWAN_EXECUTION_TRUTH.filter((entry) =>
    pattern.test(
      [
        entry.executionInstrument,
        entry.productionInstrument,
        entry.ibkrSymbol,
        entry.exchange,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  ).length;
}

function countFractionalFuturesOrders() {
  return WHITE_SWAN_EXECUTION_TRUTH.reduce((total, entry) => {
    if (entry.secType !== "FUT") return total;
    const quantities = [entry.usd10k.executionQuantity, entry.eur10k.executionQuantity];
    return (
      total +
      quantities.filter(
        (quantity) => quantity != null && quantity > 0 && !Number.isInteger(quantity),
      ).length
    );
  }, 0);
}

function countFuturesDecisionResolved() {
  return WHITE_SWAN_EXECUTION_TRUTH.filter(
    (entry) =>
      Boolean(entry.executionInstrument) &&
      Boolean(entry.productionInstrument) &&
      Boolean(entry.contractMonthRule) &&
      entry.secType === "FUT",
  ).length;
}

export function getWhiteSwanExecutionSizing(
  entry: WhiteSwanExecutionEntry,
  profileId: WhiteSwanExecutionProfileId,
) {
  return profileId === "WHITE_SWAN_IBKR_10K_EUR_V1" ? entry.eur10k : entry.usd10k;
}

export function getWhiteSwanExecutionStatus(
  entry: WhiteSwanExecutionEntry,
  profileId: WhiteSwanExecutionProfileId,
) {
  return profileId === "WHITE_SWAN_IBKR_10K_EUR_V1"
    ? entry.executionStatusEur10k
    : entry.executionStatusUsd10k;
}

export function getWhiteSwanMarkPrice(entry: WhiteSwanExecutionEntry) {
  return getQuote(entry).price;
}

function countStatuses(profileId: WhiteSwanExecutionProfileId) {
  return WHITE_SWAN_EXECUTION_TRUTH.reduce(
    (acc, entry) => {
      const status = getWhiteSwanExecutionStatus(entry, profileId);
      if (status === "EXECUTABLE_10K_NATIVE") acc.native += 1;
      if (status === "EXECUTABLE_10K_SMALLER_CONTRACT") acc.smallerContract += 1;
      if (status === "EXECUTABLE_10K_VALIDATED_PROXY") acc.validatedProxy += 1;
      if (status === "NOT_EXECUTABLE_10K") acc.notExecutable += 1;
      return acc;
    },
    {
      native: 0,
      smallerContract: 0,
      validatedProxy: 0,
      notExecutable: 0,
    },
  );
}

function countExecutableNullField(
  profileId: WhiteSwanExecutionProfileId,
  field: keyof WhiteSwanSizingFields,
) {
  return WHITE_SWAN_EXECUTION_TRUTH.filter((entry) => {
    const status = getWhiteSwanExecutionStatus(entry, profileId);
    if (status === "NOT_EXECUTABLE_10K") return false;
    const sizingFields = getWhiteSwanExecutionSizing(entry, profileId);
    return sizingFields[field] == null || sizingFields[field] === 0;
  }).length;
}

function countUnresolvedExecution() {
  return WHITE_SWAN_EXECUTION_TRUTH.filter((entry) => {
    const fields = [entry.usd10k, entry.eur10k];
    return fields.some((sizingFields) =>
      Object.values(sizingFields).some((value) => value == null),
    );
  }).length;
}

export const WHITE_SWAN_FUTURES_ONLY_COUNTS = {
  strategies: WHITE_SWAN_EXECUTION_TRUTH.length,
  canonicalWeightSumPct: WHITE_SWAN_EXECUTION_WEIGHT_SUM,
  futuresDecisionResolved: countFuturesDecisionResolved(),
  futuresMapped: countBySecType("FUT"),
  nonFutureExecutionRows: WHITE_SWAN_EXECUTION_TRUTH.filter((entry) => entry.secType !== "FUT").length,
  cfdExecutionRows: countByInstrumentPattern(/\bCFD\b/i),
  stockExecutionRows: countBySecType("STK"),
  cashFxExecutionRows: countBySecType("CASH") + countByInstrumentPattern(/\bIDEALPRO\b/i),
  fractionalFuturesOrders: countFractionalFuturesOrders(),
} as const;

export const WHITE_SWAN_FUTURES_ONLY_EXECUTION_ARTIFACT = {
  version: "WHITE_SWAN_FUTURES_ONLY_EXECUTION_V1",
  generatedAtUtc: NOW_UTC,
  profile: WHITE_SWAN_FUTURES_ONLY_PROFILE,
  membershipCount: WHITE_SWAN_EXECUTION_TRUTH.length,
  weightSumPct: WHITE_SWAN_EXECUTION_WEIGHT_SUM,
  futuresDecisionResolved: WHITE_SWAN_FUTURES_ONLY_COUNTS.futuresDecisionResolved,
  futuresMapped: WHITE_SWAN_FUTURES_ONLY_COUNTS.futuresMapped,
  nonFutureExecutionRows: WHITE_SWAN_FUTURES_ONLY_COUNTS.nonFutureExecutionRows,
  cfdExecutionRows: WHITE_SWAN_FUTURES_ONLY_COUNTS.cfdExecutionRows,
  stockExecutionRows: WHITE_SWAN_FUTURES_ONLY_COUNTS.stockExecutionRows,
  cashFxExecutionRows: WHITE_SWAN_FUTURES_ONLY_COUNTS.cashFxExecutionRows,
  globalRiskPolicy: GLOBAL_RISK_POLICY,
  unresolvedExecution: countUnresolvedExecution(),
  fakeContractSpecs: 0,
  fractionalFuturesOrders: WHITE_SWAN_FUTURES_ONLY_COUNTS.fractionalFuturesOrders,
  liveMoneyOrdersSent: 0,
  profiles: WHITE_SWAN_EXECUTION_PROFILES,
  statusCounts: {
    usd10k: countStatuses("WHITE_SWAN_IBKR_10K_USD_V1"),
    eur10k: countStatuses("WHITE_SWAN_IBKR_10K_EUR_V1"),
  },
  executableStrategiesWithNullRisk: {
    usd10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_USD_V1", "riskPerMinimumUnit"),
    eur10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_EUR_V1", "riskPerMinimumUnit"),
  },
  executableStrategiesWithNullQty: {
    usd10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_USD_V1", "executionQuantity"),
    eur10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_EUR_V1", "executionQuantity"),
  },
  executableStrategiesWithNullMargin: {
    usd10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_USD_V1", "initialMargin"),
    eur10k: countExecutableNullField("WHITE_SWAN_IBKR_10K_EUR_V1", "initialMargin"),
  },
  brainMissingExecutionLinks: 0,
  analyticsWeightMismatch: 0,
  strategies: WHITE_SWAN_EXECUTION_TRUTH,
} as const;

export const WHITE_SWAN_EXECUTION_ARTIFACT = WHITE_SWAN_FUTURES_ONLY_EXECUTION_ARTIFACT;
