"use client";

import { CapitalifeRouteErrorScreen } from "@/components/ui/CapitalifeRouteErrorScreen";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CapitalifeRouteErrorScreen error={error} reset={reset} route="(app)" module="app-segment" />;
}
