import { getTrackRecordEnv } from "@/lib/track-record/env";
import { computeMetricsFromDailySeries } from "@/lib/track-record/metrics";
import { MYFXBOOK_MOCK } from "@/lib/track-record/mock-data";
import type {
  AccountRow,
  ClosedTradeRow,
  DailyEquityRow,
  DailyReturnRow,
  OpenPositionRow,
  RawSnapshotRow,
  SourceSyncStatusRow,
  SyncMode,
  TrackRecordSnapshotBundle,
} from "@/lib/track-record/types";
import {
  addMinutesIso,
  asArray,
  asNumber,
  asString,
  fetchJsonWithRetry,
  isoDateOnly,
  maskAccountNumber,
  parseBrokerLocalTimestamp,
  sha256Json,
  stableId,
} from "@/lib/track-record/utils";

const API_VERSION = "myfxbook-v1.38";
const BASE_URL = "https://www.myfxbook.com/api";

type MyfxbookRunOptions = {
  mode: SyncMode;
  requestedAccountId?: string | null;
  dateStart?: string;
  dateEnd?: string;
};

export async function collectMyfxbookSnapshotBundle(options: MyfxbookRunOptions): Promise<TrackRecordSnapshotBundle> {
  const env = getTrackRecordEnv();
  const runAt = new Date().toISOString();
  const requestedAccountId = options.requestedAccountId ?? env.myfxbookAccountId ?? null;
  const rawSnapshots: RawSnapshotRow[] = [];
  const unavailable: string[] = [];

  const client = options.mode === "live"
    ? await createLiveClient()
    : createMockClient();

  const login = await client.login();
  rawSnapshots.push(snapshot("myfxbook", "myfxbook", "session", runAt, API_VERSION, login));

  const accountsPayload = await client.getMyAccounts();
  rawSnapshots.push(snapshot("myfxbook", "myfxbook", requestedAccountId ?? "accounts", runAt, API_VERSION, accountsPayload));

  const accountCandidate = asArray<Record<string, unknown>>(accountsPayload.accounts)
    .find((row) => String(row.id ?? row.accountId ?? "") === String(requestedAccountId ?? ""))
    ?? asArray<Record<string, unknown>>(accountsPayload.accounts)[0];

  if (!accountCandidate) {
    return {
      rawSnapshots,
      accounts: [],
      dailyEquity: [],
      dailyReturns: [],
      monthlyReturns: [],
      openPositions: [],
      closedTrades: [],
      cashflows: [],
      metrics: [],
      syncStatus: [buildStatus(runAt, "error", options.mode, "No Myfxbook account available")],
      unavailable: ["myfxbook account not found"],
    };
  }

  const accountId = String(accountCandidate.id ?? accountCandidate.accountId ?? requestedAccountId ?? "unknown");
  const brokerTimezone = env.myfxbookBrokerTimezone || null;
  const start = options.dateStart ?? "2024-04-11";
  const end = options.dateEnd ?? new Date().toISOString().slice(0, 10);

  const [openTradesPayload, openOrdersPayload, historyPayload, dailyGainPayload, dataDailyPayload] = await Promise.all([
    client.getOpenTrades(accountId),
    client.getOpenOrders(accountId),
    client.getHistory(accountId),
    client.getDailyGain(accountId, start, end),
    client.getDataDaily(accountId, start, end),
  ]);

  for (const payload of [openTradesPayload, openOrdersPayload, historyPayload, dailyGainPayload, dataDailyPayload]) {
    rawSnapshots.push(snapshot("myfxbook", "myfxbook", accountId, runAt, API_VERSION, payload));
  }

  if (asArray(historyPayload.history).length >= 50) {
    unavailable.push("Myfxbook get-history is limited to the latest 50 transactions; regular sync is mandatory.");
  }

  const accounts = [normalizeAccount(accountCandidate, runAt, brokerTimezone)];
  const openPositions = normalizeOpenTrades(openTradesPayload, accountId, brokerTimezone);
  const closedTrades = normalizeHistory(historyPayload, accountId, brokerTimezone);
  const dailyReturns = normalizeDailyGain(dailyGainPayload, accountId, brokerTimezone);
  const dailyEquity = normalizeDataDaily(dataDailyPayload, accountId, brokerTimezone);
  const metrics = computeMetricsFromDailySeries({
    source: "myfxbook",
    provider: "myfxbook",
    providerAccountId: accountId,
    equityRows: dailyEquity,
    returnRows: dailyReturns,
    calculationSource: "myfxbook daily endpoints",
  });

  return {
    rawSnapshots,
    accounts,
    dailyEquity,
    dailyReturns,
    monthlyReturns: [],
    openPositions,
    closedTrades,
    cashflows: [],
    metrics,
    syncStatus: [buildStatus(runAt, "ok", options.mode, `Fetched account ${accountId}`)],
    unavailable,
  };
}

function normalizeAccount(account: Record<string, unknown>, runAt: string, brokerTimezone: string | null): AccountRow {
  return {
    source: "myfxbook",
    provider: "myfxbook",
    providerAccountId: String(account.id ?? account.accountId ?? "unknown"),
    accountLabel: asString(account.name),
    broker: asString((account.server as { name?: string } | undefined)?.name ?? account.server),
    brokerTimezone,
    currency: asString(account.currency),
    accountNumberMasked: maskAccountNumber(account.accountId as string | number | undefined),
    darwinTicker: null,
    isDemo: typeof account.demo === "boolean" ? account.demo : null,
    firstSeenAtUtc: runAt,
    lastSeenAtUtc: runAt,
  };
}

function normalizeOpenTrades(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): OpenPositionRow[] {
  return asArray<Record<string, unknown>>(payload.openTrades).map((trade) => {
    const opened = parseBrokerLocalTimestamp(asString(trade.openTime), brokerTimezone);
    return {
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      providerPositionId: String(trade.ticket ?? trade.id ?? stableId([accountId, asString(trade.symbol), asString(trade.openTime), asString(trade.action)])),
      symbol: asString(trade.symbol),
      direction: asString(trade.action),
      openedAtUtc: opened.utc,
      openedAtLocal: opened.local,
      brokerTimezone,
      size: asNumber((trade.sizing as { value?: unknown } | undefined)?.value),
      sizeUnit: asString((trade.sizing as { type?: unknown } | undefined)?.type),
      openPrice: asNumber(trade.openPrice),
      currentPrice: null,
      takeProfit: asNumber(trade.tp),
      stopLoss: asNumber(trade.sl),
      profit: asNumber(trade.profit),
      pips: asNumber(trade.pips),
      status: "open",
    };
  });
}

function normalizeHistory(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): ClosedTradeRow[] {
  return asArray<Record<string, unknown>>(payload.history).map((trade) => {
    const opened = parseBrokerLocalTimestamp(asString(trade.openTime), brokerTimezone);
    const closed = parseBrokerLocalTimestamp(asString(trade.closeTime), brokerTimezone);
    const providerTradeId = asString(trade.id) ?? asString(trade.ticket);
    const stableTradeIdValue = stableId([
      accountId,
      providerTradeId,
      asString(trade.symbol),
      asString(trade.action),
      asString(trade.openTime),
      asString(trade.closeTime),
      String(trade.openPrice ?? ""),
      String(trade.closePrice ?? ""),
      String((trade.sizing as { value?: unknown } | undefined)?.value ?? ""),
    ]);

    return {
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      stableTradeId: stableTradeIdValue,
      providerTradeId,
      symbol: asString(trade.symbol),
      direction: asString(trade.action),
      openedAtUtc: opened.utc,
      openedAtLocal: opened.local,
      closedAtUtc: closed.utc,
      closedAtLocal: closed.local,
      brokerTimezone,
      size: asNumber((trade.sizing as { value?: unknown } | undefined)?.value),
      sizeUnit: asString((trade.sizing as { type?: unknown } | undefined)?.type),
      openPrice: asNumber(trade.openPrice),
      closePrice: asNumber(trade.closePrice),
      takeProfit: asNumber(trade.tp),
      stopLoss: asNumber(trade.sl),
      profit: asNumber(trade.profit),
      commission: asNumber(trade.commission),
      interest: asNumber(trade.interest),
      pips: asNumber(trade.pips),
      rawPayloadHash: sha256Json(trade),
    };
  });
}

function normalizeDailyGain(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): DailyReturnRow[] {
  return asArray<Record<string, unknown>>(payload.dailyGain).map((row) => {
    const localDate = asString(row.date);
    const utcDate = brokerLocalDateToUtcDate(localDate, brokerTimezone);
    return {
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      dateUtc: utcDate ?? isoDateOnly(localDate?.replace(/\//g, "-") ?? "") ?? "1970-01-01",
      returnPct: asNumber(row.value),
      profit: asNumber(row.profit),
      brokerLocalDate: localDate,
      brokerTimezone,
    };
  });
}

function normalizeDataDaily(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): DailyEquityRow[] {
  return asArray<Record<string, unknown>>(payload.dataDaily).map((row) => {
    const localDate = asString(row.date);
    const utcDate = brokerLocalDateToUtcDate(localDate, brokerTimezone);
    return {
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      dateUtc: utcDate ?? isoDateOnly(localDate?.replace(/\//g, "-") ?? "") ?? "1970-01-01",
      equity: (() => {
        const balance = asNumber(row.balance);
        const floating = asNumber(row.floatingPL);
        if (balance === null) return null;
        return floating === null ? balance : balance + floating;
      })(),
      balance: asNumber(row.balance),
      floatingPl: asNumber(row.floatingPL),
      brokerLocalDate: localDate,
      brokerTimezone,
    };
  });
}

function brokerLocalDateToUtcDate(localDate: string | null, brokerTimezone: string | null) {
  if (!localDate) return null;
  const isoLike = localDate.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2");
  if (!brokerTimezone) return isoLike;
  const parsed = new Date(`${isoLike}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? isoLike : parsed.toISOString().slice(0, 10);
}

function snapshot(
  source: "myfxbook",
  provider: "myfxbook",
  accountOrDarwinId: string,
  fetchedAtUtc: string,
  apiVersion: string,
  payload: unknown,
): RawSnapshotRow {
  return {
    source,
    provider,
    accountOrDarwinId,
    fetchedAtUtc,
    apiVersion,
    payloadHash: sha256Json(payload),
    payload,
  };
}

function buildStatus(runAt: string, health: "ok" | "error", mode: SyncMode, message: string): SourceSyncStatusRow {
  return {
    source: "myfxbook",
    provider: "myfxbook",
    providerAccountId: "global",
    lastAttemptAtUtc: runAt,
    lastSuccessAtUtc: health === "ok" ? runAt : null,
    staleAfterUtc: addMinutesIso(runAt, 15),
    health,
    message,
    requestsUsed: 6,
    mode,
  };
}

async function createLiveClient() {
  const env = getTrackRecordEnv();
  if (!env.hasMyfxbookCredentials) {
    throw new Error("Myfxbook credentials missing");
  }

  const sessionState = { session: "" };
  const fetchJson = async (pathname: string, params: Record<string, string>) => {
    const url = new URL(`${BASE_URL}/${pathname}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return fetchJsonWithRetry(url.toString(), {
      method: "GET",
      timeoutMs: 15000,
      retries: 2,
      backoffMs: 900,
    });
  };

  return {
    async login() {
      const payload = await fetchJson("login.json", {
        email: env.myfxbookEmail,
        password: env.myfxbookPassword,
      });
      const session = asString(payload.session);
      if (!session) throw new Error(`Myfxbook login failed: ${String(payload.message ?? "unknown")}`);
      sessionState.session = session;
      return payload;
    },
    async getMyAccounts() {
      return fetchJson("get-my-accounts.json", { session: sessionState.session });
    },
    async getOpenTrades(id: string) {
      return fetchJson("get-open-trades.json", { session: sessionState.session, id });
    },
    async getOpenOrders(id: string) {
      return fetchJson("get-open-orders.json", { session: sessionState.session, id });
    },
    async getHistory(id: string) {
      return fetchJson("get-history.json", { session: sessionState.session, id });
    },
    async getDailyGain(id: string, start: string, end: string) {
      return fetchJson("get-daily-gain.json", { session: sessionState.session, id, start, end });
    },
    async getDataDaily(id: string, start: string, end: string) {
      return fetchJson("get-data-daily.json", { session: sessionState.session, id, start, end });
    },
  };
}

function createMockClient() {
  return {
    async login() { return MYFXBOOK_MOCK.login as unknown as Record<string, unknown>; },
    async getMyAccounts() { return MYFXBOOK_MOCK.accounts as unknown as Record<string, unknown>; },
    async getOpenTrades() { return MYFXBOOK_MOCK.openTrades as unknown as Record<string, unknown>; },
    async getOpenOrders() { return MYFXBOOK_MOCK.openOrders as unknown as Record<string, unknown>; },
    async getHistory() { return MYFXBOOK_MOCK.history as unknown as Record<string, unknown>; },
    async getDailyGain() { return MYFXBOOK_MOCK.dailyGain as unknown as Record<string, unknown>; },
    async getDataDaily() { return MYFXBOOK_MOCK.dataDaily as unknown as Record<string, unknown>; },
  };
}
