import { NextResponse } from "next/server";
import type { MobileExecutionStatus } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Execution is always disabled on the mobile/public API layer.
// No live orders, no broker access, no IBKR credentials exposed.
export async function GET(): Promise<NextResponse<MobileExecutionStatus>> {
  return NextResponse.json({
    available: false,
    reason: "execution-disabled-in-public-preview",
  });
}
