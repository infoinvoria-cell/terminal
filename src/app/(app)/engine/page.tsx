import { PartnerGuard } from "@/components/auth/PartnerGuard";
import TradingEnginePage from "@/components/pages/TradingEnginePage";

export const metadata = { title: "Trading Engine - Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function EngineRoute() {
  return (
    <PartnerGuard>
      <TradingEnginePage />
    </PartnerGuard>
  );
}
