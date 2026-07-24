"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
} from "@/lib/components/ws-strategy-data";

// ── design tokens (matching dashboard) ───────────────────────────────────────
const GOLD  = "#e2ca7a";
const MUTED = "#737373";
const DIM   = "#4a4a4a";
const RED   = "#c0392b";
const BG    = "#0c0d10";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const ROW_BORDER  = "rgba(255,255,255,0.04)";

// ── unified display row ───────────────────────────────────────────────────────
type Section = "ws" | "ci";
interface DisplayRow {
  id: string;
  section: Section;
  ticker: string;
  label: string;
  group: string;
  engine: string;
  pillarLabel: string;
  weight: number | null;
  sharpeOos: number | null;
  cagr: string | null;
  maxDd: string | null;
  pf: number | null;
  trades: number | null;
  wfWin: string | null;   // WF for WS, winRate for CI sleeves
  status: string;
  dataFile?: string;
  isNotes?: string;
  exchange?: string;
  calmar?: number | null;
}

function wsToDisplay(r: StrategyRow): DisplayRow {
  return {
    id: r.id, section: "ws",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarLabel: PILLAR_META[r.pillar].label,
    weight: r.weight, sharpeOos: r.sharpeOos,
    cagr: r.cagr, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.wfOos, status: r.status,
    dataFile: r.dataFile, isNotes: r.isNotes, exchange: r.exchange,
    calmar: r.calmar,
  };
}
function ciToDisplay(r: CoreInvestRow): DisplayRow {
  return {
    id: r.id, section: "ci",
    ticker: r.ticker, label: r.label, group: r.group, engine: r.engine,
    pillarLabel: CI_META[r.pillar as CIPillar].label,
    weight: r.weight, sharpeOos: null,
    cagr: r.totalReturn ?? null, maxDd: r.maxDd, pf: r.pf, trades: r.trades,
    wfWin: r.winRate, status: r.status,
    exchange: undefined, isNotes: r.notes, calmar: null,
  };
}

// ── data types for JSON files ────────────────────────────────────────────────
interface EquityPoint { time: string; value: number; }
interface Trade { entry_time: string; exit_time: string; entry_price: number; exit_price: number; pnl: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number; } };
  equityCurve: { oos: EquityPoint[] };
  drawdownCurve: { oos: EquityPoint[] };
  trades?: Trade[];
}
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtNum(v: number | null, dec = 2): string {
  return v === null ? "—" : v.toFixed(dec);
}
function numColor(v: string | null | number): string {
  if (v === null || v === undefined) return MUTED;
  const s = String(v);
  if (s.startsWith("+")) return GOLD;
  if (s.startsWith("−") || s.startsWith("-")) return RED;
  if (typeof v === "number" && v > 0) return GOLD;
  if (typeof v === "number" && v < 0) return RED;
  return "rgba(255,255,255,0.85)";
}

// ── mini KPI card (home-page style, smaller for inline use) ──────────────────
function MiniKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const isNeg = value.startsWith("−") || value.startsWith("-");
  const isPos = value.startsWith("+") || (!isNeg && /^\d/.test(value) && parseFloat(value) > 0);
  return (
    <div style={{
      background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 16, padding: "14px 16px 16px",
      minWidth: 100, flex: 1,
      boxShadow: "0 12px 28px -10px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, fontWeight: 500, color: MUTED, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: ".06em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", color: isNeg ? RED : isPos ? GOLD : "rgba(255,255,255,0.9)" }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, color: DIM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── candlestick chart (lightweight-charts v5) ────────────────────────────────
function CandleChart({ ticker, trades }: { ticker: string; trades: Trade[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);

  useEffect(() => {
    const sym = encodeURIComponent(ticker.split(" ")[0]);
    fetch(`/api/monitoring/ohlc?symbol=${sym}&timeframe=1D`)
      .then(r => r.json())
      .then(d => setBars(Array.isArray(d.bars) && d.bars.length ? d.bars : []))
      .catch(() => setBars([]));
  }, [ticker]);

  useEffect(() => {
    if (!ref.current || !bars || bars.length === 0) return;
    let chartInst: { remove: () => void } | null = null;
    import("lightweight-charts").then(({ createChart, CandlestickSeries, createSeriesMarkers }) => {
      if (!ref.current) return;
      const el = ref.current;
      const chart = createChart(el, {
        width: el.clientWidth, height: 200,
        layout: { background: { color: "transparent" }, textColor: MUTED },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
      });
      chartInst = chart;
      const series = chart.addSeries(CandlestickSeries, {
        upColor: GOLD, downColor: RED,
        borderUpColor: GOLD, borderDownColor: RED,
        wickUpColor: GOLD, wickDownColor: RED,
      });
      series.setData(bars.filter(b => b.time >= "2019-01-01"));
      const seen = new Set<string>();
      const markers: Array<{ time: string; position: "belowBar" | "aboveBar"; color: string; shape: "arrowUp" | "arrowDown"; text: string }> = [];
      for (const t of trades) {
        const et = t.entry_time?.slice(0, 10);
        if (et && et >= "2019-01-01" && !seen.has(`e_${et}`)) {
          seen.add(`e_${et}`);
          markers.push({ time: et, position: "belowBar", color: "rgba(255,255,255,0.5)", shape: "arrowUp", text: "" });
        }
        const xt = t.exit_time?.slice(0, 10);
        if (xt && xt >= "2019-01-01" && !seen.has(`x_${xt}`)) {
          seen.add(`x_${xt}`);
          markers.push({ time: xt, position: "aboveBar", color: t.pnl > 0 ? GOLD : RED, shape: "arrowDown", text: "" });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof createSeriesMarkers === "function") (createSeriesMarkers as any)(series, markers.sort((a, b) => a.time.localeCompare(b.time)));
      chart.timeScale().fitContent();
    });
    return () => { chartInst?.remove(); };
  }, [bars, trades]);

  if (bars === null) return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontSize: 11, fontFamily: "var(--font-montserrat),sans-serif" }}>Lade Chart…</div>;
  if (bars.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: "var(--font-montserrat),sans-serif", color: DIM, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>OHLC 2019 – 2026 · ▲ Entry · ▼ Exit</div>
      <div ref={ref} style={{ borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}

// ── equity area chart ─────────────────────────────────────────────────────────
function EquityChart({ data, label }: { data: EquityPoint[]; label: string }) {
  const step = Math.max(1, Math.floor(data.length / 150));
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1)
    .map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value) }));
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: "var(--font-montserrat),sans-serif", color: DIM, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>{label}</div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={GOLD} stopOpacity={0.25} />
              <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#1c1d20", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, fontSize: 11, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`$${Number(v ?? 0).toLocaleString("de", { maximumFractionDigits: 0 })}`, "Equity"]}
          />
          <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={1.5} fill="url(#eqg)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DdChart({ data }: { data: EquityPoint[] }) {
  const step = Math.max(1, Math.floor(data.length / 150));
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1)
    .map(p => ({ t: p.time.slice(0, 7), v: Math.round(p.value * 100) / 100 }));
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: "var(--font-montserrat),sans-serif", color: DIM, letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 }}>Drawdown OOS</div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={RED} stopOpacity={0.3} />
              <stop offset="95%" stopColor={RED} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: "#1c1d20", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, fontSize: 11, fontFamily: "var(--font-montserrat),sans-serif", color: "#fff" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "DD"]}
          />
          <Area type="monotone" dataKey="v" stroke={RED} strokeWidth={1.5} fill="url(#ddg)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── expanded row content ──────────────────────────────────────────────────────
function ExpandedContent({ row }: { row: DisplayRow }) {
  const [data, setData] = useState<StrategyData | null>(null);

  useEffect(() => {
    if (!row.dataFile) return;
    fetch(`/data/${row.dataFile}`).then(r => r.json()).then(setData).catch(() => {});
  }, [row.dataFile]);

  const trades = data?.trades ?? [];
  const eqOos  = data?.equityCurve?.oos;
  const ddOos  = data?.drawdownCurve?.oos;

  return (
    <div style={{ padding: "20px 24px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid ${ROW_BORDER}` }}>
      {/* engine + exchange info */}
      <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: DIM, marginBottom: 16 }}>
        {row.engine}{row.exchange ? ` · ${row.exchange}` : ""}{row.group ? ` · ${row.group}` : ""}
      </div>

      {/* IS notes */}
      {row.isNotes && (
        <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: GOLD, background: "rgba(226,202,122,0.06)", border: `1px solid rgba(226,202,122,0.15)`, borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
          {row.isNotes}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" as const }}>
        {row.sharpeOos !== null && <MiniKpi label="Sharpe OOS" value={fmtNum(row.sharpeOos)} />}
        {row.cagr      && <MiniKpi label={row.section === "ci" ? "Total Return" : "CAGR OOS"} value={row.cagr} />}
        {row.maxDd     && <MiniKpi label="Max DD" value={row.maxDd} />}
        {row.pf        !== null && row.pf !== undefined && <MiniKpi label="Profit Factor" value={fmtNum(row.pf)} />}
        {row.trades    !== null && row.trades !== undefined && <MiniKpi label="Trades" value={String(row.trades)} />}
        {row.wfWin     && <MiniKpi label={row.section === "ci" ? "Win Rate" : "WF / OOS"} value={row.wfWin} />}
        {row.calmar    !== null && row.calmar !== undefined && <MiniKpi label="Calmar" value={fmtNum(row.calmar)} />}
      </div>

      {/* Charts */}
      {trades.length > 0 && <div style={{ marginBottom: 20 }}><CandleChart ticker={row.ticker} trades={trades} /></div>}
      {eqOos && eqOos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <EquityChart data={eqOos} label={`Equity OOS · ${data?.summary.oos.cagr.toFixed(2)}% CAGR`} />
          {ddOos && ddOos.length > 0 && <DdChart data={ddOos} />}
        </div>
      )}

      {!row.dataFile && row.section === "ws" && (
        <div style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 11, color: DIM, textAlign: "center" as const, paddingTop: 8 }}>
          Equity-Datei nicht vorhanden — Strategie im Portfolio-Kontext berechnet.
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
type FilterMode = "all" | "active" | "ws" | "ci";

const WS_ROWS  = WS_STRATEGIES.map(wsToDisplay);
const CI_ROWS  = CI_STRATEGIES.map(ciToDisplay);
const ALL_ROWS = [...WS_ROWS, ...CI_ROWS];

function isActive(row: DisplayRow) {
  return row.status === "active" || row.status === "watch" ||
         row.status === "research" || row.status === "validation" || row.status === "parity_pending";
}

export default function StrategyMasterTable() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter]   = useState<FilterMode>("all");
  const [sortKey, setSortKey] = useState<"sharpeOos" | "weight" | "cagr" | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const toggleSort = useCallback((key: "sharpeOos" | "weight" | "cagr") => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }, [sortKey]);

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // filter
  let rows = filter === "active" ? ALL_ROWS.filter(isActive)
           : filter === "ws"     ? WS_ROWS
           : filter === "ci"     ? CI_ROWS
           : ALL_ROWS;

  // sort
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "sharpeOos") { va = a.sharpeOos ?? -Infinity; vb = b.sharpeOos ?? -Infinity; }
      else if (sortKey === "weight") { va = a.weight ?? -Infinity; vb = b.weight ?? -Infinity; }
      else { va = parseFloat((a.cagr ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; vb = parseFloat((b.cagr ?? "").replace(/[^0-9.-]/g, "")) || -Infinity; }
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }

  // section separators only when showing "all", "ws", or "ci"
  const showSections = filter !== "active" && !sortKey;

  const th: React.CSSProperties = {
    fontFamily: "var(--font-montserrat),sans-serif",
    fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
    color: MUTED, padding: "0 10px 10px", textAlign: "left", whiteSpace: "nowrap",
    borderBottom: `1px solid ${ROW_BORDER}`, background: BG,
    userSelect: "none",
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };

  const sortIndicator = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "20px 24px 0", background: BG, fontFamily: "var(--font-montserrat),sans-serif" }}>

      {/* ── header row ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20, flexShrink: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-.02em", margin: 0, lineHeight: 1 }}>Komponenten</h1>
          <p style={{ fontSize: 11, color: MUTED, margin: "4px 0 0", fontWeight: 500 }}>White Swan v1.1 · Core Invest v2.0 · PAPER_ONLY</p>
        </div>
        <div style={{ display: "flex", gap: 12, flex: 1 }}>
          <KpiCard label="WS Sharpe OOS" value="1.526" subtitle="OOS 2019–2026" />
          <KpiCard label="WS CAGR OOS"   value="+8.36%" subtitle="22 + 3 Strategien" />
          <KpiCard label="WS Max DD"     value="−8.71%" valueVariant="negative" />
          <KpiCard label="CI Sharpe OOS" value="1.152" subtitle="v2.0 · 8 Positionen" />
          <KpiCard label="CI CAGR OOS"   value="+17.11%" subtitle="OOS 2019–2026" />
        </div>
      </div>

      {/* ── filter bar ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexShrink: 0 }}>
        {(["all", "active", "ws", "ci"] as const).map(f => {
          const active = filter === f;
          const lbl = f === "all" ? "Alle" : f === "active" ? "Nur Aktive" : f === "ws" ? "White Swan" : "Core Invest";
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: "var(--font-montserrat),sans-serif",
              fontSize: 11, fontWeight: 600, letterSpacing: ".06em",
              padding: "5px 14px", borderRadius: 6, cursor: "pointer",
              background: active ? "rgba(226,202,122,0.1)" : "transparent",
              border: active ? `1px solid rgba(226,202,122,0.3)` : `1px solid ${ROW_BORDER}`,
              color: active ? GOLD : MUTED,
              transition: "all .15s",
            }}>{lbl}</button>
          );
        })}
        {sortKey && (
          <button onClick={() => setSortKey(null)} style={{
            fontFamily: "var(--font-montserrat),sans-serif",
            fontSize: 10, letterSpacing: ".06em", padding: "5px 10px", borderRadius: 6,
            background: "transparent", border: `1px solid ${ROW_BORDER}`,
            color: DIM, cursor: "pointer", marginLeft: "auto",
          }}>✕ Sort aufheben</button>
        )}
      </div>

      {/* ── table ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0, borderRadius: 12, border: `1px solid ${ROW_BORDER}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} />
              <th style={th}>Ticker</th>
              <th style={th}>Asset</th>
              <th style={th}>Pillar</th>
              <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("weight")}>Gew.{sortIndicator("weight")}</th>
              <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("sharpeOos")}>Sharpe{sortIndicator("sharpeOos")}</th>
              <th style={{ ...thR, cursor: "pointer" }} onClick={() => toggleSort("cagr")}>CAGR{sortIndicator("cagr")}</th>
              <th style={thR}>Max DD</th>
              <th style={thR}>PF</th>
              <th style={thR}>Trades</th>
              <th style={thR}>WF / Win%</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const prevRow = rows[idx - 1];
              const isArchived = row.status === "archived";
              const isExpanded = expandedId === row.id;

              // section separator row
              const sepRow = showSections && row.section !== prevRow?.section ? (
                <tr key={`sep_${row.section}`}>
                  <td colSpan={12} style={{
                    padding: "10px 12px 6px",
                    fontFamily: "var(--font-montserrat),sans-serif",
                    fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const,
                    color: GOLD, borderBottom: `1px solid rgba(226,202,122,0.12)`,
                    background: "rgba(226,202,122,0.03)",
                  }}>
                    {row.section === "ws" ? "White Swan v1.1 · OOS 2019–2026 · PAPER_ONLY · Eingefroren 2026-07-17"
                                          : "Core Invest v2.0 · APPROVED · Eingefroren 2026-07-20"}
                  </td>
                </tr>
              ) : null;

              // pillar sub-section header (WS only, when showing sections)
              const showPillarHdr = showSections && row.section === "ws" && row.pillarLabel !== prevRow?.pillarLabel && prevRow?.section === "ws";
              const pillarHdr = showPillarHdr ? (
                <tr key={`phdr_${row.pillarLabel}`}>
                  <td colSpan={12} style={{
                    padding: "6px 12px 4px 40px",
                    fontFamily: "var(--font-montserrat),sans-serif",
                    fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" as const,
                    color: DIM, borderBottom: `1px solid ${ROW_BORDER}`,
                  }}>{row.pillarLabel}</td>
                </tr>
              ) : null;

              const rowEl = (
                <tr
                  key={row.id}
                  onClick={() => !isArchived && toggle(row.id)}
                  style={{
                    opacity: isArchived ? 0.3 : 1,
                    cursor: isArchived ? "default" : "pointer",
                    borderBottom: `1px solid ${ROW_BORDER}`,
                    background: isExpanded ? "rgba(226,202,122,0.04)" : "transparent",
                    transition: "background .1s",
                  }}
                  onMouseEnter={e => { if (!isArchived && !isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = isExpanded ? "rgba(226,202,122,0.04)" : "transparent"; }}
                >
                  {/* expand toggle */}
                  <td style={{ padding: "8px 10px", width: 28, textAlign: "center" as const }}>
                    {!isArchived && (
                      <span style={{
                        display: "inline-block", fontSize: 10, color: isExpanded ? GOLD : DIM,
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform .2s",
                      }}>›</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "rgba(255,255,255,0.9)", letterSpacing: ".02em" }}>{row.ticker}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{row.label}</td>
                  <td style={{ padding: "8px 10px", fontSize: 10, color: DIM, letterSpacing: ".04em" }}>{row.pillarLabel}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: row.weight ? "rgba(255,255,255,0.7)" : DIM }}>
                    {row.weight != null ? `${row.weight}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: row.sharpeOos !== null ? (row.sharpeOos >= 0.5 ? GOLD : row.sharpeOos < 0 ? RED : "rgba(255,255,255,0.7)") : DIM }}>
                    {row.sharpeOos !== null ? fmtNum(row.sharpeOos) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: numColor(row.cagr), fontWeight: row.cagr ? 600 : 400 }}>
                    {row.cagr ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: row.maxDd ? RED : DIM }}>
                    {row.maxDd ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: (row.pf ?? 0) >= 1.3 ? GOLD : row.pf ? "rgba(255,255,255,0.6)" : DIM }}>
                    {row.pf != null ? fmtNum(row.pf) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
                    {row.trades != null ? row.trades.toLocaleString("de") : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
                    {row.wfWin ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <StatusChip status={row.status} />
                  </td>
                </tr>
              );

              const expEl = (
                <tr key={`${row.id}_exp`}>
                  <td colSpan={12} style={{ padding: 0, border: "none" }}>
                    <div style={{
                      maxHeight: isExpanded ? "640px" : "0",
                      overflow: "hidden",
                      transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)",
                    }}>
                      {isExpanded && <ExpandedContent row={row} />}
                    </div>
                  </td>
                </tr>
              );

              return [sepRow, pillarHdr, rowEl, expEl];
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px 0 12px", fontSize: 10, color: DIM, flexShrink: 0, textAlign: "center" as const, fontFamily: "var(--font-montserrat),sans-serif" }}>
        Klick auf Zeile → Expand · Spaltenheader → Sortieren · PAPER_ONLY · Keine Live-Orders
      </div>
    </div>
  );
}

// ── status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    active:          { label: "Aktiv",      color: "rgba(255,255,255,0.7)" },
    watch:           { label: "Watch",      color: GOLD },
    archived:        { label: "Archived",   color: DIM },
    research:        { label: "Research",   color: DIM },
    validation:      { label: "Validation", color: "rgba(255,255,255,0.5)" },
    parity_pending:  { label: "Pending",    color: GOLD },
  };
  const s = map[status] ?? { label: status, color: DIM };
  return (
    <span style={{ fontFamily: "var(--font-montserrat),sans-serif", fontSize: 10, fontWeight: 600, color: s.color, letterSpacing: ".05em" }}>
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: s.color, marginRight: 5, verticalAlign: "middle" }} />
      {s.label}
    </span>
  );
}
