"use client";

import dynamic from "next/dynamic";

const BrainGraphShell = dynamic(
  () => import("@/components/brain-graph/BrainGraphShell").then((module) => module.BrainGraphShell),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[100dvh] place-items-center bg-[#07080a] text-sm text-zinc-600">
        Lade Brain Graph...
      </div>
    ),
  },
);

export function LazyBrainGraphShell() {
  return <BrainGraphShell />;
}
