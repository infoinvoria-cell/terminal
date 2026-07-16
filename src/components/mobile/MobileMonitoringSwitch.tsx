"use client";
import { useIsMobile } from "./useIsMobile";
import { MobileMonitoringView } from "./MobileMonitoringView";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = { children: React.ReactNode };

export function MobileMonitoringSwitch({ children }: Props) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div style={{ background: "#050505", minHeight: "100dvh" }}>
        <MobileMonitoringView />
        <MobileBottomNav />
      </div>
    );
  }
  return <>{children}</>;
}
