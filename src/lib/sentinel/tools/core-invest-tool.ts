// Read-only Core Invest data adapter for Sentinel — mirrors white-swan-tool.ts.
// Reads canonical public/data/core-invest/v2/*.json artifacts. Never hardcodes
// metrics, never upgrades RESEARCH_ONLY/EXTERNAL_REQUIRED status to "live ready".
import fs from "fs";
import path from "path";

const CORE_INVEST_DIR = path.join(process.cwd(), "public", "data", "core-invest", "v2");

type CapitalMetricsBlock = {
  CAGR: number; volPct: number; Sharpe: number; Sortino: number;
  maxDDPct: number; Calmar: number; downsideDevPct: number;
  peakDate: string; troughDate: string; worstMonthPct: number; worstYearPct: number;
  finalNav: number; finalMultiple: number;
};
type CapitalMetricsTier = {
  gross: CapitalMetricsBlock;
  investorNet: CapitalMetricsBlock;
  cumTradingCost: number;
  cumFinancingCost: number;
};
type CapitalMetricsFile = { note: string; tiers: Record<string, CapitalMetricsTier> };

type ExecutionStateFile = {
  note: string;
  asOf: string;
  wouldTradeToday: { answer: "YES" | "NO"; reason: string };
};

export type CoreInvestToolResult = {
  status: "AVAILABLE" | "BLOCKED" | "CONFLICT";
  source: string;
  retrievedAt: string;
  tier?: number;
  metrics?: {
    basis: "gross" | "investorNet";
    CAGR: number; volPct: number; Sharpe: number; Sortino: number;
    maxDDPct: number; Calmar: number;
  };
  liveReadiness?: {
    wouldTradeToday: "YES" | "NO";
    reason: string;
    classification: "RESEARCH_ONLY"; // this source has never stated otherwise
  };
  methodology: string;
  failureReason?: string;
};

function readJson<T>(fileName: string): T | null {
  try {
    const filePath = path.join(/* turbopackIgnore: true */ CORE_INVEST_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

const METHODOLOGY =
  "MaxDD computed via peak-at-time (running-peak, not fixed-window). " +
  "gross = before quarterly performance fee; investorNet = after fee (post-fee HWM). " +
  "Figures marked RESEARCH_ONLY are never to be presented as live-ready or broker-confirmed.";

export function getCoreInvestMetricsForTier(
  tierCapital: number,
  basis: "gross" | "investorNet" = "investorNet",
): CoreInvestToolResult {
  const file = readJson<CapitalMetricsFile>("CORE_INVEST_CAPITAL_METRICS.json");
  if (!file) {
    return {
      status: "BLOCKED",
      source: "public/data/core-invest/v2/CORE_INVEST_CAPITAL_METRICS.json",
      retrievedAt: new Date().toISOString(),
      methodology: METHODOLOGY,
      failureReason: "File missing or malformed at read time.",
    };
  }
  const tier = file.tiers[String(tierCapital)];
  if (!tier) {
    return {
      status: "BLOCKED",
      source: "CORE_INVEST_CAPITAL_METRICS",
      retrievedAt: new Date().toISOString(),
      methodology: METHODOLOGY,
      failureReason: `No Core Invest metrics for capital tier ${tierCapital}. Available tiers: ${Object.keys(file.tiers).join(", ")}.`,
    };
  }
  const block = tier[basis];
  return {
    status: "AVAILABLE",
    source: "CORE_INVEST_CAPITAL_METRICS",
    retrievedAt: new Date().toISOString(),
    tier: tierCapital,
    metrics: {
      basis, CAGR: block.CAGR, volPct: block.volPct, Sharpe: block.Sharpe,
      Sortino: block.Sortino, maxDDPct: block.maxDDPct, Calmar: block.Calmar,
    },
    methodology: METHODOLOGY,
  };
}

export function getCoreInvestLiveReadiness(): CoreInvestToolResult {
  const file = readJson<ExecutionStateFile>("CORE_INVEST_EXECUTION_STATE.json");
  if (!file) {
    return {
      status: "BLOCKED",
      source: "public/data/core-invest/v2/CORE_INVEST_EXECUTION_STATE.json",
      retrievedAt: new Date().toISOString(),
      methodology: METHODOLOGY,
      failureReason: "File missing or malformed at read time.",
    };
  }
  return {
    status: "AVAILABLE",
    source: "CORE_INVEST_EXECUTION_STATE",
    retrievedAt: new Date().toISOString(),
    liveReadiness: {
      wouldTradeToday: file.wouldTradeToday.answer,
      reason: file.wouldTradeToday.reason,
      classification: "RESEARCH_ONLY",
    },
    methodology: METHODOLOGY,
  };
}

export function getCoreInvestAvailableTiers(): string[] {
  const file = readJson<CapitalMetricsFile>("CORE_INVEST_CAPITAL_METRICS.json");
  return file ? Object.keys(file.tiers) : [];
}
