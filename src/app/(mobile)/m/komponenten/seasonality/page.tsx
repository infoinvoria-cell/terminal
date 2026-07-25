"use client";

import { useRouter } from "next/navigation";

export default function MobileSeasonalityPage() {
  const router = useRouter();

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0c0d10",
      color: "rgba(255,255,255,0.7)",
      gap: 16,
      padding: 24,
      textAlign: "center",
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3s3-5 5-5"/>
      </svg>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
          Seasonality
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
          Desktop-Ansicht empfohlen
        </div>
      </div>
      <button
        onClick={() => router.push("/m/komponenten")}
        style={{
          marginTop: 8,
          padding: "10px 20px",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          color: "rgba(255,255,255,0.6)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        ← Komponenten
      </button>
    </div>
  );
}
