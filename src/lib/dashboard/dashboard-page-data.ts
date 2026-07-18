import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { getCapalifeData } from "@/lib/capitalife-data";
import { getTradesData } from "@/lib/load-trades";
import { computeDashboardKpis } from "@/lib/trades-analytics";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";

export async function getDashboardPageData() {
  const { rows, serialized, reportTrades, balanceRows } = await getTradesData();
  const fsportfolio = getFSPortfolioSnapshot();
  const portfolioKpisBaseline = computeDashboardKpis(rows);

  const universal: UniversalKpiStrings = {
    riskAdjustedAum: "EUR 0",
    marketVolume: "EUR 0",
    totalReturn24m: "+97.2%",
    maxDrawdown: "-11.76%",
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
