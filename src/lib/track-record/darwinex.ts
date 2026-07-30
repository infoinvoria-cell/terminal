import { getTrackRecordEnv } from "@/lib/track-record/env";
import { computeMetricsFromDailySeries } from "@/lib/track-record/metrics";
import { DARWINEX_MOCK } from "@/lib/track-record/mock-data";
import type {
  AccountRow,
  DailyEquityRow,
  DailyReturnRow,
  OpenPositionRow,
  RawSnapshotRow,
  SourceSyncStatusRow,
  SyncMode,
  TrackRecordMetricRow,
  TrackRecordSnapshotBundle,
} from "@/lib/track-record/types";
import { addMinutesIso, asArray, asNumber, asString, fetchJsonWithRetry, sha256Json, stableId } from "@/lib/track-record/utils";

const API_VERSION = "darwinex-official";

type DarwinexRunOptions = {
  mode: SyncMode;
};

export async function collectDarwinexSnapshotBundle(options: DarwinexRunOptions): Promise<TrackRecordSnapshotBundle> {
  const env = getTrackRecordEnv();
  const runAt = new Date().toISOString();
  const productId = env.darwinexProductId || "unknown";
  const rawSnapshots: RawSnapshotRow[] = [];

  const client = options.mode === "live"
    ? createLiveDarwinexClient()
    : createMockDarwinexClient();

  const info = await client.fetchInfo();
  rawSnapshots.push(snapshot(productId, runAt, info));

  const history = await client.fetchHistory();
  rawSnapshots.push(snapshot(productId, runAt, history));

  const investor = await client.fetchInvestor();
  rawSnapshots.push(snapshot(productId, runAt, investor));

  const accounts: AccountRow[] = [
    {
      source: "darwinex_darwin",
      provider: "darwinex",
      providerAccountId: productId,
      accountLabel: asString((info as Record<string, unknown>).productName) ?? productId,
      broker: "Darwinex",
      brokerTimezone: "UTC",
      currency: "EUR",
      accountNumberMasked: null,
      darwinTicker: asString((info as Record<string, unknown>).productName) ?? productId,
      isDemo: null,
      firstSeenAtUtc: runAt,
      lastSeenAtUtc: runAt,
    },
  ];

  const dailyReturns = normalizeDarwinReturns(productId, history);
  const dailyEquity = normalizeDarwinEquity(productId, history);
  const metrics = [
    ...normalizeDarwinMetrics(productId, info, runAt),
    ...computeMetricsFromDailySeries({
      source: "darwinex_darwin",
      provider: "darwinex",
      providerAccountId: productId,
      equityRows: dailyEquity,
      returnRows: dailyReturns,
      scope: "darwin",
      calculationSource: "darwinex quotes and return series",
    }),
  ];

  const unavailable: string[] = [];
  const openPositions = normalizeInvestorOpenPositions(productId, investor);
  if (!openPositions.length) {
    unavailable.push("Investor-account open positions were not returned by the configured Darwinex endpoint.");
  }

  return {
    rawSnapshots,
    accounts,
    dailyEquity,
    dailyReturns,
    monthlyReturns: [],
    openPositions,
    closedTrades: [],
    cashflows: [],
    metrics,
    syncStatus: [statusRow(productId, runAt, options.mode)],
    unavailable,
  };
}

function normalizeInvestorOpenPositions(productId: string, investor: unknown): OpenPositionRow[] {
  return asArray<Record<string, unknown>>((investor as Record<string, unknown>).openPositions).map((row) => ({
    source: "darwinex_darwin",
    provider: "darwinex",
    providerAccountId: productId,
    providerPositionId: asString(row.id) ?? stableId([productId, asString(row.symbol), asString(row.openedAt), asString(row.side)]),
    symbol: asString(row.symbol),
    direction: asString(row.side),
    openedAtUtc: asString(row.openedAt),
    openedAtLocal: asString(row.openedAt),
    brokerTimezone: "UTC",
    size: asNumber(row.size),
    sizeUnit: asString(row.sizeUnit),
    openPrice: asNumber(row.openPrice),
    currentPrice: asNumber(row.currentPrice),
    takeProfit: asNumber(row.takeProfit),
    stopLoss: asNumber(row.stopLoss),
    profit: asNumber(row.profit),
    pips: asNumber(row.pips),
    status: "open",
  }));
}

function normalizeDarwinReturns(productId: string, history: unknown): DailyReturnRow[] {
  const quotes = asArray<Record<string, unknown>>((history as Record<string, unknown>).quotes);
  return quotes.map((row, index) => {
    const currentQuote = asNumber(row.quote);
    const previousQuote = index > 0 ? asNumber(quotes[index - 1]?.quote) : null;
    const derivedReturnPct =
      currentQuote !== null && previousQuote !== null && previousQuote !== 0
        ? ((currentQuote - previousQuote) / previousQuote) * 100
        : null;

    return {
      source: "darwinex_darwin",
      provider: "darwinex",
      providerAccountId: productId,
      dateUtc: asString(row.timestamp)?.slice(0, 10) ?? "1970-01-01",
      returnPct: derivedReturnPct,
      profit: null,
      brokerLocalDate: asString(row.timestamp),
      brokerTimezone: "UTC",
    };
  });
}

function normalizeDarwinEquity(productId: string, history: unknown): DailyEquityRow[] {
  const quotes = asArray<Record<string, unknown>>((history as Record<string, unknown>).quotes);
  return quotes.map((row) => ({
    source: "darwinex_darwin",
    provider: "darwinex",
    providerAccountId: productId,
    dateUtc: asString(row.timestamp)?.slice(0, 10) ?? "1970-01-01",
    equity: asNumber(row.quote),
    balance: null,
    floatingPl: null,
    brokerLocalDate: asString(row.timestamp),
    brokerTimezone: "UTC",
  }));
}

function normalizeDarwinMetrics(productId: string, info: unknown, asOfUtc: string): TrackRecordMetricRow[] {
  const row = info as Record<string, unknown>;
  const metrics: TrackRecordMetricRow[] = [];
  const push = (metricName: string, metricValue: number | string | null) => {
    metrics.push({
      source: "darwinex_darwin",
      provider: "darwinex",
      providerAccountId: productId,
      metricScope: "darwin",
      metricName,
      metricValue,
      metricDateUtc: null,
      asOfUtc,
      isVerified: true,
      calculationSource: "darwinex official api",
    });
  };

  push("darwin_quote", asNumber(row.quote));
  push("darwin_return_pct", asNumber(row.returnPct));
  push("darwin_drawdown_pct", asNumber(row.drawdownPct));
  push("darwin_risk_stability", asNumber(row.riskStability));

  const attributes = (row.attributes ?? {}) as Record<string, unknown>;
  for (const key of ["dScore", "investors", "invested", "rotation"]) {
    push(key, asNumber(attributes[key]) ?? asString(attributes[key]));
  }
  return metrics;
}

function statusRow(productId: string, runAt: string, mode: SyncMode): SourceSyncStatusRow {
  return {
    source: "darwinex_darwin",
    provider: "darwinex",
    providerAccountId: productId,
    lastAttemptAtUtc: runAt,
    lastSuccessAtUtc: runAt,
    staleAfterUtc: addMinutesIso(runAt, 60),
    health: "ok",
    message: `Fetched DARWIN ${productId}`,
    requestsUsed: 3,
    mode,
  };
}

function snapshot(accountOrDarwinId: string, fetchedAtUtc: string, payload: unknown): RawSnapshotRow {
  return {
    source: "darwinex_darwin",
    provider: "darwinex",
    accountOrDarwinId,
    fetchedAtUtc,
    apiVersion: API_VERSION,
    payloadHash: sha256Json(payload),
    payload,
  };
}

function createMockDarwinexClient() {
  return {
    async fetchInfo() { return DARWINEX_MOCK.info as unknown as Record<string, unknown>; },
    async fetchHistory() { return DARWINEX_MOCK.history as unknown as Record<string, unknown>; },
    async fetchInvestor() { return DARWINEX_MOCK.investor as unknown as Record<string, unknown>; },
  };
}

function createLiveDarwinexClient() {
  const env = getTrackRecordEnv();
  const token = env.darwinexAccessToken;
  if (!token) throw new Error("Darwinex access token missing");
  if (!env.darwinexProductId) throw new Error("DARWINEX_PRODUCT_ID missing");

  const infoUrl = env.darwinexInfoUrl || `https://api.darwinex.com/darwininfo/${env.darwinexProductId}`;
  const historyUrl = env.darwinexHistoryUrl || `https://api.darwinex.com/darwininfo/${env.darwinexProductId}/history`;
  const investorUrl = env.darwinexInvestorUrl || `https://api.darwinex.com/investoraccount/${env.darwinexProductId}`;

  const fetchJson = async (url: string) => {
    return fetchJsonWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 15000,
      retries: 2,
      backoffMs: 900,
    });
  };

  return {
    async fetchInfo() { return fetchJson(infoUrl); },
    async fetchHistory() { return fetchJson(historyUrl); },
    async fetchInvestor() { return fetchJson(investorUrl); },
  };
}
