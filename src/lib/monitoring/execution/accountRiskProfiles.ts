export type ExecutionAssetGroup =
  | "Agrar"
  | "Metalle+Energie"
  | "Indizes"
  | "Aktien"
  | "Invest"
  | "Intraday MT";

export type ExecutionAccountRiskProfile = {
  id: string;
  name: string;
  accountSizeUsd: number | null;
  broker: string | null;
  defaultRiskPercent: number | null;
  maxRiskUsd: number | null;
  riskMultiplier: number | null;
  allowedGroups: ExecutionAssetGroup[] | null;
  allowedSymbols: string[] | null;
  riskMultiplierByGroup: Partial<Record<ExecutionAssetGroup, number>> | null;
  riskMultiplierBySymbol: Record<string, number> | null;
  configSources: string[];
};

const AGRAR_SYMBOLS = new Set(["ZW1", "ZW1!", "ZC1", "ZC1!", "CC1", "CC1!", "OJ1", "OJ1!"]);
const METALS_ENERGY_SYMBOLS = new Set(["GC1", "GC1!", "SI1", "SI1!", "CL1", "CL1!", "PA1", "PA1!", "PL1", "PL1!"]);
const INDICES_SYMBOLS = new Set(["ES1", "ES1!", "FDAX1", "FDAX1!", "YM1", "YM1!"]);
const STOCK_SYMBOLS = new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"]);
const INTRADAY_SYMBOLS = new Set(["DE30EUR", "EURUSD", "GBPUSD"]);

function normalizeKey(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

export function resolveExecutionAssetGroup(params: {
  symbol: string | null;
  name?: string | null;
  strategyId?: string | null;
  timeframe?: string | null;
}): ExecutionAssetGroup | null {
  const symbol = normalizeKey(params.symbol);
  const name = normalizeKey(params.name);
  const strategyId = normalizeKey(params.strategyId);
  const timeframe = normalizeKey(params.timeframe);

  if (AGRAR_SYMBOLS.has(symbol)) return "Agrar";
  if (METALS_ENERGY_SYMBOLS.has(symbol)) return "Metalle+Energie";
  if (INDICES_SYMBOLS.has(symbol)) return "Indizes";
  if (STOCK_SYMBOLS.has(symbol)) return "Aktien";

  if (INTRADAY_SYMBOLS.has(symbol) && (timeframe === "1H" || timeframe === "2H" || timeframe === "30M")) {
    return "Intraday MT";
  }

  if (symbol.includes("NAS100USD") || symbol === "USDCHF" || strategyId.includes("INVEST") || name.includes("INVEST")) {
    return "Invest";
  }

  return null;
}

export const EXECUTION_ACCOUNT_RISK_PROFILES: ExecutionAccountRiskProfile[] = [
  {
    id: "vantage_1k",
    name: "Vantage 1K",
    accountSizeUsd: 1_000,
    broker: "Vantage",
    defaultRiskPercent: null,
    maxRiskUsd: null,
    riskMultiplier: null,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: [],
  },
  {
    id: "vantage_10k",
    name: "Vantage 10K",
    accountSizeUsd: 10_000,
    broker: "Vantage",
    defaultRiskPercent: null,
    maxRiskUsd: null,
    riskMultiplier: 1,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: ["frontend/lib/portfolio/engine.ts:750"],
  },
  {
    id: "alpha_capital_25k",
    name: "Alpha Capital 25K",
    accountSizeUsd: 25_000,
    broker: "Alpha Capital",
    defaultRiskPercent: null,
    maxRiskUsd: null,
    riskMultiplier: null,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: [],
  },
  {
    id: "ftmo_10k",
    name: "FTMO 10K",
    accountSizeUsd: 10_000,
    broker: "FTMO",
    defaultRiskPercent: null,
    maxRiskUsd: 75,
    riskMultiplier: 0.95,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: ["frontend/lib/portfolio/engine.ts:760"],
  },
  {
    id: "ftmo_100k",
    name: "FTMO 100K",
    accountSizeUsd: 100_000,
    broker: "FTMO",
    defaultRiskPercent: null,
    maxRiskUsd: 700,
    riskMultiplier: 1.1,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: ["frontend/lib/portfolio/engine.ts:767"],
  },
  {
    id: "trading_club_25k",
    name: "Trading Club 25K",
    accountSizeUsd: 25_000,
    broker: "Trading Club",
    defaultRiskPercent: null,
    maxRiskUsd: null,
    riskMultiplier: null,
    allowedGroups: null,
    allowedSymbols: null,
    riskMultiplierByGroup: null,
    riskMultiplierBySymbol: null,
    configSources: [],
  },
];
