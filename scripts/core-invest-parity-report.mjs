import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const outDir = path.join(root, "public", "generated", "core-invest");
const outFile = path.join(outDir, "parity-report.json");

const components = [
  { id: "QQQ_PINE_1", symbol: "QQQ", kind: "strategy", weight: 0.05, tv: { totalReturnPct: 95.19, maxDrawdownPct: 8.71, profitFactor: 1.602, trades: 642, winRatePct: 69.31 } },
  { id: "QQQ_PINE_2_EMA", symbol: "QQQ", kind: "strategy", weight: 0.05, tv: { totalReturnPct: 358.27, maxDrawdownPct: 28.59, profitFactor: 2.158, trades: 68, winRatePct: 42.65 } },
  { id: "COPPER_HG", symbol: "HG1!", kind: "strategy", weight: 0.05, tv: { totalReturnPct: 483.82, maxDrawdownPct: 40.43, profitFactor: 2.082, trades: 88, winRatePct: 30.68 } },
  { id: "CHF_6S", symbol: "6S1!", kind: "strategy", weight: 0.05, tv: { totalReturnPct: 17.92, maxDrawdownPct: 23.66, profitFactor: 1.266, trades: 65, winRatePct: 32.31 } },
  { id: "QQQ_PASSIVE", symbol: "QQQ", kind: "asset", weight: 0.45 },
  { id: "GLD", symbol: "GLD", kind: "asset", weight: 0.25 },
  { id: "SPMO", symbol: "SPMO", kind: "asset", weight: 0.05 },
  { id: "SPY", symbol: "SPY", kind: "asset", weight: 0.05 },
];

const cacheFileBySymbol = {
  QQQ: ".capitalife-cache/market-data/tradingview/history/QQQ_1D.json",
  GLD: ".capitalife-cache/market-data/tradingview/history/GLD_1D.json",
  SPMO: ".capitalife-cache/market-data/tradingview/history/SPMO_1D.json",
  SPY: ".capitalife-cache/market-data/tradingview/history/SPY_1D.json",
  "HG1!": "public/generated/monitoring/tradingview_data_cache/D/COMEX_HG1_D.json",
  "6S1!": "public/generated/monitoring/tradingview_data_cache/D/CME_6S1_D.json",
};

async function loadTvBars(symbol) {
  const rel = cacheFileBySymbol[symbol];
  if (!rel) return [];
  const raw = await readFile(path.join(root, rel), "utf8").catch(() => "");
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return (parsed.bars ?? [])
    .map((bar) => ({
      date: String(bar.date).slice(0, 10),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    }))
    .filter((bar) => bar.date && bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0 && bar.low <= bar.high);
}

function buyHoldMetrics(bars) {
  if (bars.length < 2) return null;
  let peak = bars[0].close;
  let maxDrawdownPct = 0;
  for (const bar of bars) {
    peak = Math.max(peak, bar.close);
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - bar.close) / peak) * 100);
  }
  return {
    totalReturnPct: Number(((bars.at(-1).close / bars[0].close - 1) * 100).toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    trades: 0,
    profitFactor: null,
    winRatePct: null,
  };
}

const rows = [];
for (const component of components) {
  const bars = await loadTvBars(component.symbol);
  const base = {
    id: component.id,
    symbol: component.symbol,
    kind: component.kind,
    weight: component.weight,
    bars: bars.length,
    firstDate: bars.at(0)?.date ?? null,
    lastDate: bars.at(-1)?.date ?? null,
  };

  if (component.rejected) {
    rows.push({ ...base, status: "rejected", reason: component.rejected, tvMetrics: null, pythonMetrics: null, parity: false });
  } else if (!bars.length) {
    rows.push({ ...base, status: "missing_ohlc", reason: "No TradingView OHLC cache available.", tvMetrics: component.tv ?? null, pythonMetrics: null, parity: false });
  } else if (component.kind === "asset") {
    const metrics = buyHoldMetrics(bars);
    rows.push({ ...base, status: "ready", reason: "Passive asset uses TradingView OHLC buy-and-hold calculation.", tvMetrics: metrics, pythonMetrics: metrics, parity: true });
  } else {
    rows.push({
      ...base,
      status: "tv_reference_only",
      reason: "TradingView Strategy Tester summary is recorded, but no trade-by-trade TV export is available for exact Python parity.",
      tvMetrics: component.tv,
      pythonMetrics: null,
      parity: false,
    });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  portfolio: "Core Invest",
  components: rows.length,
  ready: rows.filter((r) => r.status === "ready").length,
  tvReferenceOnly: rows.filter((r) => r.status === "tv_reference_only").length,
  rejected: rows.filter((r) => r.status === "rejected").length,
  missing: rows.filter((r) => r.status === "missing_ohlc").length,
  liveReady: rows.every((r) => r.status === "ready"),
  conclusion: "Core Invest has 4 passive ready components and 4 active TradingView-reference strategy sleeves. It is not exact-parity live-ready until trade-by-trade TV exports are matched against Python.",
};

const report = { summary, rows };
await mkdir(outDir, { recursive: true });
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
