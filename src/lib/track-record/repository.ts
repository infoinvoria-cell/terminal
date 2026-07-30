import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getTrackRecordEnv } from "@/lib/track-record/env";
import type {
  AccountRow,
  RawSnapshotRow,
  SourceSyncStatusRow,
  TrackRecordMetricRow,
  TrackRecordOverview,
  TrackRecordSnapshotBundle,
} from "@/lib/track-record/types";

export async function persistTrackRecordBundle(
  bundle: TrackRecordSnapshotBundle,
  options: { appendOnly?: boolean } = {},
) {
  const env = getTrackRecordEnv();
  if (!env.hasSupabase) {
    return { persisted: false, reason: "supabase_not_configured" as const };
  }

  const db = createSupabaseServiceClient();

  await insertImmutable(db, "track_record_raw_snapshots", mapRawSnapshots(bundle.rawSnapshots));
  await upsert(db, "accounts", mapAccounts(bundle.accounts), "source,provider,provider_account_id");
  await persistSeries(db, "daily_equity", mapDailyEquity(bundle.dailyEquity), "source,provider,provider_account_id,date_utc", options.appendOnly);
  await persistSeries(db, "daily_returns", mapDailyReturns(bundle.dailyReturns), "source,provider,provider_account_id,date_utc", options.appendOnly);
  await persistSeries(db, "monthly_returns", mapMonthlyReturns(bundle.monthlyReturns), "source,provider,provider_account_id,month_utc", options.appendOnly);
  await upsert(db, "open_positions", mapOpenPositions(bundle.openPositions), "source,provider,provider_account_id,provider_position_id");
  await upsert(db, "open_orders", mapOpenOrders(bundle.openOrders), "source,provider,provider_account_id,provider_order_id");
  await persistSeries(db, "closed_trades", mapClosedTrades(bundle.closedTrades), "source,provider,provider_account_id,stable_trade_id", true);
  await persistSeries(db, "cashflows", mapCashflows(bundle.cashflows), "source,provider,provider_account_id,stable_cashflow_id", true);
  await insertImmutable(db, "track_record_metrics", mapMetrics(bundle.metrics));
  await upsert(db, "source_sync_status", mapSyncStatus(bundle.syncStatus), "source,provider,provider_account_id");

  return { persisted: true as const };
}

export async function loadTrackRecordOverviewRows() {
  const env = getTrackRecordEnv();
  if (!env.hasSupabase) {
    return {
      syncRows: [] as SourceSyncStatusRow[],
      accountRows: [] as AccountRow[],
      metrics: [] as TrackRecordMetricRow[],
      productiveDatabaseSchemaAvailable: false,
      historicalPersistenceVerified: false,
    };
  }

  const db = createSupabaseServiceClient();
  const [syncRes, accountRes, metricsRes] = await Promise.all([
    db.from("source_sync_status").select("*").order("last_attempt_at_utc", { ascending: false }).limit(20),
    db.from("accounts").select("*").order("last_seen_at_utc", { ascending: false }).limit(20),
    db.from("track_record_metrics").select("*").order("as_of_utc", { ascending: false }).limit(80),
  ]);
  const firstError = syncRes.error ?? accountRes.error ?? metricsRes.error;
  if (firstError) throw firstError;

  return {
    syncRows: (syncRes.data ?? []).map(fromSyncRow),
    accountRows: (accountRes.data ?? []).map(fromAccountRow),
    metrics: (metricsRes.data ?? []).map(fromMetricRow),
    productiveDatabaseSchemaAvailable: true,
    historicalPersistenceVerified: (syncRes.data ?? []).some((row) =>
      row.provider === "historical"
      && row.mode === "live"
      && row.health === "ok"
      && Boolean(row.last_success_at_utc),
    ),
  };
}

async function upsert(db: ReturnType<typeof createSupabaseServiceClient>, table: string, rows: object[], onConflict: string) {
  if (!rows.length) return;
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

async function insertImmutable(db: ReturnType<typeof createSupabaseServiceClient>, table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await db.from(table).insert(rows);
  if (error && error.code !== "23505") throw error;
}

async function persistSeries(
  db: ReturnType<typeof createSupabaseServiceClient>,
  table: string,
  rows: object[],
  onConflict: string,
  appendOnly = false,
) {
  if (!rows.length) return;
  if (appendOnly) {
    const { error } = await db.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  await upsert(db, table, rows, onConflict);
}

function mapAccounts(rows: TrackRecordSnapshotBundle["accounts"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    account_label: row.accountLabel,
    broker: row.broker,
    broker_timezone: row.brokerTimezone,
    currency: row.currency,
    account_number_masked: row.accountNumberMasked,
    darwin_ticker: row.darwinTicker,
    is_demo: row.isDemo,
    first_seen_at_utc: row.firstSeenAtUtc,
    last_seen_at_utc: row.lastSeenAtUtc,
  }));
}

function mapRawSnapshots(rows: RawSnapshotRow[]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    account_or_darwin_id: row.accountOrDarwinId,
    fetched_at_utc: row.fetchedAtUtc,
    api_version: row.apiVersion,
    payload_hash: row.payloadHash,
    payload: row.payload,
  }));
}

function mapDailyEquity(rows: TrackRecordSnapshotBundle["dailyEquity"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    date_utc: row.dateUtc,
    equity: row.equity,
    balance: row.balance,
    floating_pl: row.floatingPl,
    broker_local_date: row.brokerLocalDate,
    broker_timezone: row.brokerTimezone,
  }));
}

function mapDailyReturns(rows: TrackRecordSnapshotBundle["dailyReturns"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    date_utc: row.dateUtc,
    return_pct: row.returnPct,
    profit: row.profit,
    broker_local_date: row.brokerLocalDate,
    broker_timezone: row.brokerTimezone,
  }));
}

function mapMonthlyReturns(rows: TrackRecordSnapshotBundle["monthlyReturns"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    month_utc: row.monthUtc,
    return_pct: row.returnPct,
    source_document: row.sourceDocument,
    calculation_version: row.calculationVersion,
  }));
}

function mapOpenPositions(rows: TrackRecordSnapshotBundle["openPositions"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    provider_position_id: row.providerPositionId,
    symbol: row.symbol,
    direction: row.direction,
    opened_at_utc: row.openedAtUtc,
    opened_at_local: row.openedAtLocal,
    broker_timezone: row.brokerTimezone,
    size: row.size,
    size_unit: row.sizeUnit,
    open_price: row.openPrice,
    current_price: row.currentPrice,
    take_profit: row.takeProfit,
    stop_loss: row.stopLoss,
    profit: row.profit,
    pips: row.pips,
    status: row.status,
  }));
}

function mapOpenOrders(rows: TrackRecordSnapshotBundle["openOrders"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    provider_order_id: row.providerOrderId,
    symbol: row.symbol,
    direction: row.direction,
    created_at_utc: row.createdAtUtc,
    created_at_local: row.createdAtLocal,
    broker_timezone: row.brokerTimezone,
    size: row.size,
    size_unit: row.sizeUnit,
    order_price: row.orderPrice,
    take_profit: row.takeProfit,
    stop_loss: row.stopLoss,
    status: row.status,
  }));
}

function mapClosedTrades(rows: TrackRecordSnapshotBundle["closedTrades"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    stable_trade_id: row.stableTradeId,
    provider_trade_id: row.providerTradeId,
    symbol: row.symbol,
    direction: row.direction,
    opened_at_utc: row.openedAtUtc,
    opened_at_local: row.openedAtLocal,
    closed_at_utc: row.closedAtUtc,
    closed_at_local: row.closedAtLocal,
    broker_timezone: row.brokerTimezone,
    size: row.size,
    size_unit: row.sizeUnit,
    open_price: row.openPrice,
    close_price: row.closePrice,
    take_profit: row.takeProfit,
    stop_loss: row.stopLoss,
    profit: row.profit,
    commission: row.commission,
    interest: row.interest,
    pips: row.pips,
    raw_payload_hash: row.rawPayloadHash,
  }));
}

function mapCashflows(rows: TrackRecordSnapshotBundle["cashflows"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    stable_cashflow_id: row.stableCashflowId,
    flow_type: row.flowType,
    amount: row.amount,
    currency: row.currency,
    occurred_at_utc: row.occurredAtUtc,
    occurred_at_local: row.occurredAtLocal,
    broker_timezone: row.brokerTimezone,
    note: row.note,
  }));
}

function mapMetrics(rows: TrackRecordSnapshotBundle["metrics"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    metric_scope: row.metricScope,
    metric_name: row.metricName,
    metric_value: row.metricValue,
    metric_date_utc: row.metricDateUtc,
    as_of_utc: row.asOfUtc,
    is_verified: row.isVerified,
    calculation_source: row.calculationSource,
  }));
}

function mapSyncStatus(rows: TrackRecordSnapshotBundle["syncStatus"]) {
  return rows.map((row) => ({
    source: row.source,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    last_attempt_at_utc: row.lastAttemptAtUtc,
    last_success_at_utc: row.lastSuccessAtUtc,
    stale_after_utc: row.staleAfterUtc,
    health: row.health,
    message: row.message,
    requests_used: row.requestsUsed,
    mode: row.mode,
  }));
}

function fromSyncRow(row: Record<string, unknown>): SourceSyncStatusRow {
  return {
    source: row.source as SourceSyncStatusRow["source"],
    provider: row.provider as SourceSyncStatusRow["provider"],
    providerAccountId: String(row.provider_account_id ?? ""),
    lastAttemptAtUtc: row.last_attempt_at_utc as string | null,
    lastSuccessAtUtc: row.last_success_at_utc as string | null,
    staleAfterUtc: row.stale_after_utc as string | null,
    health: row.health as SourceSyncStatusRow["health"],
    message: row.message as string | null,
    requestsUsed: Number(row.requests_used ?? 0),
    mode: row.mode as SourceSyncStatusRow["mode"],
  };
}

function fromAccountRow(row: Record<string, unknown>): AccountRow {
  return {
    source: row.source as AccountRow["source"],
    provider: row.provider as AccountRow["provider"],
    providerAccountId: String(row.provider_account_id ?? ""),
    accountLabel: row.account_label as string | null,
    broker: row.broker as string | null,
    brokerTimezone: row.broker_timezone as string | null,
    currency: row.currency as string | null,
    accountNumberMasked: row.account_number_masked as string | null,
    darwinTicker: row.darwin_ticker as string | null,
    isDemo: row.is_demo as boolean | null,
    firstSeenAtUtc: String(row.first_seen_at_utc ?? ""),
    lastSeenAtUtc: String(row.last_seen_at_utc ?? ""),
  };
}

function fromMetricRow(row: Record<string, unknown>): TrackRecordMetricRow {
  return {
    source: row.source as TrackRecordMetricRow["source"],
    provider: row.provider as TrackRecordMetricRow["provider"],
    providerAccountId: String(row.provider_account_id ?? ""),
    metricScope: row.metric_scope as TrackRecordMetricRow["metricScope"],
    metricName: String(row.metric_name ?? ""),
    metricValue: (row.metric_value as number | string | null) ?? null,
    metricDateUtc: row.metric_date_utc as string | null,
    asOfUtc: String(row.as_of_utc ?? ""),
    isVerified: Boolean(row.is_verified),
    calculationSource: String(row.calculation_source ?? ""),
  };
}
