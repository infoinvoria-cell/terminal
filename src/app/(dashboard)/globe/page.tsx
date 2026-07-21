"use client";

import dynamic from "next/dynamic";

const GlobeApp = dynamic(() => import("@/components/globe/GlobeApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0c0d10]">
      <div className="text-sm text-zinc-500">Globe wird geladen…</div>
    </div>
  ),
});

export default function GlobePage() {
  return (
    <div className="h-full w-full overflow-hidden bg-[#0c0d10]">
      <GlobeApp />
    </div>
  );
}
