"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { InvestorsCRMView } from "./InvestorsCRMView";

export function InvestorsCRMShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <InvestorsCRMView />
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
