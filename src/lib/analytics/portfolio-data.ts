import type { CapalifeData } from "@/lib/capitalife-data";
import type { FSPortfolioSnapshot } from "@/lib/fsportfolio/types";

export type AnalyticsTab = "whiteSwan" | "invest" | "combined";
export type AnalyticsMode = "live" | "backtest";

export type AnalyticsSeriesPoint = {
  date: string;
  value: number;
  group?: string;
  strategy?: string;
  benchmark?: "S&P 500";
};

export type AnalyticsBar = {
  label: string;
  value: number;
  group?: string;
};

export type AnalyticsDataset = {
  tab: AnalyticsTab;
  mode: AnalyticsMode;
  title: string;
  sourceLabel: string;
  sourceFiles: string[];
  period: { start?: string; end?: string };
  oosStartDate?: string;
  fullCoreStartDate?: string;
  qqpineForwardDate?: string;
  portfolioLiveDate?: string;
  groups: Array<{
    id: string;
    label: string;
    active: boolean;
    assets?: number;
    strategies?: number;
    weight?: number | null;
  }>;
  performanceSeries: AnalyticsSeriesPoint[];
  drawdownSeries: AnalyticsSeriesPoint[];
  benchmarkSeries: AnalyticsSeriesPoint[];
  groupSeries: Record<string, AnalyticsSeriesPoint[]>;
  annualReturns: AnalyticsBar[];
  monthlyReturns: AnalyticsBar[];
  groupBars: AnalyticsBar[];
  strategyBars: AnalyticsBar[];
  metrics: Record<string, number | string>;
  notes: string[];
};

function formatIsoDate(value: string | null | undefined) {
  if (!value) return "n/a";
  return value.slice(0, 10);
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatAssetStatusSummary(statuses: Record<string, { status: string }>) {
  const symbols = ["SPY", "SPMO", "QQQ", "GLD"];
  return symbols.map((symbol) => `${symbol}:${statuses[symbol]?.status ?? "missing"}`).join(" | ");
}

const WHITE_SWAN_GROUPS = [
  { id: "Agrar", label: "Agrar", assets: 8, strategies: 1, weight: null },
  { id: "Metalle", label: "Metalle", assets: 5, strategies: 1, weight: null },
  { id: "Energy", label: "Energy", assets: 3, strategies: 1, weight: null },
  { id: "Indizes", label: "Indizes", assets: 5, strategies: 1, weight: null },
  { id: "Forex", label: "Forex", assets: 8, strategies: 1, weight: null },
] as const;

const COMBINED_GROUPS = [...WHITE_SWAN_GROUPS, { id: "Invest", label: "Invest", assets: 1, strategies: 1, weight: null }] as const;
const INVEST_GROUPS = [
  { id: "SPY", label: "SPY", assets: 1, strategies: 1, weight: 0.15 },
  { id: "SPMO", label: "SPMO", assets: 1, strategies: 1, weight: 0.35 },
  { id: "QQQ_PASSIVE", label: "QQQ passive", assets: 1, strategies: 1, weight: 0.15 },
  { id: "GLD", label: "GLD", assets: 1, strategies: 1, weight: 0.10 },
  { id: "QQQ_PINE_1", label: "QQQ Pine 1", assets: 1, strategies: 1, weight: 0.075 },
  { id: "QQQ_PINE_2_EMA", label: "QQQ Pine 2 EMA", assets: 1, strategies: 1, weight: 0.075 },
  { id: "COPPER_HG", label: "Copper/HG", assets: 1, strategies: 1, weight: 0.05 },
  { id: "CHF_6S", label: "CHF/6S", assets: 1, strategies: 1, weight: 0.05 },
] as const;

function cleanSeries<T extends { date: string; value: number | null; group?: string; strategy?: string }>(series: T[]) {
  return series
    .filter((point): point is T & { value: number } => Number.isFinite(point.value))
    .map(({ date, value, group, strategy }) => ({ date, value, group, strategy }));
}

function buildDrawdownFromReturns(points: AnalyticsSeriesPoint[]) {
  let peak = -Infinity;
  return points.map((point) => {
    const equity = 1 + point.value / 100;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (equity / peak - 1) * 100 : 0;
    return { date: point.date, value: Number(drawdown.toFixed(2)) };
  });
}

function livePerformanceSeries(data: CapalifeData) {
  let cum = 100;
  return data.performanceMonthly.monthly_returns.map((row) => {
    cum *= 1 + row.return_pct / 100;
    return { date: `${row.month}-01`, value: Number((cum - 100).toFixed(2)) };
  });
}

function liveAnnualBars(data: CapalifeData) {
  return data.whiteSwanAnnualReturns.annual_returns.map((item) => ({ label: item.year, value: item.return_pct }));
}

function seasonalityFromLiveMonths(data: CapalifeData) {
  const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const grouped = new Map<string, number[]>();
  for (const row of data.performanceMonthly.monthly_returns) {
    const label = new Date(`${row.month}-01`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    grouped.set(label, [...(grouped.get(label) ?? []), row.return_pct]);
  }
  return monthOrder.map((month) => {
    const values = grouped.get(month) ?? [];
    return { label: month, value: values.length ? Number((values.reduce((sum, current) => sum + current, 0) / values.length).toFixed(2)) : 0 };
  });
}

function createBacktestDataset(tab: AnalyticsTab, data: CapalifeData): AnalyticsDataset {
  const raw = (
    tab === "whiteSwan"
      ? data.analyticsGenerated.whiteSwanBacktest
      : tab === "invest"
        ? data.analyticsGenerated.investBacktest
        : data.analyticsGenerated.combinedBacktest
  ) as {
    performanceSeries: Array<{ date: string; value: number | null }>;
    drawdownSeries: Array<{ date: string; value: number | null }>;
    benchmarkSeries: Array<{ date: string; value: number | null }>;
    groupSeries?: Record<string, Array<{ date: string; value: number | null }>>;
    annualReturns: Array<{ year: string; value: number | null }>;
    monthlyReturns: Array<{ month: string; value: number | null }>;
    groupBars: Array<{ group: string; value: number }>;
    strategyBars: Array<{ strategy: string; group: string; value: number }>;
  };

  const groups = tab === "whiteSwan" ? WHITE_SWAN_GROUPS : tab === "invest" ? INVEST_GROUPS : COMBINED_GROUPS;
  const groupSeries = Object.fromEntries(
    Object.entries(raw.groupSeries ?? {}).map(([group, series]) => [
      group,
      cleanSeries(series as Array<{ date: string; value: number | null }>).map((point) => ({ ...point, group })),
    ]),
  );

  const performanceSeries = cleanSeries(raw.performanceSeries as Array<{ date: string; value: number | null }>);
  const drawdownSeries = cleanSeries(raw.drawdownSeries as Array<{ date: string; value: number | null }>);
  const benchmarkSeries = cleanSeries(raw.benchmarkSeries as Array<{ date: string; value: number | null }>).map((point) => ({
    ...point,
    benchmark: "S&P 500" as const,
  }));

  return {
    tab,
    mode: "backtest",
    title: tab === "whiteSwan" ? "White Swan" : tab === "invest" ? "Core Invest" : "Combined",
    sourceLabel:
      tab === "whiteSwan"
        ? "Capitalife Brain truth + Invoria equity curves"
        : tab === "invest"
          ? "Invoria strategy audit engine trades"
          : "White Swan asset curves + Invest engine trades",
    sourceFiles: [],
    period: { start: performanceSeries[0]?.date, end: performanceSeries.at(-1)?.date },
    groups: groups.map((group) => ({ ...group, active: true })),
    performanceSeries,
    drawdownSeries,
    benchmarkSeries,
    groupSeries,
    annualReturns: (raw.annualReturns as Array<{ year: string; value: number | null }>).filter((item) => Number.isFinite(item.value)).map((item) => ({ label: item.year, value: Number(item.value) })),
    monthlyReturns: (raw.monthlyReturns as Array<{ month: string; value: number | null }>).filter((item) => Number.isFinite(item.value)).map((item) => ({ label: item.month, value: Number(item.value) })),
    groupBars: (raw.groupBars as Array<{ group: string; value: number }>).map((item) => ({ label: item.group, value: item.value, group: item.group })),
    strategyBars: (raw.strategyBars as Array<{ strategy: string; group: string; value: number }>).map((item) => ({ label: item.strategy, value: item.value, group: item.group })),
    metrics: tab === "whiteSwan"
      ? { totalReturnPct: "88.65%", cagrPct: "1.13%", maxDrawdownPct: "-1.23%", tradeCount: "Asset curves", strategyCount: "5 sleeves" }
      : tab === "invest"
        ? { totalReturnPct: "172.31%", cagrPct: "5.81%", maxDrawdownPct: "-21.06%", tradeCount: "1101", strategyCount: "3 strategies" }
        : { totalReturnPct: "Combined proxy", cagrPct: "White Swan + Invest", maxDrawdownPct: "Derived from grouped curves", tradeCount: "1101 + White Swan curves", strategyCount: "6 groups" },
    notes: [],
  };
}

function createLiveDataset(tab: AnalyticsTab, data: CapalifeData): AnalyticsDataset {
  const series = livePerformanceSeries(data);
  const drawdown = buildDrawdownFromReturns(series);
  const isWhiteSwan = tab === "whiteSwan";
  const combinedEvidence = data.whiteSwanCombinedEvidence;

  return {
    tab,
    mode: "live",
    title: tab === "whiteSwan" ? "White Swan" : tab === "invest" ? "Invest" : "Combined",
    sourceLabel: isWhiteSwan ? "Performance Report.pdf + statement extracts" : "No live source found",
    sourceFiles: [],
    period: { start: series[0]?.date, end: series.at(-1)?.date },
    groups: (tab === "whiteSwan" ? WHITE_SWAN_GROUPS : tab === "invest" ? INVEST_GROUPS : COMBINED_GROUPS).map((group) => ({ ...group, active: true })),
    performanceSeries: isWhiteSwan ? series : [],
    drawdownSeries: isWhiteSwan ? drawdown : [],
    benchmarkSeries: [],
    groupSeries: {},
    annualReturns: isWhiteSwan ? liveAnnualBars(data) : [],
    monthlyReturns: isWhiteSwan ? seasonalityFromLiveMonths(data) : [],
    groupBars: [],
    strategyBars: [],
    metrics: isWhiteSwan
      ? {
          totalReturnPct: "+97.2%",
          compoundedPct: "+114.6%",
          maxDrawdownPct: "-11.76%",
          annualizedPct: "35.2%",
          sharpe: "1.60",
          trades: `${combinedEvidence.account1_partial.total_closed_trades} + ${combinedEvidence.account2_visible.total_visible_trades}`,
        }
      : {
          status: "Pending",
          reason: tab === "invest" ? "No invest live statement or benchmark series found." : "No compatible combined live source found.",
        },
    notes: [],
  };
}

function toPercentSeries(curve: Array<{ date: string; value: number }>, initialCapital: number) {
  if (!curve.length || !initialCapital) return [];
  return curve.map((point) => ({
    date: point.date,
    value: Number((((point.value / initialCapital) - 1) * 100).toFixed(2)),
  }));
}

function toBars(points: Array<{ date: string; value: number }>) {
  return points.map((point) => ({ label: point.date, value: Number(point.value.toFixed(2)) }));
}

function buildInvestAssetSeries(fsportfolio: FSPortfolioSnapshot) {
  if (!fsportfolio.backtest.ready) return {};
  return Object.fromEntries(
    Object.entries(fsportfolio.backtest.assetCurves).map(([symbol, curve]) => [
      symbol,
      toPercentSeries(curve, fsportfolio.config.initial_capital).map((point) => ({
        ...point,
        group: symbol,
      })),
    ]),
  );
}

function createInvestDatasetFromSnapshot(mode: AnalyticsMode, fsportfolio: FSPortfolioSnapshot): AnalyticsDataset {
  const coreStatuses = ["SPY", "SPMO", "QQQ", "GLD"]
    .map((symbol) => `${symbol}:${fsportfolio.manifest.core_required[symbol]?.status ?? "missing"}`)
    .join(" | ");
  const marketDataLabel = Object.values(fsportfolio.manifest.core_required).some((entry) => (entry.path ?? "").includes(".capitalife-cache"))
    ? "TradingView cache fallback active"
    : "Local manual OHLC active";
  const common = {
    tab: "invest" as const,
    mode,
    title: "Invest",
    sourceLabel: "FSPortfolio Live Core v2",
    sourceFiles: [
      fsportfolio.configPath,
      ...Object.values(fsportfolio.manifest.core_required).map((entry) => entry.path).filter((value): value is string => Boolean(value)),
      fsportfolio.manifest.white_swan.trade_export.path ?? "",
      fsportfolio.manifest.white_swan.pine_reference.path ?? "",
    ].filter(Boolean),
    groups: INVEST_GROUPS.map((group) => ({ ...group, active: true })),
    groupSeries: {},
    oosStartDate: fsportfolio.backtest.oosStartDate ?? undefined,
    fullCoreStartDate: fsportfolio.backtest.fullCoreStartDate ?? undefined,
    qqpineForwardDate: fsportfolio.live.qqqInvestPineForwardVerified
      ? (fsportfolio.live.qqqInvestPineSeriesStartDate ?? undefined)
      : undefined,
    portfolioLiveDate: fsportfolio.live.portfolioForwardVerified
      ? (fsportfolio.live.portfolioForwardStartDate ?? undefined)
      : undefined,
  };

  if (mode === "live") {
    const fwd = fsportfolio.live;

    // Convert base-100 forward portfolio series to cumulative % from 0
    const performanceSeries: AnalyticsSeriesPoint[] = fwd.forwardPortfolioSeries.map((point) => ({
      date: point.date,
      value: Number(((point.value / 100 - 1) * 100).toFixed(2)),
    }));
    const drawdownSeries: AnalyticsSeriesPoint[] = performanceSeries.length
      ? buildDrawdownFromReturns(performanceSeries)
      : [];

    // Benchmark: SPY from Phase A start, normalized to %
    const benchmarkSeries: AnalyticsSeriesPoint[] = fwd.forwardBenchmarkSeries.map((point) => ({
      date: point.date,
      value: Number(((point.value / 100 - 1) * 100).toFixed(2)),
      benchmark: "S&P 500" as const,
    }));

    // Asset curves: each normalized to % from their own start
    const groupSeries: Record<string, AnalyticsSeriesPoint[]> = Object.fromEntries(
      Object.entries(fwd.forwardAssetCurves).map(([symbol, curve]) => [
        symbol,
        curve.map((point) => ({
          date: point.date,
          value: Number(((point.value / 100 - 1) * 100).toFixed(2)),
          group: symbol,
        })),
      ]),
    );

    const annualReturns: AnalyticsBar[] = fwd.forwardAnnualReturns.map((point) => ({
      label: point.date,
      value: Number(point.value.toFixed(2)),
    }));
    const monthlyReturns: AnalyticsBar[] = fwd.forwardMonthlyReturns.map((point) => ({
      label: point.date,
      value: Number(point.value.toFixed(2)),
    }));

    const assetsOk = Object.values(fwd.assetStatuses).filter((s) => s.status === "ok" || s.status === "stale").length;
    const totalAssets = Object.keys(fwd.assetStatuses).length + 1;

    return {
      ...common,
      qqpineForwardDate: fwd.forwardPhaseAStart,
      portfolioLiveDate: fwd.forwardPhaseBStart,
      period: {
        start: performanceSeries[0]?.date ?? fwd.forwardPhaseAStart,
        end: performanceSeries.at(-1)?.date ?? undefined,
      },
      performanceSeries,
      drawdownSeries,
      benchmarkSeries,
      annualReturns,
      monthlyReturns,
      groupBars: [],
      strategyBars: [],
      groupSeries,
      metrics: {
        totalReturnPct: fwd.forwardTotalReturnPct ?? "n/a",
        cagrPct: fwd.forwardCagrPct ?? "n/a",
        maxDrawdownPct: fwd.forwardMaxDrawdownPct ?? "n/a",
        annualizedVolatilityPct: fwd.forwardAnnualizedVolPct ?? "n/a",
        sharpe: fwd.forwardSharpe ?? "n/a",
        sortino: fwd.forwardSortino ?? "n/a",
        calmar: fwd.forwardCalmar ?? "n/a",
        positiveMonthsPct: fwd.forwardPositiveMonthsPct ?? "n/a",
        dataPoints: fwd.forwardDataPoints,
        tradeCount: fsportfolio.backtest.whiteSwan.tradeCount,
        currentSignal: fsportfolio.backtest.whiteSwan.currentSignal.toUpperCase(),
        assetsOk: `${assetsOk + (fsportfolio.backtest.whiteSwan.tradeCount > 0 ? 1 : 0)} / ${totalAssets}`,
        marketDataStatus: fwd.marketDataStatus,
        caveat: fwd.caveat,
        lastUpdate: formatTimestamp(fwd.latestMarketDataTimestamp),
        currentQqqPrice: fwd.assetStatuses.QQQ?.latestClose ? `${fwd.assetStatuses.QQQ.latestClose.toFixed(2)} USD` : "n/a",
      },
      notes: [
        "Forward tracking — not live execution.",
        `Phase A (${fwd.forwardPhaseAStart} to ${fwd.forwardPhaseBStart}): 100% QQQ Invest Pine.`,
        `Phase B (${fwd.forwardPhaseBStart}+): SPY 27.5% / SPMO 27.5% / QQQ 15% / GLD 20% / QQQ Pine 10%.`,
        `Market data: ${coreStatuses}`,
      ],
    };
  }

  const performanceSeries = fsportfolio.backtest.ready
    ? toPercentSeries(fsportfolio.backtest.equityCurve, fsportfolio.config.initial_capital)
    : [];
  const drawdownSeries = fsportfolio.backtest.ready
    ? fsportfolio.backtest.drawdownCurve.map((point) => ({ date: point.date, value: Number(point.value.toFixed(2)) }))
    : [];
  const benchmarkSeries = fsportfolio.backtest.ready
    ? toPercentSeries(fsportfolio.backtest.benchmarkCurve, fsportfolio.config.initial_capital).map((point) => ({
        ...point,
        benchmark: "S&P 500" as const,
      }))
    : [];
  const groupSeries = buildInvestAssetSeries(fsportfolio);
  const commonStart = fsportfolio.backtest.commonStartDate ?? performanceSeries[0]?.date;
  const commonEnd = fsportfolio.backtest.commonEndDate ?? performanceSeries.at(-1)?.date;

  return {
    ...common,
    period: { start: commonStart, end: commonEnd },
    performanceSeries,
    drawdownSeries,
    benchmarkSeries,
    groupSeries,
    annualReturns: fsportfolio.backtest.ready ? toBars(fsportfolio.backtest.annualReturns) : [],
    monthlyReturns: fsportfolio.backtest.ready ? toBars(fsportfolio.backtest.monthlyReturns) : [],
    groupBars: [],
    strategyBars: [],
    metrics: {
      totalReturnPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.totalReturnPct : "n/a",
      cagrPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.cagrPct : "n/a",
      maxDrawdownPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.maxDrawdownPct : "n/a",
      annualizedVolatilityPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.annualizedVolatilityPct : "n/a",
      sharpe: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.sharpe : "n/a",
      sortino: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.sortino ?? "n/a" : "n/a",
      calmar: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.calmar ?? "n/a" : "n/a",
      betaToSpy: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.betaToSpy ?? "n/a" : "n/a",
      correlationToSpy: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.correlationToSpy ?? "n/a" : "n/a",
      positiveMonthsPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.positiveMonthsPct ?? "n/a" : "n/a",
      worstYearPct: fsportfolio.backtest.ready && fsportfolio.backtest.metrics ? fsportfolio.backtest.metrics.worstYearPct ?? "n/a" : "n/a",
      dataPoints: performanceSeries.length,
      tradeCount: fsportfolio.backtest.whiteSwan.tradeCount,
      status: fsportfolio.backtest.ready ? "backtest ready" : "missing required data",
      reason: fsportfolio.backtest.reason ?? "n/a",
      strategyVersion: fsportfolio.config.version ?? "v2",
      dataStatus: fsportfolio.manifest.can_run_final_core_backtest ? "SPY/SPMO/QQQ/GLD ready" : "core data incomplete",
      missingData: fsportfolio.missingSymbols.join(", ") || "none",
      qqqInvestPine: fsportfolio.backtest.whiteSwan.tradeCount > 0
        ? `available through ${fsportfolio.backtest.whiteSwan.lastTradeDate ?? "n/a"}`
        : "pending",
      nextRebalance: fsportfolio.backtest.nextRebalanceDate ?? "n/a",
      sleeveStatus: fsportfolio.backtest.whiteSwan.source,
      marketData: marketDataLabel,
      adaptiveStart: fsportfolio.backtest.adaptiveStartDate ?? "n/a",
      fullCoreStart: fsportfolio.backtest.fullCoreStartDate ?? "n/a",
    },
    notes: [
      "Invest nutzt dieselbe Analytics-Struktur wie White Swan.",
      `Strategie: ${fsportfolio.portfolioName}`,
      fsportfolio.manifest.can_run_final_core_backtest ? "Core-Datensatz vollstaendig." : `Missing required core data: ${fsportfolio.missingSymbols.join(", ")}`,
      "QQQ Invest Pine wird als QQQ-Long/Cash-Sleeve aus belegtem Trade-Export implementiert.",
      `Market data: ${coreStatuses}`,
    ],
  };
}

export function getAnalyticsDataset(tab: AnalyticsTab, mode: AnalyticsMode, fsportfolio: FSPortfolioSnapshot | undefined, data: CapalifeData) {
  if (tab === "invest" && fsportfolio) {
    return createInvestDatasetFromSnapshot(mode, fsportfolio);
  }
  if (mode === "backtest") return createBacktestDataset(tab, data);
  return createLiveDataset(tab, data);
}
