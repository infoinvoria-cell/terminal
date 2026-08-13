"use client";

import { InnoPreparationContent } from "@/components/about/InnoPreparationContent";
import type { TrackRecordOverview } from "@/lib/track-record/types";

export function AboutInnoView({ trackRecordOverview }: { trackRecordOverview: TrackRecordOverview }) {
  return (
    <div
      data-testid="inno-call-cockpit-route"
      style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column" }}
    >
      <InnoPreparationContent trackRecordOverview={trackRecordOverview} />
    </div>
  );
}
