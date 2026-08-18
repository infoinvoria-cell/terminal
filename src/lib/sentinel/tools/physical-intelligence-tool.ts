// Read-only Physical Intelligence data adapter for Sentinel — mirrors
// white-swan-tool.ts / core-invest-tool.ts. Reads the canonical current
// forward-observation artifact. Never claims VALIDATED trading edge or
// TRADING IMPACT beyond what the source's own `mode` field states.
import fs from "fs";
import path from "path";

// The physical-intelligence artifact lives outside public/ at project root
// (data/, not public/data/) — see getPhysicalIntelligenceDataPackagingStatus()
// for the deployment-availability implication this has, same class of issue
// documented for White Swan v7 data in the Phase-2/3 commits.
const PHYSICAL_INTEL_DIR = path.join(process.cwd(), "data", "white-swan", "physical-intelligence", "forward");
const CANONICAL_FILE = "2026-08-17-v2.json";

type Observation = {
  componentId: string;
  commodity: string;
  provider: string;
  dataset?: string;
  variable: string;
  observationTimestamp: string;
  retrievalTimestamp: string;
  score: number | null;
  confidence: number | null;
  status: "AVAILABLE" | "UNAVAILABLE" | string;
  freshnessHours: number | null;
  staleAfterHours: number | null;
  accessClass: string;
};

type ForwardFile = {
  schemaVersion: string;
  generatedAt: string;
  mode: string; // e.g. "SHADOW_OBSERVATION_ONLY"
  positionMultiplier: number;
  observations: Observation[];
};

export type PhysicalIntelligenceResult = {
  status: "AVAILABLE" | "BLOCKED" | "CONFLICT";
  source: string;
  retrievedAt: string;
  commodity?: string;
  observations?: {
    provider: string;
    variable: string;
    score: number | null;
    confidence: number | null;
    status: string;
    freshnessHours: number | null;
    stale: boolean;
  }[];
  mode?: string;
  tradingImpact?: "NONE" | string;
  edgeStatus?: "SHADOW_OBSERVATION" | "VALIDATED" | "UNKNOWN";
  failureReason?: string;
};

function readForwardFile(): ForwardFile | null {
  try {
    const filePath = path.join(/* turbopackIgnore: true */ PHYSICAL_INTEL_DIR, CANONICAL_FILE);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ForwardFile;
  } catch {
    return null;
  }
}

function deriveTradingImpact(mode: string): "NONE" | string {
  // Only ever "NONE" for shadow/observation-only modes — anything else is
  // surfaced verbatim rather than assumed to mean "no impact".
  if (/SHADOW|OBSERVATION_ONLY/i.test(mode)) return "NONE";
  return mode; // unknown mode string — do not silently claim NONE
}

function deriveEdgeStatus(mode: string): "SHADOW_OBSERVATION" | "VALIDATED" | "UNKNOWN" {
  if (/SHADOW|OBSERVATION_ONLY/i.test(mode)) return "SHADOW_OBSERVATION";
  if (/VALIDATED/i.test(mode)) return "VALIDATED";
  return "UNKNOWN";
}

export function getPhysicalIntelligenceForCommodity(commodity: string): PhysicalIntelligenceResult {
  const file = readForwardFile();
  if (!file) {
    return {
      status: "BLOCKED",
      source: `data/white-swan/physical-intelligence/forward/${CANONICAL_FILE}`,
      retrievedAt: new Date().toISOString(),
      failureReason: "File missing or malformed at read time.",
    };
  }
  const normalized = commodity.toUpperCase();
  const matches = file.observations.filter((o) => o.commodity.toUpperCase() === normalized);
  if (matches.length === 0) {
    const known = [...new Set(file.observations.map((o) => o.commodity))];
    return {
      status: "BLOCKED",
      source: CANONICAL_FILE,
      retrievedAt: new Date().toISOString(),
      failureReason: `No Physical Intelligence observations for "${commodity}". Known commodities: ${known.join(", ")}.`,
    };
  }
  return {
    status: "AVAILABLE",
    source: CANONICAL_FILE,
    retrievedAt: new Date().toISOString(),
    commodity: normalized,
    observations: matches.map((o) => ({
      provider: o.provider,
      variable: o.variable,
      score: o.score,
      confidence: o.confidence,
      status: o.status,
      freshnessHours: o.freshnessHours,
      stale: o.staleAfterHours != null && o.freshnessHours != null ? o.freshnessHours > o.staleAfterHours : false,
    })),
    mode: file.mode,
    tradingImpact: deriveTradingImpact(file.mode),
    edgeStatus: deriveEdgeStatus(file.mode),
  };
}

export function getPhysicalIntelligenceKnownCommodities(): string[] {
  const file = readForwardFile();
  if (!file) return [];
  return [...new Set(file.observations.map((o) => o.commodity))];
}

export type DataSourceState = "AVAILABLE_LOCAL" | "MISSING" | "CONFLICT" | "STALE";

// Reports whether the underlying data directory is reachable — a distinct,
// honest question from "is there an observation for X". Deployment-safety
// abstraction: callers get a state enum + a repo-relative structural label
// only (never an absolute filesystem path), so if this data's storage
// location changes later (e.g. moved under public/), only this function's
// internals need to change — every caller keeps working against the enum.
export function getPhysicalIntelligenceDataSourceState(): { state: DataSourceState; sourceLabel: string; detail: string } {
  const filePath = path.join(/* turbopackIgnore: true */ PHYSICAL_INTEL_DIR, CANONICAL_FILE);
  const sourceLabel = "physical-intelligence-forward-v2";

  if (!fs.existsSync(filePath)) {
    return { state: "MISSING", sourceLabel, detail: "Canonical forward-observation artifact not found on this runtime." };
  }

  const file = readForwardFile();
  if (!file) {
    return { state: "MISSING", sourceLabel, detail: "File exists but could not be parsed as valid JSON." };
  }

  const ageMs = Date.now() - new Date(file.generatedAt).getTime();
  const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — conservative, this is daily-refresh research data
  if (Number.isFinite(ageMs) && ageMs > STALE_AFTER_MS) {
    return { state: "STALE", sourceLabel, detail: `Data generated ${Math.round(ageMs / 86_400_000)} days ago, beyond the 7-day freshness assumption for this source.` };
  }

  return { state: "AVAILABLE_LOCAL", sourceLabel, detail: `Reachable on this runtime, generated ${file.generatedAt}.` };
}

// @deprecated superseded by getPhysicalIntelligenceDataSourceState(); kept
// only until any remaining caller is confirmed migrated.
export function getPhysicalIntelligenceDataPackagingStatus(): { localFileExists: boolean; path: string } {
  const filePath = path.join(/* turbopackIgnore: true */ PHYSICAL_INTEL_DIR, CANONICAL_FILE);
  return { localFileExists: fs.existsSync(filePath), path: `data/white-swan/physical-intelligence/forward/${CANONICAL_FILE}` };
}
