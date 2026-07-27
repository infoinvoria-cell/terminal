import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Globe/watchlist live prices — now sourced from the Railway data worker via the
// Supabase `live_quotes` table. No Yahoo Finance. Response shape unchanged
// ({ prices, changes } keyed by asset id) so the Globe client needs no changes.
// Assets without a worker symbol (or not yet populated) return null.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Globe asset id -> our live_quotes symbol (worker/monitoring format).
const GLOBE_ID_TO_SYMBOL: Record<string, string> = {
  // White Swan / core
  gld_etf: "GLD", gld_ci: "GLD", gc1: "GC1!", ym1: "YM1!", nq1: "NQ1!", ct1: "CT1!",
  qqq: "QQQ", spmo: "SPMO", spy: "SPY", hg1: "HG1!", "6s1": "6S1!",
  // Intraday MT (futures)
  eurusd_30m: "6E1!", gbpusd_30m: "6B1!", dax_1h: "FDAX1!", dax_2h: "FDAX1!",
  // Forex (CME currency futures)
  "6e1": "6E1!", "6b1": "6B1!", "6j1": "6J1!", "6s1_fx": "6S1!", "6a1": "6A1!", "6c1": "6C1!",
  // Macro (FRED)
  dxy: "DXY", vix: "VIX", tnx: "TNX", us2y: "DGS2",
  // Index proxies via index futures
  sp500_idx: "ES1!", nasdaq_idx: "NQ1!", dow_idx: "YM1!", dax_idx: "FDAX1!",
  eurostoxx_idx: "FESX1!",
  // Stocks (Alpaca)
  aapl: "AAPL", msft: "MSFT", nvda: "NVDA", tsla: "TSLA", meta_s: "META",
  amzn: "AMZN", googl: "GOOGL", jpm: "JPM", bac: "BAC",
  // Metals
  silver: "SI1!", platinum: "PL1!", palladium: "PA1!", copper_spot: "HG1!",
  // Energy
  crude: "CL1!", brent: "BZ1!", natgas: "NG1!", heating_oil: "HO1!", gasoline: "RB1!",
  // Agriculture
  corn_f: "ZC1!", wheat_f: "ZW1!", soybean_f: "ZS1!", coffee_f: "KC1!",
  cocoa_f: "CC1!", sugar_f: "SB1!", oj_f: "OJ1!",
  // Bonds / macro spot
  zb1: "ZB1!", crude_spot: "CL_SPOT", gold_spot: "GC_SPOT",
};

export async function GET() {
  const prices: Record<string, number | null> = {};
  const changes: Record<string, number | null> = {};
  for (const id of Object.keys(GLOBE_ID_TO_SYMBOL)) { prices[id] = null; changes[id] = null; }

  try {
    const symbols = [...new Set(Object.values(GLOBE_ID_TO_SYMBOL))];
    const db = createSupabaseServiceClient();
    const { data } = await db
      .from("live_quotes")
      .select("symbol,open,close,updated_at")
      .in("symbol", symbols)
      .order("updated_at", { ascending: false })
      .limit(3000);

    const bySymbol = new Map<string, { open: number; close: number }>();
    for (const r of data ?? []) {
      const sym = String(r.symbol);
      if (!bySymbol.has(sym)) bySymbol.set(sym, { open: Number(r.open ?? 0), close: Number(r.close ?? 0) });
    }

    for (const [id, sym] of Object.entries(GLOBE_ID_TO_SYMBOL)) {
      const q = bySymbol.get(sym);
      if (!q || !(q.close > 0)) continue;
      prices[id] = q.close;
      changes[id] = q.open > 0 ? ((q.close - q.open) / q.open) * 100 : null;
    }
  } catch {
    // leave nulls
  }

  return NextResponse.json({ updatedAt: new Date().toISOString(), prices, changes });
}
