import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MobileMarketAsset = {
  symbol: string;
  displayName: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
  updatedAt: string | null;
  source: "supabase_live" | "static" | "none";
  stale: boolean;
  available: boolean;
};

export type MobileMarketsResponse = {
  available: boolean;
  mode: "public-preview" | "local-private";
  source: "supabase_live" | "none";
  assets: MobileMarketAsset[];
  updatedAt: string | null;
  stale: boolean;
  staleReason?: string;
};

const WATCHED_SYMBOLS: { symbol: string; displayName: string }[] = [
  { symbol: "FDAX1!",  displayName: "DAX Futures" },
  { symbol: "ES1!",    displayName: "S&P 500 Futures" },
  { symbol: "NQ1!",    displayName: "Nasdaq Futures" },
  { symbol: "GC1!",    displayName: "Gold Futures" },
  { symbol: "6E1!",    displayName: "EUR/USD Futures" },
  { symbol: "ZW1!",    displayName: "Wheat Futures" },
  { symbol: "GLD",     displayName: "SPDR Gold ETF" },
  { symbol: "SPY",     displayName: "S&P 500 ETF" },
];

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(): Promise<NextResponse<MobileMarketsResponse>> {
  const preview = isPublicPreview();
  const now = new Date();

  try {
    const db = createSupabaseServiceClient();
    const symbols = WATCHED_SYMBOLS.map((a) => a.symbol);
    const { data, error } = await db
      .from("live_quotes")
      .select("symbol,open,close,updated_at")
      .in("symbol", symbols)
      .limit(symbols.length * 2);

    if (error || !data) {
      return NextResponse.json({
        available: false,
        mode: preview ? "public-preview" : "local-private",
        source: "none",
        assets: WATCHED_SYMBOLS.map((a) => ({
          symbol: a.symbol, displayName: a.displayName,
          last: null, change: null, changePct: null,
          updatedAt: null, source: "none", stale: true, available: false,
        })),
        updatedAt: null,
        stale: true,
        staleReason: error?.message ?? "Supabase not configured",
      });
    }

    const bySymbol = new Map(data.map((r) => [r.symbol, r]));
    let latestUpdate: string | null = null;

    const assets: MobileMarketAsset[] = WATCHED_SYMBOLS.map((a) => {
      const row = bySymbol.get(a.symbol);
      if (!row) {
        return { symbol: a.symbol, displayName: a.displayName, last: null, change: null, changePct: null, updatedAt: null, source: "none" as const, stale: true, available: false };
      }
      const last = typeof row.close === "number" ? row.close : null;
      const open = typeof row.open === "number" ? row.open : null;
      const change = last !== null && open !== null ? last - open : null;
      const changePct = change !== null && open && open !== 0 ? (change / open) * 100 : null;
      const updatedAt = row.updated_at ?? null;
      if (updatedAt && (!latestUpdate || updatedAt > latestUpdate)) latestUpdate = updatedAt;
      const stale = !updatedAt || (now.getTime() - new Date(updatedAt).getTime()) > STALE_THRESHOLD_MS;
      return {
        symbol: a.symbol, displayName: a.displayName,
        last, change, changePct, updatedAt,
        source: "supabase_live" as const, stale, available: true,
      };
    });

    const overallStale = !latestUpdate || (now.getTime() - new Date(latestUpdate).getTime()) > STALE_THRESHOLD_MS;

    return NextResponse.json({
      available: true,
      mode: preview ? "public-preview" : "local-private",
      source: "supabase_live",
      assets,
      updatedAt: latestUpdate,
      stale: overallStale,
      ...(overallStale ? { staleReason: "No recent quotes — live feed may be paused" } : {}),
    });
  } catch {
    return NextResponse.json({
      available: false,
      mode: preview ? "public-preview" : "local-private",
      source: "none",
      assets: WATCHED_SYMBOLS.map((a) => ({
        symbol: a.symbol, displayName: a.displayName,
        last: null, change: null, changePct: null,
        updatedAt: null, source: "none" as const, stale: true, available: false,
      })),
      updatedAt: null,
      stale: true,
      staleReason: "Supabase connection failed",
    });
  }
}
