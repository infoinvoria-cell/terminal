import type { DailyEquityRow, DailyReturnRow, TrackRecordMetricRow, TrackRecordSourceKind, TrackRecordProvider } from "@/lib/track-record/types";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeMetricsFromDailySeries(input: {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  equityRows: DailyEquityRow[];
  returnRows: DailyReturnRow[];
  scope?: "account" | "darwin";
  calculationSource: string;
}): TrackRecordMetricRow[] {
  const { source, provider, providerAccountId, equityRows, returnRows, scope = "account", calculationSource } = input;
  const asOfUtc = new Date().toISOString();
  const metrics: TrackRecordMetricRow[] = [];

  const returns = returnRows
    .map((row) => row.returnPct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const equity = equityRows
    .map((row) => row.equity)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (equity.length >= 2) {
    const start = equity[0];
    const end = equity[equity.length - 1];
    const totalReturnPct = start !== 0 ? ((end / start) - 1) * 100 : null;
    if (totalReturnPct !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "total_return_pct", round(totalReturnPct, 2), asOfUtc, calculationSource));
    }

    let peak = equity[0];
    let maxDrawdownPct = 0;
    for (const value of equity) {
      peak = Math.max(peak, value);
      if (peak > 0) {
        maxDrawdownPct = Math.min(maxDrawdownPct, ((value / peak) - 1) * 100);
      }
    }
    metrics.push(metric(source, provider, providerAccountId, scope, "max_drawdown_pct", round(maxDrawdownPct, 2), asOfUtc, calculationSource));
  }

  if (returns.length) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
    const stdev = Math.sqrt(variance);
    const sharpe = stdev > 0 ? mean / stdev : null;
    const positive = returns.filter((value) => value > 0);
    const negative = returns.filter((value) => value < 0);
    const grossProfit = positive.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
    const compounded = returns.reduce((equityValue, value) => equityValue * (1 + value / 100), 1);
    const annualized = returns.length > 0 ? ((compounded ** (365 / returns.length)) - 1) * 100 : null;

    metrics.push(metric(source, provider, providerAccountId, scope, "mean_daily_return_pct", round(mean, 4), asOfUtc, calculationSource));
    if (sharpe !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "daily_sharpe_proxy", round(sharpe, 4), asOfUtc, calculationSource));
    }
    if (profitFactor !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "profit_factor_proxy", round(profitFactor, 4), asOfUtc, calculationSource));
    }
    if (annualized !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "annualized_return_proxy_pct", round(annualized, 2), asOfUtc, calculationSource));
    }
  }

  metrics.push(metric(source, provider, providerAccountId, scope, "daily_points", returnRows.length, asOfUtc, calculationSource));
  return metrics;
}

function metric(
  source: TrackRecordSourceKind,
  provider: TrackRecordProvider,
  providerAccountId: string,
  metricScope: "account" | "darwin",
  metricName: string,
  metricValue: number | string,
  asOfUtc: string,
  calculationSource: string,
): TrackRecordMetricRow {
  return {
    source,
    provider,
    providerAccountId,
    metricScope,
    metricName,
    metricValue,
    metricDateUtc: null,
    asOfUtc,
    isVerified: source !== "internal_computed",
    calculationSource,
  };
}
