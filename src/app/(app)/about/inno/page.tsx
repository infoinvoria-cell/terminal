import type { Metadata } from "next";
import { AboutInnoView } from "@/components/about/AboutInnoView";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";

export const metadata: Metadata = { title: "INNO Vorbereitung - Capitalife" };

export default function AboutInnoPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 pb-4 pt-4">
      <div className="relative z-20 shrink-0">
        <AboutModeTabs activeMode="inno" hrefs={{ overview: "/about", inno: "/about/inno" }} />
      </div>
      <AboutInnoView />
    </div>
  );
}
