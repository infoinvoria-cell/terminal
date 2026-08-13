"use client";

import React, { useState } from "react";

const MONTSERRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";

// ── Active bg = exactly KPI card ──────────────────────────────────────────────
const KPI_BG  = "linear-gradient(to bottom, #26262d, #111114)";
const KPI_BOR = "rgba(255,255,255,0.055)";

// ── Global CSS injected once ──────────────────────────────────────────────────
const CSS = `
  .rc-pill {
    border-radius: 999px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
    outline: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rc-pill:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }

  .rc-active {
    background: ${KPI_BG};
    border: 1.5px solid rgba(255,255,255,0.28);
  }
  .rc-active:hover { border-color: rgba(255,255,255,0.42); }

  .rc-inactive {
    background: transparent;
    border: 1.5px solid transparent;
  }
  .rc-inactive:hover {
    background: ${KPI_BG};
    border-color: rgba(255,255,255,0.18);
  }

  .rc-toggle { cursor: pointer; transition: background 160ms ease; border-radius: 999px; }
  .rc-toggle:hover { filter: brightness(1.12); }
  .rc-toggle:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 3px; border-radius: 999px; }

  /* ── Icon-only circle buttons ── */
  .rc-icon-btn {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; border: 1.5px solid transparent;
    transition: background 160ms ease, border-color 160ms ease;
    outline: none; flex-shrink: 0;
  }
  .rc-icon-btn:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }

  .rc-icon-active {
    background: ${KPI_BG};
    border-color: rgba(255,255,255,0.28);
  }
  .rc-icon-active:hover { border-color: rgba(255,255,255,0.44); }

  .rc-icon-inactive {
    background: transparent;
    border-color: transparent;
  }
  .rc-icon-inactive:hover {
    background: ${KPI_BG};
    border-color: rgba(255,255,255,0.18);
  }
`;

function InjectCSS() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

// ── Toggle ────────────────────────────────────────────────────────────────────
type ToggleVariant = "dark" | "light" | "gold";

const TOGGLE_COLORS: Record<ToggleVariant, {
  offTrack: string; offKnob: string; offBorder: string;
  onTrack: string;  onKnob: string;  onBorder: string;
}> = {
  dark:  { offTrack: "#1e1f26", offKnob: "#44454f", offBorder: "rgba(255,255,255,0.10)",
            onTrack:  "#36373f", onKnob:  "#8c8d96", onBorder:  "rgba(255,255,255,0.22)" },
  light: { offTrack: "#40414a", offKnob: "#6a6b73", offBorder: "rgba(255,255,255,0.18)",
            onTrack:  "#8B8B92", onKnob:  "#ECECEC", onBorder:  "rgba(255,255,255,0.38)" },
  gold:  { offTrack: "#2e2a1a", offKnob: "#5a5030", offBorder: "rgba(255,255,255,0.12)",
            onTrack:  "#6E6032", onKnob:  "#D4B24D", onBorder:  "rgba(255,255,255,0.22)" },
};

function Toggle({ variant, on, onToggle }: { variant: ToggleVariant; on: boolean; onToggle: () => void }) {
  const c = TOGGLE_COLORS[variant];
  const track  = on ? c.onTrack  : c.offTrack;
  const knob   = on ? c.onKnob   : c.offKnob;
  const border = on ? c.onBorder : c.offBorder;
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle()}
      className="rc-toggle"
      style={{ width: 46, height: 26, background: track, border: `1.5px solid ${border}`, position: "relative", flexShrink: 0 }}
    >
      <div style={{
        width: 19, height: 19, borderRadius: "50%", background: knob,
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        left: on ? "calc(100% - 22px)" : 3,
        transition: "left 160ms ease, background 160ms ease",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
      }} />
    </div>
  );
}

// ── Pill button ───────────────────────────────────────────────────────────────
function Pill({
  active, label, icon, padding, fontSize, fontWeight, onClick,
  role = "tab",
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  padding?: string;
  fontSize?: number;
  fontWeight?: number;
  onClick: () => void;
  role?: string;
}) {
  return (
    <button
      role={role}
      aria-pressed={role === "tab" ? undefined : active}
      aria-selected={role === "tab" ? active : undefined}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onClick()}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{
        padding: padding ?? "8px 22px",
        fontFamily: MONTSERRAT,
      }}
    >
      {icon}
      <span style={{
        fontSize: fontSize ?? 17,
        fontWeight: fontWeight ?? (active ? 600 : 400),
        color: active ? "#F3F3F4" : "#6a6e7a",
        lineHeight: 1,
        whiteSpace: "nowrap",
        fontFamily: MONTSERRAT,
        letterSpacing: "0.01em",
      }}>
        {label}
      </span>
    </button>
  );
}

// ── Segment pill (time / mode) ────────────────────────────────────────────────
function Seg({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onClick()}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{ padding: "7px 16px", minWidth: 44 }}
    >
      <span style={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "#F3F3F4" : "#5a5e6a",
        fontFamily: MONTSERRAT,
        lineHeight: 1,
      }}>
        {label}
      </span>
    </button>
  );
}

function VDivider() {
  return <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.18)", borderRadius: 1, marginInline: 2, alignSelf: "center", flexShrink: 0 }} />;
}

// ── Icon circle button ────────────────────────────────────────────────────────
function IconBtn({ active, icon, onClick, label }: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rc-icon-btn ${active ? "rc-icon-active" : "rc-icon-inactive"}`}
    >
      {icon}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcoStar({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <polygon points="7,1.5 8.6,5.2 12.5,5.6 9.7,8.1 10.6,12 7,9.9 3.4,12 4.3,8.1 1.5,5.6 5.4,5.2"
        stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function IcoFilter({ color }: { color: string }) {
  return (
    <svg width="14" height="13" viewBox="0 0 14 13" fill="none" style={{ flexShrink: 0 }}>
      <line x1="1" y1="2"  x2="13" y2="2"  stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="3" y1="6"  x2="11" y2="6"  stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5" y1="10" x2="9"  y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IcoPerf({ color }: { color: string }) {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" style={{ flexShrink: 0 }}>
      <polyline points="1,11 4,6 7.5,8 11,2.5 14,4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoTrades({ color }: { color: string }) {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none" style={{ flexShrink: 0 }}>
      <line x1="6.5" y1="1.5" x2="6.5" y2="6.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <polyline points="4,4.5 6.5,1.5 9,4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6.5" y1="8.5" x2="6.5" y2="13.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <polyline points="4,10.5 6.5,13.5 9,10.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoDetails({ color }: { color: string }) {
  return (
    <svg width="15" height="12" viewBox="0 0 15 12" fill="none" style={{ flexShrink: 0 }}>
      <line x1="1" y1="1"  x2="14" y2="1"  stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="1" y1="6"  x2="14" y2="6"  stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="1" y1="11" x2="14" y2="11" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type TimeOpt = "1D" | "1W" | "1M" | "1Y";
type ModeOpt = "Line" | "Bar" | "Table";
type TextTab = "Performance" | "Trades" | "Details";

export function ReferenzenControls() {
  const [toggleLight, setToggleLight] = useState(true);
  const [toggleGold,  setToggleGold]  = useState(true);
  const [iconStar,    setIconStar]    = useState(true);
  const [iconFilter,  setIconFilter]  = useState(false);

  const [textTab,  setTextTab]  = useState<TextTab>("Performance");
  const [iconTab,  setIconTab]  = useState<TextTab>("Performance");
  const [timeOpt,  setTimeOpt]  = useState<TimeOpt>("1W");
  const [modeOpt,  setModeOpt]  = useState<ModeOpt>("Line");

  const TABS: TextTab[] = ["Performance", "Trades", "Details"];
  const TIMES: TimeOpt[] = ["1D", "1W", "1M", "1Y"];
  const MODES: ModeOpt[] = ["Line", "Bar", "Table"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36, paddingTop: 28 }}>
      <InjectCSS />

      {/* 1 — Toggle Row + Icon Buttons */}
      <div role="group" aria-label="Toggle switches" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Toggle variant="light" on={toggleLight} onToggle={() => setToggleLight(v => !v)} />
        <Toggle variant="gold"  on={toggleGold}  onToggle={() => setToggleGold(v => !v)} />
        <div style={{ display: "flex", gap: 4, marginLeft: 20 }}>
          <IconBtn
            active={iconStar}
            label="Star"
            icon={<IcoStar color={iconStar ? "#F3F3F4" : "#6a6e7a"} />}
            onClick={() => setIconStar(v => !v)}
          />
          <IconBtn
            active={iconFilter}
            label="Filter"
            icon={<IcoFilter color={iconFilter ? "#F3F3F4" : "#6a6e7a"} />}
            onClick={() => setIconFilter(v => !v)}
          />
        </div>
      </div>

      {/* 2 — Text Tab Row */}
      <div role="tablist" aria-label="Text tabs" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {TABS.map((t) => (
          <Pill key={t} role="tab" active={textTab === t} label={t} onClick={() => setTextTab(t)} />
        ))}
      </div>

      {/* 3 — Icon Tab Row */}
      <div role="tablist" aria-label="Icon tabs" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {TABS.map((t) => {
          const act = iconTab === t;
          const col = act ? "#F3F3F4" : "#6a6e7a";
          const ico =
            t === "Performance" ? <IcoPerf color={col} /> :
            t === "Trades"      ? <IcoTrades color={col} /> :
                                  <IcoDetails color={col} />;
          return (
            <Pill key={t} role="tab" active={act} label={t} icon={ico} onClick={() => setIconTab(t)} />
          );
        })}
      </div>

      {/* 4 — Time + Divider + Mode */}
      <div role="group" aria-label="Time and mode" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {TIMES.map((t) => <Seg key={t} label={t} active={timeOpt === t} onClick={() => setTimeOpt(t)} />)}
        <VDivider />
        {MODES.map((m) => <Seg key={m} label={m} active={modeOpt === m} onClick={() => setModeOpt(m)} />)}
      </div>
    </div>
  );
}
