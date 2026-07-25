import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const db = createSupabaseServiceClient();

    const { data, error } = await db
      .from("forward_signals")
      .select("symbol,direction,in_position,signal_ts,strategy_id")
      .eq("in_position", true)
      .order("signal_ts", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ available: false });
    }

    const openTrades = (data ?? []).map((row) => ({
      symbol: row.symbol ?? "",
      direction: (row.direction ?? "").toLowerCase(),
      strategy: row.strategy_id ?? "",
      entry_date: row.signal_ts ?? "",
      entry_price: "",
      stop_loss: "",
      take_profit: "",
      trade_id: `${row.strategy_id ?? "fwd"}-${row.symbol ?? "unknown"}`,
      lastClose: null,
      lastCloseDate: null,
      unrealizedPct: null,
    }));

    return NextResponse.json({
      available: true,
      asOf: new Date().toISOString(),
      openTrades,
      activeSignals: openTrades,
      recentClosed: [],
      counts: {
        open: openTrades.length,
        activeSignals: openTrades.length,
        recentClosed: 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ available: false, error: String(err) });
  }
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
