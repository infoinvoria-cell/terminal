/**
 * monitoringStrategyRegistry.ts
 *
 * Central registry loader for monitoring strategy data.
 * Reads from the strategy_registry.json and resolves wave1/output paths.
 *
 * - Returns all 43+ strategies with their status and output paths
 * - READY: wave1 output exists, frontend export available
 * - WEAK: low-priority, non-blocking
 * - MISSING: Waiting for Codex output
 * - PLACEHOLDER: not yet defined
 */

export type StrategyStatus = "READY" | "WEAK" | "MISSING" | "BLOCKED" | "PLACEHOLDER";

export type MonitoringGroupId =
  | "agrar"
  | "intraday"
  | "indices"
  | "metals_energy"
  | "stocks"
  | "forex"
  | "invest"
  | "anomaly";

export type StrategyOutputPaths = {
  strategyStatus: string;
  strategySummary: string;
  trades: string;
  equityCurve: string;
  drawdown: string;
  walkforward: string;
  oos: string;
  liveSnapshot: string;
  signalState: string;
  dashboardExport: string;
};

export type MonitoringStrategyEntry = {
  id: string;
  group: MonitoringGroupId;
  portfolioGroup: string;
  displayName: string;
  status: StrategyStatus;
  wave1Ready: boolean;
  weakNonBlocking: boolean;
  sourceRoot: string;
  frontendExport: string | null;
  dashboardExport: string | null;
  outputStandard: StrategyOutputPaths;
  notes: string;
};

export type MonitoringGroupEntry = {
  id: MonitoringGroupId;
  label: string;
  portfolioGroup: string;
  wave1Ready: boolean;
  symbols: string[];
  weakSymbols: string[];
};

// ── Static registry (inline — avoids runtime fetch for SSR) ──────────────────
// This mirrors workspace/monitoring_strategy_infrastructure/registry/strategy_registry.json
// Update this when new strategies are added by Codex.

const WAVE1_GROUPS: MonitoringGroupId[] = ["agrar", "intraday", "indices"];

const WAVE1_SYMBOLS = new Set([
  "ZW1","ZC1","ZS1","CC1","KC1","SB1","CT1","OJ1",
  "DAX_2H","DAX_1H","GBPUSD_30M","EURUSD_30M",
  "UKX","YM1","NQ1","FDAX1",
]);

// Agrar WEAK: non-blocking, excluded from portfolio/live
// Intraday WEAK: OOS/WF not robust, live_ready=false per Codex Run 3
const WEAK_SYMBOLS = new Set(["SB1","CT1","RB1","DAX_2H","GBPUSD_30M","EURUSD_30M"]);

const STRATEGY_SCOPE: Array<{ group: MonitoringGroupId; symbols: string[] }> = [
  { group: "agrar",         symbols: ["ZW1","ZC1","ZS1","CC1","KC1","SB1","CT1","OJ1"] },
  { group: "intraday",      symbols: ["DAX_2H","DAX_1H","GBPUSD_30M","EURUSD_30M"] },
  { group: "indices",       symbols: ["UKX","YM1","NQ1","FDAX1"] },
  { group: "metals_energy", symbols: ["PL1","PA1","CL1","NG1","GC1","SI1","RB1","HG1"] },
  { group: "stocks",        symbols: ["AAPL","AMZN","GOOGL","META","MSFT","NVDA"] },
  { group: "forex",         symbols: ["NOK1","BRLUSD","CLPUSD","MXNUSD","SEKUSD","ZARUSD","EURGBP","GBPJPY"] },
  { group: "invest",        symbols: ["E_STEP","ONLY_LONG","WHITE_SWAN","CHF_INVEST"] },
  { group: "anomaly",       symbols: ["ANOMALY_1","ANOMALY_2","ANOMALY_3","ANOMALY_4"] },
];

const DISPLAY_NAMES: Record<string, string> = {
  ZW1:"Wheat (ZW1)", ZC1:"Corn (ZC1)", ZS1:"Soybeans (ZS1)", CC1:"Cocoa (CC1)",
  KC1:"Coffee (KC1)", SB1:"Sugar (SB1)", CT1:"Cotton (CT1)", OJ1:"Orange Juice (OJ1)",
  DAX_2H:"DAX 2H", DAX_1H:"DAX 1H", GBPUSD_30M:"GBPUSD 30M", EURUSD_30M:"EURUSD 30M",
  UKX:"FTSE 100", YM1:"Dow Jones Mini", NQ1:"Nasdaq Mini", FDAX1:"DAX Futures",
  PL1:"Platinum", PA1:"Palladium", CL1:"Crude Oil", NG1:"Natural Gas",
  GC1:"Gold", SI1:"Silver", RB1:"Gasoline", HG1:"Copper",
  AAPL:"Apple", AMZN:"Amazon", GOOGL:"Alphabet", META:"Meta",
  MSFT:"Microsoft", NVDA:"Nvidia",
  NOK1:"NOK", BRLUSD:"BRL/USD", CLPUSD:"CLP/USD", MXNUSD:"MXN/USD",
  SEKUSD:"SEK/USD", ZARUSD:"ZAR/USD", EURGBP:"EUR/GBP", GBPJPY:"GBP/JPY",
  E_STEP:"E-Step", ONLY_LONG:"Only Long", WHITE_SWAN:"White Swan", CHF_INVEST:"CHF Invest",
  ANOMALY_1:"Anomaly 1", ANOMALY_2:"Anomaly 2", ANOMALY_3:"Anomaly 3", ANOMALY_4:"Anomaly 4",
};

const PORTFOLIO_GROUP_MAP: Record<MonitoringGroupId, string> = {
  agrar: "real_assets",
  intraday: "intraday_mt",
  indices: "macro_indices",
  metals_energy: "real_assets",
  stocks: "stocks",
  forex: "forex_macro",
  invest: "invest",
  anomaly: "seasonal_patterns",
};

function resolveStatus(id: string, group: MonitoringGroupId): StrategyStatus {
  if (group === "anomaly") return "PLACEHOLDER";
  if (WEAK_SYMBOLS.has(id)) return "WEAK";
  if (WAVE1_SYMBOLS.has(id)) return "READY";
  return "MISSING";
}

function buildOutputPaths(id: string, group: MonitoringGroupId): StrategyOutputPaths {
  const base = `/generated/monitoring/strategy_outputs/${group}/${id.toLowerCase()}`;
  return {
    strategyStatus:  `${base}/strategy_status.json`,
    strategySummary: `${base}/strategy_summary.csv`,
    trades:          `${base}/trades.csv`,
    equityCurve:     `${base}/equity_curve.csv`,
    drawdown:        `${base}/drawdown.csv`,
    walkforward:     `${base}/walkforward_summary.csv`,
    oos:             `${base}/oos_summary.csv`,
    liveSnapshot:    `${base}/live_snapshot.json`,
    signalState:     `${base}/signal_state.json`,
    dashboardExport: `${base}/dashboard_export.json`,
  };
}

function buildRegistry(): MonitoringStrategyEntry[] {
  const entries: MonitoringStrategyEntry[] = [];
  for (const { group, symbols } of STRATEGY_SCOPE) {
    for (const id of symbols) {
      const status = resolveStatus(id, group);
      const isWave1 = WAVE1_SYMBOLS.has(id);
      const wave1Group = WAVE1_GROUPS.includes(group) ? group : null;
      entries.push({
        id,
        group,
        portfolioGroup: PORTFOLIO_GROUP_MAP[group],
        displayName: DISPLAY_NAMES[id] ?? id,
        status,
        wave1Ready: isWave1,
        weakNonBlocking: WEAK_SYMBOLS.has(id),
        sourceRoot: `workspace/monitoring_strategy_infrastructure/${group}/${id}`,
        frontendExport: wave1Group
          ? `/generated/monitoring/wave1/${wave1Group}`
          : null,
        dashboardExport: isWave1
          ? `/generated/monitoring/wave1_strategy_outputs/${group}/${id.toLowerCase()}`
          : null,
        outputStandard: buildOutputPaths(id, group),
        notes: status === "MISSING"
          ? "Waiting for Codex output"
          : status === "PLACEHOLDER"
          ? "Anomaly strategy — not yet defined"
          : WEAK_SYMBOLS.has(id)
          ? "Weak / non-blocking"
          : "",
      });
    }
  }
  return entries;
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _registry: MonitoringStrategyEntry[] | null = null;

export function getMonitoringRegistry(): MonitoringStrategyEntry[] {
  if (!_registry) _registry = buildRegistry();
  return _registry;
}

export function getMonitoringStrategyById(id: string): MonitoringStrategyEntry | undefined {
  return getMonitoringRegistry().find((e) => e.id === id);
}

export function getMonitoringGroup(group: MonitoringGroupId): MonitoringStrategyEntry[] {
  return getMonitoringRegistry().filter((e) => e.group === group);
}

export function getReadyStrategies(): MonitoringStrategyEntry[] {
  return getMonitoringRegistry().filter((e) => e.status === "READY");
}

export function getMissingStrategies(): MonitoringStrategyEntry[] {
  return getMonitoringRegistry().filter((e) => e.status === "MISSING");
}

export function getRegistrySummary() {
  const all = getMonitoringRegistry();
  return {
    total: all.length,
    ready: all.filter((e) => e.status === "READY").length,
    weak: all.filter((e) => e.status === "WEAK").length,
    missing: all.filter((e) => e.status === "MISSING").length,
    placeholder: all.filter((e) => e.status === "PLACEHOLDER").length,
    wave1Groups: WAVE1_GROUPS,
  };
}

// ── Wave1 group helper (bridge to existing wave1Data.ts) ─────────────────────
export function isWave1Group(group: string): group is "agrar" | "intraday" | "indices" {
  return WAVE1_GROUPS.includes(group as MonitoringGroupId);
}

export const MONITORING_GROUP_LABELS: Record<MonitoringGroupId, string> = {
  agrar: "Agrar",
  intraday: "Intraday",
  indices: "Indices",
  metals_energy: "Metals / Energy",
  stocks: "Aktien",
  forex: "Forex",
  invest: "Invest",
  anomaly: "Anomaly",
};
