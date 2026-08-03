import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { CORE_INVEST_MODEL, CORE_INVEST_ETF_SYMBOLS, CORE_INVEST_MF_SYMBOLS } from "@/lib/core-invest/core-invest-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const now = new Date().toISOString();

  try {
    const db = createSupabaseServiceClient();

    // Check live_quotes for freshness
    const { data: liveRows } = await db
      .from("live_quotes")
      .select("symbol,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    const liveMap = new Map<string, string>();
    for (const row of liveRows ?? []) {
      if (!liveMap.has(String(row.symbol))) liveMap.set(String(row.symbol), String(row.updated_at));
    }

    const lastLiveTs = liveRows?.[0]?.updated_at ? String(liveRows[0].updated_at) : null;
    const liveAgeMs = lastLiveTs ? Date.now() - new Date(lastLiveTs).getTime() : null;
    const liveFeedStatus: "ONLINE" | "DELAYED" | "STALE" | "OFFLINE" =
      liveAgeMs == null    ? "OFFLINE"
      : liveAgeMs < 30_000  ? "ONLINE"
      : liveAgeMs < 300_000 ? "DELAYED"
      : liveAgeMs < 900_000 ? "STALE"
      : "OFFLINE";

    // Check invest_ohlc for last ETF date
    const { data: etfRow } = await db
      .from("invest_ohlc")
      .select("date")
      .in("symbol", CORE_INVEST_ETF_SYMBOLS)
      .order("date", { ascending: false })
      .limit(1)
      .single();
    const historicalDataLastDate = etfRow?.date ? String(etfRow.date).slice(0, 10) : null;

    // Stale assets — ETFs not seen in live_quotes
    const allSymbols = [...CORE_INVEST_ETF_SYMBOLS, ...CORE_INVEST_MF_SYMBOLS];
    const staleAssets = allSymbols.filter((s) => !liveMap.has(s));
    const activeSources: string[] = [];
    if ((liveRows?.length ?? 0) > 0) activeSources.push("live_quotes");
    activeSources.push("invest_ohlc", "monitoring_ohlc", "tradingview_cache");

    return NextResponse.json({
      strategyVersion:       CORE_INVEST_MODEL.version,
      frozenDate:            CORE_INVEST_MODEL.frozenDate,
      ablationSharpe:        CORE_INVEST_MODEL.ablationKpis.sharpe,
      ablationCagr:          CORE_INVEST_MODEL.ablationKpis.netCagrPct,
      ablationMaxDd:         CORE_INVEST_MODEL.ablationKpis.maxDrawdownPct,
      liveFeed:              liveFeedStatus,
      lastMarketTimestamp:   lastLiveTs,
      historicalDataLastDate,
      backtestSnapshotId:    null,
      signalEngine:          "RUNNING",
      activeSources,
      failedSources:         [],
      staleAssets:           staleAssets.slice(0, 20),
      broker:                "OFFLINE",
      livePosition:          { symbol: "6J", micro: "MJY", direction: "short", contracts: 2, asOf: "2026-07-31" },
      etfComponentCount:     CORE_INVEST_MODEL.etfFactorSleeve.length,
      mfComponentCount:      CORE_INVEST_MODEL.managedFuturesOverlay.length,
      updatedAt:             now,
    });
  } catch (err) {
    return NextResponse.json({
      strategyVersion: CORE_INVEST_MODEL.version,
      liveFeed:        "OFFLINE",
      signalEngine:    "DEGRADED",
      broker:          "OFFLINE",
      activeSources:   [],
      failedSources:   ["supabase"],
      staleAssets:     [],
      error:           String(err),
      updatedAt:       now,
    }, { status: 200 });
  }
}
