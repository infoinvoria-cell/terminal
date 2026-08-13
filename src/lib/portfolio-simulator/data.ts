import fs from "node:fs";
import path from "node:path";
import analyticsGenerated from "@/data/capitalife/analytics-generated.json";
import qqqInvestTrades from "@/data/capitalife/fsportfolio/backtests/qqq-invest-pine-trades.json";
import eurusdEvents from "@/data/capitalife/monitoring-events/CME_6E1_30M_events.json";
import dax1hEvents from "@/data/capitalife/monitoring-events/EUREX_FDAX1_1H_events.json";
import dax2hEvents from "@/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events_clean.json";
import gldThursday from "../../../public/data/anomaly/gld_thursday_long.json";
import ym1Tat from "../../../public/data/anomaly/ym1_tat.json";
import type {
  CapitalRequirementRecord,
  PortfolioDefinition,
  PortfolioLabBootstrap,
  PortfolioTradeRow,
  ScenarioConfig,
} from "@/lib/portfolio-simulator/types";
import { buildWhiteSwanCapitalRequirements } from "@/lib/portfolio-simulator/capital-requirements";

type AnalyticsPoint = { date: string; value: number | null };
type AnalyticsDataset = {
  performanceSeries: AnalyticsPoint[];
};

type AuditArtifact = {
  artifact: string;
  masterTable: Array<Record<string, unknown>>;
  strategies: number;
  weightsSumPct: number;
  rawRegistryUsedForCalculations: boolean;
  acceptance: {
    WHITE_SWAN_17_CAPITAL_RISK_TRUTH: string;
  };
};

function loadAuditArtifact(): AuditArtifact {
  const auditPath = path.join(process.cwd(), ".runtime", "white-swan", "WHITE_SWAN_17_CAPITAL_RISK_AUDIT_V1.json");
  if (!fs.existsSync(auditPath)) {
    return { artifact: "WHITE_SWAN_17_CAPITAL_RISK_AUDIT_V1", masterTable: [], strategies: 0, weightsSumPct: 0, rawRegistryUsedForCalculations: false, acceptance: { WHITE_SWAN_17_CAPITAL_RISK_TRUTH: "" } };
  }
  return JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditArtifact;
}

function numericSeries(series: AnalyticsPoint[]) {
  return series
    .filter((point): point is { date: string; value: number } => point.value != null && Number.isFinite(point.value))
    .map((point) => ({ date: point.date, cumulativePct: Number(point.value.toFixed(4)) }));
}

function buildWhiteSwanTradeRows(capitalRows: CapitalRequirementRecord[]): PortfolioTradeRow[] {
  const byId = new Map(capitalRows.map((row) => [row.strategyId, row]));
  const rows: PortfolioTradeRow[] = [];

  for (const trade of eurusdEvents.trades) {
    if (trade.isOpen || trade.exitTime == null) continue;
    const row: PortfolioTradeRow = {
      id: `eurusd-${trade.entryTime}`,
      portfolio: "White Swan",
      strategy: byId.get("eurusd_mt_30m_eurusd_30m")?.displayName ?? "EURUSD 30M",
      family: "Intraday",
      evidenceType: "CANONICAL",
      direction: trade.direction.toUpperCase(),
      signalInstrument: "EURUSD",
      executionInstrument: "EURUSD",
      modelQuantity: byId.get("eurusd_mt_30m_eurusd_30m")?.modelReferenceUnits ?? null,
      executableQuantity: 0,
      executionFeasibility: "NOT_GRANULAR",
      entryDate: trade.entryTime.slice(0, 10),
      exitDate: trade.exitTime.slice(0, 10),
      entry: trade.entry,
      exit: trade.exit,
      pnlUsd: trade.pnl,
      pnlPct: null,
      status: "CANONICAL",
    };
    rows.push(row);
  }

  for (const trade of dax1hEvents.trades) {
    const row: PortfolioTradeRow = {
      id: `dax1h-${trade.entryTime}`,
      portfolio: "White Swan",
      strategy: byId.get("mt_dax_1h_de30eur_1h")?.displayName ?? "DAX 1H",
      family: "Intraday",
      evidenceType: "CANONICAL",
      direction: trade.direction.toUpperCase(),
      signalInstrument: "FDAX1!",
      executionInstrument: "FDAX1!",
      modelQuantity: byId.get("mt_dax_1h_de30eur_1h")?.modelReferenceUnits ?? null,
      executableQuantity: 0,
      executionFeasibility: "NOT_GRANULAR",
      entryDate: trade.entryTime.slice(0, 10),
      exitDate: trade.exitTime?.slice(0, 10) ?? null,
      entry: trade.entry,
      exit: trade.exit,
      pnlUsd: trade.pnl,
      pnlPct: null,
      status: "CANONICAL",
    };
    rows.push(row);
  }

  for (const trade of dax2hEvents.trades.slice(0, 500)) {
    const row: PortfolioTradeRow = {
      id: String(trade.id),
      portfolio: "White Swan",
      strategy: byId.get("trend_momentum_dax_2h_de30eur_2h")?.displayName ?? "DAX 2H",
      family: "Intraday",
      evidenceType: "CANONICAL",
      direction: String(trade.direction),
      signalInstrument: "FDAX1!",
      executionInstrument: "FDAX1!",
      modelQuantity: byId.get("trend_momentum_dax_2h_de30eur_2h")?.modelReferenceUnits ?? null,
      executableQuantity: 0,
      executionFeasibility: "NOT_GRANULAR",
      entryDate: String(trade.entryTimestamp).slice(0, 10),
      exitDate: String(trade.exitTimestamp).slice(0, 10),
      entry: Number(trade.entryPrice),
      exit: Number(trade.exitPrice),
      pnlUsd: Number(trade.grossR) * 100,
      pnlPct: null,
      status: "CANONICAL",
    };
    rows.push(row);
  }

  for (const trade of gldThursday.trades) {
    const row: PortfolioTradeRow = {
      id: `gld-${trade.entry_time}`,
      portfolio: "White Swan",
      strategy: byId.get("FP10_GLD_THURSDAY_LONG")?.displayName ?? "GLD Thursday Long",
      family: "Anomaly",
      evidenceType: "CANONICAL",
      direction: "LONG",
      signalInstrument: "GLD",
      executionInstrument: "GLD",
      modelQuantity: byId.get("FP10_GLD_THURSDAY_LONG")?.modelReferenceUnits ?? null,
      executableQuantity: 1,
      executionFeasibility: "EXECUTION_APPROXIMATE",
      entryDate: String(trade.entry_time).slice(0, 10),
      exitDate: String(trade.exit_time).slice(0, 10),
      entry: Number(trade.entry_price),
      exit: Number(trade.exit_price),
      pnlUsd: Number(trade.pnl),
      pnlPct: null,
      status: "CANONICAL",
    };
    rows.push(row);
  }

  for (const trade of ym1Tat.trades) {
    const row: PortfolioTradeRow = {
      id: `ym1-${trade.entry_time}`,
      portfolio: "White Swan",
      strategy: byId.get("FP10_YM1_TAT")?.displayName ?? "YM1 TAT",
      family: "Anomaly",
      evidenceType: "CANONICAL",
      direction: "LONG",
      signalInstrument: "YM1!",
      executionInstrument: "YM1!",
      modelQuantity: byId.get("FP10_YM1_TAT")?.modelReferenceUnits ?? null,
      executableQuantity: 0,
      executionFeasibility: "NOT_GRANULAR",
      entryDate: String(trade.entry_time).slice(0, 10),
      exitDate: String(trade.exit_time).slice(0, 10),
      entry: Number(trade.entry_price),
      exit: Number(trade.exit_price),
      pnlUsd: Number(trade.pnl),
      pnlPct: null,
      status: "CANONICAL",
    };
    rows.push(row);
  }

  return rows;
}

function buildCoreInvestCapitalRequirements(): CapitalRequirementRecord[] {
  const entries = [
    { strategyId: "QQQ_PASSIVE", displayName: "QQQ Passive", family: "Asset", weight: 45, instrument: "QQQ", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: null, unit: "1 share QQQ" },
    { strategyId: "GLD", displayName: "GLD", family: "Asset", weight: 25, instrument: "GLD", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: null, unit: "1 share GLD" },
    { strategyId: "SPMO", displayName: "SPMO", family: "Asset", weight: 5, instrument: "SPMO", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: null, unit: "1 share SPMO" },
    { strategyId: "SPY", displayName: "SPY", family: "Asset", weight: 5, instrument: "SPY", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: null, unit: "1 share SPY" },
    { strategyId: "QQQ_PINE_1", displayName: "QQQ Pine 1", family: "Strategy", weight: 10, instrument: "QQQ", evidence: "CANONICAL" as const, loss: -252.5931, ddPct: 6.8782, unit: "50% capital QQQ Pine model unit" },
    { strategyId: "COPPER_HG", displayName: "Copper/HG", family: "Strategy", weight: 5, instrument: "HG1!", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: 40.43, unit: "1 reference sleeve unit" },
    { strategyId: "CHF_6S", displayName: "CHF/6S", family: "Strategy", weight: 5, instrument: "6S1!", evidence: "CANONICAL_SUMMARY" as const, loss: null, ddPct: 23.66, unit: "1 reference sleeve unit" },
  ];
  return entries.map((entry) => ({
    strategyId: entry.strategyId,
    displayName: entry.displayName,
    family: entry.family,
    portfolioWeightPct: entry.weight,
    historicalSizingMode: "core_invest_reference",
    historicalReferenceInstrument: entry.instrument,
    historicalReferenceQuantity: 1,
    historicalReferenceUnit: entry.unit,
    evidenceType: entry.evidence,
    authoritativeEvidenceType: entry.evidence,
    largestLossEvidenceType: entry.evidence,
    largestReliableWinUsd: null,
    largestReliableLossUsd: entry.loss,
    reconstructedLargestLossUsd: null,
    largestLossUsedForCapitalCalculation: entry.loss,
    maxDrawdownUsd: null,
    maxDrawdownPct: entry.ddPct,
    hasHardStop: false,
    plannedRiskPerReferenceUnit: "NOT_DEFINED",
    capitalForWorstLossAt1Pct: entry.loss != null ? Math.abs(entry.loss) / 0.01 : null,
    capitalForWorstLossAt2Pct: entry.loss != null ? Math.abs(entry.loss) / 0.02 : null,
    capitalForWorstLossAt3Pct: entry.loss != null ? Math.abs(entry.loss) / 0.03 : null,
    capitalForWorstLossAt5Pct: entry.loss != null ? Math.abs(entry.loss) / 0.05 : null,
    capitalForWorstLossAt10Pct: entry.loss != null ? Math.abs(entry.loss) / 0.1 : null,
    modelReferenceUnits: Number((entry.weight / 100).toFixed(4)),
    minimumBrokerExecutableUnit: entry.instrument.endsWith("!") ? 1 : 1,
    sourceArtifact: "src/data/capitalife/analytics-generated.json",
    canonicalStatus: null,
    canonicalSummaryAvailable: entry.evidence === "CANONICAL_SUMMARY",
    canonicalLargestLossAvailable: entry.loss != null,
    confidence: entry.evidence === "CANONICAL" ? "HIGH" : "MEDIUM",
    granularityClassification: entry.instrument.endsWith("!") ? "NOT_GRANULAR" : "EXECUTION_APPROXIMATED_BY_SHARE",
  }));
}

function buildCoreInvestTrades(): PortfolioTradeRow[] {
  return qqqInvestTrades.trades.map((trade) => {
    const row: PortfolioTradeRow = {
      id: `qqq-pine-${trade.entryDate}`,
      portfolio: "Core Invest",
      strategy: "QQQ Pine 1",
      family: "Strategy",
      evidenceType: "CANONICAL",
      direction: "LONG",
      signalInstrument: "QQQ",
      executionInstrument: "QQQ",
      modelQuantity: Number(trade.quantity),
      executableQuantity: 1,
      executionFeasibility: "EXECUTION_APPROXIMATE",
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entry: Number(trade.entryPrice),
      exit: Number(trade.exitPrice),
      pnlUsd: Number(trade.netPnl),
      pnlPct: Number(trade.returnPct),
      status: "CANONICAL",
    };
    return row;
  });
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, payload: unknown) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch { /* .runtime/ may be absent or read-only in cloud environments */ }
}

export function getPortfolioLabBootstrap(): PortfolioLabBootstrap {
  const audit = loadAuditArtifact();
  const whiteSwanCapital = buildWhiteSwanCapitalRequirements(audit as never);
  const coreInvestCapital = buildCoreInvestCapitalRequirements();

  const whiteSwan: PortfolioDefinition = {
    id: "white-swan",
    label: "White Swan",
    sourceLabel: "Accepted White Swan 17 audit + analytics generated backtest",
    componentsCount: audit.strategies,
    weightsSumPct: audit.weightsSumPct,
    performanceSeries: numericSeries((analyticsGenerated.whiteSwanBacktest as AnalyticsDataset).performanceSeries),
    capitalRequirements: whiteSwanCapital,
    tradeRows: buildWhiteSwanTradeRows(whiteSwanCapital),
  };

  const coreInvest: PortfolioDefinition = {
    id: "core-invest",
    label: "Core Invest",
    sourceLabel: "Core Invest analytics backtest + QQQ Pine canonical trade export",
    componentsCount: coreInvestCapital.length,
    weightsSumPct: Number(coreInvestCapital.reduce((sum, row) => sum + row.portfolioWeightPct, 0).toFixed(2)),
    performanceSeries: numericSeries((analyticsGenerated.investBacktest as AnalyticsDataset).performanceSeries),
    capitalRequirements: coreInvestCapital,
    tradeRows: buildCoreInvestTrades(),
  };

  const bootstrap: PortfolioLabBootstrap = {
    generatedAt: new Date().toISOString(),
    whiteSwan,
    coreInvest,
    defaultScenario: {
      mode: "combined",
      accountSize: 20000,
      currency: "USD",
      whiteSwanPct: 50,
      coreInvestPct: 50,
      range: "MAX",
    },
    availableRanges: ["1Y", "3Y", "5Y", "MAX"],
  };

  writeJson(
    path.join(process.cwd(), ".runtime", "white-swan", "WHITE_SWAN_17_MINIMUM_CAPITAL_V1.json"),
    {
      generatedAt: bootstrap.generatedAt,
      sourceArtifact: audit.artifact,
      strategies: whiteSwanCapital.length,
      rawRegistryUsedForCalculations: audit.rawRegistryUsedForCalculations,
      entries: whiteSwanCapital,
    },
  );

  return bootstrap;
}
