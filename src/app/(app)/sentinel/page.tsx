import { FundManagerHome } from "@/components/dashboard/fund-manager-home";
import { getCachedDashboardPageData } from "@/lib/server/page-cache";

export const revalidate = 300;
export const metadata = { title: "Sentinel — Capitalife Terminal" };

export default async function SentinelPage() {
  return <FundManagerHome {...(await getCachedDashboardPageData())} initialPage="chat" />;
}
