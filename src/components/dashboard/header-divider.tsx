"use client";

import { useHeaderState } from "@/context/header-state-context";

export function HeaderDivider() {
  const { headerHidden } = useHeaderState();

  return (
    <div
      aria-hidden
      style={{
        height: headerHidden ? 0 : 9,
        overflow: "hidden",
        flexShrink: 0,
        transition: "height 200ms ease",
      }}
    >
      <div className="mx-8 my-1 h-px bg-gradient-to-r from-transparent via-[#e2ca7a]/65 to-transparent" />
    </div>
  );
}
