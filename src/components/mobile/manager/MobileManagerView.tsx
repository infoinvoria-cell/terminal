"use client";

import React, { useEffect, useState } from "react";

type Investor = {
  id: string;
  name: string;
  unternehmen: string | null;
  status: string;
  email: string | null;
  telefon: string | null;
  letzter_kontakt: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  "Neu": "#a1a1aa",
  "Kontaktiert": "#60a5fa",
  "Early Access gesendet": "#818cf8",
  "Interesse bestätigt": "#22d3ee",
  "Gespräch geplant": "#c084fc",
  "Warm Commitment": "#fbbf24",
  "Unterlagen ausstehend": "#fb923c",
  "Bereit für Onboarding": "#4ade80",
  "Später kontaktieren": "#71717a",
  "Abgesagt": "#f87171",
};

const PRIORITY_STATUSES = new Set(["Warm Commitment", "Bereit für Onboarding"]);

const PAGE_BG = "#0c0d10";
const CARD_BG = "#1c1d20";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.38)";

function statusColor(status: string) {
  return STATUS_STYLE[status] ?? "#a1a1aa";
}

export function MobileManagerView() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/investors-crm")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const rows: Investor[] = Array.isArray(data) ? data : data.investors ?? [];
        // Sort: priority first
        rows.sort((a, b) => {
          const ap = PRIORITY_STATUSES.has(a.status) ? 0 : 1;
          const bp = PRIORITY_STATUSES.has(b.status) ? 0 : 1;
          return ap - bp;
        });
        setInvestors(rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // KPI chips
  const total = investors.length;
  const pipeline = investors.filter((i) => PRIORITY_STATUSES.has(i.status)).length;
  const abgesagt = investors.filter((i) => i.status === "Abgesagt").length;

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const inv of investors) {
    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
  }
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div
      style={{
        minHeight: "100%",
        paddingBottom: 32,
        background: PAGE_BG,
        fontFamily: "var(--font-montserrat, sans-serif)",
        color: "white",
      }}
    >
      {/* Sticky Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: PAGE_BG,
          borderBottom: BORDER,
          padding: "20px 20px 16px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "white",
          }}
        >
          Manager
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED, fontWeight: 500 }}>
          Investor Pipeline
        </p>
      </div>

      <div style={{ padding: "20px 16px 0" }}>
        {loading && (
          <div style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "40px 0" }}>
            Lade Investoren…
          </div>
        )}

        {error && (
          <div
            style={{
              color: "#f87171",
              fontSize: 13,
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
            }}
          >
            Fehler: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* KPI Chips */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                { label: "Investoren", value: total, color: "white" },
                { label: "Pipeline", value: pipeline, color: "#fbbf24" },
                { label: "Abgesagt", value: abgesagt, color: "#f87171" },
              ].map((chip) => (
                <div
                  key={chip.label}
                  style={{
                    flex: 1,
                    background: CARD_BG,
                    border: BORDER,
                    borderRadius: 12,
                    padding: "12px 10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: chip.color,
                      lineHeight: 1,
                      marginBottom: 4,
                    }}
                  >
                    {chip.value}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {chip.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Status Distribution */}
            {statusEntries.length > 0 && (
              <div
                style={{
                  background: CARD_BG,
                  border: BORDER,
                  borderRadius: 14,
                  padding: "16px",
                  marginBottom: 20,
                }}
              >
                <h2
                  style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: MUTED,
                  }}
                >
                  Status-Verteilung
                </h2>

                {/* Horizontal bar */}
                <div
                  style={{
                    display: "flex",
                    height: 10,
                    borderRadius: 6,
                    overflow: "hidden",
                    marginBottom: 14,
                    gap: 2,
                  }}
                >
                  {statusEntries.map(([status, count]) => (
                    <div
                      key={status}
                      style={{
                        flex: count,
                        background: statusColor(status),
                        borderRadius: 3,
                      }}
                      title={`${status}: ${count}`}
                    />
                  ))}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {statusEntries.map(([status, count]) => (
                    <div
                      key={status}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: statusColor(status),
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>
                        {status}
                      </span>
                      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Investor List */}
            <h2
              style={{
                margin: "0 0 12px",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              Alle Investoren
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {investors.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    background: CARD_BG,
                    border: BORDER,
                    borderRadius: 14,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: `${statusColor(inv.status)}22`,
                      border: `1px solid ${statusColor(inv.status)}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: statusColor(inv.status),
                      flexShrink: 0,
                    }}
                  >
                    {inv.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "white",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {inv.name}
                    </div>
                    {inv.unternehmen && (
                      <div
                        style={{
                          fontSize: 11,
                          color: MUTED,
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {inv.unternehmen}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: `${statusColor(inv.status)}18`,
                      border: `1px solid ${statusColor(inv.status)}44`,
                      fontSize: 10,
                      fontWeight: 700,
                      color: statusColor(inv.status),
                      whiteSpace: "nowrap",
                      letterSpacing: "0.03em",
                      flexShrink: 0,
                      maxWidth: 130,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {inv.status}
                  </div>
                </div>
              ))}

              {investors.length === 0 && (
                <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                  Keine Investoren gefunden.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
