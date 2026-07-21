import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileHomeView } from "@/components/mobile/home/MobileHomeView";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const data = await getDashboardPageData();

  return (
    <MobileHomeView
      riskAdjustedAum={data.universal.riskAdjustedAum ?? "EUR 0"}
      kpis={data.portfolioKpisBaseline}
      trades={data.serialized}
      capalifeData={data.capalifeData}
    />
  );
}
