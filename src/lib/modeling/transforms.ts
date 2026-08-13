import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import type {
  CorrelationMatrixResult,
  CorrelationPoint,
  DistributionBin,
  DistributionResult,
  DistributionStats,
  DrawdownEvent,
  EfficientFrontierResult,
  PCAResult,
  RegressionResult,
  RollingMetric,
  RollingMetricPoint,
  TradeRecord,
  TradeStats,
  VaRSurfaceResult,
} from "./types";
import {
  covarianceMatrix,
  correlationFromCovariance,
  jacobiEigen,
  portfolioVariance,
  randomWeights,
  longOnlyFrontierPoint,
} from "./linear-algebra";

export function extractMonthlyReturns(series: AnalyticsSeriesPoint[]): number[] {
  if (series.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = 1 + (series[i - 1]!.value / 100);
    const curr = 1 + (series[i]!.value / 100);
    if (prev > 0) returns.push(curr / prev - 1);
  }
  return returns;
}

export function buildDistribution(values: number[], binCount = 30): DistributionResult {
  if (!values.length) {
    const stats: DistributionStats = { mean: 0, median: 0, std: 0, skew: 0, kurt: 0, var95: 0, cvar95: 0, n: 0 };
    return { bins: [], stats };
  }
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const medianIdx = Math.floor(n / 2);
  const median = n % 2 === 0 ? ((sorted[medianIdx - 1] ?? 0) + (sorted[medianIdx] ?? 0)) / 2 : (sorted[medianIdx] ?? 0);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  const std = Math.sqrt(variance);
  const skew = std > 0 ? values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n : 0;
  const kurt = std > 0 ? values.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3 : 0;
  const var95Idx = Math.max(0, Math.floor(n * 0.05) - 1);
  const var95 = sorted[var95Idx] ?? sorted[0] ?? 0;
  const tailSlice = sorted.slice(0, var95Idx + 1);
  const cvar95 = tailSlice.length ? tailSlice.reduce((s, v) => s + v, 0) / tailSlice.length : var95;

  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const range = max - min;
  const binW = range > 0 ? range / binCount : 0.001;

  const bins: DistributionBin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * binW,
    x1: min + (i + 1) * binW,
    midpoint: min + (i + 0.5) * binW,
    count: 0,
    freq: 0,
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binW), binCount - 1);
    if (idx >= 0 && idx < binCount) bins[idx]!.count++;
  }
  for (const bin of bins) bin.freq = bin.count / n;

  const stats: DistributionStats = { mean, median, std, skew, kurt, var95, cvar95, n };
  return { bins, stats };
}

export function computeRolling(
  series: AnalyticsSeriesPoint[],
  metric: RollingMetric,
  window: number,
): RollingMetricPoint[] {
  if (series.length < window + 1) return [];
  const result: RollingMetricPoint[] = [];

  for (let i = window; i < series.length; i++) {
    const slice = series.slice(i - window, i + 1);
    const rets: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      const prev = 1 + (slice[j - 1]!.value / 100);
      const curr = 1 + (slice[j]!.value / 100);
      if (prev > 0) rets.push(curr / prev - 1);
    }
    if (!rets.length) continue;
    const n = rets.length;
    const mean = rets.reduce((s, r) => s + r, 0) / n;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(n - 1, 1);
    const std = Math.sqrt(variance);

    let val: number;
    if (metric === "sharpe") {
      val = std > 0 ? (mean / std) * Math.sqrt(12) : 0;
    } else if (metric === "volatility") {
      val = std * Math.sqrt(12) * 100;
    } else {
      const compound = rets.reduce((acc, r) => acc * (1 + r), 1);
      val = (Math.pow(compound, 12 / n) - 1) * 100;
    }

    result.push({ date: slice[slice.length - 1]!.date, value: Number(val.toFixed(4)) });
  }
  return result;
}

export function extractDrawdownEvents(performanceSeries: AnalyticsSeriesPoint[]): DrawdownEvent[] {
  if (performanceSeries.length < 2) return [];
  const events: DrawdownEvent[] = [];
  let peakIdx = 0;
  let peakVal = performanceSeries[0]!.value;
  let inDD = false;
  let ddStartIdx = 0;
  let troughIdx = 0;
  let troughVal = 0;

  for (let i = 1; i < performanceSeries.length; i++) {
    const val = performanceSeries[i]!.value;
    if (val >= peakVal) {
      if (inDD) {
        const peakEquity = 1 + performanceSeries[ddStartIdx]!.value / 100;
        const troughEquity = 1 + troughVal / 100;
        const depth = (troughEquity / peakEquity - 1) * 100;
        if (Math.abs(depth) >= 2) {
          const startMs = new Date(performanceSeries[ddStartIdx]!.date).getTime();
          const troughMs = new Date(performanceSeries[troughIdx]!.date).getTime();
          const endMs = new Date(performanceSeries[i]!.date).getTime();
          events.push({
            startDate: performanceSeries[ddStartIdx]!.date,
            troughDate: performanceSeries[troughIdx]!.date,
            endDate: performanceSeries[i]!.date,
            depth,
            duration: Math.round((troughMs - startMs) / 86400000),
            recoveryDays: Math.round((endMs - troughMs) / 86400000),
          });
        }
        inDD = false;
      }
      peakIdx = i;
      peakVal = val;
    } else {
      if (!inDD) {
        inDD = true;
        ddStartIdx = peakIdx;
        troughIdx = i;
        troughVal = val;
      } else if (val < troughVal) {
        troughIdx = i;
        troughVal = val;
      }
    }
  }

  if (inDD) {
    const peakEquity = 1 + performanceSeries[ddStartIdx]!.value / 100;
    const troughEquity = 1 + troughVal / 100;
    const depth = (troughEquity / peakEquity - 1) * 100;
    if (Math.abs(depth) >= 2) {
      const startMs = new Date(performanceSeries[ddStartIdx]!.date).getTime();
      const troughMs = new Date(performanceSeries[troughIdx]!.date).getTime();
      events.push({
        startDate: performanceSeries[ddStartIdx]!.date,
        troughDate: performanceSeries[troughIdx]!.date,
        endDate: null,
        depth,
        duration: Math.round((troughMs - startMs) / 86400000),
        recoveryDays: null,
      });
    }
  }

  return events.sort((a, b) => a.depth - b.depth);
}

// Compute OLS regression of strategy returns vs benchmark returns.
export function computeRegression(
  strategy: AnalyticsSeriesPoint[],
  benchmark: AnalyticsSeriesPoint[],
): RegressionResult | null {
  const bmMap = new Map<string, number>();
  for (const p of benchmark) bmMap.set(p.date, p.value);

  const points: Array<{ x: number; y: number; date: string }> = [];
  for (let i = 1; i < strategy.length; i++) {
    const prevS = 1 + (strategy[i - 1]!.value / 100);
    const currS = 1 + (strategy[i]!.value / 100);
    const date = strategy[i]!.date;
    if (!bmMap.has(date)) continue;
    const prevBDate = strategy[i - 1]!.date;
    if (!bmMap.has(prevBDate)) continue;
    const prevB = 1 + (bmMap.get(prevBDate)! / 100);
    const currB = 1 + (bmMap.get(date)! / 100);
    if (prevS <= 0 || prevB <= 0) continue;
    const ys = (currS / prevS - 1) * 100;
    const xs = (currB / prevB - 1) * 100;
    points.push({ x: xs, y: ys, date });
  }

  if (points.length < 5) return null;

  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const syy = points.reduce((s, p) => s + (p.y - my) ** 2, 0);

  if (sxx === 0) return null;

  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const fittedLine = [
    { x: minX, y: alpha + beta * minX },
    { x: maxX, y: alpha + beta * maxX },
  ];

  return { alpha, beta, r2, points, fittedLine };
}

// Compute rolling correlation between strategy and benchmark.
export function computeRollingCorrelation(
  strategy: AnalyticsSeriesPoint[],
  benchmark: AnalyticsSeriesPoint[],
  window: number,
): CorrelationPoint[] {
  if (strategy.length < window + 1 || benchmark.length < window + 1) return [];

  const bmMap = new Map<string, number>();
  for (const p of benchmark) bmMap.set(p.date, p.value);

  const pairs: Array<{ date: string; sr: number; br: number }> = [];
  for (let i = 1; i < strategy.length; i++) {
    const date = strategy[i]!.date;
    if (!bmMap.has(date) || !bmMap.has(strategy[i - 1]!.date)) continue;
    const prevS = 1 + (strategy[i - 1]!.value / 100);
    const currS = 1 + (strategy[i]!.value / 100);
    const prevB = 1 + (bmMap.get(strategy[i - 1]!.date)! / 100);
    const currB = 1 + (bmMap.get(date)! / 100);
    if (prevS <= 0 || prevB <= 0) continue;
    pairs.push({ date, sr: currS / prevS - 1, br: currB / prevB - 1 });
  }

  const result: CorrelationPoint[] = [];
  for (let i = window - 1; i < pairs.length; i++) {
    const slice = pairs.slice(i - window + 1, i + 1);
    const n = slice.length;
    const mx = slice.reduce((s, p) => s + p.sr, 0) / n;
    const my = slice.reduce((s, p) => s + p.br, 0) / n;
    const sxx = slice.reduce((s, p) => s + (p.sr - mx) ** 2, 0);
    const syy = slice.reduce((s, p) => s + (p.br - my) ** 2, 0);
    const sxy = slice.reduce((s, p) => s + (p.sr - mx) * (p.br - my), 0);
    const denom = Math.sqrt(sxx * syy);
    result.push({ date: slice[n - 1]!.date, correlation: denom > 0 ? sxy / denom : 0 });
  }
  return result;
}

// Compute drawdown series from performance series (peak-to-trough %).
export function computeDrawdownSeries(performanceSeries: AnalyticsSeriesPoint[]): AnalyticsSeriesPoint[] {
  if (!performanceSeries.length) return [];
  const result: AnalyticsSeriesPoint[] = [];
  let peak = 1 + performanceSeries[0]!.value / 100;
  for (const point of performanceSeries) {
    const equity = 1 + point.value / 100;
    if (equity > peak) peak = equity;
    result.push({ date: point.date, value: ((equity / peak) - 1) * 100 });
  }
  return result;
}

// ─── Quant expansion: correlation / covariance matrix ─────────────────────────

/** Build aligned monthly returns for each series in the map on common dates. */
function alignedMonthlyReturns(
  seriesMap: Record<string, AnalyticsSeriesPoint[]>,
): { labels: string[]; returnsMatrix: number[][] } {
  const labels = Object.keys(seriesMap);
  if (labels.length < 2) return { labels, returnsMatrix: [] };

  // Monthly returns per label
  const monthlyMap: Record<string, Map<string, number>> = {};
  for (const label of labels) {
    const series = seriesMap[label]!;
    const m = new Map<string, number>();
    for (let i = 1; i < series.length; i++) {
      const prev = 1 + (series[i - 1]!.value / 100);
      const curr = 1 + (series[i]!.value / 100);
      if (prev > 0) m.set(series[i]!.date, curr / prev - 1);
    }
    monthlyMap[label] = m;
  }

  // Intersect dates
  let commonDates = new Set<string>(monthlyMap[labels[0]!]!.keys());
  for (const label of labels.slice(1)) {
    const keys = new Set(monthlyMap[label]!.keys());
    commonDates = new Set([...commonDates].filter((d) => keys.has(d)));
  }

  const sortedDates = [...commonDates].sort();
  if (sortedDates.length < 6) return { labels, returnsMatrix: [] };

  const returnsMatrix: number[][] = sortedDates.map((date) =>
    labels.map((label) => monthlyMap[label]!.get(date) ?? 0),
  );

  return { labels, returnsMatrix };
}

export function computeCorrelationMatrix(
  seriesMap: Record<string, AnalyticsSeriesPoint[]>,
): CorrelationMatrixResult | null {
  const { labels, returnsMatrix } = alignedMonthlyReturns(seriesMap);
  if (returnsMatrix.length < 6) return null;

  const cov = covarianceMatrix(returnsMatrix);
  const matrix = correlationFromCovariance(cov);
  return { labels, matrix, covMatrix: cov };
}

// ─── PCA ──────────────────────────────────────────────────────────────────────

export function computePCA(
  seriesMap: Record<string, AnalyticsSeriesPoint[]>,
): PCAResult | null {
  const { labels, returnsMatrix } = alignedMonthlyReturns(seriesMap);
  if (returnsMatrix.length < 6 || labels.length < 2) return null;

  const cov = covarianceMatrix(returnsMatrix);
  const { eigenvalues, eigenvectors } = jacobiEigen(cov);
  const totalVariance = eigenvalues.reduce((s, v) => s + Math.max(v, 0), 0);

  let cumVar = 0;
  const components = eigenvalues.map((ev, i) => {
    const explained = totalVariance > 0 ? Math.max(ev, 0) / totalVariance : 0;
    cumVar += explained;
    return {
      eigenvalue: ev,
      explainedVariance: explained,
      cumulativeVariance: cumVar,
      loadings: eigenvectors[i] ?? labels.map(() => 0),
    };
  });

  return { labels, components };
}

// ─── Efficient Frontier ────────────────────────────────────────────────────────

export function computeEfficientFrontier(
  seriesMap: Record<string, AnalyticsSeriesPoint[]>,
  sampleCount = 1200,
): EfficientFrontierResult | null {
  const { labels, returnsMatrix } = alignedMonthlyReturns(seriesMap);
  if (returnsMatrix.length < 12 || labels.length < 2) return null;

  const k = labels.length;
  const n = returnsMatrix.length;

  // Mean monthly returns
  const means = labels.map((_, j) =>
    returnsMatrix.reduce((s, row) => s + (row[j] ?? 0), 0) / n,
  );

  const cov = covarianceMatrix(returnsMatrix);

  const samplePortfolio = (weights: number[]) => {
    const ret = means.reduce((s, m, j) => s + m * weights[j]!, 0) * 12;
    const variance = portfolioVariance(weights, cov);
    const vol = Math.sqrt(Math.max(variance, 0)) * Math.sqrt(12);
    const sharpe = vol > 1e-9 ? ret / vol : 0;
    return { vol, ret, sharpe };
  };

  // Individual assets
  const individualAssets = labels.map((label, j) => {
    const w = labels.map((_, i) => (i === j ? 1 : 0));
    const { vol, ret } = samplePortfolio(w);
    return { label, vol, ret };
  });

  // Random portfolio cloud (kept as backdrop)
  const sampledPortfolios: EfficientFrontierResult["sampledPortfolios"] = [];
  let minVolSampled = { weights: [] as number[], vol: Infinity, ret: 0, sharpe: 0 };
  let maxSharpeSampled = { weights: [] as number[], vol: 0, ret: 0, sharpe: -Infinity };

  for (let s = 0; s < sampleCount; s++) {
    const weights = randomWeights(k, s * 7919 + 1234);
    const { vol, ret, sharpe } = samplePortfolio(weights);
    sampledPortfolios.push({ vol, ret, sharpe });
    if (vol < minVolSampled.vol) minVolSampled = { weights, vol, ret, sharpe };
    if (sharpe > maxSharpeSampled.sharpe) maxSharpeSampled = { weights, vol, ret, sharpe };
  }

  // ── Long-only frontier (projected gradient descent) ───────────────────────
  const meanMin = Math.min(...means);
  const meanMax = Math.max(...means);
  const FRONTIER_POINTS = 50;
  const frontierPoints: EfficientFrontierResult["frontierPoints"] = [];

  for (let i = 0; i <= FRONTIER_POINTS; i++) {
    const targetMonthly = meanMin + (i / FRONTIER_POINTS) * (meanMax - meanMin);
    const fp = longOnlyFrontierPoint(cov, means, targetMonthly);
    if (fp && isFinite(fp.vol) && isFinite(fp.ret)) {
      frontierPoints.push(fp);
    }
  }

  // Min-vol: use sampled portfolios (long-only min-variance approximation)
  let minVol = minVolSampled;
  // Try to refine with frontier point at lowest return target
  const fpMinVol = longOnlyFrontierPoint(cov, means, meanMin);
  if (fpMinVol && isFinite(fpMinVol.vol) && fpMinVol.vol < minVol.vol) {
    minVol = fpMinVol;
  }

  // Max-sharpe: from the 50 frontier grid points
  let maxSharpe: EfficientFrontierResult["maxSharpe"] = minVolSampled;
  if (frontierPoints.length > 0) {
    const frontierMaxSharpe = frontierPoints.reduce((best, p) => p.sharpe > best.sharpe ? p : best);
    maxSharpe = frontierMaxSharpe;
  }

  return {
    sampledPortfolios,
    frontierPoints,
    minVol,
    maxSharpe,
    individualAssets,
    method: "LONG-ONLY SIMPLEX",
    componentCount: k,
    observationCount: n,
    riskFreeRate: 0,
  };
}

// ─── VaR / CVaR surface ───────────────────────────────────────────────────────

export function computeVaRSurface(
  monthlyReturns: number[],
  confidences = [0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99],
  horizons = [1, 3, 6, 12, 24, 36, 60],
): VaRSurfaceResult | null {
  if (monthlyReturns.length < 12) return null;
  const n = monthlyReturns.length;

  const varMatrix: number[][] = [];
  const cvarMatrix: number[][] = [];

  for (const conf of confidences) {
    const varRow: number[] = [];
    const cvarRow: number[] = [];

    for (const h of horizons) {
      // Build H-month compounded returns by overlapping windows
      const hReturns: number[] = [];
      for (let start = 0; start + h <= n; start++) {
        let compound = 1;
        for (let t = start; t < start + h; t++) compound *= 1 + monthlyReturns[t]!;
        hReturns.push(compound - 1);
      }
      if (!hReturns.length) { varRow.push(0); cvarRow.push(0); continue; }

      const sorted = [...hReturns].sort((a, b) => a - b);
      const idx = Math.max(0, Math.floor((1 - conf) * sorted.length) - 1);
      const var_ = sorted[idx] ?? sorted[0] ?? 0;
      const tail = sorted.slice(0, idx + 1);
      const cvar = tail.length ? tail.reduce((s, v) => s + v, 0) / tail.length : var_;
      varRow.push(var_);
      cvarRow.push(cvar);
    }
    varMatrix.push(varRow);
    cvarMatrix.push(cvarRow);
  }

  return { confidences, horizons, varMatrix, cvarMatrix };
}

// ─── Trade analytics ──────────────────────────────────────────────────────────

export function computeTradeStats(trades: TradeRecord[]): TradeStats {
  const n = trades.length;
  if (!n) return { n: 0, wins: 0, losses: 0, winRate: 0, avgWin: 0, avgLoss: 0, expectancy: 0, profitFactor: 0, maxConsecWins: 0, maxConsecLosses: 0 };

  let wins = 0, losses = 0;
  let totalWin = 0, totalLoss = 0;
  let maxCW = 0, maxCL = 0, cw = 0, cl = 0;

  for (const t of trades) {
    if (t.pnl > 0) {
      wins++; totalWin += t.pnl; cw++; cl = 0;
      if (cw > maxCW) maxCW = cw;
    } else if (t.pnl < 0) {
      losses++; totalLoss += Math.abs(t.pnl); cl++; cw = 0;
      if (cl > maxCL) maxCL = cl;
    }
  }

  const winRate = n > 0 ? wins / n : 0;
  const avgWin = wins > 0 ? totalWin / wins : 0;
  const avgLoss = losses > 0 ? totalLoss / losses : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

  return { n, wins, losses, winRate, avgWin, avgLoss, expectancy, profitFactor, maxConsecWins: maxCW, maxConsecLosses: maxCL };
}
