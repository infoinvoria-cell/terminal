import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getCachedDashboardPageData, getCachedSpyDailyReturns } from "@/lib/server/page-cache";

export const revalidate = 300;

export default async function HomePage() {
  const [data, spyDailyReturns] = await Promise.all([
    getCachedDashboardPageData(),
    getCachedSpyDailyReturns(),
  ]);
  return <FundManagerHome {...data} spyDailyReturns={spyDailyReturns} />;
}
