"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import StrategyMasterTable from "@/components/components/StrategyMasterTable";
import styles from "./ComponentsPage.module.css";

function KomponentenNav() {
  const pathname = usePathname();
  const isSeasonality = pathname?.startsWith("/komponenten/seasonality");

  return (
    <div className="flex items-center gap-2 border-b border-[#2a2b30] px-4 py-2">
      <Link
        href="/komponenten"
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          !isSeasonality
            ? "bg-[#1c1d20] text-[#e2ca7a]"
            : "text-[#737373] hover:text-white"
        )}
      >
        Strategien
      </Link>
      <Link
        href="/komponenten/seasonality"
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          isSeasonality
            ? "bg-[#1c1d20] text-[#e2ca7a]"
            : "text-[#737373] hover:text-white"
        )}
      >
        <BarChart2 size={13} />
        Seasonality
      </Link>
    </div>
  );
}

export function ComponentsShell() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <KomponentenNav />
      <main className={styles.page}>
        <StrategyMasterTable />
      </main>
    </div>
  );
}
