"use client";

import { X } from "lucide-react";
import {
  clampWatermarkOpacity,
  DEFAULT_WATERMARK_OPACITY,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  type MonitoringUiPrefs,
} from "@/lib/monitoring/monitoringUiPrefs";

type Props = {
  open: boolean;
  prefs: MonitoringUiPrefs;
  onChange: (next: MonitoringUiPrefs) => void;
  onClose: () => void;
};

function clampHex(value: string | null | undefined): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  return null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ color: "rgba(232,236,248,0.78)", fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>{children}</div>
    </div>
  );
}

export default function MonitoringSettingsModal({ open, prefs, onChange, onClose }: Props) {
  if (!open) return null;

  const set = (patch: Partial<MonitoringUiPrefs>) => onChange({ ...prefs, ...patch });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Monitoring Einstellungen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.62)",
        padding: 18,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          maxHeight: "min(720px, 86vh)",
          overflow: "auto",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12, 12, 12, 0.92)",
          boxShadow: "0 12px 50px rgba(0,0,0,0.55)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10 }}>
          <div>
            <div style={{ color: "#E9EEF8", fontSize: 14, fontWeight: 900, letterSpacing: 0.2 }}>Monitoring Einstellungen</div>
            <div style={{ color: "rgba(232,236,248,0.62)", fontSize: 12, fontWeight: 600 }}>
              Nur Visual/UI – keine Engine-/Signal-/CSV-Änderungen.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(232,236,248,0.86)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 8, paddingTop: 10 }}>
          <div style={{ color: "rgba(232,236,248,0.9)", fontSize: 12, fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>
            Sprache
          </div>
          <Row label="Symbolbegriffe">
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,236,248,0.78)", fontSize: 12, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={prefs.language === "de"}
                onChange={(e) => set({ language: e.target.checked ? "de" : "en" })}
              />
              Deutsch anzeigen (Standard: EN)
            </label>
          </Row>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 12, paddingTop: 10 }}>
          <div style={{ color: "rgba(232,236,248,0.9)", fontSize: 12, fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>
            Chart-Hintergrund
          </div>
          <Row label="Watermark">
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,236,248,0.78)", fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={prefs.watermarkEnabled} onChange={(e) => set({ watermarkEnabled: e.target.checked })} />
              Capitalife Text-Logo im Chart-Hintergrund
            </label>
          </Row>
          {prefs.watermarkEnabled ? (
            <Row label="Logo-Helligkeit">
              <input
                type="range"
                min={WATERMARK_OPACITY_MIN}
                max={WATERMARK_OPACITY_MAX}
                step={1}
                value={clampWatermarkOpacity(prefs.watermarkOpacity)}
                onChange={(e) => set({ watermarkOpacity: clampWatermarkOpacity(Number(e.target.value)) })}
                style={{ width: 160, accentColor: "rgba(214, 180, 75, 0.9)" }}
              />
              <span style={{ color: "rgba(232,236,248,0.72)", fontSize: 12, fontWeight: 700, minWidth: 36 }}>
                {clampWatermarkOpacity(prefs.watermarkOpacity)}%
              </span>
              <button
                type="button"
                onClick={() => set({ watermarkOpacity: DEFAULT_WATERMARK_OPACITY })}
                style={{
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(232,236,248,0.82)",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </Row>
          ) : null}
          <Row label="Hintergrundfarbe">
            <input
              type="color"
              value={prefs.backgroundColor ?? "#0A0A0A"}
              onChange={(e) => set({ backgroundColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ backgroundColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 12, paddingTop: 10 }}>
          <div style={{ color: "rgba(232,236,248,0.9)", fontSize: 12, fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>
            Kerzenfarben
          </div>
          <Row label="Bullish (Up)">
            <input
              type="color"
              value={prefs.candleUpColor ?? "#FFFFFF"}
              onChange={(e) => set({ candleUpColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ candleUpColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
          <Row label="Bearish (Down)">
            <input
              type="color"
              value={prefs.candleDownColor ?? "#D6B44B"}
              onChange={(e) => set({ candleDownColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ candleDownColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 12, paddingTop: 10 }}>
          <div style={{ color: "rgba(232,236,248,0.9)", fontSize: 12, fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>
            Visuals (Trade-Linien)
          </div>
          <Row label="Entry / Marker">
            <input
              type="color"
              value={prefs.overlayEntryColor ?? "#F59E0B"}
              onChange={(e) => set({ overlayEntryColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ overlayEntryColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
          <Row label="Stop Loss">
            <input
              type="color"
              value={prefs.overlaySlColor ?? "#FF3B30"}
              onChange={(e) => set({ overlaySlColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ overlaySlColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
          <Row label="Take Profit">
            <input
              type="color"
              value={prefs.overlayTpColor ?? "#22C55E"}
              onChange={(e) => set({ overlayTpColor: clampHex(e.target.value) })}
              style={{ width: 44, height: 28, border: 0, background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => set({ overlayTpColor: null })}
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(232,236,248,0.82)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </Row>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 12, paddingTop: 10 }}>
          <div style={{ color: "rgba(232,236,248,0.9)", fontSize: 12, fontWeight: 900, letterSpacing: 0.2, marginBottom: 6 }}>
            Effizienter Modus
          </div>
          <Row label="Leistungsmodus">
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,236,248,0.78)", fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={prefs.efficientMode} onChange={(e) => set({ efficientMode: e.target.checked })} />
              Aktivieren (z. B. ~20 Kerzen sichtbar, weniger UI-Updates)
            </label>
          </Row>
          <div style={{ color: "rgba(232,236,248,0.58)", fontSize: 12, fontWeight: 600, paddingTop: 4 }}>
            Hinweis: Charts bleiben standardmäßig frei bewegbar – kein Auto-Lock. Effizienter Modus reduziert nur Rendering/Details.
          </div>
        </div>
      </div>
    </div>
  );
}

