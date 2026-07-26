import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";
import { buildCoreInvestPineBacktest } from "@/lib/analytics/core-invest-pine";

// Render per-request instead of at build time. The Live/Forward series and OHLC
// come from Supabase (invest_ohlc / monitoring_ohlc), so a static prerender would
// freeze the data at build time and serve a stale page from the edge cache. Forcing
// dynamic keeps analytics data fresh (guarded by the snapshot TTL cache) and ensures
// each deploy invalidates the previously cached page.
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  // The Core-Invest tab needs the fsportfolio snapshot. Load it only here (not in
  // the shared cloud data loader used by Sentinel/Monitoring). It reads committed
  // OHLC/backtest JSON — no Brain path — and degrades to undefined on any failure,
  // so it stays cloud-safe. When the required market series aren't bundled,
  // backtest.ready is false and Core Invest falls back to the Pine backtest below.
  const [data, fsportfolio] = await Promise.all([
    getDashboardPageData(),
    getFSPortfolioSnapshot().catch(() => undefined),
  ]);

  // Build the Pine-series Core-Invest backtest server-side and merge it into
  // capalifeData. The 1.6MB source is imported inside buildCoreInvestPineBacktest
  // (server-only route bundle); only the compacted dataset reaches the client.
  const capalifeData = {
    ...data.capalifeData,
    coreInvestPineBacktest: buildCoreInvestPineBacktest(),
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
