import { type NextRequest, NextResponse } from "next/server";
import { loadAllSpyDailyReturns } from "@/lib/benchmark/spy-data";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from") ?? "";
  const to   = searchParams.get("to")   ?? "";

  const all = loadAllSpyDailyReturns();
  const filtered = all.filter(r =>
    (!from || r.date >= from) && (!to || r.date <= to)
  );

  return NextResponse.json(filtered);
}
