import { NextResponse } from "next/server";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await buildTrackRecordOverview();
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        generatedAtUtc: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
