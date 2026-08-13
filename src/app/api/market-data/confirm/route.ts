/**
 * POST /api/market-data/confirm
 *
 * On-demand real-time signal confirmation via Dukascopy.
 *
 * Only fires when:
 *  - The asset has a dukascopyInstrument in the registry
 *  - The candle is within the last 12 minutes before close
 *  - The RealtimeGate has available slots and no active cooldown
 *
 * Body (JSON):
 *  {
 *    assetId: string,            // e.g. "eurusd_30m"
 *    direction: "long" | "short",
 *    thresholdPrice: number,     // sweep recovery level
 *    candleCloseAt: string,      // ISO-8601 UTC
 *    strategyId: string,
 *  }
 *
 * Response:
 *  { confirmed, currentPrice, thresholdPrice, direction,
 *    provider, delayMinutes, checkedAt, reason }
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmSignal } from "@/lib/market-data/realtime-gate";
import type { SignalConfirmContext } from "@/lib/market-data/types";

export const runtime = "nodejs"; // Dukascopy fetch needs Node (AbortSignal.timeout)
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // Validate required fields
  if (
    typeof b.assetId !== "string" ||
    (b.direction !== "long" && b.direction !== "short") ||
    typeof b.thresholdPrice !== "number" ||
    typeof b.candleCloseAt !== "string" ||
    typeof b.strategyId !== "string"
  ) {
    return NextResponse.json(
      { error: "Required: assetId (string), direction (long|short), thresholdPrice (number), candleCloseAt (ISO string), strategyId (string)" },
      { status: 400 },
    );
  }

  const ctx: SignalConfirmContext = {
    assetId: b.assetId,
    direction: b.direction,
    thresholdPrice: b.thresholdPrice,
    candleCloseAt: b.candleCloseAt,
    strategyId: b.strategyId,
  };

  const result = await confirmSignal(ctx);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
