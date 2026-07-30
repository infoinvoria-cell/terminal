import type { DailyEquityRow, DailyReturnRow, TrackRecordMetricRow, TrackRecordSourceKind, TrackRecordProvider } from "@/lib/track-record/types";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type DatedReturn = { dateUtc: string; returnPct: number };

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

  const datedReturns = dedupeAndSortReturns(returnRows);
  const returns = datedReturns.map((row) => row.returnPct);
  const equity = dedupeAndSortEquity(equityRows);

  if (equity.length >= 2) {
    const start = equity[0].equity;
    const end = equity[equity.length - 1].equity;
    const totalReturnPct = start !== 0 ? ((end / start) - 1) * 100 : null;
    if (totalReturnPct !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "total_return_pct", round(totalReturnPct, 2), asOfUtc, calculationSource));
    }

    let peak = equity[0].equity;
    let maxDrawdownPct = 0;
    let longestDrawdownDays = 0;
    let drawdownStartedAt: string | null = null;
    for (const row of equity) {
      const value = row.equity;
      peak = Math.max(peak, value);
      if (peak > 0) {
        const drawdown = ((value / peak) - 1) * 100;
        maxDrawdownPct = Math.min(maxDrawdownPct, drawdown);
        if (drawdown < 0 && drawdownStartedAt === null) drawdownStartedAt = row.dateUtc;
        if (drawdown >= 0) drawdownStartedAt = null;
        if (drawdownStartedAt) {
          longestDrawdownDays = Math.max(longestDrawdownDays, elapsedDays(drawdownStartedAt, row.dateUtc));
        }
      }
    }
    metrics.push(metric(source, provider, providerAccountId, scope, "max_drawdown_pct", round(maxDrawdownPct, 2), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "longest_drawdown_calendar_days", longestDrawdownDays, asOfUtc, calculationSource));

    const calendarDays = Math.max(1, elapsedDays(equity[0].dateUtc, equity[equity.length - 1].dateUtc));
    if (start > 0 && end >= 0) {
      const annualizedReturnPct = ((end / start) ** (365.2425 / calendarDays) - 1) * 100;
      metrics.push(metric(source, provider, providerAccountId, scope, "annualized_return_pct", round(annualizedReturnPct, 2), asOfUtc, calculationSource));
      if (maxDrawdownPct < 0) {
        metrics.push(metric(source, provider, providerAccountId, scope, "calmar_ratio", round((annualizedReturnPct / 100) / Math.abs(maxDrawdownPct / 100), 4), asOfUtc, calculationSource));
      }
    }
  }

  if (returns.length) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.length > 1
      ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1)
      : 0;
    const stdev = Math.sqrt(variance);
    const sharpe = stdev > 0 ? (mean / stdev) * Math.sqrt(252) : null;
    const downsideDeviation = Math.sqrt(
      returns.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / returns.length,
    );
    const sortino = downsideDeviation > 0 ? (mean / downsideDeviation) * Math.sqrt(252) : null;
    const positive = returns.filter((value) => value > 0);
    const negative = returns.filter((value) => value < 0);
    const compounded = returns.reduce((value, dailyReturn) => value * (1 + dailyReturn / 100), 1);

    metrics.push(metric(source, provider, providerAccountId, scope, "mean_daily_return_pct", round(mean, 4), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "geometric_total_return_pct", round((compounded - 1) * 100, 2), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "annualized_volatility_pct", round(stdev * Math.sqrt(252), 4), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "positive_day_rate_pct", round((positive.length / returns.length) * 100, 2), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "best_day_pct", round(Math.max(...returns), 4), asOfUtc, calculationSource));
    metrics.push(metric(source, provider, providerAccountId, scope, "worst_day_pct", round(Math.min(...returns), 4), asOfUtc, calculationSource));
    if (sharpe !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "sharpe_ratio_annualized_zero_rf", round(sharpe, 4), asOfUtc, calculationSource));
    }
    if (sortino !== null) {
      metrics.push(metric(source, provider, providerAccountId, scope, "sortino_ratio_annualized_zero_target", round(sortino, 4), asOfUtc, calculationSource));
    }
    metrics.push(metric(source, provider, providerAccountId, scope, "negative_day_count", negative.length, asOfUtc, calculationSource));
  }

  metrics.push(metric(source, provider, providerAccountId, scope, "daily_points", returnRows.length, asOfUtc, calculationSource));
  return metrics;
}

function dedupeAndSortReturns(rows: DailyReturnRow[]): DatedReturn[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.returnPct === "number" && Number.isFinite(row.returnPct) && validDate(row.dateUtc)) {
      byDate.set(row.dateUtc.slice(0, 10), row.returnPct);
    }
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([dateUtc, returnPct]) => ({ dateUtc, returnPct }));
}

function dedupeAndSortEquity(rows: DailyEquityRow[]) {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.equity === "number" && Number.isFinite(row.equity) && row.equity >= 0 && validDate(row.dateUtc)) {
      byDate.set(row.dateUtc.slice(0, 10), row.equity);
    }
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([dateUtc, equity]) => ({ dateUtc, equity }));
}

function validDate(value: string) {
  return Number.isFinite(Date.parse(`${value.slice(0, 10)}T00:00:00Z`));
}

function elapsedDays(start: string, end: string) {
  const startMs = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endMs = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
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
