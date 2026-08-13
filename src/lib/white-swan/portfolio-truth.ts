import analyticsGenerated from "@/data/capitalife/analytics-generated.json";
import whiteSwanOfficialKpis from "@/data/capitalife/white-swan-official-kpis.json";
import portfolioOperationalHealth from "../../../.runtime/institutional/portfolio-operational-health.json";
import strategyOperationalMatrix from "../../../.runtime/institutional/strategy-operational-matrix.json";
import { WS_STRATEGIES, type StrategyRow } from "@/lib/components/ws-strategy-data";
import {
  WHITE_SWAN_EXECUTION_BY_ID,
  WHITE_SWAN_EXECUTION_PROFILES,
  WHITE_SWAN_EXECUTION_TRUTH,
  WHITE_SWAN_EXECUTION_WEIGHT_SUM,
} from "@/lib/white-swan/execution-truth";

type StrategyHealthRow = {
  strategyId: string;
  portfolio: string;
  overallOperationalStatus: string;
  runtimeImplemented: boolean;
  runtimeOnline: boolean;
  liveDataStatus: string;
  issues: string[];
};

type PortfolioHealthRow = {
  portfolio: string;
  totalStrategies: number;
  runtimeImplemented: number;
  runtimeOnline: number;
  liveDataCurrent: number;
  degraded: number;
  unavailable: number;
};

type ExecutionStatus =
  | "EXECUTABLE_10K_NATIVE"
  | "EXECUTABLE_10K_SMALLER_CONTRACT"
  | "EXECUTABLE_10K_VALIDATED_PROXY"
  | "NOT_EXECUTABLE_10K";

type ActiveComponentConfig = {
  canonicalStrategyId: string;
  analyticsGroupId: string;
  executionModel: "etf" | "equity" | "future" | "fx";
  signalInstrument: string;
  executionInstrument: string;
  minQty: number | null;
  riskPerTradePctEquity: number | null;
  riskPerTradeUsd: number | null;
  executionQty: number | null;
  initialMarginUsd: number | null;
  maintenanceMarginUsd: number | null;
  executionStatus: ExecutionStatus;
  executionNote: string;
};

type ActiveWhiteSwanComponent = {
  id: string;
  canonicalStrategyId: string;
  ticker: string;
  label: string;
  pillar: StrategyRow["pillar"];
  analyticsGroupId: string;
  displayWeightPct: number;
  rawWeightPct: number;
  signalInstrument: string;
  executionInstrument: string;
  executionModel: "etf" | "equity" | "future" | "fx";
  minQty: number | null;
  riskPerTradePctEquity: number | null;
  riskPerTradeUsd: number | null;
  executionQty: number | null;
  initialMarginUsd: number | null;
  maintenanceMarginUsd: number | null;
  executionStatus: ExecutionStatus;
  executionNote: string;
};

type WhiteSwanAnalyticsGroup = {
  id: string;
  label: string;
  assets: number;
  strategies: number;
  weight: number;
  memberStrategyIds: string[];
};

type MetricCoverage = {
  activeRows: number;
  validMetricRows: number;
  missingMetricRows: number;
  aggregateMethod: string;
  aggregateValue: number | null;
};

const EXECUTION_PROFILE_USD = WHITE_SWAN_EXECUTION_PROFILES.WHITE_SWAN_IBKR_10K_USD_V1;

const ACTIVE_COMPONENT_CONFIG: Record<string, ActiveComponentConfig> = Object.fromEntries(
  Array.from(WHITE_SWAN_EXECUTION_BY_ID.values()).map((entry) => {
    const analyticsGroupId =
      entry.canonicalStrategyId === "FP10_GLD_THURSDAY_LONG"
        ? "GLD Thursday Long"
        : entry.canonicalStrategyId === "FP10_YM1_TAT"
          ? "YM1 TAT"
          : entry.canonicalStrategyId === "eurusd_mt_30m_eurusd_30m" ||
              entry.canonicalStrategyId === "mt_dax_1h_de30eur_1h" ||
              entry.canonicalStrategyId === "trend_momentum_dax_2h_de30eur_2h"
            ? "Intraday MT v3-F"
            : "Seasonal Sleeve";
    return [
      entry.canonicalStrategyId === "FP10_GLD_THURSDAY_LONG"
        ? "gld_thursday"
        : entry.canonicalStrategyId === "FP10_YM1_TAT"
          ? "ym1_tat"
          : entry.canonicalStrategyId === "eurusd_mt_30m_eurusd_30m"
            ? "eurusd_30m"
            : entry.canonicalStrategyId === "mt_dax_1h_de30eur_1h"
              ? "dax_1h"
              : entry.canonicalStrategyId === "trend_momentum_dax_2h_de30eur_2h"
                ? "dax_2h"
                : entry.canonicalStrategyId,
      {
        canonicalStrategyId: entry.canonicalStrategyId,
        analyticsGroupId,
        executionModel: entry.assetClass,
        signalInstrument: entry.signalInstrument,
        executionInstrument: entry.executionInstrument,
        minQty: entry.minimumQuantity,
        riskPerTradePctEquity: entry.usd10k.riskPerTradePctEquity,
        riskPerTradeUsd: entry.usd10k.riskPerTradeAccountCurrency,
        executionQty: entry.usd10k.executionQuantity,
        initialMarginUsd:
          entry.currency === "USD"
            ? entry.usd10k.initialMargin
            : entry.usd10k.initialMargin != null
              ? Number((entry.usd10k.initialMargin * EXECUTION_PROFILE_USD.fxRateEurUsd).toFixed(0))
              : null,
        maintenanceMarginUsd:
          entry.currency === "USD"
            ? entry.usd10k.maintenanceMargin
            : entry.usd10k.maintenanceMargin != null
              ? Number((entry.usd10k.maintenanceMargin * EXECUTION_PROFILE_USD.fxRateEurUsd).toFixed(0))
              : null,
        executionStatus: entry.executionStatusUsd10k,
        executionNote: entry.statusReason,
      } satisfies ActiveComponentConfig,
    ];
  }),
) as Record<string, ActiveComponentConfig>;

const strategyHealthRows = (strategyOperationalMatrix.rows as StrategyHealthRow[]).filter(
  (row) => row.portfolio === "White Swan",
);

const whiteSwanPortfolioHealth = (portfolioOperationalHealth.portfolios as PortfolioHealthRow[]).find(
  (row) => row.portfolio === "White Swan",
);

const rawActiveComponents = WS_STRATEGIES.filter((strategy) => strategy.status === "active");
const watchRows = WS_STRATEGIES.filter((strategy) => strategy.status === "watch");
const researchRows = WS_STRATEGIES.filter((strategy) => strategy.status === "research");
export const WHITE_SWAN_CANONICAL_PORTFOLIO_WEIGHTS = Object.fromEntries(
  WHITE_SWAN_EXECUTION_TRUTH.map((entry) => [entry.canonicalStrategyId, entry.portfolioWeightPct]),
) as Record<string, number>;

function parsePercent(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null);
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

function sum(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null);
  return valid.reduce((acc, value) => acc + value, 0);
}

export const activeWhiteSwanComponents: ActiveWhiteSwanComponent[] = rawActiveComponents.map((strategy) => {
  const config = ACTIVE_COMPONENT_CONFIG[strategy.id];
  const canonicalWeightPct = WHITE_SWAN_CANONICAL_PORTFOLIO_WEIGHTS[config?.canonicalStrategyId ?? strategy.id];
  if (!config) {
    throw new Error(`Missing active White Swan config for ${strategy.id}`);
  }
  if (canonicalWeightPct == null) {
    throw new Error(`Missing canonical White Swan weight for ${config.canonicalStrategyId}`);
  }
  return {
    id: strategy.id,
    canonicalStrategyId: config.canonicalStrategyId,
    ticker: strategy.ticker,
    label: strategy.label,
    pillar: strategy.pillar,
    analyticsGroupId: config.analyticsGroupId,
    displayWeightPct: canonicalWeightPct,
    rawWeightPct: strategy.weight ?? 0,
    signalInstrument: config.signalInstrument,
    executionInstrument: config.executionInstrument,
    executionModel: config.executionModel,
    minQty: config.minQty,
    riskPerTradePctEquity: config.riskPerTradePctEquity,
    riskPerTradeUsd: config.riskPerTradeUsd,
    executionQty: config.executionQty,
    initialMarginUsd: config.initialMarginUsd,
    maintenanceMarginUsd: config.maintenanceMarginUsd,
    executionStatus: config.executionStatus,
    executionNote: config.executionNote,
  };
});

const analyticsGroupMap = new Map<string, ActiveWhiteSwanComponent[]>();
for (const component of activeWhiteSwanComponents) {
  const bucket = analyticsGroupMap.get(component.analyticsGroupId) ?? [];
  bucket.push(component);
  analyticsGroupMap.set(component.analyticsGroupId, bucket);
}

export const WHITE_SWAN_ANALYTICS_GROUPS: WhiteSwanAnalyticsGroup[] = Array.from(analyticsGroupMap.entries()).map(
  ([groupId, members]) => ({
    id: groupId,
    label:
      groupId === "Seasonal Sleeve"
        ? "Seasonal"
        : groupId === "Intraday MT v3-F"
          ? "Intraday"
          : groupId,
    assets: members.length,
    strategies: members.length,
    weight: Number(members.reduce((sumValue, member) => sumValue + member.displayWeightPct, 0).toFixed(2)),
    memberStrategyIds: members.map((member) => member.canonicalStrategyId),
  }),
);

export const WHITE_SWAN_ANALYTICS_WEIGHTS = Object.fromEntries(
  WHITE_SWAN_ANALYTICS_GROUPS.map((group) => [group.id, group.weight]),
) as Record<string, number>;

export const WHITE_SWAN_ANALYTICS_ENABLED = Object.fromEntries(
  Object.keys(analyticsGenerated.whiteSwanBacktest.groupSeries ?? {}).map((groupId) => [
    groupId,
    WHITE_SWAN_ANALYTICS_WEIGHTS[groupId] != null && WHITE_SWAN_ANALYTICS_WEIGHTS[groupId] > 0,
  ]),
) as Record<string, boolean>;

function metricCoverage(values: Array<number | null>, aggregateMethod: string): MetricCoverage {
  const valid = values.filter((value): value is number => value != null);
  return {
    activeRows: activeWhiteSwanComponents.length,
    validMetricRows: valid.length,
    missingMetricRows: activeWhiteSwanComponents.length - valid.length,
    aggregateMethod,
    aggregateValue: valid.length ? Number((valid.reduce((sumValue, value) => sumValue + value, 0) / valid.length).toFixed(2)) : null,
  };
}

export const WHITE_SWAN_HEADER_METRICS = {
  weight: {
    activeRows: activeWhiteSwanComponents.length,
    validMetricRows: activeWhiteSwanComponents.length,
    missingMetricRows: 0,
    aggregateMethod: "sum(normalized active portfolio weights)",
    aggregateValue: Number(activeWhiteSwanComponents.reduce((sumValue, component) => sumValue + component.displayWeightPct, 0).toFixed(2)),
  },
  sharpe: metricCoverage(rawActiveComponents.map((strategy) => strategy.sharpeOos), "arithmetic mean of component OOS Sharpe"),
  cagr: metricCoverage(rawActiveComponents.map((strategy) => parsePercent(strategy.cagr)), "arithmetic mean of component CAGR%"),
  maxDd: metricCoverage(rawActiveComponents.map((strategy) => parsePercent(strategy.maxDd)), "arithmetic mean of component MaxDD%"),
  calmar: metricCoverage(rawActiveComponents.map((strategy) => strategy.calmar), "arithmetic mean of component Calmar"),
  pf: metricCoverage(rawActiveComponents.map((strategy) => strategy.pf), "arithmetic mean of component PF"),
  trades: {
    activeRows: activeWhiteSwanComponents.length,
    validMetricRows: rawActiveComponents.filter((strategy) => strategy.trades != null).length,
    missingMetricRows: rawActiveComponents.filter((strategy) => strategy.trades == null).length,
    aggregateMethod: "sum of component trades",
    aggregateValue: sum(rawActiveComponents.map((strategy) => strategy.trades)),
  },
  wfWin: {
    activeRows: activeWhiteSwanComponents.length,
    validMetricRows: rawActiveComponents.filter((strategy) => (strategy.wfOos ?? "").includes("%")).length,
    missingMetricRows: rawActiveComponents.filter((strategy) => !(strategy.wfOos ?? "").includes("%")).length,
    aggregateMethod: "arithmetic mean of percentage-only WF/Win rows",
    aggregateValue: avg(
      rawActiveComponents.map((strategy) => {
        const raw = strategy.wfOos ?? "";
        if (!raw.includes("%")) return null;
        const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      }),
    ),
  },
  status: {
    activeRows: activeWhiteSwanComponents.length,
    validMetricRows: activeWhiteSwanComponents.length,
    missingMetricRows: 0,
    aggregateMethod: "count(activeWhiteSwanComponents)",
    aggregateValue: activeWhiteSwanComponents.length,
  },
} as const;

export const WHITE_SWAN_PORTFOLIO_TRUTH = {
  activeWhiteSwanStrategies: activeWhiteSwanComponents.length,
  activeCanonicalStrategyIds: activeWhiteSwanComponents.map((component) => component.canonicalStrategyId),
  activeWhiteSwanComponents,
  activeWeightSumPct: Number(activeWhiteSwanComponents.reduce((sumValue, component) => sumValue + component.displayWeightPct, 0).toFixed(2)),
  rawRegistryWeightSumPct: Number(rawActiveComponents.reduce((sumValue, strategy) => sumValue + (strategy.weight ?? 0), 0).toFixed(2)),
  cashMarginReservePct: 9,
  cashMarginReserveUsd: 900,
  watchRows: watchRows.length,
  researchRows: researchRows.length,
  analyticsGroups: WHITE_SWAN_ANALYTICS_GROUPS,
  headerMetrics: WHITE_SWAN_HEADER_METRICS,
  operationalHealth: whiteSwanPortfolioHealth ?? null,
  degradedStrategies: strategyHealthRows
    .filter((row) => row.overallOperationalStatus !== "LIVE" && row.overallOperationalStatus !== "CURRENT_MARKET_CLOSED")
    .map((row) => ({
      strategyId: row.strategyId,
      status: row.overallOperationalStatus,
      liveDataStatus: row.liveDataStatus,
      runtimeImplemented: row.runtimeImplemented,
      runtimeOnline: row.runtimeOnline,
      issues: row.issues,
    })),
} as const;

export const WHITE_SWAN_COMPONENT_KPIS = {
  sharpe: whiteSwanOfficialKpis.official_kpis.sharpe.toFixed(2),
  cagr: `+${whiteSwanOfficialKpis.official_kpis.annualized_return_pct.toFixed(1)}%`,
  maxDd: `${whiteSwanOfficialKpis.official_kpis.max_drawdown_pct.toFixed(2)}%`,
  calmar: whiteSwanOfficialKpis.official_kpis.calmar.toFixed(1),
  strategies: String(WHITE_SWAN_PORTFOLIO_TRUTH.activeWhiteSwanStrategies),
  version: "white-swan-official-kpis 2026-08-12",
} as const;
