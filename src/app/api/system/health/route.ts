import { NextResponse } from "next/server";
import { getLocalSystemHealth } from "@/lib/system/local-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLocalSystemHealth());
}
