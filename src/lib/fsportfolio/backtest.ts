import "server-only";

import fs from "node:fs";
import { loadFSPortfolioConfig } from "@/lib/fsportfolio/config";
import { loadFSPortfolioDataManifest } from "@/lib/fsportfolio/data-manifest";
import { loadRequiredOhlcSeries } from "@/lib/fsportfolio/data-loader";
import { aggregateReturns, computeDrawdownCurve, computePortfolioMetrics, computeRollingCorrelation, computeRollingWindow } from "@/lib/fsportfolio/metrics";
import { buildPositionWeights } from "@/lib/fsportfolio/rebalance";
import { buildWhiteSwanSleeveStatus } from "@/lib/fsportfolio/white-swan-sleeve";
import { loadSleeveReturns } from "@/lib/core-invest/sleeve-returns";
import { getTradingViewLatest, getTradingViewStatusFile } from "@/lib/market-data/tradingview-cache";
import type { EquityPoint, FSPortfolioLiveAssetStatus, FSPortfolioLiveResult, FSPortfolioSnapshot, OhlcBar, PositionWeight } from "@/lib/fsportfolio/types";

const QQQ_INVEST_PINE_SERIES_PATH = "C:/Users/joris/Documents/Fund Manager Dashboard/src/data/capitalife/fsportfolio/backtests/qqq-invest-pine-series.json";

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function buildDailyReturnMap(bars: OhlcBar[]) {
  const returns: Record<string, number> = {};
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1]!;
    const current = bars[index]!;
    if (previous.close === 0) continue;
    returns[current.date] = current.close / previous.close - 1;
  }
  return returns;
}

function intersectDates(seriesMaps: Record<string, OhlcBar[]>) {
  const keys = Object.keys(seriesMaps);
  if (!keys.length) return [];
  const dateSets = keys.map((symbol) => new Set(seriesMaps[symbol].slice(1).map((bar) => bar.date)));
  return [...dateSets[0]!]
    .filter((date) => dateSets.every((set) => set.has(date)))
    .sort((left, right) => left.localeCompare(right));
}

function nextQuarterEndDate(lastDate: string) {
  const date = new Date(`${lastDate}T00:00:00Z`);
  const quarterEnds = [2, 5, 8, 11];
  let nextMonth = quarterEnds.find((month) => month > date.getUTCMonth());
  let year = date.getUTCFullYear();
  if (nextMonth === undefined) {
    nextMonth = quarterEnds[0];
    year += 1;
  }
  return new Date(Date.UTC(year, nextMonth + 1, 0)).toISOString().slice(0, 10);
}

function buildBenchmarkEquity(dates: string[], returns: Record<string, number>, initialCapital: number) {
  let equity = initialCapital;
  const curve: EquityPoint[] = [];
  for (const date of dates) {
    equity *= 1 + (returns[date] ?? 0);
    curve.push({ date, value: Number(equity.toFixed(2)) });
  }
  return curve;
}

function buildAssetEquityCurve(dates: string[], returns: Record<string, number>, initialCapital: number) {
  let equity = initialCapital;
  const curve: EquityPoint[] = [];
  for (const date of dates) {
    equity *= 1 + (returns[date] ?? 0);
    curve.push({ date, value: Number(equity.toFixed(2)) });
  }
  return curve;
}

function buildPercentCurveFromReturns(dates: string[], returns: Record<string, number>, startDate: string) {
  const filteredDates = dates.filter((date) => date >= startDate);
  if (!filteredDates.length) return [];
  let equity = 1;
  return filteredDates.map((date) => {
    equity *= 1 + (returns[date] ?? 0);
    return {
      date,
      value: Number((equity * 100).toFixed(2)),
    };
  });
}

function buildPercentCurveFromBars(bars: OhlcBar[], startDate: string) {
  const filteredBars = bars.filter((bar) => bar.date >= startDate);
  if (filteredBars.length < 2) return [];
  const baseClose = filteredBars[0]!.close;
  if (!baseClose) return [];
  return filteredBars.map((bar) => ({
    date: bar.date,
    value: Number(((bar.close / baseClose) * 100).toFixed(2)),
  }));
}

function buildLiveAssetStatuses(): Record<string, FSPortfolioLiveAssetStatus> {
  const status = getTradingViewStatusFile();
  const latestBars = new Map(getTradingViewLatest().map((item) => [item.symbol, item]));
  const symbols = ["SPY", "SPMO", "QQQ", "GLD"];
  return Object.fromEntries(
    symbols.map((symbol) => {
      const symbolStatus = status.symbols[symbol];
      const latest = latestBars.get(symbol);
      return [
        symbol,
        {
          symbol,
          status: symbolStatus?.status ?? "missing",
          lastFetch: symbolStatus?.last_fetch ?? latest?.fetched_at ?? null,
          lastBarTime: symbolStatus?.last_bar_time ?? latest?.bar_time ?? null,
          latestClose: latest?.close ?? null,
          historyRows: symbolStatus?.rows_1D ?? 0,
        } satisfies FSPortfolioLiveAssetStatus,
      ];
    }),
  );
}

const FORWARD_PHASE_A_START = "2025-05-01";
const FORWARD_PHASE_B_START = "2026-05-01";
const FORWARD_PHASE_B_WEIGHTS: Record<string, number> = {
  SPY: 0.275,
  SPMO: 0.275,
  QQQ: 0.15,
  GLD: 0.20,
  WHITE_SWAN_NAS_EMA: 0.10,
};

function buildLiveResult(loadedSeries: Record<string, OhlcBar[]>, whiteSwanDailyReturns: Record<string, number>, currentSignal: "long" | "cash", extraSleeveReturns?: Record<string, Record<string, number>>): FSPortfolioLiveResult {
  const status = getTradingViewStatusFile();
  const latestTimestamp = ["SPY", "SPMO", "QQQ", "GLD"]
    .map((symbol) => status.symbols[symbol]?.last_bar_time ?? null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const assetStatuses = buildLiveAssetStatuses();
  const assetStates = Object.values(assetStatuses).map((item) => item.status);
  const resolvedMarketStatus =
    assetStates.includes("error")
      ? "error"
      : assetStates.includes("stale")
        ? "stale"
        : assetStates.includes("ok")
          ? "ok"
          : "missing";
  const trailingStartDate = latestTimestamp ? new Date(new Date(latestTimestamp).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : "2025-07-01";
  const assetCurves: Record<string, EquityPoint[]> = {
    SPY: buildPercentCurveFromBars(loadedSeries.SPY ?? [], trailingStartDate),
    SPMO: buildPercentCurveFromBars(loadedSeries.SPMO ?? [], trailingStartDate),
    QQQ: buildPercentCurveFromBars(loadedSeries.QQQ ?? [], trailingStartDate),
    GLD: buildPercentCurveFromBars(loadedSeries.GLD ?? [], trailingStartDate),
    WHITE_SWAN_NAS_EMA: buildPercentCurveFromReturns(
      (loadedSeries.QQQ ?? []).map((bar) => bar.date),
      whiteSwanDailyReturns,
      trailingStartDate,
    ),
  };

  let qqqInvestPineSeriesStartDate: string | null = null;
  let qqqInvestPineSeriesEndDate: string | null = null;
  let qqqInvestPineSeriesPoints = 0;
  if (fs.existsSync(QQQ_INVEST_PINE_SERIES_PATH)) {
    try {
      const payload = JSON.parse(fs.readFileSync(QQQ_INVEST_PINE_SERIES_PATH, "utf8")) as {
        summary?: { firstDate?: string; lastDate?: string; dataPoints?: number };
      };
      qqqInvestPineSeriesStartDate = payload.summary?.firstDate ?? null;
      qqqInvestPineSeriesEndDate = payload.summary?.lastDate ?? null;
      qqqInvestPineSeriesPoints = payload.summary?.dataPoints ?? 0;
    } catch {}
  }

  // Build forward tracking portfolio (not live execution)
  // Phase A: 2025-05-01 to 2026-04-30 — 100% QQQ Invest Pine
  // Phase B: 2026-05-01+             — SPY 27.5% / SPMO 27.5% / QQQ 15% / GLD 20% / QQQ Pine 10%
  const returnMapsBySymbol: Record<string, Record<string, number>> = {
    SPY: buildDailyReturnMap(loadedSeries.SPY ?? []),
    SPMO: buildDailyReturnMap(loadedSeries.SPMO ?? []),
    QQQ: buildDailyReturnMap(loadedSeries.QQQ ?? []),
    GLD: buildDailyReturnMap(loadedSeries.GLD ?? []),
    WHITE_SWAN_NAS_EMA: whiteSwanDailyReturns,
  };
  const allQqqDates = (loadedSeries.QQQ ?? []).map((bar) => bar.date);
  const forwardDates = allQqqDates.filter((date) => date >= FORWARD_PHASE_A_START);

  let fwdEquity = 100;
  const fwdDailyReturns: Record<string, number> = {};
  const forwardPortfolioSeries: EquityPoint[] = [];

  for (const date of forwardDates) {
    let dayReturn: number;
    if (date < FORWARD_PHASE_B_START) {
      dayReturn = whiteSwanDailyReturns[date] ?? 0;
    } else {
      const availableSymbols = Object.keys(FORWARD_PHASE_B_WEIGHTS).filter(
        (sym) => returnMapsBySymbol[sym]?.[date] !== undefined,
      );
      const availableWeight = availableSymbols.reduce((sum, sym) => sum + FORWARD_PHASE_B_WEIGHTS[sym]!, 0);
      dayReturn =
        availableWeight > 0
          ? availableSymbols.reduce(
              (sum, sym) => sum + (returnMapsBySymbol[sym]![date]! * FORWARD_PHASE_B_WEIGHTS[sym]!) / availableWeight,
              0,
            )
          : 0;
    }
    fwdEquity *= 1 + dayReturn;
    fwdDailyReturns[date] = dayReturn;
    forwardPortfolioSeries.push({ date, value: Number(fwdEquity.toFixed(4)) });
  }

  // Per-asset daily returns for forward period — sent to client for interactive weight recomputation
  const forwardAssetDailyReturns: Record<string, Record<string, number>> = {};
  for (const [sym, returns] of Object.entries(returnMapsBySymbol)) {
    const filtered: Record<string, number> = {};
    for (const date of forwardDates) {
      if (returns[date] !== undefined) filtered[date] = returns[date]!;
    }
    forwardAssetDailyReturns[sym] = filtered;
  }
  // Merge extra sleeve returns (QQQ_PINE_2_EMA, COPPER_HG, CHF_6S) filtered to forward period
  if (extraSleeveReturns) {
    for (const [sym, returns] of Object.entries(extraSleeveReturns)) {
      const filtered: Record<string, number> = {};
      for (const date of forwardDates) {
        if (returns[date] !== undefined) filtered[date] = returns[date]!;
      }
      forwardAssetDailyReturns[sym] = filtered;
    }
  }

  const forwardBenchmarkSeries = buildPercentCurveFromBars(loadedSeries.SPY ?? [], FORWARD_PHASE_A_START);
  const forwardAssetCurves: Record<string, EquityPoint[]> = {
    WHITE_SWAN_NAS_EMA: buildPercentCurveFromReturns(allQqqDates, whiteSwanDailyReturns, FORWARD_PHASE_A_START),
    SPY: buildPercentCurveFromBars(loadedSeries.SPY ?? [], FORWARD_PHASE_B_START),
    SPMO: buildPercentCurveFromBars(loadedSeries.SPMO ?? [], FORWARD_PHASE_B_START),
    QQQ: buildPercentCurveFromBars(loadedSeries.QQQ ?? [], FORWARD_PHASE_B_START),
    GLD: buildPercentCurveFromBars(loadedSeries.GLD ?? [], FORWARD_PHASE_B_START),
  };

  const forwardAnnualReturns = aggregateReturns(fwdDailyReturns, "year");
  const forwardMonthlyReturns = aggregateReturns(fwdDailyReturns, "month");

  let forwardTotalReturnPct: number | null = null;
  let forwardMaxDrawdownPct: number | null = null;
  let forwardCagrPct: number | null = null;
  let forwardAnnualizedVolPct: number | null = null;
  let forwardSharpe: number | null = null;
  let forwardSortino: number | null = null;
  let forwardCalmar: number | null = null;
  let forwardPositiveMonthsPct: number | null = null;

  if (forwardPortfolioSeries.length > 1) {
    const fwdMetrics = computePortfolioMetrics({
      initialCapital: 100,
      equityCurve: forwardPortfolioSeries,
      dailyReturns: fwdDailyReturns,
      benchmarkDailyReturns: returnMapsBySymbol.SPY ?? {},
      transactionCostAmount: 0,
      turnoverPct: null,
    });
    if (fwdMetrics) {
      forwardTotalReturnPct = round4(fwdMetrics.totalReturnPct);
      forwardMaxDrawdownPct = round4(fwdMetrics.maxDrawdownPct);
      forwardCagrPct = round4(fwdMetrics.cagrPct);
      forwardAnnualizedVolPct = Number.isFinite(fwdMetrics.annualizedVolatilityPct) ? round4(fwdMetrics.annualizedVolatilityPct) : null;
      forwardSharpe = Number.isFinite(fwdMetrics.sharpe) ? round4(fwdMetrics.sharpe) : null;
      forwardSortino = fwdMetrics.sortino !== null && Number.isFinite(fwdMetrics.sortino) ? round4(fwdMetrics.sortino) : null;
      forwardCalmar = fwdMetrics.calmar !== null && Number.isFinite(fwdMetrics.calmar) ? round4(fwdMetrics.calmar) : null;
      forwardPositiveMonthsPct = fwdMetrics.positiveMonthsPct;
    }
  }

  return {
    status: "forward",
    seriesType: forwardPortfolioSeries.length > 0 ? "qqq_invest_pine" : "missing",
    latestMarketDataTimestamp: latestTimestamp,
    marketDataStatus: resolvedMarketStatus,
    marketDataSource: "TradingView delayed cache",
    marketDataAuthMode: status.auth_mode,
    qqqInvestPineForwardVerified: false,
    qqqInvestPineCandidateStartDate: FORWARD_PHASE_A_START,
    qqqInvestPineSeriesStartDate,
    qqqInvestPineSeriesEndDate,
    qqqInvestPineSeriesPoints,
    qqqInvestPineCurrentSignal: currentSignal,
    portfolioForwardVerified: false,
    portfolioForwardStartDate: FORWARD_PHASE_B_START,
    portfolioSeriesStartDate: forwardPortfolioSeries[0]?.date ?? null,
    portfolioSeriesEndDate: forwardPortfolioSeries.at(-1)?.date ?? null,
    portfolioSeriesPoints: forwardPortfolioSeries.length,
    assetStatuses,
    assetCurves,
    qqqInvestPineReturnPct: forwardTotalReturnPct,
    portfolioReturnPct: null,
    maxDrawdownPct: forwardMaxDrawdownPct,
    ytdReturnPct: null,
    caveat: "not live execution",
    reason: null,
    forwardPhaseAStart: FORWARD_PHASE_A_START,
    forwardPhaseBStart: FORWARD_PHASE_B_START,
    forwardPortfolioSeries,
    forwardBenchmarkSeries,
    forwardAssetCurves,
    forwardAnnualReturns,
    forwardMonthlyReturns,
    forwardTotalReturnPct,
    forwardMaxDrawdownPct,
    forwardCagrPct,
    forwardAnnualizedVolPct,
    forwardSharpe,
    forwardSortino,
    forwardCalmar,
    forwardPositiveMonthsPct,
    forwardDataPoints: forwardPortfolioSeries.length,
    forwardAssetDailyReturns,
  };
}

function buildReadySnapshot(): FSPortfolioSnapshot {
  const config = loadFSPortfolioConfig();
  const manifest = loadFSPortfolioDataManifest();
  const loaded = loadRequiredOhlcSeries(config.required_ohlc_symbols);
  const missingSymbols = loaded.quality.filter((item) => !item.found).map((item) => item.symbol);
  const nasBars = loaded.series.QQQ ?? [];
  const whiteSwan = buildWhiteSwanSleeveStatus(
    nasBars,
    config.initial_capital * config.weights.WHITE_SWAN_NAS_EMA,
  );
  // Load extended sleeve returns for QQQ_PINE_2_EMA, COPPER_HG, CHF_6S
  const extraSleeveReturns = (() => {
    try { return loadSleeveReturns(nasBars); } catch { return undefined; }
  })();

  if (missingSymbols.length) {
    return {
      portfolioName: config.portfolio_name,
      status: config.status,
      sourcePrompt: "C:/Users/joris/Downloads/FSPortfolio_Live_Core_Dashboard_Codex_Prompt.txt",
      configPath: "C:/Users/joris/Documents/Fund Manager Dashboard/src/data/capitalife/fsportfolio-live-core.config.json",
      config,
      manifest,
      dataQuality: loaded.quality,
      missingSymbols,
      optionalDataFound: Object.entries(manifest.research_optional)
        .filter(([, entry]) => entry.status === "present")
        .map(([symbol]) => symbol),
      backtest: {
        ready: false,
        reason: manifest.reason ? `Final v2 backtest not available - ${manifest.reason}` : `Missing required OHLC: ${missingSymbols.join(", ")}`,
        equityCurve: [],
        assetCurves: {},
        benchmarkCurve: [],
        drawdownCurve: [],
        monthlyReturns: [],
        annualReturns: [],
        rolling12mReturns: [],
        rollingVolatility: [],
        rollingCorrelation: [],
        rebalanceEvents: [],
        currentWeights: [],
        metrics: null,
        nextRebalanceDate: null,
        whiteSwan,
        commonStartDate: null,
        commonEndDate: null,
        oosStartDate: null,
        adaptiveStartDate: null,
        fullCoreStartDate: null,
        backtestAssetDailyReturns: {},
      },
      live: buildLiveResult(loaded.series, whiteSwan.dailyReturns, whiteSwan.currentSignal, extraSleeveReturns),
      caveats: config.caveats,
    };
  }

  // Adaptive backtest: start from 2000-01-03 using available assets with pro-rata weights.
  // When an asset has no data for a date its target weight is redistributed to available assets.
  const ADAPTIVE_START = "2000-01-03";
  const oosStartDate = config.analysis_periods.out_of_sample_start || null;

  const returnMaps: Record<string, Record<string, number>> = {
    SPY: buildDailyReturnMap(loaded.series.SPY ?? []),
    SPMO: buildDailyReturnMap(loaded.series.SPMO ?? []),
    QQQ: buildDailyReturnMap(loaded.series.QQQ ?? []),
    GLD: buildDailyReturnMap(loaded.series.GLD ?? []),
    WHITE_SWAN_NAS_EMA: whiteSwan.dailyReturns,
  };
  const benchmarkDailyReturns = returnMaps.SPY;
  const allSymbols = Object.keys(config.weights);

  // Union of dates where both SPY and QQQ have return data, starting from ADAPTIVE_START.
  const spyDates = new Set(Object.keys(returnMaps.SPY));
  const qqqDates = new Set(Object.keys(returnMaps.QQQ));
  const adaptiveDates = [...spyDates]
    .filter((date) => date >= ADAPTIVE_START && qqqDates.has(date))
    .sort((left, right) => left.localeCompare(right));

  if (!adaptiveDates.length) {
    return {
      portfolioName: config.portfolio_name,
      status: config.status,
      sourcePrompt: "C:/Users/joris/Downloads/FSPortfolio_Live_Core_Dashboard_Codex_Prompt.txt",
      configPath: "C:/Users/joris/Documents/Fund Manager Dashboard/src/data/capitalife/fsportfolio-live-core.config.json",
      config,
      manifest,
      dataQuality: loaded.quality,
      missingSymbols: [],
      optionalDataFound: Object.entries(manifest.research_optional)
        .filter(([, entry]) => entry.status === "present")
        .map(([symbol]) => symbol),
      backtest: {
        ready: false,
        reason: "No common SPY/QQQ timeline found from 2000-01-03.",
        equityCurve: [],
        assetCurves: {},
        benchmarkCurve: [],
        drawdownCurve: [],
        monthlyReturns: [],
        annualReturns: [],
        rolling12mReturns: [],
        rollingVolatility: [],
        rollingCorrelation: [],
        rebalanceEvents: [],
        currentWeights: [],
        metrics: null,
        nextRebalanceDate: null,
        whiteSwan,
        commonStartDate: null,
        commonEndDate: null,
        oosStartDate: null,
        adaptiveStartDate: null,
        fullCoreStartDate: null,
        backtestAssetDailyReturns: {},
      },
      live: buildLiveResult(loaded.series, whiteSwan.dailyReturns, whiteSwan.currentSignal, extraSleeveReturns),
      caveats: config.caveats,
    };
  }

  const adaptiveStartDate = adaptiveDates[0]!;
  const fullCoreStartDate = adaptiveDates.find(
    (date) => allSymbols.every((symbol) => date in returnMaps[symbol]),
  ) ?? null;

  // Daily return aggregation with adaptive weights.
  let equity = config.initial_capital;
  const equityCurve: EquityPoint[] = [];
  const portfolioDailyReturns: Record<string, number> = {};

  for (const date of adaptiveDates) {
    const available = allSymbols.filter((symbol) => date in returnMaps[symbol]);
    const availableTotal = available.reduce((sum, symbol) => sum + config.weights[symbol], 0);
    const dayReturn =
      availableTotal > 0
        ? available.reduce(
            (sum, symbol) => sum + (config.weights[symbol] / availableTotal) * returnMaps[symbol][date],
            0,
          )
        : 0;
    equity *= 1 + dayReturn;
    portfolioDailyReturns[date] = dayReturn;
    equityCurve.push({ date, value: Number(equity.toFixed(2)) });
  }

  // Asset equity curves — each starts at initialCapital on its first available date.
  const assetCurves: Record<string, EquityPoint[]> = {};
  for (const symbol of allSymbols) {
    let assetEquity = config.initial_capital;
    const curve: EquityPoint[] = [];
    let started = false;
    for (const date of adaptiveDates) {
      const r = returnMaps[symbol]?.[date];
      if (r === undefined) continue;
      if (!started) started = true;
      assetEquity *= 1 + r;
      curve.push({ date, value: Number(assetEquity.toFixed(2)) });
    }
    assetCurves[symbol] = curve;
  }

  const benchmarkCurve = buildBenchmarkEquity(adaptiveDates, benchmarkDailyReturns, config.initial_capital);
  const drawdownCurve = computeDrawdownCurve(equityCurve);
  const monthlyReturns = aggregateReturns(portfolioDailyReturns, "month");
  const annualReturns = aggregateReturns(portfolioDailyReturns, "year");
  const rolling12mReturns = computeRollingWindow(monthlyReturns, 12, "return");
  const rollingVolatility = computeRollingWindow(monthlyReturns, 12, "volatility");
  const benchmarkMonthly = aggregateReturns(benchmarkDailyReturns, "month");
  const rollingCorrelation = computeRollingCorrelation(monthlyReturns, benchmarkMonthly, 12);
  const metrics = computePortfolioMetrics({
    initialCapital: config.initial_capital,
    equityCurve,
    dailyReturns: portfolioDailyReturns,
    benchmarkDailyReturns,
    transactionCostAmount: 0,
    turnoverPct: null,
  });
  const currentWeights: PositionWeight[] = buildPositionWeights(config, Object.fromEntries(
    allSymbols.map((symbol) => [symbol, config.initial_capital * config.weights[symbol]]),
  ));

  return {
    portfolioName: config.portfolio_name,
    status: config.status,
    sourcePrompt: "C:/Users/joris/Downloads/FSPortfolio_Live_Core_Dashboard_Codex_Prompt.txt",
    configPath: "C:/Users/joris/Documents/Fund Manager Dashboard/src/data/capitalife/fsportfolio-live-core.config.json",
    config,
    manifest,
    dataQuality: loaded.quality,
    missingSymbols: [],
    optionalDataFound: Object.entries(manifest.research_optional)
      .filter(([, entry]) => entry.status === "present")
      .map(([symbol]) => symbol),
    backtest: {
      ready: true,
      reason: null,
      equityCurve,
      assetCurves,
      benchmarkCurve,
      drawdownCurve,
      monthlyReturns,
      annualReturns,
      rolling12mReturns,
      rollingVolatility,
      rollingCorrelation,
      rebalanceEvents: [],
      currentWeights,
      metrics,
      nextRebalanceDate: nextQuarterEndDate(adaptiveDates.at(-1)!),
      whiteSwan,
      commonStartDate: adaptiveStartDate,
      commonEndDate: adaptiveDates.at(-1) ?? null,
      oosStartDate,
      adaptiveStartDate,
      fullCoreStartDate,
      backtestAssetDailyReturns: { ...returnMaps, ...extraSleeveReturns },
    },
    live: buildLiveResult(loaded.series, whiteSwan.dailyReturns, whiteSwan.currentSignal),
    caveats: config.caveats,
  };
}

// Module-level cache — avoids re-reading OHLC files on every page request
let _snapshotCache: { data: ReturnType<typeof buildReadySnapshot>; ts: number } | null = null;
const SNAPSHOT_TTL_MS = 60 * 1000; // 60 s

export function getFSPortfolioSnapshot() {
  const now = Date.now();
  if (_snapshotCache && now - _snapshotCache.ts < SNAPSHOT_TTL_MS) return _snapshotCache.data;
  const data = buildReadySnapshot();
  _snapshotCache = { data, ts: now };
  return data;
}
