import type { MonitoringMvaTrade } from "@/lib/monitoring/strategyTester/types";
import type { MvaWalkForwardFold, MvaWalkForwardResult } from "./types";
import { computeMetrics } from "./metrics";

type SimpleRun = {
  trades: MonitoringMvaTrade[];
  inputHash: string;
};

function isoYear(date: string): number {
  return Number(date.slice(0, 4));
}

function aggregateOosTrades(folds: MvaWalkForwardFold[]): MonitoringMvaTrade[] {
  return folds.flatMap((fold) => {
    const count = Math.round(fold.oosMetrics.totalTrades ?? 0);
    return Array.from({ length: count }).map((_, index) => ({
      tradeNo: index + 1,
      direction: "LONG" as const,
      entryDate: fold.oosStart,
      exitDate: fold.oosEnd,
      entryPrice: 0,
      exitPrice: 0,
      returnPct: Number(fold.oosMetrics.avgReturnPct ?? 0),
      pnlNet: Number(fold.oosMetrics.avgReturnPct ?? 0),
      cumulativePnl: 0,
      cumulativeReturnPct: Number(fold.oosMetrics.netReturnPct ?? 0),
    }));
  });
}

export function buildWalkForwardResult(symbol: string, runs: Array<{ train: SimpleRun; oos: SimpleRun; trainStart: string; trainEnd: string; oosStart: string; oosEnd: string }>): MvaWalkForwardResult {
  const folds: MvaWalkForwardFold[] = runs.map((run) => {
    const trainMetrics = computeMetrics(run.train.trades);
    const oosMetrics = computeMetrics(run.oos.trades);
    const numericRecord = (source: Record<string, unknown>): Record<string, number> =>
      Object.fromEntries(
        Object.entries(source).map(([key, value]) => [key, typeof value === "number" && Number.isFinite(value) ? value : 0]),
      );
    return {
      trainStart: run.trainStart,
      trainEnd: run.trainEnd,
      oosStart: run.oosStart,
      oosEnd: run.oosEnd,
      selectedInputsHash: run.train.inputHash,
      trainMetrics: numericRecord(trainMetrics as Record<string, unknown>),
      oosMetrics: numericRecord(oosMetrics as Record<string, unknown>),
    };
  });

  const oosMetrics = computeMetrics(aggregateOosTrades(folds));
  const calmar = Math.abs(oosMetrics.maxDrawdownPct) > 0 ? oosMetrics.netReturnPct / Math.abs(oosMetrics.maxDrawdownPct) : 0;
  const robustnessStatus =
    folds.length < 2 ? "insufficient" :
    oosMetrics.totalTrades < 5 ? "weak" :
    oosMetrics.profitFactor >= 1.4 && calmar >= 0.8 ? "strong" :
    oosMetrics.profitFactor >= 1.1 ? "promising" :
    "failed";

  return {
    symbol,
    folds,
    oosAggregate: {
      trades: oosMetrics.totalTrades,
      netReturn: oosMetrics.netReturnPct,
      profitFactor: oosMetrics.profitFactor,
      maxDrawdown: oosMetrics.maxDrawdownPct,
      calmar,
      winrate: oosMetrics.winratePct,
    },
    robustnessStatus,
  };
}

export function buildWalkForwardWindows(studyStart: string, studyEnd: string, initialTrainingYears = 5, oosBlockYears = 1): Array<{ trainStart: string; trainEnd: string; oosStart: string; oosEnd: string }> {
  const startYear = isoYear(studyStart);
  const endYear = isoYear(studyEnd);
  const windows: Array<{ trainStart: string; trainEnd: string; oosStart: string; oosEnd: string }> = [];
  let trainStartYear = startYear;

  for (let trainEndYear = startYear + initialTrainingYears - 1; trainEndYear < endYear; trainEndYear += oosBlockYears) {
    const oosStartYear = trainEndYear + 1;
    const oosEndYear = Math.min(oosStartYear + oosBlockYears - 1, endYear);
    if (oosStartYear > endYear) break;
    windows.push({
      trainStart: `${trainStartYear}-01-01`,
      trainEnd: `${trainEndYear}-12-31`,
      oosStart: `${oosStartYear}-01-01`,
      oosEnd: `${oosEndYear}-12-31`,
    });
  }

  return windows;
}
