import "server-only";

import fs from "node:fs";
import path from "node:path";
import type {
  MarketDataStatus,
  TradingViewBar,
  TradingViewHistoryPayload,
  TradingViewLatestBar,
  TradingViewManifest,
  TradingViewStatusFile,
  TradingViewSymbolStatus,
} from "@/lib/market-data/types";

const ROOT = process.cwd();
const DEFAULT_CACHE_DIR = "C:\\Users\\joris\\Documents\\.capitalife-cache\\market-data\\tradingview";
const SRC_FALLBACK_DIR = path.join(ROOT, "src", "data", "capitalife", "market-data", "tradingview");
const DEFAULT_POLL_SECONDS = Number.parseInt(process.env.TRADINGVIEW_POLL_SECONDS ?? "60", 10);
const DEFAULT_STALE_AFTER_SECONDS = Number.parseInt(process.env.TRADINGVIEW_STALE_AFTER_SECONDS ?? "180", 10);

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function resolveCacheDir() {
  const envDir = process.env.TRADINGVIEW_CACHE_DIR
    ? path.resolve(process.env.TRADINGVIEW_CACHE_DIR)
    : DEFAULT_CACHE_DIR;
  return fs.existsSync(envDir) ? envDir : SRC_FALLBACK_DIR;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function resolveStatusFromFetch(
  fetchedAt: string | null | undefined,
  staleAfterSeconds: number,
  fallback: TradingViewSymbolStatus["status"] = "missing",
): TradingViewSymbolStatus["status"] {
  const fetchedAtMs = parseDate(fetchedAt);
  if (!fetchedAtMs) return fallback;
  return Date.now() - fetchedAtMs > staleAfterSeconds * 1000 ? "stale" : "ok";
}

function normalizeSymbolStatus(
  symbol: string,
  status: TradingViewSymbolStatus | undefined,
  staleAfterSeconds: number,
): TradingViewSymbolStatus {
  if (!status) {
    return {
      status: "missing",
      error: "symbol_missing",
      intervals: {},
      last_bar_time: null,
      last_fetch: null,
      rows_1m: 0,
      rows_1D: 0,
    };
  }

  const nextIntervals = Object.fromEntries(
    Object.entries(status.intervals ?? {}).map(([interval, value]) => {
      const resolvedStatus =
        value.status === "error" || value.status === "missing"
          ? value.status
          : resolveStatusFromFetch(value.fetched_at, staleAfterSeconds, value.status);
      return [
        interval,
        {
          ...value,
          status: resolvedStatus,
        },
      ];
    }),
  );

  const lastFetch =
    status.last_fetch ??
    nextIntervals["1m"]?.fetched_at ??
    nextIntervals["1D"]?.fetched_at ??
    null;
  const symbolStatus =
    status.status === "error" || status.status === "missing"
      ? status.status
      : resolveStatusFromFetch(lastFetch, staleAfterSeconds, status.status);

  return {
    ...status,
    status: symbolStatus,
    intervals: nextIntervals,
    last_fetch: lastFetch,
    last_bar_time:
      status.last_bar_time ??
      nextIntervals["1m"]?.last_date ??
      nextIntervals["1D"]?.last_date ??
      null,
    rows_1m: status.rows_1m ?? nextIntervals["1m"]?.rows ?? 0,
    rows_1D: status.rows_1D ?? nextIntervals["1D"]?.rows ?? 0,
  };
}

function buildFallbackManifest(cacheDir: string): TradingViewManifest {
  return {
    source: "tradingview-datafeed",
    package: "tradingview-datafeed",
    auth_mode: "unavailable",
    cache_dir: cacheDir,
    updated_at: null,
    poll_seconds: DEFAULT_POLL_SECONDS,
    stale_after_seconds: DEFAULT_STALE_AFTER_SECONDS,
    warning: "TradingView cache not available.",
    symbols: {},
  };
}

export function getTradingViewManifest(): TradingViewManifest {
  const cacheDir = resolveCacheDir();
  const manifestPath = path.join(cacheDir, "manifest.json");
  const manifest = readJson<TradingViewManifest>(manifestPath) ?? buildFallbackManifest(cacheDir);
  const staleAfterSeconds = manifest.stale_after_seconds ?? DEFAULT_STALE_AFTER_SECONDS;
  return {
    ...manifest,
    poll_seconds: manifest.poll_seconds ?? DEFAULT_POLL_SECONDS,
    stale_after_seconds: staleAfterSeconds,
    symbols: Object.fromEntries(
      Object.entries(manifest.symbols ?? {}).map(([symbol, value]) => [
        symbol,
        normalizeSymbolStatus(symbol, value, staleAfterSeconds),
      ]),
    ),
  };
}

export function getTradingViewStatusFile(): TradingViewStatusFile {
  const cacheDir = resolveCacheDir();
  const statusPath = path.join(cacheDir, "status.json");
  const manifest = getTradingViewManifest();
  const status = readJson<TradingViewStatusFile>(statusPath);
  const staleAfterSeconds = status?.stale_after_seconds ?? manifest.stale_after_seconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const symbols = Object.fromEntries(
    Object.entries(status?.symbols ?? manifest.symbols ?? {}).map(([symbol, value]) => [
      symbol,
      normalizeSymbolStatus(symbol, value, staleAfterSeconds),
    ]),
  );
  const symbolStates = Object.values(symbols).map((item) => item.status);
  const overallStatus = symbolStates.includes("error")
    ? "error"
    : symbolStates.includes("stale")
      ? "stale"
      : symbolStates.includes("ok")
        ? "ok"
        : "missing";

  return {
    source: status?.source ?? manifest.source,
    auth_mode: status?.auth_mode ?? manifest.auth_mode,
    cache_dir: cacheDir,
    updated_at: status?.updated_at ?? manifest.updated_at,
    poll_seconds: status?.poll_seconds ?? manifest.poll_seconds ?? DEFAULT_POLL_SECONDS,
    stale_after_seconds: staleAfterSeconds,
    overall_status: status?.overall_status ?? overallStatus,
    warning: status?.warning ?? manifest.warning,
    symbols,
  };
}

export function getMarketDataStatus(): MarketDataStatus {
  const cacheDir = resolveCacheDir();
  const manifestPath = path.join(cacheDir, "manifest.json");
  const statusPath = path.join(cacheDir, "status.json");
  const status = getTradingViewStatusFile();
  return {
    cacheAvailable: fs.existsSync(manifestPath) || fs.existsSync(statusPath),
    manifestPath: fs.existsSync(manifestPath) ? manifestPath : null,
    statusPath: fs.existsSync(statusPath) ? statusPath : null,
    cacheDir,
    updatedAt: status.updated_at,
    authMode: status.auth_mode,
    pollSeconds: status.poll_seconds,
    staleAfterSeconds: status.stale_after_seconds,
    overallStatus: status.overall_status,
    warning: status.warning,
    symbols: status.symbols,
  };
}

export function getTradingViewHistory(symbol: string, interval: string): TradingViewHistoryPayload | null {
  const cacheDir = resolveCacheDir();
  const historyPath = path.join(cacheDir, "history", `${symbol}_${interval}.json`);
  const payload = readJson<TradingViewHistoryPayload | TradingViewBar[]>(historyPath);
  if (!payload) return null;
  if (Array.isArray(payload)) {
    return {
      symbol,
      exchange: null,
      interval,
      source: "tradingview-datafeed",
      fetched_at: null,
      auth_mode: "unavailable",
      bars: payload,
    };
  }
  return payload;
}

export function getTradingViewBars(symbol: string, interval: string): TradingViewBar[] {
  return getTradingViewHistory(symbol, interval)?.bars ?? [];
}

export function getTradingViewLatest(symbol?: string) {
  const cacheDir = resolveCacheDir();
  const status = getTradingViewStatusFile();
  const latestDir = path.join(cacheDir, "latest");
  const targets = symbol ? [`${symbol}.json`] : (fs.existsSync(latestDir) ? fs.readdirSync(latestDir) : []);

  return targets
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const raw = readJson<TradingViewLatestBar>(path.join(latestDir, fileName));
      const currentSymbol = path.basename(fileName, ".json");
      const symbolStatus = status.symbols[currentSymbol];
      if (!raw) {
        return {
          symbol: currentSymbol,
          exchange: null,
          interval: "1m",
          source: "tradingview-datafeed",
          mode: "unavailable" as const,
          fetched_at: null,
          bar_time: null,
          open: null,
          high: null,
          low: null,
          close: null,
          volume: null,
          status: symbolStatus?.status ?? "missing",
        };
      }
      return {
        ...raw,
        status: symbolStatus?.status ?? raw.status,
      };
    });
}
