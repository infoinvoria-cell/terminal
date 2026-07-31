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

export const engineClient = {
  getHealth:   ()                => get<EngineHealth>("/health"),
  getSignals:  ()                => get<Record<string, SignalData>>("/signals"),
  getSignal:   (s: string)       => get<SignalData>(`/signal/${s}`),
  getBacktest: (s: string, start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set("start", start);
    if (end)   q.set("end",   end);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return get<BacktestResult>(`/backtest/${s}${qs}`);
  },
  getTrades:   (s: string)       => get<{ trades: TradeRecord[] }>(`/trades/${s}`),
  getPositions: ()               => get<{ positions: unknown[] }>("/positions"),
  getAccount:  ()                => get<{ account: unknown }>("/account"),
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EngineHealth {
  status:     "ok" | "error";
  lean:       "running" | "stopped";
  ibkr:       "connected" | "disconnected";
  paper_mode: boolean;
  timestamp:  string;
  error?:     string;
}

export interface SignalData {
  strategy?:       string;
  direction:       "long" | "short" | "flat";
  entry?:          number;
  sl?:             number;
  tp?:             number;
  ema_fast_val?:   number;
  ema_slow_val?:   number;
  last_cross_bars?: number;
  last_cross_date?: string;
  timestamp?:      string;
  error?:          string;
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
  metrics:  BacktestMetrics;
  equity:   number[];
  drawdown: number[];
  trades:   TradeRecord[];
  source?:  string;
  bars?:    number;
  error?:   string;
}

export interface TradeRecord {
  dir?:        string;
  direction?:  string;
  entry:       number;
  exit?:       number;
  win:         boolean;
  pnl_pct:     number;
  equity:      number;
  entry_date?: string;
  exit_date?:  string;
}
