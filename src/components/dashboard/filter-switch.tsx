"use client";

import { InjectPillCss, SegButton } from "@/components/ui/pill-button";
import type { TimeRange } from "@/lib/trades-analytics";

const RANGES: TimeRange[] = ["1W", "1M", "3M", "1Y"];

type FilterSwitchProps = {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
  className?: string;
};

export function FilterSwitch({ value, onChange }: FilterSwitchProps) {
  return (
    <>
      <InjectPillCss />
      <div role="radiogroup" aria-label="Aggregation period" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {RANGES.map((r) => (
          <SegButton key={r} active={value === r} label={r} onClick={() => onChange(r)} />
        ))}
      </div>
    </>
  );
}
