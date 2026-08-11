"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { InvestorDbView } from "./InvestorDbView";

export function InvestorDbShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="relative flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar sectionLabel="INVESTOR DB" visible={true} />
          <HeaderDivider visible={true} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <InvestorDbView />
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
