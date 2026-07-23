import { MobileMonitoringView } from "@/components/mobile/monitoring/MobileMonitoringView";
import { getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";
import type { AgriFinalStatusResponse } from "@/lib/monitoring/agriFinalStatusTypes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monitoring — Capitalife Terminal" };

export default async function MobileMonitoringPage() {
  let initialAgriFinalStatus: AgriFinalStatusResponse | null = null;
  try {
    initialAgriFinalStatus = getAgriFinalStatus();
  } catch {
    // server data unavailable — client will fetch
  }

  return <MobileMonitoringView initialAgriFinalStatus={initialAgriFinalStatus} />;
}
