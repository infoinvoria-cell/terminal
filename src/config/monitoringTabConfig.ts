export type MonitoringPrimaryTabId =
  | "agrar"
  | "metalle_energie"
  | "indizes"
  | "fx"
  | "aktien"
  | "invest"
  | "intraday_mt"
  | "live"
  | "all";

export type MonitoringGridMode = "flex";
export type MonitoringStrategyMode = "event_json_engine";
export type MonitoringDataSourceMode = "tv_cache_first";
export type MonitoringPreferredDensity = "compact" | "balanced" | "spacious";

export type MonitoringTabDefinition = {
  tabId: MonitoringPrimaryTabId;
  title: string;
  assets: string[];
  gridMode: MonitoringGridMode;
  defaultTimeframe: "D" | "2h" | "1h" | "30m";
  strategyMode: MonitoringStrategyMode;
  dataSourceMode: MonitoringDataSourceMode;
  preferredDensity: MonitoringPreferredDensity;
  universeGroups: string[];
  hidden?: boolean;
};

export const MONITORING_TAB_CONFIG: MonitoringTabDefinition[] = [
  {
    tabId: "agrar",
    title: "Agrar",
    assets: ["ZW1!", "ZC1!", "ZS1!", "CC1!", "KC1!", "SB1!", "CT1!", "OJ1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Agrar"],
  },
  {
    tabId: "metalle_energie",
    title: "Metalle+Energie",
    assets: ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!", "CL1!", "NG1!", "RB1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Metalle", "Energie"],
  },
  {
    tabId: "indizes",
    title: "Indizes",
    assets: ["FDAX1!", "ES1!", "YM1!", "NQ1!", "UKX!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Indizes"],
  },
  {
    tabId: "fx",
    title: "FX (Forex8)",
    assets: ["EURGBP", "GBPJPY", "MXNUSD", "NOKUSD", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["FX"],
  },
  {
    tabId: "aktien",
    title: "Aktien",
    assets: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Aktien"],
  },
  {
    tabId: "invest",
    title: "Invest",
    assets: ["NAS100USD_E_STEP_INVEST", "NAS100USD_ONLY_LONG_VALUATION_TREND_EMA", "USDCHF_CHF_INVEST"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Invest"],
  },
  {
    tabId: "intraday_mt",
    title: "Intraday MT",
    assets: ["DE30EUR_2H", "DE30EUR_1H", "EURUSD_30M", "GBPUSD_30M"],
    gridMode: "flex",
    defaultTimeframe: "30m",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "spacious",
    universeGroups: ["Intraday MT"],
  },
  {
    // Filtered, research-only view on the existing signal sources (open trades, fresh
    // signals + recently-closed within 7 days). Same universe as "all" — it just hides
    // the signal-less charts. No new engine, no heavy runs.
    tabId: "live",
    title: "Live",
    assets: [],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "compact",
    universeGroups: ["Agrar", "Metalle", "Energie", "Indizes", "Aktien", "Invest", "Intraday MT"],
  },
  {
    tabId: "all",
    title: "Alle Strategien",
    assets: [],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "compact",
    universeGroups: ["Agrar", "Metalle", "Energie", "Indizes", "Aktien", "Invest", "Intraday MT"],
  },
];

export function getMonitoringTabConfig(tabId: MonitoringPrimaryTabId): MonitoringTabDefinition | null {
  return MONITORING_TAB_CONFIG.find((tab) => tab.tabId === tabId) ?? null;
}
