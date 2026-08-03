import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getCachedDashboardPageData } from "@/lib/server/page-cache";

export const revalidate = 300;

export default async function HomePage() {
  return <FundManagerHome {...(await getCachedDashboardPageData())} />;
}
