import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isPublicPreview } from "@/lib/server/app-mode";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ResearchSystemStatus = {
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
  systems: ResearchSystemStatus[];
  updatedAt: string;
};

function checkSeasonality(): ResearchSystemStatus {
  try {
    const p = path.join(process.cwd(), "src", "data", "capitalife", "seasonality_validation.json");
    if (!fs.existsSync(p)) {
      return { id: "seasonality", name: "Seasonality", available: false, status: "LOCAL_ONLY", latestRun: null, summary: null, resultCount: null, stale: true, reason: "Validation data not found" };
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as { generated_at?: string; total_patterns?: number };
    const count = raw.total_patterns ?? 0;
    const latestRun = raw.generated_at ?? null;
    const stale = latestRun ? (Date.now() - new Date(latestRun).getTime()) > 30 * 24 * 60 * 60 * 1000 : true;
    return {
      id: "seasonality", name: "Seasonality Engine", available: count > 0,
      status: count > 0 ? "READY" : "PARTIAL",
      latestRun, summary: `${count} validated patterns`, resultCount: count, stale,
    };
  } catch {
    return { id: "seasonality", name: "Seasonality Engine", available: false, status: "LOCAL_ONLY", latestRun: null, summary: null, resultCount: null, stale: true, reason: "Read error" };
  }
}

function checkStrategyTester(): ResearchSystemStatus {
  try {
    const anomalyDir = path.join(process.cwd(), "public", "data", "anomaly");
    if (!fs.existsSync(anomalyDir)) {
      return { id: "strategy-tester", name: "Strategy Tester", available: false, status: "OFFLINE", latestRun: null, summary: null, resultCount: null, stale: true, reason: "No output data" };
    }
    const files = fs.readdirSync(anomalyDir).filter((f) => f.endsWith(".json"));
    const count = files.length;
    if (!count) {
      return { id: "strategy-tester", name: "Strategy Tester", available: false, status: "OFFLINE", latestRun: null, summary: null, resultCount: null, stale: true };
    }
    // Get most recent file mtime
    let latestMtime = 0;
    for (const f of files) {
      const stat = fs.statSync(path.join(anomalyDir, f));
      if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
    }
    const latestRun = new Date(latestMtime).toISOString();
    const stale = (Date.now() - latestMtime) > 30 * 24 * 60 * 60 * 1000;
    return {
      id: "strategy-tester", name: "Strategy Tester", available: true,
      status: "READY", latestRun, summary: `${count} strategy result files`, resultCount: count, stale,
    };
  } catch {
    return { id: "strategy-tester", name: "Strategy Tester", available: false, status: "OFFLINE", latestRun: null, summary: null, resultCount: null, stale: true };
  }
}

async function checkShadowForward(): Promise<ResearchSystemStatus> {
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("forward_signals")
      .select("signal_ts")
      .order("signal_ts", { ascending: false })
      .limit(1);
    if (error || !data) {
      return { id: "shadow-forward", name: "Shadow/Forward Monitor", available: false, status: "NOT_CONFIGURED", latestRun: null, summary: null, resultCount: null, stale: true, reason: "Supabase unavailable" };
    }
    const latestRun = data[0]?.signal_ts ?? null;
    const stale = !latestRun || (Date.now() - new Date(latestRun).getTime()) > 7 * 24 * 60 * 60 * 1000;
    const { data: countData } = await db.from("forward_signals").select("*", { count: "exact", head: true });
    return {
      id: "shadow-forward", name: "Shadow/Forward Monitor", available: true,
      status: stale ? "PARTIAL" : "READY",
      latestRun, summary: stale ? "Last signal older than 7 days" : "Active forward signals",
      resultCount: (countData as unknown as { count?: number })?.count ?? null, stale,
      ...(stale ? { reason: "Signal feed may be paused" } : {}),
    };
  } catch {
    return { id: "shadow-forward", name: "Shadow/Forward Monitor", available: false, status: "NOT_CONFIGURED", latestRun: null, summary: null, resultCount: null, stale: true, reason: "Supabase connection failed" };
  }
}

function checkMVA(): ResearchSystemStatus {
  // MVA engine is LOCAL_ONLY — old route wrappers deprecated, active engine is local Node process
  return {
    id: "mva", name: "Macro Valuation Engine (MVA)", available: false,
    status: "LOCAL_ONLY", latestRun: null,
    summary: "MVA engine is active locally; remote access not available",
    resultCount: null, stale: true,
    reason: "Requires local monitoring daemon — not available on Vercel",
  };
}

function checkWhiteSwan(): ResearchSystemStatus {
  const summaryPath = path.join(process.cwd(), "public", "data", "white-swan", "final-normalized", "summary.json");
  try {
    if (!fs.existsSync(summaryPath)) {
      return { id: "white-swan", name: "White Swan Research", available: false, status: "OFFLINE", latestRun: null, summary: null, resultCount: null, stale: true };
    }
    const raw = JSON.parse(fs.readFileSync(summaryPath, "utf-8")) as { generatedDate?: string; status?: string; capitalLevels?: Record<string, { finalCandidates?: number }> };
    const latestRun = raw.generatedDate ?? null;
    const stale = latestRun ? (Date.now() - new Date(latestRun).getTime()) > 30 * 24 * 60 * 60 * 1000 : true;
    const totalCandidates = Object.values(raw.capitalLevels ?? {}).reduce((s, l) => s + (l.finalCandidates ?? 0), 0);
    return {
      id: "white-swan", name: "White Swan Research", available: true,
      status: raw.status === "LIVE" ? "READY" : "PARTIAL",
      latestRun, summary: `${raw.status ?? "UNKNOWN"} — ${totalCandidates} total candidates across capital tiers`,
      resultCount: totalCandidates, stale,
    };
  } catch {
    return { id: "white-swan", name: "White Swan Research", available: false, status: "OFFLINE", latestRun: null, summary: null, resultCount: null, stale: true };
  }
}

export async function GET(): Promise<NextResponse<MobileResearchSummary>> {
  const preview = isPublicPreview();

  const [seasonality, shadow] = await Promise.all([
    Promise.resolve(checkSeasonality()),
    checkShadowForward(),
  ]);

  const systems: ResearchSystemStatus[] = [
    checkWhiteSwan(),
    checkStrategyTester(),
    seasonality,
    shadow,
    checkMVA(),
  ];

  return NextResponse.json({
    available: systems.some((s) => s.available),
    mode: preview ? "public-preview" : "local-private",
    systems,
    updatedAt: new Date().toISOString(),
  });
}
