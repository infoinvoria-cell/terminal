import fs from "node:fs";
import path from "node:path";
import { getTradingViewLatest } from "@/lib/market-data/tradingview-cache";
import { getAssetByLiveSymbol, getAssetByTvSymbol } from "@/lib/market-data/asset-registry";
import type {
  MonitoringLiveFeedCoverageStatus,
  MonitoringLiveFeedResponse,
  MonitoringLiveFeedRow,
} from "@/lib/monitoring/live-feed-types";
import {
  buildDedupedLiveFeedUniverse,
  getUniverseAssetCandidates,
  resolveFeedStatus,
  type CIMonitorSymbol,
  type MonitoringUniverseAsset,
  type WhiteSwanUniverseAsset,
} from "@/lib/monitoring/live-feed-resolver";
import { buildTerminalUniverse } from "@/lib/market-data/terminal-universe";

// Real CI instruments that must appear in the drawer.
// QQQ is included so the dedupe pass marks it as "Core Invest" too (already in monitoring).
const CORE_INVEST_MONITOR_SYMBOLS: CIMonitorSymbol[] = [
  { ticker: "GLD",  name: "Gold ETF (GLD)",         tab: "Invest", source: "NYSE:GLD"  },
  { ticker: "SPY",  name: "S&P 500 ETF (SPY)",       tab: "Invest", source: "NYSE:SPY"  },
  { ticker: "SPMO", name: "Momentum ETF (SPMO)",      tab: "Invest", source: "NYSE:SPMO" },
  { ticker: "QQQ",  name: "Nasdaq 100 ETF (QQQ)",     tab: "Invest", source: "BATS:QQQ"  },
];

// Static coverage loaded once from pre-generated monitoring JSON files.
// Provides dataStartUtc/dataEndUtc independent of live DB or market status.
let _staticCoverage: Map<string, { startUtc: string; endUtc: string }> | null = null;

function loadStaticCoverageIndex(): Map<string, { startUtc: string; endUtc: string }> {
  if (_staticCoverage) return _staticCoverage;
  const map = new Map<string, { startUtc: string; endUtc: string }>();
  const dir = path.join(process.cwd(), "public", "generated", "monitoring");
  try {
    for (const fname of fs.readdirSync(dir)) {
      if (!fname.endsWith(".json")) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, fname), "utf8");
        const d = JSON.parse(raw) as { metadata?: { code?: string; start?: string; end?: string } };
        const code = String(d?.metadata?.code ?? "").trim().toUpperCase();
        const start = String(d?.metadata?.start ?? "").slice(0, 10);
        const end = String(d?.metadata?.end ?? "").slice(0, 10);
        if (!code || start < "1980-01-01" || end < "1980-01-01") continue;
        const cur = map.get(code);
        if (!cur) {
          map.set(code, { startUtc: start, endUtc: end });
        } else {
          if (start < cur.startUtc) cur.startUtc = start;
          if (end > cur.endUtc) cur.endUtc = end;
        }
      } catch { /* skip malformed file */ }
    }
  } catch { /* monitoring dir unreadable — graceful no-op */ }
  _staticCoverage = map;
  return map;
}

type QueryBuilder = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

type LiveQuoteRow = {
  symbol: string;
  close: number | null;
  timestamp: string | null;
  updated_at: string | null;
};

type OhlcRow = {
  asset?: string | null;
  symbol?: string | null;
  date: string | null;
  close: number | null;
};

type TradingViewLatestRow = {
  symbol: string;
  close: number | null;
  fetched_at: string | null;
  bar_time: string | null;
};

const DIRECT_YAHOO_SYMBOLS: Record<string, string> = {
  "UKX!": "^FTSE",
  UKX: "^FTSE",
  "NOK1!": "NOKUSD=X",
  NOK1: "NOKUSD=X",
};

function loadMonitoringUniverse(): MonitoringUniverseAsset[] {
  const filePath = path.join(process.cwd(), "public", "generated", "monitoring", "config", "monitoring_asset_universe.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw) as { assets?: MonitoringUniverseAsset[] };
  return json.assets ?? [];
}

function loadWhiteSwanUniverse(): WhiteSwanUniverseAsset[] {
  const filePath = path.join(process.cwd(), "src", "data", "monitoring", "white-swan-monitoring-assets.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw) as { assets?: WhiteSwanUniverseAsset[] };
  return json.assets ?? [];
}

function getVenue(source: string | undefined): string | null {
  const value = String(source || "").trim();
  if (!value) return null;
  return value.includes(":") ? value.split(":")[0] ?? null : null;
}

function getPrecision(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 2;
  if (Math.abs(value) >= 1000) return 0;
  if (Math.abs(value) >= 10) return 2;
  return 4;
}

function sanitizeCoverageDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1980) return null;
  return date;
}

function classifyCoverageStatus(startUtc: string | null, endUtc: string | null): MonitoringLiveFeedCoverageStatus {
  if (!startUtc && !endUtc) return "missing";
  if (startUtc && endUtc && startUtc !== endUtc) return "complete";
  return "partial";
}

async function fetchYahooLastPrice(symbol: string): Promise<{ price: number | null; asOf: string | null }> {
  const mapped = DIRECT_YAHOO_SYMBOLS[symbol];
  if (!mapped) return { price: null, asOf: null };

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?range=5d&interval=1d`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://finance.yahoo.com/",
        },
      },
    );
    if (!response.ok) return { price: null, asOf: null };
    const json = await response.json() as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number | null };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    if (!result) return { price: null, asOf: null };
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const lastClose = [...closes].reverse().find((value) => value != null && Number.isFinite(value));
    const lastTimestamp = [...(result.timestamp ?? [])].reverse().find((value) => Number.isFinite(value));
    const price = Number.isFinite(result.meta?.regularMarketPrice)
      ? Number(result.meta?.regularMarketPrice)
      : lastClose != null
        ? Number(lastClose)
        : null;
    return {
      price,
      asOf: lastTimestamp ? new Date(lastTimestamp * 1000).toISOString() : null,
    };
  } catch {
    return { price: null, asOf: null };
  }
}

export async function buildMonitoringLiveFeedView(db: QueryBuilder): Promise<MonitoringLiveFeedResponse> {
  const monitoringUniverse = loadMonitoringUniverse();
  const whiteSwanUniverse = loadWhiteSwanUniverse();
  const { assets: dedupedUniverse } = buildDedupedLiveFeedUniverse(
    monitoringUniverse,
    whiteSwanUniverse,
    CORE_INVEST_MONITOR_SYMBOLS,
  );
  const canonicalUniverse = buildTerminalUniverse();
  const canonicalByTicker = new Map<string, (typeof canonicalUniverse.entries)[number]>();
  for (const entry of canonicalUniverse.entries) {
    canonicalByTicker.set(entry.ticker.toUpperCase(), entry);
  }

  const symbols = dedupedUniverse.flatMap((asset) => getUniverseAssetCandidates(asset));
  const latestTvBySymbol = new Map<string, TradingViewLatestRow>();
  for (const row of getTradingViewLatest() as TradingViewLatestRow[]) {
    const key = String(row.symbol || "").trim().toUpperCase();
    if (!key || latestTvBySymbol.has(key)) continue;
    latestTvBySymbol.set(key, row);
  }

  const { data: liveRows } = await db
    .from("live_quotes")
    .select("symbol,close,timestamp,updated_at")
    .in("symbol", symbols)
    .order("updated_at", { ascending: false })
    .limit(symbols.length * 4);

  const latestLiveBySymbol = new Map<string, LiveQuoteRow>();
  for (const row of (liveRows ?? []) as LiveQuoteRow[]) {
    const key = String(row.symbol || "").trim().toUpperCase();
    if (!key || latestLiveBySymbol.has(key)) continue;
    latestLiveBySymbol.set(key, row);
  }

  const { data: monitoringRows } = await db
    .from("monitoring_ohlc")
    .select("asset,date,close")
    .in("asset", symbols)
    .eq("timeframe", "D")
    .order("date", { ascending: false })
    .limit(symbols.length * 4);

  const { data: investRows } = await db
    .from("invest_ohlc")
    .select("symbol,date,close")
    .in("symbol", symbols)
    .order("date", { ascending: false })
    .limit(symbols.length * 4);

  const latestOhlcBySymbol = new Map<string, OhlcRow>();
  const coverageBySymbol = new Map<string, { startUtc: string | null; endUtc: string | null; rowCount: number }>();

  for (const row of [...((monitoringRows ?? []) as OhlcRow[]), ...((investRows ?? []) as OhlcRow[])]) {
    const key = String(row.asset || row.symbol || "").trim().toUpperCase();
    if (!key || latestOhlcBySymbol.has(key)) continue;
    latestOhlcBySymbol.set(key, row);
  }

  const { data: monitoringCoverageRows } = await db
    .from("monitoring_ohlc")
    .select("asset,date")
    .in("asset", symbols)
    .eq("timeframe", "D")
    .order("date", { ascending: true })
    .limit(50000);

  const { data: investCoverageRows } = await db
    .from("invest_ohlc")
    .select("symbol,date")
    .in("symbol", symbols)
    .order("date", { ascending: true })
    .limit(50000);

  for (const row of [...((monitoringCoverageRows ?? []) as OhlcRow[]), ...((investCoverageRows ?? []) as OhlcRow[])]) {
    const key = String(row.asset || row.symbol || "").trim().toUpperCase();
    const date = row.date ? String(row.date).slice(0, 10) : null;
    if (!key || !date) continue;
    const current = coverageBySymbol.get(key);
    if (!current) {
      coverageBySymbol.set(key, { startUtc: date, endUtc: date, rowCount: 1 });
      continue;
    }
    coverageBySymbol.set(key, {
      startUtc: current.startUtc ?? date,
      endUtc: date,
      rowCount: current.rowCount + 1,
    });
  }

  const staticCoverageIndex = loadStaticCoverageIndex();
  const yahooFallbackByTicker = new Map<string, { price: number | null; asOf: string | null }>();
  const missingPriceAssets = dedupedUniverse.filter((asset) => {
    const candidates = getUniverseAssetCandidates(asset);
    const hasLive = candidates.some((candidate) => latestLiveBySymbol.has(candidate));
    const hasTv = candidates.some((candidate) => latestTvBySymbol.has(candidate));
    const hasOhlc = candidates.some((candidate) => latestOhlcBySymbol.has(candidate));
    return !hasLive && !hasTv && !hasOhlc;
  });

  await Promise.all(
    missingPriceAssets.map(async (asset) => {
      const yahooCandidates = [
        asset.ticker,
        ...getUniverseAssetCandidates(asset),
        String(asset.name || ""),
      ]
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean);

      for (const candidate of yahooCandidates) {
        const hit = await fetchYahooLastPrice(candidate);
        if (hit.price != null && Number.isFinite(hit.price)) {
          yahooFallbackByTicker.set(asset.ticker, hit);
          return;
        }
      }
    }),
  );

  const nowMs = Date.now();
  let hasRealtime = false;

  const items: MonitoringLiveFeedRow[] = dedupedUniverse
    .map((asset) => {
      const ticker = asset.ticker;
      const canonical = canonicalByTicker.get(ticker);
      const candidates = getUniverseAssetCandidates(asset);
      const registry =
        getAssetByLiveSymbol(ticker) ||
        getAssetByTvSymbol(String(asset.source || "").trim()) ||
        getAssetByTvSymbol(`${getVenue(asset.source)}:${ticker}`);
      const live = candidates.map((candidate) => latestLiveBySymbol.get(candidate)).find(Boolean);
      const tv = candidates.map((candidate) => latestTvBySymbol.get(candidate)).find(Boolean);
      const fallback = candidates.map((candidate) => latestOhlcBySymbol.get(candidate)).find(Boolean);
      const coverage = candidates.map((candidate) => coverageBySymbol.get(candidate)).find(Boolean);
      const yahoo = yahooFallbackByTicker.get(ticker);
      const liveTimestamp = live?.timestamp || live?.updated_at || null;
      const liveAgeMs = liveTimestamp ? nowMs - new Date(liveTimestamp).getTime() : null;
      const delaySeconds = registry?.liveDelayMinutes != null ? registry.liveDelayMinutes * 60 : null;
      const hasLivePrice = live?.close != null && Number.isFinite(Number(live.close));
      const hasTvPrice = tv?.close != null && Number.isFinite(Number(tv.close));
      const hasFallbackPrice = fallback?.close != null && Number.isFinite(Number(fallback.close));
      const feedStatus = resolveFeedStatus({
        hasLivePrice: hasLivePrice || hasTvPrice,
        liveAgeMs,
        delaySeconds,
        hasFallbackPrice: hasFallbackPrice || (yahoo?.price != null && Number.isFinite(yahoo.price)),
      });
      if (feedStatus === "realtime") hasRealtime = true;

      const price =
        hasLivePrice
          ? Number(live?.close)
          : hasTvPrice
            ? Number(tv?.close)
            : hasFallbackPrice
              ? Number(fallback?.close)
              : yahoo?.price ?? null;

      const staticCov = staticCoverageIndex.get(ticker);
      const dataStartUtc =
        sanitizeCoverageDate(asset.startDate) ??
        sanitizeCoverageDate(coverage?.startUtc) ??
        sanitizeCoverageDate(staticCov?.startUtc) ??
        null;
      const dataEndUtc =
        sanitizeCoverageDate(asset.endDate) ??
        sanitizeCoverageDate(coverage?.endUtc) ??
        sanitizeCoverageDate(fallback?.date) ??
        sanitizeCoverageDate(tv?.bar_time) ??
        sanitizeCoverageDate(yahoo?.asOf) ??
        sanitizeCoverageDate(staticCov?.endUtc) ??
        null;
      const sourceQuality: MonitoringLiveFeedRow["sourceQuality"] =
        feedStatus === "realtime"
          ? "realtime"
          : feedStatus === "delayed"
            ? "delayed"
            : feedStatus === "stale" || feedStatus === "offline"
              ? "stale"
              : hasFallbackPrice || yahoo?.price != null
                ? "historical_only"
                : "unavailable";

      return {
        instrumentId: canonical?.instrumentId ?? String(asset.id || ticker),
        ticker,
        name: String(asset.name || ticker),
        venue: canonical?.venue ?? getVenue(asset.source),
        tab: String(asset.tab || "Unknown"),
        usedBy: asset.usedBy,
        source: String(asset.source || ticker),
        price,
        pricePrecision: registry?.class === "daily_fx" || registry?.class === "intraday_forex" ? 4 : getPrecision(price),
        provider: live ? "live_quotes" : tv ? "tv_cache" : fallback ? "ohlc_store" : yahoo?.price != null ? "yahoo_fallback" : null,
        feedStatus,
        delaySeconds,
        expectedDelaySeconds: canonical?.expectedDelaySeconds ?? delaySeconds,
        freshnessSeconds: liveAgeMs != null && Number.isFinite(liveAgeMs) ? Math.max(0, Math.round(liveAgeMs / 1000)) : null,
        sourceQuality,
        lastUpdateUtc: liveTimestamp || tv?.fetched_at || tv?.bar_time || fallback?.date || yahoo?.asOf || null,
        dataStartUtc,
        dataEndUtc,
        dataRowCount: coverage?.rowCount ?? null,
        coverageStatus: classifyCoverageStatus(dataStartUtc, dataEndUtc),
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker, "en", { numeric: true, sensitivity: "base" }));

  return {
    items,
    pollingSeconds: hasRealtime ? 5 : 30,
    countdownMode: hasRealtime ? "live" : "polling",
    asOf: new Date().toISOString(),
    universeCounts: {
      monitoring: canonicalUniverse.counts.monitoringCount,
      whiteSwan: canonicalUniverse.counts.whiteSwanCount,
      coreInvest: canonicalUniverse.counts.coreInvestCount,
      deduped: canonicalUniverse.counts.dedupedTotalCount,
    },
  };
}
