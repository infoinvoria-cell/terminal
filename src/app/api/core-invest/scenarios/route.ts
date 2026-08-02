/**
 * POST /api/core-invest/scenarios  — start a new scenario run
 * GET  /api/core-invest/scenarios  — list recent runs
 *
 * Security: No shell injection. Run-IDs are hex-only. Paths are constructed
 * from project root constants. No user-supplied file paths accepted.
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ROOT = process.cwd();
const SCENARIOS_DIR = join(PROJECT_ROOT, "data", "core-invest", "scenarios");
const RUNNER_SCRIPT = join(PROJECT_ROOT, "engine", "core-invest", "run_scenario.py");
const TMP_DIR       = join(PROJECT_ROOT, "data", "core-invest", ".tmp-configs");

// Hex-only run-ID: safe for filesystem paths
function newRunId(): string {
  return randomBytes(6).toString("hex");
}

// Safe path: only allow known run-ID format in scenario dir
function safeRunDir(runId: string): string | null {
  if (!/^[0-9a-f]{12}$/.test(runId)) return null;
  return join(SCENARIOS_DIR, runId);
}

// Validate draft_weights: all keys must be known tickers, values 0–2
const ALLOWED_TICKERS = new Set([
  "SPY","QQQ","RSP","IWM","EFA","EEM","QUAL","MTUM","VLUE","USMV","GLD","IEF","BIL",
]);

function validateWeights(w: unknown): string | null {
  if (typeof w !== "object" || w === null || Array.isArray(w)) return "draft_weights must be an object";
  for (const [k, v] of Object.entries(w)) {
    if (!ALLOWED_TICKERS.has(k)) return `Unknown ticker: ${k}`;
    if (typeof v !== "number" || !isFinite(v) || v < -0.5 || v > 2.5)
      return `Invalid weight for ${k}: ${v} (must be numeric, −0.5 to 2.5)`;
  }
  return null;
}

function validateRiskParams(r: unknown): string | null {
  if (typeof r !== "object" || r === null) return null; // optional
  const rp = r as Record<string, unknown>;
  const { exposure_cap, financing_spread, fee_rate } = rp;
  if (exposure_cap !== undefined && (typeof exposure_cap !== "number" || exposure_cap < 0.5 || exposure_cap > 3.0))
    return "exposure_cap must be 0.5–3.0";
  if (financing_spread !== undefined && (typeof financing_spread !== "number" || financing_spread < 0 || financing_spread > 0.20))
    return "financing_spread must be 0–0.20";
  if (fee_rate !== undefined && (typeof fee_rate !== "number" || fee_rate < 0 || fee_rate > 1.0))
    return "fee_rate must be 0–1.0";
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });

  const b = body as Record<string, unknown>;

  // Validate weights
  const weightErr = b.draft_weights ? validateWeights(b.draft_weights) : null;
  if (weightErr) return NextResponse.json({ error: weightErr }, { status: 422 });

  const riskErr = b.risk_params ? validateRiskParams(b.risk_params) : null;
  if (riskErr) return NextResponse.json({ error: riskErr }, { status: 422 });

  // Validate rebalance_mode
  const allowed_modes = ["auto_cash", "proportional", "manual"];
  if (b.rebalance_mode && !allowed_modes.includes(b.rebalance_mode as string))
    return NextResponse.json({ error: "Invalid rebalance_mode" }, { status: 422 });

  // Check Python runner exists
  if (!existsSync(RUNNER_SCRIPT))
    return NextResponse.json({ error: "Scenario runner not installed" }, { status: 503 });

  // Check reference data
  if (!existsSync(join(PROJECT_ROOT, "data", "core-invest", "reference", "daily_equity_curves.csv")))
    return NextResponse.json({ error: "Reference data not found" }, { status: 503 });

  const runId = newRunId();
  const runDir = safeRunDir(runId)!;

  // Build safe config (no user-supplied paths)
  const config = {
    strategy_version: "v2.0-demo-audit",
    start_date:       typeof b.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.start_date) ? b.start_date : "2008-05-29",
    end_date:         typeof b.end_date   === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.end_date)   ? b.end_date   : "2026-07-31",
    initial_nav:      typeof b.initial_nav === "number" && b.initial_nav > 0 ? b.initial_nav : 25000,
    draft_weights:    b.draft_weights ?? {},
    rebalance_mode:   allowed_modes.includes(b.rebalance_mode as string) ? b.rebalance_mode : "auto_cash",
    risk_params:      typeof b.risk_params === "object" ? b.risk_params : {},
    code_version:     "local",
  };

  // Write config to tmp dir
  mkdirSync(TMP_DIR, { recursive: true });
  const configPath = join(TMP_DIR, `${runId}.json`);
  writeFileSync(configPath, JSON.stringify(config), "utf-8");

  // Create run dir and write initial status
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "status.json"), JSON.stringify({
    run_id: runId, status: "QUEUED", phase: "Queued",
    started_at: new Date().toISOString(),
  }), "utf-8");

  // Find Python executable
  const pythonExe = process.platform === "win32"
    ? (existsSync("python") ? "python" : "python3")
    : "python3";

  // Spawn Python process detached (fire-and-forget; client polls status)
  const child = spawn(pythonExe, [RUNNER_SCRIPT, "--config", configPath, "--run-id", runId, "--out-dir", runDir], {
    detached: true,
    stdio: "ignore",
    cwd: PROJECT_ROOT,
    env: { ...process.env, PYTHONPATH: join(PROJECT_ROOT, "engine", "core-invest") },
  });
  child.unref();

  return NextResponse.json({ run_id: runId, status: "QUEUED" }, { status: 202 });
}

export async function GET(): Promise<NextResponse> {
  if (!existsSync(SCENARIOS_DIR)) return NextResponse.json({ runs: [] });

  try {
    const dirs = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^[0-9a-f]{12}$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse()
      .slice(0, 20);

    const runs = dirs.map(runId => {
      const statusPath = join(SCENARIOS_DIR, runId, "status.json");
      try {
        return JSON.parse(readFileSync(statusPath, "utf-8"));
      } catch {
        return { run_id: runId, status: "UNKNOWN" };
      }
    });

    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
