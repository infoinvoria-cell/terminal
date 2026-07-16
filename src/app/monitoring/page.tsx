import { getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";
import { MonitoringShell } from "@/components/monitoring-shell/MonitoringShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "White Swan Monitoring — Capitalife Terminal" };

export default async function MonitoringRoute() {
  let initialAgriFinalStatus = null;
  try {
    initialAgriFinalStatus = await getAgriFinalStatus();
  } catch {
    // server data unavailable — client will fetch
  }

  return <MonitoringShell initialAgriFinalStatus={initialAgriFinalStatus} />;
}
