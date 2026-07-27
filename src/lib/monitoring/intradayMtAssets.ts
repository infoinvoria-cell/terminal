// Single source of truth for the 4 Intraday-MT futures charts, shared by the
// desktop Monitoring page and the mobile Monitoring view so the two can never
// drift. Desktop renders these via MonitoringChartCard; mobile derives its
// Intraday tab assets + live-OHLC requests from the same list.

export type IntradayMtAssetConfig = {
  slot: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  displaySymbol: string;
  requestSymbol: string;
  source: string;
  name: string;
  timeframe: "30M" | "1H" | "2H";
  strategyId: string;
  strategyScriptFile: string;
};

export const INTRADAY_MT_ASSETS: IntradayMtAssetConfig[] = [
  {
    slot: "top_left",
    displaySymbol: "FDAX1! 2H",
    // Real DAX future. OHLC comes from monitoring_ohlc under composite key FDAX1!_2H;
    // live 5s ticks come from live_quotes under bare symbol FDAX1!.
    requestSymbol: "FDAX1!",
    source: "EUREX:FDAX1!",
    name: "DAX Future (TM)",
    timeframe: "2H",
    strategyId: "dax_2h",
    strategyScriptFile: "workspace/input/pine_strategies/01_dax_2h_intraday.pine",
  },
  {
    slot: "top_right",
    displaySymbol: "6B1! 30M",
    requestSymbol: "6B1!",
    source: "CME:6B1!",
    name: "GBP Future (MT)",
    timeframe: "30M",
    strategyId: "gbpusd_30m",
    strategyScriptFile: "workspace/input/pine_strategies/03_gbpusd_30m_intraday.pine",
  },
  {
    slot: "bottom_left",
    displaySymbol: "FDAX1! 1H",
    requestSymbol: "FDAX1!",
    source: "EUREX:FDAX1!",
    name: "DAX Future (MT)",
    timeframe: "1H",
    strategyId: "dax_1h",
    strategyScriptFile: "workspace/input/pine_strategies/02_dax_1h_intraday.pine",
  },
  {
    slot: "bottom_right",
    displaySymbol: "6E1! 30M",
    requestSymbol: "6E1!",
    source: "CME:6E1!",
    name: "EUR Future (MT)",
    timeframe: "30M",
    strategyId: "eurusd_30m",
    strategyScriptFile: "workspace/input/pine_strategies/04_eurusd_30m_intraday.pine",
  },
];

// Mobile Intraday tab key, e.g. "FDAX1!_2H" — <requestSymbol>_<timeframe>.
export function intradayMtKey(asset: IntradayMtAssetConfig): string {
  return `${asset.requestSymbol}_${asset.timeframe}`;
}
