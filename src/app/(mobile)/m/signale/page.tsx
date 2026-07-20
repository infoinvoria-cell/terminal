import { MobileScreen } from "@/components/mobile/MobileScreen";
import { MobileSignalsView } from "@/components/mobile/signals/MobileSignalsView";

export default function MobileSignalePage() {
  return (
    <MobileScreen title="Signale" subtitle="Live-Signale · wischbar">
      <MobileSignalsView />
    </MobileScreen>
  );
}
