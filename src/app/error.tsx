"use client";

import { CapitalifeRouteErrorScreen } from "@/components/ui/CapitalifeRouteErrorScreen";

export default function RootSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CapitalifeRouteErrorScreen error={error} reset={reset} route="/" module="root-segment" />;
}
