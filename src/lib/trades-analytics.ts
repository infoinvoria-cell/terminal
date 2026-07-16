/**
 * Parse and aggregate trades_clean_compounded.csv
 * Chart stacking: IF Wert% > 3 → AVG=3, Wert=Wert%-3; else AVG=0, Wert=Wert%
 */

export type TimeRange = "1W" | "1M" | "3M" | "1Y";
export type PerformanceAggregation = "1D" | "1W" | "1M" | "3M" | "1Y";

/** May 2025 onward: reporting multiplier when Risk-to-Reward mode is on */
export const RR_REPORTING_CUTOFF = new Date(2025, 4, 1, 0, 0, 0, 0);

export function applyRrReportingMode(
  rows: TradeRow[],
  enabled: boolean
): TradeRow[] {
  if (!enabled) return rows;
  return rows.map((r) =>
    r.date >= RR_REPORTING_CUTOFF
      ? { date: r.date, gainPct: r.gainPct * 4 }
      : r
  );
}

export type TradeRow = { date: Date; gainPct: number };

export type SerializedTrade = { dateMs: number; gainPct: number };

export type ChartPoint = {
  name: string;
  total: number;
  avg: number;
  wert: number;
  /** Calendar year for grouped year axis */
  year: number;
};

export type LinePoint = {
  name: string;
  cumulativePct: number;
  year: number;
};

export type PerformancePeriodPoint = {
  key: string;
  label: string;
  periodReturnPct: number;
  cumulativePct: number;
  year: number;
};

export type PerformancePeriodTableRow = {
  label: string;
  periodReturnPct: number;
  cumulativePct: number;
  year: number;
};

export type DashboardKpis = {
  totalReturn24mPct: number;
  maxDrawdownPct: number;
  netGainLossUsd: number;
  netGainDeltaPct: number;
  ytdReturnUsd: number;
  /** YTD compounded return % — shown on portfolio KPI pill */
  ytdReturnDisplayPct: number;
  ytdVolumeUsd: number;
  ytdVolumeDeltaPct: number;
  assetsCount: number;
  strategiesCount: number;
};

const NOTIONAL = 1_000_000;
const MASTER_TRACK_RECORD_START = new Date(2024, 3, 1, 0, 0, 0, 0);

export function parseTradesCsv(content: string): TradeRow[] {
  const lines = content.trim().split(/\r?\n/);
  const rows: TradeRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const lastComma = line.lastIndexOf(",");
    if (lastComma <= 0) continue;
    const dateStr = line.slice(0, lastComma).trim();
    const gainStr = line.slice(lastComma + 1).trim().replace(",", ".");
    const gainPct = Number.parseFloat(gainStr);
    if (Number.isNaN(gainPct)) continue;
    const date = new Date(dateStr.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) continue;
    rows.push({ date, gainPct });
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
}

export function serializeTrades(rows: TradeRow[]): SerializedTrade[] {
  return rows.map((r) => ({
    dateMs: r.date.getTime(),
    gainPct: r.gainPct,
  }));
}

export function deserializeTrades(rows: SerializedTrade[]): TradeRow[] {
  return rows.map((r) => ({
    date: new Date(r.dateMs),
    gainPct: r.gainPct,
  }));
}

export function compoundGains(gains: number[]): number {
  let m = 1;
  for (const g of gains) m *= 1 + g / 100;
  return (m - 1) * 100;
}

/** Rule: IF Wert% > 3 → AVG=3, Wert=Wert%-3; else AVG=0, Wert=original */
export function splitAvgWert(wertPct: number): { avg: number; wert: number } {
  if (wertPct > 3) return { avg: 3, wert: wertPct - 3 };
  return { avg: 0, wert: wertPct };
}

function endDate(rows: TradeRow[]): Date {
  if (!rows.length) return new Date();
  return rows[rows.length - 1]!.date;
}

export function filterLastDays(
  rows: TradeRow[],
  days: number,
  end: Date = endDate(rows)
): TradeRow[] {
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return rows.filter((r) => r.date >= start && r.date <= end);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseMonthKey(key: string): Date {
  const [ys, ms] = key.split("-").map(Number);
  return new Date(ys, ms - 1, 1);
}

function quarterKey(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

function parseQuarterKey(key: string): { y: number; q: number } {
  const [ys, qs] = key.split("-Q").map(Number);
  return { y: ys, q: qs };
}

function yearKey(d: Date) {
  return `${d.getFullYear()}`;
}

/** Week bucket: Sunday-aligned week start date key */
function weekKey(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return dayKey(x);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Month tick: include month+year so same month across years stays distinct (e.g., Apr 24, Apr 25, Apr 26). */
function labelForMonthKey(key: string): string {
  const [ys, ms] = key.split("-").map(Number);
  const d = new Date(ys, ms - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** Week start key → compact day + month, no year in tick */
function labelWeekFromDayKey(key: string): string {
  const [y, m, da] = key.split("-").map(Number);
  const d = new Date(y, m - 1, da);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function labelQuarterKey(key: string): string {
  const { q } = parseQuarterKey(key);
  return `Q${q}`;
}

function labelDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function yearFromMonthKey(key: string): number {
  return Number(key.split("-")[0]);
}

function yearFromQuarterKey(key: string): number {
  return parseQuarterKey(key).y;
}

function yearFromWeekDayKey(key: string): number {
  const [y] = key.split("-").map(Number);
  return y;
}

function buildBucketKey(date: Date, aggregation: PerformanceAggregation) {
  if (aggregation === "1D") return dayKey(date);
  if (aggregation === "1W") return weekKey(date);
  if (aggregation === "1M") return monthKey(date);
  if (aggregation === "3M") return quarterKey(date);
  return yearKey(date);
}

function buildBucketLabel(key: string, aggregation: PerformanceAggregation) {
  if (aggregation === "1D") return labelDayKey(key);
  if (aggregation === "1W") return labelWeekFromDayKey(key);
  if (aggregation === "1M") return labelForMonthKey(key);
  if (aggregation === "3M") return labelQuarterKey(key);
  return key;
}

function buildBucketYear(key: string, aggregation: PerformanceAggregation) {
  if (aggregation === "1D" || aggregation === "1W") return yearFromWeekDayKey(key);
  if (aggregation === "1M") return yearFromMonthKey(key);
  if (aggregation === "3M") return yearFromQuarterKey(key);
  return Number(key);
}

/** Extend reporting horizon through April 2026 when book ends earlier (empty months = flat). */
function extendedHorizonEnd(rows: TradeRow[]): Date {
  const last = rows.length ? rows[rows.length - 1]!.date : new Date();
  const through = new Date(2026, 3, 30, 23, 59, 59);
  return last < through ? through : last;
}

function enumerateMonthKeys(firstKey: string, lastKey: string): string[] {
  const out: string[] = [];
  const cur = parseMonthKey(firstKey);
  const end = parseMonthKey(lastKey);
  while (cur <= end) {
    out.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function enumerateWeekKeys(firstKey: string, lastKey: string): string[] {
  const out: string[] = [];
  const [ey, em, ed] = lastKey.split("-").map(Number);
  const end = new Date(ey, em - 1, ed);
  const cur = (() => {
    const [y, m, da] = firstKey.split("-").map(Number);
    return new Date(y, m - 1, da);
  })();
  while (cur <= end) {
    out.push(weekKey(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function chartPointFromGains(
  name: string,
  gains: number[],
  year: number
): ChartPoint {
  const total = gains.length ? compoundGains(gains) : 0;
  const { avg, wert } = splitAvgWert(total);
  return { name, total, avg, wert, year };
}

function chartPointFromMonthlySum(
  name: string,
  monthlySum: number,
  year: number
): ChartPoint {
  const total = round2(monthlySum);
  const { avg, wert } = splitAvgWert(total);
  return { name, total, avg, wert, year };
}

function sumAbsBetween(rows: TradeRow[], a: Date, b: Date): number {
  return rows
    .filter((r) => r.date >= a && r.date <= b)
    .reduce((s, r) => s + Math.abs(r.gainPct), 0);
}

function fractionalMonthsBetween(a: Date, b: Date): number {
  return Math.max(0.25, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
}

function enumerateQuarterKeys(firstKey: string, lastKey: string): string[] {
  const out: string[] = [];
  let y = parseQuarterKey(firstKey).y;
  let q = parseQuarterKey(firstKey).q;
  const endY = parseQuarterKey(lastKey).y;
  const endQ = parseQuarterKey(lastKey).q;
  while (y < endY || (y === endY && q <= endQ)) {
    out.push(`${y}-Q${q}`);
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Full-history aggregation with empty buckets (flat) through the reporting horizon.
 * 1W / 1M / 3M / 1Y = week / month / quarter / calendar year.
 */
export function buildChartSeries(
  rows: TradeRow[],
  range: TimeRange
): ChartPoint[] {
  if (!rows.length) {
    const y = new Date().getFullYear();
    return [{ name: "—", total: 0, avg: 0, wert: 0, year: y }];
  }

  const map = new Map<string, number[]>();
  const push = (k: string, g: number) => {
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(g);
  };
  for (const r of rows) {
    if (range === "1W") push(weekKey(r.date), r.gainPct);
    else if (range === "1M") push(monthKey(r.date), r.gainPct);
    else if (range === "3M") push(quarterKey(r.date), r.gainPct);
    else push(yearKey(r.date), r.gainPct);
  }

  const endD = extendedHorizonEnd(rows);

  switch (range) {
    case "1W": {
      const first = weekKey(rows[0]!.date);
      const last = weekKey(endD);
      const keys = enumerateWeekKeys(first, last);
      return keys.map((key) =>
        chartPointFromGains(
          labelWeekFromDayKey(key),
          map.get(key) ?? [],
          yearFromWeekDayKey(key)
        )
      );
    }
    case "1M": {
      const first = monthKey(MASTER_TRACK_RECORD_START);
      const now = new Date();
      const last = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
      const keys = enumerateMonthKeys(first, last);
      return keys.map((key) => {
        const gains = map.get(key) ?? [];
        const monthlySum = gains.reduce((sum, gain) => sum + gain, 0);
        return chartPointFromMonthlySum(
          labelForMonthKey(key),
          monthlySum,
          yearFromMonthKey(key)
        );
      });
    }
    case "3M": {
      const first = quarterKey(rows[0]!.date);
      const last = quarterKey(endD);
      const keys = enumerateQuarterKeys(first, last);
      return keys.map((key) =>
        chartPointFromGains(
          labelQuarterKey(key),
          map.get(key) ?? [],
          yearFromQuarterKey(key)
        )
      );
    }
    case "1Y": {
      const y0 = rows[0]!.date.getFullYear();
      const y1 = endD.getFullYear();
      const keys: string[] = [];
      for (let y = y0; y <= y1; y++) keys.push(String(y));
      return keys.map((key) =>
        chartPointFromGains(key, map.get(key) ?? [], Number(key))
      );
    }
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Cumulative CRV = Σ (gain% / 100) as stacked risk-reward units (R-style sum). */
export function cumulativeCrvTotal(rows: TradeRow[]): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((s, r) => s + r.gainPct / 100, 0);
  return Math.round(sum * 10) / 10;
}

/** Cumulative compounded % after each aggregated bucket (for line chart). */
export function buildCumulativeLineSeries(
  rows: TradeRow[],
  range: TimeRange
): LinePoint[] {
  const bars = buildChartSeries(rows, range);
  let equity = 100;
  return bars.map((b) => {
    equity *= 1 + b.total / 100;
    return {
      name: b.name,
      cumulativePct: (equity / 100 - 1) * 100,
      year: b.year,
    };
  });
}

export function aggregatePerformancePeriods(
  rows: TradeRow[],
  aggregation: PerformanceAggregation
): PerformancePeriodPoint[] {
  if (!rows.length) return [];

  const grouped = new Map<string, number[]>();
  for (const row of [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const key = buildBucketKey(row.date, aggregation);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row.gainPct);
  }

  let equity = 100;
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, gains]) => {
      const periodReturnPct = compoundGains(gains);
      equity *= 1 + periodReturnPct / 100;
      return {
        key,
        label: buildBucketLabel(key, aggregation),
        periodReturnPct: round2(periodReturnPct),
        cumulativePct: round2((equity / 100 - 1) * 100),
        year: buildBucketYear(key, aggregation),
      };
    });
}

export function aggregatePerformanceTableRows(
  rows: TradeRow[],
  aggregation: PerformanceAggregation
): PerformancePeriodTableRow[] {
  return aggregatePerformancePeriods(rows, aggregation).map((point) => ({
    label: point.label,
    periodReturnPct: point.periodReturnPct,
    cumulativePct: point.cumulativePct,
    year: point.year,
  }));
}

const PERFORMANCE_TABLE_YEARS = [2024, 2025, 2026] as const;
const PERFORMANCE_MONTH_HEADERS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type PerformanceTableRow = {
  year: number;
  months: (number | null)[];
  yearTotal: number | null;
};

/** Calendar year × month compounded % (Performance Overview table). */
export function buildPerformanceYearTable(rows: TradeRow[]): {
  monthHeaders: readonly string[];
  rows: PerformanceTableRow[];
  bookTotalReturnPct: number;
} {
  if (!rows.length) {
    return {
      monthHeaders: PERFORMANCE_MONTH_HEADERS,
      rows: PERFORMANCE_TABLE_YEARS.map((year) => ({
        year,
        months: Array.from({ length: 12 }, () => null as number | null),
        yearTotal: null,
      })),
      bookTotalReturnPct: 0,
    };
  }
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const body: PerformanceTableRow[] = PERFORMANCE_TABLE_YEARS.map((year) => {
    const months: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const inMonth = sorted.filter(
        (r) => r.date.getFullYear() === year && r.date.getMonth() === m
      );
      months.push(
        inMonth.length ? compoundGains(inMonth.map((r) => r.gainPct)) : null
      );
    }
    const inYear = sorted.filter((r) => r.date.getFullYear() === year);
    return {
      year,
      months,
      yearTotal:
        inYear.length > 0 ? compoundGains(inYear.map((r) => r.gainPct)) : null,
    };
  });
  return {
    monthHeaders: PERFORMANCE_MONTH_HEADERS,
    rows: body,
    bookTotalReturnPct: compoundGains(sorted.map((r) => r.gainPct)),
  };
}

export function equityCurve(rows: TradeRow[]): number[] {
  let e = 100;
  const out: number[] = [e];
  for (const r of rows) {
    e *= 1 + r.gainPct / 100;
    out.push(e);
  }
  return out;
}

export function maxDrawdownPctFromEquity(equities: number[]): number {
  if (!equities.length) return 0;
  let peak = equities[0]!;
  let maxDd = 0;
  for (const v of equities) {
    peak = Math.max(peak, v);
    if (peak > 0) {
      const dd = ((peak - v) / peak) * 100;
      maxDd = Math.max(maxDd, dd);
    }
  }
  return maxDd;
}

function filterSince(rows: TradeRow[], start: Date): TradeRow[] {
  return rows.filter((r) => r.date >= start);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

export function computeDashboardKpis(rows: TradeRow[]): DashboardKpis {
  if (!rows.length) {
    return {
      totalReturn24mPct: 0,
      maxDrawdownPct: 0,
      netGainLossUsd: 0,
      netGainDeltaPct: 0,
      ytdReturnUsd: 0,
      ytdReturnDisplayPct: 0,
      ytdVolumeUsd: 0,
      ytdVolumeDeltaPct: 0,
      assetsCount: 0,
      strategiesCount: 0,
    };
  }

  const end = endDate(rows);
  const start24m = new Date(end);
  start24m.setMonth(start24m.getMonth() - 24);
  const rows24 = rows.filter((r) => r.date >= start24m);
  const totalReturn24mPct = compoundGains(rows24.map((r) => r.gainPct));

  const eq = equityCurve(rows);
  const maxDrawdownPct = maxDrawdownPctFromEquity(eq);

  const equityEnd = eq[eq.length - 1]!;
  const netGainLossUsd = NOTIONAL * (equityEnd / 100 - 1);

  const start365 = new Date(end);
  start365.setDate(start365.getDate() - 365);
  const rowsPrev = rows.filter((r) => r.date < start365);
  const eqPrev = equityCurve(rowsPrev);
  const equityYearAgo = eqPrev.length ? eqPrev[eqPrev.length - 1]! : 100;
  const netGainDeltaPct =
    equityYearAgo > 0 ? ((equityEnd / equityYearAgo) - 1) * 100 : 0;

  const y0 = startOfYear(end);
  const ytdRows = filterSince(rows, y0);
  const ytdPct = compoundGains(ytdRows.map((r) => r.gainPct));
  const ytdReturnUsd = NOTIONAL * ((1 + ytdPct / 100) - 1);
  const ytdReturnDisplayPct = ytdPct;

  const sumAbsYtd = ytdRows.reduce((a, r) => a + Math.abs(r.gainPct), 0);
  const ytdVolumeUsd = 1_000_000;

  const refStart = new Date(end.getFullYear() - 1, 8, 1);
  const refEnd = new Date(end.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  const sumRef4m = sumAbsBetween(rows, refStart, refEnd);
  const refMonthlyActivity = sumRef4m > 1e-6 ? sumRef4m / 4 : sumAbsYtd;
  const monthsYtd = fractionalMonthsBetween(y0, end);
  const pace = sumAbsYtd / monthsYtd;
  const ytdVolumeDeltaPct =
    refMonthlyActivity > 1e-6 ? ((pace / refMonthlyActivity) - 1) * 100 : 0;

  const assetsCount = rows.length ? 56 : 0;
  const strategiesCount = rows.length ? 8 : 0;

  return {
    totalReturn24mPct,
    maxDrawdownPct,
    netGainLossUsd,
    netGainDeltaPct,
    ytdReturnUsd,
    ytdReturnDisplayPct,
    ytdVolumeUsd,
    ytdVolumeDeltaPct,
    assetsCount,
    strategiesCount,
  };
}

// ── Combined 1D/1W series (Account 1 + Account 2) ───────────────────────────

export type CombinedDayPoint = {
  key: string;
  label: string;
  year: number;
  /** Combined cumulative % (primary line) */
  cumulativePct: number;
  /** Account 1 cumulative % */
  acc1CumulativePct: number;
  /** Account 2 cumulative from its first visible trade date, null before */
  acc2CumulativePct: number | null;
  /** Combined bucket return % */
  periodReturnPct: number;
  /** Account 1 bucket return % */
  acc1ReturnPct: number;
  /** Account 2 bucket return %, null if no Account 2 data for this bucket */
  acc2ReturnPct: number | null;
};

/**
 * Builds a combined daily or weekly equity series that includes Account 2
 * from its first available data point. Before Account 2 data begins,
 * combined = Account 1 only. From Account 2 start onwards, combined uses
 * an equal-weight average of both accounts (50/50 assumption).
 */
export function buildCombined1D1WSeries(
  acc1Rows: TradeRow[],
  acc2Rows: TradeRow[],
  aggregation: "1D" | "1W"
): CombinedDayPoint[] {
  if (!acc1Rows.length) return [];

  const bKey = (d: Date) => (aggregation === "1D" ? dayKey(d) : weekKey(d));
  const bLabel = (k: string) =>
    aggregation === "1D" ? labelDayKey(k) : labelWeekFromDayKey(k);

  const acc1Map = new Map<string, number[]>();
  for (const r of acc1Rows) {
    const k = bKey(r.date);
    if (!acc1Map.has(k)) acc1Map.set(k, []);
    acc1Map.get(k)!.push(r.gainPct);
  }

  const acc2Map = new Map<string, number[]>();
  for (const r of acc2Rows) {
    const k = bKey(r.date);
    if (!acc2Map.has(k)) acc2Map.set(k, []);
    acc2Map.get(k)!.push(r.gainPct);
  }

  // Union of both accounts' keys so acc2 daily trades appear even when acc1 has no matching trade
  const acc2StartKey = acc2Rows.length
    ? bKey(acc2Rows.reduce((min, r) => (r.date < min.date ? r : min)).date)
    : null;
  const allKeys = [
    ...new Set([...acc1Map.keys(), ...acc2Map.keys()]),
  ].sort();

  let equityAcc1 = 100;
  let equityAcc2: number | null = null;
  let equityCombined = 100;

  return allKeys.map((key) => {
    const acc1Gains = acc1Map.get(key) ?? [];
    const acc2Gains = acc2Map.get(key);

    const acc1BucketReturn = acc1Gains.length ? compoundGains(acc1Gains) : 0;
    const acc2BucketReturn =
      acc2Gains?.length ? compoundGains(acc2Gains) : null;

    equityAcc1 *= 1 + acc1BucketReturn / 100;

    let combinedBucketReturn: number;
    const isAfterAcc2Start = acc2StartKey !== null && key >= acc2StartKey;
    if (isAfterAcc2Start) {
      // After acc2 joins: always 50/50. acc1 return = 0 on days it has no trade.
      if (equityAcc2 === null) equityAcc2 = 100;
      if (acc2BucketReturn !== null) equityAcc2 *= 1 + acc2BucketReturn / 100;
      combinedBucketReturn = (acc1BucketReturn + (acc2BucketReturn ?? 0)) / 2;
    } else {
      combinedBucketReturn = acc1BucketReturn;
    }

    equityCombined *= 1 + combinedBucketReturn / 100;

    return {
      key,
      label: bLabel(key),
      year: yearFromWeekDayKey(key),
      cumulativePct: round2((equityCombined / 100 - 1) * 100),
      acc1CumulativePct: round2((equityAcc1 / 100 - 1) * 100),
      acc2CumulativePct:
        equityAcc2 !== null ? round2((equityAcc2 / 100 - 1) * 100) : null,
      periodReturnPct: round2(combinedBucketReturn),
      acc1ReturnPct: round2(acc1BucketReturn),
      acc2ReturnPct:
        acc2BucketReturn !== null ? round2(acc2BucketReturn) : null,
    };
  });
}

export function formatUsdCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) {
    const m = v / 1e6;
    const dec = Math.abs(m % 1) < 0.005 ? 0 : 2;
    return `${sign}$${m.toFixed(dec)}M`;
  }
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

export function formatPctSigned(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "+0.0%";
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
}

export function yAxisDomain(points: ChartPoint[]): [number, number] {
  if (!points.length) return [-10, 15];
  let min = 0;
  let max = 0;
  for (const p of points) {
    min = Math.min(min, p.total);
    max = Math.max(max, p.total);
  }
  const pad = 1;
  min = Math.floor((min - pad) / 5) * 5;
  max = Math.ceil((max + pad) / 5) * 5;
  min = Math.min(min, -10);
  max = Math.max(max, 20);
  if (max - min < 15) max = min + 30;
  return [min, max];
}

export function yAxisDomainLine(points: LinePoint[]): [number, number] {
  if (!points.length) return [-5, 15];
  let min = 0;
  let max = 0;
  for (const p of points) {
    min = Math.min(min, p.cumulativePct);
    max = Math.max(max, p.cumulativePct);
  }
  const pad = 0.5;
  min = Math.floor((min - pad) / 2) * 2;
  max = Math.ceil((max + pad) / 2) * 2;
  if (max - min < 4) max = min + 8;
  return [min, max];
}
