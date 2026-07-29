"use client";

import type { TrackRecordOverview } from "@/lib/track-record/types";

type Props = {
  overview: TrackRecordOverview | null;
  compact?: boolean;
};

export function TrackRecordStatusStrip({ overview, compact = false }: Props) {
  if (!overview) return null;

  const syncRows = overview.live.syncRows;
  const lastSuccess = syncRows
    .map((row) => row.lastSuccessAtUtc)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.8fr) minmax(0, 1fr)",
        gap: compact ? 8 : 12,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(12,13,16,0.55)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {overview.live.badges.map((badge) => (
          <span
            key={badge}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 24,
              padding: "0 9px",
              borderRadius: 999,
              border: `1px solid ${badgeBorder(badge)}`,
              color: badgeColor(badge),
              fontSize: compact ? 10 : 11,
              fontWeight: 600,
              fontFamily: "var(--font-montserrat,sans-serif)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            {badge}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: compact ? "flex-start" : "flex-end",
          alignItems: compact ? "flex-start" : "center",
          gap: 12,
          flexWrap: "wrap",
          color: "#9ca3af",
          fontSize: compact ? 10 : 11,
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}
      >
        <span>Quelle: {syncRows.map((row) => row.provider).join(", ") || "historisch"}</span>
        <span>Status: {summarizeHealth(syncRows)}</span>
        <span>Letzter Sync: {lastSuccess ? formatIso(lastSuccess) : "noch keiner"}</span>
      </div>
    </div>
  );
}

function summarizeHealth(syncRows: TrackRecordOverview["live"]["syncRows"]) {
  if (!syncRows.length) return "nur historische Basis";
  if (syncRows.some((row) => row.health === "error")) return "Fehler";
  if (syncRows.some((row) => row.health === "stale")) return "veraltet";
  return "aktuell";
}

function formatIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function badgeColor(badge: string) {
  if (badge === "Daten veraltet") return "#f0c674";
  if (badge === "Quellenabweichung") return "#f59e9e";
  if (badge === "Broker") return "#ffffff";
  return "#d7dbe3";
}

function badgeBorder(badge: string) {
  if (badge === "Daten veraltet") return "rgba(240,198,116,0.45)";
  if (badge === "Quellenabweichung") return "rgba(245,158,158,0.45)";
  if (badge === "Broker") return "rgba(255,255,255,0.24)";
  return "rgba(215,219,227,0.2)";
}
