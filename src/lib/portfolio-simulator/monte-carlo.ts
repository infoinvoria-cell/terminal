import type { MonteCarloSummary } from "@/lib/portfolio-simulator/types";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}

function simulatePath(returnsPct: number[], accountSize: number) {
  let equity = accountSize;
  let peak = accountSize;
  let maxDrawdownPct = 0;
  for (const returnPct of returnsPct) {
    equity *= 1 + returnPct / 100;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((equity / peak) - 1) * 100 : 0;
    maxDrawdownPct = Math.min(maxDrawdownPct, dd);
  }
  return { terminalEquity: equity, maxDrawdownPct };
}

export function runMonteCarlo(
  returnsPct: number[],
  accountSize: number,
  runs = 300,
  seed = 1729,
  blockLength = 3,
): MonteCarloSummary {
  if (returnsPct.length === 0) {
    return {
      method: "monthly_block_bootstrap",
      runs,
      seed,
      blockLength,
      medianTerminalEquity: accountSize,
      p05TerminalEquity: accountSize,
      p95TerminalEquity: accountSize,
      probabilityBelowStartPct: 0,
      medianMaxDrawdownPct: 0,
      p95MaxDrawdownPct: 0,
    };
  }

  const random = mulberry32(seed);
  const terminalEquities: number[] = [];
  const drawdowns: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const sampled: number[] = [];
    while (sampled.length < returnsPct.length) {
      const start = Math.floor(random() * returnsPct.length);
      for (let i = 0; i < blockLength && sampled.length < returnsPct.length; i += 1) {
        sampled.push(returnsPct[(start + i) % returnsPct.length] ?? 0);
      }
    }
    const result = simulatePath(sampled, accountSize);
    terminalEquities.push(Number(result.terminalEquity.toFixed(2)));
    drawdowns.push(Number(Math.abs(result.maxDrawdownPct).toFixed(4)));
  }

  return {
    method: "monthly_block_bootstrap",
    runs,
    seed,
    blockLength,
    medianTerminalEquity: Number(percentile(terminalEquities, 0.5).toFixed(2)),
    p05TerminalEquity: Number(percentile(terminalEquities, 0.05).toFixed(2)),
    p95TerminalEquity: Number(percentile(terminalEquities, 0.95).toFixed(2)),
    probabilityBelowStartPct: Number(((terminalEquities.filter((value) => value < accountSize).length / terminalEquities.length) * 100).toFixed(2)),
    medianMaxDrawdownPct: Number(percentile(drawdowns, 0.5).toFixed(2)),
    p95MaxDrawdownPct: Number(percentile(drawdowns, 0.95).toFixed(2)),
  };
}
