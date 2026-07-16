"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import MonitoringPage from "@/components/pages/MonitoringPage";
import type { AgriFinalStatusResponse } from "@/lib/monitoring/agriFinalStatusTypes";

export function MonitoringShell({
  initialAgriFinalStatus,
}: {
  initialAgriFinalStatus: AgriFinalStatusResponse | null;
}) {
  return (
    // HomeDashboardProvider needed by Sidebar (page/setPage state).
    // Empty arrays are fine here — monitoring doesn't use trade simulation.
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        {/* monitoring content fills remaining space */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <MonitoringPage initialAgriFinalStatus={initialAgriFinalStatus} />
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
