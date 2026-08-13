"use client";

import { BellRing, ChartColumn, Globe, Home } from "lucide-react";

const PREVIEW_VERSION = "20260804-1612";

const PREVIEW_TILES = [
  {
    icon: Home,
    label: "Home",
    category: "Navigation",
    src: `/generated/preview-workspace/home.png?v=${PREVIEW_VERSION}`,
    alt: "Home preview",
  },
  {
    icon: ChartColumn,
    label: "Analytics",
    category: "Intelligence",
    src: `/generated/preview-workspace/analytics.png?v=${PREVIEW_VERSION}`,
    alt: "Analytics preview",
  },
  {
    icon: Globe,
    label: "Globe",
    category: "Navigation",
    src: `/generated/preview-workspace/globe.png?v=${PREVIEW_VERSION}`,
    alt: "Globe preview",
  },
  {
    icon: BellRing,
    label: "Signale",
    category: "Execution",
    src: `/generated/preview-workspace/signale.png?v=${PREVIEW_VERSION}`,
    alt: "Signale preview",
  },
] as const;

function PreviewTile({
  icon: Icon,
  label,
  category,
  src,
  alt,
}: {
  icon: typeof Home;
  label: string;
  category: string;
  src: string;
  alt: string;
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-baseline gap-2.5">
        <div className="flex items-center gap-2.5">
          <Icon className="h-[16px] w-[16px] text-zinc-300" strokeWidth={1.8} />
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-white">{label}</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-300/90">{category}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0a0a0c]">
        <div className="flex h-full w-full items-start justify-center overflow-hidden rounded-[24px]">
          <img
            src={src}
            alt={alt}
            loading="eager"
            className="block h-full w-full object-contain object-top"
          />
        </div>
      </div>
    </section>
  );
}

export default function PreviewWorkspacePage() {
  return (
    <div className="h-full overflow-hidden bg-[#09090b] px-6 pb-5 pt-4 text-white">
      <div className="mx-auto grid h-full max-w-[1540px] grid-cols-2 grid-rows-2 gap-x-16 gap-y-6">
          {PREVIEW_TILES.map((tile) => (
            <PreviewTile key={tile.src} {...tile} />
          ))}
      </div>
    </div>
  );
}
