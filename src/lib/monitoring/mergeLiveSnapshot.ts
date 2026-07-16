import type { MonitoringCandle } from "@/lib/monitoring/loadMonitoringCandles";

export type LiveSnapshotAssetRow = {
  name?: string;
  symbol?: string;
  source?: string;
  mergeMode?: string | null;
  date?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
};

export type LiveSnapshotMergeMode = "replace_current_bar" | "append_if_safe";

export type LiveSnapshotMergeStatus =
  | "no_snapshot"
  | "stale_snapshot_ignored"
  | "invalid_snapshot"
  | "source_mismatch"
  | "updated_last_bar_same_date"
  | "updated_last_bar_replace_current_bar"
  | "updated_last_bar_instead_of_append"
  | "appended_new_bar_gap_ok"
  | "snapshot_older_than_history";

export type LiveSnapshotMergeResult = {
  bars: MonitoringCandle[];
  mergeMode: LiveSnapshotMergeMode;
  gapPct: number | null;
  allowedGapPct: number;
  mergeStatus: LiveSnapshotMergeStatus;
  warning: string | null;
};

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(day) ? day : null;
}

function dedupeAndSortBars(rows: MonitoringCandle[]): MonitoringCandle[] {
  const byDay = new Map<string, MonitoringCandle>();
  for (const row of rows) {
    const day = toDay(row.time);
    const open = toFinite(row.open);
    const high = toFinite(row.high);
    const low = toFinite(row.low);
    const close = toFinite(row.close);
    if (!day || open == null || high == null || low == null || close == null) continue;
    if (high < low) continue;
    byDay.set(day, { time: day, open, high, low, close });
  }
  return Array.from(byDay.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function toMergeMode(value: unknown): LiveSnapshotMergeMode {
  const v = String(value || "").trim().toLowerCase();
  return v === "replace_current_bar" ? "replace_current_bar" : "append_if_safe";
}

function parseUtcDay(day: string): number | null {
  const ts = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : null;
}

function inferAllowedGapPct(source: string | null | undefined): number {
  const s = String(source || "").trim().toUpperCase();
  if (s.startsWith("OANDA:") || s.includes("FX")) return 1;
  if (s.includes("VIX") || s.includes("US10Y") || s.includes("US10Y")) return 10;
  if (s.startsWith("CBOT:") || s.startsWith("ICEUS:")) return 4;
  if (s.startsWith("NASDAQ:") || s.startsWith("NYSE:") || s.startsWith("AMEX:") || s.includes("SPX") || s.includes("NDX") || s.includes("DAX")) return 5;
  return 4;
}

export function mergeLiveSnapshot(input: {
  historicalBars: MonitoringCandle[];
  liveSnapshotAsset: LiveSnapshotAssetRow | null;
}): LiveSnapshotMergeResult {
  const base = dedupeAndSortBars(input.historicalBars ?? []);
  const snap = input.liveSnapshotAsset;
  const mergeMode = toMergeMode(snap?.mergeMode ?? null);
  const allowedGapPct = inferAllowedGapPct(snap?.source ?? null);
  if (!snap) {
    return {
      bars: base,
      mergeMode,
      gapPct: null,
      allowedGapPct,
      mergeStatus: "no_snapshot",
      warning: null,
    };
  }

  const snapDay = toDay(snap.date ?? null);
  const open = toFinite(snap.open);
  const high = toFinite(snap.high);
  const low = toFinite(snap.low);
  const close = toFinite(snap.close);
  if (!snapDay || open == null || high == null || low == null || close == null || high < low) {
    return {
      bars: base,
      mergeMode,
      gapPct: null,
      allowedGapPct,
      mergeStatus: "no_snapshot",
      warning: "invalid_snapshot_ohlc",
    };
  }

  if (!base.length) {
    return {
      bars: [{ time: snapDay, open, high, low, close }],
      mergeMode,
      gapPct: null,
      allowedGapPct,
      mergeStatus: "appended_new_bar_gap_ok",
      warning: null,
    };
  }

  const last = base[base.length - 1];
  const lastDay = toDay(last.time);
  if (!lastDay) {
    return {
      bars: base,
      mergeMode,
      gapPct: null,
      allowedGapPct,
      mergeStatus: "no_snapshot",
      warning: "invalid_history_last_bar",
    };
  }

  const gapPct = last.close !== 0 ? (Math.abs(open - last.close) / Math.abs(last.close)) * 100 : null;
  if (mergeMode === "replace_current_bar") {
    const merged = [...base];
    merged[merged.length - 1] = {
      time: snapDay,
      open,
      high,
      low,
      close,
    };
    return {
      bars: dedupeAndSortBars(merged),
      mergeMode,
      gapPct,
      allowedGapPct,
      mergeStatus: "updated_last_bar_replace_current_bar",
      warning: null,
    };
  }

  if (snapDay === lastDay) {
    const merged = [...base];
    merged[merged.length - 1] = {
      time: snapDay,
      open,
      high,
      low,
      close,
    };
    return {
      bars: merged,
      mergeMode,
      gapPct,
      allowedGapPct,
      mergeStatus: "updated_last_bar_same_date",
      warning: null,
    };
  }

  if (snapDay > lastDay) {
    const snapTs = parseUtcDay(snapDay);
    const lastTs = parseUtcDay(lastDay);
    const calendarDiffDays = snapTs != null && lastTs != null ? Math.max(0, Math.round((snapTs - lastTs) / 86_400_000)) : null;
    const gapSuspicious = gapPct != null && gapPct > allowedGapPct;
    if (gapSuspicious) {
      const replaced = [...base];
      replaced[replaced.length - 1] = {
        time: snapDay,
        open,
        high,
        low,
        close,
      };
      return {
        bars: dedupeAndSortBars(replaced),
        mergeMode,
        gapPct,
        allowedGapPct,
        mergeStatus: "updated_last_bar_instead_of_append",
        warning: "suspicious_gap_prevented_append",
      };
    }
    return {
      bars: dedupeAndSortBars([
        ...base,
        {
          time: snapDay,
          open,
          high,
          low,
          close,
        },
      ]),
      mergeMode,
      gapPct: gapPct,
      allowedGapPct,
      mergeStatus: "appended_new_bar_gap_ok",
      warning: calendarDiffDays != null && calendarDiffDays > 7 ? "possible_contract_roll_or_unadjusted_snapshot" : null,
    };
  }

  return {
    bars: base,
    mergeMode,
    gapPct,
    allowedGapPct,
    mergeStatus: "snapshot_older_than_history",
    warning: null,
  };
}
