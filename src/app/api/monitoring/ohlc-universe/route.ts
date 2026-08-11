import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import fs from "node:fs";
import path from "node:path";

type UniverseAsset = { symbol?: string; tab?: string; timeframe?: string };

function loadUniverseSymbols(): { symbol: string; timeframe: string; tab: string }[] {
  try {
    const filePath = path.join(process.cwd(), "public", "generated", "monitoring", "config", "monitoring_asset_universe.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw) as { assets?: UniverseAsset[] };
    return (json.assets ?? [])
      .filter((a) => a.symbol)
      .map((a) => ({
        symbol: a.symbol!,
        timeframe: (a.timeframe ?? "D").replace("1D", "D"),
        tab: a.tab ?? "",
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  const universalSymbols = loadUniverseSymbols();
  if (!universalSymbols.length) {
    return NextResponse.json({ error: "universe config not found", symbols: [] }, { status: 200 });
  }

  try {
    const db = createSupabaseServiceClient();
    const today = new Date().toISOString().slice(0, 10);
    // Accept up to 3 calendar days to cover Monday-after-weekend (Friday close + Sunday overnight futures)
    const freshCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

    // Paginate through monitoring_ohlc (date DESC) to find latest date per symbol.
    // A single .limit(1000) misses stale symbols whose last row predates the 1000 most
    // recent rows. We stop early once every universe key has been seen.
    const universalKeyCount = universalSymbols.length;
    const latestBySymbol = new Map<string, string>();
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (latestBySymbol.size < universalKeyCount) {
      const { data: ohlcPage } = await db
        .from("monitoring_ohlc")
        .select("asset,timeframe,date")
        .order("date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (!ohlcPage || ohlcPage.length === 0) break;
      for (const row of ohlcPage) {
        const key = `${row.asset}:${row.timeframe}`;
        if (!latestBySymbol.has(key)) latestBySymbol.set(key, String(row.date).slice(0, 10));
      }
      if (ohlcPage.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const results = universalSymbols.map((item) => {
      const tfKey = item.timeframe === "D" ? "1D" : item.timeframe;
      const lastDate = latestBySymbol.get(`${item.symbol}:${tfKey}`) ?? latestBySymbol.get(`${item.symbol}:${item.timeframe}`);
      const isFresh = Boolean(lastDate && lastDate >= freshCutoff);
      return {
        symbol: item.symbol,
        timeframe: item.timeframe,
        tab: item.tab,
        lastDate: lastDate ?? null,
        isFresh,
        hasSuapabaseData: Boolean(lastDate),
        status: lastDate ? (isFresh ? "fresh" : "stale") : "missing",
      };
    });

    const missing = results.filter((r) => r.status === "missing");
    const stale = results.filter((r) => r.status === "stale");
    const fresh = results.filter((r) => r.status === "fresh");

    return NextResponse.json({
      total: results.length,
      fresh: fresh.length,
      stale: stale.length,
      missing: missing.length,
      missingSymbols: missing.map((r) => r.symbol),
      staleSymbols: stale.map((r) => r.symbol),
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), symbols: universalSymbols }, { status: 200 });
  }
}
