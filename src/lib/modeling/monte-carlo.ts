import type { MonteCarloMethod, MonteCarloParams, MonteCarloPercentiles, MonteCarloResult } from "./types";
import { buildDistribution } from "./transforms";

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantileAt(sorted: number[], q: number): number {
  if (!sorted.length) return 100;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

// IID empirical bootstrap: draw returns with replacement
function iidBootstrapPath(returns: number[], horizon: number, rng: () => number): number[] {
  const n = returns.length;
  let equity = 100;
  const path: number[] = [equity];
  for (let t = 0; t < horizon; t++) {
    const idx = Math.floor(rng() * n);
    equity *= 1 + (returns[idx] ?? 0);
    path.push(equity);
  }
  return path;
}

// Stationary bootstrap (Politis & Romano 1994):
// Draw geometrically-distributed blocks, wrapping around the return series.
// Preserves autocorrelation structure better than IID for weakly dependent data.
function stationaryBootstrapPath(returns: number[], horizon: number, rng: () => number): number[] {
  const n = returns.length;
  const meanBlockLen = Math.max(2, Math.round(Math.pow(n, 1 / 3)));
  const p = 1 / meanBlockLen; // probability of starting a new block

  let equity = 100;
  const path: number[] = [equity];
  let pos = Math.floor(rng() * n);

  for (let t = 0; t < horizon; t++) {
    if (t > 0 && rng() < p) {
      pos = Math.floor(rng() * n);
    } else if (t > 0) {
      pos = (pos + 1) % n;
    }
    equity *= 1 + (returns[pos] ?? 0);
    path.push(equity);
  }
  return path;
}

export function runMonteCarlo(params: MonteCarloParams & { method?: MonteCarloMethod }): MonteCarloResult {
  const { returns, simulationCount, horizon, seed } = params;
  const method: MonteCarloMethod = params.method ?? "stationary-bootstrap";

  if (!returns.length) {
    const flat = Array(horizon + 1).fill(100) as number[];
    const empty: MonteCarloPercentiles = { p10: flat, p25: flat, p50: flat, p75: flat, p90: flat };
    return { paths: [], percentiles: empty, actualPath: [100], params };
  }

  const rng = mulberry32(seed);
  const paths: number[][] = [];

  for (let s = 0; s < simulationCount; s++) {
    const path = method === "stationary-bootstrap"
      ? stationaryBootstrapPath(returns, horizon, rng)
      : iidBootstrapPath(returns, horizon, rng);
    paths.push(path);
  }

  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];

  for (let t = 0; t <= horizon; t++) {
    const vals = paths.map((p) => p[t] ?? 100).sort((a, b) => a - b);
    p10.push(quantileAt(vals, 0.1));
    p25.push(quantileAt(vals, 0.25));
    p50.push(quantileAt(vals, 0.5));
    p75.push(quantileAt(vals, 0.75));
    p90.push(quantileAt(vals, 0.9));
  }

  const actualPath: number[] = [100];
  let eq = 100;
  for (const r of returns.slice(0, horizon)) {
    eq *= 1 + r;
    actualPath.push(eq);
  }

  return { paths, percentiles: { p10, p25, p50, p75, p90 }, actualPath, params };
}

export type MCOutcomes = {
  finalEquity: ReturnType<typeof buildDistribution>;
  p10Final: number;
  p50Final: number;
  p90Final: number;
  probPositive: number; // % paths ending above 100
  probDrawdown20: number; // % paths reaching -20% at any point
};

export function computeMCOutcomes(result: MonteCarloResult): MCOutcomes | null {
  if (!result.paths.length) return null;
  const finalEquities = result.paths.map((p) => p[p.length - 1] ?? 100);
  const sorted = [...finalEquities].sort((a, b) => a - b);
  const n = sorted.length;

  const probPositive = (finalEquities.filter((v) => v >= 100).length / n) * 100;

  let drawdown20Count = 0;
  for (const path of result.paths) {
    let peak = 100;
    for (const v of path) {
      if (v > peak) peak = v;
      if ((v / peak - 1) * 100 <= -20) { drawdown20Count++; break; }
    }
  }
  const probDrawdown20 = (drawdown20Count / n) * 100;

  function q(frac: number): number {
    const pos = frac * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  }

  return {
    finalEquity: buildDistribution(finalEquities, 30),
    p10Final: q(0.1),
    p50Final: q(0.5),
    p90Final: q(0.9),
    probPositive,
    probDrawdown20,
  };
}
