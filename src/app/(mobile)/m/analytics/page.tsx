import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { buildCoreInvestPineBacktest } from "@/lib/analytics/core-invest-pine";
import { MobileAnalyticsView } from "@/components/mobile/analytics/MobileAnalyticsView";

export const metadata = { title: "Analytics — Capitalife Mobile" };

// Render per-request instead of at build time. The Live/Forward series and OHLC
// come from Supabase, so a static prerender would freeze the data at build time.
export const dynamic = "force-dynamic";

export default async function MobileAnalyticsPage() {
  // The shared cloud loader intentionally returns fsportfolio: undefined and no
  // Pine backtest (kept out of the loader used by Sentinel/Monitoring). The desktop
  // analytics page loads both separately — mobile must do the same, otherwise Core
  // Invest / Combined have no data source and render empty on phones.
  const [data, fsportfolio] = await Promise.all([
    getDashboardPageData(),
    getFSPortfolioSnapshot().catch(() => undefined),
  ]);

  const capalifeData = {
    ...data.capalifeData,
    coreInvestPineBacktest: buildCoreInvestPineBacktest(),
  };

  return (
    <MobileAnalyticsView
      capalifeData={capalifeData}
      fsportfolio={fsportfolio}
    />
  );
}
