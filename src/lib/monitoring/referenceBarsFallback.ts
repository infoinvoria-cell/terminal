/**
 * Reference-price fallback for mobile chart cards whose wave1 export has 0 bars
 * (e.g. "weak_strategy" symbols like CT1! that never produced a backtest, but
 * still have real cached TradingView OHLC data). This is real market data —
 * never fabricated — sourced from the same cache the desktop app already
 * generates. It is explicitly NOT a strategy signal: callers must label it
 * as reference data, not as a validated strategy chart.
 */

export type ReferenceBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type ManifestAsset = {
  asset: string;
  cachePath?: string;
  hasData?: boolean;
};

type ManifestFull = {
  assets: ManifestAsset[];
};

type CacheFileBar = {
  date?: string;
  time?: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
};

type CacheFile = {
  bars: CacheFileBar[];
};

const MANIFEST_URL = "/generated/monitoring/tradingview_data_cache/cache_manifest_full.json";
const MAX_BARS = 150;

let manifestPromise: Promise<ManifestFull | null> | null = null;
const barsCache = new Map<string, Promise<ReferenceBar[] | null>>();

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function loadManifest(): Promise<ManifestFull | null> {
  if (!manifestPromise) {
    manifestPromise = fetchJson<ManifestFull>(MANIFEST_URL);
  }
  return manifestPromise;
}

export function clearReferenceBarsCache() {
  manifestPromise = null;
  barsCache.clear();
}

export async function loadReferenceBars(symbol: string): Promise<ReferenceBar[] | null> {
  const key = symbol.trim().toUpperCase();
  if (!key) return null;
  const cached = barsCache.get(key);
  if (cached) return cached;

  const request = (async (): Promise<ReferenceBar[] | null> => {
    const manifest = await loadManifest();
    const asset = manifest?.assets?.find((a) => (a.asset || "").trim().toUpperCase() === key);
    if (!asset?.cachePath || !asset.hasData) return null;

    const relativePath = asset.cachePath.replace(/^public\//, "/");
    const file = await fetchJson<CacheFile>(relativePath);
    if (!file?.bars?.length) return null;

    return file.bars
      .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null)
      .slice(-MAX_BARS)
      .map((b) => ({
        time: b.time || (b.date ? `${b.date}T00:00:00Z` : ""),
        open: b.open as number,
        high: b.high as number,
        low: b.low as number,
        close: b.close as number,
      }))
      .filter((b) => b.time);
  })();

  barsCache.set(key, request);
  return request;
}
