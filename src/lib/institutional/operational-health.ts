export type RuntimeTruthStatus =
  | "LIVE"
  | "CURRENT_MARKET_CLOSED"
  | "DELAYED"
  | "STALE"
  | "UNAVAILABLE"
  | "SOURCE_MISSING";

export type ReadinessStatus = "READY" | "DEGRADED" | "UNAVAILABLE";

export type StrategyOperationalHealth = {
  strategyId: string;
  portfolio: string;
  instrument: string;
  timeframe: string | null;
  researchReady: boolean;
  historicalDataReady: boolean;
  runtimeImplemented: boolean;
  runtimeProcessAvailable: boolean;
  runtimeOnline: boolean;
  liveSourceMapped: boolean;
  liveSourceReachable: boolean;
  liveSourceFresh: boolean;
  strategyEvaluableNow: boolean;
  signalContractImplemented: boolean;
  signalCurrent: boolean;
  monitoringMapped: boolean;
  engineMapped: boolean;
  brainMapped: boolean;
  sentinelMapped: boolean;
  paperBrokerMapped: boolean;
  researchStatus: ReadinessStatus;
  historicalDataStatus: ReadinessStatus;
  liveDataStatus: RuntimeTruthStatus;
  liveDataLagSeconds: number | null;
  runtimeStatus: RuntimeTruthStatus;
  runtimeLastEvaluationUtc: string | null;
  signalStatus: RuntimeTruthStatus;
  signalLastUpdatedUtc: string | null;
  monitoringStatus: ReadinessStatus;
  engineStatus: ReadinessStatus;
  brainStatus: ReadinessStatus;
  sentinelStatus: ReadinessStatus;
  paperBrokerStatus: ReadinessStatus;
  overallOperationalStatus:
    | "LIVE"
    | "CURRENT_MARKET_CLOSED"
    | "DEGRADED"
    | "UNAVAILABLE"
    | "RUNTIME_NOT_IMPLEMENTED";
  issues: string[];
};

export type PortfolioOperationalHealth = {
  portfolio: string;
  totalStrategies: number;
  researchReady: number;
  runtimeImplemented: number;
  runtimeOnline: number;
  liveDataReady: number;
  liveDataCurrent: number;
  signalReady: number;
  signalCurrent: number;
  degraded: number;
  unavailable: number;
};

export type QuoteStateRow = {
  provider?: string | null;
  providerSymbol?: string | null;
  providerTimestampUtc?: string | null;
  receivedTimestampUtc?: string | null;
};

export type EngineStateLike = {
  updatedAt?: string | null;
  updatedAtUtc?: string | null;
  lastEvaluatedCandle?: string | null;
  lastEvaluatedBarUtc?: string | null;
  nextCandleClose?: string | null;
  freshness?: string | null;
  currentSignal?: Record<string, unknown> | null;
  openTrades?: unknown[] | null;
};

export type AssetAuditRow = {
  coverageStatus?: string | null;
  historicalConfigured?: boolean;
  historicalVerified?: boolean;
  rowCount?: number | null;
  realGapCount?: number | null;
  sourceQuality?: string | null;
};

export function normalizeInstrumentId(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9!]/g, "");
}

export function timeframeToSeconds(timeframe: string | null | undefined): number {
  const value = String(timeframe || "").trim().toUpperCase();
  if (value === "30M") return 30 * 60;
  if (value === "1H") return 60 * 60;
  if (value === "2H") return 2 * 60 * 60;
  return 24 * 60 * 60;
}

function parseUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const utc = Date.parse(value);
  return Number.isFinite(utc) ? utc : null;
}

export function classifyLiveStatus(params: {
  nowUtc: string;
  timeframe: string | null | undefined;
  providerTimestampUtc?: string | null;
  receivedTimestampUtc?: string | null;
  provider?: string | null;
}): { status: RuntimeTruthStatus; lagSeconds: number | null; latestUtc: string | null } {
  const latestTs =
    parseUtc(params.receivedTimestampUtc) ??
    parseUtc(params.providerTimestampUtc);
  if (!params.provider && !params.providerTimestampUtc && !params.receivedTimestampUtc) {
    return { status: "SOURCE_MISSING", lagSeconds: null, latestUtc: null };
  }
  if (!params.provider || latestTs == null) {
    return {
      status: params.providerTimestampUtc || params.receivedTimestampUtc ? "UNAVAILABLE" : "SOURCE_MISSING",
      lagSeconds: latestTs == null ? null : Math.max(0, Math.floor((Date.parse(params.nowUtc) - latestTs) / 1000)),
      latestUtc: latestTs == null ? null : new Date(latestTs).toISOString(),
    };
  }

  const nowTs = Date.parse(params.nowUtc);
  const lagSeconds = Math.max(0, Math.floor((nowTs - latestTs) / 1000));
  const timeframeSeconds = timeframeToSeconds(params.timeframe);

  if (timeframeSeconds >= 24 * 60 * 60) {
    if (lagSeconds <= 4 * 60 * 60) return { status: "LIVE", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
    if (lagSeconds <= 36 * 60 * 60) return { status: "CURRENT_MARKET_CLOSED", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
    if (lagSeconds <= 72 * 60 * 60) return { status: "DELAYED", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
    return { status: "STALE", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
  }

  if (lagSeconds <= Math.max(180, Math.floor(timeframeSeconds * 0.5))) {
    return { status: "LIVE", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
  }
  if (lagSeconds <= Math.max(900, Math.floor(timeframeSeconds * 2))) {
    return { status: "DELAYED", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
  }
  return { status: "STALE", lagSeconds, latestUtc: new Date(latestTs).toISOString() };
}

export function classifyRuntimeStatus(params: {
  nowUtc: string;
  state: EngineStateLike | null;
}): { status: RuntimeTruthStatus; runtimeLastEvaluationUtc: string | null } {
  if (!params.state) {
    return { status: "UNAVAILABLE", runtimeLastEvaluationUtc: null };
  }

  const runtimeLastEvaluationUtc =
    params.state.lastEvaluatedBarUtc ??
    params.state.lastEvaluatedCandle ??
    params.state.updatedAtUtc ??
    params.state.updatedAt ??
    null;

  const freshness = String(params.state.freshness || "").trim().toUpperCase();
  if (freshness === "CURRENT") {
    return { status: "LIVE", runtimeLastEvaluationUtc };
  }
  if (freshness === "MARKET_CLOSED_CURRENT") {
    return { status: "CURRENT_MARKET_CLOSED", runtimeLastEvaluationUtc };
  }
  if (freshness === "STALE") {
    return { status: "STALE", runtimeLastEvaluationUtc };
  }

  const lastTs = parseUtc(runtimeLastEvaluationUtc);
  if (lastTs == null) {
    return { status: "UNAVAILABLE", runtimeLastEvaluationUtc: null };
  }

  const lagSeconds = Math.max(0, Math.floor((Date.parse(params.nowUtc) - lastTs) / 1000));
  if (lagSeconds <= 4 * 60 * 60) return { status: "LIVE", runtimeLastEvaluationUtc };
  if (lagSeconds <= 36 * 60 * 60) return { status: "CURRENT_MARKET_CLOSED", runtimeLastEvaluationUtc };
  if (lagSeconds <= 72 * 60 * 60) return { status: "DELAYED", runtimeLastEvaluationUtc };
  return { status: "STALE", runtimeLastEvaluationUtc };
}

function extractSignalDirection(signal: Record<string, unknown> | null | undefined): string | null {
  const value = signal?.direction;
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

function extractSignalLevel(signal: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!signal) return null;
  for (const key of keys) {
    const raw = signal[key];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function evaluateSignalContract(params: {
  runtimeStatus: RuntimeTruthStatus;
  state: EngineStateLike | null;
}): {
  implemented: boolean;
  current: boolean;
  lastUpdatedUtc: string | null;
  issues: string[];
} {
  if (!params.state) {
    return { implemented: false, current: false, lastUpdatedUtc: null, issues: ["STATE_OUTPUT_MISSING"] };
  }

  const issues: string[] = [];
  const hasCurrentSignalKey = Object.prototype.hasOwnProperty.call(params.state, "currentSignal");
  const hasOpenTradesKey = Object.prototype.hasOwnProperty.call(params.state, "openTrades");
  const implemented = hasCurrentSignalKey && hasOpenTradesKey;
  const lastUpdatedUtc =
    params.state.lastEvaluatedBarUtc ??
    params.state.lastEvaluatedCandle ??
    params.state.updatedAtUtc ??
    params.state.updatedAt ??
    null;

  if (!implemented) {
    issues.push("SIGNAL_CONTRACT_FIELDS_MISSING");
    return { implemented: false, current: false, lastUpdatedUtc, issues };
  }

  const openTrades = Array.isArray(params.state.openTrades) ? params.state.openTrades : [];
  const currentSignal = params.state.currentSignal && typeof params.state.currentSignal === "object"
    ? params.state.currentSignal
    : null;

  if (!currentSignal && openTrades.length === 0) {
    const current = params.runtimeStatus === "LIVE" || params.runtimeStatus === "CURRENT_MARKET_CLOSED";
    return { implemented: true, current, lastUpdatedUtc, issues };
  }

  const direction = extractSignalDirection(currentSignal);
  const entry = extractSignalLevel(currentSignal, ["entry", "entryPrice"]);
  const stop = extractSignalLevel(currentSignal, ["stop", "sl", "stopLossPrice"]);
  const target = extractSignalLevel(currentSignal, ["target", "tp", "takeProfitPrice"]);

  if (!direction || (direction !== "LONG" && direction !== "SHORT")) issues.push("SIGNAL_DIRECTION_INVALID");
  if (entry == null) issues.push("SIGNAL_ENTRY_MISSING");
  if (stop == null) issues.push("SIGNAL_STOP_MISSING");
  if (target == null) issues.push("SIGNAL_TARGET_MISSING");

  const current =
    issues.length === 0 &&
    (params.runtimeStatus === "LIVE" || params.runtimeStatus === "CURRENT_MARKET_CLOSED");

  return { implemented: true, current, lastUpdatedUtc, issues };
}

export function evaluateHistoricalStatus(row: AssetAuditRow | null | undefined): {
  ready: boolean;
  status: ReadinessStatus;
  issues: string[];
} {
  if (!row) {
    return { ready: false, status: "UNAVAILABLE", issues: ["ASSET_AUDIT_MISSING"] };
  }
  const issues: string[] = [];
  const historicalConfigured = row.historicalConfigured === true;
  const historicalVerified = row.historicalVerified === true;
  const rowCount = Number(row.rowCount ?? 0);
  const coverageStatus = String(row.coverageStatus || "").trim().toUpperCase();
  const realGapCount = Number(row.realGapCount ?? 0);

  if (!historicalConfigured) issues.push("HISTORY_NOT_CONFIGURED");
  if (!historicalVerified) issues.push("HISTORY_NOT_VERIFIED");
  if (!(rowCount > 0)) issues.push("HISTORY_EMPTY");
  if (coverageStatus === "MISSING") issues.push("HISTORY_COVERAGE_MISSING");
  if (realGapCount > 0) issues.push("HISTORY_REAL_GAPS_PRESENT");

  const ready = historicalConfigured && historicalVerified && rowCount > 0 && coverageStatus !== "MISSING";
  const status: ReadinessStatus =
    !historicalConfigured || !historicalVerified || rowCount <= 0 || coverageStatus === "MISSING"
      ? "UNAVAILABLE"
      : realGapCount > 0 || coverageStatus === "PARTIAL"
        ? "DEGRADED"
        : "READY";

  return { ready, status, issues };
}

export function aggregatePortfolioHealth(rows: StrategyOperationalHealth[]): PortfolioOperationalHealth[] {
  const portfolios = [...new Set(rows.map((row) => row.portfolio))];
  return portfolios.map((portfolio) => {
    const scoped = rows.filter((row) => row.portfolio === portfolio);
    return {
      portfolio,
      totalStrategies: scoped.length,
      researchReady: scoped.filter((row) => row.researchReady).length,
      runtimeImplemented: scoped.filter((row) => row.runtimeImplemented).length,
      runtimeOnline: scoped.filter((row) => row.runtimeOnline).length,
      liveDataReady: scoped.filter((row) => row.liveSourceMapped && row.liveSourceReachable).length,
      liveDataCurrent: scoped.filter((row) => row.liveSourceFresh).length,
      signalReady: scoped.filter((row) => row.signalContractImplemented).length,
      signalCurrent: scoped.filter((row) => row.signalCurrent).length,
      degraded: scoped.filter((row) => row.overallOperationalStatus === "DEGRADED").length,
      unavailable: scoped.filter((row) => row.overallOperationalStatus === "UNAVAILABLE" || row.overallOperationalStatus === "RUNTIME_NOT_IMPLEMENTED").length,
    };
  });
}
