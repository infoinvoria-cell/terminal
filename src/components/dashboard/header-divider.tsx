"use client";

export function HeaderDivider({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        height: visible ? 14 : 0,
        overflow: "hidden",
        flexShrink: 0,
        opacity: visible ? 1 : 0,
        transition: "height 220ms ease, opacity 180ms ease",
      }}
    >
      <div className="ml-4 mr-6 mt-1 h-px bg-gradient-to-r from-transparent via-[#D6B24A]/65 to-transparent" />
    </div>
  );
}
