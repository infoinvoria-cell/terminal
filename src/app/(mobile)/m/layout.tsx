import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileNavReporter } from "@/components/mobile/MobileNavReporter";

export const metadata = { title: "Capitalife Mobile" };

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: "#0c0d10", overflowX: "hidden" }}>
      <MobileNavReporter />
      <main style={{ minHeight: "100dvh", overflowY: "auto", paddingBottom: "calc(66px + env(safe-area-inset-bottom, 0px))" }}>
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
