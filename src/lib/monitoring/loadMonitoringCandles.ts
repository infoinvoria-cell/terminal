"use client";

import { monitoringFeatureFlags } from "@/config/monitoringFeatureFlags";
import { getCandles, getJson, setCandles } from "@/lib/monitoring/data/monitoringDataCache";
import { fetchMonitoringJson, fetchMonitoringWithTimeout } from "@/lib/monitoring/fetchMonitoringJson";
import { mergeLiveSnapshot, type LiveSnapshotMergeStatus } from "@/lib/monitoring/mergeLiveSnapshot";
import { loadAgrarLiveSnapshot, type AgrarLiveSnapshot } from "@/lib/monitoring/loadAgrarLiveSnapshot";

export type MonitoringLoadStatus = "loading" | "loaded" | "no_data" | "load_error" | "invalid_data" | "missing_candles";

export type MonitoringTabLabel =
  | "Agrar"
  | "Metalle"
  | "Energie"
  | "Indizes"
  | "FX"
  | "Aktien"
  | "Invest"
  | "Intraday MT"
  | "Anomaly"
  | "Alle Strategien";

export type MonitoringLoadParams = {
  tab: MonitoringTabLabel;
  symbol: string;
  source: string;
  maxBars: number;
  timeframe?: "D" | "2h" | "1h" | "30m" | string;
  cacheVersion?: string;
};

export type MonitoringCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MonitoringPayloadLite = {
  metadata?: Record<string, unknown>;
  bars?: Array<{
    time: string | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>;
  signals?: unknown[];
  boxes?: unknown[];
};

type TradingViewDataCachePayload = {
  schema?: string;
  source?: string;
  symbol?: string;
  timeframe?: string;
  provider?: string;
  variant?: string;
  barCount?: number;
  firstDate?: string | null;
  lastDate?: string | null;
  bars?: Array<{
    time?: number | string | null;
    date?: string | null;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }>;
};

type UniverseAsset = {
  tab?: string;
  symbol?: string;
  requestSymbol?: string;
  short?: string;
  source?: string;
  timeframe?: string;
  csvFile?: string;
  hasData?: boolean;
  buildable?: boolean;
  hasStrategy?: boolean;
  strategyStatus?: string;
};

type UniverseConfig = {
  assets?: UniverseAsset[];
};

type CacheManifestFullAsset = {
  source?: string;
  tab?: string;
  timeframe?: string;
  status?: string;
  stale?: boolean;
  cachePath?: string;
};

type CacheManifestFull = {
  generatedAt?: string;
  assets?: CacheManifestFullAsset[];
};

let cachedManifestVersion = "";

async function fetchJsonOnce<T>(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  cacheKey?: string,
): Promise<T | null> {
  return fetchMonitoringJson<T>(url, { timeoutMs, signal, cacheKey });
}

const VERIFIED_AGRAR_TV_CACHE_SOURCES = new Set<string>([
  "CBOT:ZW1!",
  "CBOT:ZC1!",
  "ICEUS:CC1!",
  "ICEUS:KC1!",
  "ICEUS:SB1!",
  "ICEUS:CT1!",
  "ICEUS:OJ1!",
  "CBOT:ZS1!",
]);

const TAB_CACHE_DIR: Record<MonitoringTabLabel, string | null> = {
  Agrar: "agrar",
  Metalle: "metalle",
  Energie: "energie",
  Indizes: "indizes",
  FX: "fx",
  Aktien: "aktien",
  Invest: "invest",
  "Intraday MT": "intraday_mt",
  Anomaly: null,
  "Alle Strategien": null,
};

export type MonitoringLoadResult = {
  ok: boolean;
  status: MonitoringLoadStatus;
  bars: MonitoringCandle[];
  error?: string;
  resolvedPath?: string;
  staleData: boolean;
  manifestGeneratedAt: string | null;
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
  payload: MonitoringPayloadLite | null;
  mergeStatus: LiveSnapshotMergeStatus;
  mergeWarning: string | null;
  snapshotDate: string | null;
  historyLastDateBeforeMerge: string | null;
  historyCloseBeforeMerge: number | null;
  snapshotClose: number | null;
};

function normalizeSource(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeSymbol(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(day) ? day : null;
}

function normalizeIsoTime(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const dt = new Date(value > 1e12 ? value : value * 1000);
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const withZ = /^\d{4}-\d{2}-\d{2}T/.test(text) ? text : `${text}Z`;
  const dt = new Date(withZ);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function isIntradayTimeframe(timeframe: string | null | undefined): boolean {
  const tf = normalizeTimeframe(timeframe);
  return tf === "30M" || tf === "1H" || tf === "2H";
}

function sanitizeBars(rawBars: MonitoringPayloadLite["bars"], timeframe: string): MonitoringCandle[] {
  const byTime = new Map<string, MonitoringCandle>();
  const intraday = isIntradayTimeframe(timeframe);
  for (const row of Array.isArray(rawBars) ? rawBars : []) {
    const time = intraday
      ? normalizeIsoTime(row?.time ?? null)
      : normalizeDay(row?.time ?? null);
    const open = Number(row?.open);
    const high = Number(row?.high);
    const low = Number(row?.low);
    const close = Number(row?.close);
    if (!time) continue;
    if (!isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) continue;
    if (high < low) continue;
    byTime.set(time, { time, open, high, low, close });
  }
  const sorted = Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
  return sorted;
}

function sanitizeTvCacheBars(rawBars: TradingViewDataCachePayload["bars"], timeframe: string): MonitoringCandle[] {
  const byTime = new Map<string, MonitoringCandle>();
  const intraday = isIntradayTimeframe(timeframe);
  for (const row of Array.isArray(rawBars) ? rawBars : []) {
    const time = intraday
      ? normalizeIsoTime(row?.time ?? row?.date ?? null)
      : normalizeDay(row?.date ?? null);
    const open = Number(row?.open);
    const high = Number(row?.high);
    const low = Number(row?.low);
    const close = Number(row?.close);
    if (!time) continue;
    if (!isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) continue;
    if (high < low) continue;
    byTime.set(time, { time, open, high, low, close });
  }
  return Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function normalizeTimeframe(value: string | null | undefined): string {
  const tf = String(value || "D").trim().toUpperCase();
  if (tf === "1D" || tf === "D" || tf === "DAY" || tf === "DAILY") return "D";
  if (tf === "2H" || tf === "120" || tf === "120M") return "2H";
  if (tf === "1H" || tf === "60" || tf === "60M") return "1H";
  if (tf === "30M" || tf === "30") return "30M";
  return tf || "D";
}

function toCacheFileFromSource(source: string, timeframe: string): string | null {
  const [exchange, symbol] = String(source || "").split(":", 2);
  if (!exchange || !symbol) return null;
  return `${exchange}_${symbol.replace("!", "")}_${timeframe}.json`;
}

let cachedSnapshotPromise: Promise<AgrarLiveSnapshot | null> | null = null;
let cachedSnapshotLoadedAtMs = 0;

const SNAPSHOT_CACHE_TTL_MS = 5_000;
const SNAPSHOT_MAX_AGE_HOURS = 24;

async function loadSnapshotOnce(signal?: AbortSignal): Promise<AgrarLiveSnapshot | null> {
  const now = Date.now();
  const isExpired = now - cachedSnapshotLoadedAtMs > SNAPSHOT_CACHE_TTL_MS;
  if (!cachedSnapshotPromise || isExpired) {
    cachedSnapshotPromise = loadAgrarLiveSnapshot(signal);
    cachedSnapshotLoadedAtMs = now;
  }
  try {
    return await cachedSnapshotPromise;
  } catch {
    return null;
  }
}

type SnapshotValidation =
  | { valid: true; ageHours: number | null }
  | { valid: false; reason: "invalid_snapshot" | "stale_snapshot_ignored"; ageHours: number | null };

function validateSnapshotRoot(snapshot: AgrarLiveSnapshot | null): SnapshotValidation {
  if (!snapshot) return { valid: false, reason: "invalid_snapshot", ageHours: null };
  if (String(snapshot.schema || "").trim() !== "capitalife_tv_live_snapshot_v1") {
    return { valid: false, reason: "invalid_snapshot", ageHours: null };
  }
  const tf = String(snapshot.timeframe || "").trim().toUpperCase();
  if (tf !== "D" && tf !== "1D") {
    return { valid: false, reason: "invalid_snapshot", ageHours: null };
  }
  if (!snapshot.createdAt) {
    return { valid: false, reason: "invalid_snapshot", ageHours: null };
  }
  const createdAtMs = Date.parse(snapshot.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return { valid: false, reason: "invalid_snapshot", ageHours: null };
  }
  const ageHours = (Date.now() - createdAtMs) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours > SNAPSHOT_MAX_AGE_HOURS) {
    return { valid: false, reason: "stale_snapshot_ignored", ageHours: Number.isFinite(ageHours) ? ageHours : null };
  }
  return { valid: true, ageHours };
}

async function resolveUniverseAsset(params: MonitoringLoadParams, signal?: AbortSignal): Promise<UniverseAsset | null> {
  const universePath = "/generated/monitoring/config/monitoring_asset_universe.json";
  const json = await fetchJsonOnce<UniverseConfig>(universePath, 6000, signal);
  if (!json) return null;
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const tab = params.tab.toUpperCase();
  const symbol = normalizeSymbol(params.symbol);
  const source = normalizeSource(params.source);
  const requestedTf = normalizeTimeframe(params.timeframe);
  return (
    assets.find((asset) => {
      const assetTab = String(asset.tab || "").toUpperCase();
      const assetSymbol = normalizeSymbol(asset.symbol || "");
      const assetRequestSymbol = normalizeSymbol(asset.requestSymbol || "");
      const assetSource = normalizeSource(asset.source || "");
      if (assetTab !== tab || assetSource !== source) return false;
      const symbolMatch = assetSymbol === symbol || (assetRequestSymbol && assetRequestSymbol === symbol);
      if (!symbolMatch) return false;
      if (tab === "INTRADAY MT") {
        const assetTf = normalizeTimeframe(String(asset.timeframe || "D"));
        return assetTf === requestedTf;
      }
      return true;
    }) ?? null
  );
}

async function loadCacheManifestFull(cacheVersion?: string, signal?: AbortSignal): Promise<CacheManifestFull | null> {
  const manifestPath = "/generated/monitoring/tradingview_data_cache/cache_manifest_full.json";
  const version = String(cacheVersion || "").trim();
  const cacheKey = version ? `${manifestPath}?version=${version}` : manifestPath;
  const canReuseCached = Boolean(version) && version === cachedManifestVersion;
  const cached = getJson(cacheKey) as CacheManifestFull | null;
  if (canReuseCached && cached && Array.isArray(cached.assets)) return cached;
  // fetchJsonOnce deduplicates concurrent requests for the same URL, so when
  // 25 assets load in parallel they share a single network request for this file.
  const json = await fetchJsonOnce<CacheManifestFull>(
    manifestPath,
    6000,
    signal,
    cacheKey,
  );
  if (json) cachedManifestVersion = version;
  return json;
}

function toPublicPath(pathLike: string): string {
  const p = String(pathLike || "").replace(/\\/g, "/").trim();
  if (!p) return "";
  if (p.startsWith("/")) return p;
  if (p.startsWith("public/")) return `/${p.slice("public/".length)}`;
  return `/${p}`;
}

function findManifestAssetEntry(
  manifest: CacheManifestFull | null,
  source: string,
  timeframe: string,
  tab: MonitoringTabLabel,
): CacheManifestFullAsset | null {
  const assets = Array.isArray(manifest?.assets) ? manifest!.assets! : [];
  const src = normalizeSource(source);
  const tf = normalizeTimeframe(timeframe);
  const tabUpper = String(tab || "").trim().toUpperCase();
  const exact = assets.find((row) =>
    normalizeSource(String(row.source || "")) === src
    && normalizeTimeframe(String(row.timeframe || "D")) === tf
    && String(row.tab || "").trim().toUpperCase() === tabUpper,
  );
  if (exact) return exact;
  return assets.find((row) =>
    normalizeSource(String(row.source || "")) === src
    && normalizeTimeframe(String(row.timeframe || "D")) === tf,
  ) ?? null;
}

export async function loadMonitoringCandles(
  params: MonitoringLoadParams,
  signal?: AbortSignal,
): Promise<MonitoringLoadResult> {
  try {
    const isIntradayMtTab = params.tab === "Intraday MT";
    const universeAsset = await resolveUniverseAsset(params, signal);

    // For Intraday MT: universe lookup may fail when the asset config uses a
    // source/timeframe combination not present in monitoring_asset_universe.json
    // (e.g. OANDA:DE30EUR at 2H or 1H is only listed at 30m in the universe).
    // In that case we do NOT bail — the cache_manifest_full.json is authoritative
    // for Intraday MT and we continue with manifest-based resolution below.
    if (!universeAsset && !isIntradayMtTab) {
      return {
        ok: false,
        status: "load_error",
        bars: [],
        error: "Asset not found in monitoring_asset_universe.json",
        resolvedPath: undefined,
        staleData: false,
        manifestGeneratedAt: null,
        barCount: 0,
        firstDate: null,
        lastDate: null,
        payload: null,
        mergeStatus: "no_snapshot",
        mergeWarning: null,
        snapshotDate: null,
        historyLastDateBeforeMerge: null,
        historyCloseBeforeMerge: null,
        snapshotClose: null,
      };
    }

    if (universeAsset && universeAsset.hasData === false) {
      return {
        ok: false,
        status: "no_data",
        bars: [],
        error: "Asset marked as missing_data in monitoring_asset_universe.json",
        resolvedPath: undefined,
        staleData: false,
        manifestGeneratedAt: null,
        barCount: 0,
        firstDate: null,
        lastDate: null,
        payload: null,
        mergeStatus: "no_snapshot",
        mergeWarning: null,
        snapshotDate: null,
        historyLastDateBeforeMerge: null,
        historyCloseBeforeMerge: null,
        snapshotClose: null,
      };
    }

    const sourceKey = normalizeSource(params.source);
    const timeframe = normalizeTimeframe(params.timeframe);
    const cacheVersion = String(params.cacheVersion || "").trim();
    const cachedCandles = monitoringFeatureFlags.enableLiveSnapshotMerge
      ? null
      : getCandles(sourceKey, timeframe, params.maxBars > 0 ? params.maxBars : 0, cacheVersion);
    if (cachedCandles && cachedCandles.length > 0) {
      const payloadFromCache: MonitoringPayloadLite = {
        metadata: {
          code: params.symbol,
          tvSymbol: params.source,
          badge: (universeAsset as { stub?: boolean } | undefined)?.stub ? "DATA STUB" : (universeAsset?.hasStrategy ? "OK" : "NO STRAT"),
          hasStrategy: Boolean(universeAsset?.hasStrategy),
        },
        bars: cachedCandles.map((bar) => ({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
        signals: [],
        boxes: [],
      };
      return {
        ok: true,
        status: "loaded",
        bars: cachedCandles,
        resolvedPath: "memory-cache",
        staleData: false,
        manifestGeneratedAt: null,
        barCount: cachedCandles.length,
        firstDate: cachedCandles[0]?.time ?? null,
        lastDate: cachedCandles[cachedCandles.length - 1]?.time ?? null,
        payload: payloadFromCache,
        mergeStatus: "no_snapshot",
        mergeWarning: null,
        snapshotDate: null,
        historyLastDateBeforeMerge: null,
        historyCloseBeforeMerge: null,
        snapshotClose: null,
      };
    }
    const cacheFile = toCacheFileFromSource(sourceKey, timeframe);
    const tabCacheDir = TAB_CACHE_DIR[params.tab];
    let cacheResolvedPath: string | undefined;
    let staleData = false;
    let manifestGeneratedAt: string | null = null;
    let payload: MonitoringPayloadLite | null = null;
    let historyBars: MonitoringCandle[] = [];
    const manifest = await loadCacheManifestFull(params.cacheVersion, signal);
    manifestGeneratedAt = typeof manifest?.generatedAt === "string" ? manifest.generatedAt : null;
    const manifestEntry = findManifestAssetEntry(manifest, sourceKey, timeframe, params.tab);
    if (manifestEntry) {
      staleData = Boolean(manifestEntry.stale);
      const candidatePath = toPublicPath(String(manifestEntry.cachePath || ""));
      if (candidatePath) {
        cacheResolvedPath = candidatePath;
      }
    }

    // Priority for Intraday MT fallback resolution:
    // 1. Manifest cachePath (set above) — always preferred when present.
    // 2. Timeframe subdirectory (e.g. /30M/, /1H/, /2H/) — fresh generated files live here.
    // 3. Legacy tab directory (intraday_mt/) — last resort; only used when the timeframe
    //    directory file does not exist, but files here are mirrors of the fresh files.
    // We NEVER use the old optimizer-mt package files as a live data source.
    if (!cacheResolvedPath && cacheFile) {
      // For Intraday MT prefer the timeframe subdirectory over the tab subdirectory
      // because the manifest's cachePath always points there and the data is guaranteed fresh.
      if (isIntradayMtTab && isIntradayTimeframe(timeframe)) {
        cacheResolvedPath = `/generated/monitoring/tradingview_data_cache/${timeframe}/${cacheFile}`;
      } else if (tabCacheDir) {
        cacheResolvedPath = `/generated/monitoring/tradingview_data_cache/${tabCacheDir}/${cacheFile}`;
      } else {
        cacheResolvedPath = `/generated/monitoring/tradingview_data_cache/${timeframe}/${cacheFile}`;
      }
    }

    // Build cache-busted URL. All fetches use `no-store` (see fetchMonitoringWithTimeout)
    // so the browser never serves stale data from disk cache. The version suffix is used
    // as the in-memory dedup key — for Intraday MT we always include the cacheVersion
    // (or an empty string) to ensure that a re-fetch with a new stamp uses a different key.
    const cacheVersionSuffix = params.cacheVersion
      ? `?v=${encodeURIComponent(params.cacheVersion)}`
      : "";
    const cacheResolvedPathWithVersion = cacheResolvedPath
      ? `${cacheResolvedPath}${cacheVersionSuffix}`
      : undefined;
    if (cacheResolvedPathWithVersion) {
      const cachedJson = getJson(cacheResolvedPathWithVersion);
      let cachePayload: TradingViewDataCachePayload | null = cachedJson as TradingViewDataCachePayload | null;
      if (!cachePayload) {
        cachePayload = await fetchJsonOnce<TradingViewDataCachePayload>(cacheResolvedPathWithVersion, 6000, signal);
      }
      if (cachePayload) {
        const cacheBars = sanitizeTvCacheBars(cachePayload?.bars, timeframe);
        if (cacheBars.length > 0) {
          historyBars = cacheBars;
          payload = {
            metadata: {
              code: params.symbol,
              tvSymbol: params.source,
              badge: (universeAsset as { stub?: boolean } | undefined)?.stub ? "DATA STUB" : (universeAsset?.hasStrategy ? "OK" : "NO STRAT"),
              hasStrategy: Boolean(universeAsset?.hasStrategy),
            },
            bars: cacheBars.map((bar) => ({
              time: bar.time,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            })),
            signals: [],
            boxes: [],
          };
        }
      }
    }

    if (!historyBars.length && params.tab === "Agrar" && universeAsset) {
      // When enableTradingViewDataCacheAgrar is active, prefer the agrar/ TVC cache
      // as fallback instead of the legacy agrar_*.json files (which are stale).
      if (monitoringFeatureFlags.enableTradingViewDataCacheAgrar && cacheFile) {
        const isVerifiedCache = VERIFIED_AGRAR_TV_CACHE_SOURCES.has(sourceKey);
        if (isVerifiedCache) {
          const agrPath = `/generated/monitoring/tradingview_data_cache/agrar/${cacheFile}`;
          try {
            const agrRes = await fetchMonitoringWithTimeout(agrPath, 6000, signal);
            if (agrRes.ok) {
              const agrPayload = (await agrRes.json()) as TradingViewDataCachePayload;
              const agrBars = sanitizeTvCacheBars(agrPayload?.bars, "D");
              if (agrBars.length > 0) {
                historyBars = agrBars;
                cacheResolvedPath = agrPath;
              }
            }
          } catch {
            // fall through to legacy agrar_*.json
          }
        }
      }

      if (!historyBars.length) {
        const short = String(universeAsset.short || "").trim();
        const baseResolvedPath = short ? `/generated/monitoring/agrar_${short}.json` : "";
        if (!baseResolvedPath) {
          return {
            ok: false,
            status: "load_error",
            bars: [],
            error: "Missing short symbol for chart file resolution",
            resolvedPath: undefined,
            staleData: false,
            manifestGeneratedAt,
            barCount: 0,
            firstDate: null,
            lastDate: null,
            payload: null,
            mergeStatus: "no_snapshot",
            mergeWarning: null,
            snapshotDate: null,
            historyLastDateBeforeMerge: null,
            historyCloseBeforeMerge: null,
            snapshotClose: null,
          };
        }
        const cachedBase = getJson(baseResolvedPath) as MonitoringPayloadLite | null;
        let basePayload: MonitoringPayloadLite | null = cachedBase;
        if (!basePayload) {
          basePayload = await fetchJsonOnce<MonitoringPayloadLite>(baseResolvedPath, 6000, signal);
        }
        if (basePayload && typeof basePayload === "object") {
          const parsed = sanitizeBars(basePayload.bars, "D");
          if (parsed.length > 0) {
            historyBars = parsed;
            payload = basePayload;
            cacheResolvedPath = baseResolvedPath;
          }
        }
      }
    }

    // Supabase API fallback — called when static cache files are absent (e.g. on Vercel where
    // public/generated/ is gitignored). The /api/monitoring/ohlc route falls through to the
    // monitoring_ohlc Supabase table when the manifest file is missing on disk.
    if (!historyBars.length) {
      try {
        const apiUrl = `/api/monitoring/ohlc?symbol=${encodeURIComponent(normalizeSymbol(universeAsset?.requestSymbol ?? universeAsset?.symbol ?? params.symbol))}&timeframe=${encodeURIComponent(timeframe)}`;
        const apiRes = await fetchMonitoringWithTimeout(apiUrl, 8000, signal);
        if (apiRes.ok) {
          const apiJson = (await apiRes.json()) as { bars?: MonitoringPayloadLite["bars"] };
          if (Array.isArray(apiJson.bars) && apiJson.bars.length > 0) {
            const apiBars = sanitizeBars(apiJson.bars, timeframe);
            if (apiBars.length > 0) {
              historyBars = apiBars;
              cacheResolvedPath = "supabase";
              payload = {
                metadata: {
                  code: params.symbol,
                  tvSymbol: params.source,
                  badge: universeAsset?.hasStrategy ? "OK" : "NO STRAT",
                  hasStrategy: Boolean(universeAsset?.hasStrategy),
                },
                bars: apiBars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
                signals: [],
                boxes: [],
              };
            }
          }
        }
      } catch {
        // fall through to no_data
      }
    }

    if (!historyBars.length) {
      const intraday = params.tab === "Intraday MT" && isIntradayTimeframe(timeframe);
      const missingCache = cacheResolvedPath ? `Cache not found or empty: ${cacheResolvedPath}` : "No cache file mapping for asset";
      return {
        ok: false,
        status: intraday ? "missing_candles" : "no_data",
        bars: [],
        error: intraday ? `missing_candles: ${missingCache}` : missingCache,
        resolvedPath: cacheResolvedPath,
        staleData,
        manifestGeneratedAt,
        barCount: 0,
        firstDate: null,
        lastDate: null,
        payload: null,
        mergeStatus: "no_snapshot",
        mergeWarning: null,
        snapshotDate: null,
        historyLastDateBeforeMerge: null,
        historyCloseBeforeMerge: null,
        snapshotClose: null,
      };
    }

    let barsSourcePath = cacheResolvedPath ?? "";
    let mergedBars = historyBars;

    if (monitoringFeatureFlags.enableTradingViewDataCacheAgrar && params.tab === "Agrar") {
      const isVerifiedCache = VERIFIED_AGRAR_TV_CACHE_SOURCES.has(sourceKey);
      if (cacheFile && isVerifiedCache) {
        const cachePath = `/generated/monitoring/tradingview_data_cache/agrar/${cacheFile}`;
        try {
          const cacheRes = await fetchMonitoringWithTimeout(cachePath, 6000, signal);
          if (cacheRes.ok) {
            const cachePayload = (await cacheRes.json()) as TradingViewDataCachePayload;
            const cacheBars = sanitizeTvCacheBars(cachePayload?.bars, "D");
            if (cacheBars.length > 0) {
              mergedBars = cacheBars;
              barsSourcePath = cachePath;
            }
          }
        } catch {
          // keep stable fallback to base history
        }
      }
    }

    const historyLast = historyBars[historyBars.length - 1] ?? null;
    const historyLastDateBeforeMerge = historyLast?.time ?? null;
    const historyCloseBeforeMerge = historyLast?.close ?? null;

    let mergeStatus: LiveSnapshotMergeStatus = "no_snapshot";
    let mergeWarning: string | null = null;
    let snapshotDate: string | null = null;
    let snapshotClose: number | null = null;

    if (monitoringFeatureFlags.enableLiveSnapshotMerge) {
      const snapshot = await loadSnapshotOnce(signal);
      const snapshotValidation = validateSnapshotRoot(snapshot);
      if (!snapshotValidation.valid) {
        mergeStatus = snapshotValidation.reason;
        mergeWarning = snapshotValidation.reason === "invalid_snapshot" ? "invalid_snapshot_root" : null;
      } else {
        const sourceKey = normalizeSource(params.source);
        const bySource = sourceKey ? snapshot?.bySource?.[sourceKey] ?? null : null;
        const bySymbol = normalizeSymbol(params.symbol) ? snapshot?.bySymbol?.[normalizeSymbol(params.symbol)] ?? null : null;
        if (!bySource) {
          mergeStatus = "no_snapshot";
          if (bySymbol && normalizeSource(bySymbol.source || "") !== sourceKey) {
            mergeWarning = "symbol_mapping_failed_source_mismatch";
          }
        } else if (normalizeSource(bySource.source || "") !== sourceKey) {
          mergeStatus = "no_snapshot";
          mergeWarning = "symbol_mapping_failed_source_mismatch";
        } else {
          snapshotDate = bySource.latest?.date ?? null;
          snapshotClose = bySource.latest ? Number(bySource.latest.close) : null;
          const merged = mergeLiveSnapshot({
            historicalBars: mergedBars,
            liveSnapshotAsset: bySource.latest
              ? {
                  name: bySource.name,
                  symbol: bySource.symbol,
                  source: bySource.source,
                  mergeMode: bySource.mergeMode ?? snapshot?.mergeMode ?? "replace_current_bar",
                  date: bySource.latest.date,
                  open: bySource.latest.open,
                  high: bySource.latest.high,
                  low: bySource.latest.low,
                  close: bySource.latest.close,
                  volume: bySource.latest.volume ?? null,
                }
              : null,
          });
          mergedBars = merged.bars;
          mergeStatus = merged.mergeStatus;
          mergeWarning = merged.warning;
        }
      }
    }

    const bars = params.maxBars > 0 ? mergedBars.slice(-params.maxBars) : mergedBars;
    setCandles(sourceKey, timeframe, mergedBars, cacheVersion);
    if (!bars.length) {
      return {
        ok: false,
        status: "no_data",
        bars: [],
        error: undefined,
        resolvedPath: barsSourcePath,
        staleData,
        manifestGeneratedAt,
        barCount: 0,
        firstDate: null,
        lastDate: null,
        payload,
        mergeStatus,
        mergeWarning,
        snapshotDate,
        historyLastDateBeforeMerge,
        historyCloseBeforeMerge,
        snapshotClose,
      };
    }

    return {
      ok: true,
      status: "loaded",
      bars,
      resolvedPath: barsSourcePath,
      staleData,
      manifestGeneratedAt,
      barCount: mergedBars.length,
      firstDate: mergedBars[0]?.time ?? null,
      lastDate: mergedBars[mergedBars.length - 1]?.time ?? null,
      payload,
      mergeStatus,
      mergeWarning,
      snapshotDate,
      historyLastDateBeforeMerge,
      historyCloseBeforeMerge,
      snapshotClose,
    };
  } catch (error) {
    const aborted = signal?.aborted === true;
    return {
      ok: false,
      status: aborted ? "load_error" : "invalid_data",
      bars: [],
      error: aborted ? "Request aborted" : String((error as Error)?.message || error),
      resolvedPath: undefined,
      staleData: false,
      manifestGeneratedAt: null,
      barCount: 0,
      firstDate: null,
      lastDate: null,
      payload: null,
      mergeStatus: "no_snapshot",
      mergeWarning: null,
      snapshotDate: null,
      historyLastDateBeforeMerge: null,
      historyCloseBeforeMerge: null,
      snapshotClose: null,
    };
  }
}
