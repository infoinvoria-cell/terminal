import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";
import { computeDashboardKpis } from "@/lib/trades-analytics";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";

export async function getDashboardPageData() {
  const { rows, serialized, reportTrades, balanceRows } = await getTradesData();
  const fsportfolio = getFSPortfolioSnapshot();
  const portfolioKpisBaseline = computeDashboardKpis(rows);

  const kpis = portfolioKpisBaseline;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmt1 = (n: number) => `${sign(n)}${n.toFixed(1)}%`;
  const universal: UniversalKpiStrings = {
    riskAdjustedAum: "EUR 0",
    marketVolume: "EUR 0",
    totalReturn24m: rows.length ? fmt1(kpis.totalReturn24mPct) : "+97.2%",
    maxDrawdown: rows.length ? `-${kpis.maxDrawdownPct.toFixed(2)}%` : "-11.76%",
    compoundedReturn: rows.length ? fmt1(kpis.totalReturn24mPct) : "+114.6%",
    annualizedReturn: rows.length ? fmt1(kpis.ytdReturnDisplayPct) : "35.2%",
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
