"use client";

import { fetchMonitoringJson } from "@/lib/monitoring/fetchMonitoringJson";

type StrategyEventType =
  | "long_entry"
  | "short_entry"
  | "long_exit"
  | "short_exit"
  | "sl_hit"
  | "tp_hit"
  | "be_active"
  | "trail_update"
  | "trend_exit"
  | "opposite_valuation_exit";

export type StrategyEventsPayload = {
  symbol: string;
  tvSymbol: string;
  strategyName: string;
  hasStrategy: boolean;
  signalEvents?: Array<{
    id?: string;
    time: string;
    barIndex?: number;
    type: StrategyEventType | string;
    direction?: "long" | "short" | null;
    price?: number | null;
    entry?: number | null;
    sl?: number | null;
    tp?: number | null;
    reason?: string;
  }>;
  events: Array<{
    time: string;
    barIndex: number;
    type: StrategyEventType;
    price?: number | null;
    entry?: number | null;
    sl?: number | null;
    tp?: number | null;
    reason?: string;
  }>;
  trades: Array<{
    direction: "long" | "short";
    entryTime: string;
    exitTime: string;
    entry: number;
    sl?: number | null;
    tp?: number | null;
    exit: number;
    exitReason?: string;
  }>;
};

type ManifestAsset = {
  code?: string;
  tvSymbol?: string;
  eventsFile?: string | null;
};

type Manifest = {
  assets?: ManifestAsset[];
};

export type MonitoringTradeEventsLoadResult = {
  ok: boolean;
  status: "loaded" | "missing_events_file" | "invalid_events" | "no_events" | "symbol_mapping_failed";
  events: StrategyEventsPayload["events"];
  trades: StrategyEventsPayload["trades"];
  signalEvents: NonNullable<StrategyEventsPayload["signalEvents"]>;
  resolvedPath: string | null;
  resolvedSignalsPath: string | null;
  error: string | null;
  payload: StrategyEventsPayload | null;
};

function sourceToEventsFile(source: string): string | null {
  const raw = String(source || "").trim().toUpperCase();
  if (!raw.includes(":")) return null;
  const [exchange, symbolRaw] = raw.split(":", 2);
  const symbol = symbolRaw.replace(/!/g, "");
  if (!exchange || !symbol) return null;
  return `strategies/${exchange}_${symbol}_events.json`;
}

function sourceToSignalsFile(source: string): string | null {
  const raw = String(source || "").trim().toUpperCase();
  if (!raw.includes(":")) return null;
  const [exchange, symbolRaw] = raw.split(":", 2);
  const symbol = symbolRaw.replace(/!/g, "");
  if (!exchange || !symbol) return null;
  return `signals/${exchange}_${symbol}_signals.json`;
}

function normalizeSource(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeSymbol(value: string): string {
  return String(value || "").trim().toUpperCase();
}

export async function loadMonitoringTradeEvents(input: {
  symbol: string;
  source: string;
  preferredEventsFiles?: string[];
  signal?: AbortSignal;
}): Promise<MonitoringTradeEventsLoadResult> {
  const tryReadPayload = async (eventsFile: string): Promise<MonitoringTradeEventsLoadResult> => {
    const resolvedPath = `/generated/monitoring/${eventsFile}`;
    const signalsFile = eventsFile.replace(/^strategies\//, "signals/").replace(/_events\.json$/i, "_signals.json");
    const resolvedSignalsPath = `/generated/monitoring/${signalsFile}`;
    const payload = await fetchMonitoringJson<StrategyEventsPayload>(resolvedPath, {
      signal: input.signal,
      ttlMs: 5_000,
    });
    if (!payload) {
      return {
        ok: false,
        status: "missing_events_file",
        events: [],
        trades: [],
        signalEvents: [],
        resolvedPath,
        resolvedSignalsPath: null,
        error: "events_fetch_failed",
        payload: null,
      };
    }
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const trades = Array.isArray(payload?.trades) ? payload.trades : [];
    let signalEvents = Array.isArray(payload?.signalEvents) ? payload.signalEvents : [];
    try {
      const signalsPayload = await fetchMonitoringJson<{ signalEvents?: unknown[] }>(resolvedSignalsPath, {
        signal: input.signal,
        ttlMs: 5_000,
      });
      if (signalsPayload) {
        const loaded = Array.isArray(signalsPayload?.signalEvents) ? signalsPayload.signalEvents : [];
        if (loaded.length) {
          signalEvents = loaded as NonNullable<StrategyEventsPayload["signalEvents"]>;
        }
      }
    } catch {
      // keep fallback from events payload
    }
    if (!payload || typeof payload !== "object" || !("symbol" in payload)) {
      return {
        ok: false,
        status: "invalid_events",
        events: [],
        trades: [],
        signalEvents: [],
        resolvedPath,
        resolvedSignalsPath,
        error: "invalid_payload",
        payload: null,
      };
    }
    if (!events.length && !trades.length && !signalEvents.length) {
      return {
        ok: false,
        status: "no_events",
        events,
        trades,
        signalEvents,
        resolvedPath,
        resolvedSignalsPath,
        error: null,
        payload,
      };
    }
    return {
      ok: true,
      status: "loaded",
      events,
      trades,
      signalEvents,
      resolvedPath,
      resolvedSignalsPath,
      error: null,
      payload: {
        ...payload,
        signalEvents,
      },
    };
  };

  try {
    const preferredFiles = Array.from(
      new Set(
        (Array.isArray(input.preferredEventsFiles) ? input.preferredEventsFiles : [])
          .map((v) => String(v || "").trim())
          .filter(Boolean),
      ),
    );
    for (const preferredFile of preferredFiles) {
      const preferredResult = await tryReadPayload(preferredFile);
      if (preferredResult.ok || preferredResult.status === "no_events") {
        return preferredResult;
      }
    }

    const directEventsFile = sourceToEventsFile(input.source);
    if (directEventsFile) {
      const directResult = await tryReadPayload(directEventsFile);
      if (directResult.ok || directResult.status === "no_events") {
        return directResult;
      }
    }

    const manifest = await fetchMonitoringJson<Manifest>("/generated/monitoring/manifest.json", {
      signal: input.signal,
      ttlMs: 10_000,
    });
    if (!manifest) {
      return {
        ok: false,
        status: "symbol_mapping_failed",
        events: [],
        trades: [],
        signalEvents: [],
        resolvedPath: null,
        resolvedSignalsPath: null,
        error: "manifest_fetch_failed",
        payload: null,
      };
    }
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const source = normalizeSource(input.source);
    const symbol = normalizeSymbol(input.symbol);
    const mappedAsset = assets.find((asset) => {
      const tv = normalizeSource(asset.tvSymbol || "");
      const code = normalizeSymbol(asset.code || "");
      return tv === source || code === symbol;
    });
    if (!mappedAsset) {
      return {
        ok: false,
        status: "symbol_mapping_failed",
        events: [],
        trades: [],
        signalEvents: [],
        resolvedPath: null,
        resolvedSignalsPath: null,
        error: "asset_not_found_in_manifest",
        payload: null,
      };
    }

    const eventsFile = String(mappedAsset.eventsFile || "").trim();
    if (!eventsFile) {
      return {
        ok: false,
        status: "missing_events_file",
        events: [],
        trades: [],
        signalEvents: [],
        resolvedPath: null,
        resolvedSignalsPath: null,
        error: null,
        payload: null,
      };
    }
    return await tryReadPayload(eventsFile);
  } catch (error) {
    return {
      ok: false,
      status: "invalid_events",
      events: [],
      trades: [],
      signalEvents: [],
      resolvedPath: null,
      resolvedSignalsPath: null,
      error: String((error as Error)?.message || error),
      payload: null,
    };
  }
}
