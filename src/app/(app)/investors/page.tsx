import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getCachedDashboardPageData } from "@/lib/server/page-cache";

export const revalidate = 300;
export const metadata = { title: "Investors — Capitalife Terminal" };

export default async function InvestorsPage() {
  return <FundManagerHome {...(await getCachedDashboardPageData())} initialPage="investor-analytics" />;
}
