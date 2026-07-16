import { NextResponse, type NextRequest } from "next/server";

import { triggerImmediateRefresh } from "@/lib/server/monitoring/immediateRefresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let intraday = false;
  try {
    const body = (await request.json()) as { intraday?: boolean } | null;
    intraday = Boolean(body?.intraday);
  } catch {
    intraday = false;
  }
  const result = await triggerImmediateRefresh({ intraday });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
