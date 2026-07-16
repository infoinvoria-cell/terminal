import type { MonitoringStrategyParityValidation } from "@/lib/monitoring/strategyTester/types";
import type { MonitoringMvaTrade } from "@/lib/monitoring/strategyTester/types";

function normalizeTradeDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function metricPair(name: string, engineValue: number | null, csvValue: number | null, tolerance = 0.0001) {
  const delta = engineValue == null || csvValue == null ? null : engineValue - csvValue;
  return {
    name,
    engineValue,
    csvValue,
    delta,
    passed: delta == null ? false : Math.abs(delta) <= tolerance,
  };
}

export function buildValidation(symbol: string, engineTrades: MonitoringMvaTrade[], csvTrades: MonitoringMvaTrade[] | null): MonitoringStrategyParityValidation | null {
  if (!csvTrades) {
    return {
      symbol,
      strategyKind: "macro_valuation",
      engineTradeCount: engineTrades.length,
      csvTradeCount: 0,
      tradeCountDelta: engineTrades.length,
      tradeCountMatches: false,
      metrics: [],
      parityStatus: "blocked_missing_csv_reference",
    };
  }

  const firstMismatch = (() => {
    const length = Math.min(engineTrades.length, csvTrades.length);
    for (let index = 0; index < length; index += 1) {
      const engine = engineTrades[index]!;
      const csv = csvTrades[index]!;
      const engineEntryDate = normalizeTradeDate(engine.entryDate);
      const csvEntryDate = normalizeTradeDate(csv.entryDate);
      const engineExitDate = normalizeTradeDate(engine.exitDate);
      const csvExitDate = normalizeTradeDate(csv.exitDate);
      if (engine.direction !== csv.direction) {
        return {
          tradeIndex: index + 1,
          field: "direction" as const,
          engineValue: engine.direction,
          csvValue: csv.direction,
          likelyCause: "signal_rule_mismatch",
        };
      }
      if (engineEntryDate !== csvEntryDate) {
        return {
          tradeIndex: index + 1,
          field: "entryDate" as const,
          engineValue: engineEntryDate,
          csvValue: csvEntryDate,
          likelyCause: "execution_timing_mismatch",
        };
      }
      if (engineExitDate !== csvExitDate) {
        return {
          tradeIndex: index + 1,
          field: "exitDate" as const,
          engineValue: engineExitDate,
          csvValue: csvExitDate,
          likelyCause: "exit_logic_mismatch",
        };
      }
      if (Math.abs(engine.entryPrice - csv.entryPrice) > 0.01) {
        return {
          tradeIndex: index + 1,
          field: "entryPrice" as const,
          engineValue: engine.entryPrice,
          csvValue: csv.entryPrice,
          likelyCause: "execution_timing_mismatch",
        };
      }
      if (Math.abs(engine.exitPrice - csv.exitPrice) > 0.01) {
        return {
          tradeIndex: index + 1,
          field: "exitPrice" as const,
          engineValue: engine.exitPrice,
          csvValue: csv.exitPrice,
          likelyCause: "exit_logic_mismatch",
        };
      }
    }
    return undefined;
  })();

  const engineNet = engineTrades.at(-1)?.cumulativeReturnPct ?? 0;
  const csvNet = csvTrades.at(-1)?.cumulativeReturnPct ?? 0;
  const metrics = [
    metricPair("trade_count", engineTrades.length, csvTrades.length, 0),
    metricPair("net_return_pct", engineNet, csvNet, 0.25),
    metricPair("avg_trade_pct", average(engineTrades.map((trade) => trade.returnPct)), average(csvTrades.map((trade) => trade.returnPct)), 0.1),
  ];
  const tradeCountDelta = engineTrades.length - csvTrades.length;
  const metricPassCount = metrics.filter((metric) => metric.passed).length;
  const metricParityClose = metricPassCount >= Math.max(1, metrics.length - 1);

  const parityStatus =
    !firstMismatch && tradeCountDelta === 0 && metrics.every((metric) => metric.passed)
      ? "exact_trade_parity"
      : metricParityClose
        ? "close_metric_parity"
        : firstMismatch?.likelyCause === "execution_timing_mismatch" && Math.abs(tradeCountDelta) <= 5
          ? "blocked_missing_execution_assumption"
          : "mismatch_remaining";

  return {
    symbol,
    strategyKind: "macro_valuation",
    engineTradeCount: engineTrades.length,
    csvTradeCount: csvTrades.length,
    tradeCountDelta,
    tradeCountMatches: engineTrades.length === csvTrades.length,
    firstMismatch,
    metrics,
    parityStatus,
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
