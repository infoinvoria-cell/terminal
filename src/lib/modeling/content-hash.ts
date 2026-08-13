/**
 * Content-based dataset hash for the Modeling Studio.
 *
 * FNV-1a 32-bit over a canonical string serialization of all dataset inputs.
 * Browser-compatible (no Node crypto), server-compatible, deterministic.
 *
 * Hash changes whenever ANY input changes — including a single middle equity
 * point, a single return value, or a single trade field. This is the correct
 * cache key for all heavy model computations.
 */

import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import type { TradeRecord } from "@/lib/modeling/types";

// ─── FNV-1a 32-bit ────────────────────────────────────────────────────────────

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

function fnv1a32(str: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ─── Canonical serialization ──────────────────────────────────────────────────

function serializeEquity(pts: AnalyticsSeriesPoint[]): string {
  if (!pts.length) return "E:empty;";
  const parts = new Array<string>(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    parts[i] = `${p.date}:${p.value.toFixed(6)}`;
  }
  return `E:${pts.length}:${parts.join("|")};`;
}

function serializeReturns(returns: number[]): string {
  if (!returns.length) return "R:empty;";
  const parts = new Array<string>(returns.length);
  for (let i = 0; i < returns.length; i++) {
    parts[i] = (returns[i]!).toFixed(8);
  }
  return `R:${returns.length}:${parts.join("|")};`;
}

function serializeTrades(trades: TradeRecord[] | null | undefined): string {
  if (!trades?.length) return "T:none;";
  const parts = new Array<string>(trades.length);
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]!;
    parts[i] = `${t.entry_time}:${t.exit_time}:${t.pnl.toFixed(6)}`;
  }
  return `T:${trades.length}:${parts.join("|")};`;
}

function serializeComponents(
  compMap: Record<string, AnalyticsSeriesPoint[]> | null | undefined,
): string {
  if (!compMap) return "C:none;";
  const keys = Object.keys(compMap).sort();
  if (!keys.length) return "C:empty;";
  const segs: string[] = [];
  for (const key of keys) {
    const series = compMap[key]!;
    const pts = series.map((p) => `${p.date}:${p.value.toFixed(6)}`).join(",");
    segs.push(`${key}[${series.length}]:${pts}`);
  }
  return `C:${keys.length}:${segs.join("|")};`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type DatasetHashInput = {
  selectionId: string;
  equity: AnalyticsSeriesPoint[];
  returns: number[];
  trades?: TradeRecord[] | null;
  components?: Record<string, AnalyticsSeriesPoint[]> | null;
};

/**
 * Compute a deterministic content-based hash over all dataset inputs.
 * A change to any single equity point, return value, trade, or component
 * series point will produce a different hash.
 */
export function computeDatasetHash(input: DatasetHashInput): string {
  if (!input.equity.length) return `${input.selectionId}:empty`;

  const canonical = [
    `ID:${input.selectionId}`,
    serializeEquity(input.equity),
    serializeReturns(input.returns),
    serializeTrades(input.trades),
    serializeComponents(input.components),
  ].join("\n");

  return `${input.selectionId}:${fnv1a32(canonical)}`;
}
