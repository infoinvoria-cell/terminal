import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import fs from "node:fs";
import path from "node:path";

type UniverseAsset = {
  id?: string;
  tab?: string;
  symbol?: string;
  requestSymbol?: string;
  name?: string;
  source?: string;
  timeframe?: string;
  hasData?: boolean;
  hasStrategy?: boolean;
  strategyStatus?: string;
  buildable?: boolean;
  [key: string]: unknown;
};

function loadUniverseConfig(): UniverseAsset[] {
  try {
    const filePath = path.join(process.cwd(), "public", "generated", "monitoring", "config", "monitoring_asset_universe.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw) as { assets?: UniverseAsset[] };
    return json.assets ?? [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab");

  const assets = loadUniverseConfig();
  const filtered = tab
    ? assets.filter((a) => a.tab?.toLowerCase() === tab.toLowerCase())
    : assets;

  // Enrich with live OHLC freshness from Supabase
  try {
    const db = createSupabaseServiceClient();
    const { data: ohlcMeta } = await db
      .from("monitoring_ohlc")
      .select("asset,timeframe,date")
      .eq("timeframe", "1D")
      .order("date", { ascending: false })
      .limit(500);

    if (ohlcMeta?.length) {
      const latestByAsset = new Map<string, string>();
      for (const row of ohlcMeta) {
        if (!latestByAsset.has(String(row.asset))) {
          latestByAsset.set(String(row.asset), String(row.date).slice(0, 10));
        }
      }
      const enriched = filtered.map((a) => {
        const lastDate = a.symbol ? latestByAsset.get(a.symbol) : undefined;
        return lastDate ? { ...a, lastOhlcDate: lastDate, hasLiveData: true } : a;
      });
      return NextResponse.json({ assets: enriched, count: enriched.length, source: "universe+supabase" });
    }
  } catch {
    // Fall through to static-only response
  }

  return NextResponse.json({ assets: filtered, count: filtered.length, source: "universe" });
}
