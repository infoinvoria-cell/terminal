// ModelingRegistry.ts — canonical registry of all selectable modeling subjects
// Only entries with real data in dataset.groupSeries are listed as strategies/assets.
// Phantom entries (no series) are excluded to avoid silent fallback to portfolio data.

export type AvailableModels = {
  equity: boolean;
  drawdown: boolean;
  monteCarlo: boolean;
  mcOutcome: boolean;
  returnDist: boolean;
  rollingMetrics: boolean;
  tailRisk: boolean;
  regression: boolean;
  drawdownRecovery: boolean;
  dynamicCorrelation: boolean;
  monteCarlo3D: boolean;
  mcOutcome3D: boolean;
  drawdownRecovery3D: boolean;
};

export type AggregationPolicy = "canonical-portfolio" | "canonical-group" | "single-series" | "unavailable";

export type CardSpan = "SMALL" | "MEDIUM" | "LARGE" | "WIDE";

export type ModelingSubjectEntry = {
  id: string;
  label: string;
  typeLabel: string;
  kind: "portfolio" | "group" | "strategy" | "asset" | "custom";
  preferredSpan?: CardSpan;
  section:
    | "portfolios"
    | "groups"
    | "ws-strategies"
    | "ws-seasonal"
    | "core-invest"
    | "monitoring-agrar"
    | "monitoring-metalle"
    | "monitoring-energie"
    | "monitoring-indizes"
    | "monitoring-fx"
    | "monitoring-aktien"
    | "other"
    | "custom";
  tab?: "whiteSwan" | "invest" | "combined";
  groupSeriesId?: string;
  parentGroupId?: string;
  aggregationPolicy: AggregationPolicy;
  availableModels: AvailableModels;
};

// ─── Capability templates ───────────────────────────────────────────────────

const FULL_MODELS: AvailableModels = {
  equity: true, drawdown: true, monteCarlo: true, mcOutcome: true,
  returnDist: true, rollingMetrics: true, tailRisk: true,
  regression: true, drawdownRecovery: true, dynamicCorrelation: true,
  monteCarlo3D: true, mcOutcome3D: true, drawdownRecovery3D: true,
};

const STRATEGY_MODELS: AvailableModels = {
  equity: true, drawdown: true, monteCarlo: true, mcOutcome: true,
  returnDist: true, rollingMetrics: true, tailRisk: true,
  regression: true, drawdownRecovery: true, dynamicCorrelation: true,
  monteCarlo3D: true, mcOutcome3D: true, drawdownRecovery3D: true,
};

const ASSET_MODELS: AvailableModels = {
  equity: true, drawdown: true, monteCarlo: true, mcOutcome: true,
  returnDist: true, rollingMetrics: true, tailRisk: true,
  regression: true, drawdownRecovery: true, dynamicCorrelation: false,
  monteCarlo3D: true, mcOutcome3D: true, drawdownRecovery3D: false,
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const MODELING_REGISTRY: ModelingSubjectEntry[] = [

  // ── PORTFOLIOS ────────────────────────────────────────────────────────────
  {
    id: "portfolio-ws",
    label: "White Swan",
    typeLabel: "PORTFOLIO",
    kind: "portfolio",
    section: "portfolios",
    tab: "whiteSwan",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },
  {
    id: "portfolio-invest",
    label: "Core Invest",
    typeLabel: "PORTFOLIO",
    kind: "portfolio",
    section: "portfolios",
    tab: "invest",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },
  {
    id: "portfolio-combined",
    label: "Combined",
    typeLabel: "PORTFOLIO",
    kind: "portfolio",
    section: "portfolios",
    tab: "combined",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },

  // ── GROUPS ────────────────────────────────────────────────────────────────
  // Groups aggregate their children using the canonical portfolio weighting.
  // If the portfolio has no defined aggregation for the group, the group
  // resolves to the portfolio series and shows a data-availability notice.
  {
    id: "group-ws-all",
    label: "White Swan — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    tab: "whiteSwan",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },
  {
    id: "group-intraday",
    label: "Intraday MT — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    tab: "whiteSwan",
    groupSeriesId: "Intraday MT v3-F",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-invest-all",
    label: "Core Invest — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    tab: "invest",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },

  // ── WHITE SWAN STRATEGIES (confirmed data in whiteSwan groupSeries) ────────
  {
    id: "GC1 Friday Long",
    label: "GC1 Friday Long",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "GC1 Friday Long",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "GLD Thursday Long",
    label: "GLD Thursday Long",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "GLD Thursday Long",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "YM1 TAT",
    label: "YM1 TAT",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "YM1 TAT",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "Intraday MT v3-F",
    label: "Intraday MT v3-F",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "Intraday MT v3-F",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "UKX Valuation",
    label: "UKX Valuation",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "UKX Valuation",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "CT1 Macro A",
    label: "CT1 Macro A",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "CT1 Macro A",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "NQ1 Trend LO",
    label: "NQ1 Trend LO",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "ws-strategies",
    tab: "whiteSwan",
    groupSeriesId: "NQ1 Trend LO",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },

  // ── CORE INVEST STRATEGIES (confirmed in invest strategySeries) ────────────
  {
    id: "strategy-estep",
    label: "E-Step Invest",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "core-invest",
    tab: "invest",
    groupSeriesId: "E-Step Invest",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "strategy-valuation",
    label: "Only Long Valuation",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "core-invest",
    tab: "invest",
    groupSeriesId: "Only Long Valuation Trend EMA",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "strategy-chf",
    label: "CHF Invest",
    typeLabel: "STRATEGY",
    kind: "strategy",
    section: "core-invest",
    tab: "invest",
    groupSeriesId: "CHF Invest",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },

  // ── CORE INVEST ASSETS (invest groupSeries is currently empty; ─────────────
  // these show UNAVAILABLE for individual series until data is populated)
  {
    id: "asset-GLD",
    label: "GLD",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "GLD",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-SPY",
    label: "SPY",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "SPY",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-QQQ",
    label: "QQQ",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "QQQ",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-SPMO",
    label: "SPMO",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "SPMO",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-QQQ-pine",
    label: "QQQ Pine 1",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "WHITE_SWAN_NAS_EMA",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-COPPER",
    label: "Copper / HG",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "COPPER_HG",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "asset-CHF",
    label: "CHF / 6S",
    typeLabel: "ASSET",
    kind: "asset",
    section: "core-invest",
    groupSeriesId: "CHF_6S",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── WS SEASONAL STRATEGIES (WS Seasonal sleeve — confirmed data) ──────────
  // These are the Seasonal (12) sleeve strategies in the WS portfolio.
  // GC1 Friday Long and GLD Thursday Long are also listed under ws-strategies
  // but belong conceptually to the seasonal sleeve.
  {
    id: "ws-seasonal-gc1",
    label: "GC1 Friday Long",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "GC1 Friday Long",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "ws-seasonal-gld",
    label: "GLD Thursday Long",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "GLD Thursday Long",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "ws-seasonal-ct1",
    label: "CT1 Macro A",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "CT1 Macro A",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "ws-seasonal-ukx",
    label: "UKX Valuation",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "UKX Valuation",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "ws-seasonal-nq1",
    label: "NQ1 Trend LO",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "NQ1 Trend LO",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "ws-seasonal-ym1",
    label: "YM1 TAT",
    typeLabel: "SEASONAL",
    kind: "strategy",
    section: "ws-seasonal",
    tab: "whiteSwan",
    groupSeriesId: "YM1 TAT",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },

  // ── MONITORING GROUPS (group-level entries for the monitoring universe) ────
  {
    id: "group-agrar-all",
    label: "Agrar — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "AGRAR_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-metalle-all",
    label: "Metalle — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "METALLE_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-energie-all",
    label: "Energie — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "ENERGIE_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-indizes-all",
    label: "Indizes — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "INDIZES_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-fx-all",
    label: "FX — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "FX_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-aktien-all",
    label: "Aktien — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    groupSeriesId: "AKTIEN_ALL",
    aggregationPolicy: "single-series",
    availableModels: STRATEGY_MODELS,
  },
  {
    id: "group-seasonal-all",
    label: "Seasonal — All",
    typeLabel: "GROUP",
    kind: "group",
    section: "groups",
    tab: "whiteSwan",
    aggregationPolicy: "canonical-portfolio",
    availableModels: FULL_MODELS,
  },

  // ── AGRAR — 8 agricultural commodity strategies ───────────────────────────
  {
    id: "agrar-ZC1",
    label: "ZC1! — Corn",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "ZC1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-ZW1",
    label: "ZW1! — Wheat",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "ZW1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-CC1",
    label: "CC1! — Cocoa",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "CC1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-OJ1",
    label: "OJ1! — Orange Juice",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "OJ1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-SB1",
    label: "SB1! — Sugar",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "SB1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-CT1",
    label: "CT1! — Cotton",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "CT1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-KC1",
    label: "KC1! — Coffee",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "KC1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "agrar-ZS1",
    label: "ZS1! — Soybeans",
    typeLabel: "AGRAR",
    kind: "asset",
    section: "monitoring-agrar",
    groupSeriesId: "ZS1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── METALLE — 5 metals strategies ────────────────────────────────────────
  {
    id: "metalle-GC1",
    label: "GC1! — Gold",
    typeLabel: "METALL",
    kind: "asset",
    section: "monitoring-metalle",
    groupSeriesId: "GC1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "metalle-SI1",
    label: "SI1! — Silver",
    typeLabel: "METALL",
    kind: "asset",
    section: "monitoring-metalle",
    groupSeriesId: "SI1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "metalle-HG1",
    label: "HG1! — Copper",
    typeLabel: "METALL",
    kind: "asset",
    section: "monitoring-metalle",
    groupSeriesId: "HG1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "metalle-PA1",
    label: "PA1! — Palladium",
    typeLabel: "METALL",
    kind: "asset",
    section: "monitoring-metalle",
    groupSeriesId: "PA1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "metalle-PL1",
    label: "PL1! — Platinum",
    typeLabel: "METALL",
    kind: "asset",
    section: "monitoring-metalle",
    groupSeriesId: "PL1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── ENERGIE — 3 energy strategies ────────────────────────────────────────
  {
    id: "energie-CL1",
    label: "CL1! — Crude Oil",
    typeLabel: "ENERGIE",
    kind: "asset",
    section: "monitoring-energie",
    groupSeriesId: "CL1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "energie-NG1",
    label: "NG1! — Natural Gas",
    typeLabel: "ENERGIE",
    kind: "asset",
    section: "monitoring-energie",
    groupSeriesId: "NG1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "energie-RB1",
    label: "RB1! — RBOB Gasoline",
    typeLabel: "ENERGIE",
    kind: "asset",
    section: "monitoring-energie",
    groupSeriesId: "RB1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── INDIZES — 5 index strategies ─────────────────────────────────────────
  {
    id: "indiz-FDAX1",
    label: "FDAX1! — DAX",
    typeLabel: "INDEX",
    kind: "asset",
    section: "monitoring-indizes",
    groupSeriesId: "FDAX1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "indiz-ES1",
    label: "ES1! — S&P 500",
    typeLabel: "INDEX",
    kind: "asset",
    section: "monitoring-indizes",
    groupSeriesId: "ES1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "indiz-YM1",
    label: "YM1! — Dow Jones",
    typeLabel: "INDEX",
    kind: "asset",
    section: "monitoring-indizes",
    groupSeriesId: "YM1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "indiz-NQ1",
    label: "NQ1! — Nasdaq 100",
    typeLabel: "INDEX",
    kind: "asset",
    section: "monitoring-indizes",
    groupSeriesId: "NQ1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "indiz-UKX",
    label: "UKX! — FTSE 100",
    typeLabel: "INDEX",
    kind: "asset",
    section: "monitoring-indizes",
    groupSeriesId: "UKX!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── FX — 8 forex strategies ───────────────────────────────────────────────
  {
    id: "fx-6E1",
    label: "6E1! — Euro FX",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "6E1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-6B1",
    label: "6B1! — British Pound",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "6B1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-6S1",
    label: "6S1! — Swiss Franc",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "6S1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-NOK1",
    label: "NOK1! — Norwegian Krone",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "NOK1!",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-EURGBP",
    label: "EUR/GBP",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "EURGBP",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-GBPJPY",
    label: "GBP/JPY",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "GBPJPY",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-MXNUSD",
    label: "MXN/USD",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "MXNUSD",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "fx-ZARUSD",
    label: "ZAR/USD",
    typeLabel: "FX",
    kind: "asset",
    section: "monitoring-fx",
    groupSeriesId: "ZARUSD",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── AKTIEN — 6 stock strategies ───────────────────────────────────────────
  {
    id: "aktien-AAPL",
    label: "AAPL — Apple",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "AAPL",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "aktien-MSFT",
    label: "MSFT — Microsoft",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "MSFT",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "aktien-NVDA",
    label: "NVDA — Nvidia",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "NVDA",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "aktien-GOOGL",
    label: "GOOGL — Alphabet",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "GOOGL",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "aktien-META",
    label: "META — Meta",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "META",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },
  {
    id: "aktien-AMZN",
    label: "AMZN — Amazon",
    typeLabel: "AKTIE",
    kind: "asset",
    section: "monitoring-aktien",
    groupSeriesId: "AMZN",
    aggregationPolicy: "single-series",
    availableModels: ASSET_MODELS,
  },

  // ── CUSTOM ────────────────────────────────────────────────────────────────
  {
    id: "custom-combination",
    label: "Custom Combination",
    typeLabel: "CUSTOM",
    kind: "custom",
    section: "custom",
    aggregationPolicy: "unavailable",
    availableModels: { ...FULL_MODELS },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function searchRegistry(query: string): ModelingSubjectEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return MODELING_REGISTRY;
  return MODELING_REGISTRY.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.typeLabel.toLowerCase().includes(q) ||
      (e.groupSeriesId ?? "").toLowerCase().includes(q),
  );
}

export function getRegistryEntry(id: string): ModelingSubjectEntry | undefined {
  return MODELING_REGISTRY.find((e) => e.id === id);
}

export function entriesForSection(
  section: ModelingSubjectEntry["section"],
): ModelingSubjectEntry[] {
  return MODELING_REGISTRY.filter((e) => e.section === section);
}

// Inventory summary (for reporting)
export const REGISTRY_INVENTORY = {
  portfolioCount: MODELING_REGISTRY.filter((e) => e.kind === "portfolio").length,
  groupCount: MODELING_REGISTRY.filter((e) => e.kind === "group").length,
  strategyCount: MODELING_REGISTRY.filter((e) => e.kind === "strategy").length,
  assetCount: MODELING_REGISTRY.filter((e) => e.kind === "asset").length,
  groupNames: MODELING_REGISTRY
    .filter((e) => e.kind === "group")
    .map((e) => e.label),
};
