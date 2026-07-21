import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const LOCAL_PATH = path.join(
  process.cwd(),
  "public/generated/monitoring/live_state/open_trades.json"
);

export async function GET() {
  // 1. Try local file (only available on localhost with monitoring engine)
  if (fs.existsSync(LOCAL_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_PATH, "utf-8");
      const json = JSON.parse(raw);
      return NextResponse.json(json);
    } catch {
      // fall through to Supabase
    }
  }

  // 2. Fall back to Supabase forward_trades (open positions)
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("forward_trades")
      .select("symbol, direction, entry_price, entry_date, strategy_id, pnl, notes")
      .eq("event", "ENTRY")
      .is("exit_date", null)
      .order("entry_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const openTrades = (data ?? []).map((row) => ({
      symbol: row.symbol,
      direction: row.direction,
      entryPrice: row.entry_price,
      entryTime: row.entry_date,
      exitTime: null,
      exitPrice: null,
      status: "open",
      source: "forward_trades",
      strategyId: row.strategy_id ?? null,
      tradeId: null,
      stopLossPrice: null,
      takeProfitPrice: null,
      pnl: row.pnl ?? null,
    }));

    return NextResponse.json({
      schema: "live_state_v1",
      updatedAt: new Date().toISOString(),
      openTrades,
      exitsToday: [],
      status: "supabase_fallback",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
