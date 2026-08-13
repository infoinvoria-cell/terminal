"use client";

import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { InnoPreparationContent } from "@/components/about/InnoPreparationContent";
import type { TrackRecordOverview } from "@/lib/track-record/types";

export function MobileAboutInnoView({ trackRecordOverview }: { trackRecordOverview: TrackRecordOverview }) {
  return (
    <div style={{ background: "#09090A", minHeight: "100%", padding: "12px 12px 28px" }}>
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.065)",
          background: "linear-gradient(180deg, rgba(27,28,31,0.96) 0%, rgba(16,17,19,0.98) 100%)",
          boxShadow: "0 18px 40px -24px rgba(0,0,0,0.75)",
          padding: 14,
          marginBottom: 12,
        }}
      >
        <AboutModeTabs
          activeMode="inno"
          mobile
          basePath="/m/about"
          hrefs={{ overview: "/m/about", inno: "/m/about/inno" }}
          fontFamily={'"Open Sans", var(--font-text), sans-serif'}
        />
      </div>
      <div data-testid="inno-call-cockpit-route-mobile" style={{ minHeight: 0 }}>
        <InnoPreparationContent trackRecordOverview={trackRecordOverview} mobile />
      </div>
    </div>
  );
}
