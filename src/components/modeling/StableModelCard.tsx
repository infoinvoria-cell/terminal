"use client";

import { useState, useCallback } from "react";
import { BOX_STYLE, FONT_LABEL, MC_COLORS } from "@/lib/modeling/colors";
import type { ModelInfoContent, InfoLang } from "@/lib/modeling/model-info";
import type { ViewDimension } from "./ViewTemplates";

export type { ViewDimension };

// ─── Constants ────────────────────────────────────────────────────────────────

const HEADER_H = 34;

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  infoBar:    "rgba(255,255,255,0.028)",
  infoBorder: "rgba(255,255,255,0.06)",
  iconColor:  "rgba(165,165,165,0.60)",
  labelColor: "rgba(122,122,122,0.70)",
  valueColor: "rgba(210,210,210,0.78)",
  mathColor:  "rgba(201,168,76,0.72)",
  langActive: "rgba(232,232,232,0.90)",
  langInactive:"rgba(100,100,100,0.55)",
} as const;

const INFO_ICONS: Record<string, string> = {
  PURPOSE:        "◎",
  DATA:           "▦",
  METHOD:         "∑",
  MATH:           "ƒx",
  INTERPRETATION: "◇",
  SOURCE:         "⌁",
};

// ─── 2D/3D resolve ────────────────────────────────────────────────────────────

function shouldUse3D(dimension: ViewDimension, has3D: boolean, localOverride: boolean | null): boolean {
  if (!has3D) return false;
  if (localOverride !== null) return localOverride;
  switch (dimension) {
    case "ALL_2D":       return false;
    case "2D_FIRST":     return false;
    case "3D_PREFERRED": return true;
    case "3D_SHOWCASE":  return true;
  }
}

// ─── Info section ─────────────────────────────────────────────────────────────

function InfoSection({
  info, lang, onLangChange, onClose,
}: {
  info: ModelInfoContent;
  lang: InfoLang;
  onLangChange: (l: InfoLang) => void;
  onClose: () => void;
}) {
  const rows: Array<{ key: string; value: string }> = [
    { key: "PURPOSE",        value: info.purpose[lang] },
    { key: "DATA",           value: info.data },
    { key: "METHOD",         value: info.method[lang] },
    { key: "MATH",           value: info.math },
    { key: "INTERPRETATION", value: info.interpretation[lang] },
    ...(info.source ? [{ key: "SOURCE", value: info.source }] : []),
  ];

  return (
    <div style={{
      borderTop: `1px solid ${C.infoBorder}`,
      background: C.infoBar,
      padding: "10px 12px 14px",
      borderRadius: "0 0 10px 10px",
      flexShrink: 0,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{
          fontFamily: FONT_LABEL, fontSize: 7.5, fontWeight: 700,
          letterSpacing: "0.14em", color: C.labelColor, textTransform: "uppercase",
        }}>
          INFO
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* DE / EN toggle */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {(["de", "en"] as InfoLang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onLangChange(l)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontFamily: FONT_LABEL, fontSize: 8, fontWeight: lang === l ? 700 : 400,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  color: lang === l ? C.langActive : C.langInactive,
                  transition: "color 0.12s",
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "1px 4px",
              fontFamily: FONT_LABEL, fontSize: 9, color: C.labelColor,
              transition: "color 0.12s",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tiles — 2 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
        {rows.map(({ key, value }) => (
          <div key={key} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <span style={{
              fontFamily: FONT_LABEL, fontSize: 9, color: C.iconColor,
              flexShrink: 0, width: 16, paddingTop: 1, textAlign: "center",
            }}>
              {INFO_ICONS[key] ?? "·"}
            </span>
            <div>
              <div style={{
                fontFamily: FONT_LABEL, fontSize: 6.5, fontWeight: 700,
                letterSpacing: "0.12em", color: C.labelColor,
                textTransform: "uppercase", marginBottom: 2,
              }}>
                {key}
              </div>
              <div style={{
                fontFamily: FONT_LABEL, fontSize: 8.5, lineHeight: 1.5,
                letterSpacing: "0.01em",
                color: key === "MATH" ? C.mathColor : C.valueColor,
              }}>
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hover-zone button ─────────────────────────────────────────────────────────

function HoverBtn({
  side, children, onClick, active,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute", bottom: 6, [side]: 6,
        background: active
          ? "rgba(255,255,255,0.08)"
          : hov ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.018)",
        border: hov || active
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(255,255,255,0.04)",
        borderRadius: 5, padding: "3px 9px",
        color: active
          ? "rgba(230,230,230,0.92)"
          : hov ? "rgba(200,200,200,0.80)" : "rgba(100,100,100,0.45)",
        fontFamily: FONT_LABEL, fontSize: 8.5, fontWeight: 600,
        letterSpacing: "0.08em", cursor: "pointer",
        transition: "all 0.14s ease", zIndex: 8,
      }}
    >
      {children}
    </button>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  modelId: string;
  title: string;
  topRight?: React.ReactNode;
  /** Explicit pixel height. The chart area always fills height - HEADER_H. */
  height: number;
  is3DAvailable?: boolean;
  has3D?: boolean;
  render2D: () => React.ReactNode;
  render3D?: () => React.ReactNode;
  infoContent?: ModelInfoContent;
  /** View template dimension mode — controls 2D/3D default. */
  dimension?: ViewDimension;
};

// ─── Main card ─────────────────────────────────────────────────────────────────

export function StableModelCard({
  title,
  topRight,
  height,
  is3DAvailable = false,
  has3D,
  render2D,
  render3D,
  infoContent,
  dimension = "2D_FIRST",
}: Props) {
  const truly3D = has3D ?? (is3DAvailable && !!render3D);

  const [localOverride, setLocalOverride] = useState<boolean | null>(null);
  const [has3DBeenMounted, setHas3DBeenMounted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [lang, setLang] = useState<InfoLang>("en");
  const [chartHovered, setChartHovered] = useState(false);

  const is3D = shouldUse3D(dimension, truly3D, localOverride);

  const toggle3D = useCallback(() => {
    const next = !is3D;
    if (next && !has3DBeenMounted) setHas3DBeenMounted(true);
    setLocalOverride(next);
  }, [is3D, has3DBeenMounted]);

  // Chart height is always fixed — never changes when info opens.
  const chartH = height - HEADER_H;

  // Card: when info is closed, height is the explicit number.
  // When info is open, height becomes auto so the info section appends naturally.
  const cardStyle: React.CSSProperties = {
    ...BOX_STYLE,
    display: "flex",
    flexDirection: "column",
    // Override BOX_STYLE overflow:hidden so info can extend below.
    overflow: "visible",
    height: infoOpen ? "auto" : height,
    // Prevent the card from collapsing when height:auto in a flex context.
    minHeight: height,
  };

  return (
    <div style={cardStyle}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 10px", flexShrink: 0, height: HEADER_H,
        // Clip top corners only; let info section inherit bottom radius.
        borderRadius: infoOpen ? "10px 10px 0 0" : undefined,
        overflow: "hidden",
      }}>
        <span style={{
          fontFamily: FONT_LABEL, fontSize: 9, fontWeight: 700,
          letterSpacing: "0.14em", color: "rgba(175,175,175,0.65)",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
        {topRight && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {topRight}
          </div>
        )}
      </div>

      {/* ── Chart area — fixed height, never shrinks ── */}
      <div
        style={{
          flexShrink: 0,
          height: chartH,
          minHeight: Math.min(chartH, 100),
          padding: "2px 4px 4px",
          position: "relative",
          // Clip chart content at card edges.
          overflow: "hidden",
        }}
        onMouseEnter={() => setChartHovered(true)}
        onMouseLeave={() => setChartHovered(false)}
      >
        {/* 2D layer */}
        <div style={{ position: "absolute", inset: 0, display: is3D ? "none" : "block" }}>
          {render2D()}
        </div>

        {/* 3D layer — lazily mounted, kept alive */}
        {has3DBeenMounted && render3D && (
          <div style={{ position: "absolute", inset: 0, display: is3D ? "block" : "none" }}>
            {render3D()}
          </div>
        )}

        {/* ⓘ button — bottom-left, appears on hover */}
        {infoContent && !infoOpen && (
          <div style={{
            position: "absolute", bottom: 0, left: 0,
            width: 50, height: 36, zIndex: 8,
            opacity: chartHovered ? 1 : 0,
            transition: "opacity 0.18s ease",
            display: "flex", alignItems: "flex-end", justifyContent: "flex-start",
            padding: "0 0 6px 6px",
            pointerEvents: chartHovered ? "auto" : "none",
          }}>
            <HoverBtn side="left" onClick={() => setInfoOpen(true)}>ⓘ</HoverBtn>
          </div>
        )}

        {/* 2D/3D toggle — bottom-right, appears on hover */}
        {truly3D && render3D && (
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: 56, height: 36, zIndex: 8,
            opacity: chartHovered ? 1 : 0,
            transition: "opacity 0.18s ease",
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: "0 6px 6px 0",
            pointerEvents: chartHovered ? "auto" : "none",
          }}>
            <HoverBtn side="right" onClick={toggle3D} active={is3D}>
              {is3D ? "2D" : "3D"}
            </HoverBtn>
          </div>
        )}
      </div>

      {/* ── Info section — appended below chart, content-driven height ── */}
      {infoContent && infoOpen && (
        <InfoSection
          info={infoContent}
          lang={lang}
          onLangChange={setLang}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Small meta pill for card header top-right */
export function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: FONT_LABEL, fontSize: 8, letterSpacing: "0.07em",
      color: MC_COLORS.textLabel, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/** Shown when a model has no data for the current selection */
export function ModelUnavailable({ reason }: { reason: string }) {
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 5,
    }}>
      <span style={{
        fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted,
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        UNAVAILABLE
      </span>
      <span style={{
        fontFamily: FONT_LABEL, fontSize: 8, color: MC_COLORS.textLabel,
        letterSpacing: "0.07em", maxWidth: 220, textAlign: "center", lineHeight: 1.5,
      }}>
        {reason}
      </span>
    </div>
  );
}
