import type { Metadata } from "next";
import { AboutInnoView } from "@/components/about/AboutInnoView";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "INNO Vorbereitung - Capitalife" };

export default async function AboutInnoPage() {
  const trackRecordOverview = await buildTrackRecordOverview();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-2 pl-3 pr-4 pt-3">
      <div className="relative z-20 shrink-0">
        <AboutModeTabs
          activeMode="inno"
          hrefs={{ overview: "/about", inno: "/about/inno" }}
          fontFamily={'"Open Sans", var(--font-text), sans-serif'}
        />
      </div>
      <div className="min-h-0 flex-1">
        <AboutInnoView trackRecordOverview={trackRecordOverview} />
      </div>
    </div>
  );
}
