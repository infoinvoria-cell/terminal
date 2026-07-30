begin;

create table if not exists public.track_record_raw_snapshots (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  account_or_darwin_id text not null,
  fetched_at_utc timestamptz not null,
  api_version text,
  payload_hash text not null,
  payload jsonb not null,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_raw_snapshots_identity_idx
  on public.track_record_raw_snapshots (source, provider, account_or_darwin_id, payload_hash);

create table if not exists public.accounts (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  account_label text,
  broker text,
  broker_timezone text,
  currency text,
  account_number_masked text,
  darwin_ticker text,
  is_demo boolean,
  first_seen_at_utc timestamptz not null,
  last_seen_at_utc timestamptz not null
);
create unique index if not exists track_record_accounts_identity_idx
  on public.accounts (source, provider, provider_account_id);

create table if not exists public.daily_equity (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  date_utc date not null,
  equity numeric(18, 6),
  balance numeric(18, 6),
  floating_pl numeric(18, 6),
  broker_local_date text,
  broker_timezone text,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_daily_equity_identity_idx
  on public.daily_equity (source, provider, provider_account_id, date_utc);

create table if not exists public.daily_returns (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  date_utc date not null,
  return_pct numeric(12, 6),
  profit numeric(18, 6),
  broker_local_date text,
  broker_timezone text,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_daily_returns_identity_idx
  on public.daily_returns (source, provider, provider_account_id, date_utc);

create table if not exists public.monthly_returns (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  month_utc text not null check (month_utc ~ '^\d{4}-\d{2}$'),
  return_pct numeric(12, 6) not null,
  source_document text not null,
  calculation_version text not null,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_monthly_returns_identity_idx
  on public.monthly_returns (source, provider, provider_account_id, month_utc);

create table if not exists public.open_positions (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  provider_position_id text not null,
  symbol text,
  direction text,
  opened_at_utc timestamptz,
  opened_at_local text,
  broker_timezone text,
  size numeric(18, 6),
  size_unit text,
  open_price numeric(18, 8),
  current_price numeric(18, 8),
  take_profit numeric(18, 8),
  stop_loss numeric(18, 8),
  profit numeric(18, 6),
  pips numeric(18, 6),
  status text not null default 'open',
  updated_at timestamptz not null default now()
);
create unique index if not exists track_record_open_positions_identity_idx
  on public.open_positions (source, provider, provider_account_id, provider_position_id);

create table if not exists public.open_orders (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  provider_order_id text not null,
  symbol text,
  direction text,
  created_at_utc timestamptz,
  created_at_local text,
  broker_timezone text,
  size numeric(18, 6),
  size_unit text,
  order_price numeric(18, 8),
  take_profit numeric(18, 8),
  stop_loss numeric(18, 8),
  status text not null default 'pending',
  updated_at timestamptz not null default now()
);
create unique index if not exists track_record_open_orders_identity_idx
  on public.open_orders (source, provider, provider_account_id, provider_order_id);

create table if not exists public.closed_trades (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  stable_trade_id text not null,
  provider_trade_id text,
  symbol text,
  direction text,
  opened_at_utc timestamptz,
  opened_at_local text,
  closed_at_utc timestamptz,
  closed_at_local text,
  broker_timezone text,
  size numeric(18, 6),
  size_unit text,
  open_price numeric(18, 8),
  close_price numeric(18, 8),
  take_profit numeric(18, 8),
  stop_loss numeric(18, 8),
  profit numeric(18, 6),
  commission numeric(18, 6),
  interest numeric(18, 6),
  pips numeric(18, 6),
  raw_payload_hash text not null,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_closed_trades_identity_idx
  on public.closed_trades (source, provider, provider_account_id, stable_trade_id);

create table if not exists public.cashflows (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  stable_cashflow_id text not null,
  flow_type text not null,
  amount numeric(18, 6),
  currency text,
  occurred_at_utc timestamptz,
  occurred_at_local text,
  broker_timezone text,
  note text,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_cashflows_identity_idx
  on public.cashflows (source, provider, provider_account_id, stable_cashflow_id);

create table if not exists public.track_record_metrics (
  id bigint generated always as identity primary key,
  source text not null,
  provider text not null,
  provider_account_id text not null,
  metric_scope text not null,
  metric_name text not null,
  metric_value jsonb,
  metric_date_utc timestamptz,
  as_of_utc timestamptz not null,
  is_verified boolean not null default false,
  calculation_source text not null,
  inserted_at timestamptz not null default now()
);
create unique index if not exists track_record_metrics_identity_idx
  on public.track_record_metrics (source, provider, provider_account_id, metric_scope, metric_name, as_of_utc);

create table if not exists public.source_sync_status (
  source text not null,
  provider text not null,
  provider_account_id text not null,
  last_attempt_at_utc timestamptz,
  last_success_at_utc timestamptz,
  stale_after_utc timestamptz,
  health text not null,
  message text,
  requests_used int not null default 0,
  mode text not null default 'mock',
  updated_at timestamptz not null default now(),
  primary key (source, provider, provider_account_id)
);

create table if not exists public.ohlc_quality_events (
  id bigint generated always as identity primary key,
  event_hash text not null,
  asset text not null,
  timeframe text not null,
  period_utc text not null,
  severity text not null,
  quality_flag text not null,
  repair_method text not null,
  original_bar jsonb not null,
  corrected_bar jsonb,
  detected_at timestamptz not null default now()
);
create unique index if not exists ohlc_quality_events_hash_idx
  on public.ohlc_quality_events (event_hash);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'track_record_raw_snapshots', 'accounts', 'daily_equity', 'daily_returns',
    'monthly_returns', 'open_positions', 'open_orders', 'closed_trades',
    'cashflows', 'track_record_metrics', 'source_sync_status', 'ohlc_quality_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
    execute format('grant all on table public.%I to service_role', target_table);
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'Track record service role only'
    ) then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true)',
        'Track record service role only',
        target_table
      );
    end if;
  end loop;
end
$$;

grant usage, select on all sequences in schema public to service_role;

drop policy if exists "Public read on accounts" on public.accounts;
drop policy if exists "Public read on daily_equity" on public.daily_equity;
drop policy if exists "Public read on daily_returns" on public.daily_returns;
drop policy if exists "Public read on monthly_returns" on public.monthly_returns;
drop policy if exists "Public read on track_record_metrics" on public.track_record_metrics;
drop policy if exists "Public read on source_sync_status" on public.source_sync_status;

commit;
