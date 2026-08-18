// GET /api/sentinel/usage-brief — compact, safe usage/status contract for
// other Capitalife surfaces (e.g. a future Globe panel) to consume. No
// secrets, no full diagnostics — see usage-brief.ts for the exact shape.
import { NextResponse } from "next/server";
import { getSentinelUsageSummary } from "@/lib/sentinel/usage-brief";

export const runtime = "nodejs";

export async function GET() {
  try {
    const summary = await getSentinelUsageSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
