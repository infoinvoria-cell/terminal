/**
 * Capitalife system graph layer for the Brain Graph.
 *
 * Generates system nodes (source: "dashboard") from canonical terminal metadata.
 * These nodes are NEVER written to Supabase; they are merged at request time into
 * the /api/brain-graph/network response alongside the user's Brain vault nodes.
 *
 * User brain content in brain_nodes / brain_links is NOT touched.
 *
 * The contract is dual-purpose:
 * - UI-compatible for BrainGraphShell (`navActions`, `source`, `target`)
 * - agent-readable for Sentinel/system tools (`canonicalEntityId`, `metadata`, `health`)
 */

import { getEntityHref } from "@/lib/navigation/entity-resolver";

export type SystemNodeType =
  | "STRATEGY"
  | "INSTRUMENT"
  | "MARKET"
  | "DATASET"
  | "RUNTIME"
  | "PORTFOLIO"
  | "ASSET"
  | "SIGNAL_STATE"
  | "ENGINE_SURFACE"
  | "COMPONENT_SURFACE"
  | "MONITORING_CHART";

export type SystemHealthState = "healthy" | "warning" | "offline" | "unknown";

export type SystemHealthSnapshot = {
  data: SystemHealthState;
  runtime: SystemHealthState;
  signal: SystemHealthState;
  broker: SystemHealthState;
  summary: string;
};

export type SystemNavigationActions = Record<string, string>;

export type SystemNode = {
  id: string;
  type: SystemNodeType;
  nodeType: SystemNodeType;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "dashboard";
  canonicalEntityId: string;
  metadata: Record<string, string | number | boolean | null>;
  health: SystemHealthSnapshot;
  navigationActions: SystemNavigationActions;
  navActions: SystemNavigationActions;
};

export type SystemLinkRelationship =
  | "PORTFOLIO_MEMBERSHIP"
  | "USES_PRODUCTION_INSTRUMENT"
  | "USES_DATASET"
  | "DERIVES_BARS_FROM"
  | "EVALUATED_BY_RUNTIME"
  | "PUBLISHES_SIGNAL_STATE"
  | "VISUALIZED_IN_MONITORING"
  | "EXECUTED_IN_ENGINE"
  | "EXPLAINED_IN_COMPONENTS"
  | "RELATED_MARKET";

export type SystemLink = {
  id: string;
  from: string;
  to: string;
  source: string;
  target: string;
  relationship: SystemLinkRelationship;
  sourceSystem: "dashboard";
  metadata: Record<string, string | number | boolean | null>;
};

export type SystemGraph = {
  nodes: SystemNode[];
  links: SystemLink[];
};

export const SYSTEM_FOLDERS = {
  STRATEGY: "00_System/Strategy",
  INSTRUMENT: "00_System/Instrument",
  MARKET: "00_System/Market",
  DATASET: "00_System/Dataset",
  RUNTIME: "00_System/Runtime",
  PORTFOLIO: "00_System/Portfolio",
  ASSET: "00_System/Asset",
  SIGNAL_STATE: "00_System/SignalState",
  ENGINE_SURFACE: "00_System/Engine",
  COMPONENT_SURFACE: "00_System/Components",
  MONITORING_CHART: "00_System/Monitoring",
} satisfies Record<SystemNodeType, string>;

const HEALTH = {
  liveStrategy: {
    data: "healthy",
    runtime: "healthy",
    signal: "healthy",
    broker: "unknown",
    summary: "Canonical mapping is live and wired into runtime surfaces.",
  },
  relatedMarket: {
    data: "healthy",
    runtime: "unknown",
    signal: "unknown",
    broker: "unknown",
    summary: "Monitoring-only related market. Not a production identity.",
  },
  researchOnly: {
    data: "healthy",
    runtime: "unknown",
    signal: "unknown",
    broker: "unknown",
    summary: "Reference entity used for lineage or analytics context.",
  },
  coreInvest: {
    data: "healthy",
    runtime: "warning",
    signal: "unknown",
    broker: "unknown",
    summary: "Portfolio context exists, but live production runtime is not active.",
  },
} satisfies Record<string, SystemHealthSnapshot>;

function strategyActions(entityId: string): SystemNavigationActions {
  const actions: SystemNavigationActions = {};
  const engine = getEntityHref(entityId, "ENGINE");
  const signals = getEntityHref(entityId, "SIGNALS");
  const monitoring = getEntityHref(entityId, "MONITORING");
  const components = getEntityHref(entityId, "COMPONENTS");
  const brain = getEntityHref(entityId, "BRAIN");
  if (engine) actions.ENGINE = engine;
  if (signals) actions.SIGNALS = signals;
  if (monitoring) actions.MONITORING = monitoring;
  if (components) actions.COMPONENTS = components;
  if (brain) actions.BRAIN = brain;
  return actions;
}

function portfolioActions(entityId: string): SystemNavigationActions {
  const actions: SystemNavigationActions = {};
  const analytics = getEntityHref(entityId, "ANALYTICS");
  const brain = getEntityHref(entityId, "BRAIN");
  if (analytics) actions.ANALYTICS = analytics;
  if (brain) actions.BRAIN = brain;
  return actions;
}

function assetActions(entityId: string): SystemNavigationActions {
  const actions: SystemNavigationActions = {};
  const analytics = getEntityHref(entityId, "ANALYTICS");
  const modeling = getEntityHref(entityId, "MODELING");
  if (analytics) actions.ANALYTICS = analytics;
  if (modeling) actions.MODELING = modeling;
  return actions;
}

function createNode(input: {
  id: string;
  type: SystemNodeType;
  canonicalEntityId: string;
  label: string;
  preview: string;
  degree: number;
  community: number | null;
  metadata?: Record<string, string | number | boolean | null>;
  health?: SystemHealthSnapshot;
  navigationActions?: SystemNavigationActions;
}): SystemNode {
  const navigationActions = input.navigationActions ?? {};
  return {
    id: input.id,
    type: input.type,
    nodeType: input.type,
    label: input.label,
    folder: SYSTEM_FOLDERS[input.type],
    preview: input.preview,
    degree: input.degree,
    community: input.community,
    source: "dashboard",
    canonicalEntityId: input.canonicalEntityId,
    metadata: input.metadata ?? {},
    health: input.health ?? HEALTH.researchOnly,
    navigationActions,
    navActions: navigationActions,
  };
}

function createLink(
  from: string,
  to: string,
  relationship: SystemLinkRelationship,
  metadata: Record<string, string | number | boolean | null> = {},
): SystemLink {
  return {
    id: `${relationship}:${from}->${to}`,
    from,
    to,
    source: from,
    target: to,
    relationship,
    sourceSystem: "dashboard",
    metadata,
  };
}

const NODES: SystemNode[] = [
  createNode({
    id: "portfolio:white_swan",
    type: "PORTFOLIO",
    canonicalEntityId: "white_swan",
    label: "White Swan",
    preview: "Multi-strategy portfolio with seasonal, intraday, anomaly, and macro sleeves.",
    degree: 6,
    community: 0,
    metadata: {
      portfolioKey: "ws",
      production: true,
      category: "portfolio",
    },
    health: HEALTH.liveStrategy,
    navigationActions: portfolioActions("white_swan"),
  }),
  createNode({
    id: "portfolio:core_invest",
    type: "PORTFOLIO",
    canonicalEntityId: "core_invest",
    label: "Core Invest",
    preview: "Research / pre-fund portfolio context with ETF factor sleeve and managed futures overlay.",
    degree: 1,
    community: 3,
    metadata: {
      portfolioKey: "ci",
      production: false,
      category: "portfolio",
    },
    health: HEALTH.coreInvest,
    navigationActions: portfolioActions("core_invest"),
  }),
  createNode({
    id: "strategy:trend_momentum_dax_2h",
    type: "STRATEGY",
    canonicalEntityId: "trend_momentum_dax_2h",
    label: "DAX 2H (Trend/Momentum)",
    preview: "Canonical production strategy for DE30EUR on 2H bars. Engine key DAX_2H.",
    degree: 8,
    community: 1,
    metadata: {
      engineKey: "DAX_2H",
      productionInstrument: "DE30EUR",
      monitoringMarket: "FDAX1!",
      timeframe: "2H",
      sleeve: "intraday",
    },
    health: HEALTH.liveStrategy,
    navigationActions: strategyActions("trend_momentum_dax_2h"),
  }),
  createNode({
    id: "strategy:mt_dax_1h",
    type: "STRATEGY",
    canonicalEntityId: "mt_dax_1h",
    label: "DAX 1H (MT)",
    preview: "Canonical production strategy for DE30EUR on 1H bars. Engine key DAX_1H.",
    degree: 8,
    community: 1,
    metadata: {
      engineKey: "DAX_1H",
      productionInstrument: "DE30EUR",
      monitoringMarket: "FDAX1!",
      timeframe: "1H",
      sleeve: "intraday",
    },
    health: HEALTH.liveStrategy,
    navigationActions: strategyActions("mt_dax_1h"),
  }),
  createNode({
    id: "strategy:eurusd_mt_30m",
    type: "STRATEGY",
    canonicalEntityId: "eurusd_mt_30m",
    label: "EUR/USD 30M (MT)",
    preview: "Canonical production strategy for EURUSD on 30M bars. Engine key EUR_30M.",
    degree: 8,
    community: 2,
    metadata: {
      engineKey: "EUR_30M",
      productionInstrument: "EURUSD",
      monitoringMarket: "6E1!",
      timeframe: "30M",
      sleeve: "intraday",
    },
    health: HEALTH.liveStrategy,
    navigationActions: strategyActions("eurusd_mt_30m"),
  }),
  createNode({
    id: "instrument:DE30EUR",
    type: "INSTRUMENT",
    canonicalEntityId: "DE30EUR",
    label: "DE30EUR",
    preview: "Canonical production instrument for DAX 2H and DAX 1H.",
    degree: 3,
    community: 1,
    metadata: {
      assetClass: "index_cfd",
      provider: "OANDA",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "instrument:EURUSD",
    type: "INSTRUMENT",
    canonicalEntityId: "EURUSD",
    label: "EURUSD",
    preview: "Canonical production instrument for EUR/USD 30M.",
    degree: 2,
    community: 2,
    metadata: {
      assetClass: "fx",
      provider: "OANDA",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "market:FDAX1!",
    type: "MARKET",
    canonicalEntityId: "FDAX1!",
    label: "FDAX1! (DAX Futures)",
    preview: "Monitoring-only related market for DE30EUR context. Never substitute for production identity.",
    degree: 2,
    community: 1,
    metadata: {
      relationship: "RELATED_MARKET",
      exchange: "EUREX",
    },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: getEntityHref("DAX_2H", "MONITORING") ?? "/monitoring" },
  }),
  createNode({
    id: "market:6E1!",
    type: "MARKET",
    canonicalEntityId: "6E1!",
    label: "6E1! (Euro FX Futures)",
    preview: "Monitoring-only related market for EURUSD context. Never substitute for production identity.",
    degree: 2,
    community: 2,
    metadata: {
      relationship: "RELATED_MARKET",
      exchange: "CME",
    },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: getEntityHref("EUR_30M", "MONITORING") ?? "/monitoring" },
  }),
  createNode({
    id: "dataset:de30eur_30m_canon",
    type: "DATASET",
    canonicalEntityId: "de30eur_30m_canon",
    label: "DE30EUR 30M (canonical)",
    preview: "Canonical DE30EUR 30M bar series. Source for both DAX intraday production derivatives.",
    degree: 3,
    community: 1,
    metadata: {
      instrument: "DE30EUR",
      timeframe: "30M",
      role: "canonical_bars",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "dataset:eurusd_30m_canon",
    type: "DATASET",
    canonicalEntityId: "eurusd_30m_canon",
    label: "EURUSD 30M (canonical)",
    preview: "Canonical EURUSD native 30M bar series.",
    degree: 2,
    community: 2,
    metadata: {
      instrument: "EURUSD",
      timeframe: "30M",
      role: "canonical_bars",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "dataset:production_v1_dax_2h",
    type: "DATASET",
    canonicalEntityId: "production_v1_dax_2h",
    label: "Production v1 - Berlin 2H",
    preview: "Derived 2H bars from the canonical DE30EUR 30M dataset.",
    degree: 2,
    community: 1,
    metadata: {
      instrument: "DE30EUR",
      timeframe: "2H",
      role: "derived_bars",
      timezone: "Europe/Berlin",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "dataset:production_v1_dax_1h",
    type: "DATASET",
    canonicalEntityId: "production_v1_dax_1h",
    label: "Production v1 - Berlin 1H",
    preview: "Derived 1H bars from the canonical DE30EUR 30M dataset.",
    degree: 2,
    community: 1,
    metadata: {
      instrument: "DE30EUR",
      timeframe: "1H",
      role: "derived_bars",
      timezone: "Europe/Berlin",
    },
    health: HEALTH.researchOnly,
  }),
  createNode({
    id: "runtime:dax2h",
    type: "RUNTIME",
    canonicalEntityId: "runtime:trend_momentum_dax_2h",
    label: "DAX 2H Runtime",
    preview: "Runtime evaluation and signal publication surface for trend_momentum_dax_2h.",
    degree: 4,
    community: 1,
    metadata: {
      strategy: "trend_momentum_dax_2h",
      engineKey: "DAX_2H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: {
      ENGINE: getEntityHref("DAX_2H", "ENGINE") ?? "/engine",
      SIGNALS: getEntityHref("DAX_2H", "SIGNALS") ?? "/signals",
    },
  }),
  createNode({
    id: "runtime:dax1h",
    type: "RUNTIME",
    canonicalEntityId: "runtime:mt_dax_1h",
    label: "DAX 1H Runtime",
    preview: "Runtime evaluation and signal publication surface for mt_dax_1h.",
    degree: 4,
    community: 1,
    metadata: {
      strategy: "mt_dax_1h",
      engineKey: "DAX_1H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: {
      ENGINE: getEntityHref("DAX_1H", "ENGINE") ?? "/engine",
      SIGNALS: getEntityHref("DAX_1H", "SIGNALS") ?? "/signals",
    },
  }),
  createNode({
    id: "runtime:eur30m",
    type: "RUNTIME",
    canonicalEntityId: "runtime:eurusd_mt_30m",
    label: "EUR 30M Runtime",
    preview: "Runtime evaluation and signal publication surface for eurusd_mt_30m.",
    degree: 4,
    community: 2,
    metadata: {
      strategy: "eurusd_mt_30m",
      engineKey: "EUR_30M",
    },
    health: HEALTH.liveStrategy,
    navigationActions: {
      ENGINE: getEntityHref("EUR_30M", "ENGINE") ?? "/engine",
      SIGNALS: getEntityHref("EUR_30M", "SIGNALS") ?? "/signals",
    },
  }),
  createNode({
    id: "signal-state:dax2h",
    type: "SIGNAL_STATE",
    canonicalEntityId: "signal:trend_momentum_dax_2h",
    label: "DAX 2H Signal State",
    preview: "Current published signal state for DAX 2H strategy.",
    degree: 2,
    community: 1,
    metadata: {
      strategy: "trend_momentum_dax_2h",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { SIGNALS: getEntityHref("DAX_2H", "SIGNALS") ?? "/signals" },
  }),
  createNode({
    id: "signal-state:dax1h",
    type: "SIGNAL_STATE",
    canonicalEntityId: "signal:mt_dax_1h",
    label: "DAX 1H Signal State",
    preview: "Current published signal state for DAX 1H strategy.",
    degree: 2,
    community: 1,
    metadata: {
      strategy: "mt_dax_1h",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { SIGNALS: getEntityHref("DAX_1H", "SIGNALS") ?? "/signals" },
  }),
  createNode({
    id: "signal-state:eur30m",
    type: "SIGNAL_STATE",
    canonicalEntityId: "signal:eurusd_mt_30m",
    label: "EUR 30M Signal State",
    preview: "Current published signal state for EUR 30M strategy.",
    degree: 2,
    community: 2,
    metadata: {
      strategy: "eurusd_mt_30m",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { SIGNALS: getEntityHref("EUR_30M", "SIGNALS") ?? "/signals" },
  }),
  createNode({
    id: "monitoring-chart:dax2h",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:FDAX1!:2H",
    label: "DAX 2H Monitoring Chart",
    preview: "Monitoring chart context for FDAX1! on 2H, related to DAX 2H production strategy.",
    degree: 2,
    community: 1,
    metadata: {
      symbol: "FDAX1!",
      timeframe: "2H",
      relatedTo: "trend_momentum_dax_2h",
    },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: getEntityHref("DAX_2H", "MONITORING") ?? "/monitoring" },
  }),
  createNode({
    id: "monitoring-chart:dax1h",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:FDAX1!:1H",
    label: "DAX 1H Monitoring Chart",
    preview: "Monitoring chart context for FDAX1! on 1H, related to DAX 1H production strategy.",
    degree: 2,
    community: 1,
    metadata: {
      symbol: "FDAX1!",
      timeframe: "1H",
      relatedTo: "mt_dax_1h",
    },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: getEntityHref("DAX_1H", "MONITORING") ?? "/monitoring" },
  }),
  createNode({
    id: "monitoring-chart:eur30m",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:6E1!:30M",
    label: "EUR 30M Monitoring Chart",
    preview: "Monitoring chart context for 6E1! on 30M, related to EUR 30M production strategy.",
    degree: 2,
    community: 2,
    metadata: {
      symbol: "6E1!",
      timeframe: "30M",
      relatedTo: "eurusd_mt_30m",
    },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: getEntityHref("EUR_30M", "MONITORING") ?? "/monitoring" },
  }),
  createNode({
    id: "engine-surface:dax2h",
    type: "ENGINE_SURFACE",
    canonicalEntityId: "engine:DAX_2H",
    label: "Engine - DAX 2H",
    preview: "Trading Engine strategy surface for DAX_2H.",
    degree: 1,
    community: 1,
    metadata: {
      engineKey: "DAX_2H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { ENGINE: getEntityHref("DAX_2H", "ENGINE") ?? "/engine" },
  }),
  createNode({
    id: "engine-surface:dax1h",
    type: "ENGINE_SURFACE",
    canonicalEntityId: "engine:DAX_1H",
    label: "Engine - DAX 1H",
    preview: "Trading Engine strategy surface for DAX_1H.",
    degree: 1,
    community: 1,
    metadata: {
      engineKey: "DAX_1H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { ENGINE: getEntityHref("DAX_1H", "ENGINE") ?? "/engine" },
  }),
  createNode({
    id: "engine-surface:eur30m",
    type: "ENGINE_SURFACE",
    canonicalEntityId: "engine:EUR_30M",
    label: "Engine - EUR 30M",
    preview: "Trading Engine strategy surface for EUR_30M.",
    degree: 1,
    community: 2,
    metadata: {
      engineKey: "EUR_30M",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { ENGINE: getEntityHref("EUR_30M", "ENGINE") ?? "/engine" },
  }),
  createNode({
    id: "components-surface:dax2h",
    type: "COMPONENT_SURFACE",
    canonicalEntityId: "components:DAX_2H",
    label: "Components - DAX 2H",
    preview: "Components surface for DAX_2H strategy decomposition.",
    degree: 1,
    community: 1,
    metadata: {
      engineKey: "DAX_2H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { COMPONENTS: getEntityHref("DAX_2H", "COMPONENTS") ?? "/komponenten" },
  }),
  createNode({
    id: "components-surface:dax1h",
    type: "COMPONENT_SURFACE",
    canonicalEntityId: "components:DAX_1H",
    label: "Components - DAX 1H",
    preview: "Components surface for DAX_1H strategy decomposition.",
    degree: 1,
    community: 1,
    metadata: {
      engineKey: "DAX_1H",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { COMPONENTS: getEntityHref("DAX_1H", "COMPONENTS") ?? "/komponenten" },
  }),
  createNode({
    id: "components-surface:eur30m",
    type: "COMPONENT_SURFACE",
    canonicalEntityId: "components:EUR_30M",
    label: "Components - EUR 30M",
    preview: "Components surface for EUR_30M strategy decomposition.",
    degree: 1,
    community: 2,
    metadata: {
      engineKey: "EUR_30M",
    },
    health: HEALTH.liveStrategy,
    navigationActions: { COMPONENTS: getEntityHref("EUR_30M", "COMPONENTS") ?? "/komponenten" },
  }),
  createNode({
    id: "asset:SPY",
    type: "ASSET",
    canonicalEntityId: "asset-SPY",
    label: "SPY (S&P 500 ETF)",
    preview: "Reference asset with historical dataset and Modeling selection context.",
    degree: 1,
    community: 3,
    metadata: {
      assetClass: "etf",
      symbol: "SPY",
    },
    health: HEALTH.researchOnly,
    navigationActions: assetActions("asset-SPY"),
  }),
  // ── ETF universe — verified in monitoring Metals/ETFs tabs (2026-08-11) ────
  createNode({
    id: "asset:QQQ",
    type: "ASSET",
    canonicalEntityId: "asset-QQQ",
    label: "QQQ (Nasdaq ETF)",
    preview: "Nasdaq 100 ETF — ETFs monitoring tab, 45% weight in Core Invest passive sleeve.",
    degree: 1,
    community: 3,
    metadata: { assetClass: "etf", symbol: "QQQ" },
    health: HEALTH.researchOnly,
    navigationActions: { MONITORING: "/monitoring?tab=etfs" },
  }),
  createNode({
    id: "asset:SPMO",
    type: "ASSET",
    canonicalEntityId: "asset-SPMO",
    label: "SPMO (S&P Momentum ETF)",
    preview: "S&P 500 Momentum ETF — ETFs monitoring tab, 5% weight in Core Invest.",
    degree: 1,
    community: 3,
    metadata: { assetClass: "etf", symbol: "SPMO" },
    health: HEALTH.researchOnly,
    navigationActions: { MONITORING: "/monitoring?tab=etfs" },
  }),
  createNode({
    id: "asset:GLD",
    type: "ASSET",
    canonicalEntityId: "asset-GLD",
    label: "GLD (Gold ETF)",
    preview: "Gold ETF — ETFs monitoring tab and Anomaly tab (GLD Thursday Long strategy).",
    degree: 2,
    community: 3,
    metadata: { assetClass: "etf", symbol: "GLD" },
    health: HEALTH.researchOnly,
    navigationActions: { MONITORING: "/monitoring?tab=etfs" },
  }),
  // ── Metals universe — verified in monitoring Metals tab (2026-08-11) ────────
  createNode({
    id: "monitoring-chart:GC1!:D",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:GC1!:D",
    label: "Gold (GC1!) Monitoring Chart",
    preview: "Daily OHLC chart for COMEX Gold futures — Metals monitoring tab and Anomaly tab.",
    degree: 1,
    community: 1,
    metadata: { symbol: "GC1!", timeframe: "D", tab: "metals" },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: "/monitoring?tab=metals" },
  }),
  createNode({
    id: "monitoring-chart:SI1!:D",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:SI1!:D",
    label: "Silver (SI1!) Monitoring Chart",
    preview: "Daily OHLC chart for COMEX Silver futures — Metals monitoring tab.",
    degree: 1,
    community: 1,
    metadata: { symbol: "SI1!", timeframe: "D", tab: "metals" },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: "/monitoring?tab=metals" },
  }),
  createNode({
    id: "monitoring-chart:HG1!:D",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:HG1!:D",
    label: "Copper (HG1!) Monitoring Chart",
    preview: "Daily OHLC chart for COMEX Copper futures — Metals monitoring tab.",
    degree: 1,
    community: 1,
    metadata: { symbol: "HG1!", timeframe: "D", tab: "metals" },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: "/monitoring?tab=metals" },
  }),
  createNode({
    id: "monitoring-chart:PL1!:D",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:PL1!:D",
    label: "Platinum (PL1!) Monitoring Chart",
    preview: "Daily OHLC chart for NYMEX Platinum futures — Metals monitoring tab.",
    degree: 1,
    community: 1,
    metadata: { symbol: "PL1!", timeframe: "D", tab: "metals" },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: "/monitoring?tab=metals" },
  }),
  createNode({
    id: "monitoring-chart:PA1!:D",
    type: "MONITORING_CHART",
    canonicalEntityId: "monitoring:PA1!:D",
    label: "Palladium (PA1!) Monitoring Chart",
    preview: "Daily OHLC chart for NYMEX Palladium futures — Metals monitoring tab.",
    degree: 1,
    community: 1,
    metadata: { symbol: "PA1!", timeframe: "D", tab: "metals" },
    health: HEALTH.relatedMarket,
    navigationActions: { MONITORING: "/monitoring?tab=metals" },
  }),
];

const LINKS: SystemLink[] = [
  createLink("portfolio:white_swan", "strategy:trend_momentum_dax_2h", "PORTFOLIO_MEMBERSHIP"),
  createLink("portfolio:white_swan", "strategy:mt_dax_1h", "PORTFOLIO_MEMBERSHIP"),
  createLink("portfolio:white_swan", "strategy:eurusd_mt_30m", "PORTFOLIO_MEMBERSHIP"),
  createLink("strategy:trend_momentum_dax_2h", "instrument:DE30EUR", "USES_PRODUCTION_INSTRUMENT"),
  createLink("strategy:mt_dax_1h", "instrument:DE30EUR", "USES_PRODUCTION_INSTRUMENT"),
  createLink("strategy:eurusd_mt_30m", "instrument:EURUSD", "USES_PRODUCTION_INSTRUMENT"),
  createLink("instrument:DE30EUR", "dataset:de30eur_30m_canon", "USES_DATASET"),
  createLink("dataset:de30eur_30m_canon", "dataset:production_v1_dax_2h", "DERIVES_BARS_FROM", { timeframe: "2H" }),
  createLink("dataset:de30eur_30m_canon", "dataset:production_v1_dax_1h", "DERIVES_BARS_FROM", { timeframe: "1H" }),
  createLink("dataset:eurusd_30m_canon", "strategy:eurusd_mt_30m", "USES_DATASET", { timeframe: "30M" }),
  createLink("dataset:production_v1_dax_2h", "strategy:trend_momentum_dax_2h", "USES_DATASET", { timeframe: "2H" }),
  createLink("dataset:production_v1_dax_1h", "strategy:mt_dax_1h", "USES_DATASET", { timeframe: "1H" }),
  createLink("strategy:trend_momentum_dax_2h", "runtime:dax2h", "EVALUATED_BY_RUNTIME"),
  createLink("strategy:mt_dax_1h", "runtime:dax1h", "EVALUATED_BY_RUNTIME"),
  createLink("strategy:eurusd_mt_30m", "runtime:eur30m", "EVALUATED_BY_RUNTIME"),
  createLink("runtime:dax2h", "signal-state:dax2h", "PUBLISHES_SIGNAL_STATE"),
  createLink("runtime:dax1h", "signal-state:dax1h", "PUBLISHES_SIGNAL_STATE"),
  createLink("runtime:eur30m", "signal-state:eur30m", "PUBLISHES_SIGNAL_STATE"),
  createLink("strategy:trend_momentum_dax_2h", "monitoring-chart:dax2h", "VISUALIZED_IN_MONITORING"),
  createLink("strategy:mt_dax_1h", "monitoring-chart:dax1h", "VISUALIZED_IN_MONITORING"),
  createLink("strategy:eurusd_mt_30m", "monitoring-chart:eur30m", "VISUALIZED_IN_MONITORING"),
  createLink("strategy:trend_momentum_dax_2h", "engine-surface:dax2h", "EXECUTED_IN_ENGINE"),
  createLink("strategy:mt_dax_1h", "engine-surface:dax1h", "EXECUTED_IN_ENGINE"),
  createLink("strategy:eurusd_mt_30m", "engine-surface:eur30m", "EXECUTED_IN_ENGINE"),
  createLink("strategy:trend_momentum_dax_2h", "components-surface:dax2h", "EXPLAINED_IN_COMPONENTS"),
  createLink("strategy:mt_dax_1h", "components-surface:dax1h", "EXPLAINED_IN_COMPONENTS"),
  createLink("strategy:eurusd_mt_30m", "components-surface:eur30m", "EXPLAINED_IN_COMPONENTS"),
  createLink("market:FDAX1!", "instrument:DE30EUR", "RELATED_MARKET"),
  createLink("market:6E1!", "instrument:EURUSD", "RELATED_MARKET"),
];

export function buildSystemGraph(): SystemGraph {
  const nodeIds = new Set(NODES.map((node) => node.id));
  const validLinks = LINKS.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to));
  return { nodes: NODES, links: validLinks };
}
