export type MonitoringPrimaryTabId =
  | "metals"
  | "etfs"
  | "stocks"
  | "oil"
  | "agrar"
  | "metalle_energie"
  | "indizes"
  | "fx"
  | "aktien"
  | "invest"
  | "anomaly"
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
    tabId: "metals",
    title: "Metals",
    assets: ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Metalle"],
  },
  {
    tabId: "etfs",
    title: "ETFs",
    assets: ["SPY", "QQQ", "SPMO", "GLD"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Invest"],
  },
  {
    tabId: "stocks",
    title: "Stocks",
    assets: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Aktien"],
  },
  {
    tabId: "oil",
    title: "Oil",
    assets: ["CL1!", "NG1!", "RB1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Energie"],
  },
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
    hidden: true,
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
    hidden: true,
  },
  {
    tabId: "fx",
    title: "FX (Forex8)",
    assets: ["EURGBP", "GBPJPY", "MXNUSD", "NOK1!", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD"],
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
    hidden: true,
  },
  {
    tabId: "invest",
    title: "Invest",
    assets: ["SPY", "QQQ_PASSIVE", "SPMO", "GLD", "HG1!", "6S1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Invest"],
  },
  {
    tabId: "anomaly",
    title: "Anomaly",
    assets: ["GC1!", "GLD", "YM1!", "FDAX1!"],
    gridMode: "flex",
    defaultTimeframe: "D",
    strategyMode: "event_json_engine",
    dataSourceMode: "tv_cache_first",
    preferredDensity: "balanced",
    universeGroups: ["Anomaly"],
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
    universeGroups: ["Agrar", "Metalle", "Energie", "Indizes", "Aktien", "Invest", "Intraday MT", "FX", "Anomaly", "ETFs"],
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
    universeGroups: ["Agrar", "Metalle", "Energie", "Indizes", "Aktien", "Invest", "Intraday MT", "FX", "Anomaly", "ETFs"],
    hidden: true,
  },
];

export function getMonitoringTabConfig(tabId: MonitoringPrimaryTabId): MonitoringTabDefinition | null {
  return MONITORING_TAB_CONFIG.find((tab) => tab.tabId === tabId) ?? null;
}
