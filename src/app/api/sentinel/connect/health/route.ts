// GET /api/sentinel/connect/health — Connect system health check.
import { NextResponse } from "next/server";
import { getGraphStats } from "@/lib/sentinel/graphify-retrieval";
import { getBrainCacheStatus } from "@/lib/sentinel/capitalife-context";
import { getTodayStats } from "@/lib/sentinel/connect/connect-run";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [graphStats, brainCache, todayStats] = await Promise.all([
      Promise.resolve(getGraphStats()),
      Promise.resolve(getBrainCacheStatus()),
      Promise.resolve(getTodayStats()),
    ]);

    return NextResponse.json({
      status: "ok",
      components: {
        router: { status: "ok" },
        brain: { status: brainCache.valid ? "ok" : "stale", cacheAgeMs: brainCache.ageMs },
        graphify: { status: graphStats.available ? "ok" : "unavailable", nodeCount: graphStats.nodeCount },
        ledger: { status: "ok" },
        synthesis: { status: "local-heuristic" },
      },
      today: todayStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}
