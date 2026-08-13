import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import type { StrategyPerformanceResult } from "@/lib/monitoring/types";

export type SignalCardDirection = "LONG" | "SHORT" | "CASH" | "NONE" | "PENDING";
export type SignalCardStatus = "OPEN" | "CLOSED" | "VALIDATION" | "PAPER_ONLY" | "PARITY_PENDING";
export type SignalDataStatus = "ok" | "partial" | "missing";
export type SignalCardFilter = "all" | "long" | "short" | "cash" | "open" | "validation" | "last7" | "pending";
export type SignalCardGroup = "white_swan" | "core_invest" | "intraday";
export type SignalCardCategory =
  | "valuation"
  | "macro"
  | "seasonal"
  | "core_strategy"
  | "research_validation"
  | "intraday_mt";

export type SignalCardModel = {
  id: string;
  group: SignalCardGroup;
  category: SignalCardCategory;
  assetSymbol: string;
  displaySymbol: string;
  assetName: string;
  iconKey?: string;
  strategyName: string;
  strategyId?: string;
  version?: string;
  direction: SignalCardDirection;
  status: SignalCardStatus;
  signalDate?: string;
  ageDays?: number;
  price?: number;
  changePct?: number;
  tp?: number;
  sl?: number;
  dataStatus: SignalDataStatus;
  nextSignalLabel?: string;
  monitoringTarget?: {
    tab: MonitoringPrimaryTabId;
    asset: string;
    strategyId?: string;
  };
  // Backend signal state (intraday MT)
  signalState?: "ACTIVE" | "POTENTIAL" | "NONE";
  lastEvaluatedBar?: string;       // ISO datetime of last bar the engine evaluated
  nextEvaluationUtc?: string;      // ISO datetime of next bar close
  evaluationSchedule?: string;     // human-readable: "2H CET: 10,12,14,16,18"
  // Raw absolute prices (no frontend recalculation)
  entryAbsolute?: number;
  slAbsolute?: number;
  tpAbsolute?: number;
  beAbsolute?: number;
  // Market variant: "FDAX_FUTURES" | "DE30EUR_CFD" | "6E_FUTURES" | "EURUSD_SPOT"
  marketVariant?: string;
  validatedOn?: string;
  timeframe?: string;
};

export type SignalCardPreview = {
  chart: MonitoringChartData | null;
  performance: StrategyPerformanceResult | null;
  testerStatus: "ready" | "validated" | "missing";
  testerMessage: string | null;
  kpis: Array<{ label: string; value: string; tone?: "positive" | "negative" | "neutral" }>;
};

export type SignalPageSectionGroup = {
  id: SignalCardCategory;
  title: string;
  cards: SignalCardModel[];
};

export type SignalPageSection = {
  id: SignalCardGroup;
  title: string;
  subtitle: string;
  filters: SignalCardFilter[];
  groups: SignalPageSectionGroup[];
};

export type SignalPageModel = {
  pageMeta: {
    title: string;
    label: string;
    subtitle: string;
    lastUpdate: string | null;
    dataStatus: string;
    mode: string;
  };
  sections: SignalPageSection[];
  cards: SignalCardModel[];
  previews: Record<string, SignalCardPreview>;
  renderAudit: Array<{
    area: string;
    file: string;
    current: string;
    target: string;
  }>;
};
