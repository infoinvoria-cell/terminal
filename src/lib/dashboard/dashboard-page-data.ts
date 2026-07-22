import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";
import { computeDashboardKpis } from "@/lib/trades-analytics";
import { loadDashboardSnapshotAsync } from "@/lib/brain/dashboard-snapshot-loader";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";

export async function getDashboardPageData() {
  const [{ rows, serialized, reportTrades, balanceRows }, snap] = await Promise.all([
    getTradesData(),
    loadDashboardSnapshotAsync(),
  ]);
  const fsportfolio = await getFSPortfolioSnapshot();
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
  };
}
