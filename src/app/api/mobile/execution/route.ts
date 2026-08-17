import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import type { MobileExecutionStatus } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Execution is always disabled on the mobile/public API layer.
// No live orders, no broker access, no IBKR credentials exposed.
export async function GET(): Promise<NextResponse<MobileExecutionStatus>> {
  const preview = isPublicPreview();
  return NextResponse.json({
    executionEnabled: false,
    environment: preview ? "public-preview" : "local-private",
    ibkrStatus: "local-only",
    nautilusStatus: "local-only",
    lastReconciliation: null,
    localOnlyReason: "Execution is permanently disabled in the mobile/public layer. No broker access on Vercel.",
    timestamp: new Date().toISOString(),
  } satisfies MobileExecutionStatus);
}
