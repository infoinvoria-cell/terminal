import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";

export default async function AnalyticsPage() {
  return <FundManagerHome {...(await getDashboardPageData())} initialPage="analytics" />;
}

