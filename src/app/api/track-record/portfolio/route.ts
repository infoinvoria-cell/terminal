/**
 * GET /api/track-record/portfolio
 *
 * Returns the pre-built combined portfolio result from
 * .runtime/track-record/portfolio.json
 *
 * This file is written by run-assembly.ts (the CLI assembler).
 * The route never triggers a recompute, never reads env vars,
 * and never outputs file paths or secrets.
 *
 * Server-only (Node.js runtime). No edge runtime.
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_DAILY_POINTS = 2000;
const MAX_TRADE_EVENT_POINTS = 5000;

// ── Minimal shape guard ───────────────────────────────────────────────────────

interface PortfolioFileSummary {
  totalReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  sharpe: number | null;
  calmar: number | null;
  positiveMonths: number | null;
  totalMonths: number | null;
  profitFactor: number | null;
  startDateUtc: string | null;
  endDateUtc: string | null;
  totalTrades: number;
  assetsUnderManagementEur: number | null;
}

interface PortfolioFile {
  method: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  startIndex: number;
  endIndex: number;
  totalReturn: number;
  summary?: PortfolioFileSummary;
  coverage?: {
    status: string;
    startDateUtc: string;
    endDateUtc: string;
    missingRanges: Array<{ fromUtc: string; toUtc: string; reasonCode: string }>;
    note: string;
  };
  dailyPoints: unknown[];
  reconciliation?: unknown[];
  diagnostics: {
    naiveCombinedReturn: number;
    correctPortfolioReturn: number;
    account1TotalReturn: number;
    account2TotalReturn: number;
    legacyNote?: string;
    daysWithMissingFx: number;
    daysWithNullReturn: number;
    totalTrades: number;
    account1Trades: number;
    account2Trades: number;
    totalCashFlows: number;
    dailySeriesPointCount?: number;
    expectedCalendarDays?: number;
  };
  warnings: string[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

function loadCombinedTrackRecord(): unknown | null {
  try {
    const p = resolve(process.cwd(), ".runtime", "track-record", "combined-track-record.json");
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function loadTradeEventSeries(): { series: unknown[]; finalReturn: number; pointCount: number; firstTradeCloseUtc: string | null; lastTradeCloseUtc: string | null } | null {
  try {
    const p = resolve(process.cwd(), ".runtime", "track-record", "trade-event-series.json");
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf-8")) as {
      series?: unknown[];
      finalReturn?: number;
      pointCount?: number;
      firstTradeCloseUtc?: string | null;
      lastTradeCloseUtc?: string | null;
    };
    return {
      series:             Array.isArray(raw.series) ? raw.series.slice(-MAX_TRADE_EVENT_POINTS) : [],
      finalReturn:        typeof raw.finalReturn === "number" ? raw.finalReturn : 0,
      pointCount:         typeof raw.pointCount === "number" ? raw.pointCount : 0,
      firstTradeCloseUtc: raw.firstTradeCloseUtc ?? null,
      lastTradeCloseUtc:  raw.lastTradeCloseUtc ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const filePath = resolve(process.cwd(), ".runtime", "track-record", "portfolio.json");

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "portfolio_unavailable", reason: "file_not_found" },
      { status: 503 },
    );
  }

  let raw: PortfolioFile;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8")) as PortfolioFile;
  } catch {
    return NextResponse.json(
      { error: "portfolio_unavailable", reason: "invalid_json" },
      { status: 503 },
    );
  }

  // Validate required fields
  if (
    raw.method !== "fx_neutral_weighted_portfolio_return" ||
    !Array.isArray(raw.dailyPoints) ||
    typeof raw.totalReturn !== "number" ||
    !raw.diagnostics
  ) {
    return NextResponse.json(
      { error: "portfolio_unavailable", reason: "invalid_structure" },
      { status: 503 },
    );
  }

  // Cap daily points to prevent oversized responses
  const dailyPoints = raw.dailyPoints.slice(-MAX_DAILY_POINTS);

  // Validate no hardcoded return values slipped in
  const warningsList: string[] = Array.isArray(raw.warnings) ? raw.warnings : [];
  const expectedDays = raw.diagnostics?.expectedCalendarDays ?? 0;
  const actualDays = raw.dailyPoints.length;
  if (expectedDays > 0 && actualDays !== expectedDays) {
    warningsList.push(`daily_series_length_mismatch: expected ${expectedDays}, got ${actualDays}`);
  }

  // Build a canonical summary — support both new and legacy portfolio.json
  const summary: PortfolioFileSummary = raw.summary ?? {
    totalReturn: raw.totalReturn,
    annualizedReturn: null,
    maxDrawdown: null,
    volatility: null,
    sharpe: null,
    calmar: null,
    positiveMonths: null,
    totalMonths: null,
    profitFactor: null,
    startDateUtc: raw.startDate || null,
    endDateUtc: raw.endDate || null,
    totalTrades: raw.diagnostics?.totalTrades ?? 0,
    assetsUnderManagementEur: null,
  };

  const coverage = raw.coverage ?? {
    status: "partial",
    startDateUtc: raw.startDate,
    endDateUtc: raw.endDate,
    missingRanges: [],
    note: "Coverage data not available in this portfolio.json version.",
  };

  const tradeEvents = loadTradeEventSeries();
  const combinedTrackRecord = loadCombinedTrackRecord();

  return NextResponse.json(
    {
      method: raw.method,
      baseCurrency: raw.baseCurrency,
      startDate: raw.startDate,
      endDate: raw.endDate,
      startIndex: raw.startIndex,
      endIndex: raw.endIndex,
      totalReturn: raw.totalReturn,
      totalReturnPct: `${raw.totalReturn >= 0 ? "+" : ""}${(raw.totalReturn * 100).toFixed(2)}%`,
      summary,
      coverage,
      dailyPoints,
      tradeEventSeries: tradeEvents?.series ?? [],
      tradeEventSummary: tradeEvents
        ? {
            pointCount:         tradeEvents.pointCount,
            finalIndex:         100 * (1 + tradeEvents.finalReturn),
            finalReturn:        tradeEvents.finalReturn,
            firstTradeCloseUtc: tradeEvents.firstTradeCloseUtc,
            lastTradeCloseUtc:  tradeEvents.lastTradeCloseUtc,
          }
        : null,
      combinedTrackRecord: combinedTrackRecord ?? null,
      reconciliation: Array.isArray(raw.reconciliation) ? raw.reconciliation : [],
      diagnostics: raw.diagnostics,
      warnings: warningsList,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
