import { getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";
import { MonitoringShell } from "@/components/monitoring-shell/MonitoringShell";

export const metadata = { title: "White Swan Monitoring â€” Capitalife Terminal" };

export default async function MonitoringRoute() {
  let initialAgriFinalStatus = null;
  try {
    initialAgriFinalStatus = await getAgriFinalStatus();
  } catch {
    // server data unavailable â€” client will fetch
  }

  return <MonitoringShell initialAgriFinalStatus={initialAgriFinalStatus} />;
}

