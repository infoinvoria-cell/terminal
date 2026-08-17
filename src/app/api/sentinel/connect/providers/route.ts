// GET /api/sentinel/connect/providers — safe provider status for the Connect dashboard.
// Never exposes API keys. Returns operational status + quota state only.
import { NextResponse } from "next/server";
import { healthCheckProviders } from "@/lib/sentinel/providers/provider-router";
import { getGraphStats } from "@/lib/sentinel/graphify-retrieval";
import { getBrainCacheStatus } from "@/lib/sentinel/capitalife-context";
import { getAllProviderStates } from "@/lib/sentinel/store/usage-store";
import { getTodayStats } from "@/lib/sentinel/connect/connect-run";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [status, graphStats, brainCache, usageStates, todayStats] = await Promise.all([
      healthCheckProviders(null),
      Promise.resolve(getGraphStats()),
      Promise.resolve(getBrainCacheStatus()),
      Promise.resolve(getAllProviderStates()),
      Promise.resolve(getTodayStats()),
    ]);

    const providers = status.providers.map((p) => {
      const usage = usageStates[p.id] ?? null;
      return {
        id: p.id,
        label: p.label,
        configured: p.configured,
        healthy: p.usable,
        reason: p.reason,
        model: p.model,
        supportsStreaming: p.supportsStreaming,
        // Quota state — never raw token counts that could infer usage patterns in detail
        quotaBlocked: usage?.blockedUntil ? new Date(usage.blockedUntil) > new Date() : false,
        blockedUntil: usage?.blockedUntil ?? null,
        rateLimitCount: usage?.rateLimitCount ?? 0,
        requestsToday: usage?.requestCount ?? 0,
        lastSuccessAt: usage?.lastSuccessAt ?? null,
      };
    });

    return NextResponse.json({
      providers,
      brain: {
        available: status.brain.available,
        cacheAgeMs: brainCache.ageMs,
        cacheValid: brainCache.valid,
      },
      graphify: {
        available: graphStats.available,
        nodeCount: graphStats.nodeCount,
        linkCount: graphStats.linkCount,
      },
      todayStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
