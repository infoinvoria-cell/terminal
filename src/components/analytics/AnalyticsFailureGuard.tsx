"use client";

import { useSearchParams } from "next/navigation";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";

export function AnalyticsFailureGuard({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const failures = (searchParams.get("cf_fail") ?? "")
    .split(",")
    .map((item) => item.trim());

  if (failures.includes("analytics-dataset")) {
    return (
      <CapitalifeStatusPanel
        tone="unavailable"
        title="Analytics-Dataset ist nicht verfügbar"
        detail="Failure Injection aktiv. Die Shell bleibt nutzbar, aber Analytics rendert lokal einen UNAVAILABLE-Zustand."
      />
    );
  }

  return <>{children}</>;
}
