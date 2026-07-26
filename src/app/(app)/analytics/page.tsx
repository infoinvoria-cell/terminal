import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";
import { getFSPortfolioSnapshot } from "@/lib/fsportfolio/backtest";

export default async function AnalyticsPage() {
  // The Core-Invest tab needs the fsportfolio snapshot. Load it only here (not in
  // the shared cloud data loader used by Sentinel/Monitoring). It reads committed
  // OHLC/backtest JSON — no Brain path — and degrades to undefined on any failure,
  // so it stays cloud-safe. When the required market series aren't bundled,
  // backtest.ready is false and the tab renders empty rather than crashing.
  const [data, fsportfolio] = await Promise.all([
    getDashboardPageData(),
    getFSPortfolioSnapshot().catch(() => undefined),
  ]);
  return <FundManagerHome {...data} fsportfolio={fsportfolio} initialPage="analytics" />;
}
