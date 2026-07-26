import { NextResponse } from "next/server";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";

// Temporary diagnostic: report why the Core-Invest multi-asset snapshot is/ isn't
// ready (data source resolution, missing symbols, backtest readiness).
export async function GET() {
  try {
    const snap = await getFSPortfolioSnapshot();
    return NextResponse.json({
      ok: true,
      backtestReady: snap.backtest?.ready ?? null,
      backtestReason: snap.backtest?.reason ?? null,
      missingSymbols: snap.missingSymbols ?? null,
      dataQuality: (snap.dataQuality ?? []).map((q) => ({
        symbol: q.symbol,
        found: q.found,
        source: q.sourcePath ?? null,
        rows: q.rowCount ?? null,
        warnings: q.warnings,
      })),
      backtestPoints: snap.backtest?.equityCurve?.length ?? 0,
      assetCurveKeys: Object.keys(snap.backtest?.assetCurves ?? {}),
      assetDailyReturnKeys: Object.keys(snap.backtest?.backtestAssetDailyReturns ?? {}),
      metrics: snap.backtest?.metrics ?? null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), stack: (err as Error)?.stack?.slice(0, 800) });
  }
}
