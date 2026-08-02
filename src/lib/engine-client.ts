"use client";

const ENGINE_URL =
  (typeof window !== "undefined" && process.env.NEXT_PUBLIC_ENGINE_URL) ||
  process.env.NEXT_PUBLIC_ENGINE_URL ||
  "http://localhost:5000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Engine ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Engine ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const engineClient = {
  getHealth:    ()                       => get<EngineHealth>("/health"),
  getSignals:   ()                       => get<Record<string, SignalData>>("/signals"),
  getSignal:    (s: string)              => get<SignalData>(`/signal/${s}`),
  postBacktest: (body: BacktestRequest)  => post<BacktestResult>("/backtest", body),
  getTrades:    (s: string)              => get<{ trades: TradeRecord[] }>(`/trades/${s}`),
  getPositions: ()                       => get<{ positions: unknown[] }>("/positions"),
  getAccount:   ()                       => get<{ account: unknown }>("/account"),
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestRequest {
  strategy:   string;
  asset_type: string;
  params:     Record<string, number | string>;
  start_date: string;
  end_date:   string;
}

export interface EngineHealth {
  status:     "ok" | "error";
  lean:       "running" | "stopped";
  ibkr:       "connected" | "disconnected";
  paper_mode: boolean;
  timestamp:  string;
  error?:     string;
}

export interface SignalData {
  strategy?:        string;
  direction:        "long" | "short" | "flat";
  entry?:           number;
  sl?:              number;
  tp?:              number;
  atr?:             number;
  close?:           number;
  regime_active?:   boolean;
  ema_fast_val?:    number;
  ema_slow_val?:    number;
  last_cross_bars?: number;
  last_cross_date?: string;
  timestamp?:       string;
  error?:           string;
  status?:          string;
  parity?:          string;
  bt_trades?:       number;
  bt_sharpe?:       number;
  bt_pf?:           number;
  bt_win_rate?:     number;
}

export interface BacktestMetrics {
  cagr:         number;
  sharpe:       number;
  maxDD:        number;
  calmar:       number;
  trades:       number;
  winRate:      number;
  profitFactor: number;
  avgWin:       number;
  avgLoss:      number;
  bestTrade:    number;
  worstTrade:   number;
}

export interface BacktestResult {
  metrics:       BacktestMetrics;
  equity:        number[];
  equity_dates?: string[];
  drawdown:      number[];
  buy_hold?:     number[];
  trades:        TradeRecord[];
  source?:       string;
  bars?:         number;
  error?:        string;
}

export interface TradeRecord {
  dir?:        string;
  direction?:  string;
  entry:       number;
  exit?:       number;
  win:         boolean;
  pnl_pct:     number;
  pnl_pips?:   number;
  equity?:     number;
  entry_date?: string;
  exit_date?:  string;
}
