import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { buildCoreInvestPineBacktest } from "@/lib/analytics/core-invest-pine";
import { buildCoreInvestReferenceDataset, buildCoreInvestShadowLiveDataset } from "@/lib/analytics/core-invest-reference";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";
import { AnalyticsFailureGuard } from "@/components/analytics/AnalyticsFailureGuard";

export const revalidate = 300;

export default async function AnalyticsPage() {
  try {
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
      <AnalyticsFailureGuard>
        <FundManagerHome
          {...data}
          capalifeData={capalifeData}
          fsportfolio={fsportfolio}
          initialPage="analytics"
        />
      </AnalyticsFailureGuard>
    );
  } catch (error) {
    logServerFailure({
      route: "/analytics",
      module: "analytics-page",
      error,
      errorCode: "ANALYTICS_DATASET_FAILURE",
    });

    return (
      <CapitalifeStatusPanel
        tone="unavailable"
        title="Analytics-Dataset ist nicht verfügbar"
        detail="Die Seite bleibt nutzbar, aber der Analytics-Bereich konnte seine Daten nicht laden."
      />
    );
  }
}
