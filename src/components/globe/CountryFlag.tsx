"use client";

// Inline-SVG country flags. Emoji flags (🇺🇸 …) do NOT render as flags on
// Windows — they show the ISO letters — so news/globe flags looked "missing".
// These SVGs render identically on every platform.

type Props = { code: string; size?: number; title?: string };

function Frame({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      width="15"
      height="10"
      role="img"
      aria-label={title}
      style={{ borderRadius: 2, display: "inline-block", verticalAlign: "middle", boxShadow: "0 0 0 0.5px rgba(255,255,255,0.15)" }}
      preserveAspectRatio="xMidYMid slice"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export default function CountryFlag({ code, title }: Props) {
  const c = String(code || "").toUpperCase();
  const t = title || c;

  switch (c) {
    case "US":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#b22234" />
          {[1, 3, 5, 7, 9, 11, 13].map((i) => (
            <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#fff" />
          ))}
          <rect width="12" height={(20 / 13) * 7} fill="#3c3b6e" />
        </Frame>
      );
    case "GB":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#fff" strokeWidth="4" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#c8102e" strokeWidth="2" />
          <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#c8102e" strokeWidth="3.5" />
        </Frame>
      );
    case "DE":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
          <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
        </Frame>
      );
    case "JP":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#fff" />
          <circle cx="15" cy="10" r="5.5" fill="#bc002d" />
        </Frame>
      );
    case "CA":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#fff" />
          <rect width="7.5" height="20" fill="#d52b1e" />
          <rect x="22.5" width="7.5" height="20" fill="#d52b1e" />
          <circle cx="15" cy="10" r="3.4" fill="#d52b1e" />
        </Frame>
      );
    case "IE":
      return (
        <Frame title={t}>
          <rect width="10" height="20" fill="#169b62" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ff883e" />
        </Frame>
      );
    case "FR":
      return (
        <Frame title={t}>
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </Frame>
      );
    case "IT":
      return (
        <Frame title={t}>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce2b37" />
        </Frame>
      );
    case "CH":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#d52b1e" />
          <rect x="13" y="5.5" width="4" height="9" fill="#fff" />
          <rect x="10.5" y="8" width="9" height="4" fill="#fff" />
        </Frame>
      );
    case "CN":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#de2910" />
          <path d="M6 3 L7.2 6.6 L3.8 4.4 L8.2 4.4 L4.8 6.6 Z" fill="#ffde00" />
        </Frame>
      );
    case "HK":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#de2910" />
          <circle cx="15" cy="10" r="4.2" fill="#fff" />
          <circle cx="15" cy="10" r="1.6" fill="#de2910" />
        </Frame>
      );
    case "EU":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#003399" />
          <circle cx="15" cy="10" r="5.5" fill="none" stroke="#ffcc00" strokeWidth="0.8" strokeDasharray="0.9 1.7" />
        </Frame>
      );
    case "AU":
    case "NZ":
      return (
        <Frame title={t}>
          <rect width="30" height="20" fill="#00247d" />
          <rect width="15" height="10" fill="#012169" />
          <path d="M0,0 15,10 M15,0 0,10" stroke="#fff" strokeWidth="2" />
          <path d="M7.5,0 V10 M0,5 H15" stroke="#fff" strokeWidth="3" />
          <path d="M7.5,0 V10 M0,5 H15" stroke="#c8102e" strokeWidth="1.5" />
          <circle cx="22" cy="13" r="1.3" fill="#fff" />
        </Frame>
      );
    default:
      // Generic globe — neutral, always renders.
      return (
        <Frame title={t || "Global"}>
          <rect width="30" height="20" fill="#1f2937" />
          <circle cx="15" cy="10" r="6" fill="none" stroke="#9ca3af" strokeWidth="0.9" />
          <path d="M9,10 H21 M15,4 V16 M10.5,6.5 Q15,10 10.5,13.5 M19.5,6.5 Q15,10 19.5,13.5" stroke="#9ca3af" strokeWidth="0.7" fill="none" />
        </Frame>
      );
  }
}
