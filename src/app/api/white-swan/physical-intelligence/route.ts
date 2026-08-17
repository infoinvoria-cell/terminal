import { NextResponse } from "next/server";
import { getCurrentPhysicalSnapshot } from "@/lib/white-swan/physical-intelligence/service";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getCurrentPhysicalSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600" } });
}
