// Single source of truth for the 3 active WS v1.3 Intraday components.
// GBP removed after failing the standalone OOS gate (v1.3 2026-07-29).
// Desktop renders these via MonitoringChartCard; mobile derives its
// Intraday tab assets + live-OHLC requests from the same list.

export type IntradayMtAssetConfig = {
  slot: "left" | "center" | "right";
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
    slot: "left",
    displaySymbol: "FDAX1! 2H",
    // Real DAX future. OHLC comes from monitoring_ohlc under composite key FDAX1!_2H;
    // live 5s ticks come from live_quotes under bare symbol FDAX1!.
    requestSymbol: "FDAX1!",
    source: "EUREX:FDAX1!",
    name: "DAX Future (2H)",
    timeframe: "2H",
    strategyId: "dax_2h",
    strategyScriptFile: "workspace/input/pine_strategies/01_dax_2h_intraday.pine",
  },
  {
    slot: "center",
    displaySymbol: "FDAX1! 1H",
    requestSymbol: "FDAX1!",
    source: "EUREX:FDAX1!",
    name: "DAX Future (1H)",
    timeframe: "1H",
    strategyId: "dax_1h",
    strategyScriptFile: "workspace/input/pine_strategies/02_dax_1h_intraday.pine",
  },
  {
    slot: "right",
    displaySymbol: "6E1! 30M",
    requestSymbol: "6E1!",
    source: "CME:6E1!",
    name: "EUR Future (30M)",
    timeframe: "30M",
    strategyId: "eurusd_30m",
    strategyScriptFile: "workspace/input/pine_strategies/04_eurusd_30m_intraday.pine",
  },
];

// Mobile Intraday tab key, e.g. "FDAX1!_2H" — <requestSymbol>_<timeframe>.
export function intradayMtKey(asset: IntradayMtAssetConfig): string {
  return `${asset.requestSymbol}_${asset.timeframe}`;
}
