import type { CSSProperties, ReactNode } from "react";

type CapitalifeStatusTone = "loading" | "error" | "degraded" | "unavailable" | "stale";

const toneMap: Record<CapitalifeStatusTone, { label: string; accent: string }> = {
  loading: { label: "LOADING", accent: "#C9A84C" },
  error: { label: "ERROR", accent: "#d6d7dc" },
  degraded: { label: "DEGRADED", accent: "#C9A84C" },
  unavailable: { label: "UNAVAILABLE", accent: "#b8bbc4" },
  stale: { label: "STALE", accent: "#C9A84C" },
};

const wrap: CSSProperties = {
  display: "flex",
  minHeight: "100%",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "linear-gradient(180deg, rgba(12,13,16,0.94) 0%, rgba(8,9,11,0.98) 100%)",
};

const card: CSSProperties = {
  width: "min(520px, 100%)",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(16,17,21,0.92)",
  boxShadow: "0 24px 54px rgba(0,0,0,0.42)",
  padding: "22px 24px",
};

export function CapitalifeStatusPanel({
  tone,
  title,
  detail,
  action,
}: {
  tone: CapitalifeStatusTone;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const config = toneMap[tone];

  return (
    <div style={wrap}>
      <div style={card}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "4px 10px",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: config.accent,
            marginBottom: 14,
          }}
        >
          {config.label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f5f6fa", marginBottom: 8 }}>
          {title}
        </div>
        {detail ? (
          <div style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(228,231,238,0.72)" }}>
            {detail}
          </div>
        ) : null}
        {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
      </div>
    </div>
  );
}
