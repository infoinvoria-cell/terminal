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
  uploaded_at  timestamptz not null default now()
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
  uploaded_at  timestamptz not null default now()
);
alter table public.forward_trades enable row level security;
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

create table if not exists public.brain_links (
  id          bigint generated always as identity primary key,
  source      text not null references public.brain_nodes(id) on delete cascade,
  target      text not null references public.brain_nodes(id) on delete cascade,
  snapshot_at timestamptz not null default now()
);
alter table public.brain_links enable row level security;
create policy "Public read on brain_links" on public.brain_links
  for select using (true);
