import { MonitoringShell } from "@/components/monitoring-shell/MonitoringShell";
import { getCachedAgriFinalStatus } from "@/lib/server/page-cache";

export const metadata = { title: "White Swan Monitoring — Capitalife Terminal" };
export const revalidate = 120;

export default async function MonitoringRoute() {
  let initialAgriFinalStatus = null;
  try {
    initialAgriFinalStatus = await getCachedAgriFinalStatus();
  } catch {
    // server data unavailable — client will fetch
  }

  return <MonitoringShell initialAgriFinalStatus={initialAgriFinalStatus} />;
}
