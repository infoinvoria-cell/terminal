import { filterValidOhlcvSeries } from "@/lib/candleIntegrity";
import type { OhlcvPoint, SeasonalityResponse } from "@/lib/globe/globe-types";

export type GlobeSeasonalityDirection = "LONG" | "SHORT" | "NEUTRAL";

export type GlobeSeasonalityStats = {
  direction: GlobeSeasonalityDirection;
  averageReturnPct: number;
  medianReturnPct: number;
  winRatePct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  bestHorizonDays: number;
  samples: number;
  yearsUsed: number;
  interpretation: "Strong seasonal bias" | "Weak seasonal bias" | "No seasonal edge";
};

export type GlobeSeasonalityAnalysis = {
  curve: Array<{ x: number; y: number }>;
  medianCurve: Array<{ x: number; y: number }>;
  stats: GlobeSeasonalityStats;
};

function finite(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function downsideDeviation(values: number[]): number {
  const downside = values.filter((value) => value < 0);
  return downside.length >= 2 ? stdDev(downside) : 0;
}

function dayOfYear(iso: string): number {
  const date = new Date(iso);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000) + 1;
}

type SamplePath = {
  terminalReturnPct: number;
  returns: number[];
};

type Candidate = {
  holdDays: number;
  direction: GlobeSeasonalityDirection;
  samples: SamplePath[];
  averageReturnPct: number;
  winRatePct: number;
  sharpeRatio: number;
  sortinoRatio: number;
};

function curveFromSamples(samples: SamplePath[], mode: "mean" | "median"): Array<{ x: number; y: number }> {
  if (!samples.length) return [];
  const steps = Math.max(0, ...samples.map((sample) => sample.returns.length));
  const curve = [{ x: 0, y: 0 }];
  for (let step = 1; step <= steps; step += 1) {
    const values = samples
      .map((sample) => finite(sample.returns[step - 1], Number.NaN))
      .filter(Number.isFinite);
    if (!values.length) continue;
    curve.push({
      x: step,
      y: Number((mode === "mean" ? average(values) : median(values)).toFixed(4)),
    });
  }
  return curve;
}

function fallbackAnalysis(payload: SeasonalityResponse | null | undefined): GlobeSeasonalityAnalysis {
  const direction = String(payload?.stats?.direction ?? "NEUTRAL").toUpperCase() as GlobeSeasonalityDirection;
  const curve = (payload?.curve ?? [])
    .map((point) => ({ x: finite(point.x), y: finite(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  const averageReturnPct = finite(payload?.stats?.expectedValue ?? payload?.stats?.avgReturn20d, 0);
  const winRatePct = finite(payload?.stats?.hitRate, 0) > 1.5 ? finite(payload?.stats?.hitRate, 0) : finite(payload?.stats?.hitRate, 0) * 100;
  const sharpeRatio = finite(payload?.stats?.sharpeRatio, 0);
  const interpretation: GlobeSeasonalityStats["interpretation"] =
    Math.abs(sharpeRatio) >= 1 || winRatePct >= 60
      ? "Strong seasonal bias"
      : Math.abs(sharpeRatio) >= 0.35 || winRatePct >= 54
        ? "Weak seasonal bias"
        : "No seasonal edge";

  return {
    curve: curve.length ? (curve[0].x === 0 ? curve : [{ x: 0, y: 0 }, ...curve]) : [{ x: 0, y: 0 }],
    medianCurve: curve.length ? (curve[0].x === 0 ? curve : [{ x: 0, y: 0 }, ...curve]) : [{ x: 0, y: 0 }],
    stats: {
      direction: direction === "LONG" || direction === "SHORT" ? direction : "NEUTRAL",
      averageReturnPct,
      medianReturnPct: averageReturnPct,
      winRatePct,
      sharpeRatio,
      sortinoRatio: finite(payload?.stats?.sortinoRatio, sharpeRatio),
      bestHorizonDays: Math.max(10, Math.min(20, Math.round(finite(payload?.stats?.bestHorizonDays ?? payload?.projectionDays, 10)))),
      samples: Math.max(0, Math.round(finite(payload?.stats?.samples, 0))),
      yearsUsed: Math.max(0, Math.round(finite(payload?.yearsUsed, 0))),
      interpretation,
    },
  };
}

export function buildGlobeSeasonalityAnalysis(
  candles: OhlcvPoint[] | null | undefined,
  fallback?: SeasonalityResponse | null,
): GlobeSeasonalityAnalysis {
  const rows = filterValidOhlcvSeries(candles);
  if (rows.length < 120) return fallbackAnalysis(fallback);

  const latestIso = rows[rows.length - 1]?.t;
  const latestDate = latestIso ? new Date(latestIso) : null;
  if (!latestDate || Number.isNaN(latestDate.getTime())) return fallbackAnalysis(fallback);
  const minYear = latestDate.getUTCFullYear() - 9;
  const grouped = new Map<number, OhlcvPoint[]>();
  for (const row of rows) {
    const year = new Date(row.t).getUTCFullYear();
    if (year < minYear) continue;
    const list = grouped.get(year) ?? [];
    list.push(row);
    grouped.set(year, list);
  }

  const years = Array.from(grouped.keys()).sort((left, right) => left - right);
  if (!years.length) return fallbackAnalysis(fallback);

  const targetDoy = dayOfYear(latestIso);
  const qualifiedCandidates: Candidate[] = [];
  const allCandidates: Candidate[] = [];
  for (let holdDays = 10; holdDays <= 20; holdDays += 1) {
    const paths: SamplePath[] = [];
    for (const year of years) {
      const yearRows = (grouped.get(year) ?? []).slice().sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());
      const startIndex = yearRows.findIndex((row) => dayOfYear(row.t) >= targetDoy);
      if (startIndex < 0) continue;
      const endIndex = startIndex + holdDays;
      if (endIndex >= yearRows.length) continue;
      const startClose = finite(yearRows[startIndex]?.close, Number.NaN);
      if (!(startClose > 0)) continue;

      const returns: number[] = [];
      let validPath = true;
      for (let offset = 1; offset <= holdDays; offset += 1) {
        const close = finite(yearRows[startIndex + offset]?.close, Number.NaN);
        if (!(close > 0)) {
          validPath = false;
          break;
        }
        returns.push(((close / startClose) - 1) * 100);
      }
      if (!validPath || returns.length !== holdDays) continue;
      paths.push({
        terminalReturnPct: returns[returns.length - 1] ?? 0,
        returns,
      });
    }

    if (paths.length < 4) continue;
    const terminalReturns = paths.map((sample) => sample.terminalReturnPct);
    const variants: Array<{ direction: "LONG" | "SHORT"; returns: number[] }> = [
      { direction: "LONG", returns: terminalReturns },
      { direction: "SHORT", returns: terminalReturns.map((value) => -value) },
    ];

    for (const variant of variants) {
      const averageReturnPct = average(variant.returns);
      const winRatePct = (variant.returns.filter((value) => value > 0).length / variant.returns.length) * 100;
      const sharpeRatio = averageReturnPct / Math.max(1e-9, stdDev(variant.returns));
      const sortinoRatio = averageReturnPct / Math.max(1e-9, downsideDeviation(variant.returns));
      const candidate: Candidate = {
        holdDays,
        direction: variant.direction,
        samples: variant.direction === "SHORT"
          ? paths.map((sample) => ({ ...sample, returns: sample.returns.map((value) => -value), terminalReturnPct: -sample.terminalReturnPct }))
          : paths,
        averageReturnPct,
        winRatePct,
        sharpeRatio,
        sortinoRatio,
      };
      allCandidates.push(candidate);
      if (winRatePct >= 50) qualifiedCandidates.push(candidate);
    }
  }

  const candidateSorter = (left: Candidate, right: Candidate) => (
    right.sharpeRatio - left.sharpeRatio
    || right.winRatePct - left.winRatePct
    || right.sortinoRatio - left.sortinoRatio
    || right.averageReturnPct - left.averageReturnPct
  );
  const strongestCandidate = [...qualifiedCandidates].sort(candidateSorter)[0];
  const fallbackCandidate = [...allCandidates].sort(candidateSorter)[0];
  if (!strongestCandidate && !fallbackCandidate) {
    return {
      curve: [{ x: 0, y: 0 }],
      medianCurve: [{ x: 0, y: 0 }],
      stats: {
        direction: "NEUTRAL",
        averageReturnPct: 0,
        medianReturnPct: 0,
        winRatePct: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        bestHorizonDays: 10,
        samples: 0,
        yearsUsed: years.length,
        interpretation: "No seasonal edge",
      },
    };
  }

  const activeCandidate = strongestCandidate ?? fallbackCandidate;
  const directedTerminalReturns = activeCandidate.samples.map((sample) => sample.terminalReturnPct);
  const directedPaths = activeCandidate.samples;
  const averageReturnPct = average(directedTerminalReturns);
  const medianReturnPct = median(directedTerminalReturns);
  const winRatePct = (directedTerminalReturns.filter((value) => value > 0).length / directedTerminalReturns.length) * 100;
  const sharpeRatio = averageReturnPct / Math.max(1e-9, stdDev(directedTerminalReturns));
  const sortinoRatio = averageReturnPct / Math.max(1e-9, downsideDeviation(directedTerminalReturns));
  const interpretation: GlobeSeasonalityStats["interpretation"] =
    (sharpeRatio >= 1 && winRatePct >= 58) || (sortinoRatio >= 1.2 && winRatePct >= 56)
      ? "Strong seasonal bias"
      : sharpeRatio >= 0.35 || winRatePct >= 53
        ? "Weak seasonal bias"
        : "No seasonal edge";

  return {
    curve: curveFromSamples(directedPaths, "mean"),
    medianCurve: curveFromSamples(directedPaths, "median"),
    stats: {
      direction: strongestCandidate ? strongestCandidate.direction : "NEUTRAL",
      averageReturnPct: Number(averageReturnPct.toFixed(4)),
      medianReturnPct: Number(medianReturnPct.toFixed(4)),
      winRatePct: Number(winRatePct.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(4)),
      sortinoRatio: Number((Number.isFinite(sortinoRatio) ? sortinoRatio : sharpeRatio).toFixed(4)),
      bestHorizonDays: activeCandidate.holdDays,
      samples: activeCandidate.samples.length,
      yearsUsed: years.length,
      interpretation: strongestCandidate ? interpretation : "No seasonal edge",
    },
  };
}
