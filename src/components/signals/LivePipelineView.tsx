"use client";

import { useCallback, useEffect, useState } from "react";
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
  strategy:      string;
  symbol:        string;
  direction:     "LONG" | "SHORT";
  entry:         number;
  sl:            number;
  tp:            number;
  countdown?:    string;
  triggered_at?: string;
  atr?:          number;
  regime?:       string;
  session?:      string;
  last_cross?:   string;
  parity?:       number;
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const FL = "Montserrat, sans-serif";
const FN = "Nunito, sans-serif";
const GOLD   = "#C9A84C";
const RED    = "#EF4444";
const GREEN  = "#22C55E";
const DIM    = "#9CA3AF";
const DIM2   = "#4B5563";
const CARD   = "#111111";
const CARD2  = "#1A1A1A";
const BG     = "#090909";
const BORDER = "#1A1A1A";
const SEP    = "#1F1F1F";

// ── Empty fallback (no mock data) ──────────────────────────────────────────────

const EMPTY_STATUS: PipelineStatus = {
  marktdaten: { status: "idle"  },
  backtrader:  { status: "idle" },
  terminal:    { status: "online" },
  ibkr:        { status: "idle" },
  boerse:      { status: "idle" },
  signals: [],
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

function Dot({ status, size = 7 }: { status: ComponentStatus; size?: number }) {
  const c = status === "online" ? GREEN : status === "calculating" ? GOLD : status === "error" ? RED : DIM2;
  const anim = status === "online"      ? "lp-pulse 1.8s ease-in-out infinite"
             : status === "calculating" ? "lp-blink 1s ease-in-out infinite"
             : "none";
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: c, flexShrink: 0,
      boxShadow: status !== "idle" ? `0 0 5px ${c}` : "none",
      animation: anim,
    }} />
  );
}

// ── Compact KV row ─────────────────────────────────────────────────────────────

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: DIM, fontFamily: FL }}>{label}</span>
      <span style={{ fontSize: 13, color: color ?? "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: SEP, margin: "7px 0" }} />;
}

// ── Sub-card (inside column) ───────────────────────────────────────────────────

function SubCard({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <div style={{
      background: CARD2,
      border: `1px solid ${gold ? `${GOLD}55` : BORDER}`,
      borderRadius: 9,
      padding: "11px 12px",
      marginBottom: 8,
      transition: "border-color 0.3s",
    }}>
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, color: DIM2, fontFamily: FL, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({ signal, active }: { signal: PipelineSignal; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isShort  = signal.direction === "SHORT";
  const dirColor = isShort ? RED : GREEN;
  const tpPct  = ((signal.tp - signal.entry) / signal.entry * 100).toFixed(2);
  const slPct  = ((signal.sl - signal.entry) / signal.entry * 100).toFixed(2);
  const tpPips = Math.abs((signal.tp - signal.entry) * 10000).toFixed(0);
  const slPips = Math.abs((signal.sl - signal.entry) * 10000).toFixed(0);

  return (
    <div style={{
      background: CARD2,
      border: `1px solid ${active ? GOLD : BORDER}`,
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: active ? `0 0 16px rgba(201,168,76,0.16)` : "none",
      transition: "border-color 0.35s, box-shadow 0.35s",
      marginBottom: 8,
    }}>
      <div style={{ height: 2, background: dirColor, opacity: 0.75 }} />

      <div style={{ padding: "11px 12px 0" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
                {signal.symbol}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: dirColor,
                border: `1px solid ${dirColor}44`,
                borderRadius: 4, padding: "2px 6px",
                fontFamily: FL, letterSpacing: "0.05em",
              }}>
                {isShort ? "▼" : "▲"} {signal.direction}
              </span>
            </div>
            <div style={{ fontSize: 11, color: DIM, fontFamily: FL }}>
              {signal.strategy}
            </div>
          </div>
          {signal.countdown && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: GOLD, fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
                {signal.countdown}
              </div>
              <div style={{ fontSize: 10, color: DIM, fontFamily: FL }}>{fmtTime(signal.triggered_at)}</div>
            </div>
          )}
        </div>

        {/* entry */}
        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, fontFamily: FN, fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
          {signal.entry.toFixed(4)}
        </div>

        {/* TP / SL */}
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: GREEN, fontFamily: FL, marginBottom: 2 }}>TP +{tpPct}%</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, fontFamily: FN }}>+{tpPips} pip</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: RED, fontFamily: FL, marginBottom: 2 }}>SL {slPct}%</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, fontFamily: FN }}>−{slPips} pip</div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 12px",
        borderTop: `1px solid ${SEP}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: DIM2, fontFamily: FL }}>📈 Chart</span>
        <button onClick={() => setExpanded(!expanded)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, color: DIM, fontFamily: FL, display: "flex", alignItems: "center", gap: 3,
        }}>
          Details {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${SEP}` }}>
          {([
            ["Entry",   signal.entry.toFixed(4)],
            ["SL",     `${signal.sl.toFixed(4)} (−${slPips} Pips)`],
            ["TP",     `${signal.tp.toFixed(4)} (+${tpPips} Pips)`],
            ...(signal.atr       ? [["ATR",          signal.atr.toFixed(5)]]        : []),
            ...(signal.regime    ? [["Regime",        signal.regime]]                : []),
            ...(signal.session   ? [["Session",       signal.session]]               : []),
            ...(signal.last_cross ? [["Letzter Cross", signal.last_cross]]           : []),
            ...(signal.parity    ? [["Parity",        `${signal.parity.toFixed(1)} %`]] : []),
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: DIM,      fontFamily: FL }}>{l}</span>
              <span style={{ fontSize: 12, color: "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column body (cols 2–5) ─────────────────────────────────────────────────────

function ColContent({ id, flowStep, ps }: { id: string; flowStep: number; ps: PipelineStatus }) {
  if (id === "backtrader") return (
    <div>
      <SubCard>
        <SubLabel>Engine Info</SubLabel>
        <KV label="Version"           value={ps.backtrader.engine_v ?? "–"} />
        <KV label="Letzte Berechnung" value={fmtTime(ps.backtrader.last_calc)} />
      </SubCard>
      {flowStep >= 2 && (
        <SubCard gold={flowStep === 2}>
          <SubLabel>Signal Output</SubLabel>
          {flowStep === 2
            ? <div style={{ fontSize: 12, color: GOLD, fontFamily: FL, animation: "lp-blink 1s ease-in-out infinite" }}>Berechne Signal…</div>
            : <>
                <div style={{ fontSize: 12, color: GREEN, fontFamily: FL, marginBottom: 6 }}>✓ Signal berechnet</div>
                <KV label="Signal" value={ps.backtrader.last_signal ?? "–"} color={GREEN} />
              </>
          }
        </SubCard>
      )}
    </div>
  );

  if (id === "terminal") return (
    <div>
      <SubCard>
        <SubLabel>Dashboard KPIs</SubLabel>
        <KV label="Aktive Signale"  value={String(ps.terminal.active_signals ?? 0)} />
        <Divider />
        <KV label="Portfolio Value" value={fmtEur(ps.terminal.portfolio_value)} color={GOLD} />
        <KV label="Status"          value="Online" color={GREEN} />
      </SubCard>
      {flowStep > 3 && ps.signals[0] && (
        <SubCard gold>
          <SubLabel>Signal Preview</SubLabel>
          <div style={{ fontSize: 16, fontWeight: 800, color: ps.signals[0].direction === "SHORT" ? RED : GREEN, fontFamily: FN, marginBottom: 6 }}>
            {ps.signals[0].direction === "SHORT" ? "▼ SHORT" : "▲ LONG"} {ps.signals[0].symbol}
          </div>
          <KV label="Entry" value={ps.signals[0].entry.toFixed(4)} />
        </SubCard>
      )}
    </div>
  );

  if (id === "ibkr") return (
    <div>
      <SubCard>
        <SubLabel>TWS Verbindung</SubLabel>
        <KV label="Modus"        value={ps.ibkr.mode === "paper" ? "Paper Trading" : "Live"} color={ps.ibkr.mode === "paper" ? GOLD : GREEN} />
        <KV label="Account"      value={ps.ibkr.account ?? "–"} />
        <Divider />
        <KV label="Buying Power" value={fmtEur(ps.ibkr.buying_power)} />
      </SubCard>
      {flowStep > 4 && (
        <SubCard gold>
          <SubLabel>Order Queue</SubLabel>
          <div style={{ fontSize: 12, color: GOLD, fontFamily: FL, marginBottom: 6 }}>📤 Order übermittelt</div>
          {ps.signals[0] && <KV label="Instrument" value={ps.signals[0].symbol} />}
        </SubCard>
      )}
    </div>
  );

  if (id === "boerse") return (
    <div>
      <SubCard>
        <SubLabel>Börsen-Info</SubLabel>
        <KV label="Exchange"          value={ps.boerse.exchange ?? "CME"} />
        <KV label="Market Hours"      value={ps.boerse.market_hours ?? "–"} />
        <Divider />
        <KV label="Letzte Ausführung" value={ps.boerse.last_exec ?? "–"} />
      </SubCard>
      {flowStep >= 6 && (
        <SubCard>
          <SubLabel>Execution</SubLabel>
          <div style={{ fontSize: 12, color: GREEN, fontFamily: FL, marginBottom: 6 }}>✓ Order ausgeführt</div>
          <KV label="Slippage" value="0.1 pip" />
          <KV label="PnL"      value="+0.00 €" color={GREEN} />
        </SubCard>
      )}
    </div>
  );

  return null;
}

// ── Column definitions ─────────────────────────────────────────────────────────

const COLS = [
  { id: "marktdaten", title: "Marktdaten",      sub: "Live OHLC Feed" },
  { id: "backtrader", title: "Backtrader",       sub: "Signal Engine"  },
  { id: "terminal",   title: "Terminal",         sub: "Dashboard"      },
  { id: "ibkr",       title: "IBKR TWS",         sub: "Order Router"   },
  { id: "boerse",     title: "Börse / Accounts", sub: "CME / EUREX"    },
] as const;

type ColId = typeof COLS[number]["id"];

// ── Connector ─────────────────────────────────────────────────────────────────

function Connector({ active }: { active: boolean }) {
  return (
    <div style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 44 }}>
      <div style={{ position: "relative", width: "100%", height: 20, display: "flex", alignItems: "center" }}>
        <div style={{
          position: "absolute", left: 0, right: 0, height: 2,
          background: active ? GOLD : "transparent",
          borderTop: active ? "none" : `2px dashed #2A2A2A`,
          opacity: active ? 0.85 : 1,
          transition: "background 0.4s",
        }} />
        {active && (
          <div style={{
            position: "absolute",
            width: 8, height: 8, borderRadius: "50%",
            background: GOLD,
            boxShadow: `0 0 8px ${GOLD}, 0 0 16px ${GOLD}55`,
            top: "50%", transform: "translateY(-50%)",
            animation: "lp-flow 0.9s linear infinite",
          }} />
        )}
      </div>
    </div>
  );
}

// ── Sim done banner ────────────────────────────────────────────────────────────

function SimBanner({ ms, onClose }: { ms: number; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
      background: "#0C0C0C", border: `1px solid ${GREEN}`,
      borderRadius: 12, padding: "16px 28px",
      zIndex: 200, textAlign: "center", minWidth: 300,
      boxShadow: `0 0 28px rgba(34,197,94,0.12)`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, fontFamily: FL, marginBottom: 5 }}>
        Simulation abgeschlossen ✓
      </div>
      <div style={{ fontSize: 12, color: DIM, fontFamily: FL, marginBottom: 3 }}>
        Gesamtzeit: <strong style={{ color: "#F5F5F5" }}>{(ms / 1000).toFixed(1)} s</strong>
      </div>
      <div style={{ fontSize: 11, color: DIM2, fontFamily: FL, marginBottom: 12 }}>
        Marktdaten 0.3s · Signal 0.5s · Terminal 0.2s · TWS 0.3s · Börse 0.5s
      </div>
      <button onClick={onClose} style={{
        background: "none", border: `1px solid #2A2A2A`, borderRadius: 7,
        color: DIM, fontSize: 11, fontFamily: FL, cursor: "pointer", padding: "5px 16px",
      }}>
        Schließen
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface LivePipelineViewProps {
  onClose: () => void;
  initialSignals?: SignalCardModel[];
}

export default function LivePipelineView({ onClose }: LivePipelineViewProps) {
  const [ps, setPs]             = useState<PipelineStatus>(EMPTY_STATUS);
  const [flowStep, setFlowStep] = useState(0);
  const [simMode, setSimMode]   = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone]   = useState(false);
  const [simMs, setSimMs]       = useState(0);
  const [flaskOk, setFlaskOk]   = useState(false);

  // Poll /api/pipeline-status every 30s
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/pipeline-status");
        if (r.ok) {
          setPs(await r.json() as PipelineStatus);
          setFlaskOk(true);
        } else {
          setFlaskOk(false);
        }
      } catch {
        setFlaskOk(false);
      }
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

  const runSim = useCallback(async () => {
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

  const reset = () => { setFlowStep(0); setSimDone(false); setSimRunning(false); };

  const statuses: Record<ColId, ComponentStatus> = {
    marktdaten: flowStep >= 1 ? "online"       : ps.marktdaten.status,
    backtrader: flowStep === 2 ? "calculating"  : flowStep > 2 ? "online" : ps.backtrader.status,
    terminal:   flowStep >= 3 ? "online"        : ps.terminal.status,
    ibkr:       flowStep >= 4 ? "online"        : ps.ibkr.status,
    boerse:     flowStep >= 5 ? "online"        : ps.boerse.status,
  };

  const statusLabel = (s: ComponentStatus) =>
    s === "online" ? "Online" : s === "calculating" ? "Berechnung" : s === "error" ? "Fehler" : "Wartet";

  const statusColor = (s: ComponentStatus) =>
    s === "online" ? GREEN : s === "calculating" ? GOLD : s === "error" ? RED : DIM2;

  return (
    <>
      <style>{`
        @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.55)} }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.12} }
        @keyframes lp-flow  { 0%{left:0%;opacity:1} 100%{left:calc(100% - 8px);opacity:0} }
        .lp-scroll::-webkit-scrollbar{width:3px}
        .lp-scroll::-webkit-scrollbar-track{background:transparent}
        .lp-scroll::-webkit-scrollbar-thumb{background:#2A2A2A;border-radius:2px}
      `}</style>

      <div style={{
        position: "fixed", top: 0, bottom: 0, right: 0, left: 55,
        width: "calc(100vw - 55px)",
        zIndex: 9000,
        background: BG,
        display: "flex", flexDirection: "column",
        fontFamily: FL, overflow: "hidden",
      }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, height: 50,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 8,
          background: "#0C0C0C",
        }}>
          {/* LIVE button */}
          <button
            onClick={() => { setSimMode(false); reset(); }}
            style={{
              padding: "5px 14px", borderRadius: 6, cursor: "pointer",
              background: !simMode ? "rgba(34,197,94,0.12)" : "none",
              border: `1px solid ${!simMode ? GREEN : "#2C2C2C"}`,
              color: !simMode ? GREEN : DIM,
              fontSize: 11, fontFamily: FL, fontWeight: 700, letterSpacing: "0.04em",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            <Dot status={!simMode ? "online" : "idle"} size={7} />
            LIVE
          </button>

          {/* SIMULIEREN — prominent gold fill */}
          <button
            onClick={() => { setSimMode(true); }}
            style={{
              padding: "5px 16px", borderRadius: 6, cursor: "pointer",
              background: simMode ? GOLD : "rgba(201,168,76,0.12)",
              border: `1px solid ${GOLD}`,
              color: simMode ? "#000000" : GOLD,
              fontSize: 11, fontFamily: FL, fontWeight: 700, letterSpacing: "0.04em",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            ⚡ SIMULIEREN
          </button>

          {/* Sim controls — appear when simMode */}
          {simMode && (
            <>
              <div style={{ width: 1, height: 22, background: BORDER }} />

              {/* Signal auslösen */}
              <button
                onClick={runSim}
                disabled={simRunning}
                style={{
                  padding: "5px 16px", borderRadius: 6,
                  cursor: simRunning ? "not-allowed" : "pointer",
                  background: simRunning ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.18)",
                  border: `1px solid ${simRunning ? "#3A3A2A" : GOLD}`,
                  color: simRunning ? "#A0903A" : GOLD,
                  fontSize: 11, fontFamily: FL, fontWeight: 700, letterSpacing: "0.04em",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.2s",
                }}
              >
                {simRunning
                  ? <><Dot status="calculating" size={6} /> Läuft…</>
                  : "▶ Signal auslösen"
                }
              </button>

              {/* Reset (only after sim ran) */}
              {flowStep > 0 && !simRunning && (
                <button onClick={reset} style={{
                  padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                  background: "none", border: "1px solid #2C2C2C",
                  color: DIM, fontSize: 11, fontFamily: FL, fontWeight: 600,
                  transition: "all 0.2s",
                }}>
                  ↺ Reset
                </button>
              )}
            </>
          )}

          <div style={{ flex: 1 }} />

          {/* Flask status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 8 }}>
            <Dot status={flaskOk ? "online" : "idle"} size={6} />
            <span style={{ fontSize: 10, color: flaskOk ? GREEN : DIM2, fontFamily: FL }}>
              {flaskOk ? "Flask verbunden" : "Flask offline"}
            </span>
          </div>

          <span style={{ fontSize: 10, color: "#2D2D2D", fontFamily: FL, letterSpacing: "0.10em", textTransform: "uppercase" as const, marginRight: 12 }}>
            Live Pipeline
          </span>

          <button onClick={onClose} style={{
            background: "none", border: "1px solid #2C2C2C", borderRadius: 7,
            color: DIM, fontSize: 13, cursor: "pointer",
            width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.2s, color 0.2s",
          }}>
            ✕
          </button>
        </div>

        {/* ── Column grid ──────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: "flex", alignItems: "stretch",
          padding: "20px", gap: 0,
          overflow: "hidden", position: "relative",
        }}>
          {COLS.map((col, i) => {
            const st = statuses[col.id];
            const sc = statusColor(st);
            const isLit = flowStep >= i + 1;

            return (
              <div key={col.id} style={{ display: "flex", flex: 1, minWidth: 0 }}>
                {/* Column card */}
                <div style={{
                  flex: 1,
                  background: CARD,
                  border: `1px solid ${isLit ? `${GOLD}33` : BORDER}`,
                  borderLeft: `2px solid ${isLit ? sc : "#1F1F1F"}`,
                  borderRadius: 12,
                  display: "flex", flexDirection: "column",
                  overflow: "hidden",
                  transition: "border-color 0.4s, box-shadow 0.4s",
                  boxShadow: isLit ? `inset 0 0 30px rgba(201,168,76,0.03)` : "none",
                }}>
                  {/* Column header */}
                  <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${SEP}`, flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, fontFamily: FL,
                        color: isLit ? "#F5F5F5" : "#5A5A5A",
                        transition: "color 0.4s",
                      }}>
                        {col.title}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Dot status={st} size={7} />
                        <span style={{ fontSize: 10, color: sc, fontFamily: FL, fontWeight: 600 }}>
                          {statusLabel(st)}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: DIM2, fontFamily: FL }}>{col.sub}</div>
                  </div>

                  {/* Column body */}
                  <div className="lp-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 12px 10px" }}>
                    {col.id === "marktdaten" ? (
                      ps.signals.length > 0
                        ? ps.signals.map((sig, j) => (
                            <SignalCard key={j} signal={sig} active={flowStep >= 1} />
                          ))
                        : (
                          <div style={{ textAlign: "center", paddingTop: 32 }}>
                            <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.3 }}>📭</div>
                            <div style={{ fontSize: 12, color: DIM2, fontFamily: FL }}>
                              Keine aktiven Signale
                            </div>
                            <div style={{ fontSize: 10, color: "#2A2A2A", fontFamily: FL, marginTop: 6 }}>
                              {flaskOk ? "Flask verbunden · Warte auf Signal" : "Flask nicht erreichbar"}
                            </div>
                          </div>
                        )
                    ) : (
                      <ColContent id={col.id} flowStep={flowStep} ps={ps} />
                    )}
                  </div>
                </div>

                {/* Connector between columns */}
                {i < COLS.length - 1 && (
                  <Connector active={flowStep > i + 1} />
                )}
              </div>
            );
          })}

          {simDone && (
            <SimBanner ms={simMs} onClose={() => { setSimDone(false); reset(); }} />
          )}
        </div>
      </div>
    </>
  );
}
