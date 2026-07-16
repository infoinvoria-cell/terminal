import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";

export default async function SentinelPage() {
  return <FundManagerHome {...(await getDashboardPageData())} initialPage="chat" />;
}
