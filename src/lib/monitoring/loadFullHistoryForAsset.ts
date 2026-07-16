import { findAgrarSnapshotAsset, isAgrarLiveSnapshotFresh, loadAgrarLiveSnapshot } from "@/lib/monitoring/loadAgrarLiveSnapshot";
import type { MonitoringCandle } from "@/lib/monitoring/types";
import type { TimeseriesResponse } from "@/types";

type LoadFullHistoryInput = {
  assetId: string;
  symbol: string;
  source: string;
  fallbackBars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>;
};

type LoadFullHistoryResult = {
  bars: MonitoringCandle[];
  sourceUsed: string;
  debug: {
    fetchedFromApi: boolean;
    mergedSnapshot: boolean;
    ignoredOlderSnapshot: boolean;
    dedupedBars: number;
  };
};

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeBars(
  bars: Array<{ time: string | null; open: number | null; high: number | null; low: number | null; close: number | null }>,
): MonitoringCandle[] {
  const byDay = new Map<string, MonitoringCandle>();
  for (const bar of bars) {
    const day = dayKey(bar.time);
    const open = toFinite(bar.open);
    const high = toFinite(bar.high);
    const low = toFinite(bar.low);
    const close = toFinite(bar.close);
    if (!day || open == null || high == null || low == null || close == null) continue;
    byDay.set(day, { time: `${day}T00:00:00Z`, open, high, low, close, volume: null });
  }
  return Array.from(byDay.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export async function loadFullHistoryForAsset({
  assetId,
  symbol,
  source,
  fallbackBars,
}: LoadFullHistoryInput): Promise<LoadFullHistoryResult> {
  let fetchedFromApi = false;
  let mergedSnapshot = false;
  let ignoredOlderSnapshot = false;
  let sourceUsed = "history-fallback";

  const refreshBucket = Math.floor(Date.now() / 60_000);
  const url = `/api/asset/${encodeURIComponent(assetId)}/timeseries?tf=D&source=tradingview&continuous_mode=backadjusted&build_mode=auto&bars=6000&refresh_bucket=${refreshBucket}`;

  let normalized = normalizeBars(fallbackBars);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const payload = (await res.json()) as TimeseriesResponse;
      const fromApi = normalizeBars(
        (payload.ohlcv ?? []).map((row) => ({
          time: dayKey(row.t) ? `${dayKey(row.t)}T00:00:00Z` : null,
          open: toFinite(row.open),
          high: toFinite(row.high),
          low: toFinite(row.low),
          close: toFinite(row.close),
        })),
      );
      if (fromApi.length) {
        normalized = fromApi;
        fetchedFromApi = true;
        sourceUsed = String(payload.sourceUsed || payload.source || "api").trim() || "api";
      }
    }
  } catch {
    // keep fallback
  }

  try {
    const snapshot = await loadAgrarLiveSnapshot();
    const snapAsset = isAgrarLiveSnapshotFresh(snapshot)
      ? findAgrarSnapshotAsset(snapshot, symbol, source)
      : null;
    if (snapAsset?.latest) {
      const snapDay = dayKey(snapAsset.latest.date);
      const last = normalized[normalized.length - 1];
      const lastDay = dayKey(last?.time);
      if (snapDay && lastDay) {
        if (snapDay === lastDay) {
          normalized[normalized.length - 1] = {
            ...last,
            open: Number(snapAsset.latest.open),
            high: Number(snapAsset.latest.high),
            low: Number(snapAsset.latest.low),
            close: Number(snapAsset.latest.close),
            volume: toFinite(snapAsset.latest.volume),
          };
          mergedSnapshot = true;
        } else if (snapDay > lastDay) {
          normalized.push({
            time: `${snapDay}T00:00:00Z`,
            open: Number(snapAsset.latest.open),
            high: Number(snapAsset.latest.high),
            low: Number(snapAsset.latest.low),
            close: Number(snapAsset.latest.close),
            volume: toFinite(snapAsset.latest.volume),
          });
          mergedSnapshot = true;
        } else {
          ignoredOlderSnapshot = true;
        }
      }
    }
  } catch {
    // ignore snapshot errors
  }

  const deduped = normalizeBars(
    normalized.map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })),
  );

  return {
    bars: deduped,
    sourceUsed,
    debug: {
      fetchedFromApi,
      mergedSnapshot,
      ignoredOlderSnapshot,
      dedupedBars: Math.max(0, normalized.length - deduped.length),
    },
  };
}
