/**
 * Static dataset availability map — precomputed at module load from the
 * canonical analytics-generated.json. This is used by the SelectionDropdown
 * to show which registry entries have real data, regardless of which tab
 * is currently active in the analytics dashboard.
 *
 * Extended: entries in DATASOURCE_MAP are also AVAILABLE (resolved via
 * /api/modeling/dataset/[selectionId] at runtime).
 */
import rawAnalytics from "@/data/capitalife/analytics-generated.json";
import { API_BACKED_IDS } from "./datasource-map";
import type { ModelingSubjectEntry } from "@/components/modeling/ModelingRegistry";

type RawDataset = {
  performanceSeries?: Array<{ date: string; value: number | null }>;
  groupSeries?: Record<string, Array<{ date: string; value: number | null }>>;
  strategySeries?: Record<string, Array<{ date: string; value: number | null }>>;
};

const ws = rawAnalytics.whiteSwanBacktest as unknown as RawDataset;
const inv = rawAnalytics.investBacktest as unknown as RawDataset;
const comb = rawAnalytics.combinedBacktest as unknown as RawDataset;

function hasKey(ds: RawDataset, key: string): boolean {
  return (
    (ds.groupSeries?.[key]?.filter((p) => p.value !== null).length ?? 0) > 0 ||
    (ds.strategySeries?.[key]?.filter((p) => p.value !== null).length ?? 0) > 0
  );
}

/**
 * Returns true if the given groupSeriesId has real data in any dataset.
 * For entries without a groupSeriesId, always returns true (portfolio-level).
 */
export function seriesHasData(groupSeriesId: string | undefined): boolean {
  if (!groupSeriesId) return true;
  return hasKey(ws, groupSeriesId) || hasKey(inv, groupSeriesId) || hasKey(comb, groupSeriesId);
}

/**
 * Full availability check for a registry entry.
 * Returns true if data is available from analytics OR from the canonical
 * OHLC/series-json datasource (resolved via the modeling dataset API).
 */
export function entryHasData(entry: ModelingSubjectEntry): boolean {
  // aggregationPolicy:"unavailable" means not yet implemented — always disabled.
  // Must check this before groupSeriesId fallback: entries with no groupSeriesId
  // (like custom-combination) would otherwise pass seriesHasData(undefined)=true.
  if (entry.aggregationPolicy === "unavailable") return false;
  if (API_BACKED_IDS.has(entry.id)) return true;
  return seriesHasData(entry.groupSeriesId);
}
