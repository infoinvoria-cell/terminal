"use client";

// Sentinel Aurum mark — new logo, full color, centered in the rings.
// Awaiting a dedicated animation HTML to swap in; static for now.

type Props = {
  size?: number;
};

export function SentinelAurumLogo({ size = 220 }: Props) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sentinel-logo.png"
        alt=""
        style={{ width: "78%", height: "78%", objectFit: "contain" }}
        draggable={false}
      />
    </div>
  );
}
