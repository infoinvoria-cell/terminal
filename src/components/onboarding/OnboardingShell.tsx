"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { OnboardingView } from "./OnboardingView";

export function OnboardingShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OnboardingView />
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
