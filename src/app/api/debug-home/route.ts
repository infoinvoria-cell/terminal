import { NextResponse } from "next/server";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";

export async function GET() {
  const capalifeData = getCapalifeData();
  const { serialized } = await getTradesData();

  return NextResponse.json({
    performanceMonthly: {
      meta: capalifeData.performanceMonthly.meta,
      monthly_returns_count: capalifeData.performanceMonthly.monthly_returns.length,
      first_3: capalifeData.performanceMonthly.monthly_returns.slice(0, 3),
      last_3: capalifeData.performanceMonthly.monthly_returns.slice(-3),
    },
    trades_count: serialized.length,
    default_view: serialized.length > 0 ? "Line+1D" : "Bar+1M",
    whiteSwanCombinedEvidence_kpis: capalifeData.whiteSwanCombinedEvidence.official_kpis,
  });
}
