import { readFileSync, existsSync } from "fs";
import { join } from "path";
// v2 — asset view uses per-asset price returns from canonical CSVs
import type { AnalyticsDataset, AnalyticsSeriesPoint, AnalyticsBar } from "./portfolio-data";

const DATA_DIR = join(process.cwd(), "data", "core-invest", "reference");

function readCsv(filename: string): string[][] {
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) return [];
  const text = readFileSync(filepath, "utf-8");
  return text
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}

function readJson<T>(filename: string): T | null {
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) return null;
  return JSON.parse(readFileSync(filepath, "utf-8")) as T;
}

type ResearchSummary = {
  full: Record<string, number>;
  spy: Record<string, number>;
  recent_2021_2026: Record<string, number>;
  rolling_5y: number;
  rolling_10y: number;
  current_plan: {
    portfolio: string;
    as_of: string;
    reference_nav: number;
    mode: string;
    etf_weights: Record<string, number>;
    futures: Record<string, number>;
    gross_long_exposure: number;
    risk_multiplier: number;
    long_exposure_cap: number;
  };
  gates: Array<[string, string, string]>;
};

type CurrentPlan = {
  portfolio: string;
  as_of: string;
  reference_nav: number;
  mode: string;
  etf_weights: Record<string, number>;
  cash_financing_weight: number;
  futures: Record<string, number>;
  gross_long_exposure: number;
  risk_multiplier: number;
  long_exposure_cap: number;
};

function parseEquityCurves(): {
  performance: AnalyticsSeriesPoint[];
  grossPerformance: AnalyticsSeriesPoint[];
  benchmark: AnalyticsSeriesPoint[];
  drawdown: AnalyticsSeriesPoint[];
  grossDrawdown: AnalyticsSeriesPoint[];
  benchmarkDrawdown: AnalyticsSeriesPoint[];
} {
  const rows = readCsv("daily_equity_curves.csv");
  if (rows.length < 2)
    return {
      performance: [],
      grossPerformance: [],
      benchmark: [],
      drawdown: [],
      grossDrawdown: [],
      benchmarkDrawdown: [],
    };

  const performance: AnalyticsSeriesPoint[] = [];
  const grossPerformance: AnalyticsSeriesPoint[] = [];
  const benchmark: AnalyticsSeriesPoint[] = [];
  const drawdown: AnalyticsSeriesPoint[] = [];
  const grossDrawdown: AnalyticsSeriesPoint[] = [];
  const benchmarkDrawdown: AnalyticsSeriesPoint[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10) continue;
    const date = row[0];
    const coreNetIndex = parseFloat(row[5]);
    const coreGrossIndex = parseFloat(row[4]);
    const spyIndex = parseFloat(row[6]);
    const coreNetDD = parseFloat(row[8]);
    const coreGrossDD = parseFloat(row[7]);
    const spyDD = parseFloat(row[9]);

    if (i % 3 === 0 || i === 1 || i === rows.length - 1) {
      performance.push({ date, value: Number(((coreNetIndex / 100 - 1) * 100).toFixed(2)) });
      grossPerformance.push({ date, value: Number(((coreGrossIndex / 100 - 1) * 100).toFixed(2)) });
      benchmark.push({ date, value: Number(((spyIndex / 100 - 1) * 100).toFixed(2)), benchmark: "S&P 500" });
      drawdown.push({ date, value: Number((coreNetDD * 100).toFixed(2)) });
      grossDrawdown.push({ date, value: Number((coreGrossDD * 100).toFixed(2)) });
      benchmarkDrawdown.push({ date, value: Number((spyDD * 100).toFixed(2)) });
    }
  }

  return { performance, grossPerformance, benchmark, drawdown, grossDrawdown, benchmarkDrawdown };
}

const CANONICAL_DIR = join(process.cwd(), "data", "core-invest", "canonical");

// ETF assets used in Core Invest (from daily_target_weights.csv header, minus Cash_Financing)
const CORE_INVEST_ETFS = ["SPY", "QQQ", "RSP", "IWM", "EFA", "EEM", "QUAL", "MTUM", "VLUE", "USMV", "GLD", "IEF", "BIL"];

function parseAssetReturnSeries(startDate: string): Record<string, AnalyticsSeriesPoint[]> {
  const result: Record<string, AnalyticsSeriesPoint[]> = {};

  for (const ticker of CORE_INVEST_ETFS) {
    const filepath = join(CANONICAL_DIR, `${ticker}.csv`);
    if (!existsSync(filepath)) continue;

    const text = readFileSync(filepath, "utf-8");
    const lines = text.trim().split("\n");
    if (lines.length < 2) continue;

    // Build date→close map
    const priceByDate = new Map<string, number>();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;
      const date = parts[0];
      const close = parseFloat(parts[4]);
      if (date >= startDate && Number.isFinite(close) && close > 0) {
        priceByDate.set(date, close);
      }
    }

    const dates = [...priceByDate.keys()].sort();
    if (dates.length === 0) continue;

    const basePrice = priceByDate.get(dates[0])!;
    const series: AnalyticsSeriesPoint[] = [];

    for (let i = 0; i < dates.length; i++) {
      if (i % 3 !== 0 && i !== 0 && i !== dates.length - 1) continue;
      const date = dates[i];
      const price = priceByDate.get(date)!;
      const cumReturn = Number(((price / basePrice - 1) * 100).toFixed(2));
      series.push({ date, value: cumReturn });
    }

    result[ticker] = series;
  }

  return result;
}

function parseAnnualReturns(): { core: AnalyticsBar[]; spy: AnalyticsBar[] } {
  const rows = readCsv("annual_performance.csv");
  if (rows.length < 2) return { core: [], spy: [] };

  const core: AnalyticsBar[] = [];
  const spy: AnalyticsBar[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 6) continue;
    const year = row[0];
    const isPartial = row[2] === "True";
    const label = isPartial ? `${year} YTD` : year;
    const coreNetReturn = parseFloat(row[4]);
    const spyReturn = parseFloat(row[5]);

    core.push({ label, value: Number((coreNetReturn * 100).toFixed(2)) });
    spy.push({ label, value: Number((spyReturn * 100).toFixed(2)) });
  }

  return { core, spy };
}

function parseMonthlyReturns(equityCsv: string[][]): AnalyticsBar[] {
  if (equityCsv.length < 2) return [];

  const monthlyReturns = new Map<string, number[]>();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let prevIndex = 100;
  let prevMonth = -1;
  let monthReturn = 0;

  for (let i = 1; i < equityCsv.length; i++) {
    const row = equityCsv[i];
    if (row.length < 6) continue;
    const date = row[0];
    const netIndex = parseFloat(row[5]);
    const month = new Date(date).getMonth();

    if (month !== prevMonth && prevMonth >= 0 && i > 1) {
      const label = monthNames[prevMonth];
      const existing = monthlyReturns.get(label) ?? [];
      existing.push(monthReturn);
      monthlyReturns.set(label, existing);
      monthReturn = 0;
      prevIndex = netIndex / (1 + parseFloat(row[1]));
    }

    if (prevMonth < 0 || month !== prevMonth) {
      prevMonth = month;
    }
    monthReturn = netIndex / prevIndex - 1;
  }

  if (prevMonth >= 0) {
    const label = monthNames[prevMonth];
    const existing = monthlyReturns.get(label) ?? [];
    existing.push(monthReturn);
    monthlyReturns.set(label, existing);
  }

  return monthNames.map((label) => {
    const values = monthlyReturns.get(label) ?? [];
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    return { label, value: Number((avg * 100).toFixed(2)) };
  });
}

function countPositiveMonths(equityCsv: string[][]): { positive: number; total: number } {
  if (equityCsv.length < 2) return { positive: 0, total: 0 };

  let prevMonthEnd = 100;
  let prevMonth = -1;
  let positive = 0;
  let total = 0;

  for (let i = 1; i < equityCsv.length; i++) {
    const row = equityCsv[i];
    if (row.length < 6) continue;
    const month = new Date(row[0]).getMonth();
    const netIndex = parseFloat(row[5]);

    if (month !== prevMonth && prevMonth >= 0) {
      total++;
      if (netIndex > prevMonthEnd) positive++;
      prevMonthEnd = netIndex;
    }
    prevMonth = month;
  }

  return { positive, total };
}

function parseReleaseGates(): Array<{ gate: string; status: string; detail: string }> {
  const rows = readCsv("release_gates.csv");
  if (rows.length < 2) return [];
  return rows.slice(1).map((row) => ({
    gate: row[0] ?? "",
    status: row[1] ?? "",
    detail: row.slice(2).join(","),
  }));
}

function computeWorstYear(annualRows: string[][]): number | null {
  if (annualRows.length < 2) return null;
  let worst = Infinity;
  for (let i = 1; i < annualRows.length; i++) {
    const netReturn = parseFloat(annualRows[i][4]);
    if (Number.isFinite(netReturn) && netReturn < worst) worst = netReturn;
  }
  return worst === Infinity ? null : worst;
}

export function buildCoreInvestReferenceDataset(): AnalyticsDataset | null {
  const summary = readJson<ResearchSummary>("research_summary.json");
  if (!summary) return null;

  const equityCsvRows = readCsv("daily_equity_curves.csv");
  const curves = parseEquityCurves();
  const annual = parseAnnualReturns();
  const monthly = parseMonthlyReturns(equityCsvRows);
  const posMonths = countPositiveMonths(equityCsvRows);
  const gates = parseReleaseGates();
  const annualRows = readCsv("annual_performance.csv");
  const worstYear = computeWorstYear(annualRows);

  const passedGates = gates.filter((g) => g.status === "PASS").length;
  const failedGates = gates.filter((g) => g.status === "FAIL").length;

  const assetWeights = parseAssetReturnSeries(curves.performance[0]?.date ?? "2008-01-01");

  const full = summary.full;
  const spy = summary.spy;

  const CORE_INVEST_REFERENCE_GROUPS = [
    { id: "ETF_FACTOR", label: "ETF Factor Sleeve", active: true, weight: 0.60 },
    { id: "DEFENSIVE", label: "Defensive (GLD/IEF)", active: true, weight: 0.15 },
    { id: "MANAGED_FUTURES", label: "Managed Futures", active: true, weight: 0.25 },
  ];

  const assetGroups = Object.entries(assetWeights).map(([ticker]) => ({
    id: ticker, label: ticker, active: true, weight: 0,
  }));

  return {
    tab: "invest",
    mode: "backtest",
    title: "Core Invest Active Alpha 2",
    sourceLabel: "REFERENCE DATA — Master Package v2.0-demo-audit",
    sourceFiles: ["data/core-invest/reference/daily_equity_curves.csv", "data/core-invest/reference/research_summary.json"],
    period: {
      start: curves.performance[0]?.date,
      end: curves.performance.at(-1)?.date,
    },
    groups: [...CORE_INVEST_REFERENCE_GROUPS, ...assetGroups],
    performanceSeries: curves.performance,
    drawdownSeries: curves.drawdown,
    benchmarkSeries: curves.benchmark,
    groupSeries: {
      "Core Gross": curves.grossPerformance,
      ...assetWeights,
    },
    annualReturns: annual.core,
    monthlyReturns: monthly,
    groupBars: annual.spy.map((b) => ({ ...b, group: "SPY" })),
    strategyBars: [],
    metrics: {
      totalReturnPct: Number(((full["Final Multiple"] - 1) * 100).toFixed(2)),
      cagrPct: Number((full["CAGR"] * 100).toFixed(2)),
      maxDrawdownPct: Number((full["Max Drawdown"] * 100).toFixed(2)),
      annualizedVolatilityPct: Number((full["Volatility"] * 100).toFixed(2)),
      sharpe: Number(full["Sharpe"].toFixed(2)),
      sortino: Number(full["Sortino"].toFixed(2)),
      calmar: Number(full["Calmar"].toFixed(2)),
      positiveMonthsPct: posMonths.total > 0 ? Number(((posMonths.positive / posMonths.total) * 100).toFixed(1)) : "n/a",
      correlationToSpy: Number(full["Correlation"].toFixed(2)),
      betaToSpy: Number(full["Beta"].toFixed(2)),
      worstYearPct: worstYear !== null ? Number((worstYear * 100).toFixed(2)) : "n/a",
      dataPoints: curves.performance.length,
      tradeCount: "Reference",

      dataStatus: "REFERENCE_BACKTEST",
      strategyVersion: "v2.0-demo-audit",
      portfolioName: summary.current_plan.portfolio,
      period: `${curves.performance[0]?.date ?? "?"} — ${curves.performance.at(-1)?.date ?? "?"}`,
      startCapital: `$${summary.current_plan.reference_nav.toLocaleString()}`,
      feeModel: "25% quarterly performance fee, perpetual post-fee HWM",
      grossLongExposure: `${(summary.current_plan.gross_long_exposure * 100).toFixed(0)}%`,
      riskMultiplier: `${summary.current_plan.risk_multiplier}x`,
      longExposureCap: `${(summary.current_plan.long_exposure_cap * 100).toFixed(0)}%`,

      gatesPassed: passedGates,
      gatesFailed: failedGates,
      gatesTotal: gates.length,
      mode: summary.current_plan.mode,

      spyCagrPct: Number((spy["CAGR"] * 100).toFixed(2)),
      spySharpe: Number(spy["Sharpe"].toFixed(2)),
      spyMaxDrawdownPct: Number((spy["Max Drawdown"] * 100).toFixed(2)),
      rolling5yOutperformance: `${(summary.rolling_5y * 100).toFixed(1)}%`,
      rolling10yOutperformance: `${(summary.rolling_10y * 100).toFixed(1)}%`,
    },
    etfWeights: summary.current_plan.etf_weights as Record<string, number>,
    notes: [
      "REFERENCE BACKTEST — noch nicht durch lokalen Backtrader-Run verifiziert.",
      `Quelle: Core Invest Master Integration Package v2.0-demo-audit.`,
      `Zeitraum: ${curves.performance[0]?.date ?? "?"} bis ${curves.performance.at(-1)?.date ?? "?"} (Investor Net, nach 25% Perf Fee).`,
      `Release Gates: ${passedGates} PASS, ${failedGates} FAIL von ${gates.length}.`,
      `Modus: ${summary.current_plan.mode} — kein Live-Trading.`,
    ],
  };
}

function parseEtfTargets(): Array<{ asset: string; weight: number; dollars: number }> {
  const rows = readCsv("current_etf_targets_25k.csv");
  if (rows.length < 2) return [];
  return rows.slice(1).map((row) => ({
    asset: row[0] ?? "",
    weight: parseFloat(row[1]) || 0,
    dollars: parseFloat(row[2]) || 0,
  }));
}

function parseFuturesTargets(): Array<{
  root: string;
  liveSymbol: string;
  exchange: string;
  group: string;
  contracts: number;
  signalPrice: number;
  multiplier: number;
  notional: number;
  pctNav: number;
  margin: number;
  caveat: string;
}> {
  const rows = readCsv("current_futures_targets_25k.csv");
  if (rows.length < 2) return [];
  return rows.slice(1).map((row) => ({
    root: row[0] ?? "",
    liveSymbol: row[1] ?? "",
    exchange: row[2] ?? "",
    group: row[3] ?? "",
    contracts: parseInt(row[4]) || 0,
    signalPrice: parseFloat(row[5]) || 0,
    multiplier: parseInt(row[6]) || 0,
    notional: parseFloat(row[7]) || 0,
    pctNav: parseFloat(row[8]) || 0,
    margin: parseFloat(row[9]) || 0,
    caveat: row[10] ?? "",
  }));
}

export function buildCoreInvestShadowLiveDataset(): AnalyticsDataset | null {
  const plan = readJson<CurrentPlan>("current_plan_25k.json");
  if (!plan) return null;

  const summary = readJson<ResearchSummary>("research_summary.json");
  const etfTargets = parseEtfTargets();
  const futuresTargets = parseFuturesTargets();
  const curves = parseEquityCurves();
  const assetWeights = parseAssetReturnSeries(curves.performance[0]?.date ?? "2008-01-01");

  const activeEtfs = etfTargets.filter((t) => t.weight > 0);
  const activeFutures = futuresTargets.filter((t) => t.contracts !== 0);
  const totalActiveAssets = activeEtfs.length + activeFutures.length;

  const lastEquityDate = curves.performance.at(-1)?.date ?? plan.as_of;
  const lastNetIndex = curves.performance.at(-1)?.value ?? 0;

  const equityCsvRows = readCsv("daily_equity_curves.csv");
  const annual = parseAnnualReturns();
  const monthly = parseMonthlyReturns(equityCsvRows);
  const posMonths = countPositiveMonths(equityCsvRows);

  const full = summary?.full;
  const gates = parseReleaseGates();
  const passedGates = gates.filter((g) => g.status === "PASS").length;
  const failedGates = gates.filter((g) => g.status === "FAIL").length;

  const etfGroups = activeEtfs.map((t) => ({
    id: t.asset,
    label: `${t.asset} (${(t.weight * 100).toFixed(1)}%)`,
    active: true,
    weight: t.weight,
  }));

  const futuresGroups = activeFutures.map((t) => ({
    id: t.root,
    label: `${t.root} → ${t.liveSymbol} (${t.contracts} ct)`,
    active: true,
    weight: Math.abs(t.pctNav),
  }));

  const groups = [
    { id: "SHADOW_PORTFOLIO", label: "Shadow Portfolio (Reference Context)", active: true, weight: 1.0 },
    ...etfGroups,
    ...futuresGroups,
  ];

  const grossExposurePct = (plan.gross_long_exposure * 100).toFixed(0);
  const cashFinancingPct = (plan.cash_financing_weight * 100).toFixed(1);

  const etfWeightRows = activeEtfs.map((t) => `${t.asset}: ${(t.weight * 100).toFixed(1)}% ($${t.dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })})`);
  const futuresRows = activeFutures.map((t) => `${t.root} → ${t.liveSymbol}: ${t.contracts} contracts ($${Math.abs(t.notional).toLocaleString("en-US", { maximumFractionDigits: 0 })})`);

  return {
    tab: "invest",
    mode: "live",
    title: "Core Invest Active Alpha 2 — Shadow Live",
    sourceLabel: "SHADOW LIVE — lokale Modellrechnung, kein Broker",
    sourceFiles: ["data/core-invest/reference/current_plan_25k.json", "data/core-invest/reference/current_etf_targets_25k.csv"],
    period: {
      start: curves.performance[0]?.date,
      end: lastEquityDate,
    },
    groups,
    performanceSeries: curves.performance,
    drawdownSeries: curves.drawdown,
    benchmarkSeries: curves.benchmark,
    groupSeries: {
      "Core Gross": curves.grossPerformance,
      ...assetWeights,
    },
    annualReturns: annual.core,
    monthlyReturns: monthly,
    groupBars: annual.spy.map((b) => ({ ...b, group: "SPY" })),
    strategyBars: [],
    metrics: {
      totalReturnPct: full ? Number(((full["Final Multiple"] - 1) * 100).toFixed(2)) : "pending",
      cagrPct: full ? Number((full["CAGR"] * 100).toFixed(2)) : "pending",
      maxDrawdownPct: full ? Number((full["Max Drawdown"] * 100).toFixed(2)) : "pending",
      annualizedVolatilityPct: full ? Number((full["Volatility"] * 100).toFixed(2)) : "pending",
      sharpe: full ? Number(full["Sharpe"].toFixed(2)) : "pending",
      sortino: full ? Number(full["Sortino"].toFixed(2)) : "pending",
      calmar: full ? Number(full["Calmar"].toFixed(2)) : "pending",
      positiveMonthsPct: posMonths.total > 0 ? Number(((posMonths.positive / posMonths.total) * 100).toFixed(1)) : "pending",
      correlationToSpy: full ? Number(full["Correlation"].toFixed(2)) : "pending",
      betaToSpy: full ? Number(full["Beta"].toFixed(2)) : "pending",
      worstYearPct: "pending",
      dataPoints: curves.performance.length,
      tradeCount: `${totalActiveAssets} assets`,

      dataStatus: "SHADOW_LIVE",
      strategyVersion: "v2.0-demo-audit",
      portfolioName: plan.portfolio,
      period: `${curves.performance[0]?.date ?? "?"} — ${lastEquityDate}`,
      startCapital: `$${plan.reference_nav.toLocaleString()}`,
      feeModel: "25% quarterly performance fee, perpetual post-fee HWM",
      grossLongExposure: `${grossExposurePct}%`,
      riskMultiplier: `${plan.risk_multiplier}x`,
      longExposureCap: `${(plan.long_exposure_cap * 100).toFixed(0)}%`,
      cashFinancing: `${cashFinancingPct}%`,

      gatesPassed: passedGates,
      gatesFailed: failedGates,
      gatesTotal: gates.length,
      mode: plan.mode,

      brokerStatus: "OFFLINE",
      executionStatus: "none",
      latestSignal: plan.as_of,
      latestMarketData: lastEquityDate,
      activeAssets: totalActiveAssets,
      shadowForwardStart: lastEquityDate,

      etfTargets: etfWeightRows.join(" | "),
      futuresTargets: futuresRows.join(" | "),
      lastRefReturn: lastNetIndex,

      spyCagrPct: summary ? Number((summary.spy["CAGR"] * 100).toFixed(2)) : "n/a",
      rolling5yOutperformance: summary ? `${(summary.rolling_5y * 100).toFixed(1)}%` : "n/a",
      rolling10yOutperformance: summary ? `${(summary.rolling_10y * 100).toFixed(1)}%` : "n/a",
    },
    etfWeights: plan.etf_weights as Record<string, number>,
    notes: [
      "SHADOW LIVE — lokale Modellrechnung auf Basis eingefrorener Zielgewichte.",
      "Kein Broker angebunden. Keine echten Orders. Kein echtes NAV.",
      `Zielplan vom ${plan.as_of}, Referenz-NAV $${plan.reference_nav.toLocaleString()}.`,
      `${activeEtfs.length} ETFs, ${activeFutures.length} Futures aktiv.`,
      `Gross Long Exposure: ${grossExposurePct}%, Cash Financing: ${cashFinancingPct}%.`,
      `Letzter Marktdatenstand: ${lastEquityDate}.`,
      `Performance-KPIs basieren auf Reference-Backtest bis ${lastEquityDate}.`,
    ],
  };
}
