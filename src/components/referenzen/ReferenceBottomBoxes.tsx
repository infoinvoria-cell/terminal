"use client";

import { useState } from "react";
import Image from "next/image";

// ── Fonts — identical to other Referenz charts ────────────────────────────────
const MONITO     = "var(--font-numbers, 'Nunito', sans-serif)";
const MONTSERRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";

// ── Shared card aesthetic — same gradient as KPI cards ───────────────────────
const BOX: React.CSSProperties = {
  background: "linear-gradient(to bottom, #26262d, #111114)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.055)",
  overflow: "hidden",
  position: "relative",
  flexShrink: 0,
};

const KPI_BG = "linear-gradient(to bottom, #26262d, #111114)";
const GOLD   = "#D6B24A";

// ── Header style — exactly matches Equity Curve ───────────────────────────────
const HEADER_SPAN: React.CSSProperties = {
  color: "#f5f7fa",
  fontSize: 12.5,
  fontWeight: 700,
  fontFamily: MONTSERRAT,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

// ── Toggle — light variant identical to ReferenzenControls ────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => (e.key === " " || e.key === "Enter") && onChange()}
      style={{
        width: 36, height: 20, borderRadius: 999, cursor: "pointer", flexShrink: 0,
        background: on ? "#8B8B92" : "#40414a",
        border: `1.5px solid ${on ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)"}`,
        position: "relative", transition: "background 160ms, border-color 160ms",
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: "50%",
        background: on ? "#ECECEC" : "#6a6b73",
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        left: on ? "calc(100% - 17px)" : 2,
        transition: "left 160ms, background 160ms",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
      }} />
    </div>
  );
}

// ── Stepper — 1 % steps, white Referenz-style buttons ────────────────────────
const STEP_BTN: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 999, cursor: "pointer", flexShrink: 0,
  background: KPI_BG, border: "1.5px solid rgba(255,255,255,0.28)",
  color: "#d0d4dc", fontSize: 12, fontFamily: MONITO, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
  transition: "border-color 160ms",
};

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <button style={STEP_BTN}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.44)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)")}
        onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span style={{
        fontFamily: MONITO, fontSize: 12, fontWeight: 700, color: "#F0F2F6",
        minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums",
      }}>{value}%</span>
      <button style={STEP_BTN}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.44)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)")}
        onClick={() => onChange(Math.min(100, value + 1))}>+</button>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

const STATS: { label: string; value: string; risk: boolean }[] = [
  { label: "Trades",     value: "847",    risk: false },
  { label: "Win Rate",   value: "58.3%",  risk: false },
  { label: "Avg Return", value: "+1.24%", risk: false },
  { label: "Sharpe",     value: "1.47",   risk: false },
  { label: "Max DD",     value: "−12.8%", risk: true  },
  { label: "Exposure",   value: "34%",    risk: true  },
  { label: "CAGR",       value: "+6.3%",  risk: false },
];

export function OverviewBox({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ ...BOX, ...style, display: "flex", flexDirection: "column" }}>
      {/* Header — identical padding/style to Equity Curve */}
      <div style={{ flexShrink: 0, padding: "10px 16px 6px" }}>
        <span style={HEADER_SPAN}>Overview</span>
      </div>

      {/* Stats rows */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        justifyContent: "space-evenly", padding: "0 16px 8px",
      }}>
        {STATS.map(s => (
          <div key={s.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.032)",
            paddingTop: 5, paddingBottom: 5,
          }}>
            <span style={{ fontSize: 12, color: "rgba(180,192,210,0.58)", fontFamily: MONTSERRAT, lineHeight: 1 }}>
              {s.label}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700, lineHeight: 1,
              color: s.risk ? GOLD : "#F0F2F6",
              fontFamily: MONITO, fontVariantNumeric: "tabular-nums",
            }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Assets ────────────────────────────────────────────────────────────────────

type Control = "toggle" | "weight";
interface Asset {
  symbol: string; name: string; exchange: string;
  icon: string; control: Control;
  defaultOn?: boolean; defaultWeight?: number;
}

const ASSETS: Asset[] = [
  { symbol: "GC1!",   name: "Gold",      exchange: "COMEX", icon: "/asset-icons/gold.png",      control: "weight", defaultWeight: 25 },
  { symbol: "SI1!",   name: "Silver",    exchange: "COMEX", icon: "/asset-icons/silver.png",    control: "toggle", defaultOn: true  },
  { symbol: "EURUSD", name: "EUR/USD",   exchange: "Forex", icon: "/asset-icons/eurusd.png",    control: "weight", defaultWeight: 15 },
  { symbol: "DE40",   name: "DAX",       exchange: "Xetra", icon: "/asset-icons/dax.png",       control: "toggle", defaultOn: false },
  { symbol: "CL1!",   name: "Crude Oil", exchange: "NYMEX", icon: "/asset-icons/crude_oil.png", control: "toggle", defaultOn: true  },
  { symbol: "ZW1!",   name: "Wheat",     exchange: "CBOT",  icon: "/asset-icons/wheat.webp",    control: "weight", defaultWeight: 10 },
  { symbol: "ZC1!",   name: "Corn",      exchange: "CBOT",  icon: "/asset-icons/corn.png",      control: "toggle", defaultOn: false },
  { symbol: "KC1!",   name: "Coffee",    exchange: "ICE",   icon: "/asset-icons/coffee.png",    control: "toggle", defaultOn: true  },
  { symbol: "CC1!",   name: "Cocoa",     exchange: "ICE",   icon: "/asset-icons/cocoa.png",     control: "weight", defaultWeight: 5  },
  { symbol: "SB1!",   name: "Sugar",     exchange: "ICE",   icon: "/asset-icons/sugar.png",     control: "toggle", defaultOn: false },
  { symbol: "ZS1!",   name: "Soybeans",  exchange: "CBOT",  icon: "/asset-icons/soybeans.png",  control: "toggle", defaultOn: true  },
];

const SCROLL_CSS = `
  .assets-scroll { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .assets-scroll::-webkit-scrollbar { display: none; }
`;

export function AssetsBox({ style }: { style?: React.CSSProperties }) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(ASSETS.filter(a => a.control === "toggle").map(a => [a.symbol, a.defaultOn ?? false]))
  );
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(ASSETS.filter(a => a.control === "weight").map(a => [a.symbol, a.defaultWeight ?? 10]))
  );
  const [scrolled, setScrolled] = useState(false);

  return (
    <div style={{ ...BOX, ...style, display: "flex", flexDirection: "column" }}>
      <style dangerouslySetInnerHTML={{ __html: SCROLL_CSS }} />

      {/* Header — identical padding/style to Equity Curve */}
      <div style={{ flexShrink: 0, padding: "10px 16px 6px" }}>
        <span style={HEADER_SPAN}>Assets</span>
      </div>

      {/* Scrollable list + fade */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div className="assets-scroll" style={{ height: "100%", padding: "0 14px 36px" }}
          onScroll={e => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 4)}
        >
          {ASSETS.map(a => (
            <div key={a.symbol} style={{
              display: "flex", alignItems: "center", gap: 7,
              borderBottom: "1px solid rgba(255,255,255,0.032)",
              paddingTop: 10, paddingBottom: 10, minHeight: 32,
            }}>
              {/* Icon */}
              <div style={{
                width: 20, height: 20, borderRadius: "50%", overflow: "hidden",
                flexShrink: 0, background: "rgba(255,255,255,0.06)",
              }}>
                <Image
                  src={a.icon} alt={a.name} width={20} height={20}
                  style={{ objectFit: "cover", borderRadius: "50%", display: "block" }}
                />
              </div>

              {/* Symbol + Name · Exchange — single line, truncate if needed */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 5, overflow: "hidden" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#e8eaf0",
                  fontFamily: MONTSERRAT, lineHeight: 1, flexShrink: 0,
                }}>
                  {a.symbol}
                </span>
                <span style={{
                  fontSize: 10.5, color: "rgba(180,192,210,0.45)",
                  fontFamily: MONTSERRAT, lineHeight: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {a.name} · {a.exchange}
                </span>
              </div>

              {/* Control */}
              {a.control === "toggle" ? (
                <Toggle
                  on={toggles[a.symbol] ?? false}
                  onChange={() => setToggles(t => ({ ...t, [a.symbol]: !t[a.symbol] }))}
                />
              ) : (
                <Stepper
                  value={weights[a.symbol] ?? 10}
                  onChange={v => setWeights(w => ({ ...w, [a.symbol]: v }))}
                />
              )}
            </div>
          ))}
        </div>

        {/* Top fade — visible only after scrolling, so header is always shown above it */}
        {scrolled && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 36,
            background: "linear-gradient(to bottom, #26262d, transparent)",
            pointerEvents: "none",
          }} />
        )}

        {/* Bottom fade — pointer-events: none, matches card background */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
          background: "linear-gradient(to bottom, transparent, #111114)",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}
