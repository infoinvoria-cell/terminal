"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { swrJsonFetcher } from "@/components/performance/swr-fetcher";

type ProviderUsage = {
  provider: string;
  tokensUsed: number;
  tokensAvailable: number;
  dailyLimit: number;
  resetAt: string;
  unlimited: boolean;
};

type Props = {
  activeProvider: string | null;
};

const SIZE = 18;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function formatNum(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatReset(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

export function TokenRing({ activeProvider }: Props) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const provider = activeProvider ?? "groq";
  const { data: usageByProvider } = useSWR<Record<string, ProviderUsage>>(
    "/api/sentinel/token-usage",
    swrJsonFetcher,
    { refreshInterval: 30_000, keepPreviousData: true },
  );
  const usage = usageByProvider?.[provider] ?? null;

  // Close popup on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!popupRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const used = usage?.tokensUsed ?? 0;
  const total = usage?.dailyLimit ?? 14400;
  const unlimited = usage?.unlimited ?? false;
  const fraction = unlimited ? 0 : Math.min(1, used / total);
  const dashOffset = CIRC * (1 - fraction);

  // Colour: green < 70 %, amber < 90 %, red >= 90 %
  const ringColor = unlimited
    ? "rgba(255,255,255,0.15)"
    : fraction >= 0.9
    ? "#ef4444"
    : fraction >= 0.7
    ? "#f59e0b"
    : "#e2ca7a";

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Token usage"
        title="Token usage"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          opacity: usage ? 1 : 0.35,
          transition: "opacity 200ms ease",
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth={STROKE}
          />
          {/* Used arc */}
          {!unlimited && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth={STROKE}
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 500ms ease, stroke 300ms ease" }}
            />
          )}
          {/* Unlimited: solid thin ring */}
          {unlimited && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={STROKE}
            />
          )}
        </svg>
      </button>

      {/* Popup */}
      {open && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 200,
            background: "#141517",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "12px 14px",
            zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            fontFamily: "var(--font-montserrat,sans-serif)",
            fontSize: 12,
            color: "#c8cdd6",
          }}
        >
          {/* Provider */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)" }}>
              Provider
            </span>
            <span style={{ marginLeft: "auto", fontWeight: 700, color: "#f5f5f7", fontSize: 13 }}>
              {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </span>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 10 }} />

          {unlimited ? (
            <p style={{ margin: 0, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>Kein Token-Limit für diesen Provider.</p>
          ) : (
            <>
              <Row label="Verbraucht heute" value={`${formatNum(used)} / ${formatNum(total)}`} accent={ringColor} />
              <Row label="Verfügbar" value={formatNum(Math.max(0, total - used))} />
              <Row label="Reset um" value={usage ? formatReset(usage.resetAt) : "—"} />
              {/* Mini progress bar */}
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: "#2a2a2a", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, fraction * 100).toFixed(1)}%`,
                  background: ringColor,
                  borderRadius: 2,
                  transition: "width 400ms ease",
                }} />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 10, color: "rgba(255,255,255,0.28)", textAlign: "right" }}>
                {(fraction * 100).toFixed(1)}% verbraucht
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? "#e2e6ed", fontSize: 12 }}>{value}</span>
    </div>
  );
}
