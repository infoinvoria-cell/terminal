"use client";
import { useIsMobile } from "./useIsMobile";
import { MobileMonitoringView } from "./MobileMonitoringView";
import { MobileLayoutClient } from "./MobileLayoutClient";

type Props = { children: React.ReactNode };

export function MobileMonitoringSwitch({ children }: Props) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileLayoutClient>
        <MobileMonitoringView />
      </MobileLayoutClient>
    );
  }
  return <>{children}</>;
}
