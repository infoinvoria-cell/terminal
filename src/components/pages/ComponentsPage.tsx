"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import StrategyMasterTable from "@/components/components/StrategyMasterTable";
import styles from "./ComponentsPage.module.css";

export function ComponentsShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className={styles.page}>
            <StrategyMasterTable />
          </main>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
