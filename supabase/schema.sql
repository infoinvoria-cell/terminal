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
