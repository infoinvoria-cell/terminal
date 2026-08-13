import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildMonitoringLiveFeedView } from "@/lib/market-data/live-feed-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const db = createSupabaseServiceClient();
    const response = await buildMonitoringLiveFeedView(db);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        pollingSeconds: 30,
        countdownMode: "polling",
        asOf: new Date().toISOString(),
        universeCounts: {
          monitoring: 0,
          whiteSwan: 0,
          coreInvest: 0,
          deduped: 0,
        },
        error: String(error),
      },
      { status: 200 },
    );
  }
}
