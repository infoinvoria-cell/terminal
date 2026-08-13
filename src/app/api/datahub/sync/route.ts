/**
 * GET /api/datahub/sync
 *
 * Pulls authoritative state from Flask Engine and publishes it into the
 * Next.js consumer-cache DataHub. Returns a snapshot of what was synced.
 *
 * Query params:
 *   strategy  = EUR_30M (default)
 *   asset_type = futures (default)
 *
 * Call this to prime the DataHub after a Next.js restart, or to verify
 * that introspection endpoints reflect real Flask state.
 */

import { NextResponse } from "next/server"
import {
  syncBarsFromFlask,
  syncSessionFromFlask,
  syncFeedStatusFromFlask,
} from "@/lib/datahub/adapters/flask-adapter"

export const dynamic = "force-dynamic"

const STRATEGY_TO_INSTRUMENT: Record<string, { instrumentId: string; timeframe: string }> = {
  EUR_30M:  { instrumentId: "6e",   timeframe: "30m" },
  DAX_1H:   { instrumentId: "fdax", timeframe: "1h"  },
  DAX_2H:   { instrumentId: "fdax", timeframe: "2h"  },
  GC_FRI:   { instrumentId: "gc",   timeframe: "30m" },
  GLD_THU:  { instrumentId: "gc",   timeframe: "30m" },
  YM_TAT:   { instrumentId: "ym",   timeframe: "30m" },
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const strategy  = searchParams.get("strategy")  ?? "EUR_30M"
  const assetType = searchParams.get("asset_type") ?? "futures"

  const meta = STRATEGY_TO_INSTRUMENT[strategy]
  if (!meta) {
    return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 })
  }

  const [barsResult, sessionResult, feedResult] = await Promise.all([
    syncBarsFromFlask(strategy, assetType, meta.instrumentId, meta.timeframe),
    syncSessionFromFlask(strategy, meta.instrumentId),
    syncFeedStatusFromFlask(),
  ])

  return NextResponse.json({
    strategy,
    assetType,
    instrumentId: meta.instrumentId,
    timeframe: meta.timeframe,
    bars: barsResult,
    session: sessionResult,
    feed: feedResult,
    syncedAtUtc: new Date().toISOString(),
  })
}
