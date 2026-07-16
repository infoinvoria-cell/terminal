"use client";

import { cn } from "@/lib/utils";
import type { TimeRange } from "@/lib/trades-analytics";

const RANGES: TimeRange[] = ["1W", "1M", "3M", "1Y"];

type FilterSwitchProps = {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
  className?: string;
};

export function FilterSwitch({ value, onChange, className }: FilterSwitchProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-[#2a2b30]/80 bg-white/[0.03] p-1",
        className
      )}
      role="tablist"
      aria-label="Aggregation period"
    >
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
            value === r
              ? "bg-[#2a2a2a] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_0_var(--dash-gold-soft)]"
              : "text-zinc-500/80 hover:text-zinc-300"
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
