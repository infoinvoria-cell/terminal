export const CORE_INVEST_MODEL = {
  portfolioName: "Core Invest",
  version: "v2.0",
  frozenDate: "2026-07-20",
  currency: "USD",
  status: "blocked_engine_parity_not_live",
  statusLabel: "Validation blockiert",
  rebalance: {
    frequency: "quarterly",
    months: [3, 6, 9, 12],
    day: "last_trading_day",
    transactionCostBps: 10,
    toleranceBandRelative: 0.2,
  },
  constraints: {
    noShorts: true,
    noOptions: true,
    noPortfolioLeverage: true,
  },
  components: [
    coreComponent("QQQ_PASSIVE", "QQQ Passive", "QQQ", "asset", "Nasdaq-100 core allocation", 0.45, "historical_asset_ready", "2026-07-07", "Historische Buy-and-hold-Reihe vorhanden; OOS für Asset-Referenz nicht separat definiert"),
    coreComponent("GLD", "GLD", "GLD", "asset", "Gold diversification and crisis hedge", 0.25, "historical_asset_ready", "2026-07-07", "Historische Buy-and-hold-Reihe vorhanden; OOS für Asset-Referenz nicht separat definiert"),
    coreComponent("SPMO", "SPMO", "SPMO", "asset", "US equity momentum allocation", 0.05, "historical_asset_ready", "2026-07-07", "Historische Buy-and-hold-Reihe vorhanden; OOS für Asset-Referenz nicht separat definiert"),
    coreComponent("SPY", "SPY", "SPY", "asset", "Broad US equity allocation and benchmark anchor", 0.05, "historical_asset_ready", "2026-07-07", "Historische Buy-and-hold-Reihe vorhanden; OOS für Asset-Referenz nicht separat definiert"),
    coreComponent("QQQ_PINE_1", "QQQ Pine 1", "QQQ", "strategy", "Long/cash tactical QQQ sleeve", 0.05, "tv_reference_only", null, "Trade-by-Trade-Parität, Rolling Walk Forward und Live-Formel fehlen"),
    coreComponent("QQQ_PINE_2_EMA", "QQQ Pine 2 EMA", "QQQ", "strategy", "EMA and valuation long/cash QQQ sleeve", 0.05, "tv_reference_only", null, "Trade-by-Trade-Parität, Rolling Walk Forward und Live-Formel fehlen"),
    coreComponent("COPPER_HG", "Copper / HG", "HG1!", "strategy", "Copper futures long/cash sleeve", 0.05, "tv_reference_only", null, "HG-Qualitätswarnungen, Rollregeln, Parität und IBKR-Kontrakt fehlen"),
    coreComponent("CHF_6S", "CHF / 6S", "6S1!", "strategy", "Swiss franc futures long/cash sleeve", 0.05, "tv_reference_only", null, "Verdächtige Sprünge, Rollregeln, Parität und IBKR-Kontrakt fehlen"),
  ],
  validation: {
    historicalSeriesReady: 4,
    parityPending: 4,
    liveReadyComponents: 0,
    aggregateBacktestValid: false,
    rollingWalkForwardValid: false,
    liveReady: false,
    realLiveDataVerified: false,
    reason: "Exact trade-by-trade parity is missing for four strategy sleeves.",
  },
  rejectedAggregateReference: {
    source: "core-invest-paper.config.json",
    period: "2019-01-01 to 2026-07-17",
    cagrPct: 17.11,
    sharpe: 1.152,
    maxDrawdownPct: -21.73,
    calmar: 0.7874,
    walkForwardBeatRatePct: 60,
    status: "rejected_engine_parity",
  },
} as const;

function coreComponent(
  id: string,
  label: string,
  instrument: string,
  kind: "asset" | "strategy",
  purpose: string,
  weight: number,
  validationStatus: "historical_asset_ready" | "tv_reference_only",
  dataAsOf: string | null,
  blocker: string,
) {
  return {
    id,
    label,
    instrument,
    kind,
    purpose,
    weight,
    validationStatus,
    dataAsOf,
    technicallyPrepared: true,
    historicallyValidated: validationStatus === "historical_asset_ready",
    outOfSampleValidated: false,
    liveReady: false,
    ibkrMappingStatus: "offen",
    blocker,
    robustness: validationStatus === "historical_asset_ready"
      ? "historische Referenz; nicht live-bereit"
      : "weiterer Forward-Test erforderlich",
  } as const;
}

export const CORE_INVEST_WEIGHTS = Object.fromEntries(
  CORE_INVEST_MODEL.components.map((component) => [component.id, component.weight]),
) as Record<(typeof CORE_INVEST_MODEL.components)[number]["id"], number>;

export function getCoreInvestWeightTotal() {
  return Number(CORE_INVEST_MODEL.components.reduce((sum, component) => sum + component.weight, 0).toFixed(12));
}
