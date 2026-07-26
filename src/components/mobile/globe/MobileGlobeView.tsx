"use client";

import dynamic from "next/dynamic";

const GlobeApp = dynamic(
  () => import("@/components/globe/GlobeApp").then(m => ({ default: m.GlobeApp })),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6b7280", fontSize: 14 }}>
        Loading Globe…
      </div>
    ),
  }
);

export function MobileGlobeView() {
  return (
    <div style={{ height: "100%", overflow: "hidden", position: "relative" }}>
      <GlobeApp mobileMode />
    </div>
  );
}
