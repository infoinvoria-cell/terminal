// ── Mobile API type contracts ─────────────────────────────────────────────────
// Agent 3 (UI) imports these — do NOT add filesystem paths, brain vault paths,
// IBKR account IDs, broker credentials, or API keys here.

// ── Phase 1 types ─────────────────────────────────────────────────────────────

export type MobileSystemHealth = {
  status: "ok" | "degraded" | "down";
  mode: "public-preview" | "local-private";
  brain: { available: boolean; pathConfigured: boolean };
  supabase: { available: boolean };
  timestamp: string;
};

export type MobileKpi = {
  label: string;
  value: string | null;
  unit?: string;
  neg?: boolean;
};

export type MobileHomeSubsystems = {
  whiteSwan: { status: "ready" | "unavailable" | "error"; cagr?: number | null };
  sentinel: { status: "ready" | "unavailable" | "error"; activeProviders?: number };
  markets: { status: "ready" | "unavailable" | "not_configured" | "error"; quoteCount?: number };
  brain: {
    status: "ready" | "projection" | "unavailable" | "error";
    nodeCount?: number | null;
    source?: "vault" | "projection";
  };
  research: { status: "ready" | "partial" | "unavailable" | "error" };
  execution: { status: "disabled" };
};

export type MobileHomeSummary = {
  topKpis: MobileKpi[];
  trackRecord: {
    available: boolean;
    totalReturnPct: number | null;
    maxDrawdownPct: number | null;
    annualizedPct: number | null;
    cagr: number | null;
    sharpe: number | null;
    calmar: number | null;
    positiveMonthsPct: number | null;
    tradeCount: number | null;
  };
  subsystems?: MobileHomeSubsystems;
  mode: "public-preview" | "local-private";
};

export type MobileAnalyticsSummary = {
  available: boolean;
  mode: "public-preview" | "local-private";
  whiteSwan: {
    totalReturnPct: number | null;
    cagrPct: number | null;
    maxDrawdownPct: number | null;
    sharpe: number | null;
    calmar: number | null;
    dataPoints: number | null;
  };
  invest: {
    totalReturnPct: number | null;
    cagrPct: number | null;
    maxDrawdownPct: number | null;
    sharpe: number | null;
  };
};

export type MobileBrainStatus = {
  available: boolean;
  pathConfigured: boolean;
  nodeCount: number | null;
  linkCount: number | null;
  lastUpdated: string | null;
  graphifyStatus: "available" | "partial" | "missing";
  projectionAvailable?: boolean;
  projectionDocCount?: number;
  projectionSnapshotAt?: string | null;
};

export type MobileBrainSearchHit = {
  id: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
  source: "vault" | "projection";
};

export type MobileBrainSearchResult = {
  query: string;
  resultCount: number;
  source: "vault" | "projection" | "none";
  results: MobileBrainSearchHit[];
};

export type MobileSentinelStatus = {
  available: boolean;
  activeProvider: string | null;
  mode: "public-preview" | "local-private";
};

// ── Phase 2 types ─────────────────────────────────────────────────────────────

export type MobileMarketAsset = {
  symbol: string;
  displayName: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
  updatedAt: string | null;
  source: "supabase_live" | "static" | "none";
  stale: boolean;
  available: boolean;
};

export type MobileMarketsResponse = {
  available: boolean;
  mode: "public-preview" | "local-private";
  source: "supabase_live" | "none";
  assets: MobileMarketAsset[];
  updatedAt: string | null;
  stale: boolean;
  staleReason?: string;
};

export type MobileWhiteSwanCapitalLevelEntry = {
  capital: number;
  assessment: string;
  finalCandidates: number;
  recommendation: {
    oosCAGR: number | null;
    sharpe: number | null;
    maxDD: number | null;
    marginPct: number | null;
    totalMarginEur: number | null;
    sizingTier: string | null;
    validated: boolean;
  } | null;
};

export type MobileWhiteSwanSummary = {
  available: boolean;
  status: string;
  generatedDate: string | null;
  validationState: "VALIDATED" | "RESEARCH_CANDIDATE" | "UNKNOWN";
  ibkrCostsVerified: boolean;
  ibkrCostsVerifiedDate: string | null;
  elapsedYears: number | null;
  minimumCapitalEur: number | null;
  conservativeMarginEur: number | null;
  capitalLevels: MobileWhiteSwanCapitalLevelEntry[];
  mode: "public-preview" | "local-private";
  updatedAt: string | null;
  stale: boolean;
};

export type ResearchSystemEntry = {
  id: string;
  name: string;
  available: boolean;
  status: "READY" | "PARTIAL" | "LOCAL_ONLY" | "OFFLINE" | "NOT_CONFIGURED";
  latestRun: string | null;
  summary: string | null;
  resultCount: number | null;
  stale: boolean;
  reason?: string;
};

export type MobileResearchSummary = {
  available: boolean;
  mode: "public-preview" | "local-private";
  systems: ResearchSystemEntry[];
  updatedAt: string;
};

export type ServiceHealthStatus =
  | "READY"
  | "PARTIAL"
  | "LOCAL_ONLY"
  | "OFFLINE"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE_PUBLICLY";

export type MobileHealthEntry = {
  id: string;
  name: string;
  status: ServiceHealthStatus;
  detail?: string;
};

export type MobileHealthV2 = {
  overall: "READY" | "DEGRADED" | "DOWN";
  mode: "public-preview" | "local-private";
  services: MobileHealthEntry[];
  updatedAt: string;
};

// ── Brain projection types ────────────────────────────────────────────────────

export type MobileBrainProjectionDoc = {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
  snapshotAt: string;
  sourceVersion: string | null;
  stale: boolean;
  truncated: boolean;
};

export type MobileBrainProjectionManifest = {
  snapshotAt: string;
  docCount: number;
  documents: {
    id: string;
    title: string;
    category: string;
    updatedAt: string;
    snapshotAt: string;
    stale: boolean;
  }[];
};

export type MobileBrainDocResponse =
  | {
      available: true;
      id: string;
      title: string;
      category: string;
      content: string;
      source: "vault" | "projection";
      updatedAt: string | null;
      snapshotAt: string | null;
      stale: boolean;
      truncated: boolean;
      maxBytes: number;
      timestamp: string;
    }
  | {
      available: false;
      id: string;
      reason: "local-only" | "not-found" | "brain-not-configured" | "projection-only";
      source: "none";
      timestamp: string;
    };

export type MobileDocManifestEntry = {
  id: string;
  title: string;
  category: string;
};

export type MobileExecutionStatus = {
  executionEnabled: false;
  environment: "public-preview" | "local-private" | "unknown";
  ibkrStatus: "local-only" | "not-configured";
  nautilusStatus: "local-only" | "not-configured";
  lastReconciliation: null;
  localOnlyReason: string;
  timestamp: string;
};
