"use client";

import StrategyMasterTable from "@/components/components/StrategyMasterTable";
import styles from "./ComponentsPage.module.css";

export function ComponentsShell() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <main className={styles.page} style={{ overflowY: "auto" }}>
        <StrategyMasterTable />
      </main>
    </div>
  );
}
