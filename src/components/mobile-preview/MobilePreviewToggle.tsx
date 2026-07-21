"use client";
import { Smartphone } from "lucide-react";
import { useMobilePreview, type PreviewMode } from "@/context/mobile-preview-context";

const LABELS: Record<PreviewMode, string> = {
  desktop: "Desktop",
  mobile:  "Mobile Preview",
  split:   "Split View",
};

const COLORS: Record<PreviewMode, string> = {
  desktop: "text-zinc-600 hover:text-zinc-400",
  mobile:  "text-[#e2ca7a]",
  split:   "text-[#e2ca7a]/70",
};

export function MobilePreviewToggle({ expanded }: { expanded: boolean }) {
  const { mode, cycle } = useMobilePreview();

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Mobile Preview: ${LABELS[mode]}. Klicken zum Wechseln.`}
      title={`Preview: ${LABELS[mode]}`}
      className={`flex h-11 w-full shrink-0 items-center gap-3 rounded-lg border-0 bg-transparent transition-colors pl-[18px] ${COLORS[mode]}`}
    >
      <Smartphone className="h-[19px] w-[19px] shrink-0" strokeWidth={1.65} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          opacity: expanded ? 1 : 0,
          maxWidth: expanded ? 120 : 0,
          transition: "opacity 180ms ease, max-width 200ms ease",
          display: "inline-block",
        }}
      >
        {LABELS[mode]}
      </span>
    </button>
  );
}
