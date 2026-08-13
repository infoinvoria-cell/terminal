import type {
  CapitalRequirementRecord,
  PortfolioDefinition,
  PortfolioMode,
  ScenarioCapitalRow,
  ScenarioConfig,
  ScenarioContributionRow,
  ScenarioMetric,
  ScenarioPoint,
  ScenarioTradeRow,
  TimeRangeKey,
} from "@/lib/portfolio-simulator/types";
import { classifyExecutionFeasibility } from "@/lib/portfolio-simulator/capital-requirements";
import {
  mapExecutionTranslationToFeasibility,
  resolveWhiteSwanExecutionTranslation,
} from "@/lib/white-swan/execution-scaling";

type ReturnPoint = { date: string; returnPct: number };

function cumulativeToReturns(series: PortfolioDefinition["performanceSeries"]): ReturnPoint[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  let previousGrowth = 1;
  return sorted.map((point) => {
    const currentGrowth = 1 + point.cumulativePct / 100;
    const returnPct = ((currentGrowth / previousGrowth) - 1) * 100;
    previousGrowth = currentGrowth;
    return { date: point.date, returnPct: Number(returnPct.toFixed(6)) };
  });
}

function returnsToScenarioPoints(returns: ReturnPoint[], accountSize: number): ScenarioPoint[] {
  let equity = accountSize;
  let peak = accountSize;
  return returns.map((point) => {
    equity *= 1 + point.returnPct / 100;
    peak = Math.max(peak, equity);
    const drawdownPct = peak > 0 ? ((equity / peak) - 1) * 100 : 0;
    return {
      date: point.date,
      equity: Number(equity.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(4)),
      returnPct: point.returnPct,
    };
  });
}

function cutoffDateForRange(lastDate: string, range: TimeRangeKey): string {
  if (range === "MAX") return "1900-01-01";
  const years = range === "1Y" ? 1 : range === "3Y" ? 3 : 5;
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function filterReturnsByRange(points: ReturnPoint[], range: TimeRangeKey): ReturnPoint[] {
  if (points.length === 0) return [];
  const cutoff = cutoffDateForRange(points[points.length - 1]!.date, range);
  return points.filter((point) => point.date >= cutoff);
}

function combinePortfolioReturns(
  whiteSwan: ReturnPoint[],
  coreInvest: ReturnPoint[],
  whiteSwanWeight: number,
  coreInvestWeight: number,
): ReturnPoint[] {
  const whiteByDate = new Map(whiteSwan.map((point) => [point.date, point.returnPct]));
  const coreByDate = new Map(coreInvest.map((point) => [point.date, point.returnPct]));
  const dates = [...new Set([...whiteByDate.keys(), ...coreByDate.keys()])].sort();
  return dates
    .map((date) => {
      const ws = whiteByDate.get(date);
      const ci = coreByDate.get(date);
      if (ws == null || ci == null) return null;
      const combined = ws * whiteSwanWeight + ci * coreInvestWeight;
      return { date, returnPct: Number(combined.toFixed(6)) };
    })
    .filter((point): point is ReturnPoint => point !== null);
}

function calcSharpe(monthlyReturnsPct: number[]): number | null {
  if (monthlyReturnsPct.length < 2) return null;
  const returns = monthlyReturnsPct.map((value) => value / 100);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std === 0) return null;
  return Number(((mean / std) * Math.sqrt(12)).toFixed(4));
}

function calcMetrics(points: ScenarioPoint[], accountSize: number, tradeRows: ScenarioTradeRow[]): ScenarioMetric {
  const endingEquity = points.at(-1)?.equity ?? accountSize;
  const netProfit = endingEquity - accountSize;
  const totalReturnPct = accountSize > 0 ? (netProfit / accountSize) * 100 : 0;
  const startDate = points[0]?.date ?? null;
  const endDate = points.at(-1)?.date ?? null;
  let cagr: number | null = null;
  if (startDate && endDate && accountSize > 0 && endingEquity > 0) {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const years = Math.max((end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000), 1 / 12);
    cagr = Number(((endingEquity / accountSize) ** (1 / years) - 1).toFixed(4));
  }
  const monthlyReturns = points.map((point) => point.returnPct);
  const sharpe = calcSharpe(monthlyReturns);
  const maxDrawdownPct = points.length ? Math.min(...points.map((point) => point.drawdownPct)) : null;
  const calmar = cagr != null && maxDrawdownPct != null && maxDrawdownPct !== 0
    ? Number((cagr / Math.abs(maxDrawdownPct / 100)).toFixed(4))
    : null;
  const pnlValues = tradeRows.map((row) => row.pnlUsd);
  const wins = pnlValues.filter((value) => value > 0);
  const losses = pnlValues.filter((value) => value < 0);
  return {
    endingEquity: Number(endingEquity.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    cagr,
    sharpe,
    calmar,
    maxDrawdownPct: maxDrawdownPct != null ? Number(maxDrawdownPct.toFixed(2)) : null,
    winRate: pnlValues.length ? Number(((wins.length / pnlValues.length) * 100).toFixed(2)) : null,
    profitFactor: losses.length ? Number((wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0))).toFixed(4)) : null,
    trades: pnlValues.length,
    worstTradeUsd: pnlValues.length ? Math.min(...pnlValues) : null,
    bestTradeUsd: pnlValues.length ? Math.max(...pnlValues) : null,
  };
}

function scaleCapitalRows(
  rows: CapitalRequirementRecord[],
  sleeveCapitalUsd: number,
  sleevePctOfAccount: number,
  config?: ScenarioConfig,
): ScenarioCapitalRow[] {
  return rows.map((row) => {
    const effectiveAccountWeightPct = Number((row.portfolioWeightPct * sleevePctOfAccount).toFixed(4));
    const modelReferenceUnitsEffective = Number((row.modelReferenceUnits * sleevePctOfAccount).toFixed(4));
    const executionTranslation =
      config && sleevePctOfAccount > 0
        ? resolveWhiteSwanExecutionTranslation(row, config, sleeveCapitalUsd, effectiveAccountWeightPct)
        : null;
    const weightedLossContributionUsd =
      row.largestReliableLossUsd != null
        ? Number((row.largestReliableLossUsd * modelReferenceUnitsEffective).toFixed(2))
        : null;
    return {
      ...row,
      sleeveCapitalUsd: Number(sleeveCapitalUsd.toFixed(2)),
      effectiveAccountWeightPct,
      modelReferenceUnitsEffective,
      historicalLossAsPctOfSleeve:
        row.largestReliableLossUsd != null && sleeveCapitalUsd > 0
          ? Number(((Math.abs(row.largestReliableLossUsd) / sleeveCapitalUsd) * 100).toFixed(2))
          : null,
      weightedLossContributionUsd,
      executionFeasibility:
        executionTranslation != null
          ? mapExecutionTranslationToFeasibility(executionTranslation)
          : classifyExecutionFeasibility(modelReferenceUnitsEffective, row.minimumBrokerExecutableUnit),
      executableUnits:
        executionTranslation?.brokerQuantity != null
          ? executionTranslation.brokerQuantity
          : row.minimumBrokerExecutableUnit != null && modelReferenceUnitsEffective >= row.minimumBrokerExecutableUnit
            ? Math.floor(modelReferenceUnitsEffective / row.minimumBrokerExecutableUnit) * row.minimumBrokerExecutableUnit
            : null,
      executionTranslation,
    };
  });
}

function buildContributionRows(
  portfolio: PortfolioDefinition,
  sleevePctOfAccount: number,
  capitalRows: ScenarioCapitalRow[],
): ScenarioContributionRow[] {
  const capitalByStrategy = new Map(capitalRows.map((row) => [row.strategyId, row]));
  return portfolio.capitalRequirements.map((row) => {
    const scenarioRow = capitalByStrategy.get(row.strategyId);
    return {
      key: `${portfolio.id}:${row.strategyId}`,
      portfolio: portfolio.label,
      strategy: row.displayName,
      family: row.family,
      internalWeightPct: row.portfolioWeightPct,
      effectiveAccountWeightPct: Number((row.portfolioWeightPct * sleevePctOfAccount).toFixed(4)),
      historicalPnlContributionUsd:
        row.largestReliableWinUsd != null ? Number((row.largestReliableWinUsd * row.modelReferenceUnits * sleevePctOfAccount).toFixed(2)) : null,
      historicalLossContributionUsd: scenarioRow?.weightedLossContributionUsd ?? null,
      historicalDrawdownContributionUsd:
        row.maxDrawdownUsd != null ? Number((row.maxDrawdownUsd * row.modelReferenceUnits * sleevePctOfAccount).toFixed(2)) : null,
    };
  });
}

function buildScenarioTrades(
  sourceRows: PortfolioDefinition["tradeRows"],
  sleevePctOfAccount: number,
  accountSize: number,
): ScenarioTradeRow[] {
  const scaled = [...sourceRows]
    .sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.id.localeCompare(b.id))
    .map((row) => ({
      ...row,
      modelQuantity: row.modelQuantity != null ? Number((row.modelQuantity * sleevePctOfAccount).toFixed(4)) : null,
      executableQuantity:
        row.executableQuantity != null && row.modelQuantity != null && row.modelQuantity * sleevePctOfAccount >= row.executableQuantity
          ? row.executableQuantity
          : row.executableQuantity === 0 ? 0 : null,
      pnlUsd: Number((row.pnlUsd * sleevePctOfAccount * (accountSize / 10000)).toFixed(2)),
      portfolioContributionUsd: 0,
      runningEquity: 0,
    }));

  let runningEquity = accountSize;
  return scaled.map((row) => {
    runningEquity += row.pnlUsd;
    return {
      ...row,
      portfolioContributionUsd: row.pnlUsd,
      runningEquity: Number(runningEquity.toFixed(2)),
    };
  });
}

export function resolveAllocations(config: ScenarioConfig): { whiteSwanPct: number; coreInvestPct: number } {
  if (config.mode === "white-swan") return { whiteSwanPct: 100, coreInvestPct: 0 };
  if (config.mode === "core-invest") return { whiteSwanPct: 0, coreInvestPct: 100 };
  return { whiteSwanPct: config.whiteSwanPct, coreInvestPct: config.coreInvestPct };
}

export function runScenario(
  config: ScenarioConfig,
  whiteSwan: PortfolioDefinition,
  coreInvest: PortfolioDefinition,
) {
  const allocations = resolveAllocations(config);
  const wsWeight = allocations.whiteSwanPct / 100;
  const ciWeight = allocations.coreInvestPct / 100;
  const wsReturnsAll = cumulativeToReturns(whiteSwan.performanceSeries);
  const ciReturnsAll = cumulativeToReturns(coreInvest.performanceSeries);

  const baseReturnsAll =
    config.mode === "white-swan"
      ? wsReturnsAll
      : config.mode === "core-invest"
        ? ciReturnsAll
        : combinePortfolioReturns(wsReturnsAll, ciReturnsAll, wsWeight, ciWeight);

  const returns = filterReturnsByRange(baseReturnsAll, config.range);
  const points = returnsToScenarioPoints(returns, config.accountSize);
  const whiteSwanSleeveCapital = Number((config.accountSize * wsWeight).toFixed(2));
  const coreInvestSleeveCapital = Number((config.accountSize * ciWeight).toFixed(2));
  const whiteSwanCapital = scaleCapitalRows(whiteSwan.capitalRequirements, whiteSwanSleeveCapital, wsWeight, config);
  const coreInvestCapital = scaleCapitalRows(coreInvest.capitalRequirements, coreInvestSleeveCapital, ciWeight);
  const contributionRows = [
    ...buildContributionRows(whiteSwan, wsWeight, whiteSwanCapital),
    ...buildContributionRows(coreInvest, ciWeight, coreInvestCapital),
  ];
  const tradeRows = [
    ...buildScenarioTrades(whiteSwan.tradeRows, wsWeight, config.accountSize),
    ...buildScenarioTrades(coreInvest.tradeRows, ciWeight, config.accountSize),
  ].sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.id.localeCompare(b.id));

  return {
    allocations,
    points,
    metrics: calcMetrics(points, config.accountSize, tradeRows),
    whiteSwanSleeveCapital,
    coreInvestSleeveCapital,
    capitalRows: config.mode === "core-invest" ? coreInvestCapital : config.mode === "white-swan" ? whiteSwanCapital : [...whiteSwanCapital, ...coreInvestCapital],
    contributionRows: contributionRows.filter((row) => (row.portfolio === "White Swan" ? wsWeight > 0 : ciWeight > 0)),
    tradeRows: tradeRows.filter((row) => row.portfolio === "White Swan" ? wsWeight > 0 : ciWeight > 0),
    returnSeriesPct: returns.map((point) => point.returnPct),
  };
}
