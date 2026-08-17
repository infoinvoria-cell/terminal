// ── Mobile API type contracts ─────────────────────────────────────────────────
// These types define the shape of all /api/mobile/* responses.
// Agent 3 (UI) imports these — do NOT add filesystem paths, brain vault paths,
// IBKR account IDs, broker credentials, or API keys here.

export type MobileSystemHealth = {
  status: "ok" | "degraded" | "down";
  mode: "public-preview" | "local-private";
  brain: {
    available: boolean;
    pathConfigured: boolean;
  };
  supabase: {
    available: boolean;
  };
  timestamp: string;
};

export type MobileKpi = {
  label: string;
  value: string | null;
  unit?: string;
  neg?: boolean;
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
};

export type MobileBrainSearchResult = {
  query: string;
  resultCount: number;
  results: {
    file: string;
    snippet: string;
    score: number;
  }[];
};

export type MobileSentinelStatus = {
  available: boolean;
  activeProvider: string | null;
  mode: "public-preview" | "local-private";
};

export type MobileMarketSummary = {
  available: boolean;
  assets: {
    symbol: string;
    label: string;
    close: number | null;
    changePct: number | null;
    date: string | null;
  }[];
};

export type MobileExecutionStatus = {
  available: false;
  reason: "execution-disabled-in-public-preview" | "no-live-orders";
};
