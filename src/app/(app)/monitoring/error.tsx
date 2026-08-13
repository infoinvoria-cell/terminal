"use client";

import { CapitalifeRouteErrorScreen } from "@/components/ui/CapitalifeRouteErrorScreen";

export default function MonitoringError({ error, reset }: { error: Error; reset: () => void }) {
  return <CapitalifeRouteErrorScreen error={error} reset={reset} route="/monitoring" module="monitoring-route" />;
}
