export type Wave1GroupId = "agrar" | "intraday" | "indices";

export type Wave1GroupManifest = {
  generated_at?: string;
  group: Wave1GroupId;
  count: number;
  strategies: Array<{
    strategy_id: string;
    label: string;
    symbol: string;
    status: string;
  }>;
};

export type Wave1Card = {
  strategy_id: string;
  label: string;
  symbol: string;
  status: string;
  last_price: number | null;
  last_bar_time: string | null;
  signal_status: string | null;
  validation_status: string | null;
};

export type Wave1Chart = {
  strategy_id: string;
  label: string;
  bars: Array<{
    time: string | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume?: number | null;
  }>;
  markers: Array<{
    time: string | null;
    type: string;
    label: string;
    price: number | null;
    side?: string | null;
  }>;
};

export type Wave1Signal = {
  strategy_id: string;
  label: string;
  symbol: string;
  signal_status: string | null;
  last_signal_time: string | null;
  last_signal_label: string | null;
  last_price: number | null;
  last_bar_time: string | null;
  strategy_status: string;
  open_position: boolean;
  position_side: string | null;
};

export type Wave1Status = {
  strategy_id: string;
  label: string;
  status: string;
  validation_status: string;
  has_last_bar: boolean;
  trades_generated: boolean;
  equity_curve_generated: boolean;
};

export type Wave1StrategyRecord = {
  strategyId: string;
  label: string;
  symbol: string;
  manifestStatus: string;
  freezeStatus: "frozen_wave1";
  card: Wave1Card | null;
  chart: Wave1Chart | null;
  signal: Wave1Signal | null;
  status: Wave1Status | null;
};

export type Wave1GroupData = {
  groupId: Wave1GroupId;
  freezeStatus: "frozen_wave1";
  available: boolean;
  fallbackUsed: boolean;
  manifest: Wave1GroupManifest | null;
  cards: Wave1Card[];
  charts: Wave1Chart[];
  signals: Wave1Signal[];
  statuses: Wave1Status[];
  records: Wave1StrategyRecord[];
};

const wave1Cache = new Map<Wave1GroupId, Promise<Wave1GroupData>>();

export function clearWave1Cache(groupId?: Wave1GroupId) {
  if (groupId) wave1Cache.delete(groupId);
  else wave1Cache.clear();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function loadWave1Group(groupId: Wave1GroupId): Promise<Wave1GroupData> {
  const cached = wave1Cache.get(groupId);
  if (cached) return cached;

  const request = (async (): Promise<Wave1GroupData> => {
    // Single API call — tries local files first, falls back to Supabase wave1_groups
    const raw = await fetchJson<{
      manifest: Wave1GroupManifest | null;
      cards: Wave1Card[] | null;
      charts: Wave1Chart[] | null;
      signals: Wave1Signal[] | null;
      statuses: Wave1Status[] | null;
    }>(`/api/monitoring/wave1-group/${groupId}`);

    const manifest = raw?.manifest ?? null;
    const cardRows = Array.isArray(raw?.cards) ? (raw.cards as Wave1Card[]) : [];
    const chartRows = Array.isArray(raw?.charts) ? (raw.charts as Wave1Chart[]) : [];
    const signalRows = Array.isArray(raw?.signals) ? (raw.signals as Wave1Signal[]) : [];
    const statusRows = Array.isArray(raw?.statuses) ? (raw.statuses as Wave1Status[]) : [];
    const manifestRows = Array.isArray(manifest?.strategies) ? manifest.strategies : [];

    const recordIds = new Set<string>([
      ...manifestRows.map((row) => row.strategy_id),
      ...cardRows.map((row) => row.strategy_id),
      ...chartRows.map((row) => row.strategy_id),
      ...signalRows.map((row) => row.strategy_id),
      ...statusRows.map((row) => row.strategy_id),
    ]);

    const records: Wave1StrategyRecord[] = Array.from(recordIds).map((strategyId) => {
      const manifestRow = manifestRows.find((row) => row.strategy_id === strategyId) ?? null;
      const cardRow = cardRows.find((row) => row.strategy_id === strategyId) ?? null;
      const chartRow = chartRows.find((row) => row.strategy_id === strategyId) ?? null;
      const signalRow = signalRows.find((row) => row.strategy_id === strategyId) ?? null;
      const statusRow = statusRows.find((row) => row.strategy_id === strategyId) ?? null;
      return {
        strategyId,
        label: manifestRow?.label ?? cardRow?.label ?? signalRow?.label ?? statusRow?.label ?? strategyId,
        symbol: manifestRow?.symbol ?? cardRow?.symbol ?? signalRow?.symbol ?? strategyId,
        manifestStatus: manifestRow?.status ?? cardRow?.status ?? signalRow?.strategy_status ?? statusRow?.status ?? "unknown",
        freezeStatus: "frozen_wave1",
        card: cardRow,
        chart: chartRow,
        signal: signalRow,
        status: statusRow,
      };
    });

    return {
      groupId,
      freezeStatus: "frozen_wave1",
      available: Boolean(manifest && cardRows.length && chartRows.length && signalRows.length && statusRows.length),
      fallbackUsed: !(manifest && cardRows.length && chartRows.length && signalRows.length && statusRows.length),
      manifest: manifest ?? null,
      cards: cardRows,
      charts: chartRows,
      signals: signalRows,
      statuses: statusRows,
      records,
    };
  })();

  wave1Cache.set(groupId, request);
  return request;
}

export async function loadWave1Groups(groupIds: Wave1GroupId[]): Promise<Record<Wave1GroupId, Wave1GroupData | null>> {
  const entries = await Promise.all(groupIds.map(async (groupId) => {
    try {
      return [groupId, await loadWave1Group(groupId)] as const;
    } catch {
      return [groupId, null] as const;
    }
  }));
  return Object.fromEntries(entries) as Record<Wave1GroupId, Wave1GroupData | null>;
}

export function findWave1Record(group: Wave1GroupData | null | undefined, symbolOrLabel: string): Wave1StrategyRecord | null {
  if (!group) return null;
  const needle = String(symbolOrLabel || "").trim().toUpperCase();
  if (!needle) return null;
  return group.records.find((record) => {
    return record.symbol.trim().toUpperCase() === needle || record.label.trim().toUpperCase() === needle;
  }) ?? null;
}
