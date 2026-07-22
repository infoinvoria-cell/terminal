"use client";

import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { SignalsDashboard } from "./SignalsDashboard";

export function SignalsShell() {
  return (
    <>
      <Topbar sectionLabel="SIGNALE" />
      <HeaderDivider />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <SignalsDashboard />
      </div>
    </>
  );
}
