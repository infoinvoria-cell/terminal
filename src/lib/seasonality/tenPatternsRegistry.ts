/**
 * Ten Patterns Registry — single source of truth for the 10 validated seasonal patterns.
 *
 * This file contains ONLY pattern definitions (metadata, rules, data sources).
 * NO KPI values, NO returns, NO win rates.
 * All performance data must come from computed result JSON files.
 *
 * Version: 1.0.0 — 2026-07-30
 */

export const TEN_PATTERNS_REGISTRY_VERSION = "1.0.0";

export type PatternStatus =
  | "not_tested"           // No computation has been run yet
  | "calculated"           // Historical KPIs + WF computed successfully (≥10 trades)
  | "insufficient_history" // < 10 valid historical trades; no KPIs shown
  | "no_data_source"       // CSV data not available for this asset
  | "calculation_failed";  // API error or computation error; no KPIs shown

export type PatternRobustness =
  | "robust"
  | "conditionally_robust"
  | "further_testing_needed"
  | "unstable"
  | "not_assessable";

export interface TenPatternDef {
  /** Unique stable ID — never change after first use */
  patternId: string;
  /** Override for icon lookup (e.g. soymeal uses ZS icon) */
  iconAssetId?: string;
  /** Calendar day of year (1–365) for countdown; approx from anchorStartSlot */
  calStart: number;
  /** Version for cache invalidation */
  version: string;
  /** Display info */
  displayName: string;
  category: "Energie" | "Metalle" | "Agrar" | "Indizes";
  /** Asset registry key */
  assetId: string;
  /** TradingView continuous-future symbol */
  tvSymbol: string;
  /** Provider symbol used in monitoring */
  monitoringSymbol: string;
  /** Exchange */
  exchange: string;
  /** Futures or ETF or spot */
  instrumentType: "continuous_futures" | "etf" | "spot";
  /** Trade direction */
  direction: "LONG" | "SHORT";
  /** Approximate anchor trading-day slot (1–252) */
  anchorStartSlot: number;
  /** Target holding period in trading days (used as WF anchor) */
  holdingDaysBasis: number;
  /** Calendar description for display */
  windowDisplay: string;
  /**
   * CSV data source path relative to project root.
   * null = no local CSV — relies on Yahoo fallback or is unavailable.
   */
  csvPath: string | null;
  /** Backadjustment method as declared in the data source */
  backadjustmentStatus: "assumed_backadjusted" | "verified_backadjusted" | "not_backadjusted" | "unknown";
  /** Timezone of primary trading session */
  tradingTimezone: "America/Chicago" | "America/New_York" | "Europe/Frankfurt";
  /** Primary session open/close (local time) */
  sessionHours: string;
  /** Roll logic assumption */
  rollNote: string;
  /** Cost assumptions for backtesting */
  costAssumptions: {
    slippageBps: number;
    commissionBps: number;
    totalRoundTripBps: number;
  };
  /** Economic rationale (research only — not a validated signal) */
  rationale: string;
  /** Multiple-testing correction tier applied */
  multipleTestingTier: "bonferroni" | "fdr" | "none";
  /** Minimum observations required for any KPI to be displayed */
  minObservations: number;
}

export const TEN_PATTERNS: TenPatternDef[] = [
  {
    patternId: "rb1_long_slot29_v1",
    version: "1.0.0",
    displayName: "RBOB Gasoline",
    category: "Energie",
    calStart: 39,
    assetId: "rb1",
    tvSymbol: "NYMEX:RB1!",
    monitoringSymbol: "RB1!",
    exchange: "NYMEX",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 29,
    holdingDaysBasis: 10,
    windowDisplay: "Feb 8 – 16 (ca.)",
    csvPath: "data/historical/energy/NYMEX_RB1_D.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "09:00–14:30",
    rollNote: "TradingView continuous backadjusted. Roll typically occurs last 2–3 days of month before expiry.",
    costAssumptions: { slippageBps: 3, commissionBps: 2, totalRoundTripBps: 10 },
    rationale: "Pre-summer driving season builds RFG demand; refiners increase blending purchases.",
    multipleTestingTier: "bonferroni",
    minObservations: 10,
  },
  {
    patternId: "zw1_long_slot152_v1",
    version: "1.0.0",
    displayName: "Chicago Wheat",
    category: "Agrar",
    calStart: 222,
    assetId: "wheat",
    tvSymbol: "CBOT:ZW1!",
    monitoringSymbol: "ZW1!",
    exchange: "CBOT",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 152,
    holdingDaysBasis: 10,
    windowDisplay: "Aug 10 – 20 (ca.)",
    csvPath: "workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/Chicago",
    sessionHours: "08:30–13:15",
    rollNote: "TradingView continuous backadjusted. Major expiry months: Mar, May, Jul, Sep, Dec.",
    costAssumptions: { slippageBps: 3, commissionBps: 2, totalRoundTripBps: 10 },
    rationale: "Northern-hemisphere harvest pressure fades; global supply picture clarifies.",
    multipleTestingTier: "bonferroni",
    minObservations: 10,
  },
  {
    patternId: "gc1_long_slot128_v1",
    version: "1.0.0",
    displayName: "Gold",
    category: "Metalle",
    calStart: 206,
    assetId: "gc1",
    tvSymbol: "COMEX:GC1!",
    monitoringSymbol: "GC1!",
    exchange: "COMEX",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 128,
    holdingDaysBasis: 10,
    windowDisplay: "Jul 25 – 31 (ca.)",
    csvPath: "data/historical/metals/COMEX_GC1_D.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "08:20–13:30",
    rollNote: "TradingView continuous backadjusted. Main contract months: Feb, Apr, Jun, Aug, Oct, Dec.",
    costAssumptions: { slippageBps: 2, commissionBps: 1, totalRoundTripBps: 6 },
    rationale: "Pre-India wedding season demand ramp; jewelry buying increases in August.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "ng1_short_slot170_v1",
    version: "1.0.0",
    displayName: "Natural Gas",
    category: "Energie",
    calStart: 259,
    assetId: "ng1",
    tvSymbol: "NYMEX:NG1!",
    monitoringSymbol: "NG1!",
    exchange: "NYMEX",
    instrumentType: "continuous_futures",
    direction: "SHORT",
    anchorStartSlot: 170,
    holdingDaysBasis: 10,
    windowDisplay: "Sep 16 – 30 (ca.)",
    csvPath: "data/historical/energy/NYMEX_NG1_D.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "09:00–14:30",
    rollNote: "TradingView continuous backadjusted. Monthly expiry: last business day of month before delivery.",
    costAssumptions: { slippageBps: 5, commissionBps: 2, totalRoundTripBps: 14 },
    rationale: "Post-injection season oversupply pressures November contract.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "sb1_short_slot172_v1",
    version: "1.0.0",
    displayName: "Sugar #11",
    category: "Agrar",
    calStart: 261,
    assetId: "sugar",
    tvSymbol: "ICEUS:SB1!",
    monitoringSymbol: "SB1!",
    exchange: "ICE US",
    instrumentType: "continuous_futures",
    direction: "SHORT",
    anchorStartSlot: 172,
    holdingDaysBasis: 10,
    windowDisplay: "Sep 18 – 30 (ca.)",
    csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "07:00–13:00",
    rollNote: "TradingView continuous backadjusted. Contract months: Mar, May, Jul, Oct.",
    costAssumptions: { slippageBps: 4, commissionBps: 2, totalRoundTripBps: 12 },
    rationale: "Brazilian harvest export pressure on Q4 prices.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "cc1_long_slot210_v1",
    version: "1.0.0",
    displayName: "Cocoa",
    category: "Agrar",
    calStart: 309,
    assetId: "cocoa",
    tvSymbol: "ICEUS:CC1!",
    monitoringSymbol: "CC1!",
    exchange: "ICE US",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 210,
    holdingDaysBasis: 10,
    windowDisplay: "Nov 5 – 15 (ca.)",
    csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "04:45–13:30",
    rollNote: "TradingView continuous backadjusted. Contract months: Mar, May, Jul, Sep, Dec.",
    costAssumptions: { slippageBps: 5, commissionBps: 2, totalRoundTripBps: 14 },
    rationale: "West African main crop arrival delays create uncertainty premium.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "pa1_short_slot10_v1",
    version: "1.0.0",
    displayName: "Palladium",
    category: "Metalle",
    calStart: 10,
    assetId: "pa1",
    tvSymbol: "NYMEX:PA1!",
    monitoringSymbol: "PA1!",
    exchange: "NYMEX",
    instrumentType: "continuous_futures",
    direction: "SHORT",
    anchorStartSlot: 10,
    holdingDaysBasis: 10,
    windowDisplay: "Jan 10 – 20 (ca.)",
    csvPath: "data/historical/metals/NYMEX_PA1_D.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "08:20–13:30",
    rollNote: "TradingView continuous backadjusted. Contract months: Mar, Jun, Sep, Dec.",
    costAssumptions: { slippageBps: 8, commissionBps: 3, totalRoundTripBps: 22 },
    rationale: "January liquidation after year-end rally; thin holiday volume reverses.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "zm1_long_slot73_v1",
    version: "1.0.0",
    displayName: "Soybean Meal",
    category: "Agrar",
    calStart: 105,
    iconAssetId: "zs1",
    assetId: "soymeal",
    tvSymbol: "CBOT:ZM1!",
    monitoringSymbol: "ZM1!",
    exchange: "CBOT",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 73,
    holdingDaysBasis: 10,
    windowDisplay: "Apr 15 – 25 (ca.)",
    csvPath: null, // No local CSV available for ZM1
    backadjustmentStatus: "unknown",
    tradingTimezone: "America/Chicago",
    sessionHours: "08:30–13:15",
    rollNote: "TradingView continuous backadjusted. Contract months: Jan, Mar, May, Jul, Aug, Sep, Oct, Dec.",
    costAssumptions: { slippageBps: 4, commissionBps: 2, totalRoundTripBps: 12 },
    rationale: "US spring crush margin rally driven by soy processing demand.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "ct1_long_slot29_v1",
    version: "1.0.0",
    displayName: "Cotton #2",
    category: "Agrar",
    calStart: 39,
    assetId: "cotton",
    tvSymbol: "ICEUS:CT1!",
    monitoringSymbol: "CT1!",
    exchange: "ICE US",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 29,
    holdingDaysBasis: 10,
    windowDisplay: "Feb 8 – 16 (ca.)",
    csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/New_York",
    sessionHours: "02:00–14:20",
    rollNote: "TradingView continuous backadjusted. Contract months: Mar, May, Jul, Oct, Dec.",
    costAssumptions: { slippageBps: 4, commissionBps: 2, totalRoundTripBps: 12 },
    rationale: "Export sales pace accelerates after USDA February supply/demand report.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
  {
    patternId: "es1_long_slot240_v1",
    version: "1.0.0",
    displayName: "S&P 500 E-mini",
    category: "Indizes",
    calStart: 349,
    assetId: "es1",
    tvSymbol: "CME:ES1!",
    monitoringSymbol: "ES1!",
    exchange: "CME",
    instrumentType: "continuous_futures",
    direction: "LONG",
    anchorStartSlot: 240,
    holdingDaysBasis: 10,
    windowDisplay: "Dez 15 – 25 (ca.)",
    csvPath: "data/historical/indices/CME_MINI_ES1_D.csv",
    backadjustmentStatus: "assumed_backadjusted",
    tradingTimezone: "America/Chicago",
    sessionHours: "08:30–15:15",
    rollNote: "TradingView continuous backadjusted. Quarterly expiry: Mar, Jun, Sep, Dec.",
    costAssumptions: { slippageBps: 1, commissionBps: 1, totalRoundTripBps: 4 },
    rationale: "Santa Claus Rally: pension fund rebalancing and window dressing into year-end.",
    multipleTestingTier: "fdr",
    minObservations: 10,
  },
];

/** Map for O(1) lookup by patternId */
export const TEN_PATTERNS_BY_ID = new Map(TEN_PATTERNS.map(p => [p.patternId, p]));

/** Map for lookup by assetId */
export const TEN_PATTERNS_BY_ASSET_ID = new Map(TEN_PATTERNS.map(p => [p.assetId, p]));
