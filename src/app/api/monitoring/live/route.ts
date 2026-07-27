import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Live prices from the Railway data worker (live_quotes table) — replaces the
// Yahoo Finance calls in the Globe/watchlist. No caching (polled every 5s).
//   GET /api/monitoring/live?symbols=GC1!,CL1!,6E1!
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const db = createSupabaseServiceClient();
    let query = db
      .from("live_quotes")
      .select("symbol,open,high,low,close,volume,updated_at")
      .order("updated_at", { ascending: false })
      .limit(3000);
    if (symbols.length) query = query.in("symbol", symbols);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ quotes: [], count: 0, error: error.message }, { status: 200 });
    }

    const quotes = (data ?? []).map((r) => {
      const open = Number(r.open ?? 0);
      const close = Number(r.close ?? 0);
      const changePct = open > 0 ? ((close - open) / open) * 100 : null;
      return {
        symbol: String(r.symbol),
        price: close,
        high: Number(r.high ?? 0),
        low: Number(r.low ?? 0),
        volume: Number(r.volume ?? 0),
        changePct,
        updatedAt: r.updated_at ?? null,
      };
    });

    return NextResponse.json({ quotes, count: quotes.length, asOf: quotes[0]?.updatedAt ?? new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ quotes: [], count: 0, error: String(err) }, { status: 200 });
  }
}
