import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getDataHub, normalizeSupabaseQuote, topicMarketQuote } from "@/lib/datahub";

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
      // timestamp = real exchange/provider event time.
      // NEVER fall back to updated_at — that is the DB insert time (≈ server/browser time)
      // and would cause phantom future candles on a delayed feed.
      // Return "" when null so callers can guard with `if (!liveQ.timestamp) return`.
      timestamp: r.timestamp ?? "",
      updated_at: r.updated_at ?? "",
    }));

    const asOf = quotes[0]?.updated_at ?? new Date().toISOString();

    // Publish each quote to the consumer-cache DataHub.
    // This makes market.quote.<instrument> available to introspection endpoints
    // and any server-side subscriber within this Next.js process.
    // DataHub is consumer cache only — Supabase is the authoritative store.
    const hub = getDataHub();
    const receivedAt = new Date().toISOString();
    for (const q of quotes) {
      if (!q.timestamp) continue;
      const row = {
        asset_id: q.symbol,
        asset_type: "futures",
        price: q.close,
        lp_time: q.timestamp || null,
        inserted_at: q.updated_at || null,
        provider: "tradingview",
        provider_symbol: q.symbol,
      };
      const normalized = normalizeSupabaseQuote(row, receivedAt);
      const topic = topicMarketQuote(normalized.instrumentId);
      hub.publish(topic, normalized, {
        source: "supabase.live_quotes",
        provider: "tradingview",
        providerSymbol: q.symbol,
        sourceTimestampUtc: q.timestamp || null,
      });
    }

    return NextResponse.json({ quotes, count: quotes.length, asOf });
  } catch (err) {
    return NextResponse.json({ quotes: [], count: 0, asOf: null, error: String(err) }, { status: 200 });
  }
}
