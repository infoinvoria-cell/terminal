import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

const ENGINE_ROOT = path.join(process.cwd(), "engine");

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

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Python timeout"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// POST /api/engine  — body determines action via "action" field
export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, strategy, asset_type, start_date, end_date } = body as Record<string, string>;
  const mod = STRATEGY_MODULE[strategy];

  if (!mod) {
    return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });
  }

  // ── Backtest ──────────────────────────────────────────────────────────────
  if (action === "backtest") {
    const start = start_date ?? "2019-01-01";
    const end = end_date ?? "";

    const script = `
import sys, json
sys.path.insert(0, r"${process.cwd().replace(/\\/g, "\\\\")}")
from engine.backtest.strategies.${mod} import run
from engine.backtest.metrics import sharpe_ratio, max_drawdown, cagr, calmar_ratio
import pandas as pd

result = run(start="${start}", end="${end || ""}" or None)
equity = result.get("equity")
trades = result.get("trades", [])

if equity is None or len(equity) < 2:
    print(json.dumps({"error": "No equity curve returned"}))
    sys.exit(0)

returns = equity.pct_change().dropna()
_cagr = cagr(equity)
_mdd  = max_drawdown(equity)
wins  = sum(1 for t in trades if t.get("win")) if trades else 0
total = len(trades) or 1

print(json.dumps({
    "metrics": {
        "cagr":     round(_cagr * 100, 2),
        "sharpe":   round(sharpe_ratio(returns), 2),
        "maxDD":    round(_mdd * 100, 2),
        "calmar":   round(calmar_ratio(_cagr, _mdd), 2),
        "trades":   len(trades),
        "winRate":  round(wins / total * 100, 1),
    },
    "equity": [round(float(v), 2) for v in equity.tolist()],
    "trades": trades[:200],
}))
`;

    try {
      const raw = await runPython(script);
      const data = JSON.parse(raw.trim());
      return NextResponse.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Signal ────────────────────────────────────────────────────────────────
  if (action === "signal") {
    const ticker = STRATEGY_TICKERS[strategy] ?? "";
    const script = `
import sys, json
sys.path.insert(0, r"${process.cwd().replace(/\\/g, "\\\\")}")
from engine.backtest.strategies.${mod} import get_signal
import yfinance as yf
import pandas as pd

df = yf.download("${ticker}", period="6mo", auto_adjust=True, progress=False)
if df.empty:
    print(json.dumps({"direction": "flat", "entry": 0, "sl": 0, "tp": 0}))
    sys.exit(0)

df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
df = df[["open","high","low","close","volume"]].dropna()
sig = get_signal(df)
print(json.dumps({k: (round(float(v), 6) if isinstance(v, float) else v) for k, v in sig.items()}))
`;

    try {
      const raw = await runPython(script, 30_000);
      const data = JSON.parse(raw.trim());
      return NextResponse.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
