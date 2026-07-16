export const AGRAR_LIVE_SNAPSHOT_URLS = [
  "/workspace/input/tv_live_snapshot_current.json",
  "/generated/monitoring/live/tv_live_snapshot_current.json",
  "/generated/monitoring/live/agrar_latest_snapshot.json",
] as const;

type SnapshotOhlcRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type SnapshotAssetRow = {
  name: string;
  symbol: string;
  short?: string;
  source: string;
  ohlc?: SnapshotOhlcRow[];
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number | null;
};

type SnapshotRoot = {
  schema?: string;
  source: string;
  group?: string;
  timeframe: string;
  createdAt?: string;
  mergeMode?: string;
  generatedFromScreenshot?: boolean;
  bars?: Array<{ date: string; offset: number }>;
  assets: SnapshotAssetRow[];
};

export type AgrarSnapshotAsset = {
  name: string;
  symbol: string;
  short: string;
  source: string;
  mergeMode: "replace_current_bar" | "append_if_safe";
  latest: SnapshotOhlcRow | null;
  ohlc: SnapshotOhlcRow[];
};

export type AgrarLiveSnapshot = {
  schema: string;
  source: string;
  createdAt: string | null;
  group: string;
  timeframe: string;
  mergeMode: "replace_current_bar" | "append_if_safe";
  generatedFromScreenshot: boolean;
  assets: AgrarSnapshotAsset[];
  bySymbol: Record<string, AgrarSnapshotAsset>;
  bySource: Record<string, AgrarSnapshotAsset>;
};

const AGRAR_LIVE_SNAPSHOT_MAX_AGE_HOURS = 24;

function normalizeKey(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOhlcRows(input: unknown): SnapshotOhlcRow[] {
  if (!Array.isArray(input)) return [];
  const rows: SnapshotOhlcRow[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const date = String((row as { date?: unknown }).date ?? "").slice(0, 10);
    const open = toFinite((row as { open?: unknown }).open);
    const high = toFinite((row as { high?: unknown }).high);
    const low = toFinite((row as { low?: unknown }).low);
    const close = toFinite((row as { close?: unknown }).close);
    const volume = toFinite((row as { volume?: unknown }).volume);
    if (!date || open == null || high == null || low == null || close == null) continue;
    rows.push({
      date,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  rows.sort((left, right) => left.date.localeCompare(right.date));
  return rows;
}

function normalizeMergeMode(value: unknown): "replace_current_bar" | "append_if_safe" {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "append_if_safe" ? "append_if_safe" : "replace_current_bar";
}

export function normalizeAgrarLiveSnapshot(input: unknown): AgrarLiveSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const root = input as Partial<SnapshotRoot>;
  const source = String(root.source ?? "").trim();
  const schema = String(root.schema ?? "").trim();
  const createdAt = root.createdAt != null ? String(root.createdAt).trim() : null;
  const group = String(root.group ?? "Agrar").trim();
  const timeframe = String(root.timeframe ?? "").trim();
  const mergeMode = normalizeMergeMode(root.mergeMode);
  const generatedFromScreenshot = Boolean(root.generatedFromScreenshot ?? false);
  if (!source || !group || !timeframe || !Array.isArray(root.assets)) return null;

  const assets: AgrarSnapshotAsset[] = [];
  const bySymbol: Record<string, AgrarSnapshotAsset> = {};
  const bySource: Record<string, AgrarSnapshotAsset> = {};

  for (const asset of root.assets) {
    if (!asset || typeof asset !== "object") continue;
    const row = asset as Partial<SnapshotAssetRow>;
    const name = String(row.name ?? "").trim();
    const symbol = String(row.symbol ?? "").trim();
    const short = String(row.short ?? row.symbol ?? "").trim();
    const src = String(row.source ?? "").trim();
    if (!symbol || !src) continue;

    const ohlcFromArray = normalizeOhlcRows(row.ohlc);
    const ohlcFromFlat = normalizeOhlcRows(
      row.date && row.open != null && row.high != null && row.low != null && row.close != null
        ? [{ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume }]
        : [],
    );
    const ohlc = ohlcFromArray.length ? ohlcFromArray : ohlcFromFlat;
    if (!ohlc.length) continue;
    const latest = ohlc[ohlc.length - 1] ?? null;
    const normalized: AgrarSnapshotAsset = {
      name: name || symbol,
      symbol,
      short,
      source: src,
      mergeMode,
      latest,
      ohlc,
    };

    assets.push(normalized);
    bySymbol[normalizeKey(symbol)] = normalized;
    bySource[normalizeKey(src)] = normalized;
  }

  if (!assets.length) return null;
  return {
    schema,
    source,
    createdAt,
    group,
    timeframe,
    mergeMode,
    generatedFromScreenshot,
    assets,
    bySymbol,
    bySource,
  };
}

export async function loadAgrarLiveSnapshot(signal?: AbortSignal): Promise<AgrarLiveSnapshot | null> {
  for (const url of AGRAR_LIVE_SNAPSHOT_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) continue;
      const payload = (await res.json()) as unknown;
      const normalized = normalizeAgrarLiveSnapshot(payload);
      if (normalized) return normalized;
    } catch {
      // try next path
    }
  }
  return null;
}

export function isAgrarLiveSnapshotFresh(
  snapshot: AgrarLiveSnapshot | null,
  maxAgeHours = AGRAR_LIVE_SNAPSHOT_MAX_AGE_HOURS,
): boolean {
  if (!snapshot?.createdAt) return false;
  const createdAtMs = Date.parse(snapshot.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageHours = (Date.now() - createdAtMs) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= maxAgeHours;
}

export function findAgrarSnapshotAsset(
  snapshot: AgrarLiveSnapshot | null,
  symbol: string,
  source?: string | null,
): AgrarSnapshotAsset | null {
  if (!snapshot) return null;
  const bySymbol = snapshot.bySymbol[normalizeKey(symbol)];
  if (bySymbol) return bySymbol;
  if (source) {
    const bySource = snapshot.bySource[normalizeKey(source)];
    if (bySource) return bySource;
  }
  return null;
}
