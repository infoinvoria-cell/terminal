// Read-only White Swan data adapter for Sentinel.
// Reads the same canonical v7 JSON artifacts the White Swan product UI
// consumes — never hardcodes metrics. If a file is missing/malformed the
// tool reports a structured failure instead of guessing.
import fs from "fs";
import path from "path";

const V7_DIR = path.join(process.cwd(), "public", "data", "white-swan", "v7");

type RiskMode = {
  id: string;
  effectiveRatio: number;
  margin: number;
  marginPct: number;
  cagr: number;
  oosCagr: number;
  sharpe: number;
  maxDDPct: number;
  calmar: number;
  pf: number;
  status: string;
};

type RiskModeContract = Record<string, { default: string; modes: RiskMode[] }>;

type SpComparisonEntry = {
  spBenchmark: { cagr: number; oosCagr: number; maxDDPct: number; source: string };
  at1x: { cagr: number; maxDD: number };
  outperformsAt1x: boolean;
  riskComparisonAt1x: string;
};

export type WhiteSwanToolResult = {
  status: "AVAILABLE" | "BLOCKED" | "CONFLICT";
  source: string;
  retrievedAt: string;
  tiers?: string[];
  tierData?: {
    tier: number;
    modes: Array<Pick<RiskMode, "id" | "cagr" | "oosCagr" | "sharpe" | "maxDDPct" | "calmar" | "pf" | "marginPct" | "status">>;
  };
  spComparison?: { tier: number; spMaxDD: number; whiteSwanMaxDD: number; outperforms: boolean; explanation: string };
  maxDDMethodology: string;
  failureReason?: string;
};

function readJson<T>(fileName: string): T | null {
  try {
    const filePath = path.join(/* turbopackIgnore: true */ V7_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const MAXDD_METHODOLOGY =
  "MaxDD = NAV / runningPeak - 1 (running-peak drawdown, not a fixed-window measure). " +
  "An old hardcoded per-sleeve MaxDD table previously existed in Sentinel's static " +
  "context and was a known-stale bug — always use this tool's live values instead.";

export function getWhiteSwanRiskModesForTier(tierCapital: number): WhiteSwanToolResult {
  const contract = readJson<RiskModeContract>("WHITE_SWAN_V7_RISK_MODE_UI_CONTRACT.json");
  if (!contract) {
    return {
      status: "BLOCKED",
      source: "public/data/white-swan/v7/WHITE_SWAN_V7_RISK_MODE_UI_CONTRACT.json",
      retrievedAt: new Date().toISOString(),
      maxDDMethodology: MAXDD_METHODOLOGY,
      failureReason: "File missing or malformed at read time.",
    };
  }
  const key = String(tierCapital);
  const tier = contract[key];
  if (!tier) {
    return {
      status: "BLOCKED",
      source: "public/data/white-swan/v7/WHITE_SWAN_V7_RISK_MODE_UI_CONTRACT.json",
      retrievedAt: new Date().toISOString(),
      tiers: Object.keys(contract),
      maxDDMethodology: MAXDD_METHODOLOGY,
      failureReason: `No risk-mode data for capital tier ${tierCapital}. Available tiers: ${Object.keys(contract).join(", ")}.`,
    };
  }
  return {
    status: "AVAILABLE",
    source: "public/data/white-swan/v7/WHITE_SWAN_V7_RISK_MODE_UI_CONTRACT.json",
    retrievedAt: new Date().toISOString(),
    tierData: {
      tier: tierCapital,
      modes: tier.modes.map((m) => ({
        id: m.id, cagr: m.cagr, oosCagr: m.oosCagr, sharpe: m.sharpe,
        maxDDPct: m.maxDDPct, calmar: m.calmar, pf: m.pf, marginPct: m.marginPct, status: m.status,
      })),
    },
    maxDDMethodology: MAXDD_METHODOLOGY,
  };
}

export function getWhiteSwanSpComparison(tierCapital: number): WhiteSwanToolResult {
  const data = readJson<Record<string, SpComparisonEntry>>("WHITE_SWAN_V7_SP500_RISK_COMPARISON.json");
  if (!data) {
    return {
      status: "BLOCKED",
      source: "public/data/white-swan/v7/WHITE_SWAN_V7_SP500_RISK_COMPARISON.json",
      retrievedAt: new Date().toISOString(),
      maxDDMethodology: MAXDD_METHODOLOGY,
      failureReason: "File missing or malformed at read time.",
    };
  }
  const entry = data[String(tierCapital)];
  if (!entry) {
    return {
      status: "BLOCKED",
      source: "public/data/white-swan/v7/WHITE_SWAN_V7_SP500_RISK_COMPARISON.json",
      retrievedAt: new Date().toISOString(),
      tiers: Object.keys(data),
      maxDDMethodology: MAXDD_METHODOLOGY,
      failureReason: `No S&P comparison for capital tier ${tierCapital}.`,
    };
  }
  return {
    status: "AVAILABLE",
    source: entry.spBenchmark.source,
    retrievedAt: new Date().toISOString(),
    spComparison: {
      tier: tierCapital,
      spMaxDD: entry.spBenchmark.maxDDPct,
      whiteSwanMaxDD: entry.at1x.maxDD,
      outperforms: entry.outperformsAt1x,
      explanation: entry.riskComparisonAt1x,
    },
    maxDDMethodology: MAXDD_METHODOLOGY,
  };
}

export function getWhiteSwanAvailableTiers(): string[] {
  const contract = readJson<RiskModeContract>("WHITE_SWAN_V7_RISK_MODE_UI_CONTRACT.json");
  return contract ? Object.keys(contract) : [];
}
