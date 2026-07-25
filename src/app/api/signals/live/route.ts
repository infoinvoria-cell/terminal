import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export type LiveSignalItem = {
  symbol: string;
  direction: string; // "LONG" | "SHORT" | ""
  inPosition: boolean;
  signalTs: string | null;
  strategyId: string | null;
};

export type LiveSignalsResponse = {
  updatedAt: string;
  items: LiveSignalItem[];
};

export async function GET() {
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("forward_signals")
      .select("symbol, direction, in_position, signal_ts, strategy_id")
      .order("signal_ts", { ascending: false });

    if (error || !Array.isArray(data)) {
      return NextResponse.json(
        { updatedAt: new Date().toISOString(), items: [] } satisfies LiveSignalsResponse,
        { headers: { "Cache-Control": "public, max-age=60" } },
      );
    }

    const items: LiveSignalItem[] = data.map((row) => ({
      symbol: String(row.symbol ?? ""),
      direction: String(row.direction ?? "").toUpperCase(),
      inPosition: row.in_position === true,
      signalTs: row.signal_ts ?? null,
      strategyId: row.strategy_id ?? null,
    }));

    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items } satisfies LiveSignalsResponse,
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json(
      { updatedAt: new Date().toISOString(), items: [] } satisfies LiveSignalsResponse,
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
