import { NextResponse } from "next/server";
// Committed, bundled intraday strategy events (Entry/SL/TP). public/generated is
// gitignored so the on-disk event files never reach Vercel — these static imports
// make the futures-priced events available to the charts on the deployed app.
import dax2h from "@/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events.json";

const EVENTS_BY_FILE: Record<string, unknown> = {
  "EUREX_FDAX1_2H_events.json": dax2h,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file") ?? "";
  const key = file.replace(/^.*\//, ""); // strip any "strategies/" prefix
  const payload = EVENTS_BY_FILE[key] ?? null;
  if (!payload) {
    return NextResponse.json({ trades: [], count: 0 }, { status: 200 });
  }
  return NextResponse.json(payload);
}
