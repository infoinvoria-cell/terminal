"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Info, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCoreInvestData } from "./use-core-invest-data";
import type { OhlcBar, SleeveData } from "./types";

// ─── colours ────────────────────────────────────────────────────────────────
const C = {
  bg: "#0B0C0F",
  panel: "#111215",
  border: "#1F2127",
  text: "#d8dadf",
  muted: "#5a5d64",
  gold: "#C9A84C",
  goldDim: "#8a7035",
  white: "#f3f4f6",
  cyan: "#38bdf8",
  orange: "#f97316",
  green: "#22c55e",
  red: "#ef4444",
  magenta: "#e879f9",
  blue: "#818cf8",
  copper: "#b45309",
  chf: "#94a3b8",
  spy: "#6b7280",
  qqq: "#a78bfa",
  spmo: "#fbbf24",
  gld: "#C9A84C",
} as const;

const SLEEVE_COLORS: Record<string, string> = {
  QQQ_PINE_1: C.cyan,
  QQQ_PINE_2_EMA: C.orange,
  COPPER_HG: C.copper,
  CHF_6S: C.chf,
};

// ─── helpers ────────────────────────────────────────────────────────────────
function computeSma(bars: OhlcBar[], period: number): (number | null)[] {
  return bars.map((_, i) =>
    i < period - 1 ? null : bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.close, 0) / period,
  );
}

function computeEma(bars: OhlcBar[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  let ema: number | null = null;
  return bars.map((bar, i) => {
    if (ema === null) {
      if (i >= period - 1) {
        ema = bars.slice(0, i + 1).reduce((s, b) => s + b.close, 0) / period;
        return ema;
      }
      return null;
    }
    ema = bar.close * k + ema * (1 - k);
    return ema;
  });
}

function formatDate(d: string) {
  return d?.slice(0, 7) ?? "";
}

function fmt2(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ─── sub-components ─────────────────────────────────────────────────────────
function PanelFrame({
  title,
  subtitle,
  badge,
  badgeColor,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col overflow-hidden rounded-[14px] border", className)}
      style={{ background: C.panel, borderColor: C.border }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div>
          <p className="text-[11px] font-semibold tracking-[0.05em] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.text }}>
            {title}
          </p>
          {subtitle ? <p className="text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>{subtitle}</p> : null}
        </div>
        {badge ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide [font-family:var(--font-montserrat),sans-serif]" style={{ background: `${badgeColor ?? C.gold}22`, color: badgeColor ?? C.gold }}>
            {badge}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function StatusBadge({ status, message }: { status: SleeveData["status"]; message: string }) {
  const color = status === "ok" ? C.green : status === "partial" ? C.gold : C.red;
  const Icon = status === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-center gap-1.5 px-3 py-4">
      <Icon size={12} style={{ color }} />
      <span className="text-[10px] [font-family:var(--font-montserrat),sans-serif]" style={{ color }}>
        {message}
      </span>
    </div>
  );
}

function SignalPill({ signal }: { signal?: "long" | "cash" }) {
  const isLong = signal === "long";
  return (
    <span
      className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-semibold tracking-wide [font-family:var(--font-montserrat),sans-serif]"
      style={{ background: `${isLong ? C.green : C.muted}22`, color: isLong ? C.green : C.muted }}
    >
      {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {isLong ? "LONG" : "CASH"}
    </span>
  );
}

// ─── Candle panel (simplified — uses close-only line for reliability) ────────
function SleeveChartPanel({ sleeve }: { sleeve: SleeveData }) {
  const lineColor = SLEEVE_COLORS[sleeve.config.id] ?? C.gold;

  const chartData = useMemo(() => {
    if (!sleeve.bars.length) return [];
    const emaFast = sleeve.config.emaFast ? computeEma(sleeve.bars, sleeve.config.emaFast) : null;
    const emaSlow = sleeve.config.emaSlow ? computeEma(sleeve.bars, sleeve.config.emaSlow) : null;
    const sma400 = sleeve.config.sma1 ? computeSma(sleeve.bars, sleeve.config.sma1) : null;
    const sma5 = sleeve.config.sma2 ? computeSma(sleeve.bars, sleeve.config.sma2) : null;

    return sleeve.bars.map((b, i) => ({
      date: b.date,
      close: b.close,
      emaFast: emaFast?.[i] ?? null,
      emaSlow: emaSlow?.[i] ?? null,
      sma400: sma400?.[i] ?? null,
      sma5: sma5?.[i] ?? null,
    }));
  }, [sleeve.bars, sleeve.config]);

  const signalDates = useMemo(
    () => new Map(sleeve.signals.map((s) => [s.date, s])),
    [sleeve.signals],
  );

  const lastReturn = useMemo(() => {
    const curve = sleeve.equityCurve;
    return curve && curve.length >= 2 ? curve.at(-1)!.value : null;
  }, [sleeve.equityCurve]);

  if (sleeve.status === "missing_ohlc") {
    return (
      <PanelFrame
        title={sleeve.config.label}
        subtitle={sleeve.config.instrument}
        badge="MISSING OHLC"
        badgeColor={C.red}
      >
        <StatusBadge status="missing_ohlc" message={sleeve.statusMessage} />
      </PanelFrame>
    );
  }

  return (
    <PanelFrame
      title={sleeve.config.label}
      subtitle={`${sleeve.config.instrument} · ${sleeve.config.weight * 100}% · last ${sleeve.lastDate ?? "n/a"}`}
      badge={undefined}
    >
      <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
        <SignalPill signal={sleeve.currentSignal} />
        <span className="text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>
          {sleeve.signals.length} signals
        </span>
        <span className="text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: lastReturn !== null && lastReturn >= 0 ? C.green : C.red }}>
          {fmt2(lastReturn)}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 6" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: C.muted, fontSize: 8, fontFamily: "var(--font-montserrat), sans-serif" }}
            width={40}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px" }}
            labelStyle={{ color: C.muted, fontSize: 9, fontFamily: "var(--font-montserrat), sans-serif" }}
            itemStyle={{ fontSize: 9, fontFamily: "var(--font-montserrat), sans-serif" }}
            isAnimationActive={false}
          />
          {/* SMA400 */}
          <Line dataKey="sma400" stroke={C.blue} strokeWidth={1} dot={false} isAnimationActive={false} name="SMA 400" />
          {/* SMA5 */}
          <Line dataKey="sma5" stroke={C.gold} strokeWidth={1} dot={false} isAnimationActive={false} name="SMA 5" />
          {/* EMA Fast */}
          <Line dataKey="emaFast" stroke={C.orange} strokeWidth={1} dot={false} isAnimationActive={false} name="EMA Fast" />
          {/* EMA Slow */}
          <Line dataKey="emaSlow" stroke={C.blue} strokeWidth={1} dot={false} isAnimationActive={false} name="EMA Slow" />
          {/* Price */}
          <Line dataKey="close" stroke={lineColor} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Close" />
          {/* Long entry markers */}
          {sleeve.signals.filter((s) => s.type === "long").slice(-30).map((s) => (
            <ReferenceLine key={`L-${s.date}`} x={s.date} stroke={C.green} strokeWidth={0.8} strokeDasharray="3 4" />
          ))}
          {/* Exit markers */}
          {sleeve.signals.filter((s) => s.type === "exit").slice(-30).map((s) => (
            <ReferenceLine key={`X-${s.date}`} x={s.date} stroke={C.magenta} strokeWidth={0.8} strokeDasharray="3 4" />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Signal dot row */}
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {sleeve.signals.slice(-12).map((s) => (
          <span
            key={`${s.date}-${s.type}`}
            className="rounded px-1 py-px text-[8px] [font-family:var(--font-montserrat),sans-serif]"
            style={{
              background: `${s.type === "long" ? C.green : C.magenta}18`,
              color: s.type === "long" ? C.green : C.magenta,
            }}
          >
            {s.type === "long" ? "▲" : "▼"} {s.date.slice(0, 7)}
          </span>
        ))}
        {signalDates.size === 0 ? (
          <span className="text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>no recent signals</span>
        ) : null}
      </div>
    </PanelFrame>
  );
}

// ─── Performance panel ───────────────────────────────────────────────────────
function PerformancePanel({
  equityCurve,
  benchmarkCurve,
  qqqCurve,
}: {
  equityCurve: { date: string; value: number }[];
  benchmarkCurve: { date: string; value: number }[];
  qqqCurve: { date: string; value: number }[];
}) {
  // merge by date
  const merged = useMemo(() => {
    const map = new Map<string, { date: string; portfolio?: number; spy?: number; qqq?: number }>();
    for (const p of benchmarkCurve) {
      map.set(p.date, { date: p.date, spy: p.value });
    }
    for (const p of qqqCurve) {
      const e = map.get(p.date) ?? { date: p.date };
      map.set(p.date, { ...e, qqq: p.value });
    }
    for (const p of equityCurve) {
      const e = map.get(p.date) ?? { date: p.date };
      map.set(p.date, { ...e, portfolio: p.value });
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [equityCurve, benchmarkCurve, qqqCurve]);

  const lastSpy = benchmarkCurve.at(-1)?.value ?? null;
  const lastQqq = qqqCurve.at(-1)?.value ?? null;

  return (
    <PanelFrame
      title="Core Invest vs Benchmark"
      subtitle={`SPY ${fmt2(lastSpy)} · QQQ ${fmt2(lastQqq)} · last 500 bars`}
    >
      <div className="flex gap-3 px-3 pt-1.5 pb-0.5">
        <span className="flex items-center gap-1 text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.white }}>
          <span style={{ background: C.white, width: 10, height: 2, display: "inline-block", borderRadius: 1 }} /> Core Invest
        </span>
        <span className="flex items-center gap-1 text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.gold }}>
          <span style={{ background: C.gold, width: 10, height: 2, display: "inline-block", borderRadius: 1 }} /> SPY
        </span>
        <span className="flex items-center gap-1 text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.qqq }}>
          <span style={{ background: C.qqq, width: 10, height: 2, display: "inline-block", borderRadius: 1 }} /> QQQ
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={merged} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 6" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: C.muted, fontSize: 8, fontFamily: "var(--font-montserrat), sans-serif" }} axisLine={false} tickLine={false} minTickGap={60} />
          <YAxis tick={{ fill: C.muted, fontSize: 8, fontFamily: "var(--font-montserrat), sans-serif" }} width={40} axisLine={false} tickLine={false} tickCount={4} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px" }}
            labelStyle={{ color: C.muted, fontSize: 9, fontFamily: "var(--font-montserrat), sans-serif" }}
            itemStyle={{ fontSize: 9, fontFamily: "var(--font-montserrat), sans-serif" }}
            formatter={(v) => typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : String(v)}
            isAnimationActive={false}
          />
          <Line dataKey="spy" stroke={C.gold} strokeWidth={1} dot={false} isAnimationActive={false} name="SPY" />
          <Line dataKey="qqq" stroke={C.qqq} strokeWidth={1} dot={false} isAnimationActive={false} name="QQQ" />
          <Line dataKey="portfolio" stroke={C.white} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Core Invest" />
        </LineChart>
      </ResponsiveContainer>
    </PanelFrame>
  );
}

// ─── ETF allocation panel ────────────────────────────────────────────────────
function AllocationPanel() {
  const weights = [
    { label: "SPY", w: 15, color: C.spy },
    { label: "SPMO", w: 35, color: C.spmo },
    { label: "QQQ passive", w: 15, color: C.qqq },
    { label: "GLD", w: 10, color: C.gld },
    { label: "QQQ Pine 1", w: 7.5, color: C.cyan },
    { label: "QQQ Pine 2 EMA", w: 7.5, color: C.orange },
    { label: "Copper/HG", w: 5, color: C.copper },
    { label: "CHF/6S", w: 5, color: C.chf },
  ];

  return (
    <PanelFrame title="Allocation" subtitle="Core Invest · Target Weights">
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {weights.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-[88px] shrink-0 text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>{item.label}</span>
            <div className="relative flex-1 h-[6px] rounded overflow-hidden" style={{ background: C.border }}>
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${item.w}%`, background: item.color, opacity: 0.75 }} />
            </div>
            <span className="w-8 shrink-0 text-right text-[9px] font-semibold [font-family:var(--font-montserrat),sans-serif]" style={{ color: item.color }}>
              {item.w}%
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>
          <span>ETF Core 75% · Sleeves 25%</span>
          <span>Σ 100%</span>
        </div>
        <p className="mt-1 text-[7.5px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>
          Research Scenario · Quarterly Rebalance · 10 bps · Not live execution
        </p>
      </div>
    </PanelFrame>
  );
}

// ─── Validation panel ────────────────────────────────────────────────────────
function ValidationPanel({
  dataStatus,
  missingSymbols,
  pineFiles,
  sleeves,
}: {
  dataStatus: Record<string, { found: boolean; file: string | null }>;
  missingSymbols: string[];
  pineFiles: Record<string, { found: boolean }>;
  sleeves: SleeveData[];
}) {
  const allSymbols = ["SPY", "SPMO", "QQQ", "GLD", "HG1!", "6S1!"];

  return (
    <PanelFrame title="Validation Status" subtitle="Data · Pine · Proxy warnings">
      <div className="flex flex-col gap-1 px-3 py-2">
        {/* Data files */}
        <p className="text-[8px] font-semibold tracking-wide [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>OHLC DATA</p>
        <div className="grid grid-cols-3 gap-1 mb-1.5">
          {allSymbols.map((sym) => {
            const found = dataStatus[sym]?.found ?? false;
            return (
              <div key={sym} className="flex items-center gap-1">
                <span style={{ color: found ? C.green : C.red, fontSize: 9 }}>{found ? "✓" : "✗"}</span>
                <span className="text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.text }}>{sym}</span>
              </div>
            );
          })}
        </div>

        {/* Pine files */}
        <p className="text-[8px] font-semibold tracking-wide [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>PINE FILES</p>
        <div className="flex gap-3 mb-1.5">
          {["QQQ_pine1.txt", "pine2.txt"].map((fname) => {
            const found = pineFiles[fname]?.found ?? false;
            return (
              <div key={fname} className="flex items-center gap-1">
                <span style={{ color: found ? C.green : C.red, fontSize: 9 }}>{found ? "✓" : "✗"}</span>
                <span className="text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.text }}>{fname}</span>
              </div>
            );
          })}
        </div>

        {/* Sleeve signals */}
        <p className="text-[8px] font-semibold tracking-wide [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>SLEEVE SIGNALS</p>
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          {sleeves.map((s) => (
            <div key={s.config.id} className="flex items-center justify-between gap-1">
              <span className="text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.text }}>{s.config.label}</span>
              <SignalPill signal={s.currentSignal} />
            </div>
          ))}
        </div>

        {/* Warnings */}
        <div className="mt-1 rounded p-1.5" style={{ background: `${C.gold}10`, border: `1px solid ${C.goldDim}44` }}>
          <p className="text-[7.5px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.goldDim }}>
            ⚠ QQQ Pine muss auf QQQ validiert werden – NAS100/OANDA ist nur Proxy/Research.
          </p>
          <p className="text-[7.5px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.goldDim }}>
            ⚠ Signale sind Python-Näherungen – finaler Abgleich mit TradingView-Export erforderlich.
          </p>
          {missingSymbols.length > 0 ? (
            <p className="text-[7.5px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.red }}>
              ✗ Missing OHLC: {missingSymbols.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </PanelFrame>
  );
}

// ─── Loading/error states ────────────────────────────────────────────────────
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-[14px]" style={{ background: C.panel, border: `1px solid ${C.border}` }} />
      ))}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function CoreInvestVisualGrid() {
  const data = useCoreInvestData();
  const [showValidation, setShowValidation] = useState(false);

  if (data.loading) return <GridSkeleton />;

  if (data.error) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] px-4 py-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <AlertTriangle size={14} style={{ color: C.red }} />
        <p className="text-[11px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.red }}>Error loading Core Invest data: {data.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.04em] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.text }}>
            {data.portfolioName}
          </p>
          <p className="text-[9px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>
            Visual Grid · ETF Core 75% · Strategy Sleeves 25% · Research · Not live execution
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowValidation((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] transition-colors [font-family:var(--font-montserrat),sans-serif]"
          style={{
            borderColor: showValidation ? `${C.gold}60` : C.border,
            color: showValidation ? C.gold : C.muted,
          }}
        >
          <Info size={11} />
          Validation
        </button>
      </div>

      {/* 6-panel grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" style={{ minHeight: 0 }}>
        {/* 4 Sleeve panels */}
        {data.sleeves.map((sleeve) => (
          <SleeveChartPanel key={sleeve.config.id} sleeve={sleeve} />
        ))}

        {/* Performance panel */}
        <PerformancePanel
          equityCurve={data.equityCurve}
          benchmarkCurve={data.benchmarkCurve}
          qqqCurve={data.qqqCurve}
        />

        {/* Allocation panel */}
        <AllocationPanel />
      </div>

      {/* Validation detail (expandable) */}
      {showValidation && (
        <ValidationPanel
          dataStatus={data.dataStatus}
          missingSymbols={data.missingSymbols}
          pineFiles={data.pineFiles}
          sleeves={data.sleeves}
        />
      )}

      {/* Caveat footer */}
      <p className="text-[8px] [font-family:var(--font-montserrat),sans-serif]" style={{ color: C.muted }}>
        Core Invest ist ein Research-/Pre-Fund-Level-System. Historische Ergebnisse sind kein Renditeversprechen.
        Keine Live-Execution. Keine Finanzportfolioverwaltung durch Capitalife GbR.
      </p>
    </div>
  );
}
