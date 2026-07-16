"use client";

import { GlobalPageProvider } from "@/context/global-page-context";
import { SentinelButler } from "@/components/sentinel/sentinel-butler";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <GlobalPageProvider>
      <SentinelSessionProvider>
        {children}
        <SentinelButler />
      </SentinelSessionProvider>
    </GlobalPageProvider>
  );
}
