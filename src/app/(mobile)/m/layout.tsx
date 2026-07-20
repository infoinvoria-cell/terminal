import type { Metadata } from "next";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";

// Dedicated mobile shell. Nested under the single root layout (html/body/fonts),
// but shares NO chrome with the desktop app — no header, no sidebar, only the
// bottom tab bar. Its own scroll container so the fixed nav never covers content.

export const metadata: Metadata = {
  title: "Capitalife Mobile",
};

// Height of the bottom nav (content bottom padding must clear it).
const NAV_CLEARANCE = "calc(66px + env(safe-area-inset-bottom, 0px))";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-mobile-shell="v1"
      style={{
        height: "100dvh",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "#0c0d10",
        color: "#fafafa",
        fontFamily: "var(--font-nunito), system-ui, sans-serif",
      }}
    >
      <main style={{ minHeight: "100%", paddingBottom: NAV_CLEARANCE }}>
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
