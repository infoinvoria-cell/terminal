/**
 * Shared IS-discovery utilities used by both the Strategy Engine route
 * and the Seasonal Filter Lab route.
 *
 * Contains: fold config constants, close-map builder, pre-filter metrics,
 * non-overlapping candidate selection, and fold-level OOS signal computation.
 */

import type { DailyBar } from "../walkForward/types";
import { buildYearSlotLookup, getPatternTradeForYear } from "../barLevelRisk";

// ── Config constants ──────────────────────────────────────────────────────────
export const HOLD_CANDS  = [10, 12, 14, 16, 18, 20] as const;
export const MAX_SLOT    = 232;
export const STEP        = 2;
export const MAX_PAT     = 6;
export const IT          = 10;   // initial training years
export const OOS_BLOCK   = 2;    // OOS block years
export const STUDY_START = 2000;
export const STUDY_END   = 2025; // last complete calendar year (2025 confirmed complete in CSV)

export const MONTH_SLOT: Record<number, number> = {
  1:1, 2:21, 3:40, 4:62, 5:83, 6:104, 7:125, 8:147, 9:169, 10:189, 11:211, 12:232,
};
const MONTH_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

// ── Helpers ───────────────────────────────────────────────────────────────────
export function slotLabel(slot: number): string {
  const entries = Object.entries(MONTH_SLOT).map(([m,s])=>({m:+m,s:+s})).sort((a,b)=>a.s-b.s);
  let mi = 0;
  for (let i = 0; i < entries.length - 1; i++) if (slot >= entries[i].s) mi = i;
  const { m, s } = entries[mi];
  const ns = entries[mi+1]?.s ?? s + 21;
  const cal = [31,28,31,30,31,30,31,31,30,31,30,31][m-1];
  const d = Math.max(1, Math.min(cal, Math.round(((slot-s)/(ns-s))*cal)+1));
  return `${String(d).padStart(2,"0")} ${MONTH_DE[m-1]}`;
}

export function windowsOverlap(s1: number, h1: number, s2: number, h2: number): boolean {
  return s1 < s2 + h2 && s2 < s1 + h1;
}

// ── Close map ─────────────────────────────────────────────────────────────────
export function buildCloseMap(
  bars: DailyBar[], start: number, end: number,
): { map: Map<number, Map<number,number>>; years: number[] } {
  const sorted = [...bars].sort((a,b) => a.date.localeCompare(b.date));
  const map = new Map<number, Map<number,number>>();
  let slot = 0, prevYear = -1;
  for (const bar of sorted) {
    const year = parseInt(bar.date.slice(0,4));
    if (year < start || year > end) continue;
    if (year !== prevYear) { slot = 0; prevYear = year; }
    slot++;
    if (slot > 252) continue;
    if (!map.has(year)) map.set(year, new Map());
    map.get(year)!.set(slot, bar.close);
  }
  return { map, years: Array.from(map.keys()).sort((a,b)=>a-b) };
}

// ── Pre-filter metrics ─────────────────────────────────────────────────────────
export function preFilter(
  map: Map<number, Map<number,number>>, years: number[],
  slot: number, holding: number, dir: "LONG"|"SHORT",
): { winRate: number; avgReturn: number; pf: number } | null {
  const rets: number[] = [];
  for (const yr of years) {
    const ym = map.get(yr);
    const ep = ym?.get(slot), xp = ym?.get(slot + holding);
    if (!ep || !xp || ep <= 0) continue;
    const raw = xp / ep - 1;
    rets.push(dir === "LONG" ? raw : -raw);
  }
  if (rets.length < 5) return null;
  const n = rets.length;
  const wins = rets.filter(r=>r>0).length;
  const mean = rets.reduce((s,r)=>s+r,0)/n;
  const gw = rets.filter(r=>r>0).reduce((s,r)=>s+r,0);
  const gl = Math.abs(rets.filter(r=>r<0).reduce((s,r)=>s+r,0));
  const pf = gl > 1e-9 ? gw/gl : (gw>0 ? 99 : 0);
  return { winRate: wins/n*100, avgReturn: mean, pf };
}

// ── Candidate type ─────────────────────────────────────────────────────────────
export type Cand = {
  slot: number; holding: number; dir: "LONG"|"SHORT";
  score: number; winRate: number; avgReturn: number; pf: number;
};

// ── Non-overlapping greedy selection ──────────────────────────────────────────
export function selectNonOverlapping(
  candidates: Cand[], maxN: number,
): { sel: Cand[]; rej: (Cand & { reason: string })[] } {
  const sorted = [...candidates].sort((a,b) => b.score - a.score);
  const sel: Cand[] = [], rej: (Cand & { reason: string })[] = [];
  for (const c of sorted) {
    if (sel.length >= maxN) { rej.push({...c, reason:"max_patterns_reached"}); continue; }
    const overlaps = sel.some(s => s.dir===c.dir && windowsOverlap(s.slot,s.holding,c.slot,c.holding));
    if (overlaps) rej.push({...c, reason:"overlapping_window_same_direction"});
    else sel.push(c);
  }
  return { sel, rej };
}

// ── Per-fold IS discovery ─────────────────────────────────────────────────────
export type FoldSignalSet = {
  foldIdx: number;
  isYears: number[];
  oosYears: number[];
  frozenPatterns: Cand[];
};

/**
 * For each OOS fold (anchored-expanding, IT=10, OOS=2, 2000-STUDY_END),
 * select the top non-overlapping patterns from IS data only.
 * Returns the frozen pattern set per fold — the as-of signal timeline.
 */
export function computeFoldSignals(
  closeMap: Map<number, Map<number,number>>,
  allYears: number[],
): FoldSignalSet[] {
  const folds: FoldSignalSet[] = [];
  let foldIdx = 0;

  for (;;) {
    const oosStart = STUDY_START + IT + foldIdx * OOS_BLOCK;
    const isYears = allYears.filter(y => y < oosStart);
    const oosYears = allYears.filter(y => y >= oosStart && y < oosStart + OOS_BLOCK);

    if (isYears.length < IT || oosYears.length === 0) break;

    // Build IS close map
    const isMap = new Map<number, Map<number,number>>();
    for (const yr of isYears) { const m = closeMap.get(yr); if (m) isMap.set(yr, m); }

    // Generate IS candidates
    const cands: Cand[] = [];
    for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
      for (const dir of ["LONG","SHORT"] as const) {
        for (const hd of HOLD_CANDS) {
          const m = preFilter(isMap, isYears, slot, hd, dir);
          if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 1.0) continue;
          const sc = m.winRate*100 + m.avgReturn*1000 + m.pf*10 - hd*0.1;
          cands.push({ slot, holding:hd, dir, score:sc, winRate:m.winRate, avgReturn:m.avgReturn, pf:m.pf });
        }
      }
    }

    const { sel } = selectNonOverlapping(cands, MAX_PAT);
    folds.push({ foldIdx, isYears, oosYears, frozenPatterns: sel });
    foldIdx++;
  }

  return folds;
}

// ── Trade classification ──────────────────────────────────────────────────────
export type TradeClassification = "SUPPORT" | "CONFLICT" | "NEUTRAL" | "OUT_OF_WINDOW";

export type AsOfSignalMatch = {
  pattern: Cand;
  entryDate: string;
  exitDate: string;
};

/**
 * Classify a base trade using the fold-frozen as-of seasonal signals.
 * Returns the classification and the matching pattern (if any).
 *
 * Rules:
 *  - SUPPORT: active frozen pattern in same direction as base trade
 *  - CONFLICT: active frozen pattern in opposite direction
 *  - NEUTRAL: no active frozen pattern
 *  - OUT_OF_WINDOW: trade's year is not in any OOS fold's range
 */
export function classifyTrade(
  tradeEntryDate: string,
  tradeDirection: "LONG" | "SHORT",
  folds: FoldSignalSet[],
  barLookup: ReturnType<typeof buildYearSlotLookup>,
): { classification: TradeClassification; matchedPattern: AsOfSignalMatch | null; foldIdx: number | null } {
  const tradeYear = parseInt(tradeEntryDate.slice(0, 4));

  // Find the fold whose OOS period contains the trade year
  const fold = folds.find(f => f.oosYears.includes(tradeYear));
  if (!fold) {
    return { classification: "OUT_OF_WINDOW", matchedPattern: null, foldIdx: null };
  }

  // Check each frozen pattern for an active window match
  for (const pat of fold.frozenPatterns) {
    const { trade } = getPatternTradeForYear(
      barLookup,
      tradeYear,
      pat.slot,
      pat.holding as 10|12|14|16|18|20,
      pat.dir,
    );
    if (!trade) continue;

    // Check if trade entry date falls within pattern's active window
    if (tradeEntryDate >= trade.entryDate && tradeEntryDate <= trade.exitDate) {
      const classification = pat.dir === tradeDirection ? "SUPPORT" : "CONFLICT";
      return {
        classification,
        matchedPattern: { pattern: pat, entryDate: trade.entryDate, exitDate: trade.exitDate },
        foldIdx: fold.foldIdx,
      };
    }
  }

  return { classification: "NEUTRAL", matchedPattern: null, foldIdx: fold.foldIdx };
}

// ── LCG RNG (deterministic seed) ─────────────────────────────────────────────
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ── Bootstrap CI (legacy 500-resample, backwards-compatible) ─────────────────
export function bootstrapCI(
  returns: number[],
  nResample = 500,
  seed = 42,
): { median: number; p5: number; p95: number; probPositive: number } {
  if (returns.length === 0) return { median: 0, p5: 0, p95: 0, probPositive: 0 };
  const rand = makeLcg(seed);
  const compReturns: number[] = [];
  const n = returns.length;
  for (let b = 0; b < nResample; b++) {
    let eq = 1;
    for (let i = 0; i < n; i++) eq *= (1 + returns[Math.floor(rand() * n)] / 100);
    compReturns.push((eq - 1) * 100);
  }
  compReturns.sort((a,b) => a-b);
  const mid = Math.floor(nResample / 2);
  return {
    median: parseFloat(compReturns[mid].toFixed(2)),
    p5:     parseFloat(compReturns[Math.floor(nResample * 0.05)].toFixed(2)),
    p95:    parseFloat(compReturns[Math.floor(nResample * 0.95)].toFixed(2)),
    probPositive: parseFloat((compReturns.filter(r => r > 0).length / nResample).toFixed(3)),
  };
}

// ── Full-metrics bootstrap (10 000 resamples, all metrics) ────────────────────
export type BootstrapFullResult = {
  observations: number;
  resamples: number;
  seed: number;
  sampleSufficiency: "adequate" | "small_sample_warning" | "insufficient";
  compoundReturn: { observed: number; median: number; p05: number; p95: number; probabilityPositive: number };
  cagr:           { observed: number; median: number; p05: number; p95: number; probabilityPositive: number };
  maxDrawdown:    { observed: number; median: number; p05: number; p95: number };
  calmar:         { observed: number | null; median: number | null; p05: number | null; p95: number | null };
  profitFactor:   { observed: number; median: number; p05: number; p95: number };
  methodNote: string;
};

export function bootstrapFullMetrics(
  returns: number[],      // trade returns in % (e.g. +2.5 = +2.5%)
  tradingYears: number,
  nResample = 10000,
  seed = 42,
): BootstrapFullResult {
  const n = returns.length;
  const sampleSufficiency: BootstrapFullResult["sampleSufficiency"] =
    n >= 30 ? "adequate" : n >= 15 ? "small_sample_warning" : "insufficient";

  if (n === 0) {
    const z = { observed: 0, median: 0, p05: 0, p95: 0, probabilityPositive: 0 };
    return {
      observations: 0, resamples: nResample, seed, sampleSufficiency,
      compoundReturn: z, cagr: z, maxDrawdown: { observed: 0, median: 0, p05: 0, p95: 0 },
      calmar: { observed: null, median: null, p05: null, p95: null },
      profitFactor: { ...z }, methodNote: "No data",
    };
  }

  // Observed metrics
  let obs_eq = 1, obs_peak = 1, obs_maxDD = 0;
  for (const r of returns) {
    obs_eq *= (1 + r / 100);
    if (obs_eq > obs_peak) obs_peak = obs_eq;
    const dd = obs_peak > 0 ? (obs_peak - obs_eq) / obs_peak : 0;
    if (dd > obs_maxDD) obs_maxDD = dd;
  }
  const obs_compound = (obs_eq - 1) * 100;
  const obs_cagr = tradingYears > 0 ? (Math.pow(Math.max(obs_eq, 1e-9), 1 / tradingYears) - 1) * 100 : 0;
  const obs_calmar = obs_maxDD > 0.001 ? (obs_cagr / 100) / obs_maxDD : null;
  const obs_gw = returns.filter(r => r > 0).reduce((s, r) => s + r, 0);
  const obs_gl = Math.abs(returns.filter(r => r < 0).reduce((s, r) => s + r, 0));
  const obs_pf = obs_gl > 1e-9 ? obs_gw / obs_gl : (obs_gw > 0 ? 99 : 0);

  const rand = makeLcg(seed);
  const bs_compound: number[] = [], bs_cagr: number[] = [],
        bs_maxDD: number[] = [], bs_calmar: number[] = [], bs_pf: number[] = [];

  for (let b = 0; b < nResample; b++) {
    let eq = 1, peak = 1, maxDD = 0;
    let gw = 0, gl = 0;
    for (let i = 0; i < n; i++) {
      const r = returns[Math.floor(rand() * n)];
      eq *= (1 + r / 100);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (r > 0) gw += r; else gl += Math.abs(r);
    }
    const compound = (eq - 1) * 100;
    const cagr_b = tradingYears > 0 ? (Math.pow(Math.max(eq, 1e-9), 1 / tradingYears) - 1) * 100 : 0;
    const pf_b = gl > 1e-9 ? gw / gl : (gw > 0 ? 99 : 0);
    bs_compound.push(compound);
    bs_cagr.push(cagr_b);
    bs_maxDD.push(maxDD * 100);
    bs_calmar.push(maxDD > 0.001 ? (cagr_b / 100) / maxDD : 0);
    bs_pf.push(Math.min(pf_b, 99));
  }

  const pct = (arr: number[], p: number) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(arr.length*p)]; };
  const med = (arr: number[]) => pct(arr, 0.5);
  const f2 = (v: number) => parseFloat(v.toFixed(2));
  const f3 = (v: number) => parseFloat(v.toFixed(3));

  return {
    observations: n, resamples: nResample, seed, sampleSufficiency,
    compoundReturn: {
      observed: f2(obs_compound), median: f2(med(bs_compound)),
      p05: f2(pct(bs_compound, 0.05)), p95: f2(pct(bs_compound, 0.95)),
      probabilityPositive: f3(bs_compound.filter(r => r > 0).length / nResample),
    },
    cagr: {
      observed: f2(obs_cagr), median: f2(med(bs_cagr)),
      p05: f2(pct(bs_cagr, 0.05)), p95: f2(pct(bs_cagr, 0.95)),
      probabilityPositive: f3(bs_cagr.filter(r => r > 0).length / nResample),
    },
    maxDrawdown: {
      observed: f2(obs_maxDD * 100), median: f2(med(bs_maxDD)),
      p05: f2(pct(bs_maxDD, 0.05)), p95: f2(pct(bs_maxDD, 0.95)),
    },
    calmar: {
      observed: obs_calmar != null ? f3(obs_calmar) : null,
      median: f3(med(bs_calmar)), p05: f3(pct(bs_calmar, 0.05)), p95: f3(pct(bs_calmar, 0.95)),
    },
    profitFactor: {
      observed: f3(obs_pf), median: f3(med(bs_pf)),
      p05: f3(pct(bs_pf, 0.05)), p95: f3(pct(bs_pf, 0.95)),
    },
    methodNote:
      "Bootstrap with replacement on sequential trade returns. Assumes independence. " +
      "Does not correct for multiple testing. Serial correlation not explicitly modeled.",
  };
}

// ── Bootstrap delta vs baseline (paired test) ─────────────────────────────────
export type BootstrapDeltaResult = {
  policy: string;
  resamples: number;
  seed: number;
  sampleNote: string;
  deltaCompoundReturn: { observed: number; median: number; p05: number; p95: number; probPolicyBeatsBaseline: number };
  deltaMaxDrawdown:    { observed: number; median: number; p05: number; p95: number; probPolicyImprovesDrawdown: number };
  deltaCalmar:         { observed: number | null; median: number | null; p05: number | null; p95: number | null; probPolicyBeatsBaseline: number | null };
};

export function bootstrapPairedDelta(
  allBaselineReturns: number[],    // all in-window trade returns (sorted chronologically)
  keepMask: boolean[],             // which trades the policy keeps
  tradingYears: number,
  policy: string,
  nResample = 10000,
  seed = 42,
): BootstrapDeltaResult {
  if (allBaselineReturns.length === 0 || allBaselineReturns.length !== keepMask.length) {
    return {
      policy, resamples: nResample, seed,
      sampleNote: "Insufficient data",
      deltaCompoundReturn: { observed: 0, median: 0, p05: 0, p95: 0, probPolicyBeatsBaseline: 0 },
      deltaMaxDrawdown:    { observed: 0, median: 0, p05: 0, p95: 0, probPolicyImprovesDrawdown: 0 },
      deltaCalmar:         { observed: null, median: null, p05: null, p95: null, probPolicyBeatsBaseline: null },
    };
  }

  const n = allBaselineReturns.length;
  const keptCount = keepMask.filter(Boolean).length;
  const sampleNote = keptCount < 15
    ? `Small sample warning: policy keeps only ${keptCount} trades.`
    : `${keptCount} trades kept.`;

  function compoundAndDD(rets: number[]): { compound: number; maxDD: number; calmar: number | null } {
    let eq = 1, peak = 1, maxDD = 0;
    for (const r of rets) {
      eq *= (1 + r / 100);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    const compound = (eq - 1) * 100;
    const cagr = tradingYears > 0 ? (Math.pow(Math.max(eq, 1e-9), 1 / tradingYears) - 1) * 100 : 0;
    const calmar = maxDD > 0.001 ? (cagr / 100) / maxDD : null;
    return { compound, maxDD: maxDD * 100, calmar };
  }

  const obs_base = compoundAndDD(allBaselineReturns);
  const obs_filt = compoundAndDD(allBaselineReturns.filter((_, i) => keepMask[i]));
  const obs_deltaCompound = obs_filt.compound - obs_base.compound;
  const obs_deltaDD = obs_base.maxDD - obs_filt.maxDD; // positive = improvement (less drawdown)
  const obs_deltaCalmar = (obs_base.calmar != null && obs_filt.calmar != null)
    ? obs_filt.calmar - obs_base.calmar : null;

  const rand = makeLcg(seed);
  const bs_deltaCompound: number[] = [], bs_deltaDD: number[] = [], bs_deltaCalmar: number[] = [];

  for (let b = 0; b < nResample; b++) {
    // Paired resample: draw indices, apply same filter
    const indices: number[] = [];
    for (let i = 0; i < n; i++) indices.push(Math.floor(rand() * n));

    const baseRets = indices.map(i => allBaselineReturns[i]);
    const filtRets = indices.filter(i => keepMask[i]).map(i => allBaselineReturns[i]);

    const base_b = compoundAndDD(baseRets);
    const filt_b = compoundAndDD(filtRets);

    bs_deltaCompound.push(filt_b.compound - base_b.compound);
    bs_deltaDD.push(base_b.maxDD - filt_b.maxDD);
    if (base_b.calmar != null && filt_b.calmar != null) {
      bs_deltaCalmar.push(filt_b.calmar - base_b.calmar);
    }
  }

  const pct = (arr: number[], p: number) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(arr.length*p)]; };
  const med = (arr: number[]) => pct(arr, 0.5);
  const f3 = (v: number) => parseFloat(v.toFixed(3));
  const hasCalmar = bs_deltaCalmar.length >= nResample * 0.9; // enough valid calmar samples

  return {
    policy, resamples: nResample, seed, sampleNote,
    deltaCompoundReturn: {
      observed: f3(obs_deltaCompound),
      median: f3(med(bs_deltaCompound)),
      p05:    f3(pct(bs_deltaCompound, 0.05)),
      p95:    f3(pct(bs_deltaCompound, 0.95)),
      probPolicyBeatsBaseline: parseFloat((bs_deltaCompound.filter(d => d > 0).length / nResample).toFixed(3)),
    },
    deltaMaxDrawdown: {
      observed: f3(obs_deltaDD),
      median: f3(med(bs_deltaDD)),
      p05:    f3(pct(bs_deltaDD, 0.05)),
      p95:    f3(pct(bs_deltaDD, 0.95)),
      probPolicyImprovesDrawdown: parseFloat((bs_deltaDD.filter(d => d > 0).length / nResample).toFixed(3)),
    },
    deltaCalmar: hasCalmar ? {
      observed: obs_deltaCalmar != null ? f3(obs_deltaCalmar) : null,
      median: f3(med(bs_deltaCalmar)),
      p05:    f3(pct(bs_deltaCalmar, 0.05)),
      p95:    f3(pct(bs_deltaCalmar, 0.95)),
      probPolicyBeatsBaseline: parseFloat((bs_deltaCalmar.filter(d => d > 0).length / bs_deltaCalmar.length).toFixed(3)),
    } : { observed: null, median: null, p05: null, p95: null, probPolicyBeatsBaseline: null },
  };
}

// ── Deflated Sharpe Ratio (Bailey et al. 2014) ────────────────────────────────
// OUTPUT TYPE CLARIFICATION (Gate 1 fix):
//   dsrZScore      = (SR_observed - E[SR_max_under_K_trials]) / Var[SR]^0.5
//                    → a Z-SCORE, range (-∞, +∞). Negative = did NOT beat expected max.
//   dsrProbability = Φ(dsrZScore), range [0, 1].
//                    → probability that observed SR exceeds the max expected under H0.
//                    A value near 0 means the observed SR is entirely within what
//                    chance would produce when testing K candidates.
//   isStrategyStat = dsrZScore > 0, i.e. dsrProbability > 0.5
//
// The PREVIOUS output labeled the Z-score as "deflatedSharpe" which was misleading.
// Fixed: now separately labeled as dsrZScore and dsrProbability.
export type DSRResult = {
  resultId: string;
  status: "computed" | "pending_methodological_resolution";
  outputType: "z_score_and_probability";   // explicit — both returned

  observedSharpe?: number;
  expectedMaxSharpeUnderTrials?: number;   // E[SR_max] = SR_hat0

  // ── Z-Score (was previously mislabeled "deflatedSharpe") ──
  dsrZScore?: number;          // (SR_obs - E[SR_max]) / Var[SR]^0.5  — can be negative
  // ── Probability (the actual DSR in Bailey et al.) ──
  dsrProbability?: number;     // Φ(dsrZScore) ∈ [0,1]. Near 0 = fails test.

  isStrategyStat?: boolean;    // dsrZScore > 0, equivalently dsrProbability > 0.5

  trialCount?: number;
  observationCount?: number;
  methodologyNote: string;
  blockerReason?: string;
};

// Normal CDF approximation (Abramowitz & Stegun)
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? phi : 1 - phi;
}

/**
 * Compute Deflated Sharpe Ratio for a Strategy Engine pattern portfolio.
 * Uses Bailey & López de Prado (2014) formulation.
 *
 * Returns: SR_DSR = SR(T̃) - SR_hat0(T̃) / Var[SR(T̃)]^0.5
 * isStrategyStat = true if SR_DSR > 0 (i.e., SR beats null hypothesis)
 *
 * METHODOLOGICAL NOTE:
 * - Return series used: per-trade OOS returns (NOT annual).
 * - Trial count = candidates tested (approximate, not all with full OOS series).
 * - We do NOT have the full return matrix of all K candidates → cannot use
 *   the full Bailey et al. simulation; use analytical approximation only.
 * - This is a RESEARCH-ONLY metric, not a live-trading significance test.
 */
export function computeDSR(
  oosTradeReturns: number[],  // per-trade returns in decimal (e.g. 0.025 = +2.5%)
  trialCount: number,         // number of strategies/candidates tested
  resultId: string,
): DSRResult {
  const T = oosTradeReturns.length;

  if (T < 10) {
    return {
      resultId, status: "pending_methodological_resolution",
      outputType: "z_score_and_probability" as const,
      trialCount, observationCount: T,
      methodologyNote: "",
      blockerReason: `Insufficient OOS observations (${T}). Minimum 10 required for DSR.`,
    };
  }
  if (trialCount < 2) {
    return {
      resultId, status: "pending_methodological_resolution",
      outputType: "z_score_and_probability" as const,
      trialCount, observationCount: T,
      methodologyNote: "",
      blockerReason: "Trial count < 2. DSR requires multiple tested strategies.",
    };
  }

  const mean = oosTradeReturns.reduce((s, r) => s + r, 0) / T;
  const variance = oosTradeReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (T - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev < 1e-10) {
    return {
      resultId, status: "pending_methodological_resolution",
      outputType: "z_score_and_probability" as const,
      methodologyNote: "", blockerReason: "Zero standard deviation in returns.",
    };
  }

  // Sharpe ratio (annualized assuming ~252 trading days, but trades are not daily)
  // Use per-trade Sharpe as proxy (not annualized, to avoid assumptions)
  const SR_observed = mean / stdDev;  // per-trade Sharpe

  // Skewness and excess kurtosis
  const skew = oosTradeReturns.reduce((s, r) => s + ((r - mean) / stdDev) ** 3, 0) / T;
  const kurt = oosTradeReturns.reduce((s, r) => s + ((r - mean) / stdDev) ** 4, 0) / T - 3;

  // Expected maximum Sharpe under multiple testing (analytical approximation)
  // Bailey et al.: E[max SR] ≈ (1-γ) * Φ^(-1)(1 - 1/K) + γ * Φ^(-1)(1 - 1/(K*e))
  // where γ = Euler-Mascheroni constant ≈ 0.5772
  // Simplified: E[max SR̂] ≈ √(2 * ln(K)) for large K (extreme value theory)
  const K = trialCount;
  const gamma_em = 0.5772156649;

  // Inverse normal (approximation for moderate p-values)
  function normInv(p: number): number {
    // Rational approximation
    const a1=-3.969683028665376e+01, a2=2.209460984245205e+02, a3=-2.759285104469687e+02,
          a4=1.383577518672690e+02, a5=-3.066479806614716e+01, a6=2.506628277459239e+00;
    const b1=-5.447609879822406e+01, b2=1.615858368580409e+02, b3=-1.556989798598866e+02,
          b4=6.680131188771972e+01, b5=-1.328068155288572e+01;
    const c1=-7.784894002430293e-03, c2=-3.223964580411365e-01, c3=-2.400758277161838e+00,
          c4=-2.549732539343734e+00, c5=4.374664141464968e+00, c6=2.938163982698783e+00;
    const d1=7.784695709041462e-03, d2=3.224671290700398e-01, d3=2.445134137142996e+00, d4=3.754408661907416e+00;
    const p_low = 0.02425, p_high = 1 - p_low;
    let q: number;
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    if (p < p_low) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c1*q+c2)*q+c3)*q+c4)*q+c5)*q+c6) / ((((d1*q+d2)*q+d3)*q+d4)*q+1);
    } else if (p <= p_high) {
      q = p - 0.5; const r = q * q;
      return (((((a1*r+a2)*r+a3)*r+a4)*r+a5)*r+a6)*q / (((((b1*r+b2)*r+b3)*r+b4)*r+b5)*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c1*q+c2)*q+c3)*q+c4)*q+c5)*q+c6) / ((((d1*q+d2)*q+d3)*q+d4)*q+1);
    }
  }

  // Expected max SR across K trials (Bailey et al. simplified)
  const SR_hat0 = K >= 2
    ? (1 - gamma_em) * normInv(1 - 1 / K) + gamma_em * normInv(1 - 1 / (K * Math.E))
    : 0;

  // Variance of SR estimate (Mertens 2002 / Lo 2002 correction for non-normality)
  const sr_variance = (1 - skew * SR_observed + (kurt / 4) * SR_observed ** 2) / (T - 1);
  const sr_std = Math.sqrt(Math.max(sr_variance, 1e-10));

  // SR_DSR: z-score relative to expected max under H0
  const SR_DSR = (SR_observed - SR_hat0) / sr_std;
  const p_value = 1 - normalCdf(SR_DSR); // one-sided

  const dsrProbability = normalCdf(SR_DSR);  // Φ(Z) — the actual DSR probability ∈ [0,1]

  return {
    resultId,
    status: "computed",
    outputType: "z_score_and_probability",
    observedSharpe:              parseFloat(SR_observed.toFixed(4)),
    expectedMaxSharpeUnderTrials: parseFloat(SR_hat0.toFixed(4)),
    dsrZScore:                   parseFloat(SR_DSR.toFixed(4)),      // Z-Score, NOT DSR probability
    dsrProbability:              parseFloat(dsrProbability.toFixed(6)), // Actual DSR probability [0,1]
    isStrategyStat:              SR_DSR > 0,
    trialCount,
    observationCount: T,
    methodologyNote:
      "OUTPUT: dsrZScore=(SR_obs-E[SR_max])/Var[SR]^0.5 (Z-score, can be negative). " +
      "dsrProbability=Φ(dsrZScore)∈[0,1] (actual DSR per Bailey & López de Prado 2014). " +
      "Per-trade (not annualized) Sharpe. Analytical approximation — full candidate return matrix not available. " +
      `Skewness=${parseFloat(skew.toFixed(2))}, ExcessKurtosis=${parseFloat(kurt.toFixed(2))}, ` +
      `SR_observed=${parseFloat(SR_observed.toFixed(4))}, E[maxSR]=${parseFloat(SR_hat0.toFixed(4))}, ` +
      `dsrZScore=${parseFloat(SR_DSR.toFixed(4))}, dsrProbability=${parseFloat(dsrProbability.toFixed(6))}.`,
  };
}

// ── PBO / CSCV sample sufficiency assessment ──────────────────────────────────
export type PBOAssessment = {
  foldCount: number;
  minimumRecommendedFolds: number;
  status: "sufficient" | "borderline" | "insufficient";
  recommendation: string;
  implementable: boolean;
};

export function assessPBOFeasibility(foldCount: number): PBOAssessment {
  const min = 16;
  const borderline = 8;
  const implementable = foldCount >= 8;
  const status = foldCount >= min ? "sufficient" : foldCount >= borderline ? "borderline" : "insufficient";
  return {
    foldCount,
    minimumRecommendedFolds: min,
    status,
    implementable,
    recommendation: foldCount >= min
      ? "PBO/CSCV can be computed with reasonable reliability."
      : `Insufficient independent folds for reliable PBO/CSCV estimate (${foldCount} < recommended ${min}). ` +
        "Result would be highly variable. Report as 'borderline — interpret cautiously.'",
  };
}

// ── CSCV / PBO (Combinatorial Symmetric Cross-Validation) ────────────────────
// Bailey & López de Prado (2014) Probability of Backtest Overfitting.
//
// Method:
// 1. Partition T fold blocks into T/2 IS + T/2 OOS halves.
// 2. For each partition: find best candidate family in IS (highest mean IS return).
// 3. Measure that family's rank in OOS across all candidate families.
// 4. Compute logit(rank / (N+1)) where N = family count.
// 5. PBO = fraction of partitions where logit rank < 0 (below median in OOS).
//
// With large T (e.g., 24 folds), use random sample of partitions.
export type CSCVResult = {
  assetId: string;
  studyType: "primary_2000_2025" | "extended_sensitivity";
  foldCount: number;
  candidateFamilies: number;
  combinationsEvaluated: number;
  pbo: number;              // Probability of Backtest Overfitting [0,1]
  meanLogitRank: number;    // mean(logit(rank/(N+1))). >0 = tends above median in OOS.
  logitRankDistribution: number[];
  feasible: boolean;
  interpretation: "supportive_sensitivity" | "regime_sensitive" | "negative_overfitting" | "insufficient";
  doesNotUpgradePrimaryApprovalStatus: true;
  methodNote: string;
};

/**
 * Compute PBO via CSCV on fold-block OOS returns.
 * @param familyFoldReturns - Map from familyKey to array of OOS returns per fold (length = foldCount)
 * @param nCombinations - number of random IS/OOS partitions to evaluate
 */
export function computeCSCV(
  familyFoldReturns: Map<string, number[]>,
  assetId: string,
  studyType: CSCVResult["studyType"],
  nCombinations = 200,
  seed = 42,
): CSCVResult {
  const families = Array.from(familyFoldReturns.entries());
  const N = families.length;
  const T = families[0]?.[1].length ?? 0;

  if (N < 2 || T < 4) {
    return {
      assetId, studyType, foldCount: T, candidateFamilies: N,
      combinationsEvaluated: 0, pbo: 1, meanLogitRank: -Infinity,
      logitRankDistribution: [], feasible: false,
      interpretation: "insufficient",
      doesNotUpgradePrimaryApprovalStatus: true,
      methodNote: "Insufficient candidates or folds for CSCV.",
    };
  }

  const halfT = Math.floor(T / 2);
  const rand = makeLcg(seed);

  // Generate nCombinations random IS/OOS splits of fold indices
  function randomHalfSubset(n: number, half: number): number[] {
    const indices = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, half).sort((a, b) => a - b);
  }

  const logitRanks: number[] = [];

  for (let c = 0; c < nCombinations; c++) {
    const isFoldIndices = randomHalfSubset(T, halfT);
    const oosFoldIndices = Array.from({ length: T }, (_, i) => i).filter(i => !isFoldIndices.includes(i));

    // IS: find best family by mean IS return
    let bestFamilyKey = "";
    let bestISMean = -Infinity;
    for (const [key, returns] of families) {
      const isMean = isFoldIndices.reduce((s, i) => s + (returns[i] ?? 0), 0) / isFoldIndices.length;
      if (isMean > bestISMean) { bestISMean = isMean; bestFamilyKey = key; }
    }

    // OOS: compute mean OOS return for the IS-best family
    const bestFamilyReturns = familyFoldReturns.get(bestFamilyKey) ?? [];
    const bestOosMean = oosFoldIndices.reduce((s, i) => s + (bestFamilyReturns[i] ?? 0), 0) / oosFoldIndices.length;

    // Rank best family among all families in OOS (1 = best)
    let rank = 1;
    for (const [key, returns] of families) {
      if (key === bestFamilyKey) continue;
      const oosMean = oosFoldIndices.reduce((s, i) => s + (returns[i] ?? 0), 0) / oosFoldIndices.length;
      if (oosMean > bestOosMean) rank++;
    }

    // Logit of relative rank
    const relRank = rank / (N + 1);  // [1/(N+1), N/(N+1)]
    const clampedRel = Math.max(1e-6, Math.min(1 - 1e-6, relRank));
    const logit = Math.log(clampedRel / (1 - clampedRel));
    logitRanks.push(logit);
  }

  logitRanks.sort((a, b) => a - b);
  const pbo = logitRanks.filter(l => l < 0).length / nCombinations;
  const meanLogit = logitRanks.reduce((s, l) => s + l, 0) / nCombinations;

  const interpretation: CSCVResult["interpretation"] =
    pbo < 0.20 ? "supportive_sensitivity"   // <20% overfitting = good signal
    : pbo < 0.40 ? "regime_sensitive"       // 20-40% = mixed
    : "negative_overfitting";               // >40% = overfitting concern

  return {
    assetId, studyType, foldCount: T, candidateFamilies: N,
    combinationsEvaluated: nCombinations,
    pbo: parseFloat(pbo.toFixed(4)),
    meanLogitRank: parseFloat(meanLogit.toFixed(4)),
    logitRankDistribution: logitRanks.slice(0, 20).map(l => parseFloat(l.toFixed(3))),  // sample
    feasible: true,
    interpretation,
    doesNotUpgradePrimaryApprovalStatus: true,
    methodNote:
      `CSCV: ${nCombinations} random IS/OOS fold splits. IS half selects best candidate; ` +
      `OOS rank measures overfitting. PBO<0.20=supportive. ` +
      `Method: Bailey & López de Prado 2014. Block=1 fold. ` +
      `Sensitivity study only — does NOT change primary approval status.`,
  };
}

// ── Reality Check formalization lock ─────────────────────────────────────────
export type RealityCheckFormalizationStatus = {
  testActuallyImplemented: "White_Reality_Check_Simplified_Demeaned";
  bootstrapType: "iid_over_fold_blocks";
  blockLengthSelectionMethod: "not_implemented";
  stationarityVerified: false;
  formalInferenceAllowed: false;
  classification: "exploratory_signal_only";
  maximumInterpretation: "exploratory_positive_or_negative";
  upgradeConditions: string[];
};

export const REALITY_CHECK_FORMALIZATION_STATUS: RealityCheckFormalizationStatus = {
  testActuallyImplemented: "White_Reality_Check_Simplified_Demeaned",
  bootstrapType: "iid_over_fold_blocks",
  blockLengthSelectionMethod: "not_implemented",
  stationarityVerified: false,
  formalInferenceAllowed: false,
  classification: "exploratory_signal_only",
  maximumInterpretation: "exploratory_positive_or_negative",
  upgradeConditions: [
    "Implement Politis-Romano or data-driven block length selection",
    "Verify stationarity of fold-level OOS returns",
    "Consider stationary bootstrap or circular block bootstrap",
    "Minimum 16 OOS fold blocks for adequate power",
  ],
};

// ── DSR result-type specific audit ────────────────────────────────────────────
export type StatisticalResultType =
  | "single_pattern_candidate"
  | "asset_portfolio_selected_from_multiple_patterns"
  | "agriculture_group_portfolio"
  | "seasonal_filter_policy";

export type ResultTypeSpecificDSRAudit = {
  resultType: StatisticalResultType;
  assetOrPortfolioId: string;
  baseCandidateUniverseSize: number;
  additionalSelectionComplexity: {
    multiplePatternsSelected: boolean;
    combinationSearchOccurred: boolean;
    overlapPolicyApplied: boolean;
    foldInternalSelectionApplied: boolean;
    portfolioCombinationApplied: boolean;
  };
  currentDsrTrialCountUsed: number | null;
  currentDsrTrialCountMethodologicallyValid: boolean;
  correctedTrialCountOrBlocker: number | string;
  statusImpact: string;
};

export function buildDsrResultTypeAudit(
  resultType: StatisticalResultType,
  id: string,
  baseUniverse = 1392,
): ResultTypeSpecificDSRAudit {
  switch (resultType) {
    case "single_pattern_candidate":
      return {
        resultType, assetOrPortfolioId: id,
        baseCandidateUniverseSize: baseUniverse,
        additionalSelectionComplexity: {
          multiplePatternsSelected: false, combinationSearchOccurred: false,
          overlapPolicyApplied: false, foldInternalSelectionApplied: false,
          portfolioCombinationApplied: false,
        },
        currentDsrTrialCountUsed: baseUniverse,
        currentDsrTrialCountMethodologicallyValid: true,
        correctedTrialCountOrBlocker: baseUniverse,
        statusImpact: "K=1392 valid for single pattern DSR. Result: DSR failed (Z-score negative).",
      };

    case "asset_portfolio_selected_from_multiple_patterns":
      return {
        resultType, assetOrPortfolioId: id,
        baseCandidateUniverseSize: baseUniverse,
        additionalSelectionComplexity: {
          multiplePatternsSelected: true, combinationSearchOccurred: true,
          overlapPolicyApplied: true, foldInternalSelectionApplied: true,
          portfolioCombinationApplied: true,
        },
        currentDsrTrialCountUsed: baseUniverse,
        currentDsrTrialCountMethodologicallyValid: false,
        correctedTrialCountOrBlocker:
          "Portfolio DSR not formally defined. The portfolio involves: (1) 1392 base patterns, " +
          "(2) fold-internal IS selection (~300-600 per fold), (3) overlap deduplication, " +
          "(4) portfolio combination of up to 6 patterns. The effective trial count for the PORTFOLIO " +
          "is higher than 1392 (combination search). Pattern-level DSR is valid at K=1392; " +
          "portfolio-level DSR requires a separate formulation.",
        statusImpact: "Portfolio-level DSR: not formally defined. Status remains statistics_incomplete_with_known_failure.",
      };

    case "agriculture_group_portfolio":
      return {
        resultType, assetOrPortfolioId: id,
        baseCandidateUniverseSize: baseUniverse * 8,  // 8 assets × 1392
        additionalSelectionComplexity: {
          multiplePatternsSelected: true, combinationSearchOccurred: true,
          overlapPolicyApplied: true, foldInternalSelectionApplied: true,
          portfolioCombinationApplied: true,
        },
        currentDsrTrialCountUsed: null,
        currentDsrTrialCountMethodologicallyValid: false,
        correctedTrialCountOrBlocker: "Group portfolio: 11,136 candidate combinations × cross-asset combination = not formally defined.",
        statusImpact: "Group portfolio DSR not applicable. Portfolio rejected on OOS performance grounds.",
      };

    case "seasonal_filter_policy":
      return {
        resultType, assetOrPortfolioId: id,
        baseCandidateUniverseSize: 6,  // filter policies tested
        additionalSelectionComplexity: {
          multiplePatternsSelected: false, combinationSearchOccurred: false,
          overlapPolicyApplied: false, foldInternalSelectionApplied: true,
          portfolioCombinationApplied: false,
        },
        currentDsrTrialCountUsed: 240,  // 6 policies × 40 candidate families (approximate)
        currentDsrTrialCountMethodologicallyValid: false,
        correctedTrialCountOrBlocker: "Filter policy DSR: approximate. 6 policies × seasonal signal candidates. Not formally defined.",
        statusImpact: "Filter policy statistics remain pending. Wheat sample insufficient regardless.",
      };
  }
}

// ── IS Asset Eligibility Assessment ──────────────────────────────────────────
export type ISEligibilityResult = {
  eligible: boolean;
  reason: string;
  bestISWinRate: number;
  bestISAvgReturn: number;
  bestISPF: number;
  isCompositeScore: number;
  isEstimatedCalmar: number | null;
};

export type AgricultureEligibilityPolicy =
  | "ALL_SOURCE_VALID_ASSETS"
  | "IS_WF_VALIDATED_PATTERNS_ONLY"
  | "IS_WF_VALIDATED_AND_POSITIVE_ASSET_PORTFOLIO"
  | "IS_WF_VALIDATED_POSITIVE_AND_MIN_CALMAR";

/**
 * Assess whether an asset is eligible for inclusion in the Agriculture Group Portfolio
 * for the upcoming OOS fold, based solely on IS data.
 */
export function assessISAssetEligibility(
  isCloseMap: Map<number, Map<number,number>>,
  isYears: number[],
  policy: AgricultureEligibilityPolicy,
  calmarThreshold = 0.20,
): ISEligibilityResult {
  if (policy === "ALL_SOURCE_VALID_ASSETS") {
    return { eligible: true, reason: "all_source_valid", bestISWinRate: 0, bestISAvgReturn: 0, bestISPF: 0, isCompositeScore: 0, isEstimatedCalmar: null };
  }

  // Find best IS candidate
  let bestScore = -Infinity, bestWR = 0, bestAvg = 0, bestPF = 0;
  let hasCandidates = false;

  for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
    for (const dir of ["LONG", "SHORT"] as const) {
      for (const hd of HOLD_CANDS) {
        const m = preFilter(isCloseMap, isYears, slot, hd, dir);
        if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 1.0) continue;
        const sc = m.winRate * 100 + m.avgReturn * 1000 + m.pf * 10 - hd * 0.1;
        if (sc > bestScore) {
          bestScore = sc; bestWR = m.winRate; bestAvg = m.avgReturn; bestPF = m.pf;
          hasCandidates = true;
        }
      }
    }
  }

  if (!hasCandidates) {
    return { eligible: false, reason: "no_is_candidates_pass_prefilter", bestISWinRate: 0, bestISAvgReturn: 0, bestISPF: 0, isCompositeScore: 0, isEstimatedCalmar: null };
  }

  if (policy === "IS_WF_VALIDATED_PATTERNS_ONLY") {
    return { eligible: true, reason: "has_is_candidates", bestISWinRate: bestWR, bestISAvgReturn: bestAvg, bestISPF: bestPF, isCompositeScore: bestScore, isEstimatedCalmar: null };
  }

  if (policy === "IS_WF_VALIDATED_AND_POSITIVE_ASSET_PORTFOLIO") {
    // Require IS avg return substantially positive (WR≥62%, avg>0.003)
    const positiveIS = bestWR >= 62 && bestAvg > 0.003;
    if (!positiveIS) {
      return { eligible: false, reason: "is_portfolio_not_sufficiently_positive", bestISWinRate: bestWR, bestISAvgReturn: bestAvg, bestISPF: bestPF, isCompositeScore: bestScore, isEstimatedCalmar: null };
    }
    return { eligible: true, reason: "is_portfolio_positive", bestISWinRate: bestWR, bestISAvgReturn: bestAvg, bestISPF: bestPF, isCompositeScore: bestScore, isEstimatedCalmar: null };
  }

  if (policy === "IS_WF_VALIDATED_POSITIVE_AND_MIN_CALMAR") {
    // Estimate IS Calmar from IS metrics
    // IS avg return over IS years as proxy for CAGR
    // IS MaxDD estimate: 1 / PF ratio * avg return
    const isCalmarEstimate = bestPF > 0 ? bestAvg / (bestAvg / bestPF + bestAvg * 0.5) : null;
    if (isCalmarEstimate == null || isCalmarEstimate < calmarThreshold) {
      return { eligible: false, reason: `is_calmar_${isCalmarEstimate?.toFixed(2)}_below_threshold_${calmarThreshold}`, bestISWinRate: bestWR, bestISAvgReturn: bestAvg, bestISPF: bestPF, isCompositeScore: bestScore, isEstimatedCalmar: isCalmarEstimate ?? null };
    }
    return { eligible: true, reason: "is_calmar_above_threshold", bestISWinRate: bestWR, bestISAvgReturn: bestAvg, bestISPF: bestPF, isCompositeScore: bestScore, isEstimatedCalmar: isCalmarEstimate };
  }

  return { eligible: false, reason: "unknown_policy", bestISWinRate: 0, bestISAvgReturn: 0, bestISPF: 0, isCompositeScore: 0, isEstimatedCalmar: null };
}

// ── Research Approval Status ──────────────────────────────────────────────────
export type ResearchApprovalStatus =
  | "wf_validated_statistics_pending"          // WF passed, statistics not yet run
  | "statistics_incomplete_with_known_failure" // Some tests run, at least one FAILED
  | "statistics_failed"                        // All applicable tests run, failed
  | "statistics_passed_execution_pending"      // Statistics passed, execution not verified
  | "research_approved"                        // Statistics + execution verified
  | "portfolio_library_eligible";              // Full gate chain passed

/**
 * Determine research approval status given available test results.
 * DSR failure counts as a known failure even if SPA/PBO are still pending.
 */
export function determineResearchApprovalStatus(
  wfPassed: boolean,
  dsrResult: DSRResult | null,
  spaStatus: "passed" | "failed" | "pending" | "blocked",
  pboStatus: "passed" | "failed" | "pending" | "insufficient",
  executionVerified: boolean,
): ResearchApprovalStatus {
  if (!wfPassed) return "statistics_failed"; // shouldn't happen
  const dsrFailed = dsrResult?.status === "computed" && dsrResult.isStrategyStat === false;
  const dsrPassed = dsrResult?.status === "computed" && dsrResult.isStrategyStat === true;
  const spaPassed = spaStatus === "passed";
  const spaFailed = spaStatus === "failed";

  // Any known failure → incomplete_with_known_failure (not just pending)
  if (dsrFailed || spaFailed) return "statistics_incomplete_with_known_failure";

  // All tests pending → pending
  if (!dsrPassed && !spaPassed) return "wf_validated_statistics_pending";

  // Not all criteria met
  if (!dsrPassed || !spaPassed) return "statistics_incomplete_with_known_failure";

  // All statistics passed
  if (!executionVerified) return "statistics_passed_execution_pending";
  return "research_approved";
}

// ── Sample Sufficiency for Filter Policies ────────────────────────────────────
export const FILTER_MIN_RETAINED_TRADES = 30;   // minimum retained OOS trades for statistics review
export const FILTER_MIN_OOS_FOLDS_WITH_TRADES = 6; // minimum outer folds with at least 1 retained trade

export function assessFilterSampleSufficiency(
  retainedTrades: number,
  foldsWithTrades: number,
): { passed: boolean; status: "sufficient" | "small_sample" | "insufficient"; note: string } {
  if (retainedTrades >= FILTER_MIN_RETAINED_TRADES && foldsWithTrades >= FILTER_MIN_OOS_FOLDS_WITH_TRADES) {
    return { passed: true, status: "sufficient", note: `${retainedTrades} retained trades, ${foldsWithTrades} folds.` };
  }
  if (retainedTrades < 10 || foldsWithTrades < 3) {
    return { passed: false, status: "insufficient", note: `Insufficient: ${retainedTrades} trades (min ${FILTER_MIN_RETAINED_TRADES}), ${foldsWithTrades} folds (min ${FILTER_MIN_OOS_FOLDS_WITH_TRADES}).` };
  }
  return {
    passed: false,
    status: "small_sample",
    note: `Small sample: ${retainedTrades} trades (min ${FILTER_MIN_RETAINED_TRADES}), ${foldsWithTrades} folds (min ${FILTER_MIN_OOS_FOLDS_WITH_TRADES}). Hypothesis candidate only.`,
  };
}

// ── Candidate OOS Return Matrix ───────────────────────────────────────────────
export type CandidateOosEntry = {
  candidateId: string;
  direction: "LONG" | "SHORT";
  entrySlot: number;
  holdingDays: number;
  foldIdx: number;
  isWinRate: number;
  isAvgReturn: number;
  oosYears: number[];
  oosReturnsPerYear: (number | null)[];  // close-to-close OOS return per year
  meanOosReturn: number | null;
};

/**
 * Generate candidate OOS return matrix for a given asset.
 * For each fold, collects IS pre-filtered candidates and their OOS returns.
 * Enables SPA / White's Reality Check.
 *
 * NOTE: Uses close-to-close fold returns (not bar-level) because we need
 * ALL candidates' returns, and bar-level computation for 1392+ candidates
 * is not feasible. This is consistent with the IS pre-filter metrics.
 *
 * @param studyStartOverride - if provided, overrides STUDY_START for fold computation.
 *   Use for extended history sensitivity. Leave undefined for primary study.
 */
export function computeCandidateOosReturnMatrix(
  closeMap: Map<number, Map<number,number>>,
  allYears: number[],
  studyStartOverride?: number,
): CandidateOosEntry[] {
  // For extended history, use the first available year as effective study start
  const effectiveStudyStart = studyStartOverride ?? STUDY_START;
  const firstOosYearPrimary = effectiveStudyStart + IT; // first possible OOS start

  const entries: CandidateOosEntry[] = [];
  let foldIdx = 0;

  for (;;) {
    const oosStart = firstOosYearPrimary + foldIdx * OOS_BLOCK;
    const isYears = allYears.filter(y => y < oosStart);
    const oosYears = allYears.filter(y => y >= oosStart && y < oosStart + OOS_BLOCK);
    if (isYears.length < IT || oosYears.length === 0) break;

    // Build IS close map
    const isMap = new Map<number, Map<number,number>>();
    for (const yr of isYears) { const m = closeMap.get(yr); if (m) isMap.set(yr, m); }

    // Find all IS pre-filtered candidates for this fold
    for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
      for (const dir of ["LONG", "SHORT"] as const) {
        for (const hd of HOLD_CANDS) {
          const m = preFilter(isMap, isYears, slot, hd, dir);
          if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 1.0) continue;

          // Compute OOS return for each OOS year (close-to-close)
          const oosReturnsPerYear: (number | null)[] = oosYears.map(yr => {
            const ym = closeMap.get(yr);
            const ep = ym?.get(slot), xp = ym?.get(slot + hd);
            if (!ep || !xp || ep <= 0) return null;
            const raw = xp / ep - 1;
            return dir === "LONG" ? raw : -raw;
          });

          const validReturns = oosReturnsPerYear.filter((r): r is number => r !== null);
          const meanOos = validReturns.length > 0
            ? validReturns.reduce((s, r) => s + r, 0) / validReturns.length
            : null;

          entries.push({
            candidateId: `${dir}_s${slot}_h${hd}_f${foldIdx}`,
            direction: dir,
            entrySlot: slot,
            holdingDays: hd,
            foldIdx,
            isWinRate: m.winRate,
            isAvgReturn: m.avgReturn,
            oosYears,
            oosReturnsPerYear,
            meanOosReturn: meanOos,
          });
        }
      }
    }

    foldIdx++;
  }

  return entries;
}

// ── White's Reality Check (simplified, block bootstrap over folds) ──────────
// CANDIDATE UNIVERSE NOTE:
//   The candidateMatrix contains (candidate, fold) PAIRS — multiple entries per unique
//   (direction, slot, holdingDays) combination (one per fold where it passed IS pre-filter).
//   The test itself groups by unique (direction, slot, holdingDays) FAMILY and uses per-family
//   fold-level returns. The correct reported count is `uniqueCandidateFamilies`, NOT the
//   raw matrix entry count. This distinction matters for interpreting the test's scope.
export type RealityCheckResult = {
  testName: "White_Reality_Check_Simplified";
  status: "computed" | "insufficient_data" | "methodological_note";
  candidateCount: number;          // raw matrix entries (candidate × fold pairs) — for reference
  uniqueCandidateFamilies: number; // unique (dir, slot, holding) families — used in the actual test
  foldCount: number;
  observationUnit: "oos_fold_mean_return";

  bestCandidateMeanReturn: number;
  benchmarkReturn: number;  // typically 0

  pValueApproximation: number;  // fraction of bootstrap resamples where random max ≥ observed max
  bootstrapResamples: number;

  passed: boolean;   // pValue < 0.05 (5% significance)
  passThreshold: number;

  methodNote: string;
  sampleSufficiency: "adequate" | "borderline" | "insufficient";
};

/**
 * Simplified White's Reality Check using block bootstrap over OOS folds.
 * Tests H0: the best strategy has no predictive power (mean OOS return = 0).
 * Uses fold-level mean returns as observations (8 folds = 8 blocks).
 *
 * IMPORTANT: With only 8 folds, block bootstrap power is very limited.
 * Result should be interpreted cautiously.
 */
export function computeRealityCheck(
  candidateMatrix: CandidateOosEntry[],
  nResample = 5000,
  seed = 42,
  pValueThreshold = 0.05,
): RealityCheckResult {
  const foldIndices = Array.from(new Set(candidateMatrix.map(c => c.foldIdx))).sort((a,b)=>a-b);
  const nFolds = foldIndices.length;

  if (nFolds < 4 || candidateMatrix.length === 0) {
    return {
      testName: "White_Reality_Check_Simplified",
      status: "insufficient_data",
      candidateCount: candidateMatrix.length,
      uniqueCandidateFamilies: 0,
      foldCount: nFolds,
      observationUnit: "oos_fold_mean_return",
      bestCandidateMeanReturn: 0,
      benchmarkReturn: 0,
      pValueApproximation: 1,
      bootstrapResamples: 0,
      passed: false,
      passThreshold: pValueThreshold,
      methodNote: "Insufficient folds for reliable test.",
      sampleSufficiency: "insufficient",
    };
  }

  // Group returns by (candidateId without foldIdx, foldIdx)
  // For each candidate family (direction+slot+holding), compute mean OOS return per fold
  type CandFamily = { dir: string; slot: number; hd: number };
  const familyMap = new Map<string, Map<number, number>>(); // family_key → (foldIdx → oosReturn)
  for (const c of candidateMatrix) {
    const key = `${c.direction}_s${c.entrySlot}_h${c.holdingDays}`;
    if (!familyMap.has(key)) familyMap.set(key, new Map());
    if (c.meanOosReturn !== null) familyMap.get(key)!.set(c.foldIdx, c.meanOosReturn);
  }

  // Build per-family across-fold return vectors
  const families: Array<{ key: string; foldReturns: number[] }> = [];
  for (const [key, foldMap] of familyMap) {
    const foldReturns = foldIndices.map(fi => foldMap.get(fi) ?? 0);
    families.push({ key, foldReturns });
  }

  if (families.length === 0) {
    return {
      testName: "White_Reality_Check_Simplified", status: "insufficient_data",
      candidateCount: candidateMatrix.length, uniqueCandidateFamilies: 0,
      foldCount: nFolds, observationUnit: "oos_fold_mean_return",
      bestCandidateMeanReturn: 0, benchmarkReturn: 0, pValueApproximation: 1,
      bootstrapResamples: 0, passed: false, passThreshold: pValueThreshold,
      methodNote: "No candidate families found.",
      sampleSufficiency: "insufficient",
    };
  }

  // Observed test statistic: max mean OOS return across all families
  const observedStat = Math.max(...families.map(f => f.foldReturns.reduce((s,r)=>s+r,0) / nFolds));

  // Block bootstrap: resample folds with replacement
  const rand = makeLcg(seed);
  let exceedCount = 0;
  for (let b = 0; b < nResample; b++) {
    // Resample nFolds fold indices with replacement
    const resampledFoldIdxs = Array.from({ length: nFolds }, () => Math.floor(rand() * nFolds));
    // Demeaned bootstrap (subtract sample mean to enforce H0)
    const bootMax = Math.max(...families.map(f => {
      const mean = f.foldReturns.reduce((s,r)=>s+r,0) / nFolds;
      const demeaned = f.foldReturns.map(r => r - mean); // center at 0 for H0
      const bootMean = resampledFoldIdxs.reduce((s, i) => s + demeaned[i], 0) / nFolds;
      return bootMean;
    }));
    if (bootMax >= observedStat) exceedCount++;
  }

  const pValue = exceedCount / nResample;
  const sampleSufficiency: RealityCheckResult["sampleSufficiency"] =
    nFolds >= 16 ? "adequate" : nFolds >= 8 ? "borderline" : "insufficient";

  return {
    testName: "White_Reality_Check_Simplified",
    status: "computed",
    candidateCount: candidateMatrix.length,         // raw (candidate × fold) pairs — for reference
    uniqueCandidateFamilies: familyMap.size,         // unique (dir,slot,hd) families — used in test
    foldCount: nFolds,
    observationUnit: "oos_fold_mean_return",
    bestCandidateMeanReturn: parseFloat(observedStat.toFixed(6)),
    benchmarkReturn: 0,
    pValueApproximation: parseFloat(pValue.toFixed(4)),
    bootstrapResamples: nResample,
    passed: pValue < pValueThreshold,
    passThreshold: pValueThreshold,
    sampleSufficiency,
    methodNote:
      `Simplified Reality Check: max mean OOS fold return vs block bootstrap under H0 (mean=0). ` +
      `${nFolds} OOS folds available (${sampleSufficiency} sample). ` +
      `Demeaned bootstrap enforces null of no predictability. ` +
      `With ${nFolds} folds, test power is ${nFolds < 10 ? "very low" : "low to moderate"}. ` +
      `Interpret cautiously — this is NOT a formal significance test.`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PRE-ENTRY EXHAUSTION FILTER ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
//
// Research filter: tests whether a seasonal pattern remains robust when the
// underlying has already moved strongly in the pattern's direction BEFORE entry.
//
// Key properties:
// - lookback = 14 trading days before entry (primary)
// - direction-normalized: SHORT patterns use negative pre-move as "aligned"
// - IS-only P90 threshold: threshold computed from IS years only (no lookahead)
// - lookahead-free: only bars BEFORE entry session used
//
// Reference:
//   preEntryReturn = close[entrySlot-1] / close[entrySlot-14-1] - 1
//   directionalPreMove = directionSign * preEntryReturn
//     where directionSign = +1 for LONG, -1 for SHORT
//
// If directionalPreMove > IS-only P90 → EXHAUSTED → trade vetoed in P90 policy.

export const PRE_ENTRY_FILTER_VERSION = "directional_pre_move_14d_is_percentile_v1";
export const PRE_ENTRY_LOOKBACK_DAYS  = 14;

export type PreEntryMoveState =
  | "NEUTRAL"
  | "ALIGNED_NOT_EXTREME"
  | "EXHAUSTED_IN_PATTERN_DIRECTION"
  | "OPPOSING_PRE_MOVE"
  | "INSUFFICIENT_HISTORY";

export type FoldFrozenPreEntryFilter = {
  assetId: string;
  foldId: string;
  patternKey: string;           // e.g. "SHORT_s113_h10"
  direction: "LONG" | "SHORT";
  anchorSlot: number;
  holdingDays: number;
  lookbackTradingDays: 14;
  thresholdMethod: "is_only_directional_pre_move_percentile";
  p90ThresholdValue: number | null;
  p80ThresholdValue: number | null;
  thresholdCalculatedFromIsYears: number[];
  sampleCount: number;
  frozenBeforeOos: true;
};

export type OosPreEntryDecision = {
  patternKey: string;
  foldId: string;
  year: number;
  anchorSlot: number;
  actualEntryDate: string;
  preEntryReturn: number;
  directionalPreMove: number;
  state: PreEntryMoveState;
  p90ThresholdValue: number | null;
  baselineTradeTaken: boolean;
  p90FilteredTaken: boolean;
  p80FilteredTaken: boolean;
  vetoedBy: "none" | "p90" | "p80_sensitivity";
};

/**
 * Compute the 14D pre-entry directional move for a given year and anchorSlot.
 * Uses only bars strictly before the entry session.
 * Returns null if insufficient bar history.
 */
export function computePreEntryDirectionalMove(
  closeMap: Map<number, Map<number,number>>,
  allYears: number[],
  year: number,
  anchorSlot: number,
  direction: "LONG" | "SHORT",
): { preEntryReturn: number; directionalPreMove: number } | null {
  const yearMap = closeMap.get(year);
  if (!yearMap) return null;

  // Entry close = close at anchorSlot (the entry bar)
  // Pre-entry window = bars [anchorSlot - PRE_ENTRY_LOOKBACK_DAYS, anchorSlot - 1]
  // We use close[anchorSlot - 1] / close[anchorSlot - 1 - PRE_ENTRY_LOOKBACK_DAYS] - 1
  // This is the return of the 14 trading days BEFORE the entry day

  const preMoveEndSlot   = anchorSlot - 1;              // last bar before entry
  const preMoveStartSlot = anchorSlot - 1 - PRE_ENTRY_LOOKBACK_DAYS; // 14 bars before

  if (preMoveStartSlot < 1) return null; // insufficient history at start of year

  // Try to get from same year first; if start slot < 1 use prior year (not implemented for now)
  const closeEnd   = yearMap.get(preMoveEndSlot);
  const closeStart = yearMap.get(preMoveStartSlot);

  if (!closeEnd || !closeStart || closeStart <= 0) return null;

  const preEntryReturn    = closeEnd / closeStart - 1;
  const directionSign     = direction === "LONG" ? 1 : -1;
  const directionalPreMove = directionSign * preEntryReturn;

  return { preEntryReturn, directionalPreMove };
}

/**
 * Compute IS-only P90 and P80 thresholds for directionalPreMove.
 * Uses only years in `isYears` — no OOS data.
 */
export function computeISPreEntryThresholds(
  closeMap: Map<number, Map<number,number>>,
  isYears: number[],
  anchorSlot: number,
  direction: "LONG" | "SHORT",
): { p90: number | null; p80: number | null; values: number[]; sampleCount: number } {
  const values: number[] = [];
  for (const yr of isYears) {
    const result = computePreEntryDirectionalMove(closeMap, [yr], yr, anchorSlot, direction);
    if (result !== null) values.push(result.directionalPreMove);
  }
  if (values.length < 5) return { p90: null, p80: null, values, sampleCount: values.length };

  const sorted = [...values].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p80 = sorted[Math.floor(sorted.length * 0.80)];
  return { p90, p80, values, sampleCount: values.length };
}

/**
 * Classify a pre-entry directional move state given thresholds.
 */
export function classifyPreEntryState(
  directionalPreMove: number,
  p90Threshold: number | null,
  p80Threshold: number | null,
): PreEntryMoveState {
  if (p90Threshold === null) return "INSUFFICIENT_HISTORY";
  if (directionalPreMove > (p90Threshold ?? Infinity)) return "EXHAUSTED_IN_PATTERN_DIRECTION";
  if (directionalPreMove > (p80Threshold ?? Infinity)) return "ALIGNED_NOT_EXTREME";
  if (Math.abs(directionalPreMove) < 0.01) return "NEUTRAL";
  if (directionalPreMove < -0.02) return "OPPOSING_PRE_MOVE";
  return "NEUTRAL";
}

/**
 * Run the full fold-level Pre-Entry Exhaustion Filter analysis for a single pattern.
 * Returns baseline, P90-veto, and P80-sensitivity OOS metrics.
 * NO LOOKAHEAD: thresholds computed from IS data only for each fold.
 */
export function runPreEntryExhaustionFilter(
  closeMap: Map<number, Map<number,number>>,
  allYears: number[],
  anchorSlot: number,
  holdingDays: number,
  direction: "LONG" | "SHORT",
  patternKey: string,
): {
  foldThresholds: FoldFrozenPreEntryFilter[];
  oosDecisions: OosPreEntryDecision[];
  baselineMetrics: Record<string, number | null>;
  p90Metrics: Record<string, number | null>;
  p80Metrics: Record<string, number | null>;
  comparisonSummary: Record<string, unknown>;
} {
  const foldThresholds: FoldFrozenPreEntryFilter[] = [];
  const oosDecisions: OosPreEntryDecision[] = [];

  let foldIdx = 0;
  for (;;) {
    const oosStart = STUDY_START + IT + foldIdx * OOS_BLOCK;
    const isYears  = allYears.filter(y => y < oosStart);
    const oosYears = allYears.filter(y => y >= oosStart && y < oosStart + OOS_BLOCK);
    if (isYears.length < IT || oosYears.length === 0) break;

    // IS-only thresholds for this fold
    const thresh = computeISPreEntryThresholds(closeMap, isYears, anchorSlot, direction);
    foldThresholds.push({
      assetId: "", foldId: `f${foldIdx}`, patternKey,
      direction, anchorSlot, holdingDays,
      lookbackTradingDays: 14,
      thresholdMethod: "is_only_directional_pre_move_percentile",
      p90ThresholdValue: thresh.p90,
      p80ThresholdValue: thresh.p80,
      thresholdCalculatedFromIsYears: isYears,
      sampleCount: thresh.sampleCount,
      frozenBeforeOos: true,
    });

    for (const oosYr of oosYears) {
      const yearMap = closeMap.get(oosYr);
      const entryClose = yearMap?.get(anchorSlot);
      const exitClose  = yearMap?.get(anchorSlot + holdingDays);
      if (!entryClose || !exitClose) continue;

      const raw = exitClose / entryClose - 1;
      const tradeReturn = direction === "LONG" ? raw : -raw;

      const preMove = computePreEntryDirectionalMove(closeMap, allYears, oosYr, anchorSlot, direction);
      const dpm = preMove?.directionalPreMove ?? 0;
      const state = preMove
        ? classifyPreEntryState(dpm, thresh.p90, thresh.p80)
        : "INSUFFICIENT_HISTORY";

      const exhausted90 = preMove && thresh.p90 !== null && dpm > thresh.p90;
      const exhausted80 = preMove && thresh.p80 !== null && dpm > thresh.p80;

      oosDecisions.push({
        patternKey, foldId: `f${foldIdx}`, year: oosYr,
        anchorSlot,
        actualEntryDate: `${oosYr} slot ${anchorSlot}`,
        preEntryReturn: preMove?.preEntryReturn ?? 0,
        directionalPreMove: dpm,
        state,
        p90ThresholdValue: thresh.p90,
        baselineTradeTaken: true,
        p90FilteredTaken: !exhausted90,
        p80FilteredTaken: !exhausted80,
        vetoedBy: exhausted90 ? "p90" : exhausted80 ? "p80_sensitivity" : "none",
      });
    }
    foldIdx++;
  }

  // Compute metrics
  function computeMetrics(decisions: OosPreEntryDecision[], filterField: keyof OosPreEntryDecision) {
    const kept = decisions.filter(d => d[filterField] === true);
    const rets = kept.map(d => {
      const yrMap = closeMap.get(d.year);
      const ep = yrMap?.get(d.anchorSlot), xp = yrMap?.get(d.anchorSlot + holdingDays);
      if (!ep || !xp) return null;
      const raw = xp / ep - 1;
      return direction === "LONG" ? raw : -raw;
    }).filter((r): r is number => r !== null);

    const n = rets.length;
    if (n === 0) return { trades: 0, return: 0, cagr: 0, winRate: 0, pf: 0, maxDD: 0, calmar: null };
    const wins = rets.filter(r => r > 0).length;
    const gw = rets.filter(r => r > 0).reduce((s,r) => s+r, 0);
    const gl = Math.abs(rets.filter(r => r < 0).reduce((s,r) => s+r, 0));
    let eq = 1, peak = 1, maxDD = 0;
    for (const r of rets) {
      eq *= (1 + r);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak-eq)/peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    const years = Math.max(1, new Set(decisions.filter(d => d[filterField] === true).map(d => d.year)).size);
    const cagr = Math.pow(Math.max(eq, 1e-9), 1/years) - 1;
    const pf = gl > 1e-9 ? gw/gl : (gw > 0 ? 99 : 0);
    const calmar = maxDD > 0.001 ? cagr / maxDD : null;
    return { trades: n, return: parseFloat(((eq-1)*100).toFixed(2)), cagr: parseFloat((cagr*100).toFixed(2)), winRate: parseFloat((wins/n*100).toFixed(1)), pf: parseFloat(pf.toFixed(3)), maxDD: parseFloat((maxDD*100).toFixed(2)), calmar: calmar != null ? parseFloat(calmar.toFixed(3)) : null };
  }

  const baselineMetrics = computeMetrics(oosDecisions, "baselineTradeTaken");
  const p90Metrics      = computeMetrics(oosDecisions, "p90FilteredTaken");
  const p80Metrics      = computeMetrics(oosDecisions, "p80FilteredTaken");

  const vetoed90 = oosDecisions.filter(d => d.vetoedBy === "p90");
  const vetoed80 = oosDecisions.filter(d => d.vetoedBy !== "none");
  const lossAvoided90 = vetoed90.filter(d => {
    const yrMap = closeMap.get(d.year);
    const ep=yrMap?.get(d.anchorSlot), xp=yrMap?.get(d.anchorSlot+holdingDays);
    if(!ep||!xp) return false;
    const ret = direction==="LONG" ? xp/ep-1 : -(xp/ep-1);
    return ret < 0;
  }).length;
  const winMissed90 = vetoed90.filter(d => {
    const yrMap = closeMap.get(d.year);
    const ep=yrMap?.get(d.anchorSlot), xp=yrMap?.get(d.anchorSlot+holdingDays);
    if(!ep||!xp) return false;
    const ret = direction==="LONG" ? xp/ep-1 : -(xp/ep-1);
    return ret > 0;
  }).length;

  return {
    foldThresholds,
    oosDecisions,
    baselineMetrics,
    p90Metrics,
    p80Metrics,
    comparisonSummary: {
      patternKey,
      direction,
      anchorSlot,
      holdingDays,
      lookbackDays: PRE_ENTRY_LOOKBACK_DAYS,
      baselineTrades: baselineMetrics.trades,
      p90VetoedTrades: vetoed90.length,
      p90LosersAvoided: lossAvoided90,
      p90WinnersMissed: winMissed90,
      p90RetentionRate: baselineMetrics.trades > 0 ? parseFloat((p90Metrics.trades/baselineMetrics.trades*100).toFixed(1)) : 0,
      deltaReturn: baselineMetrics.trades > 0 ? parseFloat((p90Metrics.return - baselineMetrics.return).toFixed(2)) : 0,
      deltaMaxDD:  baselineMetrics.trades > 0 ? parseFloat((p90Metrics.maxDD - baselineMetrics.maxDD).toFixed(2)) : 0,
      deltaCalmar: (baselineMetrics.calmar != null && p90Metrics.calmar != null) ? parseFloat((p90Metrics.calmar - baselineMetrics.calmar).toFixed(3)) : null,
      researchStatus: "wf_evaluated_statistics_pending",
      noLookahead: true,
      thresholdSource: "IS-only per fold",
    },
  };
}
