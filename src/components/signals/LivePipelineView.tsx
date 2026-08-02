"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type ComponentStatus = "online" | "calculating" | "idle" | "error";

interface PipelineStatus {
  marktdaten: { status: ComponentStatus; last_bar?: string };
  backtrader:  { status: ComponentStatus; last_calc?: string };
  terminal:    { status: ComponentStatus };
  ibkr:        { status: ComponentStatus; mode?: string };
  boerse:      { status: ComponentStatus; exchange?: string };
  signals: PipelineSignal[];
}

interface PipelineSignal {
  strategy: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  countdown?: string;
  triggered_at?: string;
  atr?: number;
  regime?: string;
  session?: string;
  last_cross?: string;
  parity?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT_LABEL = "Montserrat, sans-serif";
const FONT_NUM   = "Nunito, sans-serif";
const GOLD       = "#C9A84C";
const RED        = "#EF4444";
const GREEN      = "#22C55E";
const DIM        = "#6B7280";

const COLUMNS = [
  { id: "marktdaten", title: "Marktdaten",    sub: "Live OHLC",        icon: "📡" },
  { id: "backtrader", title: "Backtrader",     sub: "Signal Engine",    icon: "⚙️" },
  { id: "terminal",   title: "Terminal",       sub: "Dashboard",        icon: "🖥️" },
  { id: "ibkr",       title: "IBKR TWS",       sub: "Order Router",     icon: "🔗" },
  { id: "boerse",     title: "Börse / Accounts", sub: "CME / EUREX",   icon: "📊" },
] as const;

type ColumnId = typeof COLUMNS[number]["id"];

const MOCK_STATUS: PipelineStatus = {
  marktdaten: { status: "online",  last_bar: new Date().toISOString() },
  backtrader:  { status: "idle",   last_calc: new Date().toISOString() },
  terminal:    { status: "online" },
  ibkr:        { status: "idle",   mode: "paper" },
  boerse:      { status: "idle",   exchange: "CME" },
  signals: [
    {
      strategy: "EUR 30M Master Regime",
      symbol:   "6E",
      direction: "SHORT",
      entry:    1.1525,
      sl:       1.1512,
      tp:       1.1564,
      countdown: "34:01",
      triggered_at: new Date().toISOString(),
      atr:      0.00123,
      regime:   "Active",
      session:  "07:00–11:00 UTC",
      last_cross: "2026-05-12",
      parity:   80.7,
    },
  ],
};

const DELAY = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Status indicator ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ComponentStatus }) {
  const color = status === "online" ? GREEN
              : status === "calculating" ? GOLD
              : status === "error" ? RED
              : DIM;

  const animate = status === "online" ? "pulseDot" : status === "calculating" ? "blinkDot" : "none";

  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8,
      borderRadius: "50%",
      background: color,
      boxShadow: status !== "idle" ? `0 0 6px ${color}` : "none",
      animation: animate === "none" ? "none" : `${animate} 1.4s ease-in-out infinite`,
      flexShrink: 0,
    }} />
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────

function PipelineSignalCard({
  signal,
  isActive,
}: {
  signal: PipelineSignal;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isShort = signal.direction === "SHORT";
  const dirColor = isShort ? RED : GREEN;

  return (
    <div style={{
      background: "#0A0A0A",
      border: `1px solid ${isActive ? GOLD : "#1A1A1A"}`,
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: isActive ? `0 0 12px rgba(201,168,76,0.25)` : "none",
      transition: "border-color 0.3s, box-shadow 0.3s",
      marginBottom: 8,
    }}>
      {/* Header */}
      <div style={{ padding: "10px 12px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F5", fontFamily: FONT_NUM }}>{signal.symbol}</span>
            <span style={{ fontSize: 9, color: DIM, fontFamily: FONT_LABEL, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {signal.strategy}
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: DIM, fontFamily: FONT_LABEL }}>{signal.strategy}</div>
        </div>
        {signal.countdown && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontFamily: FONT_NUM, letterSpacing: "0.04em" }}>
              {signal.countdown}
            </div>
            {signal.triggered_at && (
              <div style={{ fontSize: 9, color: DIM, fontFamily: FONT_LABEL }}>
                {new Date(signal.triggered_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: GREEN, fontFamily: FONT_LABEL, marginBottom: 2 }}>TP</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, fontFamily: FONT_NUM }}>
              +{((signal.tp - signal.entry) / signal.entry * 100).toFixed(2)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: RED, fontFamily: FONT_LABEL, marginBottom: 2 }}>SL</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: RED, fontFamily: FONT_NUM }}>
              {((signal.sl - signal.entry) / signal.entry * 100).toFixed(2)}%
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 800,
          color: dirColor,
          fontFamily: FONT_NUM,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {isShort ? "▼" : "▲"} {signal.direction}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 12px",
        borderTop: "1px solid #1A1A1A",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 9, color: "#333", fontFamily: FONT_LABEL }}>
          📈 Chart
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none", border: "none",
            color: DIM, fontSize: 9, fontFamily: FONT_LABEL,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            padding: "2px 0",
            letterSpacing: "0.04em",
          }}
        >
          Detail {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #1A1A1A" }}>
          {([
            ["Entry",     signal.entry.toFixed(4)],
            ["SL",        `${signal.sl.toFixed(4)} (${((signal.sl - signal.entry) * 10000).toFixed(0)} Pips)`],
            ["TP",        `${signal.tp.toFixed(4)} (+${((signal.tp - signal.entry) * 10000).toFixed(0)} Pips)`],
            ...(signal.atr     ? [["ATR",           signal.atr.toFixed(5)]] : []),
            ...(signal.regime  ? [["Regime",         signal.regime]]         : []),
            ...(signal.session ? [["Session",        signal.session]]        : []),
            ...(signal.last_cross ? [["Letzter Cross", signal.last_cross]]   : []),
            ...(signal.parity  ? [["Parity",         `${signal.parity.toFixed(1)} %`]] : []),
            ["Strategie",  signal.strategy],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: DIM, fontFamily: FONT_LABEL }}>{label}</span>
              <span style={{ fontSize: 10, color: "#F5F5F5", fontFamily: FONT_NUM, textAlign: "right" as const, maxWidth: "55%" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connector line ─────────────────────────────────────────────────────────────

function Connector({ active }: { active: boolean }) {
  return (
    <div style={{
      flex: "0 0 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    }}>
      <div style={{
        position: "absolute",
        left: 0, right: 0,
        height: 1,
        background: active
          ? `linear-gradient(90deg, ${GOLD}00, ${GOLD}, ${GOLD}00)`
          : "transparent",
        borderTop: active ? "none" : `1px dashed #1A1A1A`,
        transition: "all 0.4s",
      }} />
      {active && (
        <div style={{
          position: "absolute",
          width: 6, height: 6,
          borderRadius: "50%",
          background: GOLD,
          boxShadow: `0 0 8px ${GOLD}`,
          animation: "flowDot 0.8s linear infinite",
        }} />
      )}
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

function PipelineColumn({
  col,
  status,
  flowStep,
  index,
  signals,
}: {
  col: typeof COLUMNS[number];
  status: ComponentStatus;
  flowStep: number;
  index: number;
  signals?: PipelineSignal[];
}) {
  const isActive = flowStep > index;

  const statusLabel =
    status === "online"      ? "Online"     :
    status === "calculating" ? "Berechnung" :
    status === "error"       ? "Fehler"     : "Wartet";

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      minWidth: 0,
    }}>
      {/* Column header */}
      <div style={{
        background: "#050505",
        border: "1px solid #1A1A1A",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 10,
        borderColor: isActive ? `rgba(201,168,76,0.3)` : "#1A1A1A",
        transition: "border-color 0.4s",
      }}>
        <div style={{ fontSize: 18, marginBottom: 6, lineHeight: 1 }}>{col.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F5", fontFamily: FONT_LABEL, marginBottom: 3 }}>
          {col.title}
        </div>
        <div style={{ fontSize: 9.5, color: DIM, fontFamily: FONT_LABEL, marginBottom: 8 }}>{col.sub}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StatusDot status={status} />
          <span style={{ fontSize: 9.5, color: DIM, fontFamily: FONT_LABEL }}>{statusLabel}</span>
        </div>
      </div>

      {/* Column body */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        paddingBottom: 8,
      }}>
        {/* Signal cards (column 0 = Marktdaten) */}
        {col.id === "marktdaten" && signals && signals.map((sig, i) => (
          <PipelineSignalCard key={i} signal={sig} isActive={isActive} />
        ))}

        {/* Backtrader: calculating state */}
        {col.id === "backtrader" && flowStep === 2 && (
          <div style={{
            background: "#0A0A0A", border: "1px solid #1A1A1A",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, color: GOLD, fontFamily: FONT_LABEL, animation: "blinkDot 1s ease-in-out infinite" }}>
              Berechne Signal…
            </div>
          </div>
        )}
        {col.id === "backtrader" && flowStep > 2 && (
          <div style={{
            background: "#0A0A0A", border: `1px solid rgba(201,168,76,0.2)`,
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, color: GREEN, fontFamily: FONT_LABEL }}>✓ Signal berechnet</div>
          </div>
        )}

        {/* Terminal: card preview */}
        {col.id === "terminal" && flowStep > 3 && signals?.[0] && (
          <div style={{
            background: "#0A0A0A", border: `1px solid rgba(201,168,76,0.2)`,
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FONT_LABEL, marginBottom: 6 }}>Signal Preview</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: signals[0].direction === "SHORT" ? RED : GREEN, fontFamily: FONT_NUM }}>
              {signals[0].direction === "SHORT" ? "▼ SHORT" : "▲ LONG"} {signals[0].symbol}
            </div>
          </div>
        )}

        {/* IBKR: order sent */}
        {col.id === "ibkr" && flowStep > 4 && (
          <div style={{
            background: "#0A0A0A", border: `1px solid rgba(201,168,76,0.2)`,
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 10, color: GOLD, fontFamily: FONT_LABEL }}>📤 Order gesendet</div>
          </div>
        )}

        {/* Börse: executed */}
        {col.id === "boerse" && flowStep >= 6 && (
          <div style={{
            background: "#0A0A0A", border: `1px solid rgba(34,197,94,0.2)`,
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 10, color: GREEN, fontFamily: FONT_LABEL }}>✓ Ausgeführt</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, fontFamily: FONT_NUM, marginTop: 4 }}>PnL: +0.00</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Simulation complete banner ─────────────────────────────────────────────────

function SimDoneBanner({ ms, onClose }: { ms: number; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute",
      bottom: 40, left: "50%", transform: "translateX(-50%)",
      background: "#0A0A0A",
      border: `1px solid ${GREEN}`,
      borderRadius: 10,
      padding: "14px 24px",
      zIndex: 100,
      textAlign: "center",
      minWidth: 280,
    }}>
      <div style={{ fontSize: 13, color: GREEN, fontFamily: FONT_LABEL, fontWeight: 700, marginBottom: 6 }}>
        ✓ Simulation abgeschlossen
      </div>
      <div style={{ fontSize: 11, color: DIM, fontFamily: FONT_LABEL }}>
        Geschätzte Ausführungszeit: {(ms / 1000).toFixed(1)} s
      </div>
      <button onClick={onClose} style={{
        marginTop: 10, background: "none", border: `1px solid #333`,
        borderRadius: 6, color: DIM, fontSize: 10, fontFamily: FONT_LABEL,
        cursor: "pointer", padding: "4px 12px",
      }}>
        Schließen
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface LivePipelineViewProps {
  onClose: () => void;
  initialSignals?: SignalCardModel[];
}

export default function LivePipelineView({ onClose }: LivePipelineViewProps) {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(MOCK_STATUS);
  const [flowStep, setFlowStep] = useState(0);
  const [simMode, setSimMode] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone] = useState(false);
  const [simMs, setSimMs] = useState(0);
  const simRef = useRef(false);

  // Poll /api/pipeline-status every 30s
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/pipeline-status");
        if (!r.ok) return;
        const d = await r.json() as PipelineStatus;
        setPipelineStatus(d);
      } catch { /* fallback stays */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const runSimulation = useCallback(async () => {
    if (simRunning) return;
    setSimRunning(true);
    setSimDone(false);
    simRef.current = true;
    const t0 = Date.now();

    setFlowStep(1);  await DELAY(300);
    setFlowStep(2);  await DELAY(500);
    setFlowStep(3);  await DELAY(200);
    setFlowStep(4);  await DELAY(300);
    setFlowStep(5);  await DELAY(500);
    setFlowStep(6);  await DELAY(800);

    setSimMs(Date.now() - t0);
    setSimDone(true);
    setSimRunning(false);
  }, [simRunning]);

  const resetSim = () => {
    setFlowStep(0);
    setSimDone(false);
    setSimRunning(false);
  };

  // Determine per-column statuses (override with flow animation)
  const colStatuses: Record<ColumnId, ComponentStatus> = {
    marktdaten: flowStep >= 1 ? "online" : pipelineStatus.marktdaten.status,
    backtrader:  flowStep === 2 ? "calculating" : flowStep > 2 ? "online" : pipelineStatus.backtrader.status,
    terminal:    flowStep >= 3 ? "online" : pipelineStatus.terminal.status,
    ibkr:        flowStep >= 4 ? "online" : pipelineStatus.ibkr.status,
    boerse:      flowStep >= 5 ? "online" : pipelineStatus.boerse.status,
  };

  return (
    <>
      {/* Inject CSS animations */}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
        @keyframes blinkDot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes flowDot {
          0%   { left: 0%;   opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "#000000",
        display: "flex", flexDirection: "column",
        fontFamily: FONT_LABEL,
        overflow: "hidden",
      }}>
        {/* ── Header bar ── */}
        <div style={{
          flexShrink: 0,
          height: 44,
          borderBottom: "1px solid #1A1A1A",
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 12,
        }}>
          {/* Live / Sim toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setSimMode(false); resetSim(); }}
              style={{
                padding: "4px 12px", borderRadius: 5,
                background: !simMode ? "rgba(34,197,94,0.12)" : "none",
                border: `1px solid ${!simMode ? GREEN : "#2A2A2A"}`,
                color: !simMode ? GREEN : DIM,
                fontSize: 10, fontFamily: FONT_LABEL,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <StatusDot status={!simMode ? "online" : "idle"} /> LIVE
            </button>
            <button
              onClick={() => setSimMode(true)}
              style={{
                padding: "4px 12px", borderRadius: 5,
                background: simMode ? "rgba(201,168,76,0.12)" : "none",
                border: `1px solid ${simMode ? GOLD : "#2A2A2A"}`,
                color: simMode ? GOLD : DIM,
                fontSize: 10, fontFamily: FONT_LABEL,
                cursor: "pointer",
              }}
            >
              ⚡ SIMULIEREN
            </button>
          </div>

          {/* Sim controls */}
          {simMode && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={runSimulation}
                disabled={simRunning}
                style={{
                  padding: "4px 14px", borderRadius: 5,
                  background: simRunning ? "none" : "rgba(201,168,76,0.15)",
                  border: `1px solid ${simRunning ? "#2A2A2A" : GOLD}`,
                  color: simRunning ? DIM : GOLD,
                  fontSize: 10, fontFamily: FONT_LABEL,
                  cursor: simRunning ? "not-allowed" : "pointer",
                }}
              >
                {simRunning ? "Läuft…" : "▶ Signal auslösen"}
              </button>
              {flowStep > 0 && !simRunning && (
                <button onClick={resetSim} style={{
                  padding: "4px 10px", borderRadius: 5,
                  background: "none", border: "1px solid #2A2A2A",
                  color: DIM, fontSize: 10, fontFamily: FONT_LABEL, cursor: "pointer",
                }}>
                  ↺ Reset
                </button>
              )}
            </div>
          )}

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 11, color: DIM, fontFamily: FONT_LABEL }}>
            ⚡ Live Pipeline
          </span>

          <button onClick={onClose} style={{
            background: "none", border: "1px solid #2A2A2A", borderRadius: 6,
            color: DIM, fontSize: 13, cursor: "pointer",
            width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            ✕
          </button>
        </div>

        {/* ── Column layout ── */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          padding: "20px 20px 20px",
          gap: 0,
          overflow: "hidden",
          position: "relative",
        }}>
          {COLUMNS.map((col, i) => (
            <div key={col.id} style={{ display: "flex", flex: 1, minWidth: 0, gap: 0 }}>
              <PipelineColumn
                col={col}
                status={colStatuses[col.id]}
                flowStep={flowStep}
                index={i + 1}
                signals={col.id === "marktdaten" ? pipelineStatus.signals : undefined}
              />
              {i < COLUMNS.length - 1 && (
                <div style={{ width: 24, display: "flex", alignItems: "flex-start", paddingTop: 56 }}>
                  <Connector active={flowStep > i + 1} />
                </div>
              )}
            </div>
          ))}

          {/* Simulation done banner */}
          {simDone && (
            <SimDoneBanner ms={simMs} onClose={() => { setSimDone(false); resetSim(); }} />
          )}
        </div>
      </div>
    </>
  );
}
