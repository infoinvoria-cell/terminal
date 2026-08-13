"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ReferenceCandlestickChart } from "./ReferenceCandlestickChart";
import { ReferenzenControls } from "./ReferenzenControls";
import { OverviewBox, AssetsBox } from "./ReferenceBottomBoxes";
import type { PerformanceCurvePoint, DrawdownCurvePoint } from "@/lib/monitoring/types";

export type Phase = "All" | "Test" | "WF+OOS" | "Live";

const ReferenceEquityChart   = dynamic(() => import("./ReferenceEquityChart"),   { ssr: false });
const ReferenceDrawdownChart = dynamic(() => import("./ReferenceDrawdownChart"), { ssr: false });
const ReferenceBarChart      = dynamic(() => import("./ReferenceBarChart"),      { ssr: false });

// ─── Deterministic PRNG ────────────────────────────────────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
    s ^= s >>> 15;
    return (s >>> 0) / 0xffffffff;
  };
}

function buildRefPerformance(): PerformanceCurvePoint[] {
  const rand = makePrng(0xc0ffee42);
  const startMs = Date.UTC(2000, 0, 3);
  const endMs = Date.UTC(2026, 5, 30);
  const points: PerformanceCurvePoint[] = [];
  let cumulative = 0;
  let calMs = startMs;
  let i = 0;
  while (calMs <= endMs) {
    const d = new Date(calMs);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      const dateStr = d.toISOString().slice(0, 10);
      let drift: number;
      if (dateStr < "2008-01-01") {
        drift = 0.025 + Math.sin(i * 0.09) * 0.04 + (rand() - 0.47) * 0.35;
      } else if (dateStr < "2025-01-01") {
        const crisis2008 = dateStr >= "2008-09-01" && dateStr <= "2009-03-01" ? -0.18 : 0;
        const covid2020 = dateStr >= "2020-02-20" && dateStr <= "2020-04-01" ? -0.12 : 0;
        drift = 0.055 + crisis2008 + covid2020 + Math.sin(i * 0.07) * 0.02 + (rand() - 0.46) * 0.32;
      } else {
        drift = 0.065 + Math.sin(i * 0.05) * 0.02 + (rand() - 0.45) * 0.28;
      }
      cumulative += drift;
      points.push({ time: dateStr, value: Math.round(cumulative * 100) / 100 });
      i++;
    }
    calMs += 86_400_000;
  }
  return points;
}

function buildRefDrawdown(perf: PerformanceCurvePoint[]): DrawdownCurvePoint[] {
  let peak = 0;
  return perf.map((p) => {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? ((p.value - peak) / (peak + 0.001)) * 100 : 0;
    return { time: p.time, value: Math.round(Math.min(dd, 0) * 100) / 100 };
  });
}

// ─── Shared styles ──────────────────────────────────────────────────────────
const BOX: React.CSSProperties = {
  background: "linear-gradient(to bottom, #17171b, #0b0b0e)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.055)",
  overflow: "hidden",
  position: "relative",
  flexShrink: 0,
};

const MONITO    = "var(--font-numbers, 'Nunito', sans-serif)";
const MONTSRRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const GOLD      = "#D6B24A";

function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  extra,
  flexGrow = 1,
}: {
  label: string;
  value: string;
  extra?: string;
  flexGrow?: number;
}) {
  return (
    <div
      style={{
        flex: `${flexGrow} 1 0`,
        minWidth: 0,
        height: 84,
        padding: "11px 14px 12px",
        boxSizing: "border-box",
        // same BOX aesthetic as chart containers
        background: "linear-gradient(to bottom, #26262d, #111114)",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.055)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Title — top left */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "none",
          color: "rgba(180,192,210,0.6)",
          fontFamily: MONTSRRAT,
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        {label}
      </span>

      {/* Bottom row — value left, extra right */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 4 }}>
        <strong
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            color: "#F0F2F6",
            fontFamily: MONITO,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </strong>
        {extra && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: GOLD,
              fontFamily: MONITO,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              paddingBottom: 2,
            }}
          >
            {extra}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export function ReferenzenPage() {
  const [phase, setPhase] = useState<Phase>("All");
  const perfData = useMemo(() => buildRefPerformance(), []);
  const ddData   = useMemo(() => buildRefDrawdown(perfData), [perfData]);

  const totalReturn = perfData[perfData.length - 1]?.value ?? 0;
  const maxDD       = Math.min(...ddData.map((d) => d.value));
  const avgDD       =
    ddData.filter((d) => d.value < 0).reduce((s, d) => s + d.value, 0) /
    Math.max(ddData.filter((d) => d.value < 0).length, 1);
  const cagr        = Math.round(((Math.pow(1 + totalReturn / 100, 1 / 26) - 1) * 100) * 10) / 10;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        padding: "16px 28px 16px 28px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Two-column flex — fills all available height, no overflow */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20, alignItems: "stretch" }}>

        {/* ── Left: chart column ─────────────────────────────────────────── */}
        <div
          data-testid="referenzen-signal-chart"
          style={{
            width: "60%",
            minWidth: 520,
            maxWidth: 1100,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ ...BOX, flex: "0 0 390px" }}>
            <ReferenceCandlestickChart />
          </div>

          <div style={{ ...BOX, flex: "0 0 240px" }}>
            <ReferenceEquityChart
              data={perfData}
              totalReturnPercent={totalReturn}
              cagr={cagr}
              phase={phase}
              onPhaseChange={setPhase}
            />
          </div>

          <div style={{ ...BOX, flex: "0 0 240px" }}>
            <ReferenceDrawdownChart
              data={ddData}
              maxDrawdownPercent={Math.abs(maxDD)}
              avgDrawdownPercent={Math.abs(avgDD)}
              phase={phase}
              onPhaseChange={setPhase}
            />
          </div>
        </div>

        {/* ── Right column: constrained to available height, no overflow ──── */}
        <div style={{
          flex: 1, minWidth: 180, overflow: "hidden",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Top: KPI cards + Controls — fixed height to align Bar Chart with Equity Curve */}
          {/* Left: candlestick 390px + gap 16 = 406. Right gap = 14 → top must be 392px */}
          <div style={{ flex: "0 0 392px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <KpiCard label="Total Return" value={fmtPct(totalReturn)} flexGrow={6} />
              <KpiCard label="CAGR p.a."   value={fmtPct(cagr)} extra="+1.2%" flexGrow={5} />
              <KpiCard label="Max Drawdown" value={fmtPct(maxDD, 1)} flexGrow={4} />
            </div>
            <ReferenzenControls />
          </div>

          {/* Bar chart — same height as Equity Curve and Drawdown */}
          <div style={{ ...BOX, flex: "0 0 240px" }}>
            <ReferenceBarChart />
          </div>

          {/* Bottom row: Overview + Assets */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: 280, display: "flex", gap: 14 }}>
            <OverviewBox style={{ flex: 1, minWidth: 0 }} />
            <AssetsBox   style={{ flex: 1, minWidth: 0 }} />
          </div>
        </div>

      </div>
    </div>
  );
}
