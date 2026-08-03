import { NextResponse } from "next/server";
import { getTradingViewLatest } from "@/lib/market-data/tradingview-cache";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// CI ETF Factor Sleeve (Active Alpha 2) — tracked in invest_ohlc
const CI_ETF_SYMBOLS = ["SPY","QQQ","VLUE","RSP","QUAL","MTUM","USMV","IWM","BIL",
  // Legacy/extended list kept for historical coverage
  "GLD","IEF","EFA","EEM","SPMO"];

export interface LiveFeedResponseItem {
  symbol: string;
  tab: string;
  source: string;
  lastClose: number | null;
  changePct: number | null;
  lastDate: string | null;
  firstDate: string | null;
  refreshedAt: string | null;
  barCount: number | null;
  dataStatus: "live" | "daily" | "missing";
  liveRefreshSeconds: number | null;
}

export async function GET() {
  try {
    // 1. TradingView cache — futures + any ETFs the worker tracks
    const tvBars = getTradingViewLatest();
    const tvMap = new Map<string, { price: number; changePct: number | null; fetchedAt: string | null }>();
    for (const bar of tvBars) {
      const close = typeof bar.close === "number" ? bar.close : null;
      const open = typeof bar.open === "number" ? bar.open : null;
      if (close && close > 0) {
        tvMap.set(bar.symbol, {
          price: close,
          changePct: open && open > 0 ? ((close - open) / open) * 100 : null,
          fetchedAt: bar.fetched_at ?? null,
        });
      }
    }

    const db = createSupabaseServiceClient();

    // 2. live_quotes (5s tick from Railway/TradingView worker) — highest priority
    const { data: liveRows } = await db
      .from("live_quotes")
      .select("symbol,open,close,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    const liveMap = new Map<string, { price: number; changePct: number | null; updatedAt: string }>();
    for (const row of liveRows ?? []) {
      const sym = String(row.symbol);
      if (liveMap.has(sym)) continue;
      const close = Number(row.close);
      const open = Number(row.open);
      if (close > 0) {
        liveMap.set(sym, {
          price: close,
          changePct: open > 0 ? ((close - open) / open) * 100 : null,
          updatedAt: String(row.updated_at),
        });
      }
    }

    // 3. invest_ohlc — daily OHLC for CI ETFs (canonical backtest source)
    const { data: ohlcRows } = await db
      .from("invest_ohlc")
      .select("symbol,date,open,close")
      .in("symbol", CI_ETF_SYMBOLS)
      .order("date", { ascending: false })
      .limit(CI_ETF_SYMBOLS.length * 3);

    const ohlcMap = new Map<string, { price: number; changePct: number | null; date: string }>();
    for (const row of ohlcRows ?? []) {
      const sym = String(row.symbol);
      if (ohlcMap.has(sym)) continue;
      const close = Number(row.close);
      const open = Number(row.open);
      if (close > 0) {
        ohlcMap.set(sym, {
          price: close,
          changePct: open > 0 ? ((close - open) / open) * 100 : null,
          date: String(row.date).slice(0, 10),
        });
      }
    }

    // 4. monitoring_ohlc — CI Managed Futures Overlay (Active Alpha 2, alle 12 Roots)
    const CI_SLEEVE_FUTURES = ["ES1!","NQ1!","6E1!","6J1!","6B1!","6S1!","GC1!","HG1!","CL1!","NG1!","ZC1!","ZS1!"];
    const { data: monRows } = await db
      .from("monitoring_ohlc")
      .select("asset,date,open,close")
      .in("asset", CI_SLEEVE_FUTURES)
      .eq("timeframe", "D")
      .gt("close", 0)
      .order("date", { ascending: false })
      .limit(CI_SLEEVE_FUTURES.length * 3);

    for (const row of monRows ?? []) {
      const sym = String(row.asset);
      if (ohlcMap.has(sym) || liveMap.has(sym) || tvMap.has(sym)) continue;
      const close = Number(row.close);
      const open = Number(row.open);
      if (close > 0) {
        ohlcMap.set(sym, {
          price: close,
          changePct: open > 0 ? ((close - open) / open) * 100 : null,
          date: String(row.date).slice(0, 10),
        });
      }
    }

    // Merge all sources — priority: live_quotes > tv_cache > invest_ohlc/monitoring_ohlc
    const allSymbols = new Set([
      ...tvMap.keys(),
      ...liveMap.keys(),
      ...ohlcMap.keys(),
    ]);

    const items: LiveFeedResponseItem[] = [...allSymbols].map((symbol) => {
      const live = liveMap.get(symbol);
      const tv = tvMap.get(symbol);
      const ohlc = ohlcMap.get(symbol);
      const best = live ?? tv ?? ohlc;
      const source = live ? "live_quotes" : tv ? "tradingview_cache" : "invest_ohlc";
      const dataStatus: "live" | "daily" | "missing" = live ? "live" : (tv ?? ohlc) ? "daily" : "missing";
      return {
        symbol,
        tab: CI_ETF_SYMBOLS.includes(symbol) ? "invest" : "ws",
        source,
        lastClose: best?.price ?? null,
        changePct: (best as { changePct?: number | null } | undefined)?.changePct ?? null,
        lastDate: live?.updatedAt.slice(0, 10) ?? ohlc?.date ?? null,
        firstDate: null,
        refreshedAt: live?.updatedAt ?? tv?.fetchedAt ?? null,
        barCount: null,
        dataStatus,
        liveRefreshSeconds: null,
      };
    });

    return NextResponse.json({ items, count: items.length, asOf: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ items: [], count: 0, error: String(err) }, { status: 200 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "not supported" }, { status: 405 });
}
