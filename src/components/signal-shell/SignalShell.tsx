"use client";

import SignalPage from "@/components/pages/SignalPage";
import type { SignalPageData } from "@/lib/signal/signalPageData";

export function SignalShell({ data }: { data: SignalPageData }) {
  return <SignalPage data={data} />;
}
