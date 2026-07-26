"use client";

import type { GlobePattern } from "@/app/api/globe/pattern-detection/route";

type Props = {
  patterns: GlobePattern[];
  onFocus: (p: GlobePattern) => void;
  onDismiss: (id: string) => void;
};

export default function GlobePatternAlerts({ patterns, onFocus, onDismiss }: Props) {
  if (!patterns.length) return null;
  return (
    <div className="absolute left-1/2 top-3 z-40 flex w-[240px] -translate-x-1/2 flex-col gap-1.5">
      {patterns.slice(0, 3).map((p) => (
        <div
          key={p.id}
          className="overflow-hidden rounded-[9px] backdrop-blur-md"
          style={{
            background: "rgba(10,11,15,0.95)",
            border: `1px solid ${p.action === "alert" ? "rgba(240,82,82,0.5)" : "rgba(212,175,55,0.5)"}`,
            boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
          }}
        >
          <button type="button" onClick={() => onFocus(p)} className="block w-full px-2.5 py-1.5 text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">{p.action === "alert" ? "🔴" : "⚡"}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: p.action === "alert" ? "#f87171" : "#D4AF37" }}>
                {p.pattern}
              </span>
              <span className="ml-auto text-[9px] font-semibold text-white/40">{Math.round(p.confidence * 100)}%</span>
            </div>
            {p.affectedAssets.length > 0 && (
              <div className="mt-0.5 truncate text-[9px] text-white/45">{p.affectedAssets.join(" · ")}</div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(p.id)}
            className="absolute right-1.5 top-1 text-[11px] leading-none text-white/30 transition hover:text-white/70"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
