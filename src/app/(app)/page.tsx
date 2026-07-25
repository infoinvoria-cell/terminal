import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data-cloud";

export default async function HomePage() {
  return <FundManagerHome {...(await getDashboardPageData())} />;
}

