import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Assets covered by TV chart series — Z-suffix rows are contaminated
// (high_price/low_price day-session extremes). Clean no-Z rows supersede them.
const CHART_SERIES_ASSETS = [
  { asset: "6E1!_30M",  timeframe: "30M" },
  { asset: "6B1!_30M",  timeframe: "30M" },
  { asset: "FDAX1!_2H", timeframe: "2H"  },
  { asset: "FDAX1!_1H", timeframe: "1H"  },
];

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry_run") !== "false";

  const db = createSupabaseServiceClient();
  const report: Array<{ asset: string; timeframe: string; z_rows: number; deleted: boolean }> = [];
  let totalFound = 0;
  let totalDeleted = 0;

  for (const { asset, timeframe } of CHART_SERIES_ASSETS) {
    // Find all Z-suffix rows
    const { data: zRows, error: selectErr } = await db
      .from("monitoring_ohlc")
      .select("date")
      .eq("asset", asset)
      .eq("timeframe", timeframe)
      .like("date", "%Z")
      .order("date");

    if (selectErr) {
      return NextResponse.json({ error: selectErr.message, asset }, { status: 500 });
    }

    const count = zRows?.length ?? 0;
    totalFound += count;

    let deleted = false;
    if (!dryRun && count > 0) {
      const dates = (zRows ?? []).map(r => r.date as string);
      const { error: delErr } = await db
        .from("monitoring_ohlc")
        .delete()
        .eq("asset", asset)
        .eq("timeframe", timeframe)
        .in("date", dates);

      if (delErr) {
        return NextResponse.json({ error: delErr.message, asset }, { status: 500 });
      }
      totalDeleted += count;
      deleted = true;
    }

    report.push({ asset, timeframe, z_rows: count, deleted });
  }

  return NextResponse.json({
    dry_run: dryRun,
    total_found: totalFound,
    total_deleted: dryRun ? 0 : totalDeleted,
    report,
    message: dryRun
      ? `Dry run: found ${totalFound} Z-suffix rows. Re-run with ?dry_run=false to delete.`
      : `Deleted ${totalDeleted} contaminated Z-suffix rows.`,
  });
}
