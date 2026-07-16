import { NextResponse } from "next/server";
import { getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAgriFinalStatus(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
