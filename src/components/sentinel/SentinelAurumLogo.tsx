"use client";

// Placeholder — awaiting the dedicated Sentinel logo/animation HTML to be dropped in here.

type Props = {
  size?: number;
};

export function SentinelAurumLogo({ size = 220 }: Props) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Sentinel.png"
        alt=""
        style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.9 }}
        draggable={false}
      />
    </div>
  );
}
