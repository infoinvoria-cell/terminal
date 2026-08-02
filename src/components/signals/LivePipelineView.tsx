"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type ComponentStatus = "online" | "calculating" | "idle" | "error";

interface PipelineStatus {
  marktdaten: { status: ComponentStatus; last_bar?: string; bars_today?: number };
  backtrader:  { status: ComponentStatus; last_calc?: string; last_signal?: string; engine_v?: string };
  terminal:    { status: ComponentStatus; active_signals?: number; portfolio_value?: number };
  ibkr:        { status: ComponentStatus; mode?: string; account?: string; buying_power?: number };
  boerse:      { status: ComponentStatus; exchange?: string; market_hours?: string; last_exec?: string };
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

// ── Design tokens ──────────────────────────────────────────────────────────────

const FL = "Montserrat, sans-serif";   // labels
const FN = "Nunito, sans-serif";        // numbers
const GOLD  = "#C9A84C";
const RED   = "#EF4444";
const GREEN = "#22C55E";
const DIM   = "#4A5568";
const DIM2  = "#2D3748";
const CARD  = "#080808";
const BORDER_IDLE = "#1C1C1C";

// ── Mock fallback ──────────────────────────────────────────────────────────────

const MOCK: PipelineStatus = {
  marktdaten: { status: "online",  last_bar: new Date().toISOString(), bars_today: 47 },
  backtrader:  { status: "idle",   last_calc: new Date().toISOString(), last_signal: "EUR 30M → SHORT", engine_v: "2.4.1" },
  terminal:    { status: "online", active_signals: 3, portfolio_value: 1_250_000 },
  ibkr:        { status: "idle",   mode: "paper", account: "DU123456", buying_power: 48_200 },
  boerse:      { status: "idle",   exchange: "CME", market_hours: "08:00–17:00 CT", last_exec: "–" },
  signals: [
    {
      strategy: "EUR 30M Master Regime",
      symbol: "6E",
      direction: "SHORT",
      entry: 1.1525,
      sl: 1.1512,
      tp: 1.1564,
      countdown: "34:01",
      triggered_at: new Date().toISOString(),
      atr: 0.00123,
      regime: "Active",
      session: "07:00–11:00 UTC",
      last_cross: "2026-05-12",
      parity: 80.7,
    },
  ],
};

const DELAY = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fmtTime(iso?: string) {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtEur(n?: number) {
  if (n == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n);
}

// ── Status dot ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ComponentStatus }) {
  const c = status === "online" ? GREEN : status === "calculating" ? GOLD : status === "error" ? RED : DIM;
  const anim = status === "online" ? "plsDot 1.6s ease-in-out infinite" : status === "calculating" ? "blkDot 1s ease-in-out infinite" : "none";
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: c, flexShrink: 0,
      boxShadow: status !== "idle" ? `0 0 5px ${c}99` : "none",
      animation: anim,
    }} />
  );
}

// ── SVG Connector (horizontal, between columns) ────────────────────────────────

function SvgConnector({ active, step }: { active: boolean; step: number }) {
  const W = 36, H = 24, CY = H / 2;
  return (
    <div style={{ width: W, flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 52 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        {/* idle: dashed line */}
        {!active && (
          <line x1={2} y1={CY} x2={W - 2} y2={CY}
            stroke={BORDER_IDLE} strokeWidth={1} strokeDasharray="4 5" />
        )}
        {/* active: solid gold line + travelling dot */}
        {active && (
          <>
            <line x1={2} y1={CY} x2={W - 2} y2={CY}
              stroke={GOLD} strokeWidth={1.5} opacity={0.7} />
            <circle r={3.5} fill={GOLD} style={{ filter: `drop-shadow(0 0 4px ${GOLD})` }}>
              <animateMotion
                key={step}
                dur="0.7s"
                repeatCount="indefinite"
                path={`M 2,${CY} L ${W - 2},${CY}`}
              />
            </circle>
          </>
        )}
      </svg>
    </div>
  );
}

// ── KV row (label + value) ─────────────────────────────────────────────────────

function KVRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 9.5, color: DIM, fontFamily: FL }}>{label}</span>
      <span style={{ fontSize: 10, color: valueColor ?? "#D1D5DB", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Column body content ────────────────────────────────────────────────────────

function ColBody({
  col,
  flowStep,
  ps,
}: {
  col: { id: string };
  flowStep: number;
  ps: PipelineStatus;
}) {
  const id = col.id;

  if (id === "backtrader") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DataCard>
          <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Engine Info</div>
          <KVRow label="Version" value={ps.backtrader.engine_v ?? "–"} />
          <KVRow label="Letzte Berechnung" value={fmtTime(ps.backtrader.last_calc)} />
        </DataCard>
        {(flowStep === 2 || flowStep > 2) && (
          <DataCard active={flowStep === 2}>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Signal Output</div>
            {flowStep === 2 ? (
              <div style={{ fontSize: 11, color: GOLD, fontFamily: FL, animation: "blkDot 1s ease-in-out infinite" }}>
                Berechne Signal…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: GREEN, fontFamily: FL, marginBottom: 6 }}>✓ Signal berechnet</div>
                <KVRow label="Signal" value={ps.backtrader.last_signal ?? ps.signals[0]?.direction ?? "–"} valueColor={GREEN} />
              </>
            )}
          </DataCard>
        )}
      </div>
    );
  }

  if (id === "terminal") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DataCard>
          <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Dashboard KPIs</div>
          <KVRow label="Aktive Signale" value={String(ps.terminal.active_signals ?? 0)} />
          <KVRow label="Portfolio Value" value={fmtEur(ps.terminal.portfolio_value)} valueColor={GOLD} />
          <KVRow label="Status" value="Online" valueColor={GREEN} />
        </DataCard>
        {flowStep > 3 && ps.signals[0] && (
          <DataCard>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Signal Preview</div>
            <div style={{
              fontSize: 13, fontWeight: 800,
              color: ps.signals[0].direction === "SHORT" ? RED : GREEN,
              fontFamily: FN, marginBottom: 4,
            }}>
              {ps.signals[0].direction === "SHORT" ? "▼ SHORT" : "▲ LONG"} {ps.signals[0].symbol}
            </div>
            <KVRow label="Entry" value={ps.signals[0].entry.toFixed(4)} />
          </DataCard>
        )}
      </div>
    );
  }

  if (id === "ibkr") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DataCard>
          <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>TWS Verbindung</div>
          <KVRow label="Modus" value={ps.ibkr.mode === "paper" ? "Paper Trading" : "Live"} valueColor={ps.ibkr.mode === "paper" ? GOLD : GREEN} />
          <KVRow label="Account" value={ps.ibkr.account ?? "–"} />
          <KVRow label="Buying Power" value={fmtEur(ps.ibkr.buying_power)} />
        </DataCard>
        {flowStep > 4 && (
          <DataCard>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Order Queue</div>
            <div style={{ fontSize: 10, color: GOLD, fontFamily: FL }}>📤 Order übermittelt</div>
            {ps.signals[0] && (
              <KVRow label="Instrument" value={ps.signals[0].symbol} />
            )}
          </DataCard>
        )}
      </div>
    );
  }

  if (id === "boerse") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DataCard>
          <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Börsen-Info</div>
          <KVRow label="Exchange" value={ps.boerse.exchange ?? "CME"} />
          <KVRow label="Market Hours" value={ps.boerse.market_hours ?? "–"} />
          <KVRow label="Letzte Ausführung" value={ps.boerse.last_exec ?? "–"} />
        </DataCard>
        {flowStep >= 6 && (
          <DataCard>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FL, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Execution</div>
            <div style={{ fontSize: 11, color: GREEN, fontFamily: FL, marginBottom: 4 }}>✓ Order ausgeführt</div>
            <KVRow label="Slippage" value="0.1 pip" />
            <KVRow label="PnL" value="+0.00 €" valueColor={GREEN} />
          </DataCard>
        )}
      </div>
    );
  }

  return null;
}

// ── Reusable data card ─────────────────────────────────────────────────────────

function DataCard({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div style={{
      background: CARD,
      border: `1px solid ${active ? `${GOLD}55` : BORDER_IDLE}`,
      borderRadius: 8,
      padding: "10px 12px",
      transition: "border-color 0.3s",
    }}>
      {children}
    </div>
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────

function PipelineSignalCard({ signal, isActive }: { signal: PipelineSignal; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isShort = signal.direction === "SHORT";
  const dirColor = isShort ? RED : GREEN;
  const tpPct = ((signal.tp - signal.entry) / signal.entry * 100).toFixed(2);
  const slPct = ((signal.sl - signal.entry) / signal.entry * 100).toFixed(2);
  const tpPips = Math.abs((signal.tp - signal.entry) * 10000).toFixed(0);
  const slPips = Math.abs((signal.sl - signal.entry) * 10000).toFixed(0);

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${isActive ? GOLD : BORDER_IDLE}`,
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: isActive ? `0 0 14px rgba(201,168,76,0.2)` : "none",
      transition: "border-color 0.35s, box-shadow 0.35s",
      marginBottom: 8,
    }}>
      {/* Direction stripe */}
      <div style={{ height: 2, background: dirColor, opacity: 0.7 }} />

      {/* Header */}
      <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#F0F0F0", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
              {signal.symbol}
            </span>
            {/* Direction pill */}
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: FL,
              color: dirColor, letterSpacing: "0.06em",
              border: `1px solid ${dirColor}55`,
              borderRadius: 3, padding: "1px 5px",
            }}>
              {isShort ? "▼" : "▲"} {signal.direction}
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: DIM, fontFamily: FL, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signal.strategy}
          </div>
        </div>
        {signal.countdown && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, fontFamily: FN, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>
              {signal.countdown}
            </div>
            <div style={{ fontSize: 9, color: DIM, fontFamily: FL }}>
              {signal.triggered_at ? fmtTime(signal.triggered_at) : ""}
            </div>
          </div>
        )}
      </div>

      {/* TP / SL row */}
      <div style={{ padding: "4px 12px 8px", display: "flex", gap: 16, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 9, color: GREEN, fontFamily: FL, marginBottom: 1 }}>TP +{tpPct}%</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
            +{tpPips} pip
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: RED, fontFamily: FL, marginBottom: 1 }}>SL {slPct}%</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: RED, fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
            −{slPips} pip
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 9.5, color: DIM2, fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
          {signal.entry.toFixed(4)}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px",
        borderTop: `1px solid ${BORDER_IDLE}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 9, color: DIM2, fontFamily: FL }}>📈 Chart</div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none", border: "none",
            color: DIM, fontSize: 9.5, fontFamily: FL,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            padding: "2px 0", letterSpacing: "0.04em",
          }}
        >
          Detail {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${BORDER_IDLE}` }}>
          {([
            ["Entry",     signal.entry.toFixed(4)],
            ["SL",        `${signal.sl.toFixed(4)} (−${slPips} Pips)`],
            ["TP",        `${signal.tp.toFixed(4)} (+${tpPips} Pips)`],
            ...(signal.atr       ? [["ATR",          signal.atr.toFixed(5)]]       : []),
            ...(signal.regime    ? [["Regime",        signal.regime]]               : []),
            ...(signal.session   ? [["Session",       signal.session]]              : []),
            ...(signal.last_cross ? [["Letzter Cross", signal.last_cross]]          : []),
            ...(signal.parity    ? [["Parity",        `${signal.parity.toFixed(1)} %`]] : []),
            ["Strategie",  signal.strategy],
          ] as [string, string][]).map(([lbl, val]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: DIM, fontFamily: FL }}>{lbl}</span>
              <span style={{ fontSize: 10, color: "#D1D5DB", fontFamily: FN, fontVariantNumeric: "tabular-nums", textAlign: "right", maxWidth: "58%" }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column wrapper ─────────────────────────────────────────────────────────────

function PipelineColumn({
  col,
  status,
  flowStep,
  index,
  ps,
}: {
  col: typeof COLUMNS[number];
  status: ComponentStatus;
  flowStep: number;
  index: number;
  ps: PipelineStatus;
}) {
  const isActive = flowStep >= index;
  const isFirst  = col.id === "marktdaten";

  const statusLabel = status === "online" ? "Online" : status === "calculating" ? "Berechnung" : status === "error" ? "Fehler" : "Wartet";
  const statusColor = status === "online" ? GREEN   : status === "calculating" ? GOLD        : status === "error" ? RED     : DIM;

  return (
    <div style={{
      width: isFirst ? 300 : undefined,
      flex: isFirst ? "0 0 300px" : 1,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      minWidth: 0,
    }}>
      {/* Column header card */}
      <div style={{
        background: CARD,
        border: `1px solid ${isActive ? `${GOLD}44` : BORDER_IDLE}`,
        borderLeft: `2px solid ${isActive ? statusColor : BORDER_IDLE}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 10,
        transition: "border-color 0.4s",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#E5E7EB" : "#6B7280", fontFamily: FL }}>
            {col.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <StatusDot status={status} />
            <span style={{ fontSize: 9, color: statusColor, fontFamily: FL }}>{statusLabel}</span>
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: DIM, fontFamily: FL }}>{col.sub}</div>
      </div>

      {/* Column body */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8, paddingRight: 2 }}>
        {isFirst
          ? ps.signals.map((sig, i) => (
              <PipelineSignalCard key={i} signal={sig} isActive={isActive} />
            ))
          : <ColBody col={col} flowStep={flowStep} ps={ps} />
        }
      </div>
    </div>
  );
}

// ── Columns config ─────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "marktdaten", title: "Marktdaten",      sub: "Live OHLC Feed" },
  { id: "backtrader", title: "Backtrader",       sub: "Signal Engine"  },
  { id: "terminal",   title: "Terminal",         sub: "Dashboard"      },
  { id: "ibkr",       title: "IBKR TWS",         sub: "Order Router"   },
  { id: "boerse",     title: "Börse / Accounts", sub: "CME / EUREX"    },
] as const;

type ColumnId = typeof COLUMNS[number]["id"];

// ── Simulation done banner ─────────────────────────────────────────────────────

function SimDoneBanner({ ms, onClose }: { ms: number; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute",
      bottom: 36, left: "50%", transform: "translateX(-50%)",
      background: "#050505",
      border: `1px solid ${GREEN}`,
      borderRadius: 10,
      padding: "14px 28px",
      zIndex: 100,
      textAlign: "center",
      minWidth: 300,
      boxShadow: `0 0 24px rgba(34,197,94,0.15)`,
    }}>
      <div style={{ fontSize: 13, color: GREEN, fontFamily: FL, fontWeight: 700, marginBottom: 6 }}>
        ✓ Simulation abgeschlossen
      </div>
      <div style={{ fontSize: 11, color: DIM, fontFamily: FL, marginBottom: 2 }}>
        Geschätzte Ausführungszeit: {(ms / 1000).toFixed(1)} s
      </div>
      <div style={{ fontSize: 10, color: DIM2, fontFamily: FL, marginBottom: 10 }}>
        Marktdaten→Signal: 0.3s · Signal→Terminal: 0.2s · TWS→Börse: 0.5s
      </div>
      <button onClick={onClose} style={{
        background: "none", border: `1px solid ${BORDER_IDLE}`,
        borderRadius: 6, color: DIM, fontSize: 10, fontFamily: FL,
        cursor: "pointer", padding: "4px 14px",
      }}>
        Schließen
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export interface LivePipelineViewProps {
  onClose: () => void;
  initialSignals?: SignalCardModel[];
}

export default function LivePipelineView({ onClose }: LivePipelineViewProps) {
  const [ps, setPs]               = useState<PipelineStatus>(MOCK);
  const [flowStep, setFlowStep]   = useState(0);
  const [simMode, setSimMode]     = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone]     = useState(false);
  const [simMs, setSimMs]         = useState(0);

  // Poll /api/pipeline-status every 30s
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/pipeline-status");
        if (r.ok) setPs(await r.json() as PipelineStatus);
      } catch { /* keep mock */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const runSimulation = useCallback(async () => {
    if (simRunning) return;
    setSimRunning(true); setSimDone(false);
    const t0 = Date.now();
    setFlowStep(1); await DELAY(300);
    setFlowStep(2); await DELAY(500);
    setFlowStep(3); await DELAY(200);
    setFlowStep(4); await DELAY(300);
    setFlowStep(5); await DELAY(500);
    setFlowStep(6); await DELAY(800);
    setSimMs(Date.now() - t0);
    setSimDone(true); setSimRunning(false);
  }, [simRunning]);

  const resetSim = () => { setFlowStep(0); setSimDone(false); setSimRunning(false); };

  const colStatuses: Record<ColumnId, ComponentStatus> = {
    marktdaten: flowStep >= 1 ? "online"      : ps.marktdaten.status,
    backtrader: flowStep === 2 ? "calculating" : flowStep > 2 ? "online" : ps.backtrader.status,
    terminal:   flowStep >= 3 ? "online"      : ps.terminal.status,
    ibkr:       flowStep >= 4 ? "online"      : ps.ibkr.status,
    boerse:     flowStep >= 5 ? "online"      : ps.boerse.status,
  };

  return (
    <>
      <style>{`
        @keyframes plsDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.65)} }
        @keyframes blkDot { 0%,100%{opacity:1} 50%{opacity:0.15} }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "#040303",
        display: "flex", flexDirection: "column",
        fontFamily: FL, overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          flexShrink: 0, height: 46,
          borderBottom: `1px solid ${BORDER_IDLE}`,
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 10,
        }}>
          {/* Mode buttons */}
          <button
            onClick={() => { setSimMode(false); resetSim(); }}
            style={{
              padding: "4px 12px", borderRadius: 5, cursor: "pointer",
              background: !simMode ? "rgba(34,197,94,0.1)" : "none",
              border: `1px solid ${!simMode ? GREEN : "#2A2A2A"}`,
              color: !simMode ? GREEN : DIM,
              fontSize: 10, fontFamily: FL,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <StatusDot status={!simMode ? "online" : "idle"} /> LIVE
          </button>
          <button
            onClick={() => setSimMode(true)}
            style={{
              padding: "4px 12px", borderRadius: 5, cursor: "pointer",
              background: simMode ? "rgba(201,168,76,0.1)" : "none",
              border: `1px solid ${simMode ? GOLD : "#2A2A2A"}`,
              color: simMode ? GOLD : DIM,
              fontSize: 10, fontFamily: FL,
            }}
          >
            ⚡ SIMULIEREN
          </button>

          {/* Sim controls */}
          {simMode && (
            <>
              <div style={{ width: 1, height: 20, background: BORDER_IDLE }} />
              <button
                onClick={runSimulation}
                disabled={simRunning}
                style={{
                  padding: "4px 14px", borderRadius: 5, cursor: simRunning ? "not-allowed" : "pointer",
                  background: simRunning ? "none" : "rgba(201,168,76,0.12)",
                  border: `1px solid ${simRunning ? "#2A2A2A" : GOLD}`,
                  color: simRunning ? DIM : GOLD,
                  fontSize: 10, fontFamily: FL,
                }}
              >
                {simRunning ? "Läuft…" : "▶ Signal auslösen"}
              </button>
              {flowStep > 0 && !simRunning && (
                <button onClick={resetSim} style={{
                  padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                  background: "none", border: `1px solid ${BORDER_IDLE}`,
                  color: DIM, fontSize: 10, fontFamily: FL,
                }}>
                  ↺ Reset
                </button>
              )}
            </>
          )}

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 10, color: DIM, fontFamily: FL, letterSpacing: "0.06em" }}>
            ⚡ LIVE PIPELINE
          </span>

          <button onClick={onClose} style={{
            background: "none", border: `1px solid ${BORDER_IDLE}`, borderRadius: 6,
            color: DIM, fontSize: 13, cursor: "pointer",
            width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            ✕
          </button>
        </div>

        {/* ── 5-column layout ── */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          padding: "16px 16px 16px",
          gap: 0,
          overflow: "hidden",
          position: "relative",
        }}>
          {COLUMNS.map((col, i) => (
            <div key={col.id} style={{ display: "flex", minWidth: 0 }}>
              <PipelineColumn
                col={col}
                status={colStatuses[col.id]}
                flowStep={flowStep}
                index={i + 1}
                ps={ps}
              />
              {i < COLUMNS.length - 1 && (
                <SvgConnector active={flowStep > i + 1} step={flowStep} />
              )}
            </div>
          ))}

          {simDone && (
            <SimDoneBanner ms={simMs} onClose={() => { setSimDone(false); resetSim(); }} />
          )}
        </div>
      </div>
    </>
  );
}
