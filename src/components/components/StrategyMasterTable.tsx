"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  WS_STRATEGIES, PILLAR_META, type StrategyRow, type Pillar,
  CI_STRATEGIES, CI_META, type CoreInvestRow, type CIPillar,
} from "@/lib/components/ws-strategy-data";

// ── colour tokens ─────────────────────────────────────────────────────────────
const PILLAR_COLOR: Record<Pillar, string> = {
  valuation: "#3d8bcd",
  macro:     "#e8a020",
  trend:     "#00c8a0",
  seasonal:  "#a78bfa",
  anomaly:   "#f472b6",
  intraday:  "#94a3b8",
};

// ── data types ────────────────────────────────────────────────────────────────
interface EquityPoint { time: string; value: number; }
interface Trade {
  entry_time: string; exit_time: string;
  entry_price: number; exit_price: number;
  pnl: number; exit_type: string; year: number;
}
interface OhlcBar { time: string; open: number; high: number; low: number; close: number; }
interface StrategyData {
  summary: { oos: { sharpe: number; cagr: number; maxDrawdownPercent: number; profitFactor: number; tradeCount: number; winRate: number; finalEquity: number; } };
  equityCurve: { oos: EquityPoint[] };
  drawdownCurve: { oos: EquityPoint[] };
  trades?: Trade[];
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number | null, decimals = 2): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

function sharpeColor(v: number | null): string {
  if (v === null) return "#5a607a";
  if (v >= 0.5) return "#00c8a0";
  if (v >= 0.2) return "#e8a020";
  if (v < 0)    return "#e05555";
  return "#8890aa";
}

// ── sub-components ────────────────────────────────────────────────────────────
function PillarBadge({ pillar }: { pillar: Pillar }) {
  const color = PILLAR_COLOR[pillar];
  const label = PILLAR_META[pillar].label;
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
      padding: "2px 7px", borderRadius: 3, textTransform: "uppercase" as const,
      background: `${color}20`, color, border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: StrategyRow["status"] }) {
  const map = { active: "#00c8a0", watch: "#e8a020", archived: "#3a3f52" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: map[status] }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: map[status], flexShrink: 0 }} />
      {status === "active" ? "Aktiv" : status === "watch" ? "Watch" : "Archived"}
    </span>
  );
}

// ── candlestick chart ─────────────────────────────────────────────────────────
function CandlestickChart({ ticker, trades }: { ticker: string; trades: Trade[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);

  useEffect(() => {
    const sym = encodeURIComponent(ticker.split(" ")[0]);
    fetch(`/api/monitoring/ohlc?symbol=${sym}&timeframe=1D`)
      .then(r => r.json())
      .then(d => setBars(Array.isArray(d.bars) && d.bars.length ? d.bars : []))
      .catch(() => setBars([]));
  }, [ticker]);

  useEffect(() => {
    if (!containerRef.current || !bars || bars.length === 0) return;
    let chartInstance: { remove: () => void } | null = null;

    import("lightweight-charts").then(({ createChart, CandlestickSeries, createSeriesMarkers }) => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const chart = createChart(el, {
        width: el.clientWidth,
        height: 240,
        layout: { background: { color: "#1a1d27" }, textColor: "#8890aa" },
        grid: { vertLines: { color: "#1e2130" }, horzLines: { color: "#1e2130" } },
        rightPriceScale: { borderColor: "#252836" },
        timeScale: { borderColor: "#252836", timeVisible: false },
      });
      chartInstance = chart;

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#00c8a0", downColor: "#e05555",
        borderUpColor: "#00c8a0", borderDownColor: "#e05555",
        wickUpColor: "#4da88a", wickDownColor: "#a03535",
      });

      const oosBars = bars.filter(b => b.time >= "2019-01-01");
      series.setData(oosBars);

      // trade markers deduplicated per day (v5 API: createSeriesMarkers)
      const seen = new Set<string>();
      const markerData: Array<{ time: string; position: "belowBar" | "aboveBar"; color: string; shape: "arrowUp" | "arrowDown"; text: string }> = [];
      for (const t of trades) {
        const et = t.entry_time?.slice(0, 10);
        if (et && et >= "2019-01-01" && !seen.has(`e_${et}`)) {
          seen.add(`e_${et}`);
          markerData.push({ time: et, position: "belowBar", color: "#3d8bcd", shape: "arrowUp", text: "E" });
        }
        const xt = t.exit_time?.slice(0, 10);
        if (xt && xt >= "2019-01-01" && !seen.has(`x_${xt}`)) {
          seen.add(`x_${xt}`);
          markerData.push({ time: xt, position: "aboveBar", color: t.pnl > 0 ? "#00c8a0" : "#e05555", shape: "arrowDown", text: t.pnl > 0 ? "W" : "L" });
        }
      }
      const sortedMarkers = markerData.sort((a, b) => a.time.localeCompare(b.time));
      if (typeof createSeriesMarkers === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (createSeriesMarkers as any)(series, sortedMarkers);
      }
      chart.timeScale().fitContent();
    });

    return () => { chartInstance?.remove(); };
  }, [bars, trades]);

  if (bars === null) return (
    <div style={{ textAlign: "center", color: "#5a607a", fontSize: 11, padding: 20 }}>Lade OHLC-Daten…</div>
  );
  if (bars.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "#8890aa", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>
        OHLC OOS 2019–2026 · <span style={{ color: "#3d8bcd" }}>▲ Entry</span> · <span style={{ color: "#00c8a0" }}>▼ Win</span> · <span style={{ color: "#e05555" }}>▼ Loss</span>
      </div>
      <div ref={containerRef} style={{ borderRadius: 6, overflow: "hidden" }} />
    </div>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────
function StrategyModal({ row, onClose }: { row: StrategyRow; onClose: () => void }) {
  const [data, setData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row.dataFile) return;
    setLoading(true);
    fetch(`/data/${row.dataFile}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [row.dataFile]);

  const pc = PILLAR_COLOR[row.pillar];

  const equityOos = data?.equityCurve?.oos;
  const ddOos = data?.drawdownCurve?.oos;
  const sample = (arr: EquityPoint[] | undefined) => {
    if (!arr) return [];
    const step = Math.max(1, Math.floor(arr.length / 200));
    return arr.filter((_, i) => i % step === 0 || i === arr.length - 1)
      .map(p => ({ time: p.time.slice(0, 7), value: Math.round(p.value * 10) / 10 }));
  };

  const equity = sample(equityOos);
  const dd = sample(ddOos);
  const trades = data?.trades ?? [];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto",
        background: "#13161e", borderTop: `2px solid ${pc}`,
        borderRadius: "12px 12px 0 0", padding: "24px 28px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <PillarBadge pillar={row.pillar} />
              {row.weight != null && (
                <span style={{ fontSize: 11, color: "#5a607a", fontFamily: "monospace" }}>{row.weight}% Gewicht</span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#d4d8e8" }}>
              {row.ticker} <span style={{ color: "#8890aa", fontSize: 14, fontWeight: 400 }}>— {row.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "#5a607a", marginTop: 3, fontFamily: "monospace" }}>
              {row.engine} · {row.group} · {row.exchange}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "1px solid #252836", borderRadius: 6, color: "#8890aa", fontSize: 18, cursor: "pointer", padding: "4px 10px", lineHeight: 1 }}
          >×</button>
        </div>

        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))", gap: 10, marginBottom: 24 }}>
          {[
            { l: "Sharpe OOS", v: fmt(row.sharpeOos), c: sharpeColor(row.sharpeOos) },
            { l: "CAGR OOS",   v: row.cagr  ?? "—",  c: row.cagr?.startsWith("+") ? "#00c8a0" : row.cagr?.startsWith("−") ? "#e05555" : "#8890aa" },
            { l: "Max DD",     v: row.maxDd ?? "—",   c: "#e05555" },
            { l: "PF",         v: fmt(row.pf),         c: (row.pf ?? 0) >= 1.3 ? "#00c8a0" : "#8890aa" },
            { l: "Trades OOS", v: row.trades != null ? String(row.trades) : "—", c: "#8890aa" },
            { l: "WF / OOS",   v: row.wfOos ?? "—",   c: "#8890aa" },
            { l: "Calmar",     v: fmt(row.calmar),     c: "#8890aa" },
          ].map(k => (
            <div key={k.l} style={{ background: "#1a1d27", border: "1px solid #252836", borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: "#5a607a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 3 }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* IS notes */}
        {row.isNotes && (
          <div style={{ fontSize: 11, color: "#e8a020", background: "rgba(232,160,32,.07)", border: "1px solid rgba(232,160,32,.2)", borderRadius: 4, padding: "8px 12px", marginBottom: 20 }}>
            ℹ {row.isNotes}
          </div>
        )}

        {/* Charts */}
        {loading && (
          <div style={{ textAlign: "center", color: "#5a607a", fontSize: 12, padding: 40 }}>Lade Backtest-Daten…</div>
        )}
        {!loading && row.dataFile && !data && (
          <div style={{ textAlign: "center", color: "#5a607a", fontSize: 12, padding: 40 }}>Keine Backtest-Datei gefunden.</div>
        )}
        {!row.dataFile && (
          <div style={{ fontSize: 11, color: "#5a607a", textAlign: "center", padding: "24px 0", borderTop: "1px solid #252836" }}>
            Einzelstrategie-Equity-Datei nicht vorhanden — Daten im Portfolio-Kontext berechnet.<br />
            <span style={{ color: "#3d8bcd", cursor: "pointer" }}>→ Monitoring-Seite für OHLC-Chart</span>
          </div>
        )}
        {data && (
          <div>
            {/* Candlestick chart (loads OHLC from API, shows trade markers) */}
            {trades.length > 0 && (
              <CandlestickChart ticker={row.ticker} trades={trades} />
            )}

            {equity.length > 0 && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "#8890aa", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>
                    Equity OOS — {data.summary.oos.cagr.toFixed(2)}% CAGR · ${data.summary.oos.finalEquity.toLocaleString("de", { maximumFractionDigits: 0 })}
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={equity} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`eqGrad_${row.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={pc} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={pc} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fill: "#5a607a", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#5a607a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.round(v/1000)}k`} width={44} />
                      <Tooltip
                        contentStyle={{ background: "#1a1d27", border: "1px solid #252836", borderRadius: 6, fontSize: 11 }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`$${Number(v ?? 0).toLocaleString("de", { maximumFractionDigits: 0 })}`, "Equity"]}
                      />
                      <ReferenceLine y={100000} stroke="#252836" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="value" stroke={pc} strokeWidth={1.5} fill={`url(#eqGrad_${row.id})`} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {dd.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#8890aa", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>
                      Drawdown OOS — Max {data.summary.oos.maxDrawdownPercent.toFixed(2)}%
                    </div>
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart data={dd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id={`ddGrad_${row.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#e05555" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#e05555" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" tick={{ fill: "#5a607a", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "#5a607a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${Number(v).toFixed(0)}%`} width={36} />
                        <Tooltip
                          contentStyle={{ background: "#1a1d27", border: "1px solid #252836", borderRadius: 6, fontSize: 11 }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "Drawdown"]}
                        />
                        <ReferenceLine y={0} stroke="#252836" />
                        <Area type="monotone" dataKey="value" stroke="#e05555" strokeWidth={1.5} fill={`url(#ddGrad_${row.id})`} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ pillar, count, activeCount }: { pillar: Pillar; count: number; activeCount: number }) {
  const meta = PILLAR_META[pillar];
  const color = PILLAR_COLOR[pillar];
  return (
    <tr>
      <td colSpan={14} style={{
        background: `${color}0d`,
        borderLeft: `2px solid ${color}`,
        borderBottom: "1px solid #252836",
        padding: "6px 12px",
        fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const,
        color: "#8890aa",
      }}>
        <span style={{ color }}>{meta.label}</span>
        <span style={{ marginLeft: 12, color: "#3d8bcd" }}>{meta.weight}</span>
        <span style={{ marginLeft: 12 }}>{activeCount} aktiv · {count - activeCount} archived</span>
      </td>
    </tr>
  );
}

// ── Core Invest section ───────────────────────────────────────────────────────
const CI_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  research:       { label: "Research",       color: "#5a607a" },
  validation:     { label: "Validation",     color: "#e8a020" },
  parity_pending: { label: "Parity Pending", color: "#f472b6" },
};

function CoreInvestSection() {
  const CI_PILLARS: CIPillar[] = ["etf_core", "ci_sleeve"];
  const thStyle: React.CSSProperties = {
    padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 600,
    letterSpacing: ".08em", textTransform: "uppercase", color: "#5a607a",
    borderBottom: "1px solid #252836", whiteSpace: "nowrap", background: "#1a1d27",
  };
  const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };

  return (
    <div style={{ marginTop: 40 }}>
      {/* Core Invest header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #252836" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#d4d8e8" }}>Core Invest v2.0 — Strategy Register</div>
          <div style={{ fontSize: 11, color: "#5a607a", marginTop: 2 }}>
            Eingefroren 2026-07-20 · APPROVED · PAPER_ONLY · OOS 2019–2026 · 80% ETF-Core + 20% Sleeves (4×5%)
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          {[
            { l: "Sharpe OOS",  v: "1.152", c: "#00c8a0" },
            { l: "CAGR OOS",   v: "+17.11%", c: "#00c8a0" },
            { l: "Max DD OOS", v: "−21.7%",  c: "#e05555" },
            { l: "Calmar",     v: "0.787",   c: "#8890aa" },
          ].map(k => (
            <div key={k.l} style={{ background: "#13161e", border: "1px solid #252836", borderRadius: 5, padding: "6px 12px", textAlign: "center" as const, minWidth: 80 }}>
              <div style={{ fontSize: 9, color: "#3a3f52", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{k.l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#5a607a", background: "rgba(61,139,205,.04)", border: "1px solid rgba(61,139,205,.15)", borderRadius: 4, padding: "6px 12px", marginBottom: 16 }}>
        ℹ OOS-Stats aus Analytics-Seite · Sleeve-Statistiken aus Partial-Validation (Python) · WF Beat 60% · Keine Live-Orders
      </div>

      <div style={{ overflowX: "auto", borderRadius: 6, border: "1px solid #252836" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>Ticker</th>
              <th style={thStyle}>Asset</th>
              <th style={thStyle}>Gruppe</th>
              <th style={thStyle}>Engine</th>
              <th style={thR}>Gew.</th>
              <th style={thR}>PF</th>
              <th style={thR}>Max DD</th>
              <th style={thR}>Trades</th>
              <th style={thR}>Win %</th>
              <th style={thR}>Total Ret.</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Notizen</th>
            </tr>
          </thead>
          <tbody>
            {CI_PILLARS.map(pillar => {
              const rows = CI_STRATEGIES.filter(r => r.pillar === pillar);
              const meta = CI_META[pillar];
              const color = meta.color;
              return [
                <tr key={`ci_hdr_${pillar}`}>
                  <td colSpan={12} style={{
                    background: `${color}0d`, borderLeft: `2px solid ${color}`,
                    borderBottom: "1px solid #252836", padding: "6px 12px",
                    fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#8890aa",
                  }}>
                    <span style={{ color }}>{meta.label}</span>
                    <span style={{ marginLeft: 12, color: "#3d8bcd" }}>{meta.weight}</span>
                  </td>
                </tr>,
                ...rows.map((row: CoreInvestRow) => {
                  const st = CI_STATUS_LABEL[row.status];
                  return (
                    <tr key={row.id} style={{ background: "#13161e", borderBottom: "1px solid #252836" }}>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#d4d8e8" }}>{row.ticker}</td>
                      <td style={{ padding: "7px 10px", color: "#8890aa" }}>{row.label}</td>
                      <td style={{ padding: "7px 10px", color: "#5a607a", fontSize: 11 }}>{row.group}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 10, color: "#5a607a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.engine}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#8890aa" }}>{row.weight}%</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: (row.pf ?? 0) >= 1.3 ? "#00c8a0" : "#5a607a" }}>{row.pf != null ? row.pf.toFixed(3) : "—"}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#e05555" }}>{row.maxDd ?? "—"}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#5a607a" }}>{row.trades != null ? row.trades.toLocaleString("de") : "—"}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#8890aa" }}>{row.winRate ?? "—"}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: row.totalReturn?.startsWith("+") ? "#00c8a0" : "#5a607a" }}>{row.totalReturn ?? "—"}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: st.color, letterSpacing: ".04em" }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "7px 10px", fontSize: 10, color: "#5a607a", maxWidth: 200 }}>{row.notes ?? ""}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
const PILLARS: Pillar[] = ["valuation", "macro", "trend", "seasonal", "anomaly", "intraday"];

export default function StrategyMasterTable() {
  const [selected, setSelected] = useState<StrategyRow | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | Pillar>("all");
  const [sortKey, setSortKey] = useState<"sharpeOos" | "weight" | null>(null);

  const open = useCallback((row: StrategyRow) => setSelected(row), []);
  const close = useCallback(() => setSelected(null), []);

  const grouped = PILLARS.map(p => ({
    pillar: p,
    rows: WS_STRATEGIES.filter(r => r.pillar === p),
  }));

  const thStyle: React.CSSProperties = {
    padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 600,
    letterSpacing: ".08em", textTransform: "uppercase", color: "#5a607a",
    borderBottom: "1px solid #252836", whiteSpace: "nowrap", background: "#1a1d27",
    cursor: "pointer", userSelect: "none",
  };
  const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 20px 40px", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #252836" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#d4d8e8" }}>White Swan v1.1 — Strategy Register</div>
          <div style={{ fontSize: 11, color: "#5a607a", marginTop: 2 }}>
            Eingefroren 2026-07-17 · PAPER_ONLY · OOS 2019–2026 · Anomaly: v1.2 (2026-07-19)
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {(["all", "active", ...PILLARS] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? (f === "all" || f === "active" ? "#252836" : `${PILLAR_COLOR[f as Pillar]}30`) : "none",
                border: filter === f ? `1px solid ${f === "all" || f === "active" ? "#3a3f52" : PILLAR_COLOR[f as Pillar]}` : "1px solid #252836",
                borderRadius: 4, color: filter === f ? "#d4d8e8" : "#5a607a",
                fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase",
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              {f === "all" ? "Alle" : f === "active" ? "Aktiv" : PILLAR_META[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* portfolio KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
        {[
          { l: "Sharpe OOS",  v: "1.526", c: "#00c8a0" },
          { l: "CAGR OOS",    v: "+8.36%", c: "#00c8a0" },
          { l: "Max DD OOS",  v: "−8.71%", c: "#e05555" },
          { l: "Strategien",  v: "22 + 3", c: "#d4d8e8" },
        ].map(k => (
          <div key={k.l} style={{ background: "#13161e", border: "1px solid #252836", borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "#5a607a", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>{k.l}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* White Swan table */}
      <div style={{ overflowX: "auto", borderRadius: 6, border: "1px solid #252836" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Ticker</th>
              <th style={thStyle}>Asset</th>
              <th style={thStyle}>Gruppe</th>
              <th style={thStyle}>Engine</th>
              <th style={thStyle}>Pillar</th>
              <th style={{ ...thR, cursor: "pointer" }} onClick={() => setSortKey("weight")}>Gew. {sortKey === "weight" ? "▼" : ""}</th>
              <th style={{ ...thR, cursor: "pointer" }} onClick={() => setSortKey("sharpeOos")}>Sharpe OOS {sortKey === "sharpeOos" ? "▼" : ""}</th>
              <th style={thR}>CAGR</th>
              <th style={thR}>Max DD</th>
              <th style={thR}>PF</th>
              <th style={thR}>Trades</th>
              <th style={thR}>WF</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ pillar, rows }) => {
              const filtered = filter === "all" ? rows
                : filter === "active" ? rows.filter(r => r.status === "active")
                : filter === pillar ? rows
                : rows.filter(r => r.pillar === filter);
              if (filtered.length === 0) return null;

              const sorted = sortKey
                ? [...filtered].sort((a, b) => {
                    if (sortKey === "weight")    return (b.weight ?? -1) - (a.weight ?? -1);
                    if (sortKey === "sharpeOos") return (b.sharpeOos ?? -99) - (a.sharpeOos ?? -99);
                    return 0;
                  })
                : filtered;

              const activeCount = rows.filter(r => r.status === "active").length;
              let rowNum = 0;

              return [
                <SectionHeader key={`hdr_${pillar}`} pillar={pillar} count={rows.length} activeCount={activeCount} />,
                ...sorted.map(row => {
                  const isArchived = row.status === "archived";
                  if (!isArchived) rowNum++;
                  const dim: React.CSSProperties = isArchived ? { opacity: .35 } : {};
                  const clickable = !isArchived;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => clickable && open(row)}
                      style={{
                        background: "#13161e",
                        cursor: clickable ? "pointer" : "default",
                        transition: "background .1s",
                        borderBottom: "1px solid #252836",
                        ...dim,
                      }}
                      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLTableRowElement).style.background = "#1a1d27"; }}
                      onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLTableRowElement).style.background = "#13161e"; }}
                    >
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: "#5a607a", width: 28, textAlign: "right" }}>
                        {isArchived ? "—" : rowNum}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#d4d8e8", letterSpacing: ".03em" }}>
                        {row.ticker}
                      </td>
                      <td style={{ padding: "7px 10px", color: "#8890aa" }}>{row.label}</td>
                      <td style={{ padding: "7px 10px", color: "#5a607a", fontSize: 11 }}>{row.group}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: "#5a607a", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.engine}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        {!isArchived && <PillarBadge pillar={row.pillar} />}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#8890aa" }}>
                        {row.weight != null ? `${row.weight}%` : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: sharpeColor(row.sharpeOos), fontWeight: row.sharpeOos !== null ? 600 : 400 }}>
                        {row.sharpeOos !== null ? fmt(row.sharpeOos) : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: row.cagr?.startsWith("+") ? "#00c8a0" : row.cagr?.startsWith("−") ? "#e05555" : "#5a607a" }}>
                        {row.cagr ?? "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#e05555" }}>
                        {row.maxDd ?? "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: (row.pf ?? 0) >= 1.3 ? "#00c8a0" : "#5a607a" }}>
                        {row.pf != null ? fmt(row.pf) : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#5a607a" }}>
                        {row.trades != null ? row.trades.toLocaleString("de") : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace", textAlign: "right", color: "#5a607a" }}>
                        {row.wfOos ?? "—"}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <StatusDot status={row.status} />
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: "#3a3f52", marginTop: 12, textAlign: "center" }}>
        Klick auf Strategie-Zeile → Details mit OHLC-Chart + Entry/Exit-Marker + Equity-Kurve · PAPER_ONLY · Keine Live-Orders
      </div>

      {/* Core Invest section */}
      <CoreInvestSection />

      {selected && <StrategyModal row={selected} onClose={close} />}
    </div>
  );
}
