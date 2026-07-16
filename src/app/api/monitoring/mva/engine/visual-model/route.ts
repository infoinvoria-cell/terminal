import { type NextRequest, NextResponse } from "next/server";
import { runMacroValuationEngine } from "@/lib/monitoring/strategyTester/engines/macroValuation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json() as { symbol?: string; customInputs?: Record<string, unknown> };
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const run = await runMacroValuationEngine(symbol, body.customInputs);
  return NextResponse.json({
    symbol,
    runMode: "engine_simulation",
    visualModel: run.visualModel,
    openTrade: run.openTrade,
    liveSignal: run.liveSignal,
  });
}
