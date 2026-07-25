import { SeasonalResearchDashboard } from "@/components/seasonality/SeasonalResearchDashboard";

export const metadata = { title: "Seasonality | Capitalife Terminal" };
export const dynamic = "force-dynamic";

export default function SeasonalityPage() {
  return <SeasonalResearchDashboard />;
}
