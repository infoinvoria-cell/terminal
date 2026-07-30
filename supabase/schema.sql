-- Capitalife Terminal — Supabase Schema
-- Run in Supabase Dashboard → SQL Editor

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  name        text,
  role        text not null default 'viewer',
  created_at  timestamptz not null default now()
);
alter table public.users enable row level security;
create policy "Users can read own row" on public.users
  for select using (auth.uid() = id);

-- ── Signals ──────────────────────────────────────────────────────────────────
create table if not exists public.signals (
  id           uuid primary key default gen_random_uuid(),
  strategy_id  text not null,
  symbol       text not null,
  direction    text not null check (direction in ('long', 'short', 'flat')),
  timestamp    timestamptz not null default now(),
  status       text not null default 'open' check (status in ('open', 'closed', 'cancelled'))
);
alter table public.signals enable row level security;
create policy "Authenticated users can read signals" on public.signals
  for select using (auth.role() = 'authenticated');

-- ── Investors ────────────────────────────────────────────────────────────────
create table if not exists public.investors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  aum         numeric(18, 2),
  performance numeric(8, 4),
  created_at  timestamptz not null default now()
);
alter table public.investors enable row level security;
create policy "Authenticated users can read investors" on public.investors
  for select using (auth.role() = 'authenticated');

-- ── Forward Trades (Live Trade Log) ──────────────────────────────────────────
create table if not exists public.forward_trades (
  id           uuid primary key default gen_random_uuid(),
  event        text not null,                        -- 'ENTRY' | 'EXIT'
  symbol       text not null,
  direction    text not null,                        -- 'LONG' | 'SHORT'
  entry_price  numeric(18, 6),
  exit_price   numeric(18, 6),
  entry_date   text,                                 -- ISO date string from CSV
  exit_date    text,                                 -- null = still open
  pnl          numeric(18, 6),
  strategy_id  text,
  notes        text,
  uploaded_at  timestamptz not null default now(),
  unique (symbol, entry_date, direction, event)
);
alter table public.forward_trades enable row level security;
create policy "Service role full access on forward_trades" on public.forward_trades
  using (true) with check (true);

-- ── Forward Signals ──────────────────────────────────────────────────────────
create table if not exists public.forward_signals (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  direction    text not null,
  in_position  boolean not null default false,
  signal_ts    timestamptz,
  strategy_id  text,
  uploaded_at  timestamptz not null default now(),
  unique (symbol, strategy_id)
);
alter table public.forward_signals enable row level security;
create policy "Service role full access on forward_signals" on public.forward_signals
  using (true) with check (true);

-- ── Brain Graph Snapshot ──────────────────────────────────────────────────────
create table if not exists public.brain_nodes (
  id          text primary key,                      -- slugified note name
  label       text not null,
  folder      text not null default '',
  file_type   text,
  preview     text not null default '',
  degree      int not null default 0,
  community   int,
  x           double precision not null default 0,
  y           double precision not null default 0,
  snapshot_at timestamptz not null default now()
);
alter table public.brain_nodes enable row level security;
create policy "Public read on brain_nodes" on public.brain_nodes
  for select using (true);
GRANT ALL ON public.brain_nodes TO service_role;

create table if not exists public.brain_links (
  id          bigint generated always as identity primary key,
  source      text not null references public.brain_nodes(id) on delete cascade,
  target      text not null references public.brain_nodes(id) on delete cascade,
  snapshot_at timestamptz not null default now()
);
alter table public.brain_links enable row level security;
create policy "Public read on brain_links" on public.brain_links
  for select using (true);
GRANT ALL ON public.brain_links TO service_role;
GRANT USAGE ON SEQUENCE public.brain_links_id_seq TO service_role;

-- ── Monitoring OHLC Cache ────────────────────────────────────────────────────
-- Mirrors public/generated/monitoring/tradingview_data_cache/**/*.json for Vercel
create table if not exists public.monitoring_ohlc (
  id          bigint generated always as identity primary key,
  asset       text not null,       -- matches manifest "asset" field, e.g. "CC1!", "SPY"
  timeframe   text not null,       -- "D", "1H", "30M", etc.
  date        text not null,       -- ISO YYYY-MM-DD
  open        numeric(18, 6),
  high        numeric(18, 6),
  low         numeric(18, 6),
  close       numeric(18, 6),
  volume      numeric(18, 2),
  uploaded_at timestamptz not null default now(),
  unique (asset, timeframe, date)
);
alter table public.monitoring_ohlc enable row level security;
create policy "Public read on monitoring_ohlc" on public.monitoring_ohlc
  for select using (true);
create policy "Service role write on monitoring_ohlc" on public.monitoring_ohlc
  using (true) with check (true);
GRANT ALL ON public.monitoring_ohlc TO service_role;

-- ── Invest Portfolio OHLC ─────────────────────────────────────────────────────
create table if not exists public.invest_ohlc (
  id          bigint generated always as identity primary key,
  symbol      text not null,
  date        text not null,                            -- ISO YYYY-MM-DD
  open        numeric(18, 6),
  high        numeric(18, 6),
  low         numeric(18, 6),
  close       numeric(18, 6),
  volume      numeric(18, 2),
  uploaded_at timestamptz not null default now(),
  unique (symbol, date)
);
alter table public.invest_ohlc enable row level security;
create policy "Public read on invest_ohlc" on public.invest_ohlc
  for select using (true);
create policy "Service role write on invest_ohlc" on public.invest_ohlc
  using (true) with check (true);

-- ── Dashboard Snapshot ───────────────────────────────────────────────────────
-- Single-row JSONB store for 09_AI/dashboard_snapshot.json
create table if not exists public.dashboard_snapshot (
  key          text primary key,             -- always "latest"
  data         jsonb not null,
  generated_at timestamptz,
  uploaded_at  timestamptz not null default now()
);
alter table public.dashboard_snapshot enable row level security;
create policy "Public read on dashboard_snapshot" on public.dashboard_snapshot
  for select using (true);
create policy "Service role write on dashboard_snapshot" on public.dashboard_snapshot
  using (true) with check (true);
GRANT ALL ON public.dashboard_snapshot TO service_role;

-- ── Investors CRM ─────────────────────────────────────────────────────────────
create table if not exists public.investors_crm (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  unternehmen       text,
  email             text,
  telefon           text,
  kontaktquelle     text,
  kapitalrahmen     text,
  verfuegbar_ab     date,
  status            text not null default 'Neu',
  letzter_kontakt   date,
  naechster_schritt text,
  zustaendig        text,
  notizen           text,
  created_at        timestamptz not null default now()
);
alter table public.investors_crm enable row level security;
create policy "Service role full access on investors_crm" on public.investors_crm
  using (true) with check (true);
grant all on public.investors_crm to service_role;

-- ── Wave1 Group Data ─────────────────────────────────────────────────────────
-- Monitoring wave1 group snapshots (manifest + signals + cards + statuses, no charts)
create table if not exists public.wave1_groups (
  group_id     text primary key,           -- "agrar" | "intraday" | "indices"
  manifest     jsonb,
  signals      jsonb,
  statuses     jsonb,
  cards        jsonb,
  generated_at timestamptz,
  uploaded_at  timestamptz not null default now()
);
alter table public.wave1_groups enable row level security;
create policy "Public read on wave1_groups" on public.wave1_groups
  for select using (true);
create policy "Service role write on wave1_groups" on public.wave1_groups
  using (true) with check (true);
GRANT ALL ON public.wave1_groups TO service_role;

-- ── Strategy Registry ─────────────────────────────────────────────────────────
create table if not exists public.strategy_sleeves (
  sleeve          text primary key,
  active_version  text,
  assets          text,
  status          text,
  weighting       text,
  oos_period      text,
  cagr_pct        numeric(8, 4),
  total_return_pct numeric(10, 4),
  max_dd_pct      numeric(8, 4),
  sharpe          numeric(8, 4),
  calmar          numeric(8, 4),
  profit_factor   numeric(8, 4),
  trades          int,
  positive_years_pct numeric(6, 2),
  snapshot_at     timestamptz not null default now()
);
alter table public.strategy_sleeves enable row level security;
create policy "Public read on strategy_sleeves" on public.strategy_sleeves
  for select using (true);
create policy "Service role write on strategy_sleeves" on public.strategy_sleeves
  using (true) with check (true);

create table if not exists public.strategy_entries (
  strategy_id       text primary key,
  sleeve            text,
  asset             text,
  name              text,
  symbol            text,
  timeframe         text,
  strategy_type     text,
  direction         text,
  status            text,
  active            boolean,
  version           text,
  oos_period        text,
  oos_cagr_pct      numeric(8, 4),
  oos_total_return_pct numeric(10, 4),
  oos_max_dd_pct    numeric(8, 4),
  oos_sharpe        numeric(8, 4),
  oos_calmar        numeric(8, 4),
  oos_profit_factor numeric(8, 4),
  oos_trades        int,
  oos_positive_years_pct numeric(6, 2),
  params            jsonb not null default '{}',
  snapshot_at       timestamptz not null default now()
);
alter table public.strategy_entries enable row level security;
create policy "Public read on strategy_entries" on public.strategy_entries
  for select using (true);
create policy "Service role write on strategy_entries" on public.strategy_entries
  using (true) with check (true);

-- ── Live Quotes ───────────────────────────────────────────────────────────────
-- One row per symbol, upserted every 5 seconds by tools/live-feed/tv_live_feed.py
create table if not exists public.live_quotes (
  symbol      text        primary key,
  open        numeric     not null,
  high        numeric     not null,
  low         numeric     not null,
  close       numeric     not null,
  volume      numeric     not null default 0,
  timestamp   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.live_quotes enable row level security;

-- Anon/authenticated may read (for /api/live-quotes polling)
create policy "live_quotes_read" on public.live_quotes
  for select to authenticated, anon using (true);

-- Service role may upsert (from tv_live_feed.py)
create policy "live_quotes_service_upsert" on public.live_quotes
  for all to service_role using (true) with check (true);

create index if not exists live_quotes_updated_at_idx
  on public.live_quotes (updated_at desc);

-- OHLC quality events retain the original and corrected values for every repair.
create table if not exists public.ohlc_quality_events (
  id            bigint generated always as identity primary key,
  event_hash    text not null unique,
  asset         text not null,
  timeframe     text not null,
  period_utc    text not null,
  severity      text not null,
  quality_flag  text not null,
  repair_method text not null,
  original_bar  jsonb not null,
  corrected_bar jsonb,
  detected_at   timestamptz not null default now()
);
alter table public.ohlc_quality_events enable row level security;
create policy "Service role access on ohlc_quality_events" on public.ohlc_quality_events
  using (true) with check (true);
GRANT ALL ON public.ohlc_quality_events TO service_role;
create index if not exists ohlc_quality_events_asset_period_idx
  on public.ohlc_quality_events (asset, timeframe, period_utc desc);

-- Track Record Raw Snapshots
create table if not exists public.track_record_raw_snapshots (
  id                   bigint generated always as identity primary key,
  source               text not null,
  provider             text not null,
  account_or_darwin_id text not null,
  fetched_at_utc       timestamptz not null,
  api_version          text,
  payload_hash         text not null,
  payload              jsonb not null,
  inserted_at          timestamptz not null default now(),
  unique (source, provider, account_or_darwin_id, payload_hash)
);
alter table public.track_record_raw_snapshots enable row level security;
create policy "Service role write on track_record_raw_snapshots" on public.track_record_raw_snapshots
  to service_role using (true) with check (true);
GRANT ALL ON public.track_record_raw_snapshots TO service_role;

-- Track Record Accounts
create table if not exists public.accounts (
  id                    bigint generated always as identity primary key,
  source                text not null,
  provider              text not null,
  provider_account_id   text not null,
  account_label         text,
  broker                text,
  broker_timezone       text,
  currency              text,
  account_number_masked text,
  darwin_ticker         text,
  is_demo               boolean,
  first_seen_at_utc     timestamptz not null,
  last_seen_at_utc      timestamptz not null,
  unique (source, provider, provider_account_id)
);
alter table public.accounts enable row level security;
create policy "Service role write on accounts" on public.accounts
  to service_role using (true) with check (true);
GRANT ALL ON public.accounts TO service_role;

-- Track Record Daily Equity
create table if not exists public.daily_equity (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  date_utc            date not null,
  equity              numeric(18, 6),
  balance             numeric(18, 6),
  floating_pl         numeric(18, 6),
  broker_local_date   text,
  broker_timezone     text,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, date_utc)
);
alter table public.daily_equity enable row level security;
create policy "Service role write on daily_equity" on public.daily_equity
  to service_role using (true) with check (true);
GRANT ALL ON public.daily_equity TO service_role;

-- Track Record Daily Returns
create table if not exists public.daily_returns (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  date_utc            date not null,
  return_pct          numeric(12, 6),
  profit              numeric(18, 6),
  broker_local_date   text,
  broker_timezone     text,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, date_utc)
);
alter table public.daily_returns enable row level security;
create policy "Service role write on daily_returns" on public.daily_returns
  to service_role using (true) with check (true);
GRANT ALL ON public.daily_returns TO service_role;

-- Track Record Monthly Returns
create table if not exists public.monthly_returns (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  month_utc           text not null check (month_utc ~ '^\d{4}-\d{2}$'),
  return_pct          numeric(12, 6) not null,
  source_document     text not null,
  calculation_version text not null,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, month_utc)
);
alter table public.monthly_returns enable row level security;
create policy "Service role write on monthly_returns" on public.monthly_returns
  to service_role using (true) with check (true);
GRANT ALL ON public.monthly_returns TO service_role;

-- Track Record Open Positions
create table if not exists public.open_positions (
  id                   bigint generated always as identity primary key,
  source               text not null,
  provider             text not null,
  provider_account_id  text not null,
  provider_position_id text not null,
  symbol               text,
  direction            text,
  opened_at_utc        timestamptz,
  opened_at_local      text,
  broker_timezone      text,
  size                 numeric(18, 6),
  size_unit            text,
  open_price           numeric(18, 8),
  current_price        numeric(18, 8),
  take_profit          numeric(18, 8),
  stop_loss            numeric(18, 8),
  profit               numeric(18, 6),
  pips                 numeric(18, 6),
  status               text not null default 'open',
  updated_at           timestamptz not null default now(),
  unique (source, provider, provider_account_id, provider_position_id)
);
alter table public.open_positions enable row level security;
create policy "Service role write on open_positions" on public.open_positions
  to service_role using (true) with check (true);
GRANT ALL ON public.open_positions TO service_role;

-- Track Record Open Orders (internal only)
create table if not exists public.open_orders (
  id                   bigint generated always as identity primary key,
  source               text not null,
  provider             text not null,
  provider_account_id  text not null,
  provider_order_id    text not null,
  symbol               text,
  direction            text,
  created_at_utc       timestamptz,
  created_at_local     text,
  broker_timezone      text,
  size                 numeric(18, 6),
  size_unit            text,
  order_price          numeric(18, 8),
  take_profit          numeric(18, 8),
  stop_loss            numeric(18, 8),
  status               text not null default 'pending',
  updated_at           timestamptz not null default now(),
  unique (source, provider, provider_account_id, provider_order_id)
);
alter table public.open_orders enable row level security;
create policy "Service role write on open_orders" on public.open_orders
  to service_role using (true) with check (true);
GRANT ALL ON public.open_orders TO service_role;

-- Track Record Closed Trades
create table if not exists public.closed_trades (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  stable_trade_id     text not null,
  provider_trade_id   text,
  symbol              text,
  direction           text,
  opened_at_utc       timestamptz,
  opened_at_local     text,
  closed_at_utc       timestamptz,
  closed_at_local     text,
  broker_timezone     text,
  size                numeric(18, 6),
  size_unit           text,
  open_price          numeric(18, 8),
  close_price         numeric(18, 8),
  take_profit         numeric(18, 8),
  stop_loss           numeric(18, 8),
  profit              numeric(18, 6),
  commission          numeric(18, 6),
  interest            numeric(18, 6),
  pips                numeric(18, 6),
  raw_payload_hash    text not null,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, stable_trade_id)
);
alter table public.closed_trades enable row level security;
create policy "Service role write on closed_trades" on public.closed_trades
  to service_role using (true) with check (true);
GRANT ALL ON public.closed_trades TO service_role;

-- Track Record Cashflows
create table if not exists public.cashflows (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  stable_cashflow_id  text not null,
  flow_type           text not null,
  amount              numeric(18, 6),
  currency            text,
  occurred_at_utc     timestamptz,
  occurred_at_local   text,
  broker_timezone     text,
  note                text,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, stable_cashflow_id)
);
alter table public.cashflows enable row level security;
create policy "Service role write on cashflows" on public.cashflows
  to service_role using (true) with check (true);
GRANT ALL ON public.cashflows TO service_role;

-- Track Record Metrics
create table if not exists public.track_record_metrics (
  id                  bigint generated always as identity primary key,
  source              text not null,
  provider            text not null,
  provider_account_id text not null,
  metric_scope        text not null,
  metric_name         text not null,
  metric_value        jsonb,
  metric_date_utc     timestamptz,
  as_of_utc           timestamptz not null,
  is_verified         boolean not null default false,
  calculation_source  text not null,
  inserted_at         timestamptz not null default now(),
  unique (source, provider, provider_account_id, metric_scope, metric_name, as_of_utc)
);
alter table public.track_record_metrics enable row level security;
create policy "Service role write on track_record_metrics" on public.track_record_metrics
  to service_role using (true) with check (true);
GRANT ALL ON public.track_record_metrics TO service_role;

-- Track Record Source Sync Status
create table if not exists public.source_sync_status (
  source               text not null,
  provider             text not null,
  provider_account_id  text not null,
  last_attempt_at_utc  timestamptz,
  last_success_at_utc  timestamptz,
  stale_after_utc      timestamptz,
  health               text not null,
  message              text,
  requests_used        int not null default 0,
  mode                 text not null default 'mock',
  updated_at           timestamptz not null default now(),
  primary key (source, provider, provider_account_id)
);
alter table public.source_sync_status enable row level security;
create policy "Service role write on source_sync_status" on public.source_sync_status
  to service_role using (true) with check (true);
GRANT ALL ON public.source_sync_status TO service_role;

create index if not exists track_record_raw_snapshots_fetched_idx
  on public.track_record_raw_snapshots (fetched_at_utc desc);
create index if not exists daily_equity_account_date_idx
  on public.daily_equity (provider_account_id, date_utc desc);
create index if not exists daily_returns_account_date_idx
  on public.daily_returns (provider_account_id, date_utc desc);
create index if not exists monthly_returns_account_month_idx
  on public.monthly_returns (provider_account_id, month_utc desc);
create index if not exists track_record_metrics_asof_idx
  on public.track_record_metrics (provider_account_id, as_of_utc desc);
