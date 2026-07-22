"use client";

import { Topbar } from "@/components/dashboard/topbar";
import { OnboardingView } from "./OnboardingView";

export function OnboardingShell() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar sectionLabel="Investor CRM" />
      <OnboardingView />
    </main>
  );
}
