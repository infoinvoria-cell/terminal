import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getAnalyticsDataset } from "@/lib/analytics/portfolio-data";
import { buildCoreInvestPineBacktest } from "@/lib/analytics/core-invest-pine";
import type { MobileAnalyticsSummary } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: number | string | undefined | null): number | null {
  if (v == null || v === "n/a" || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function GET(): Promise<NextResponse<MobileAnalyticsSummary>> {
  const preview = isPublicPreview();

  const capalifeData = {
    ...getCapalifeData(),
    coreInvestPineBacktest: buildCoreInvestPineBacktest(),
  };

  const wsDataset = getAnalyticsDataset("whiteSwan", "live", undefined, capalifeData);
  const invDataset = getAnalyticsDataset("invest", "backtest", undefined, capalifeData);

  const body: MobileAnalyticsSummary = {
    available: true,
    mode: preview ? "public-preview" : "local-private",
    whiteSwan: {
      totalReturnPct:  toNum(wsDataset.metrics.totalReturnPct),
      cagrPct:         toNum(wsDataset.metrics.cagrPct),
      maxDrawdownPct:  toNum(wsDataset.metrics.maxDrawdownPct),
      sharpe:          toNum(wsDataset.metrics.sharpe),
      calmar:          toNum(wsDataset.metrics.calmar),
      dataPoints:      toNum(wsDataset.metrics.dataPoints),
    },
    invest: {
      totalReturnPct:  toNum(invDataset.metrics.totalReturnPct),
      cagrPct:         toNum(invDataset.metrics.cagrPct),
      maxDrawdownPct:  toNum(invDataset.metrics.maxDrawdownPct),
      sharpe:          toNum(invDataset.metrics.sharpe),
    },
  };

  return NextResponse.json(body);
}
