"use client";

import { GlobalPageProvider } from "@/context/global-page-context";
import { SimpleAccessGate } from "@/components/auth/SimpleAccessGate";
import { SentinelButler } from "@/components/sentinel/sentinel-butler";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

export function ClientProviders({
  children,
  simpleGatePassword,
}: {
  children: React.ReactNode;
  simpleGatePassword: string;
}) {
  return (
    <GlobalPageProvider>
      <SentinelSessionProvider>
        <SimpleAccessGate expectedPassword={simpleGatePassword}>
          {children}
          <SentinelButler />
        </SimpleAccessGate>
      </SentinelSessionProvider>
    </GlobalPageProvider>
  );
}
