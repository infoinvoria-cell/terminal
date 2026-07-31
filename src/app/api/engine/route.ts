import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

const STRATEGY_TICKERS: Record<string, string> = {
  EUR_30M: "EURUSD=X",
  DAX_1H: "^GDAXI",
  DAX_2H: "^GDAXI",
  GC_FRI: "GC=F",
  GLD_THU: "GLD",
  YM_TAT: "YM=F",
};

const STRATEGY_MODULE: Record<string, string> = {
  EUR_30M: "intraday_eur_30m",
  DAX_1H: "intraday_dax_1h",
  DAX_2H: "intraday_dax_2h",
  GC_FRI: "anomaly_gc_friday",
  GLD_THU: "anomaly_gld_thursday",
  YM_TAT: "anomaly_ym_tat",
};

function runPython(script: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: process.cwd() },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => { proc.kill(); reject(new Error("Python timeout")); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`));
      else resolve(stdout);
    });
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, strategy, start_date, end_date } = body as Record<string, string>;
  const mod = STRATEGY_MODULE[strategy];
  if (!mod) return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });

  const cwd = process.cwd().replace(/\\/g, "\\\\");

  // ── Backtest ───────────────────────────────────────────────────────────────
  if (action === "backtest") {
    const start = start_date ?? "2019-01-01";
    const end = end_date ?? "";
    const script = `
import sys, json
sys.path.insert(0, r"${cwd}")
from engine.backtest.strategies.${mod} import run
from engine.backtest.metrics import sharpe_ratio, max_drawdown, cagr, calmar_ratio
import pandas as pd, numpy as np

result = run(start="${start}", end=${end ? `"${end}"` : "None"})
equity = result.get("equity")
trades = result.get("trades", [])

if equity is None or len(equity) < 2:
    print(json.dumps({"error": "No equity curve returned"})); sys.exit(0)

returns = equity.pct_change().dropna()
_cagr = cagr(equity)
_mdd  = max_drawdown(equity)
wins  = [t for t in trades if t.get("win")]
losses = [t for t in trades if not t.get("win")]
total = len(trades) or 1

win_pnls  = [t["pnl_pct"] for t in wins]
loss_pnls = [t["pnl_pct"] for t in losses]
gross_profit = sum(p for p in win_pnls if p > 0) if win_pnls else 0
gross_loss   = abs(sum(p for p in loss_pnls if p < 0)) if loss_pnls else 0
profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 99.0
avg_win   = round(sum(win_pnls)  / len(win_pnls)  * 100, 3) if win_pnls  else 0.0
avg_loss  = round(sum(loss_pnls) / len(loss_pnls) * 100, 3) if loss_pnls else 0.0
best_trade  = round(max(t["pnl_pct"] for t in trades) * 100, 3) if trades else 0.0
worst_trade = round(min(t["pnl_pct"] for t in trades) * 100, 3) if trades else 0.0

rolling_max = equity.cummax()
drawdown_series = ((equity - rolling_max) / rolling_max * 100).tolist()

print(json.dumps({
    "metrics": {
        "cagr":         round(_cagr * 100, 2),
        "sharpe":       round(sharpe_ratio(returns), 2),
        "maxDD":        round(_mdd * 100, 2),
        "calmar":       round(calmar_ratio(_cagr, _mdd), 2),
        "trades":       len(trades),
        "winRate":      round(len(wins) / total * 100, 1),
        "profitFactor": profit_factor,
        "avgWin":       avg_win,
        "avgLoss":      avg_loss,
        "bestTrade":    best_trade,
        "worstTrade":   worst_trade,
    },
    "equity":   [round(float(v), 2) for v in equity.tolist()],
    "drawdown": [round(float(v), 3) for v in drawdown_series],
    "trades":   trades[:300],
}))
`;
    try {
      const raw = await runPython(script);
      return NextResponse.json(JSON.parse(raw.trim()));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // ── Signal (extended with EMA values + last cross) ─────────────────────────
  if (action === "signal") {
    const ticker = STRATEGY_TICKERS[strategy] ?? "";
    const script = `
import sys, json
sys.path.insert(0, r"${cwd}")
from engine.backtest.strategies.${mod} import get_signal, get_params
import yfinance as yf, pandas as pd

df = yf.download("${ticker}", period="6mo", auto_adjust=True, progress=False)
if df.empty:
    print(json.dumps({"direction": "flat", "entry": 0, "sl": 0, "tp": 0})); sys.exit(0)

df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
df = df[["open","high","low","close","volume"]].dropna()

sig = get_signal(df)
params = get_params()
result = {k: (round(float(v), 6) if isinstance(v, float) else v) for k, v in sig.items()}

fast_p = params.get("ema_fast") or params.get("ema_period")
slow_p = params.get("ema_slow")

if fast_p:
    ema_fast = df["close"].ewm(span=int(fast_p), adjust=False).mean()
    result["ema_fast_val"] = round(float(ema_fast.iloc[-1]), 6)
    if slow_p:
        ema_slow = df["close"].ewm(span=int(slow_p), adjust=False).mean()
        result["ema_slow_val"] = round(float(ema_slow.iloc[-1]), 6)
        above = ema_fast > ema_slow
        crossed = above != above.shift(1)
        cross_idx = crossed[crossed].index
        if len(cross_idx) > 0:
            last = cross_idx[-1]
            loc = df.index.get_loc(last)
            result["last_cross_bars"] = int(len(df) - loc - 1)
            result["last_cross_date"] = str(last)[:10]

print(json.dumps(result))
`;
    try {
      const raw = await runPython(script, 30_000);
      return NextResponse.json(JSON.parse(raw.trim()));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // ── Trades (markers for chart overlay) ────────────────────────────────────
  if (action === "trades") {
    const start = start_date ?? "2019-01-01";
    const end = end_date ?? "";
    const ticker = STRATEGY_TICKERS[strategy] ?? "";
    const script = `
import sys, json
sys.path.insert(0, r"${cwd}")
from engine.backtest.strategies.${mod} import run
import yfinance as yf, pandas as pd

result = run(start="${start}", end=${end ? `"${end}"` : "None"})
trades = result.get("trades", [])

df_dates = yf.download("${ticker}", start="${start}", end=${end ? `"${end}"` : "None"}, progress=False, auto_adjust=True)
dates = [str(d)[:10] for d in df_dates.index.tolist()]

markers = []
eq_idx = 0
for i, t in enumerate(trades):
    date_idx = min(i * max(1, len(dates) // max(len(trades), 1)), len(dates) - 1)
    entry_date = dates[date_idx] if dates else ""
    exit_date  = dates[min(date_idx + 1, len(dates) - 1)] if dates else ""
    markers.append({
        "entry_date": entry_date,
        "exit_date":  exit_date,
        "type":       "long" if t.get("direction", "long") != "short" else "short",
        "entry":      round(float(t.get("entry", 0)), 6),
        "exit":       round(float(t.get("exit",  t.get("entry", 0))), 6),
        "win":        bool(t.get("win")),
        "pnl_pct":    round(float(t.get("pnl_pct", 0)) * 100, 3),
    })

print(json.dumps({"markers": markers}))
`;
    try {
      const raw = await runPython(script);
      return NextResponse.json(JSON.parse(raw.trim()));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
