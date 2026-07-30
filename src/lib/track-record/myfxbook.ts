import { getTrackRecordEnv } from "@/lib/track-record/env";
import { computeMetricsFromDailySeries } from "@/lib/track-record/metrics";
import { MYFXBOOK_MOCK } from "@/lib/track-record/mock-data";
import type {
  AccountRow,
  ClosedTradeRow,
  CashflowRow,
  DailyEquityRow,
  DailyReturnRow,
  OpenPositionRow,
  OpenOrderRow,
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
  rawSnapshots.push(snapshot("myfxbook", "myfxbook", "session", runAt, API_VERSION, {
    error: login.error ?? false,
    message: login.message ?? null,
    sessionEstablished: Boolean(asString(login.session)),
  }));

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
      openOrders: [],
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
  const openOrders = normalizeOpenOrders(openOrdersPayload, accountId, brokerTimezone);
  const closedTrades = normalizeHistory(historyPayload, accountId, brokerTimezone);
  const cashflows = normalizeCashflows(historyPayload, accountId, brokerTimezone, asString(accountCandidate.currency));
  const dailyReturns = normalizeDailyGain(dailyGainPayload, accountId, brokerTimezone);
  const dailyEquity = normalizeDataDaily(dataDailyPayload, accountId, brokerTimezone);
  const metrics = [
    ...normalizeAccountMetrics(accountCandidate, accountId, runAt),
    ...computeMetricsFromDailySeries({
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      equityRows: dailyEquity,
      returnRows: dailyReturns,
      calculationSource: "myfxbook daily endpoints",
    }),
  ];

  return {
    rawSnapshots,
    accounts,
    dailyEquity,
    dailyReturns,
    monthlyReturns: [],
    openPositions,
    openOrders,
    closedTrades,
    cashflows,
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

function normalizeOpenOrders(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): OpenOrderRow[] {
  return asArray<Record<string, unknown>>(payload.openOrders).map((order) => {
    const created = parseBrokerLocalTimestamp(asString(order.openTime) ?? asString(order.createdAt), brokerTimezone);
    return {
      source: "myfxbook",
      provider: "myfxbook",
      providerAccountId: accountId,
      providerOrderId: String(order.ticket ?? order.id ?? stableId([accountId, asString(order.symbol), asString(order.openTime), asString(order.action)])),
      symbol: asString(order.symbol),
      direction: asString(order.action),
      createdAtUtc: created.utc,
      createdAtLocal: created.local,
      brokerTimezone,
      size: asNumber((order.sizing as { value?: unknown } | undefined)?.value),
      sizeUnit: asString((order.sizing as { type?: unknown } | undefined)?.type),
      orderPrice: asNumber(order.openPrice),
      takeProfit: asNumber(order.tp),
      stopLoss: asNumber(order.sl),
      status: "pending",
    };
  });
}

function normalizeHistory(payload: Record<string, unknown>, accountId: string, brokerTimezone: string | null): ClosedTradeRow[] {
  return asArray<Record<string, unknown>>(payload.history)
    .filter((trade) => /^(buy|sell)$/i.test(asString(trade.action) ?? asString(trade.type) ?? ""))
    .map((trade) => {
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

function normalizeCashflows(
  payload: Record<string, unknown>,
  accountId: string,
  brokerTimezone: string | null,
  currency: string | null,
): CashflowRow[] {
  return asArray<Record<string, unknown>>(payload.history)
    .filter((row) => /(deposit|withdraw|balance|credit|fee|dividend)/i.test(asString(row.action) ?? asString(row.type) ?? ""))
    .map((row) => {
      const occurred = parseBrokerLocalTimestamp(asString(row.closeTime) ?? asString(row.openTime), brokerTimezone);
      const action = (asString(row.action) ?? asString(row.type) ?? "").toLowerCase();
      const flowType = action.includes("deposit") || action.includes("credit")
        ? "deposit" as const
        : action.includes("withdraw")
          ? "withdrawal" as const
          : action.includes("fee")
            ? "fee" as const
            : action.includes("dividend")
              ? "dividend" as const
              : "unknown" as const;
      return {
        source: "myfxbook",
        provider: "myfxbook",
        providerAccountId: accountId,
        stableCashflowId: stableId([accountId, asString(row.id), action, occurred.local, String(row.profit ?? row.amount ?? "")]),
        flowType,
        amount: asNumber(row.profit) ?? asNumber(row.amount),
        currency,
        occurredAtUtc: occurred.utc,
        occurredAtLocal: occurred.local,
        brokerTimezone,
        note: action || null,
      };
    });
}

function normalizeAccountMetrics(
  account: Record<string, unknown>,
  accountId: string,
  asOfUtc: string,
) {
  const values: Array<[string, unknown]> = [
    ["balance", account.balance],
    ["equity", account.equity],
    ["profit", account.profit],
    ["gain_pct", account.gain],
    ["drawdown_pct", account.drawdown],
    ["deposits", account.deposits],
    ["withdrawals", account.withdrawals],
  ];
  return values.flatMap(([metricName, raw]) => {
    const metricValue = asNumber(raw);
    return metricValue === null ? [] : [{
      source: "myfxbook" as const,
      provider: "myfxbook" as const,
      providerAccountId: accountId,
      metricScope: "account" as const,
      metricName,
      metricValue,
      metricDateUtc: null,
      asOfUtc,
      isVerified: true,
      calculationSource: "myfxbook get-my-accounts",
    }];
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
  return parseBrokerLocalTimestamp(`${isoLike}T00:00:00`, brokerTimezone).utc?.slice(0, 10) ?? null;
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
    const payload = await fetchJsonWithRetry(url.toString(), {
      method: "GET",
      timeoutMs: 15000,
      retries: 2,
      backoffMs: 900,
    });
    if (payload.error === true) {
      throw new Error(`Myfxbook ${pathname} failed: ${asString(payload.message) ?? "provider error"}`);
    }
    return payload;
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
