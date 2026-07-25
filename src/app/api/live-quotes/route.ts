import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export type LiveQuote = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  updated_at: string;
};

export async function GET() {
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("live_quotes")
      .select("symbol,open,high,low,close,volume,timestamp,updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const quotes: LiveQuote[] = (data ?? []) as LiveQuote[];
    return NextResponse.json({ quotes, count: quotes.length, asOf: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { quotes: [], count: 0, error: String(err), asOf: new Date().toISOString() },
      { status: 500 }
    );
  }
}
