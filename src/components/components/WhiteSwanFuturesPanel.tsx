"use client";

import componentAudit from "@/data/capitalife/white-swan-futures/component-audit.json";

type DataStatus =
  | "FUTURES_REPLICATION_POSSIBLE"
  | "RESEARCH_ETF_ONLY"
  | "NO_FULL_BACKTEST"
  | "NO_TRADE_DATA";

const STATUS_BADGE: Record<DataStatus, { label: string; bg: string; color: string }> = {
  FUTURES_REPLICATION_POSSIBLE: { label: "FUTURES OK", bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  RESEARCH_ETF_ONLY: { label: "ETF ONLY", bg: "rgba(234,179,8,0.12)", color: "#eab308" },
  NO_FULL_BACKTEST: { label: "MONITORING", bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  NO_TRADE_DATA: { label: "NO DATA", bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
};

const FONT_MONO = "var(--font-mono, 'IBM Plex Mono', monospace)";
const FONT_UI = "var(--font-ui, 'IBM Plex Sans', sans-serif)";
const SURFACE = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.07)";
const MUTED = "rgba(255,255,255,0.38)";
const TEXT = "rgba(255,255,255,0.87)";
const HEADER = "rgba(255,255,255,0.55)";

type Component = (typeof componentAudit.components)[number];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status as DataStatus] ?? { label: status, bg: SURFACE, color: MUTED };
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 9,
        letterSpacing: "0.05em",
        padding: "2px 6px",
        borderRadius: 3,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function HeaderCell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        fontFamily: FONT_UI,
        fontSize: 10,
        fontWeight: 600,
        color: HEADER,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        padding: "6px 10px",
        textAlign: right ? "right" : "left",
        whiteSpace: "nowrap",
        borderBottom: `1px solid ${BORDER}`,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  right,
  mono,
  muted,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      style={{
        fontFamily: mono ? FONT_MONO : FONT_UI,
        fontSize: mono ? 11 : 12,
        color: muted ? MUTED : TEXT,
        padding: "5px 10px",
        textAlign: right ? "right" : "left",
        whiteSpace: "nowrap",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {children}
    </td>
  );
}

export default function WhiteSwanFuturesPanel() {
  const { components, simulationPeriod, costScenariosNote, dataIntegrityStatement } = componentAudit;

  const replicable = components.filter((c) => c.dataStatus === "FUTURES_REPLICATION_POSSIBLE");
  const etfOnly = components.filter((c) => c.dataStatus === "RESEARCH_ETF_ONLY");
  const monitoring = components.filter((c) => c.dataStatus === "NO_FULL_BACKTEST");
  const noData = components.filter((c) => c.dataStatus === "NO_TRADE_DATA");

  return (
    <div style={{ padding: "24px 0 40px" }}>
      {/* Header */}
      <div style={{ padding: "0 20px 18px" }}>
        <div
          style={{
            fontFamily: FONT_UI,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: MUTED,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          White Swan / Futures Reference
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: TEXT, marginBottom: 2 }}>
          1 Contract per Signal · {simulationPeriod}
        </div>
        <div style={{ fontFamily: FONT_UI, fontSize: 11, color: MUTED, maxWidth: 700 }}>
          {costScenariosNote}
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "0 20px 20px",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "FUTURES OK", count: replicable.length, color: "#22c55e" },
          { label: "ETF ONLY", count: etfOnly.length, color: "#eab308" },
          { label: "MONITORING", count: monitoring.length, color: "#3b82f6" },
          { label: "NO DATA", count: noData.length, color: "#6b7280" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: 18, color: TEXT, fontWeight: 700 }}>
              {s.count}
            </span>
            <span style={{ fontFamily: FONT_UI, fontSize: 10, color: MUTED, letterSpacing: "0.06em" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Main table */}
      <div style={{ overflowX: "auto", padding: "0 20px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead>
            <tr>
              <HeaderCell>Strategy</HeaderCell>
              <HeaderCell>Future</HeaderCell>
              <HeaderCell>Exchange</HeaderCell>
              <HeaderCell right>Mult</HeaderCell>
              <HeaderCell>Ccy</HeaderCell>
              <HeaderCell right>Weight %</HeaderCell>
              <HeaderCell>Data Status</HeaderCell>
              <HeaderCell right>Trades (2008+)</HeaderCell>
              <HeaderCell>Period</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {components.map((c: Component, i: number) => (
              <tr
                key={c.strategyId}
                style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
              >
                <Cell>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: TEXT }}>{c.label}</span>
                </Cell>
                <Cell mono>
                  <span style={{ color: "#60a5fa" }}>{c.ibkrSymbol}</span>
                </Cell>
                <Cell mono muted>
                  {c.exchange}
                </Cell>
                <Cell right mono>
                  {c.multiplier >= 1000
                    ? c.multiplier.toLocaleString()
                    : c.multiplier}
                </Cell>
                <Cell mono muted>
                  {c.currency}
                </Cell>
                <Cell right mono>
                  {c.portfolioWeightPct}%
                </Cell>
                <Cell>
                  <StatusBadge status={c.dataStatus} />
                </Cell>
                <Cell right mono>
                  {c.backtestTradeCount != null ? c.backtestTradeCount.toLocaleString() : "—"}
                </Cell>
                <Cell muted>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10 }}>
                    {c.backtestStartDate ?? "—"}
                    {c.backtestStartDate && c.backtestEndDate ? " → " + c.backtestEndDate.slice(0, 4) : ""}
                  </span>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Data integrity notice */}
      <div
        style={{
          margin: "18px 20px 0",
          padding: "10px 14px",
          background: "rgba(234,179,8,0.06)",
          border: "1px solid rgba(234,179,8,0.18)",
          borderRadius: 6,
          fontFamily: FONT_UI,
          fontSize: 11,
          color: MUTED,
          maxWidth: 820,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: TEXT }}>Data Integrity: </strong>
        {dataIntegrityStatement}
      </div>

      {/* CSV downloads */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "16px 20px 0",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Serkan Export (Daily Returns)", file: "White_Swan_Daily_Returns_2008_2026.csv" },
          { label: "Activity Detail", file: "White_Swan_Daily_Activity_2008_2026.csv" },
          { label: "Component Audit", file: "White_Swan_Futures_Component_Audit.csv" },
        ].map((d) => (
          <a
            key={d.file}
            href={`/data/white-swan/${d.file}`}
            download
            style={{
              fontFamily: FONT_UI,
              fontSize: 11,
              color: "#60a5fa",
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.2)",
              borderRadius: 5,
              padding: "5px 12px",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            ↓ {d.label}
          </a>
        ))}
      </div>
    </div>
  );
}
