/**
 * GET  /api/core-invest/scenarios/[runId]         — status + result
 * POST /api/core-invest/scenarios/[runId]/cancel  — cancel (write CANCELLED status)
 */
import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCENARIOS_DIR = join(process.cwd(), "data", "core-invest", "scenarios");

function safeRunDir(runId: string): string | null {
  if (!/^[0-9a-f]{12}$/.test(runId)) return null;
  return join(SCENARIOS_DIR, runId);
}

function readJson(path: string): unknown | null {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await params;
  const runDir = safeRunDir(runId);
  if (!runDir) return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  if (!existsSync(runDir)) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const status = readJson(join(runDir, "status.json")) ?? { run_id: runId, status: "UNKNOWN" };
  const result = readJson(join(runDir, "result.json"));

  // Build equity curves response (downsampled for API efficiency)
  let equityCurves: unknown = null;
  const curvesPath = join(runDir, "daily_equity_curves.csv");
  if (existsSync(curvesPath)) {
    try {
      const text = readFileSync(curvesPath, "utf-8");
      const lines = text.trim().split("\n");
      if (lines.length > 1) {
        const headers = lines[0]!.split(",");
        const dateIdx       = headers.indexOf("date");
        const netIdx        = headers.indexOf("Core Investor Net");
        const grossIdx      = headers.indexOf("Core Gross");
        const spyIdx        = headers.indexOf("SPY");
        const netDdIdx      = headers.indexOf("Core Investor Net Drawdown");
        const spyDdIdx      = headers.indexOf("SPY Drawdown");
        const netIndexIdx   = headers.indexOf("Core Investor Net Index");

        const performance: Array<{ date: string; value: number }> = [];
        const drawdown:    Array<{ date: string; value: number }> = [];
        const benchmark:   Array<{ date: string; value: number }> = [];

        // Track base for cumulative % return
        let baseNet  = 0;
        let baseGross = 0;
        let baseSpy  = 0;
        let firstRow = true;

        for (let i = 1; i < lines.length; i++) {
          // Downsample: every 3rd day + first + last
          if (i > 1 && i < lines.length - 1 && i % 3 !== 0) continue;
          const parts = lines[i]!.split(",");
          const date  = parts[dateIdx] ?? "";
          if (!date) continue;

          const netR   = parseFloat(parts[netIdx]   ?? "0");
          const spyR   = parseFloat(parts[spyIdx]   ?? "0");
          const netDd  = parseFloat(parts[netDdIdx] ?? "0");
          const spyDd  = parseFloat(parts[spyDdIdx] ?? "0");

          if (firstRow) {
            firstRow = false;
            baseNet  = 1;
            baseSpy  = 1;
          }
          baseNet  *= 1 + netR;
          baseSpy  *= 1 + spyR;

          performance.push({ date, value: parseFloat(((baseNet  - 1) * 100).toFixed(2)) });
          drawdown.push(   { date, value: parseFloat((netDd * 100).toFixed(2)) });
          benchmark.push(  { date, value: parseFloat(((baseSpy - 1) * 100).toFixed(2)) });
        }

        equityCurves = { performance, drawdown, benchmark };
      }
    } catch { /* skip */ }
  }

  // Annual returns
  let annualReturns: unknown = null;
  const annualPath = join(runDir, "annual_performance.csv");
  if (existsSync(annualPath)) {
    try {
      const text  = readFileSync(annualPath, "utf-8");
      const lines = text.trim().split("\n");
      if (lines.length > 1) {
        const headers = lines[0]!.split(",");
        const yearIdx = headers.indexOf("year");
        const netIdx  = headers.indexOf("core_investor_net_return");
        const spyIdx  = headers.indexOf("spy_return");
        const partIdx = headers.indexOf("partial_year");
        const rows = lines.slice(1).map(l => {
          const p = l.split(",");
          return {
            label:      String(p[yearIdx] ?? ""),
            value:      parseFloat(((parseFloat(p[netIdx] ?? "0")) * 100).toFixed(2)),
            spy:        parseFloat(((parseFloat(p[spyIdx] ?? "0")) * 100).toFixed(2)),
            partial:    p[partIdx] === "True",
          };
        });
        annualReturns = rows;
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({ status, result, equityCurves, annualReturns });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await params;
  const runDir = safeRunDir(runId);
  if (!runDir) return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  if (!existsSync(runDir)) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const statusPath = join(runDir, "status.json");
  const current = readJson(statusPath) as Record<string, unknown> | null;
  const curStatus = current?.status as string | undefined;

  if (curStatus === "COMPLETE" || curStatus === "FAILED")
    return NextResponse.json({ error: "Run already finished", status: curStatus }, { status: 409 });

  writeFileSync(statusPath, JSON.stringify({
    ...(current ?? {}),
    run_id: runId,
    status: "CANCELLED",
    phase:  "Cancelled",
    cancelled_at: new Date().toISOString(),
  }), "utf-8");

  return NextResponse.json({ run_id: runId, status: "CANCELLED" });
}
