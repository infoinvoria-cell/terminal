"use client";
import { Smartphone } from "lucide-react";
import { useMobilePreview, type PreviewMode } from "@/context/mobile-preview-context";

const LABELS: Record<PreviewMode, string> = {
  desktop: "Desktop",
  mobile:  "Mobile Preview",
  split:   "Split View",
};

const ICON_COLOR: Record<PreviewMode, string> = {
  desktop: "rgba(113,113,122,1)",   // zinc-500
  mobile:  "#e2ca7a",
  split:   "rgba(226,202,122,0.7)",
};

export function MobilePreviewToggle({ expanded }: { expanded: boolean }) {
  const { mode, cycle } = useMobilePreview();

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); cycle(); }}
      aria-label={`Mobile Preview: ${LABELS[mode]}. Klicken zum Wechseln.`}
      title={`Preview: ${LABELS[mode]}`}
      style={{
        display: "flex",
        height: 44,
        width: "100%",
        flexShrink: 0,
        alignItems: "center",
        gap: 12,
        borderRadius: 8,
        border: 0,
        background: "transparent",
        cursor: "pointer",
        paddingLeft: 18,
        color: ICON_COLOR[mode],
        transition: "color 150ms ease",
      }}
    >
      <Smartphone style={{ width: 19, height: 19, flexShrink: 0 }} strokeWidth={1.65} />
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
