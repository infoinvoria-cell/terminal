"use client";

import { X } from "lucide-react";
import { PARTNER_PROGRAM_CONFIG } from "@/lib/partner/partnerProgramConfig";

const CFG = PARTNER_PROGRAM_CONFIG;

// ── Tier visual styles ──────────────────────────────────────────────────────

const TC = {
  bronze: { fill: "#451a03", stroke: "#b45309", text: "#fbbf24" },
  silver: { fill: "#27272a", stroke: "#71717a", text: "#d4d4d8" },
  gold:   { fill: "#422006", stroke: "#c99e3e", text: "#C9A84C" },
  platin: { fill: "#0c2340", stroke: "#3b82f6", text: "#93c5fd" },
  black:  { fill: "#09090b", stroke: "#d4d4d8", text: "#f4f4f5" },
} as const;

const FONT_MONO = "'Geist Mono', 'JetBrains Mono', 'Fira Mono', monospace";
const GOLD = "#C9A84C";
const DIM  = "rgba(230,235,245,0.35)";

function fmt(n: number): string {
  if (n === 0) return "Einstieg";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("de-DE", { minimumFractionDigits: 0 })} Mio €`;
  return `${(n / 1_000).toLocaleString("de-DE")}k €`;
}

function Arrow({ x1, y1, x2, y2, gold }: { x1: number; y1: number; x2: number; y2: number; gold?: boolean }) {
  const id = `arr-${Math.round(x1)}-${Math.round(y1)}`;
  return (
    <>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,1 L9,5 L0,9 Z" fill={gold ? GOLD : "rgba(255,255,255,0.2)"} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={gold ? `${GOLD}88` : "rgba(255,255,255,0.15)"}
        strokeWidth={gold ? 1.5 : 1}
        markerEnd={`url(#${id})`}
      />
    </>
  );
}

function Box({
  x, y, w, h, label, sublabel, value, gold, muted,
}: {
  x: number; y: number; w: number; h: number;
  label: string; sublabel?: string; value?: string;
  gold?: boolean; muted?: boolean;
}) {
  const fill   = gold ? "rgba(113,63,18,0.4)" : muted ? "rgba(15,15,18,0.7)" : "rgba(28,30,34,0.85)";
  const stroke = gold ? `${GOLD}66` : muted ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.1)";
  const tColor = gold ? GOLD : muted ? DIM : "rgba(230,235,245,0.85)";

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 - (value ? 8 : 2)} textAnchor="middle" fill={tColor}
        fontSize={10} fontWeight={700} letterSpacing={1.5} fontFamily={FONT_MONO}>
        {label.toUpperCase()}
      </text>
      {sublabel && (
        <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" fill={tColor}
          fontSize={11} fontWeight={500} fontFamily={FONT_MONO}>
          {sublabel}
        </text>
      )}
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 24} textAnchor="middle" fill={gold ? GOLD : DIM}
          fontSize={9} fontFamily={FONT_MONO}>
          {value}
        </text>
      )}
    </g>
  );
}

// ── Main SVG ────────────────────────────────────────────────────────────────

function WhiteboardSVG() {
  const tiers = CFG.tiers;
  const W = 1100;
  const H = 820;

  // Layout constants
  const CX = 550;
  const BOX_W = 340;

  // Row Y positions
  const R1y = 60;   // Investorengewinn
  const R2y = 185;  // Performance Fee
  const R3y = 310;  // InnoInvest + CL Anteil (split)
  const R4y = 435;  // Partner label row
  const R5y = 460;  // Tier boxes
  const DIVIDER_Y = 572;
  const R6y = 596;  // AP + Mgmt Fee

  const BOX_H = 64;
  const SPLIT_H = 60;

  // Tier box layout (5 tiers spread across full width)
  const TIER_W = 176;
  const TIER_H = 74;
  const TIER_GAP = 16;
  const TIER_TOTAL = tiers.length * TIER_W + (tiers.length - 1) * TIER_GAP;
  const TIER_START = (W - TIER_TOTAL) / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: 1100, maxHeight: "100%" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background grid */}
      <defs>
        <pattern id="wbgrid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M44 0L0 0 0 44" fill="none" stroke="rgba(255,255,255,0.028)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="rgba(10,11,14,0.98)" />
      <rect width={W} height={H} fill="url(#wbgrid)" />

      {/* ── SECTION HEADER ─────────────────────────────────────── */}
      <text x={30} y={34} fill={`${GOLD}99`} fontSize={9} fontWeight={700}
        letterSpacing={3} fontFamily={FONT_MONO}>
        PERFORMANCE-FEE — ABLAUF
      </text>
      <line x1={30} y1={41} x2={W - 30} y2={41} stroke="rgba(226,202,122,0.12)" strokeWidth={0.5} />

      {/* ── ROW 1: Investorengewinn ─────────────────────────────── */}
      <Box x={CX - BOX_W / 2} y={R1y} w={BOX_W} h={BOX_H}
        label="Investorengewinn" sublabel="Ausgangsbasis · 100%" />

      {/* Arrow R1→R2 */}
      <Arrow x1={CX} y1={R1y + BOX_H} x2={CX} y2={R2y - 6} gold />

      {/* ── ROW 2: Performance Fee ─────────────────────────────── */}
      <Box x={CX - BOX_W / 2} y={R2y} w={BOX_W} h={BOX_H}
        label="Performance Fee" sublabel="25 % des Gewinns" gold />

      {/* Arrow R2→split */}
      <line x1={CX} y1={R2y + BOX_H} x2={CX} y2={R2y + BOX_H + 20}
        stroke={`${GOLD}88`} strokeWidth={1.5} />
      {/* Horizontal split bar */}
      <line x1={155} y1={R2y + BOX_H + 20} x2={945} y2={R2y + BOX_H + 20}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

      {/* Arrow left → InnoInvest */}
      <Arrow x1={155} y1={R2y + BOX_H + 20} x2={155} y2={R3y - 6} />
      {/* Arrow right → CL Anteil */}
      <Arrow x1={945} y1={R2y + BOX_H + 20} x2={945} y2={R3y - 6} gold />

      {/* ── ROW 3: InnoInvest + CL Anteil ─────────────────────── */}
      <Box x={30} y={R3y} w={248} h={SPLIT_H}
        label="InnoInvest" sublabel="12,5 % der PF" muted />

      <Box x={820} y={R3y} w={248} h={SPLIT_H}
        label="CL Anteil" sublabel="87,5 % der PF" gold />

      {/* Arrow from CL Anteil → center */}
      <line x1={944} y1={R3y + SPLIT_H} x2={944} y2={R3y + SPLIT_H + 28}
        stroke={`${GOLD}88`} strokeWidth={1.5} />
      <line x1={CX} y1={R3y + SPLIT_H + 28} x2={944} y2={R3y + SPLIT_H + 28}
        stroke={`${GOLD}55`} strokeWidth={1} />
      <Arrow x1={CX} y1={R3y + SPLIT_H + 28} x2={CX} y2={R4y - 4} gold />

      {/* ── ROW 4: Partner section label ──────────────────────── */}
      <text x={CX} y={R4y + 10} textAnchor="middle" fill={`${GOLD}99`}
        fontSize={9} fontWeight={700} letterSpacing={3} fontFamily={FONT_MONO}>
        PARTNER-ANTEIL — NACH STUFE
      </text>

      {/* ── ROW 5: Tier boxes ──────────────────────────────────── */}
      {tiers.map((tier, i) => {
        const tx = TIER_START + i * (TIER_W + TIER_GAP);
        const tc = TC[tier.id as keyof typeof TC];
        const pct = Math.round(tier.clShareRate * 100);

        return (
          <g key={tier.id}>
            <rect x={tx} y={R5y} width={TIER_W} height={TIER_H} rx={8}
              fill={`${tc.fill}ee`} stroke={tc.stroke} strokeWidth={1.5} />
            <text x={tx + TIER_W / 2} y={R5y + 20} textAnchor="middle"
              fill={tc.text} fontSize={9.5} fontWeight={700} letterSpacing={2}
              fontFamily={FONT_MONO}>
              {tier.label.toUpperCase()}
            </text>
            <text x={tx + TIER_W / 2} y={R5y + 46} textAnchor="middle"
              fill={tc.text} fontSize={22} fontWeight={800}>
              {pct}%
            </text>
            <text x={tx + TIER_W / 2} y={R5y + 64} textAnchor="middle"
              fill={`${tc.text}80`} fontSize={8.5} fontFamily={FONT_MONO}>
              {fmt(tier.volThreshold)}
            </text>
          </g>
        );
      })}

      {/* Founder note */}
      <text x={CX} y={R5y + TIER_H + 18} textAnchor="middle"
        fill={`${GOLD}55`} fontSize={9} fontFamily={FONT_MONO}>
        ★ Founder-Partner: Schwellenwerte 50 % reduziert
      </text>

      {/* ── DIVIDER ────────────────────────────────────────────── */}
      <line x1={30} y1={DIVIDER_Y} x2={W - 30} y2={DIVIDER_Y}
        stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

      {/* ── LEFT BOTTOM: Abschlussprovision ───────────────────── */}
      <text x={32} y={R6y + 12} fill={`${GOLD}99`} fontSize={9} fontWeight={700}
        letterSpacing={3} fontFamily={FONT_MONO}>
        ABSCHLUSSPROVISION (AP)
      </text>
      <text x={32} y={R6y + 28} fill={DIM} fontSize={9.5} fontFamily={FONT_MONO}>
        Direkt auf den Investitionsbetrag · sofort bei Abschluss fällig
      </text>

      {/* AP rate boxes */}
      {CFG.apRates.map((ap, i) => {
        const bx = 32 + i * 200;
        const by = R6y + 44;
        return (
          <g key={ap.lockupYears}>
            <rect x={bx} y={by} width={182} height={100} rx={8}
              fill="rgba(20,22,28,0.85)" stroke={`${GOLD}44`} strokeWidth={1.5} />
            <text x={bx + 91} y={by + 22} textAnchor="middle"
              fill={`${GOLD}88`} fontSize={9} fontWeight={700}
              letterSpacing={2} fontFamily={FONT_MONO}>
              BINDUNG {ap.lockupYears} JAHR{ap.lockupYears > 1 ? "E" : ""}
            </text>
            <text x={bx + 91} y={by + 58} textAnchor="middle"
              fill={GOLD} fontSize={28} fontWeight={800}>
              {(ap.rate * 100).toFixed(1)}%
            </text>
            <text x={bx + 91} y={by + 78} textAnchor="middle"
              fill={DIM} fontSize={9} fontFamily={FONT_MONO}>
              des Investitionsbetrags
            </text>
            <text x={bx + 91} y={by + 93} textAnchor="middle"
              fill={`${GOLD}66`} fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
              = {(ap.rate * 100_000 / 100).toLocaleString("de-DE")} € / 100k
            </text>
          </g>
        );
      })}

      {/* ── RIGHT BOTTOM: Verwaltungsgebühr ───────────────────── */}
      <text x={690} y={R6y + 12} fill={`${GOLD}99`} fontSize={9} fontWeight={700}
        letterSpacing={3} fontFamily={FONT_MONO}>
        VERWALTUNGSGEBÜHR (MGMT FEE)
      </text>

      <rect x={690} y={R6y + 24} width={380} height={166} rx={8}
        fill="rgba(20,22,28,0.85)" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

      {/* Fee row */}
      <text x={710} y={R6y + 48} fill="rgba(230,235,245,0.75)" fontSize={11} fontWeight={600}>
        3,0 % p.a. auf AUM
      </text>
      <line x1={710} y1={R6y + 56} x2={1050} y2={R6y + 56}
        stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

      <text x={710} y={R6y + 74} fill={DIM} fontSize={9.5} fontFamily={FONT_MONO}>
        InnoInvest (Haftungsdach)
      </text>
      <text x={1050} y={R6y + 74} textAnchor="end"
        fill={DIM} fontSize={9.5} fontFamily={FONT_MONO}>
        12,5 %
      </text>

      <text x={710} y={R6y + 90} fill={`${GOLD}cc`} fontSize={9.5} fontFamily={FONT_MONO}>
        Capitalife Anteil
      </text>
      <text x={1050} y={R6y + 90} textAnchor="end"
        fill={`${GOLD}cc`} fontSize={9.5} fontFamily={FONT_MONO}>
        87,5 %
      </text>
      <line x1={710} y1={R6y + 98} x2={1050} y2={R6y + 98}
        stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

      {/* Mgmt fee note for Platin/Black */}
      <rect x={710} y={R6y + 106} width={350} height={36} rx={5}
        fill={`${GOLD}11`} stroke={`${GOLD}30`} strokeWidth={1} />
      <text x={720} y={R6y + 121} fill={`${GOLD}cc`} fontSize={9} fontWeight={700}
        letterSpacing={1.5} fontFamily={FONT_MONO}>
        PLATIN / BLACK
      </text>
      <text x={720} y={R6y + 136} fill={`${GOLD}88`} fontSize={9} fontFamily={FONT_MONO}>
        Mögliche Beteiligung · gemäß Partnervereinbarung (TBD)
      </text>

      <text x={710} y={R6y + 164} fill="rgba(255,255,255,0.2)" fontSize={9} fontFamily={FONT_MONO}>
        Finanziert u.a. Betrieb und Abschlussprovisionen
      </text>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <text x={CX} y={H - 10} textAnchor="middle"
        fill="rgba(255,255,255,0.12)" fontSize={8} fontFamily={FONT_MONO}>
        Capitalife Terminal · Partnerprogramm · Strukturmodell · Stand 2026 · Angaben vorbehaltlich finaler Vereinbarung
      </text>
    </svg>
  );
}

// ── Modal root ───────────────────────────────────────────────────────────────

export function PartnerWhiteboardModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,9,12,0.97)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{
            color: "#C9A84C", fontSize: 9.5, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            fontFamily: FONT_MONO,
          }}>
            Capitalife Partnerprogramm
          </div>
          <div style={{ color: "rgba(230,235,245,0.9)", fontSize: 17, fontWeight: 700, marginTop: 1 }}>
            Strukturmodell — Vollbild
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            color: "rgba(230,235,245,0.45)", cursor: "pointer",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "6px 10px",
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12,
          }}
        >
          <X size={14} />
          Schließen
        </button>
      </div>

      {/* Diagram area */}
      <div
        style={{
          flex: 1, overflow: "auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <WhiteboardSVG />
      </div>
    </div>
  );
}
