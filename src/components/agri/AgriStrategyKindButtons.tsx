"use client";

import { memo } from "react";
import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

type ButtonDef = {
  kind: AgriStrategyKind;
  label: string;
  title: string;
};

const BUTTONS: ButtonDef[] = [
  { kind: "valuation", label: "V", title: "Valuation strategy" },
  { kind: "seasonal",  label: "S", title: "Seasonal strategy (Safety Stop)" },
  { kind: "macro",     label: "M", title: "Macro strategy (limited, requires Satellite data)" },
];

type Props = {
  availableKinds: { valuation: boolean; seasonal: boolean; macro: boolean };
  activeKinds: AgriStrategyKind[];
  onToggle: (kind: AgriStrategyKind) => void;
};

function AgriStrategyKindButtonsInner({ availableKinds, activeKinds, onToggle }: Props) {
  const visible = BUTTONS.filter((b) => availableKinds[b.kind]);
  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 7,
        right: 58,
        display: "flex",
        gap: 3,
        zIndex: 20,
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {visible.map((b) => {
        const isActive = activeKinds.includes(b.kind);
        return (
          <button
            key={b.kind}
            title={b.title}
            aria-label={`${isActive ? "Deactivate" : "Activate"} ${b.title}`}
            aria-pressed={isActive}
            onClick={() => onToggle(b.kind)}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: isActive
                ? "1px solid rgba(255,255,255,0.5)"
                : "1px solid rgba(255,255,255,0.14)",
              background: isActive
                ? "rgba(255,255,255,0.18)"
                : "rgba(255,255,255,0.04)",
              color: isActive ? "#f4f7fb" : "rgba(255,255,255,0.3)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.03em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              lineHeight: 1,
              transition: "background 0.1s, border-color 0.1s, color 0.1s",
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(AgriStrategyKindButtonsInner);
