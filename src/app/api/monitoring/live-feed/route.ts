import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type ManifestAsset = {
  asset: string;
  tab: string;
  source: string;
  status: string;
  lastClose: number | null;
  lastDate: string | null;
  refreshedAt: string | null;
  firstDate: string | null;
  barCount: number | null;
  hasData: boolean;
};

type LatestBar = {
  symbol: string;
  close: number | null;
  change_pct: number | null;
  fetched_at: string | null;
  status: string;
};

export type LiveFeedItem = {
  symbol: string;
  tab: string;
  source: string;
  lastClose: number | null;
  changePct: number | null;
  lastDate: string | null;
  refreshedAt: string | null;
  firstDate: string | null;
  barCount: number | null;
  dataStatus: "live" | "daily" | "missing";
  liveRefreshSeconds: number | null;
};

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

function resolveTVCacheDir(): string {
  const envDir = process.env.TRADINGVIEW_CACHE_DIR
    ? path.resolve(process.env.TRADINGVIEW_CACHE_DIR)
    : "C:\\Users\\joris\\Documents\\.capitalife-cache\\market-data\\tradingview";
  const fallback = path.join(process.cwd(), "src", "data", "capitalife", "market-data", "tradingview");
  return fs.existsSync(envDir) ? envDir : fallback;
}

export async function GET() {
  // 1. Load monitoring manifest (primary price source for all assets)
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "generated",
    "monitoring",
    "tradingview_data_cache",
    "cache_manifest_full.json",
  );
  const manifest = readJson<{ assets?: ManifestAsset[] }>(manifestPath);
  const assets = manifest?.assets ?? [];

  // 2. Load TradingView live latest bars (fast assets only, ~5 files)
  const tvCacheDir = resolveTVCacheDir();
  const latestDir = path.join(tvCacheDir, "latest");
  const liveMap = new Map<string, LatestBar>();
  if (fs.existsSync(latestDir)) {
    for (const file of fs.readdirSync(latestDir).filter((f) => f.endsWith(".json"))) {
      const symbol = path.basename(file, ".json").toUpperCase();
      const bar = readJson<LatestBar>(path.join(latestDir, file));
      if (bar) liveMap.set(symbol, bar);
    }
  }

  // 3. Also check TV manifest for per-symbol poll_seconds
  const tvManifest = readJson<{ poll_seconds?: number; symbols?: Record<string, { poll_seconds?: number }> }>(
    path.join(tvCacheDir, "manifest.json"),
  );
  const defaultPoll = tvManifest?.poll_seconds ?? null;

  const items: LiveFeedItem[] = assets.map((a) => {
    const key = a.asset?.toUpperCase() ?? "";
    const live = liveMap.get(key);
    const pollSeconds = tvManifest?.symbols?.[key]?.poll_seconds ?? (live ? 5 : null) ?? defaultPoll;

    return {
      symbol: a.asset,
      tab: a.tab ?? "",
      source: a.source ?? "",
      lastClose: live?.close ?? a.lastClose ?? null,
      changePct: live?.change_pct ?? null,
      lastDate: a.lastDate ?? null,
      refreshedAt: live?.fetched_at ?? a.refreshedAt ?? null,
      firstDate: a.firstDate ?? null,
      barCount: a.barCount ?? null,
      dataStatus: live?.close != null ? "live" : a.lastClose != null ? "daily" : "missing",
      liveRefreshSeconds: pollSeconds ?? null,
    };
  });

  return NextResponse.json({ items });
}
