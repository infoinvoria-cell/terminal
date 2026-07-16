import { NextResponse } from "next/server";
import { getAgricultureMvaBindings } from "@/lib/monitoring/strategyTester/engines/macroValuation/bindings";

export const runtime = "nodejs";

export async function GET() {
  const bindings = getAgricultureMvaBindings();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    symbols: bindings,
    totalSymbols: bindings.length,
  });
}
