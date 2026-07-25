"use client";

import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { SeasonalityUiSettings } from "@/lib/seasonality/useSeasonalitySettings";
import styles from "./seasonal.module.css";

const C_BG      = "oklch(0.13 0.006 255)";
const C_BORDER  = "rgba(255,255,255,0.09)";
const C_TEXT    = "#E4E8ED";
const C_TEXT2   = "#7A8898";
const C_TOGGLE_OFF = "#5A6070";
const C_ACCENT  = "rgba(255,255,255,0.55)";
const FONT      = "Montserrat, Segoe UI, sans-serif";

// ─── Toggle row ───────────────────────────────────────────────────────────────
function Toggle({
  label, description, value, onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 12, width: "100%", padding: "7px 10px",
        background: "transparent", border: "none", cursor: "pointer",
        borderBottom: `1px solid ${C_BORDER}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: C_TEXT, lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 9.5, color: C_TEXT2, marginTop: 2, lineHeight: 1.4 }}>{description}</div>
      </div>
      {/* Pill toggle */}
      <div style={{
        width: 30, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 2,
        background: value ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${value ? "rgba(255,255,255,0.22)" : C_BORDER}`,
        position: "relative", transition: "background 0.15s, border-color 0.15s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 14 : 2,
          width: 10, height: 10, borderRadius: "50%",
          background: value ? C_TEXT : C_TOGGLE_OFF,
          transition: "left 0.15s, background 0.15s",
        }} />
      </div>
    </button>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  showNumberInput,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  showNumberInput?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        padding: "6px 10px 8px",
        borderBottom: `1px solid ${C_BORDER}`,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: C_TEXT, flexShrink: 0 }}>{label}</span>
        {showNumberInput ? (
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              disabled={disabled}
              onChange={e => onChange(clamp(Number(e.target.value), min, max))}
              onClick={e => e.stopPropagation()}
              className={styles.chartSettingsNumInput}
            />
            <span style={{ fontSize: 9, color: C_TEXT2, flexShrink: 0 }}>{unit}</span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: C_TEXT2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {value}{unit}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C_ACCENT, cursor: disabled ? "default" : "pointer" }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  settings: SeasonalityUiSettings;
  onUpdate: <K extends keyof SeasonalityUiSettings>(key: K, value: SeasonalityUiSettings[K]) => void;
}

const POPOVER_W = 272;

export function SeasonalSettingsPopover({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !containerRef.current) {
      setPopoverPos(null);
      return;
    }
    placePopover();
    const t = window.setTimeout(placePopover, 0);
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [open, settings.chartLogoEnabled]);

  const placePopover = () => {
    if (!containerRef.current) return;
    const anchor = containerRef.current.getBoundingClientRect();
    const h = popoverRef.current?.offsetHeight ?? 400;
    const gap = 6;
    const spaceBelow = window.innerHeight - anchor.bottom - gap;
    const openUp = spaceBelow < Math.min(h, 360);
    const top = openUp ? anchor.top - gap : anchor.bottom + gap;
    const left = Math.max(8, Math.min(anchor.right - POPOVER_W, window.innerWidth - POPOVER_W - 8));
    setPopoverPos({ top, left, openUp });
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      {/* Gear button */}
      <button
        type="button"
        title="Settings"
        onClick={() => {
          setOpen(v => {
            const next = !v;
            if (next) {
              requestAnimationFrame(() => placePopover());
            } else {
              setPopoverPos(null);
            }
            return next;
          });
        }}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22,
          height: 20,
          background: open ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${open ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 6,
          cursor: "pointer",
          color: open ? C_TEXT : C_TEXT2,
          transition: "background 0.12s, border-color 0.12s, color 0.12s",
          flexShrink: 0,
        }}
      >
        <Settings size={14} strokeWidth={2} />
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: popoverPos?.top ?? 48,
            left: popoverPos?.left ?? 8,
            transform: popoverPos?.openUp ? "translateY(-100%)" : undefined,
            zIndex: 9999,
            width: POPOVER_W,
            maxHeight: "min(72vh, calc(100vh - 16px))",
            display: "flex",
            flexDirection: "column",
            background: C_BG,
            border: `1px solid ${C_BORDER}`,
            borderRadius: 10,
            boxShadow: "0 8px 32px -8px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.04) inset",
            overflow: "hidden",
            fontFamily: FONT,
            colorScheme: "dark",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "7px 10px 6px",
            borderBottom: `1px solid ${C_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C_TEXT2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Chart Settings
            </span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: C_TEXT2, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>
              ×
            </button>
          </div>

          <div className={styles.chartSettingsScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
          {/* Toggles */}
          <Toggle
            label="Fast Mode"
            description="Reduces heavy component re-renders during hover (WF tester, pattern returns). Hover Preview still works when ON."
            value={settings.fastMode}
            onChange={v => onUpdate("fastMode", v)}
          />
          <Toggle
            label="Hover Preview"
            description="Show pattern KPIs while hovering — reads from cache only, no re-calculation or API calls."
            value={settings.hoverPreview}
            onChange={v => onUpdate("hoverPreview", v)}
          />
          <Toggle
            label="Show Today"
            description="Show/hide the Today vertical line and label."
            value={settings.showToday}
            onChange={v => onUpdate("showToday", v)}
          />
          <Toggle
            label="Pattern Highlight"
            description="Show/hide locked-pattern overlay on the seasonal curve."
            value={settings.showPatternHighlight}
            onChange={v => onUpdate("showPatternHighlight", v)}
          />
          <Toggle
            label="Chart Gradient"
            description="Show/hide the subtle gradient fill along the seasonal curve."
            value={settings.chartGradient}
            onChange={v => onUpdate("chartGradient", v)}
          />

          <div style={{
            padding: "6px 10px 4px",
            borderTop: `1px solid ${C_BORDER}`,
            borderBottom: `1px solid ${C_BORDER}`,
            background: "rgba(255,255,255,0.02)",
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: C_TEXT2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Chart Logo
            </span>
          </div>
          <Toggle
            label="Capitalife Logo"
            description="Text logo unten links im Seasonal Chart."
            value={settings.chartLogoEnabled}
            onChange={v => onUpdate("chartLogoEnabled", v)}
          />
          <SliderRow
            label="Transparenz"
            value={settings.chartLogoOpacity}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={!settings.chartLogoEnabled}
            onChange={v => onUpdate("chartLogoOpacity", v)}
          />
          <SliderRow
            label="Größe"
            value={settings.chartLogoSize}
            min={40}
            max={280}
            step={2}
            unit="px"
            disabled={!settings.chartLogoEnabled}
            onChange={v => onUpdate("chartLogoSize", v)}
          />
          <SliderRow
            label="Position X"
            value={settings.chartLogoPosX}
            min={0}
            max={200}
            step={1}
            unit="px"
            showNumberInput
            disabled={!settings.chartLogoEnabled}
            onChange={v => onUpdate("chartLogoPosX", v)}
          />
          <div style={{ borderBottom: "none" }}>
            <SliderRow
              label="Position Y"
              value={settings.chartLogoPosY}
              min={0}
              max={200}
              step={1}
              unit="px"
              showNumberInput
              disabled={!settings.chartLogoEnabled}
              onChange={v => onUpdate("chartLogoPosY", v)}
            />
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
