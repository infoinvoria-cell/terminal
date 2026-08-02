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
  strategy: string;
  symbol:   string;
  direction: "LONG" | "SHORT";
  entry: number;
  sl:    number;
  tp:    number;
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
const GOLD  = "#C9A84C";
const RED   = "#EF4444";
const GREEN = "#22C55E";
const DIM   = "#9CA3AF";   // lighter than before
const DIM2  = "#4B5563";
const CARD  = "#111111";
const CARD2 = "#1A1A1A";
const BG    = "#090909";
const BORDER = "#1A1A1A";
const SEP    = "#1F1F1F";

// ── Mock ───────────────────────────────────────────────────────────────────────

const MOCK: PipelineStatus = {
  marktdaten: { status: "online",  last_bar: new Date().toISOString(), bars_today: 47 },
  backtrader:  { status: "idle",   last_calc: new Date().toISOString(), last_signal: "EUR 30M → SHORT", engine_v: "2.4.1" },
  terminal:    { status: "online", active_signals: 3, portfolio_value: 1_250_000 },
  ibkr:        { status: "idle",   mode: "paper", account: "DU123456", buying_power: 48_200 },
  boerse:      { status: "idle",   exchange: "CME", market_hours: "08:00–17:00 CT", last_exec: "–" },
  signals: [{
    strategy:    "EUR 30M Master Regime",
    symbol:      "6E",
    direction:   "SHORT",
    entry:       1.1525,
    sl:          1.1512,
    tp:          1.1564,
    countdown:   "34:01",
    triggered_at: new Date().toISOString(),
    atr:         0.00123,
    regime:      "Active",
    session:     "07:00–11:00 UTC",
    last_cross:  "2026-05-12",
    parity:      80.7,
  }],
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

function Dot({ status, size = 8 }: { status: ComponentStatus; size?: number }) {
  const c = status === "online" ? GREEN : status === "calculating" ? GOLD : status === "error" ? RED : DIM2;
  const anim = status === "online" ? "lp-pulse 1.8s ease-in-out infinite"
             : status === "calculating" ? "lp-blink 1s ease-in-out infinite"
             : "none";
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      borderRadius: "50%",
      background: c,
      flexShrink: 0,
      boxShadow: status !== "idle" ? `0 0 6px ${c}` : "none",
      animation: anim,
    }} />
  );
}

// ── KV row ─────────────────────────────────────────────────────────────────────

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: DIM, fontFamily: FL }}>{label}</span>
      <span style={{ fontSize: 14, color: color ?? "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: SEP, margin: "10px 0" }} />;
}

// ── Sub-card ───────────────────────────────────────────────────────────────────

function SubCard({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <div style={{
      background: CARD2,
      border: `1px solid ${gold ? `${GOLD}44` : BORDER}`,
      borderRadius: 10,
      padding: "14px 16px",
      marginBottom: 10,
      transition: "border-color 0.3s",
    }}>
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: DIM2, fontFamily: FL, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ── Signal card (column 1) ─────────────────────────────────────────────────────

function SignalCard({ signal, active }: { signal: PipelineSignal; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isShort = signal.direction === "SHORT";
  const dirColor = isShort ? RED : GREEN;
  const tpPct  = ((signal.tp - signal.entry) / signal.entry * 100).toFixed(2);
  const slPct  = ((signal.sl - signal.entry) / signal.entry * 100).toFixed(2);
  const tpPips = Math.abs((signal.tp - signal.entry) * 10000).toFixed(0);
  const slPips = Math.abs((signal.sl - signal.entry) * 10000).toFixed(0);

  return (
    <div style={{
      background: CARD2,
      border: `1px solid ${active ? GOLD : BORDER}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: active ? `0 0 18px rgba(201,168,76,0.18)` : "none",
      transition: "border-color 0.35s, box-shadow 0.35s",
      marginBottom: 10,
    }}>
      {/* direction stripe */}
      <div style={{ height: 3, background: dirColor, opacity: 0.8 }} />

      <div style={{ padding: "14px 16px 0" }}>
        {/* header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
                {signal.symbol}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: dirColor,
                border: `1px solid ${dirColor}44`, borderRadius: 4,
                padding: "2px 7px", fontFamily: FL, letterSpacing: "0.05em",
              }}>
                {isShort ? "▼" : "▲"} {signal.direction}
              </span>
            </div>
            <div style={{ fontSize: 12, color: DIM, fontFamily: FL }}>
              {signal.strategy}
            </div>
          </div>
          {signal.countdown && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: GOLD, fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>
                {signal.countdown}
              </div>
              <div style={{ fontSize: 11, color: DIM, fontFamily: FL }}>
                {fmtTime(signal.triggered_at)}
              </div>
            </div>
          )}
        </div>

        {/* Entry */}
        <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, fontFamily: FN, fontVariantNumeric: "tabular-nums", marginBottom: 10 }}>
          {signal.entry.toFixed(4)}
        </div>

        {/* TP / SL */}
        <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: GREEN, fontFamily: FL, marginBottom: 3 }}>Take Profit</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, fontFamily: FN }}>+{tpPct}% · +{tpPips} pip</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: RED, fontFamily: FL, marginBottom: 3 }}>Stop Loss</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: RED, fontFamily: FN }}>{slPct}% · −{slPips} pip</div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        padding: "8px 16px",
        borderTop: `1px solid ${SEP}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: DIM2, fontFamily: FL }}>📈 Chart öffnen</span>
        <button onClick={() => setExpanded(!expanded)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: DIM, fontFamily: FL, display: "flex", alignItems: "center", gap: 4,
        }}>
          Details {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* expanded */}
      {expanded && (
        <div style={{ padding: "12px 16px 14px", borderTop: `1px solid ${SEP}` }}>
          {([
            ["Entry",          signal.entry.toFixed(4)],
            ["SL",             `${signal.sl.toFixed(4)} (−${slPips} Pips)`],
            ["TP",             `${signal.tp.toFixed(4)} (+${tpPips} Pips)`],
            ...(signal.atr       ? [["ATR",           signal.atr.toFixed(5)]]       : []),
            ...(signal.regime    ? [["Regime",         signal.regime]]               : []),
            ...(signal.session   ? [["Session",        signal.session]]              : []),
            ...(signal.last_cross ? [["Letzter Cross", signal.last_cross]]           : []),
            ...(signal.parity    ? [["Parity",         `${signal.parity.toFixed(1)} %`]] : []),
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: DIM, fontFamily: FL }}>{l}</span>
              <span style={{ fontSize: 13, color: "#F5F5F5", fontFamily: FN, fontVariantNumeric: "tabular-nums" }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column body content (cols 2–5) ─────────────────────────────────────────────

function ColContent({ id, flowStep, ps }: { id: string; flowStep: number; ps: PipelineStatus }) {

  if (id === "backtrader") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <SubCard>
        <SubLabel>Engine Info</SubLabel>
        <KV label="Version"          value={ps.backtrader.engine_v ?? "–"} />
        <KV label="Letzte Berechnung" value={fmtTime(ps.backtrader.last_calc)} />
      </SubCard>
      {flowStep >= 2 && (
        <SubCard gold={flowStep === 2}>
          <SubLabel>Signal Output</SubLabel>
          {flowStep === 2
            ? <div style={{ fontSize: 13, color: GOLD, fontFamily: FL, animation: "lp-blink 1s ease-in-out infinite" }}>Berechne Signal…</div>
            : <>
                <div style={{ fontSize: 13, color: GREEN, fontFamily: FL, marginBottom: 8 }}>✓ Signal berechnet</div>
                <KV label="Signal" value={ps.backtrader.last_signal ?? ps.signals[0]?.direction ?? "–"} color={GREEN} />
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
        <KV label="Aktive Signale"   value={String(ps.terminal.active_signals ?? 0)} />
        <Divider />
        <KV label="Portfolio Value"  value={fmtEur(ps.terminal.portfolio_value)} color={GOLD} />
        <KV label="Status"           value="Online" color={GREEN} />
      </SubCard>
      {flowStep > 3 && ps.signals[0] && (
        <SubCard gold>
          <SubLabel>Signal Preview</SubLabel>
          <div style={{ fontSize: 18, fontWeight: 800, color: ps.signals[0].direction === "SHORT" ? RED : GREEN, fontFamily: FN, marginBottom: 8 }}>
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
        <KV label="Modus"         value={ps.ibkr.mode === "paper" ? "Paper Trading" : "Live"} color={ps.ibkr.mode === "paper" ? GOLD : GREEN} />
        <KV label="Account"       value={ps.ibkr.account ?? "–"} />
        <Divider />
        <KV label="Buying Power"  value={fmtEur(ps.ibkr.buying_power)} />
      </SubCard>
      {flowStep > 4 && (
        <SubCard gold>
          <SubLabel>Order Queue</SubLabel>
          <div style={{ fontSize: 13, color: GOLD, fontFamily: FL, marginBottom: 8 }}>📤 Order übermittelt</div>
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
          <div style={{ fontSize: 13, color: GREEN, fontFamily: FL, marginBottom: 8 }}>✓ Order ausgeführt</div>
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
    <div style={{
      width: 32, flexShrink: 0,
      display: "flex", alignItems: "flex-start",
      paddingTop: 46,
    }}>
      <div style={{ position: "relative", width: "100%", height: 24, display: "flex", alignItems: "center" }}>
        {/* line */}
        <div style={{
          position: "absolute", left: 0, right: 0, height: 2,
          background: active ? GOLD : "transparent",
          borderTop: active ? "none" : `2px dashed #2A2A2A`,
          opacity: active ? 0.85 : 1,
          transition: "background 0.4s, border 0.4s",
        }} />
        {/* travelling dot */}
        {active && (
          <div style={{
            position: "absolute",
            width: 8, height: 8,
            borderRadius: "50%",
            background: GOLD,
            boxShadow: `0 0 8px ${GOLD}, 0 0 14px ${GOLD}55`,
            top: "50%", transform: "translateY(-50%)",
            animation: "lp-flow 0.9s linear infinite",
          }} />
        )}
      </div>
    </div>
  );
}

// ── Sim done ──────────────────────────────────────────────────────────────────

function SimBanner({ ms, onClose }: { ms: number; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
      background: "#0E0E0E",
      border: `1px solid ${GREEN}`,
      borderRadius: 12,
      padding: "18px 32px",
      zIndex: 200, textAlign: "center", minWidth: 320,
      boxShadow: `0 0 30px rgba(34,197,94,0.12)`,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: GREEN, fontFamily: FL, marginBottom: 6 }}>
        ✓ Simulation abgeschlossen
      </div>
      <div style={{ fontSize: 12, color: DIM, fontFamily: FL, marginBottom: 4 }}>
        Gesamtzeit: <strong style={{ color: "#F5F5F5" }}>{(ms / 1000).toFixed(1)} s</strong>
      </div>
      <div style={{ fontSize: 11, color: DIM2, fontFamily: FL, marginBottom: 14 }}>
        Marktdaten → Signal: 0.3s · Terminal: 0.2s · TWS → Börse: 0.5s
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

// ── Hdr button ────────────────────────────────────────────────────────────────

function HdrBtn({
  children, active, color, onClick, disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  color?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const c = color ?? "#9CA3AF";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "5px 14px", borderRadius: 6,
      background: active ? `${c}18` : "none",
      border: `1px solid ${active ? c : "#2C2C2C"}`,
      color: disabled ? "#4B5563" : (active ? c : "#9CA3AF"),
      fontSize: 11, fontFamily: FL, fontWeight: 600, letterSpacing: "0.04em",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", gap: 6,
      transition: "background 0.2s, border-color 0.2s, color 0.2s",
    }}>
      {children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface LivePipelineViewProps {
  onClose: () => void;
  initialSignals?: SignalCardModel[];
}

export default function LivePipelineView({ onClose }: LivePipelineViewProps) {
  const [ps, setPs]             = useState<PipelineStatus>(MOCK);
  const [flowStep, setFlowStep] = useState(0);
  const [simMode, setSimMode]   = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone]   = useState(false);
  const [simMs, setSimMs]       = useState(0);

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
    marktdaten: flowStep >= 1 ? "online"      : ps.marktdaten.status,
    backtrader: flowStep === 2 ? "calculating" : flowStep > 2 ? "online" : ps.backtrader.status,
    terminal:   flowStep >= 3 ? "online"      : ps.terminal.status,
    ibkr:       flowStep >= 4 ? "online"      : ps.ibkr.status,
    boerse:     flowStep >= 5 ? "online"      : ps.boerse.status,
  };

  const statusLabel = (s: ComponentStatus) =>
    s === "online" ? "Online" : s === "calculating" ? "Berechnung" : s === "error" ? "Fehler" : "Wartet";

  const statusColor = (s: ComponentStatus) =>
    s === "online" ? GREEN : s === "calculating" ? GOLD : s === "error" ? RED : DIM2;

  return (
    <>
      <style>{`
        @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.6)} }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
        @keyframes lp-flow  { 0%{left:0%;opacity:1} 100%{left:calc(100% - 8px);opacity:0} }
        .lp-scroll::-webkit-scrollbar { width: 3px }
        .lp-scroll::-webkit-scrollbar-track { background: transparent }
        .lp-scroll::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px }
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
          flexShrink: 0, height: 52,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center",
          padding: "0 24px", gap: 10,
          background: "#0C0C0C",
        }}>
          {/* LIVE */}
          <HdrBtn
            active={!simMode} color={GREEN}
            onClick={() => { setSimMode(false); reset(); }}
          >
            <Dot status={!simMode ? "online" : "idle"} size={7} />
            LIVE
          </HdrBtn>

          {/* SIMULIEREN */}
          <HdrBtn active={simMode} color={GOLD} onClick={() => setSimMode(true)}>
            ⚡ SIMULIEREN
          </HdrBtn>

          {simMode && (
            <>
              <div style={{ width: 1, height: 22, background: BORDER }} />
              <HdrBtn
                active color={GOLD}
                onClick={runSim}
                disabled={simRunning}
              >
                {simRunning ? "Läuft…" : "▶ Signal auslösen"}
              </HdrBtn>
              {flowStep > 0 && !simRunning && (
                <HdrBtn onClick={reset}>↺ Reset</HdrBtn>
              )}
            </>
          )}

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 11, color: "#3A3A3A", fontFamily: FL, letterSpacing: "0.10em", textTransform: "uppercase" as const }}>
            Live Pipeline
          </span>

          <button onClick={onClose} style={{
            background: "none", border: `1px solid #2C2C2C`, borderRadius: 7,
            color: DIM, fontSize: 14, cursor: "pointer",
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
          padding: "24px", gap: 0,
          overflow: "hidden", position: "relative",
        }}>
          {COLS.map((col, i) => {
            const st = statuses[col.id];
            const sc = statusColor(st);
            return (
              <div key={col.id} style={{ display: "flex", flex: 1, minWidth: 0 }}>
                {/* Column card */}
                <div style={{
                  flex: 1,
                  background: CARD,
                  border: `1px solid ${flowStep >= i + 1 ? `${GOLD}2A` : BORDER}`,
                  borderLeft: `2px solid ${flowStep >= i + 1 ? sc : "#1F1F1F"}`,
                  borderRadius: 12,
                  display: "flex", flexDirection: "column",
                  overflow: "hidden",
                  transition: "border-color 0.4s",
                }}>
                  {/* Column header */}
                  <div style={{
                    padding: "16px 18px 14px",
                    borderBottom: `1px solid ${SEP}`,
                    flexShrink: 0,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: flowStep >= i + 1 ? "#F5F5F5" : "#6B7280", fontFamily: FL, transition: "color 0.4s" }}>
                        {col.title}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Dot status={st} size={8} />
                        <span style={{ fontSize: 11, color: sc, fontFamily: FL, fontWeight: 600 }}>
                          {statusLabel(st)}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: DIM2, fontFamily: FL }}>{col.sub}</div>
                  </div>

                  {/* Column body */}
                  <div className="lp-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 14px 12px" }}>
                    {col.id === "marktdaten"
                      ? ps.signals.map((sig, j) => (
                          <SignalCard key={j} signal={sig} active={flowStep >= 1} />
                        ))
                      : <ColContent id={col.id} flowStep={flowStep} ps={ps} />
                    }
                  </div>
                </div>

                {/* Connector */}
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
