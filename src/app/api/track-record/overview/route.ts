import { NextResponse } from "next/server";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await buildTrackRecordOverview(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Track-record overview failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
