import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { GLOBE_ID_TO_LIVE_SYMBOL } from "@/lib/market-data/asset-registry";
import { deriveStatus } from "@/lib/market-data/data-manager";
import type { DataSourceStatus } from "@/lib/market-data/types";

// Globe/watchlist live prices — sourced exclusively from Supabase live_quotes
// (TradingView Railway worker, ~15 min delayed). No Yahoo Finance.
//
// Response shape extended with `sourceStatus` and `delayMinutes` per asset
// so the Globe can render the correct data-quality badge.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const prices: Record<string, number | null> = {};
  const changes: Record<string, number | null> = {};
  const sourceStatus: Record<string, DataSourceStatus> = {};
  const delayMinutes: Record<string, number | null> = {};

  for (const id of Object.keys(GLOBE_ID_TO_LIVE_SYMBOL)) {
    prices[id] = null;
    changes[id] = null;
    sourceStatus[id] = "unavailable";
    delayMinutes[id] = null;
  }

  try {
    const symbols = [...new Set(Object.values(GLOBE_ID_TO_LIVE_SYMBOL))];
    const db = createSupabaseServiceClient();
    const { data } = await db
      .from("live_quotes")
      .select("symbol,open,close,updated_at")
      .in("symbol", symbols)
      .order("updated_at", { ascending: false })
      .limit(3000);

    const bySymbol = new Map<string, { open: number; close: number; updated_at: string }>();
    for (const r of data ?? []) {
      const sym = String(r.symbol);
      if (!bySymbol.has(sym)) {
        bySymbol.set(sym, {
          open: Number(r.open ?? 0),
          close: Number(r.close ?? 0),
          updated_at: String(r.updated_at ?? ""),
        });
      }
    }

    for (const [id, sym] of Object.entries(GLOBE_ID_TO_LIVE_SYMBOL)) {
      const q = bySymbol.get(sym);
      if (!q || !(q.close > 0)) continue;
      prices[id] = q.close;
      changes[id] = q.open > 0 ? ((q.close - q.open) / q.open) * 100 : null;
      sourceStatus[id] = deriveStatus("supabase_quotes", q.updated_at);
      delayMinutes[id] = 15;
    }
  } catch {
    // leave nulls / unavailable
  }

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    prices,
    changes,
    sourceStatus,
    delayMinutes,
  });
}
