import type { AnalyticsDataset } from "@/lib/analytics/portfolio-data";
// Committed, self-contained QQQ-Pine backtest (daily equity curve 1999–2026).
// Importing (not fs-reading) guarantees the file is bundled into the serverless
// function on Vercel. We compact it here server-side so only small arrays reach
// the client via capalifeData.
import pineFile from "@/data/capitalife/fsportfolio/backtests/qqq-invest-pine-series.json";

type PineEquityPoint = {
  date: string;
  equity: number;
  cumulativeReturnPct: number;
  dailyReturnPct: number;
  drawdownPct: number;
  inMarket: boolean;
  signal: string;
};

type PineSummary = {
  firstDate: string;
  lastDate: string;
  dataPoints: number;
  tradeCount: number;
  winRatePct: number;
  profitFactor: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  currentSignal: string;
};

type PineFile = { summary: PineSummary; equity: PineEquityPoint[] };

const TRADING_DAYS = 252;
// Keep every Nth daily point for the drawn series (metrics use the full data).
const SERIES_STRIDE = 3;

function fmtPct(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/**
 * Build the Core-Invest backtest dataset from the committed Pine equity series.
 * Returns null only if the file is unexpectedly empty.
 */
export function buildCoreInvestPineBacktest(): AnalyticsDataset | null {
  const file = pineFile as unknown as PineFile;
  const equity = file?.equity;
  if (!Array.isArray(equity) || equity.length === 0) return null;
  const summary = file.summary;

  // ── Compact drawn series (downsampled) ──────────────────────────────────
  const performanceSeries: AnalyticsDataset["performanceSeries"] = [];
  const drawdownSeries: AnalyticsDataset["drawdownSeries"] = [];
  for (let i = 0; i < equity.length; i += 1) {
    const p = equity[i]!;
    const keep = i % SERIES_STRIDE === 0 || i === equity.length - 1;
    if (!keep) continue;
    performanceSeries.push({ date: p.date, value: Number(p.cumulativeReturnPct.toFixed(2)) });
    drawdownSeries.push({ date: p.date, value: Number(p.drawdownPct.toFixed(2)) });
  }

  // ── Aggregations + metrics from the FULL daily data ─────────────────────
  const yearComp = new Map<string, number>();   // year → compounded factor
  const monthComp = new Map<string, number>();  // YYYY-MM → compounded factor
  let sum = 0;
  let sumSq = 0;
  let downsideSq = 0;
  let n = 0;
  for (const p of equity) {
    const r = p.dailyReturnPct / 100;
    const year = p.date.slice(0, 4);
    const ym = p.date.slice(0, 7);
    yearComp.set(year, (yearComp.get(year) ?? 1) * (1 + r));
    monthComp.set(ym, (monthComp.get(ym) ?? 1) * (1 + r));
    sum += r;
    sumSq += r * r;
    if (r < 0) downsideSq += r * r;
    n += 1;
  }

  const mean = n ? sum / n : 0;
  const variance = n ? sumSq / n - mean * mean : 0;
  const std = Math.sqrt(Math.max(0, variance));
  const downsideStd = Math.sqrt(n ? downsideSq / n : 0);
  const annVolPct = std * Math.sqrt(TRADING_DAYS) * 100;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS) : 0;
  const sortino = downsideStd > 0 ? (mean / downsideStd) * Math.sqrt(TRADING_DAYS) : 0;

  const annualReturns: AnalyticsDataset["annualReturns"] = [...yearComp.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, factor]) => ({ label: year, value: Number(((factor - 1) * 100).toFixed(2)) }));

  // Monthly seasonality: average compounded month return per calendar month.
  const calMonthSums = new Array(12).fill(0);
  const calMonthCounts = new Array(12).fill(0);
  for (const [ym, factor] of monthComp.entries()) {
    const idx = Number(ym.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    calMonthSums[idx] += (factor - 1) * 100;
    calMonthCounts[idx] += 1;
  }
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyReturns: AnalyticsDataset["monthlyReturns"] = MONTH_LABELS.map((label, idx) => ({
    label,
    value: calMonthCounts[idx] ? Number((calMonthSums[idx] / calMonthCounts[idx]).toFixed(2)) : 0,
  }));

  const monthFactors = [...monthComp.values()];
  const posMonths = monthFactors.filter((f) => f > 1).length;
  const posMonthsPct = monthFactors.length ? (posMonths / monthFactors.length) * 100 : 0;
  const worstYear = annualReturns.reduce<AnalyticsDataset["annualReturns"][number] | null>(
    (worst, cur) => (worst == null || cur.value < worst.value ? cur : worst),
    null,
  );

  const maxDdPct = -Math.abs(summary?.maxDrawdownPct ?? 0);
  const cagrPct = summary?.cagrPct ?? 0;
  const calmar = maxDdPct !== 0 ? cagrPct / Math.abs(maxDdPct) : 0;

  return {
    tab: "invest",
    mode: "backtest",
    title: "Core Invest",
    sourceLabel: "QQQ Pine backtest series (1999–2026)",
    sourceFiles: ["qqq-invest-pine-series.json"],
    period: { start: summary?.firstDate ?? equity[0]!.date, end: summary?.lastDate ?? equity.at(-1)!.date },
    groups: [{ id: "Core Invest", label: "Core Invest v2.0", active: true, weight: 1 }],
    performanceSeries,
    drawdownSeries,
    benchmarkSeries: [],
    groupSeries: {},
    annualReturns,
    monthlyReturns,
    groupBars: [],
    strategyBars: [],
    metrics: {
      totalReturnPct: fmtPct(summary?.totalReturnPct ?? performanceSeries.at(-1)?.value ?? 0),
      cagrPct: fmtPct(cagrPct),
      maxDrawdownPct: fmtPct(maxDdPct),
      annualizedVolatilityPct: fmtPct(annVolPct),
      sharpe: sharpe.toFixed(2),
      sortino: sortino.toFixed(2),
      calmar: calmar.toFixed(2),
      positiveMonthsPct: `${posMonthsPct.toFixed(0)}%`,
      profitFactor: (summary?.profitFactor ?? 0).toFixed(2),
      winRatePct: `${(summary?.winRatePct ?? 0).toFixed(1)}%`,
      worstYear: worstYear ? `${worstYear.label} (${fmtPct(worstYear.value)})` : "n/a",
      betaToSpy: "n/a",
      correlationToSpy: "n/a",
      dataPoints: String(summary?.dataPoints ?? equity.length),
      tradeCount: String(summary?.tradeCount ?? 0),
      strategyCount: "QQQ Pine",
    },
    notes: ["Core Invest backtest from the committed QQQ Pine equity series (self-contained; no external OHLC needed)."],
  };
}
