import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

type LiveStateRow = {
  strategyId: string | null;
  symbol: string | null;
  group: string | null;
  timeframe: string | null;
  direction: string | null;
  entryTime: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  source: string | null;
  status: string | null;
  tradeId: string | null;
};

type SignalRow = {
  strategy_id?: string | null;
  symbol?: string | null;
  direction?: string | null;
  signal_ts?: string | null;
};

function toRow(row: SignalRow, status: string): LiveStateRow {
  return {
    strategyId: row.strategy_id ?? null,
    symbol: row.symbol ?? null,
    group: null,
    timeframe: "D",
    direction: row.direction ?? null,
    entryTime: status === "open" ? (row.signal_ts ?? null) : null,
    entryPrice: null,
    currentPrice: null,
    stopLossPrice: null,
    takeProfitPrice: null,
    exitTime: status === "closed" ? (row.signal_ts ?? null) : null,
    exitPrice: null,
    source: "supabase:forward_signals",
    status,
    tradeId: `${row.strategy_id ?? "unknown"}-${row.symbol ?? "unknown"}`,
  };
}

export async function GET() {
  try {
    const db = createSupabaseServiceClient();
    const today = new Date().toISOString().slice(0, 10);

    const [openRes, exitRes] = await Promise.all([
      db.from("forward_signals")
        .select("symbol,direction,in_position,signal_ts,strategy_id")
        .eq("in_position", true)
        .order("signal_ts", { ascending: false })
        .limit(200),
      db.from("forward_signals")
        .select("symbol,direction,in_position,signal_ts,strategy_id")
        .eq("in_position", false)
        .gte("signal_ts", today)
        .order("signal_ts", { ascending: false })
        .limit(50),
    ]);

    if (openRes.error ?? exitRes.error) {
      return NextResponse.json({ updatedAt: null, openTrades: [], exitsToday: [] });
    }

    const openTrades: LiveStateRow[] = (openRes.data ?? []).map((r) => toRow(r, "open"));
    const exitsToday: LiveStateRow[] = (exitRes.data ?? []).map((r) => toRow(r, "closed"));

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      openTrades,
      exitsToday,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), updatedAt: null, openTrades: [], exitsToday: [] },
      { status: 200 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
