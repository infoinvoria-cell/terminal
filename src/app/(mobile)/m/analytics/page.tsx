import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileAnalyticsView } from "@/components/mobile/analytics/MobileAnalyticsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics — Capitalife Mobile" };

export default async function MobileAnalyticsPage() {
  const data = await getDashboardPageData();
  return (
    <MobileAnalyticsView
      capalifeData={data.capalifeData}
      fsportfolio={data.fsportfolio}
    />
  );
}
