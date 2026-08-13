/**
 * Shared operational health contract types.
 *
 * DATA, RUNTIME, and SIGNAL health are deliberately separate —
 * each reflects a different failure mode and must not be collapsed
 * into a single generic status badge.
 */

export type HealthStatus = "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";

/** Health of the underlying OHLC/price data feed for an instrument */
export type DataHealth = {
  kind: "DATA";
  instrument: string;   // e.g. "DE30EUR", "EURUSD"
  status: HealthStatus;
  lastBarAgeSeconds?: number;
  staleThresholdSeconds?: number;
  detail?: string;
};

/** Health of the strategy runtime engine (signal generation process) */
export type RuntimeHealth = {
  kind: "RUNTIME";
  engineKey: string;    // e.g. "DAX_2H", "EUR_30M"
  status: HealthStatus;
  lastRunAgeSeconds?: number;
  lastSignalTs?: string;
  detail?: string;
};

/** Health of the live signal output (signals visible to the terminal) */
export type SignalHealth = {
  kind: "SIGNAL";
  strategyId: string;   // e.g. "trend_momentum_dax_2h"
  status: HealthStatus;
  signalCount?: number;
  lastEmitTs?: string;
  detail?: string;
};

export type SystemNodeHealth = DataHealth | RuntimeHealth | SignalHealth;

/** Composite health for a system entity node in the Brain Graph */
export type NodeHealthBundle = {
  nodeId: string;       // e.g. "strategy:trend_momentum_dax_2h"
  data?: DataHealth;
  runtime?: RuntimeHealth;
  signal?: SignalHealth;
  /** Worst-case status across all three health dimensions */
  overall: HealthStatus;
};
