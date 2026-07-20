/**
 * Types for the Komponenten Bento page.
 * Source: Brain registry v2.0 + monitoringTabConfig.ts
 * Paper-only. No live trading. No live signals. No LONG/SHORT direction.
 */

/** Aggregated stats for one strategy mode within an asset. */
export type ComponentModeStats = {
  count: number;
  cagr: string;
  maxDrawdown: string;
  calmar: string;
  sharpe: string;
  profitFactor: string;
  trades: string;
  winrate: string;
  wfOos: string;
  status: "final_core" | "final_limited" | "research" | "paper_only" | "open" | "archived";
  source?: string;
  placeholder: boolean;
};

/** One strategy mode (Valuation, Seasonal, Macro, Trend, etc.) for an asset. */
export type AssetStrategyMode = {
  id: string;
  label: string;
  stats: ComponentModeStats;
  detailNames?: string[];
};

/** One asset in the component matrix. */
export type AssetComponent = {
  symbol: string;
  symbolDisplay: string;
  label: string;
  assetId: string;
  exchange: string;
  iconFile?: string;
  version: string;
  dataCoverage: string;
  anomaliesCount?: number;
  modes: AssetStrategyMode[];
};

/** One box in the Bento grid. */
export type ComponentGroup = {
  id: string;
  title: string;
  sourceTab: string;
  meta?: string;
  assets: AssetComponent[];
};

/** Layout position for a group in the 16-lane grid. */
export type GroupLayout = {
  colStart: number;
  colSpan: number;
  row: number;
};
