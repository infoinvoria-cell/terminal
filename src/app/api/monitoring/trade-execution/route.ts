import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trade execution is disabled in Capitalife Terminal (monitoring-only mode).
export async function POST() {
  return NextResponse.json(
    { error: "Trade execution is disabled — this dashboard is monitoring-only." },
    { status: 403 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Trade execution is disabled — this dashboard is monitoring-only." },
    { status: 403 },
  );
}
