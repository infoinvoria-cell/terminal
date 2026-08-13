"use client";

// Sentinel Aurum logo — 5-piece staggered reveal animation loop (8.2s infinite)
// Pieces correspond to public/sentinel-aurum-piece-{1-5}.png

const PIECES = [
  { left: "44.41133%", top: "7.11921%",  width: "11.47541%", height: "85.43046%", delay: "0.00s" },
  { left: "25.93145%", top: "30.79470%", width: "10.73025%", height: "48.84106%", delay: "0.46s" },
  { left: "63.93443%", top: "30.79470%", width: "10.13413%", height: "48.84106%", delay: "0.92s" },
  { left: "6.40835%",  top: "42.21854%", width: "36.21461%", height: "50.00000%", delay: "1.38s" },
  { left: "57.67511%", top: "42.21854%", width: "35.91654%", height: "50.00000%", delay: "1.84s" },
];

type Props = {
  size?: number; // width in px, height auto (671/604 aspect ratio)
};

export function SentinelAurumLogo({ size = 220 }: Props) {
  const h = Math.round(size * (604 / 671));

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: h,
        flexShrink: 0,
      }}
    >
      {PIECES.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: p.width,
            height: p.height,
            opacity: 0,
            transform: "translateY(12px) scale(.985)",
            animation: `snt-aurum-reveal 8.2s infinite cubic-bezier(.22,.61,.36,1)`,
            animationDelay: p.delay,
            willChange: "opacity, transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/sentinel-aurum-piece-${i + 1}.png`}
            alt=""
            style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />
        </div>
      ))}

      <style>{`
        @keyframes snt-aurum-reveal {
          0%   { opacity: 0; transform: translateY(12px) scale(.985); }
          7%   { opacity: 0; transform: translateY(12px) scale(.985); }
          17%  { opacity: 1; transform: translateY(0)    scale(1);    }
          78%  { opacity: 1; transform: translateY(0)    scale(1);    }
          100% { opacity: 0; transform: translateY(-4px)  scale(1);   }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="snt-aurum-reveal"] { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}
