"use client";

import { useState } from "react";
import { FONT_LABEL } from "@/lib/modeling/colors";

type Props = {
  is3D: boolean;
  onToggle: () => void;
};

export function ThreeDToggle({ is3D, onToggle }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        zIndex: 10,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.18s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 5,
          padding: "3px 9px",
          color: "rgba(224,224,224,0.85)",
          fontFamily: FONT_LABEL,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.1em",
          cursor: "pointer",
        }}
      >
        {is3D ? "2D" : "3D"}
      </button>
    </div>
  );
}
