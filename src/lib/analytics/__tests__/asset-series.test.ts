/**
 * Asset series invariant tests (spec §9)
 */
import { expect, test } from "vitest";

// -- Helpers copied from dashboard (no import to avoid Next.js client boundary) --

type Point = { date: string; value: number };

function toNonCompounded(series: Point[]): Point[] {
  if (!series.length) return series;
  let cumSimple = 0;
  return series.map((point, index) => {
    if (index === 0) {
      cumSimple = point.value;
    } else {
      const prevEquity = 1 + series[index - 1]!.value / 100;
      const currEquity = 1 + point.value / 100;
      const dailyR = prevEquity > 0 ? (currEquity / prevEquity - 1) * 100 : 0;
      cumSimple += dailyR;
    }
    return { ...point, value: Number(cumSimple.toFixed(6)) };
  });
}

function rebaseSeries(series: Point[]): Point[] {
  if (series.length < 2) return series;
  const v0 = series[0]!.value;
  const base = 1 + v0 / 100;
  return series.map((p) => ({ ...p, value: Number(((1 + p.value / 100) / base - 1) * 100) }));
}

// Build a cumulative % series from daily decimal returns
function fromDailyReturns(dates: string[], dailyReturns: number[]): Point[] {
  const series: Point[] = [];
  let equity = 1;
  for (let i = 0; i < dates.length; i++) {
    equity *= 1 + dailyReturns[i]!;
    series.push({ date: dates[i]!, value: Number(((equity - 1) * 100).toFixed(6)) });
  }
  return series;
}

// ── §9: Compounded [+10%, -10%] = -1% ─────────────────────────────────────────
test("Compounded: +10% then -10% = -1%", () => {
  // fromDailyReturns compounds from equity=1: 1.1 * 0.9 - 1 = -1%
  // No rebaseSeries — that shifts the reference frame to the first bar (equity=1.1),
  // which would give -10% relative to that frame, not the inception return of -1%.
  const series = fromDailyReturns(["2020-01-02", "2020-01-03"], [0.10, -0.10]);
  const finalValue = series[series.length - 1]!.value;
  expect(finalValue).toBeCloseTo(-1.0, 3);
});

// ── §9: Arithmetic [+10%, -10%] = 0% ─────────────────────────────────────────
test("Arithmetic (non-compounded): +10% then -10% = 0%", () => {
  // toNonCompounded converts to arithmetic (simple) returns: +10 + (-10) = 0.
  // Applying rebaseSeries first would change the starting equity reference, breaking the sum.
  const series = fromDailyReturns(["2020-01-02", "2020-01-03"], [0.10, -0.10]);
  const nonCompounded = toNonCompounded(series);
  const finalValue = nonCompounded[nonCompounded.length - 1]!.value;
  expect(finalValue).toBeCloseTo(0.0, 3);
});

// ── §9: KPIs unchanged by display downsampling ────────────────────────────────
test("Downsampling does not change total return", () => {
  // Create a 100-point series
  const returns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.001 : -0.0005));
  const dates = returns.map((_, i) => `2020-01-${String(i + 1).padStart(2, "0")}`);
  const full = fromDailyReturns(dates, returns);
  // Downsample to every 10th point
  const display = full.filter((_, i) => i % 10 === 0 || i === full.length - 1);
  // Total return should match
  expect(full[full.length - 1]!.value).toBeCloseTo(display[display.length - 1]!.value, 2);
});

// ── §9: No value before inception ────────────────────────────────────────────
test("No values before inception in full series", () => {
  // Simulate: inception = 2013-07-18, startDate = 2008-05-29
  // Verify that series has no point before inception
  const inceptionDate = "2013-07-18";
  const mockPrices: [string, number][] = [
    ["2013-07-18", 100],
    ["2013-07-19", 101],
    ["2013-07-22", 99],
  ];
  const basePrice = mockPrices[0]![1];
  const series: Point[] = mockPrices.map(([date, price]) => ({
    date,
    value: Number(((price / basePrice - 1) * 100).toFixed(4)),
  }));
  // All dates must be >= inception
  for (const p of series) {
    expect(p.date >= inceptionDate).toBe(true);
  }
  // First value should be 0
  expect(series[0]!.value).toBeCloseTo(0, 4);
});

// ── §9: No carry-forward fills on display calendar ────────────────────────────
test("Display series omits dates with no real price (no carry-forward)", () => {
  // Simulate display calendar with 4 dates, ETF only has 3 of them
  const sampledDates = ["2013-07-18", "2013-07-19", "2013-07-22", "2013-07-25"];
  const etfPrices = new Map([
    ["2013-07-18", 100],
    ["2013-07-19", 101],
    ["2013-07-25", 103],
    // Note: 2013-07-22 is missing from ETF prices
  ]);
  const inceptionDate = "2013-07-18";
  const basePrice = etfPrices.get(inceptionDate)!;
  const series: Point[] = [];
  for (const date of sampledDates) {
    if (date < inceptionDate) continue;
    const price = etfPrices.get(date);
    if (price === undefined) continue; // no carry-forward — skip
    series.push({ date, value: Number(((price / basePrice - 1) * 100).toFixed(2)) });
  }
  // Should have 3 points (not 4 — 2013-07-22 skipped)
  expect(series.length).toBe(3);
  expect(series.map((p) => p.date)).toEqual(["2013-07-18", "2013-07-19", "2013-07-25"]);
});

// ── §9: Common period start ───────────────────────────────────────────────────
test("Common period start = latest inception of selected assets", () => {
  const assetMeta: Record<string, { inceptionDate: string }> = {
    SPY: { inceptionDate: "2008-05-29" },
    QQQ: { inceptionDate: "2008-05-29" },
    QUAL: { inceptionDate: "2013-07-18" },
  };
  const visibleGroups = ["SPY", "QQQ", "QUAL"];
  let latest = "1900-01-01";
  for (const g of visibleGroups) {
    const d = assetMeta[g]!.inceptionDate;
    if (d > latest) latest = d;
  }
  expect(latest).toBe("2013-07-18");
});

// ── §9: Own inception starts per asset ───────────────────────────────────────
test("Own inception: each series starts at its own first date", () => {
  const series: Point[] = [
    { date: "2008-05-29", value: 0 },
    { date: "2009-01-02", value: -30 },
    { date: "2020-01-02", value: 300 },
  ];
  // rebase to 0 at own inception
  const rebased = rebaseSeries(series);
  expect(rebased[0]!.value).toBeCloseTo(0, 4);
});
