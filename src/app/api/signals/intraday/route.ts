import { NextResponse } from "next/server";
import {
  loadIntradaySignalCards,
  loadIntradayTradeSets,
  type FreshnessStatus,
} from "@/lib/signals/intraday-signal-cards";
import type { SignalCardModel } from "@/lib/signals/signal-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Extended card type with fields attached by loadIntradaySignalCards
type ExtendedCard = SignalCardModel & {
  sourceUpdatedAtUtc?: string | null;
  freshnessStatus?: FreshnessStatus;
  instrumentId?: string;
};

export type IntradaySignalState = {
  strategyId: string;
  strategyName: string;
  instrumentId: string;
  marketVariant: string;
  validatedOn: string;
  timeframe: string;
  state: "ACTIVE" | "NONE";
  direction: "LONG" | "SHORT" | "NONE";
  // Absolute prices — null when state=NONE
  entry: number | null;
  sl: number | null;
  tp: number | null;
  be: number | null;
  atr: number | null;
  lastEvaluatedBar: string | null;
  sourceUpdatedAtUtc: string | null;
  freshnessStatus: FreshnessStatus;
  parameterHash: string | null;
  evaluationSchedule: string;
  nextEvaluationUtc: string;
  generatedAtUtc: string | null;
  engineFileAvailable: boolean;
};

export async function GET() {
  try {
    const cards = loadIntradaySignalCards() as ExtendedCard[];
    const tradeSets = loadIntradayTradeSets();

    const currentStates: IntradaySignalState[] = cards.map((card) => ({
      strategyId: card.strategyId ?? "",
      strategyName: card.strategyName,
      instrumentId: card.instrumentId ?? card.assetSymbol.toLowerCase(),
      marketVariant: card.marketVariant ?? "",
      validatedOn: card.marketVariant ?? "",
      timeframe: card.timeframe ?? "",
      state: card.signalState === "ACTIVE" ? "ACTIVE" : "NONE",
      direction: card.direction === "LONG" ? "LONG" : card.direction === "SHORT" ? "SHORT" : ("NONE" as const),
      entry: card.entryAbsolute ?? null,
      sl: card.slAbsolute ?? null,
      tp: card.tpAbsolute ?? null,
      be: card.beAbsolute ?? null,
      atr: null,
      lastEvaluatedBar: card.lastEvaluatedBar ?? null,
      sourceUpdatedAtUtc: card.sourceUpdatedAtUtc ?? null,
      freshnessStatus: card.freshnessStatus ?? "UNAVAILABLE",
      parameterHash: null,
      evaluationSchedule: card.evaluationSchedule ?? "",
      nextEvaluationUtc: card.nextEvaluationUtc ?? "",
      generatedAtUtc: card.lastEvaluatedBar ?? null,
      engineFileAvailable: card.dataStatus !== "missing",
    }));

    // History: recent trades from OANDA event files (production DE30EUR/EURUSD)
    const history = tradeSets.flatMap((ts) =>
      ts.trades.map((t) => ({
        strategyId: ts.strategyId,
        assetName: ts.assetName,
        marketVariant: ts.marketVariant,
        direction: t.direction ?? "long",
        entryTime: t.entryTime ?? "",
        exitTime: t.exitTime ?? null,
        entryPrice: t.entry ?? null,
        exitPrice: t.exit ?? null,
        sl: t.sl ?? null,
        tp: t.tp ?? null,
        exitReason: t.exitReason ?? null,
        pnl: t.pnl ?? null,
      }))
    ).sort((a, b) => (b.entryTime > a.entryTime ? 1 : -1));

    // Dedup by (strategyId, entryTime)
    const seen = new Set<string>();
    const dedupedHistory = history.filter((t) => {
      const key = `${t.strategyId}|${t.entryTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const worstFreshness = tradeSets.reduce<"ok" | "stale" | "unavailable">((acc, ts) => {
      if (acc === "unavailable") return acc;
      if (ts.freshnessStatus === "UNAVAILABLE") return "unavailable";
      if ((ts.freshnessStatus === "STALE" || ts.freshnessStatus === "CURRENT_MARKET_CLOSED") && acc === "ok") return "stale";
      return acc;
    }, "ok");

    return NextResponse.json({
      // Spec canonical fields
      currentStates,
      history: dedupedHistory,
      generatedAtUtc: new Date().toISOString(),
      sourceStatus: worstFreshness,
      // Backward-compat fields for SignalsDashboard
      cards,
      tradeSets,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load intraday signals" },
      { status: 500 }
    );
  }
}
