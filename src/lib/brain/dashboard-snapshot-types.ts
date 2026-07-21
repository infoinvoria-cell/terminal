/**
 * Types for the Capitalife Brain dashboard_snapshot.json contract.
 * Source: CAPITALIFE_BRAIN_PATH/09_AI/dashboard_snapshot.json
 * Schema: Trading Strategy Master Manual v2.1, 10_SCHEMAS/dashboard_snapshot.schema.json
 *
 * Rules:
 * - No KPIs may be hardcoded in UI components — all values come from this snapshot.
 * - Missing values MUST be null | "missing" | "unknown", never 0.
 * - Mode PAPER_ONLY until all Go-Live-Gates are closed.
 */

export type SnapshotMode = "PAPER_ONLY" | "SHADOW" | "LIVE";
export type StrategyTier = "FINAL_CORE" | "FINAL_LIMITED" | "QUARANTINE" | "REJECTED" | "RESEARCH_CANDIDATE";
export type StrategyApproach = "Valuation" | "Seasonal" | "Macro";

export type SafetyStopInfo = {
  present: boolean;
  atr_length: number | null;
  stop_atr: number | null;
  gap_rule: string | null;
};

export type StrategyEntry = {
  strategy_id: string;
  version: string;
  asset: string;
  approach: StrategyApproach;
  tier: StrategyTier;
  enabled_default: boolean;
  paper_only: boolean;
  certification: string | null;
  positive_folds: number | null;
  folds_total: number | null;
  trades: number | null;
  net_r: number | null;
  pf: number | null;
  max_dd_r: number | null;
  bootstrap_q05: number | null;
  bootstrap_positive_probability: number | null;
  safety_stop: SafetyStopInfo;
  risk: Record<string, unknown>;
  evidence_paths: string[];
};

export type PortfolioStrategyRef = {
  strategy_id: string;
  asset: string;
  approach: string;
  tier?: StrategyTier;
  enabled: boolean;
  enabled_default?: boolean;
  risk_budget_fraction?: number;
  default_risk_budget_fraction?: number;
  manual_max_risk_budget_fraction?: number;
};

export type PortfolioConfig = {
  portfolio_id: string;
  version: string;
  status: string;
  description: string;
  allocated_fraction?: number;
  reserve_fraction?: number;
  strategies: PortfolioStrategyRef[];
};

export type GoLiveGate = {
  gate_id: string;
  label: string;
  status: "OPEN" | "CLOSED" | "IN_PROGRESS";
  notes?: string;
};

export type DataPipeline = {
  pipeline_id: string;
  label: string;
  status: "PIPELINE_SPECIFIED_NOT_BACKTESTED" | "ACTIVE" | "RESEARCH";
  notes?: string;
};

export type OpenRisk = {
  risk_id: string;
  label: string;
  severity: "low" | "medium" | "high";
  notes?: string;
};

export type EvidenceLink = {
  label: string;
  path: string;
  type: "registry" | "portfolio" | "report" | "schema" | "snapshot";
};

export type SnapshotCounts = {
  strategies_total: number;
  core: number;
  limited: number;
  default_active: number;
  valuation: number;
  seasonal: number;
  macro: number;
  assets: number;
};

export type TrackKpis = {
  totalReturn: string;
  maxDrawdown: string;
  compoundedReturn: string;
  annualizedReturn: string;
  totalReturn24m: string;
};

export type DashboardSnapshot = {
  _track_kpis?: TrackKpis;
  generated_at: string;
  manual: {
    id: string;
    version: string;
    status: string;
  };
  project: {
    name: string;
    mission: string;
    mode: SnapshotMode;
    data_end: string;
  };
  integrity: {
    manifest_checked: boolean;
    registry_consistent: boolean;
    warnings: string[];
  };
  counts: SnapshotCounts;
  portfolios: {
    core_default: PortfolioConfig;
    expanded_paper: PortfolioConfig;
  };
  strategies: StrategyEntry[];
  assets: string[];
  go_live_gates: GoLiveGate[];
  data_pipelines: DataPipeline[];
  open_risks: OpenRisk[];
  evidence_links: EvidenceLink[];
};
