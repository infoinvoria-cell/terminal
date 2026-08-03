"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { InvestorsCRMView } from "./InvestorsCRMView";

export function InvestorsCRMShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="relative flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col overflow-hidden pl-[88px]">
          <InvestorsCRMView />
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
