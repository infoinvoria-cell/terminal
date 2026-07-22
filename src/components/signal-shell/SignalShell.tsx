"use client";

import { HeaderDivider } from "@/components/dashboard/header-divider";
import { Topbar } from "@/components/dashboard/topbar";
import SignalPage from "@/components/pages/SignalPage";
import type { SignalPageData } from "@/lib/signal/signalPageData";

export function SignalShell({ data }: { data: SignalPageData }) {
  return (
    <>
      <Topbar sectionLabel="SIGNAL" />
      <HeaderDivider />
      <SignalPage data={data} />
    </>
  );
}
