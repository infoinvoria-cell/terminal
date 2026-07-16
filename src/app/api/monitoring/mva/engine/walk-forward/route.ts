import { type NextRequest, NextResponse } from "next/server";
import { runMacroValuationWalkForward } from "@/lib/monitoring/strategyTester/engines/macroValuation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json() as { symbol?: string; customInputs?: Record<string, unknown> };
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const run = await runMacroValuationWalkForward(symbol, body.customInputs);
  return NextResponse.json({
    symbol,
    runMode: "walk_forward",
    walkForward: run.walkForward,
    warnings: run.warnings,
  });
}
