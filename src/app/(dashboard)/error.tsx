"use client";

import { CapitalifeRouteErrorScreen } from "@/components/ui/CapitalifeRouteErrorScreen";

export default function DashboardSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CapitalifeRouteErrorScreen error={error} reset={reset} route="(dashboard)" module="dashboard-segment" />;
}
