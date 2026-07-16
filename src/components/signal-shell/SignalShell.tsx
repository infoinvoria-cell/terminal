"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { Topbar } from "@/components/dashboard/topbar";
import SignalPage from "@/components/pages/SignalPage";
import type { SignalPageData } from "@/lib/signal/signalPageData";

export function SignalShell({ data }: { data: SignalPageData }) {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar sectionLabel="SIGNAL" />
          <HeaderDivider />
          <SignalPage data={data} />
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
