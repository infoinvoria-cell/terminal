/**
 * ModelingDataset — canonical data contract for the Modeling Studio.
 *
 * One instance per (selectionId, dataResolution) pair.
 * All model components consume this contract exclusively —
 * no card does its own file search or data fetch.
 *
 * Data availability flags drive card visibility:
 *   hasEquity → Equity, Drawdown, Rolling Metrics
 *   hasReturns → Return Distribution, Tail Risk, Monte Carlo
 *   hasBenchmark → Regression, Dynamic Correlation (vs benchmark)
 *   hasComponents → Correlation matrix
 *   hasTrades → Trade Scatter
 *   hasPhases → phase boundary overlays
 */

export type ReturnFrequency = "trade" | "daily" | "weekly" | "monthly";

export type DataPoint = { date: string; value: number };

export type TradeRecord = {
  entryDate: string;
  exitDate: string;
  pnlPct: number;       // realised return, decimal (e.g. 0.032 = 3.2%)
  mae: number;          // max adverse excursion, decimal
  mfe: number;          // max favourable excursion, decimal
  holdingDays: number;
};

export type PhaseRecord = {
  id: string;                                        // "TRAIN" | "WF" | "OOS" | "LIVE" | custom
  label: string;                                     // display label
  startDate: string;
  endDate: string | null;                            // null = ongoing
};

export type ComponentSeries = {
  id: string;
  label: string;
  series: DataPoint[];
  weight?: number;
};

/** Quality flags derived from the data found for this selection. */
export type DataQuality = {
  hasEquity: boolean;
  hasReturns: boolean;           // at least monthly returns
  hasHighResReturns: boolean;    // daily or better
  hasTrades: boolean;
  hasBenchmark: boolean;
  hasComponents: boolean;        // portfolio/group has per-component series
  hasPhases: boolean;
  returnFrequency: ReturnFrequency;
  equityPointCount: number;
  returnCount: number;
  tradeCount: number;
  historyFrom: string | null;
  historyTo: string | null;
};

export type ModelingDataset = {
  selectionId: string;
  label: string;
  sourceHash: string;

  // Time-series (full available history, not downsampled)
  equity: DataPoint[];            // cumulative % return indexed 100 at start
  drawdown: DataPoint[];          // peak-to-trough % at each point
  benchmark: DataPoint[];         // same scale as equity (may be empty)
  components: ComponentSeries[];  // for portfolios/groups

  // Returns at the best available frequency
  returns: number[];              // decimal (0.032 = 3.2%), best resolution
  returnFrequency: ReturnFrequency;
  monthlyReturns: number[];       // always available (derived from equity if needed)

  // Trade-level data (may be empty)
  trades: TradeRecord[];

  // Phase metadata (may be empty)
  phases: PhaseRecord[];

  // Quality flags for card visibility decisions
  quality: DataQuality;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function emptyDataset(selectionId: string, label: string): ModelingDataset {
  const quality: DataQuality = {
    hasEquity: false,
    hasReturns: false,
    hasHighResReturns: false,
    hasTrades: false,
    hasBenchmark: false,
    hasComponents: false,
    hasPhases: false,
    returnFrequency: "monthly",
    equityPointCount: 0,
    returnCount: 0,
    tradeCount: 0,
    historyFrom: null,
    historyTo: null,
  };
  return {
    selectionId,
    label,
    sourceHash: `${selectionId}-empty`,
    equity: [],
    drawdown: [],
    benchmark: [],
    components: [],
    returns: [],
    returnFrequency: "monthly",
    monthlyReturns: [],
    trades: [],
    phases: [],
    quality,
  };
}

/** Extract monthly returns from a monthly equity series.
 *  equity[i].value is cumulative % return (e.g. 25 = +25% vs start).
 *  Returns decimal period returns: r_t = (1 + cum_t/100) / (1 + cum_{t-1}/100) - 1
 */
export function equityToMonthlyReturns(equity: DataPoint[]): number[] {
  if (equity.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = 1 + (equity[i - 1]!.value / 100);
    const curr = 1 + (equity[i]!.value / 100);
    if (prev > 0) returns.push(curr / prev - 1);
  }
  return returns;
}

/** Compute peak-to-trough drawdown series from equity series.
 *  Returns same-length array of % drawdown values (≤ 0).
 */
export function computeDrawdown(equity: DataPoint[]): DataPoint[] {
  if (!equity.length) return [];
  const result: DataPoint[] = [];
  let peak = 1 + equity[0]!.value / 100;
  for (const pt of equity) {
    const v = 1 + pt.value / 100;
    if (v > peak) peak = v;
    result.push({ date: pt.date, value: ((v / peak) - 1) * 100 });
  }
  return result;
}

/** Hash a DataPoint array by length + first/last dates + last value */
export function hashSeries(series: DataPoint[]): string {
  if (!series.length) return "empty";
  const first = series[0]!;
  const last = series[series.length - 1]!;
  return `${series.length}:${first.date}:${last.date}:${last.value.toFixed(2)}`;
}
