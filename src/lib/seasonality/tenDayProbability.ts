// 10-Day Forward Directional Probability — Dashboard Metric
// NOT part of the TV Pine seasonal curve.
// For each 10-trading-day start slot (1, 11, 21, ...), computes the fraction
// of historical years where the forward 10-day return was positive vs negative.
// signedProbability = (bullFraction - bearFraction) * 100  ∈ [-100, +100]

import type { DailyBar } from "./walkForward/types";
import { filterBarsByYears, selectCompleteSampleYears } from "./yearWindow";

export interface TenDayProbBar {
  startSlot: number;          // 1-based trading-day slot
  endSlot: number;            // startSlot + 9
  approxMonthLabel: string;   // e.g. "Jan", "Mär", etc.
  bullProbability: number;    // 0-100 — % of years where forward10d > 0
  bearProbability: number;    // 0-100 — % of years where forward10d < 0
  signedProbability: number;  // -100..+100 = (bull - bear) * 100
  observationCount: number;
}

export interface TenDayProbResult {
  assetId: string;
  lookbackYears: number;
  startDateFilter: string;
  forwardTradingDays: 10;
  bucketStepTradingDays: 10;
  bars: TenDayProbBar[];
  currentWindowStartSlot: number | null;
  generatedAt: string;
}

const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Month boundary mapping from actual data (Wheat 2007+ reference)
const MONTH_SLOT_MAP: Record<number, number> = {
  1: 1, 2: 21, 3: 40, 4: 62, 5: 83, 6: 104,
  7: 125, 8: 147, 9: 169, 10: 189, 11: 211, 12: 232,
};

function slotToApproxMonth(slot: number): string {
  // Find which month this slot falls in
  const months = Object.entries(MONTH_SLOT_MAP)
    .map(([m, s]) => ({ month: parseInt(m), startSlot: s }))
    .sort((a, b) => a.startSlot - b.startSlot);

  let approxMonth = 1;
  for (const { month, startSlot } of months) {
    if (slot >= startSlot) approxMonth = month;
    else break;
  }
  return MONTHS_DE[approxMonth - 1] ?? "?";
}

export function buildTenDayProbability(
  allBars: DailyBar[],
  assetId: string,
  lookbackYears: number,
): TenDayProbResult {
  // Sort and filter bars
  const sorted = [...allBars].sort((a, b) => a.date.localeCompare(b.date));
  const yearsUsed = selectCompleteSampleYears(sorted, lookbackYears);
  const usedBars = filterBarsByYears(sorted, yearsUsed);
  const startDateFilter = yearsUsed.length > 0 ? `${yearsUsed[0]}-01-01` : "";

  // Assign trading-day-of-year slots (same Pine rule: reset each year)
  interface SlottedBar { year: number; slot: number; close: number; }
  const slotted: SlottedBar[] = [];
  let tdoy = 0;
  let prevYear = -1;

  for (const bar of usedBars) {
    const year = parseInt(bar.date.slice(0, 4));
    if (year !== prevYear) { tdoy = 0; prevYear = year; }
    tdoy++;
    if (tdoy <= 252) {
      slotted.push({ year, slot: tdoy, close: bar.close });
    }
  }

  // Build year→slot→close lookup
  const lookup = new Map<number, Map<number, number>>();
  for (const { year, slot, close } of slotted) {
    if (!lookup.has(year)) lookup.set(year, new Map());
    lookup.get(year)!.set(slot, close);
  }

  const years = Array.from(lookup.keys()).sort();

  // For each 10-slot start window: compute forward10d return for each year
  const result: TenDayProbBar[] = [];
  const STEP = 10;
  const MAX_START = 252 - STEP; // need 10 bars ahead

  for (let startSlot = 1; startSlot <= MAX_START; startSlot += STEP) {
    const endSlot = startSlot + STEP - 1;
    let bull = 0, bear = 0, valid = 0;

    for (const year of years) {
      const yearMap = lookup.get(year);
      if (!yearMap) continue;
      const closeStart = yearMap.get(startSlot);
      const closeEnd = yearMap.get(endSlot + 1); // close after 10 days
      if (closeStart == null || closeEnd == null || closeStart <= 0) continue;
      const ret = closeEnd / closeStart - 1;
      if (ret > 0) bull++;
      else if (ret < 0) bear++;
      valid++;
    }

    if (valid === 0) continue;

    const bullPct = (bull / valid) * 100;
    const bearPct = (bear / valid) * 100;
    const signed = bullPct - bearPct;

    result.push({
      startSlot,
      endSlot: endSlot + 1,
      approxMonthLabel: slotToApproxMonth(startSlot),
      bullProbability: parseFloat(bullPct.toFixed(1)),
      bearProbability: parseFloat(bearPct.toFixed(1)),
      signedProbability: parseFloat(signed.toFixed(1)),
      observationCount: valid,
    });
  }

  // Determine current 10-day window slot (approximate from today's date)
  const todayDate = new Date();
  const todayMonth = todayDate.getMonth() + 1;
  const todayDay = todayDate.getDate();
  const monthStart = MONTH_SLOT_MAP[todayMonth] ?? 1;
  const nextMonthStart = MONTH_SLOT_MAP[todayMonth + 1] ?? monthStart + 21;
  const tradingDaysInMonth = nextMonthStart - monthStart;
  const calDaysInMonth = new Date(todayDate.getFullYear(), todayMonth, 0).getDate();
  const frac = Math.min((todayDay - 1) / calDaysInMonth, 1);
  const todaySlot = Math.round(monthStart + frac * tradingDaysInMonth);
  // Find which 10-day window today falls in
  const currentWindowSlot = result.find(b => todaySlot >= b.startSlot && todaySlot <= b.endSlot)?.startSlot ?? null;

  return {
    assetId,
    lookbackYears,
    startDateFilter,
    forwardTradingDays: 10,
    bucketStepTradingDays: 10,
    bars: result,
    currentWindowStartSlot: currentWindowSlot,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Best-Holding Winrate Probability ────────────────────────────────────────
// For each odd slot (1, 3, 5, ...), tests 10D / 15D / 20D forward holding.
// Picks the holding with the strongest signed probability.
// Used by the lower Winrate chart in the dashboard.

export interface WinrateVariant {
  holdingDays: 10 | 15 | 20;
  signedProbability: number;
  bullProbability: number;
  bearProbability: number;
  observationCount: number;
}

export interface WinrateBar {
  startSlot: number;
  endSlot: number;             // startSlot + bestHoldingDays
  approxMonthLabel: string;
  direction: "LONG" | "SHORT";
  bestHoldingDays: 10 | 15 | 20;
  signedProbability: number;   // -100..+100
  bullProbability: number;
  bearProbability: number;
  observationCount: number;
  variants: [WinrateVariant, WinrateVariant, WinrateVariant]; // 10D, 15D, 20D
}

export interface WinrateProbResult {
  assetId: string;
  lookbackYears: number;
  bars: WinrateBar[];
  currentSlot: number | null;
  generatedAt: string;
}

export function buildBestHoldingProbability(
  allBars: DailyBar[],
  assetId: string,
  lookbackYears: number,
): WinrateProbResult {
  const sorted = [...allBars].sort((a, b) => a.date.localeCompare(b.date));
  const yearsUsed = selectCompleteSampleYears(sorted, lookbackYears);
  const usedBars = filterBarsByYears(sorted, yearsUsed);

  // Build year → slot → close lookup (same Pine slot assignment)
  const lookup = new Map<number, Map<number, number>>();
  let tdoy2 = 0, prevYear2 = -1;
  for (const bar of usedBars) {
    const year = parseInt(bar.date.slice(0, 4));
    if (year !== prevYear2) { tdoy2 = 0; prevYear2 = year; }
    tdoy2++;
    if (tdoy2 <= 252) {
      if (!lookup.has(year)) lookup.set(year, new Map());
      lookup.get(year)!.set(tdoy2, bar.close);
    }
  }
  const years = Array.from(lookup.keys()).sort();

  function computeVariant(startSlot: number, h: 10 | 15 | 20): WinrateVariant {
    let bull = 0, bear = 0, valid = 0;
    for (const year of years) {
      const ym = lookup.get(year);
      if (!ym) continue;
      const cs = ym.get(startSlot);
      const ce = ym.get(startSlot + h);
      if (cs == null || ce == null || cs <= 0) continue;
      const ret = ce / cs - 1;
      if (ret > 0) bull++;
      else if (ret < 0) bear++;
      valid++;
    }
    if (valid === 0) return { holdingDays: h, signedProbability: 0, bullProbability: 50, bearProbability: 50, observationCount: 0 };
    const bPct = (bull / valid) * 100;
    const rPct = (bear / valid) * 100;
    return { holdingDays: h, signedProbability: parseFloat((bPct - rPct).toFixed(1)), bullProbability: parseFloat(bPct.toFixed(1)), bearProbability: parseFloat(rPct.toFixed(1)), observationCount: valid };
  }

  const MAX_START = 252 - 20; // ensure 20D holding fits
  const result: WinrateBar[] = [];

  for (let startSlot = 1; startSlot <= MAX_START; startSlot += 2) {
    const v10 = computeVariant(startSlot, 10);
    const v15 = computeVariant(startSlot, 15);
    const v20 = computeVariant(startSlot, 20);
    if (v10.observationCount === 0 && v15.observationCount === 0 && v20.observationCount === 0) continue;

    // Pick variant with strongest |signedProbability|
    const best = [v10, v15, v20].reduce((b, v) => Math.abs(v.signedProbability) > Math.abs(b.signedProbability) ? v : b);

    result.push({
      startSlot,
      endSlot: startSlot + best.holdingDays,
      approxMonthLabel: slotToApproxMonth(startSlot),
      direction: best.signedProbability >= 0 ? "LONG" : "SHORT",
      bestHoldingDays: best.holdingDays,
      signedProbability: best.signedProbability,
      bullProbability: best.bullProbability,
      bearProbability: best.bearProbability,
      observationCount: best.observationCount,
      variants: [v10, v15, v20],
    });
  }

  const todaySlot2 = todayTradingDaySlot2();
  const currentSlot = result.find(b => todaySlot2 >= b.startSlot && todaySlot2 <= b.endSlot)?.startSlot ?? null;

  return { assetId, lookbackYears, bars: result, currentSlot, generatedAt: new Date().toISOString() };
}

function todayTradingDaySlot2(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthStart = MONTH_SLOT_MAP[month] ?? 1;
  const nextMonthStart = MONTH_SLOT_MAP[month + 1] ?? monthStart + 21;
  const tradingDaysInMonth = nextMonthStart - monthStart;
  const calDaysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  const frac = Math.min((day - 1) / calDaysInMonth, 1);
  return Math.round(monthStart + frac * tradingDaysInMonth);
}

/** Compute approximate today trading-day slot from month boundaries */
export function todayTradingDaySlot(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthStart = MONTH_SLOT_MAP[month] ?? 1;
  const nextMonthStart = MONTH_SLOT_MAP[month + 1] ?? monthStart + 21;
  const tradingDaysInMonth = nextMonthStart - monthStart;
  const calDaysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  const frac = Math.min((day - 1) / calDaysInMonth, 1);
  return Math.round(monthStart + frac * tradingDaysInMonth);
}
