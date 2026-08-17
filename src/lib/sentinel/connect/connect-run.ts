// ConnectRun: provenance tracking for every Sentinel Connect orchestration.
// Persisted locally in .runtime/sentinel/connect-runs/ as NDJSON.
import fs from "fs";
import path from "path";
import type { PrivacyLevel } from "./privacy-classifier";
import type { SentinelProviderId } from "../providers/types";
import type { ConnectRoutingMode } from "./connect-router";

export type TokenAccountingType = "OBSERVED" | "ESTIMATED";

export type WorkerRecord = {
  provider: SentinelProviderId;
  model: string;
  role: "primary" | "analyst" | "skeptic" | "critic" | "synthesizer";
  inputTokens: number;
  outputTokens: number;
  tokenAccounting: TokenAccountingType; // OBSERVED = provider-reported; ESTIMATED = 70/30 split
  latencyMs: number;
  success: boolean;
  error?: string;
};

export type ConnectRun = {
  id: string;
  timestamp: string;
  requestPreview: string; // first 80 chars of request, never raw private data
  privacyLevel: PrivacyLevel;
  postBrainPrivacyLevel?: PrivacyLevel; // re-classified after Brain injection
  route: ConnectRoutingMode;
  brainSources: string[]; // file labels used from Brain
  graphifyHit: boolean;
  workers: WorkerRecord[];
  synthesisProvider: SentinelProviderId | "local-heuristic" | null;
  synthesisBackend?: "qwen" | "heuristic";
  synthesisModel?: string;
  synthesisLatencyMs?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokenAccounting: TokenAccountingType;
  totalLatencyMs: number;
  status: "success" | "partial" | "failed" | "fallback";
  fallbackReason?: string;
};

const RUNS_DIR = path.join(process.cwd(), ".runtime", "sentinel", "connect-runs");
const MAX_RUNS_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file, then rotate

function ensureDir(): void {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function todayFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(RUNS_DIR, `runs-${date}.ndjson`);
}

export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `cr_${ts}_${rand}`;
}

export function persistRun(run: ConnectRun): void {
  try {
    ensureDir();
    const filePath = todayFilePath();
    // Rotate if too large
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_RUNS_FILE_SIZE) {
        const rotated = filePath.replace(".ndjson", `.${Date.now()}.ndjson`);
        fs.renameSync(filePath, rotated);
      }
    } catch { /* file doesn't exist yet */ }
    fs.appendFileSync(filePath, JSON.stringify(run) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

export function getRecentRuns(limitDays = 7): ConnectRun[] {
  try {
    ensureDir();
    const cutoff = new Date(Date.now() - limitDays * 86_400_000).toISOString().slice(0, 10);
    const files = fs.readdirSync(RUNS_DIR)
      .filter((f) => f.startsWith("runs-") && f.endsWith(".ndjson"))
      .filter((f) => f.slice(5, 15) >= cutoff)
      .sort()
      .reverse();

    const runs: ConnectRun[] = [];
    for (const file of files.slice(0, 3)) {
      const content = fs.readFileSync(path.join(RUNS_DIR, file), "utf-8");
      for (const line of content.trim().split("\n")) {
        if (!line.trim()) continue;
        try { runs.push(JSON.parse(line) as ConnectRun); } catch { /* skip malformed */ }
      }
    }
    return runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
  } catch { return []; }
}

export function getTodayStats(): { runs: number; successRate: number; avgLatencyMs: number; totalTokens: number } {
  try {
    const filePath = todayFilePath();
    if (!fs.existsSync(filePath)) return { runs: 0, successRate: 0, avgLatencyMs: 0, totalTokens: 0 };
    const content = fs.readFileSync(filePath, "utf-8");
    const runs: ConnectRun[] = [];
    for (const line of content.trim().split("\n")) {
      if (!line.trim()) continue;
      try { runs.push(JSON.parse(line) as ConnectRun); } catch { /* skip */ }
    }
    if (runs.length === 0) return { runs: 0, successRate: 0, avgLatencyMs: 0, totalTokens: 0 };
    const successful = runs.filter((r) => r.status === "success" || r.status === "partial").length;
    const avgLatencyMs = runs.reduce((s, r) => s + r.totalLatencyMs, 0) / runs.length;
    const totalTokens = runs.reduce((s, r) => s + r.totalInputTokens + r.totalOutputTokens, 0);
    return { runs: runs.length, successRate: successful / runs.length, avgLatencyMs, totalTokens };
  } catch { return { runs: 0, successRate: 0, avgLatencyMs: 0, totalTokens: 0 }; }
}
