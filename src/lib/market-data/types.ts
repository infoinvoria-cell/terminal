export type TradingViewBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  symbol?: string;
  exchange?: string;
  interval?: string;
  source?: string;
  fetched_at?: string;
};

export type TradingViewLatestBar = {
  symbol: string;
  exchange: string | null;
  interval: string;
  source: string;
  mode: "delayed_near_live" | "unavailable";
  fetched_at: string | null;
  bar_time: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  status: "ok" | "stale" | "error" | "missing";
  previous_close?: number | null;
  change?: number | null;
  change_pct?: number | null;
};

export type TradingViewHistoryPayload = {
  symbol: string;
  exchange: string | null;
  interval: string;
  source: string;
  fetched_at: string | null;
  auth_mode?: "login" | "nologin" | "unavailable";
  bars: TradingViewBar[];
};

export type TradingViewIntervalStatus = {
  symbol: string;
  exchange: string | null;
  interval: string;
  rows: number;
  first_date: string | null;
  last_date: string | null;
  fetched_at: string | null;
  auth_mode: "login" | "nologin" | "unavailable";
  status: "ok" | "stale" | "missing" | "error";
  error: string | null;
  path: string | null;
};

export type TradingViewSymbolStatus = {
  status: "ok" | "stale" | "missing" | "error";
  error: string | null;
  intervals: Record<string, TradingViewIntervalStatus>;
  last_bar_time?: string | null;
  last_fetch?: string | null;
  rows_1m?: number;
  rows_1D?: number;
};

export type TradingViewManifest = {
  source: string;
  package: string;
  auth_mode: "login" | "nologin" | "unavailable";
  cache_dir: string;
  updated_at: string | null;
  poll_seconds?: number;
  stale_after_seconds?: number;
  warning: string | null;
  symbols: Record<string, TradingViewSymbolStatus>;
};

export type TradingViewStatusFile = {
  source: string;
  auth_mode: "login" | "nologin" | "unavailable";
  cache_dir: string;
  updated_at: string | null;
  poll_seconds: number;
  stale_after_seconds: number;
  overall_status: "ok" | "stale" | "error" | "missing";
  warning: string | null;
  symbols: Record<string, TradingViewSymbolStatus>;
};

export type MarketDataStatus = {
  cacheAvailable: boolean;
  manifestPath: string | null;
  statusPath?: string | null;
  cacheDir?: string;
  updatedAt: string | null;
  authMode: "login" | "nologin" | "unavailable";
  pollSeconds?: number;
  staleAfterSeconds?: number;
  overallStatus?: "ok" | "stale" | "error" | "missing";
  warning: string | null;
  symbols: Record<string, TradingViewSymbolStatus>;
};
