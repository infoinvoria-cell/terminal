import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";
import { computeDashboardKpis, type SerializedTrade } from "@/lib/trades-analytics";
import type { ParsedReportTrade, ParsedBalanceRow } from "@/lib/mt-report-parser";
import { loadDashboardSnapshotAsync } from "@/lib/brain/dashboard-snapshot-loader";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

const EMPTY_TRADES = {
  rows: [] as Parameters<typeof computeDashboardKpis>[0],
  serialized: [] as SerializedTrade[],
  reportTrades: [] as ParsedReportTrade[],
  balanceRows: [] as ParsedBalanceRow[],
};

export async function getDashboardPageData() {
  const [tradesResult, snap, trackRecordOverview] = await Promise.all([
    getTradesData().catch(() => EMPTY_TRADES),
    loadDashboardSnapshotAsync().catch(() => null),
    buildTrackRecordOverview().catch(() => null),
  ]);
  const { rows, serialized, reportTrades, balanceRows } = tradesResult;
  const fsportfolio = await getFSPortfolioSnapshot().catch(() => undefined);
  const portfolioKpisBaseline = computeDashboardKpis(rows);

  const kpis = portfolioKpisBaseline;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmt1 = (n: number) => `${sign(n)}${n.toFixed(1)}%`;
  const sk = snap?._track_kpis;

  // Official KPI anchors from white-swan-combined-evidence.json
  // These are statement-based values from the Performance Report PDF.
  // Computed values from raw CSV trade data are used for maxDrawdown only
  // (since it requires the full equity curve, not just monthly returns).
  const universal: UniversalKpiStrings = {
    riskAdjustedAum: "EUR 0",
    marketVolume: "EUR 0",
    totalReturn24m: "+97.2%",
    maxDrawdown: rows.length ? `-${kpis.maxDrawdownPct.toFixed(2)}%` : (sk?.maxDrawdown ?? "-11.76%"),
    compoundedReturn: "+114.6%",
    annualizedReturn: "35.2%",
  };

  const capalifeData = getCapalifeData();

  return {
    serialized,
    reportTrades,
    balanceRows,
    portfolioKpisBaseline,
    universal,
    fsportfolio,
    capalifeData,
    trackRecordOverview,
  };
}
