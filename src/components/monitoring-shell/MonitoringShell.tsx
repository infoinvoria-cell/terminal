"use client";

import MonitoringPage from "@/components/pages/MonitoringPage";
import type { AgriFinalStatusResponse } from "@/lib/monitoring/agriFinalStatusTypes";

export function MonitoringShell({
  initialAgriFinalStatus,
}: {
  initialAgriFinalStatus: AgriFinalStatusResponse | null;
}) {
  return <MonitoringPage initialAgriFinalStatus={initialAgriFinalStatus} />;
}
