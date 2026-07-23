import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";
import { MobileSentinelView } from "@/components/mobile/sentinel/MobileSentinelView";

export default function MobileSentinelPage() {
  return (
    <SentinelSessionProvider pageContext={{ page: "chat", visibleTitle: "Sentinel" }}>
      <MobileSentinelView />
    </SentinelSessionProvider>
  );
}
