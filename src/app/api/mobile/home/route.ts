import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import { buildTrackRecordOverview } from "@/lib/track-record/service";
import type { MobileHomeSummary, MobileHomeSubsystems } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<MobileHomeSummary>> {
  const preview = isPublicPreview();

  let overview: Awaited<ReturnType<typeof buildTrackRecordOverview>> | null = null;
  try {
    overview = await buildTrackRecordOverview();
  } catch {
    overview = null;
  }

  const official = overview?.historical?.official ?? null;
  const sign = (n: number) => (n >= 0 ? "+" : "");

  const topKpis = [
    { label: "Risk Adj. AuM", value: "EUR 0" },
    { label: "Total Return",  value: official ? `${sign(official.compoundedReturnPct)}${official.compoundedReturnPct.toFixed(1)}%` : null },
    { label: "Max Drawdown",  value: official ? `-${official.maxDrawdownPct.toFixed(2)}%` : null, neg: true },
    { label: "Annualized",    value: official ? `${sign(official.annualizedReturnPct)}${official.annualizedReturnPct.toFixed(1)}%` : null },
  ];

  const mode = preview ? "public-preview" as const : "local-private" as const;

  const subsystems: MobileHomeSubsystems = {
    whiteSwan:  { status: "ready" },
    sentinel:   { status: "unavailable" },
    markets:    { status: "not_configured" },
    brain:      { status: preview ? "projection" : "unavailable", source: preview ? "projection" : undefined },
    research:   { status: "partial" },
    execution:  { status: "disabled" },
  };

  const body: MobileHomeSummary = {
    topKpis,
    trackRecord: {
      available: !!official,
      totalReturnPct:    official?.compoundedReturnPct ?? null,
      maxDrawdownPct:    official?.maxDrawdownPct       ?? null,
      annualizedPct:     official?.annualizedReturnPct  ?? null,
      cagr:              official?.annualizedReturnPct  ?? null,
      sharpe:            null,
      calmar:            null,
      positiveMonthsPct: null,
      tradeCount:        overview?.historical?.account1?.totalClosedTrades ?? null,
    },
    subsystems,
    mode,
  };

  return NextResponse.json(body);
}
