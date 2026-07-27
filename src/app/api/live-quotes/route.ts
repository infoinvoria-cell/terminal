import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Live 5s quotes come from the `live_quotes` table (one row per symbol, upserted
// by the external TradingView feed worker). Never cache — the client polls every
// 5s and needs the freshest row each time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LiveQuoteRow = {
  symbol: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  timestamp: string | null;
  updated_at: string | null;
};

export async function GET() {
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("live_quotes")
      .select("symbol,open,high,low,close,volume,timestamp,updated_at")
      .order("updated_at", { ascending: false })
      .limit(2000);

    if (error) {
      return NextResponse.json({ quotes: [], count: 0, asOf: null, error: error.message }, { status: 200 });
    }

    const quotes = (data ?? []).map((r: LiveQuoteRow) => ({
      symbol: String(r.symbol),
      open: Number(r.open ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
      close: Number(r.close ?? 0),
      volume: Number(r.volume ?? 0),
      timestamp: r.timestamp ?? r.updated_at ?? "",
      updated_at: r.updated_at ?? r.timestamp ?? "",
    }));

    const asOf = quotes[0]?.updated_at ?? new Date().toISOString();
    return NextResponse.json({ quotes, count: quotes.length, asOf });
  } catch (err) {
    return NextResponse.json({ quotes: [], count: 0, asOf: null, error: String(err) }, { status: 200 });
  }
}
