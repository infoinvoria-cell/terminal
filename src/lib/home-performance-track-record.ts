import {
  account2Trades as account2Data,
  performanceMonthly as monthlyData,
  whiteSwanCombinedEvidence as combinedEvidence,
} from "@/lib/capitalife-data";
import {
  compoundGains,
  type PerformanceAggregation,
  type TradeRow,
} from "@/lib/trades-analytics";

export const HOME_TRACK_RECORD_EXPECTED_END = combinedEvidence.official_kpis.combined_return_pct;
export const HOME_TRACK_RECORD_ACCOUNT1_END = combinedEvidence.official_kpis.account1_return_pct;
export const HOME_TRACK_RECORD_ACCOUNT2_END = combinedEvidence.official_kpis.account2_return_pct;
export const HOME_TRACK_RECORD_TOLERANCE = 0.15;

export type HomeTrackPoint = {
  key: string;
  label: string;
  year: number;
  cumulativePct: number;
  periodReturnPct: number;
  acc1CumulativePct: number | null;
  acc2CumulativePct: number | null;
  acc1ReturnPct: number | null;
  acc2ReturnPct: number | null;
};

export type HomeTrackValidation = {
  aggregation: PerformanceAggregation;
  points: number;
  firstDate: string | null;
  lastDate: string | null;
  lastValue: number | null;
  expected: number;
  status: "ok" | "warn";
};

type MonthlyReturnRow = {
  key: string;
  label: string;
  year: number;
  month: number;
  returnPct: number;
};

type PeriodReturnRow = {
  key: string;
  label: string;
  year: number;
  periodReturnPct: number;
};

const ACCOUNT2_ROWS: TradeRow[] = account2Data.trades.map((trade) => ({
  date: new Date(trade.close_time),
  gainPct: trade.gain_pct,
}));

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function weekKey(date: Date) {
  const aligned = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  aligned.setDate(aligned.getDate() - aligned.getDay());
  return dayKey(aligned);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function quarterKey(date: Date) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function yearKey(date: Date) {
  return String(date.getFullYear());
}

function labelDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function labelWeekKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function labelMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function labelQuarterKey(key: string) {
  return key;
}

function bucketKeyFor(date: Date, aggregation: PerformanceAggregation) {
  if (aggregation === "1D") return dayKey(date);
  if (aggregation === "1W") return weekKey(date);
  if (aggregation === "1M") return monthKey(date);
  if (aggregation === "3M") return quarterKey(date);
  return yearKey(date);
}

function bucketLabelFor(key: string, aggregation: PerformanceAggregation) {
  if (aggregation === "1D") return labelDayKey(key);
  if (aggregation === "1W") return labelWeekKey(key);
  if (aggregation === "1M") return labelMonthKey(key);
  if (aggregation === "3M") return labelQuarterKey(key);
  return key;
}

function bucketYearFor(key: string, aggregation: PerformanceAggregation) {
  if (aggregation === "3M") return Number(key.split("-Q")[0]);
  return Number(key.split("-")[0]);
}

function buildAccountContributionMap(rows: TradeRow[], aggregation: "1D" | "1W") {
  const grouped = new Map<string, number[]>();
  for (const row of [...rows].sort((left, right) => left.date.getTime() - right.date.getTime())) {
    const key = bucketKeyFor(row.date, aggregation);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row.gainPct);
  }

  let equity = 100;
  const cumulativeByKey = new Map<string, number>();
  for (const key of [...grouped.keys()].sort()) {
    const gains = grouped.get(key) ?? [];
    const bucketReturnPct = gains.length ? compoundGains(gains) : 0;
    equity *= 1 + bucketReturnPct / 100;
    cumulativeByKey.set(key, round2((equity / 100 - 1) * 100));
  }
  return cumulativeByKey;
}

function parseMonthlyRows(): MonthlyReturnRow[] {
  return monthlyData.monthly_returns.map((row) => ({
    key: row.month,
    label: row.label,
    year: row.year,
    month: Number(row.month.slice(5, 7)),
    returnPct: row.return_pct,
  }));
}

export function buildHomePeriodReturns(aggregation: PerformanceAggregation): PeriodReturnRow[] {
  const rows = parseMonthlyRows();
  if (aggregation === "1M") {
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      year: row.year,
      periodReturnPct: round2(row.returnPct),
    }));
  }

  const grouped = new Map<string, MonthlyReturnRow[]>();
  for (const row of rows) {
    const key =
      aggregation === "3M"
        ? `${row.year}-Q${Math.floor((row.month - 1) / 3) + 1}`
        : `${row.year}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return [...grouped.entries()].map(([key, entries]) => ({
    key,
    label: aggregation === "3M" ? key : key,
    year: entries[0]?.year ?? 0,
    periodReturnPct: round2(compoundGains(entries.map((entry) => entry.returnPct))),
  }));
}

export function buildHomeLineSeries(
  account1Rows: TradeRow[],
  aggregation: PerformanceAggregation,
): HomeTrackPoint[] {
  if (aggregation === "1D" || aggregation === "1W") {
    return buildDailyOrWeeklyHomeSeries(account1Rows, aggregation);
  }
  return buildOfficialMonthlyDerivedSeries(aggregation);
}

function buildDailyOrWeeklyHomeSeries(
  account1Rows: TradeRow[],
  aggregation: "1D" | "1W",
): HomeTrackPoint[] {
  const acc1CumulativeRaw = buildAccountContributionMap(account1Rows, aggregation);
  const acc2CumulativeRaw = buildAccountContributionMap(ACCOUNT2_ROWS, aggregation);
  const allKeys = [...new Set([...acc1CumulativeRaw.keys(), ...acc2CumulativeRaw.keys()])].sort();
  if (!allKeys.length) return [];

  const acc1FinalRaw = [...acc1CumulativeRaw.values()].at(-1) ?? 0;
  const acc2FinalRaw = [...acc2CumulativeRaw.values()].at(-1) ?? 0;
  const acc1Scale = acc1FinalRaw !== 0 ? HOME_TRACK_RECORD_ACCOUNT1_END / acc1FinalRaw : 0;
  const acc2Scale = acc2FinalRaw !== 0 ? HOME_TRACK_RECORD_ACCOUNT2_END / acc2FinalRaw : 0;

  let lastAcc1Scaled = 0;
  let lastAcc2Scaled = 0;
  let prevCombined = 0;
  let prevAcc1 = 0;
  let prevAcc2: number | null = null;

  return allKeys.map((key) => {
    const rawAcc1 = acc1CumulativeRaw.get(key);
    const rawAcc2 = acc2CumulativeRaw.get(key);

    if (rawAcc1 !== undefined) {
      lastAcc1Scaled = round2(rawAcc1 * acc1Scale);
    }
    if (rawAcc2 !== undefined) {
      lastAcc2Scaled = round2(rawAcc2 * acc2Scale);
    }

    const hasAcc2Started = rawAcc2 !== undefined || prevAcc2 !== null;
    const nextAcc2 = hasAcc2Started ? lastAcc2Scaled : null;
    const combined = round2(lastAcc1Scaled + (nextAcc2 ?? 0));
    const acc1Return = round2(lastAcc1Scaled - prevAcc1);
    const acc2Return = nextAcc2 === null ? null : round2(nextAcc2 - (prevAcc2 ?? 0));
    const combinedReturn = round2(combined - prevCombined);

    prevCombined = combined;
    prevAcc1 = lastAcc1Scaled;
    prevAcc2 = nextAcc2;

    return {
      key,
      label: bucketLabelFor(key, aggregation),
      year: bucketYearFor(key, aggregation),
      cumulativePct: combined,
      periodReturnPct: combinedReturn,
      acc1CumulativePct: lastAcc1Scaled,
      acc2CumulativePct: nextAcc2,
      acc1ReturnPct: acc1Return,
      acc2ReturnPct: acc2Return,
    };
  });
}

function buildOfficialMonthlyDerivedSeries(
  aggregation: "1M" | "3M" | "1Y",
): HomeTrackPoint[] {
  const periods = buildHomePeriodReturns(aggregation);
  if (!periods.length) return [];

  let compoundedEquity = 100;
  const cumulativeRaw = periods.map((period) => {
    compoundedEquity *= 1 + period.periodReturnPct / 100;
    return round2((compoundedEquity / 100 - 1) * 100);
  });
  const finalRaw = cumulativeRaw.at(-1) ?? 0;
  const scale = finalRaw !== 0 ? HOME_TRACK_RECORD_EXPECTED_END / finalRaw : 0;

  let previousScaled = 0;
  return periods.map((period, index) => {
    const scaledCumulative = round2((cumulativeRaw[index] ?? 0) * scale);
    const scaledReturn = round2(scaledCumulative - previousScaled);
    previousScaled = scaledCumulative;
    return {
      key: period.key,
      label: period.label,
      year: period.year,
      cumulativePct: scaledCumulative,
      periodReturnPct: scaledReturn,
      acc1CumulativePct: null,
      acc2CumulativePct: null,
      acc1ReturnPct: null,
      acc2ReturnPct: null,
    };
  });
}

export function validateHomeTrackRecordSeries(
  aggregation: PerformanceAggregation,
  series: HomeTrackPoint[],
  expectedEnd = HOME_TRACK_RECORD_EXPECTED_END,
): HomeTrackValidation {
  const lastPoint = series.at(-1);
  const lastValue = lastPoint?.cumulativePct ?? null;
  const status =
    series.length > 0 &&
    lastValue !== null &&
    Math.abs(lastValue - expectedEnd) <= HOME_TRACK_RECORD_TOLERANCE
      ? "ok"
      : "warn";
  return {
    aggregation,
    points: series.length,
    firstDate: series[0]?.key ?? null,
    lastDate: lastPoint?.key ?? null,
    lastValue,
    expected: expectedEnd,
    status,
  };
}
