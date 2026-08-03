import type { Metadata } from "next";
import { AboutInnoView } from "@/components/about/AboutInnoView";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

export const metadata: Metadata = { title: "INNO Vorbereitung - Capitalife" };

export default async function AboutInnoPage() {
  const trackRecordOverview = await buildTrackRecordOverview();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-4 pl-0 pr-4 pt-4">
      <div className="relative z-20 shrink-0">
        <AboutModeTabs activeMode="inno" hrefs={{ overview: "/about", inno: "/about/inno" }} />
      </div>
      <AboutInnoView trackRecordOverview={trackRecordOverview} />
    </div>
  );
}
