import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { buildCoreInvestPineBacktest } from "@/lib/analytics/core-invest-pine";
import { buildCoreInvestReferenceDataset, buildCoreInvestShadowLiveDataset } from "@/lib/analytics/core-invest-reference";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";

export const revalidate = 300;

export default async function AnalyticsPage() {
  const [data, fsportfolio] = await Promise.all([
    getDashboardPageData(),
    getFSPortfolioSnapshot().catch(() => undefined),
  ]);

  const capalifeData = {
    ...data.capalifeData,
    coreInvestPineBacktest: buildCoreInvestPineBacktest(),
    coreInvestReference: buildCoreInvestReferenceDataset(),
    coreInvestShadowLive: buildCoreInvestShadowLiveDataset(),
  };

  return (
    <FundManagerHome
      {...data}
      capalifeData={capalifeData}
      fsportfolio={fsportfolio}
      initialPage="analytics"
    />
  );
}
