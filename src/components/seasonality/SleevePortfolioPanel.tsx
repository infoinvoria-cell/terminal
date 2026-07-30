"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import { TEN_PATTERNS, type TenPatternDef } from "@/lib/seasonality/tenPatternsRegistry";
import type { TenPatternResult, TenPatternResultsFile } from "@/lib/seasonality/tenPatternResults";

/* ─── Design tokens ────────────────────────────────────────────────────── */
const C_WHITE  = "#ffffff";
const C_TEXT2  = "rgba(255,255,255,0.55)";
const C_TEXT3  = "rgba(255,255,255,0.28)";
const C_GOLD   = "#d8bc67";
const C_CARD   = "#111318";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_HOVER  = "rgba(255,255,255,0.04)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

/* ─── Result loading ────────────────────────────────────────────────────── */
function useAllPatternResults(): Record<string, TenPatternResult> | null {
  const [results, setResults] = useState<Record<string, TenPatternResult> | null>(null);
  useEffect(() => {
    fetch("/generated/seasonality/ten_patterns/results.json")
      .then(r => r.ok ? r.json() as Promise<TenPatternResultsFile> : null)
      .then(data => setResults(data?.patterns ?? {}))
      .catch(() => setResults({}));
  }, []);
  return results;
}

/* ─── Display item — def + optional computed result ────────────────────── */
interface DisplayItem {
  def: TenPatternDef;
  result: TenPatternResult | null;
  /** Sequential display ID (1-based) */
  displayId: number;
}

function toDisplayItems(results: Record<string, TenPatternResult> | null): DisplayItem[] {
  return TEN_PATTERNS.map((def, idx) => ({
    def,
    result: results?.[def.patternId] ?? null,
    displayId: idx + 1,
  }));
}

/* ─── Status label helpers ──────────────────────────────────────────────── */
function statusLabel(status: TenPatternResult["status"] | undefined): string {
  switch (status) {
    case "historical_computed": return "Historisch berechnet";
    case "wf_completed":        return "Walk Forward geprüft";
    case "wf_failed":           return "WF nicht bestanden";
    case "no_data_source":      return "Keine Datenquelle";
    case "data_error":          return "Datenfehler";
    case "not_tested":
    default:                    return "Nicht getestet";
  }
}

/* ─── Countdown hook ───────────────────────────────────────────────────── */
function todayCalendarDay(): number {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
}

function usePatternCountdown(calStart: number): string {
  const [display, setDisplay] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const tick = () => {
      const today = todayCalendarDay();
      let daysAway = calStart - today;
      if (daysAway < -14) daysAway += 365;
      if (daysAway < 0)  { setDisplay("Aktiv");  return; }
      if (daysAway === 0){ setDisplay("Heute");  return; }
      const now = new Date();
      const h   = Math.max(0, 18 - now.getHours());
      const m   = now.getMinutes();
      setDisplay(`${daysAway} Tage : ${h} Std : ${m} min`);
    };
    tick();
    timer.current = setInterval(tick, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [calStart]);
  return display;
}

/* ─── Asset icon ─────────────────────────────────────────────────────────── */
function AssetIcon({ def, size = 36 }: { def: TenPatternDef; size?: number }) {
  const url = getMonitoringAssetIconUrl({
    code: def.monitoringSymbol,
    assetId: def.iconAssetId ?? def.assetId,
    name: def.displayName,
    displaySymbol: def.monitoringSymbol.replace("1!", ""),
  });
  const displaySym = def.monitoringSymbol.replace("1!", "");
  if (!url) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12, flexShrink: 0,
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.40, fontWeight: 800, color: "rgba(255,255,255,0.60)" }}>
          {displaySym.charAt(0)}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={displaySym} width={size} height={size} style={{
      objectFit: "contain", borderRadius: 12, flexShrink: 0,
      border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
    }} />
  );
}

/* ─── OOS Win Rate donut ─────────────────────────────────────────────────── */
function WrDonut({ pct, size = 64 }: { pct: number | null; size?: number }) {
  const thick  = size * 0.095;
  const r      = (size - thick) / 2;
  const circ   = 2 * Math.PI * r;
  const ratio  = pct == null ? 0 : Math.min(1, Math.max(0, pct / 100));
  const cx = size / 2; const cy = size / 2;
  const label = pct == null ? "—" : `${pct.toFixed(0)}%`;
  return (
    <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={thick} />
      {ratio > 0.001 && (ratio >= 0.999
        ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(232,237,243,0.90)" strokeWidth={thick} />
        : <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(232,237,243,0.90)" strokeWidth={thick}
            strokeDasharray={`${ratio * circ} ${(1 - ratio) * circ}`}
            strokeDashoffset={circ * 0.25} strokeLinecap="round" />
      )}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={pct == null ? "rgba(255,255,255,0.28)" : "#ffffff"}
        fontSize={pct == null ? size * 0.28 : size * 0.225}
        fontWeight="800" fontFamily={FONT}>
        {label}
      </text>
    </svg>
  );
}

/* ─── Cumulative equity from yearly returns ──────────────────────────────── */
function CardEquityLine({ yearReturns, id, avgReturnPct, noDataSource = false }: {
  yearReturns: Array<{ year: number; returnPct: number }>;
  id: string;
  avgReturnPct: number | null;
  noDataSource?: boolean;
}) {
  const W = 300; const H = 60;
  const padTop = 18; const padBot = 4;

  if (yearReturns.length === 0) {
    const label = noDataSource
      ? "Keine Datenquelle"
      : avgReturnPct != null
        ? `${avgReturnPct >= 0 ? "+" : ""}${avgReturnPct.toFixed(1)}% avg`
        : "Nicht bewertet";
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        <text x={W - 2} y={12} textAnchor="end" fill="rgba(255,255,255,0.20)"
          fontSize={11} fontWeight="700" fontFamily={FONT}>{label}</text>
        <line x1={0} y1={H / 2} x2={W} y2={H / 2}
          stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} strokeDasharray="3 5" />
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.18)"
          fontSize={9} fontFamily={FONT}>—</text>
      </svg>
    );
  }

  const eq: number[] = [0];
  for (const yr of yearReturns) eq.push(eq[eq.length - 1] + yr.returnPct);
  const min = Math.min(...eq); const max = Math.max(...eq);
  const rng = max - min || 0.1;
  const pts = eq.map((v, i) => {
    const x = (i / (eq.length - 1)) * W;
    const y = padTop + (1 - (v - min) / rng) * (H - padTop - padBot);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const avg = avgReturnPct ?? 0;
  const lineC = avg >= 0 ? "#e8edf3" : "#d6b867";
  const fillId = `cf-${id}`;
  const lastVal = eq[eq.length - 1];
  const lastX = W;
  const lastY = padTop + (1 - (lastVal - min) / rng) * (H - padTop - padBot);
  const base  = padTop + (1 - (0 - min) / rng) * (H - padTop - padBot);
  const clampedBase = Math.min(H - padBot, Math.max(padTop, base));
  const avgLabel = `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}% avg`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineC} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <text x={W - 2} y={12} textAnchor="end" fill={lineC}
        fontSize={11} fontWeight="700" fontFamily={FONT}>{avgLabel}</text>
      <line x1={0} y1={clampedBase} x2={W} y2={clampedBase}
        stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} strokeDasharray="3 5" />
      <polygon points={`0,${clampedBase} ${pts} ${W},${clampedBase}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={lineC} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={lineC} />
    </svg>
  );
}

/* ─── Raw trade bars ─────────────────────────────────────────────────────── */
function ReturnBars({ returns: rets, width = 80, height = 36 }: {
  returns: number[]; width?: number; height?: number;
}) {
  if (rets.length === 0) {
    return (
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize={7} fontFamily={FONT}>—</text>
      </svg>
    );
  }
  const max = Math.max(...rets.map(Math.abs), 0.001);
  const bw  = Math.max(1, width / rets.length - 1);
  const mid = height / 2;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <line x1={0} y1={mid} x2={width} y2={mid} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
      {rets.map((v, i) => {
        const h   = Math.max(2, (Math.abs(v) / max) * (mid - 1));
        const pos = v >= 0;
        return (
          <rect key={i}
            x={i * (bw + 1)} y={pos ? mid - h : mid}
            width={bw} height={h}
            fill={pos ? "rgba(232,234,239,0.82)" : "rgba(214,184,103,0.72)"}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

/* ─── Portfolio equity line — from combined real year returns ─────────────── */
function PortfolioEquityLine({ items, width, height }: {
  items: DisplayItem[];
  width: number;
  height: number;
}) {
  const computed = items.filter(it => it.result?.historical?.yearReturns?.length);
  if (computed.length === 0) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: "block" }}>
        <text x={6} y={13} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Portfolio Equity</text>
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.20)" fontFamily={FONT} fontSize={10}>Keine berechneten Muster</text>
      </svg>
    );
  }

  // Build combined equity: average returns per year across all computed patterns
  const allYears = new Set<number>();
  for (const it of computed) {
    for (const yr of it.result!.historical!.yearReturns) allYears.add(yr.year);
  }
  const sortedYears = Array.from(allYears).sort();
  const equity: number[] = [100];
  for (const yr of sortedYears) {
    const rets = computed
      .map(it => it.result!.historical!.yearReturns.find(r => r.year === yr)?.returnPct)
      .filter((v): v is number => v != null);
    const avg = rets.length > 0 ? rets.reduce((s, v) => s + v, 0) / rets.length : 0;
    equity.push(equity[equity.length - 1] * (1 + avg / 100));
  }

  const min = Math.min(...equity); const max = Math.max(...equity);
  const rng = max - min || 0.001;
  const pad = 20;
  const pts = equity.map((v, i) => {
    const x = (i / (equity.length - 1)) * width;
    const y = height - pad - ((v - min) / rng) * (height - pad - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last  = equity[equity.length - 1];
  const pct   = ((last / equity[0]) - 1) * 100;
  const lastX = width;
  const lastY = height - pad - ((last - min) / rng) * (height - pad - 4);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="eq-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(244,245,247,0.16)" />
          <stop offset="100%" stopColor="rgba(244,245,247,0.01)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f}
          x1={0} y1={height - pad - f * (height - pad - 4)}
          x2={width} y2={height - pad - f * (height - pad - 4)}
          stroke="rgba(255,255,255,0.045)" strokeWidth={0.5} strokeDasharray="3 5" />
      ))}
      <polygon points={`0,${height - pad} ${pts} ${width},${height - pad}`} fill="url(#eq-g)" />
      <polyline points={pts} fill="none" stroke="#e6e7ea" strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill="#e6e7ea" />
      <text x={6} y={13} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>
        Portfolio Equity ({computed.length}/{items.length} Muster berechnet)
      </text>
      <text x={width - 6} y={13} fill={pct >= 0 ? C_GOLD : "rgba(172,96,104,0.90)"}
        fontFamily={FONT} fontSize={11} fontWeight="700" textAnchor="end">
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </text>
    </svg>
  );
}

/* Drawdown */
function DrawdownLine({ items, width, height }: { items: DisplayItem[]; width: number; height: number }) {
  const computed = items.filter(it => it.result?.historical?.yearReturns?.length);
  if (computed.length === 0) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: "block" }}>
        <text x={6} y={height - 4} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Drawdown</text>
      </svg>
    );
  }

  const allYears = new Set<number>();
  for (const it of computed) for (const yr of it.result!.historical!.yearReturns) allYears.add(yr.year);
  const sortedYears = Array.from(allYears).sort();
  const equity: number[] = [100];
  for (const yr of sortedYears) {
    const rets = computed
      .map(it => it.result!.historical!.yearReturns.find(r => r.year === yr)?.returnPct)
      .filter((v): v is number => v != null);
    const avg = rets.length > 0 ? rets.reduce((s, v) => s + v, 0) / rets.length : 0;
    equity.push(equity[equity.length - 1] * (1 + avg / 100));
  }

  let pk = equity[0];
  const dd = equity.map(v => { if (v > pk) pk = v; return (v / pk) - 1; });
  const minDd = Math.min(...dd, -0.001);
  const pts = dd.map((v, i) => {
    const x = (i / (dd.length - 1)) * width;
    const y = 4 + (Math.abs(v) / Math.abs(minDd)) * (height - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const maxDd = Math.min(...dd);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="dd-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="rgba(124,58,67,0.30)" />
          <stop offset="100%" stopColor="rgba(124,58,67,0.04)" />
        </linearGradient>
      </defs>
      <line x1={0} y1={4} x2={width} y2={4} stroke="rgba(255,255,255,0.16)" strokeWidth={0.5} strokeDasharray="5 4" />
      <polygon points={`0,4 ${pts} ${width},4`} fill="url(#dd-g)" />
      <polyline points={pts} fill="none" stroke="rgba(172,96,104,0.86)" strokeWidth={1.45} strokeLinejoin="round" />
      <text x={6} y={height - 4} fill="rgba(255,255,255,0.28)" fontFamily={FONT} fontSize={9}>Drawdown</text>
      <text x={width - 6} y={height - 4} fill={C_GOLD} fontFamily={FONT} fontSize={10} fontWeight="700" textAnchor="end">
        {(maxDd * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

/* ─── Symbol icon fallback ───────────────────────────────────────────────── */
function SymbolIcon({ symbol, dir, size = 40 }: { symbol: string; dir: "LONG" | "SHORT"; size?: number }) {
  const letter = symbol.replace("1!", "").charAt(0);
  const isL    = dir === "LONG";
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 800, color: isL ? "rgba(232,234,239,0.80)" : C_GOLD }}>
        {letter}
      </span>
    </div>
  );
}

/* ─── Tier badge ─────────────────────────────────────────────────────────── */
function TierBadge({ tier }: { tier: TenPatternDef["multipleTestingTier"] }) {
  const isT1 = tier === "bonferroni";
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
      background: isT1 ? "rgba(216,188,103,0.14)" : "rgba(255,255,255,0.06)",
      color: isT1 ? C_GOLD : "rgba(255,255,255,0.40)",
      letterSpacing: "0.06em", textTransform: "uppercase" as const,
    }}>
      {isT1 ? "T1" : "T2"}
    </span>
  );
}

/* ─── KPI mini-cell ─────────────────────────────────────────────────────── */
function KpiCell({ label, value, valueColor = "#eef2f7" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      padding: "5px 7px", borderRadius: 8,
      border: "1px solid rgba(232,237,244,0.12)",
      background: "rgba(12,14,18,0.85)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#7c8798", lineHeight: 1, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: valueColor, lineHeight: 1, fontFamily: FONT }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Detail icon ─────────────────────────────────────────────────────────── */
function DetailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }}>
      <rect x="1" y="2"  width="12" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="6"  width="8"  height="1.5" rx="0.75" fill="currentColor" />
      <rect x="1" y="10" width="10" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

/* ─── Grid card ──────────────────────────────────────────────────────────── */
function SleeveCard({ item, selected, onActivate, onDetail }: {
  item: DisplayItem;
  selected: boolean;
  onActivate: () => void;
  onDetail: () => void;
}) {
  const { def, result, displayId } = item;
  const isLong     = def.direction === "LONG";
  const dirColor   = isLong ? "#e8edf3" : C_GOLD;
  const countdown  = usePatternCountdown(def.calStart);
  const [detailHov, setDetailHov] = useState(false);

  const hist        = result?.historical ?? null;
  const wf          = result?.wf ?? null;
  const statusDetail = result?.statusDetail ?? null;
  const oosWinRate  = wf?.oosWinRatePct ?? null;
  // isWinRatePct is the canonical field; winRatePct is the legacy alias
  const isWinRate   = hist?.isWinRatePct ?? hist?.winRatePct ?? null;
  const displayWr   = oosWinRate ?? isWinRate;
  const displayWrSource: "OOS" | "IS" | null = oosWinRate != null ? "OOS" : isWinRate != null ? "IS" : null;
  // isAvgReturnMeanPct is canonical; avgReturnPct / avgReturnMeanPct are legacy aliases
  const avgReturnPct = hist?.isAvgReturnMeanPct ?? hist?.avgReturnPct ?? null;
  const yearReturns  = hist?.yearReturns ?? [];
  const negativeOosExpectancy = statusDetail?.profitabilityStatus === "negative_oos_expectancy";
  const displaySym   = def.monitoringSymbol.replace("1!", "!");

  const cardBg = selected
    ? `radial-gradient(ellipse 120% 90% at 115% 120%, rgba(216,188,103,0.14) 0%, transparent 55%), ${C_CARD}`
    : C_CARD;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onActivate(); }}
      style={{
        background: cardBg,
        border: selected ? "1px solid rgba(216,188,103,0.32)" : `1px solid ${C_BORDER}`,
        borderRadius: 16,
        padding: "12px 14px 10px",
        display: "flex", flexDirection: "column", gap: 0,
        cursor: "pointer", outline: "none",
        transition: "border-color 120ms",
        height: "100%", boxSizing: "border-box" as const,
        fontFamily: FONT, overflow: "hidden",
      }}
    >
      {/* Row 1: icon · name · WR donut */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AssetIcon def={def} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "0.01em" }}>
            {displaySym}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", lineHeight: 1, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {def.displayName}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <WrDonut pct={displayWr} size={48} />
          {displayWrSource && (
            <span style={{ fontSize: 6, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: "0.08em", textTransform: "uppercase" as const, lineHeight: 1 }}>
              {displayWrSource} WR
            </span>
          )}
        </div>
      </div>

      {/* Row 2: window */}
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.82)", lineHeight: 1, marginBottom: 7, letterSpacing: "-0.1px" }}>
        {def.windowDisplay}
      </div>

      {/* Row 3: countdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: countdown === "Aktiv" ? "#e8edf3" : C_GOLD, lineHeight: 1, letterSpacing: "0.01em" }}>
          {countdown || "—"}
        </span>
        {result?.status === "not_tested" || !result ? (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", lineHeight: 1 }}>
            Nicht getestet
          </span>
        ) : result.status === "no_data_source" ? (
          <span style={{ fontSize: 9, color: C_GOLD, lineHeight: 1 }}>
            Keine Datenquelle
          </span>
        ) : negativeOosExpectancy ? (
          <span style={{ fontSize: 9, color: "rgba(172,96,104,0.90)", lineHeight: 1 }}>
            ↓ Neg. OOS-Erwartung
          </span>
        ) : null}
      </div>

      {/* Row 4: equity chart */}
      <div style={{ flex: 1, minHeight: 50, overflow: "hidden" }}>
        <CardEquityLine
          yearReturns={yearReturns}
          id={`p${displayId}`}
          avgReturnPct={avgReturnPct}
          noDataSource={result?.status === "no_data_source"}
        />
      </div>

      {/* Row 5: direction · detail button */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 13, fontWeight: 900, letterSpacing: "0.06em",
          color: dirColor, lineHeight: 1,
        }}>
          <span style={{ fontSize: 10 }}>{isLong ? "▲" : "▼"}</span>
          {def.direction}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDetail(); }}
          onMouseEnter={() => setDetailHov(true)}
          onMouseLeave={() => setDetailHov(false)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6, border: "none",
            background: detailHov ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
            color: detailHov ? "#e8edf3" : "rgba(255,255,255,0.40)",
            cursor: "pointer", flexShrink: 0, transition: "background 120ms, color 120ms",
          }}
        >
          <DetailIcon />
        </button>
      </div>
    </div>
  );
}

/* ─── Left list row (detail view) ────────────────────────────────────────── */
function PatternListRow({ item, selected, onSelect }: {
  item: DisplayItem; selected: boolean; onSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  const { def, result } = item;
  const dirColor  = def.direction === "LONG" ? "rgba(232,234,239,0.70)" : C_GOLD;
  const hist      = result?.historical;
  const wf        = result?.wf;
  const displayWr = wf?.oosWinRatePct ?? hist?.isWinRatePct ?? hist?.winRatePct ?? null;
  const sortino   = hist?.sortinoRatio ?? null;

  return (
    <button type="button" onClick={onSelect}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", textAlign: "left",
        padding: "7px 10px", border: "none", cursor: "pointer",
        background: selected ? "rgba(216,188,103,0.06)" : hov ? C_HOVER : "transparent",
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        borderLeft: selected ? `2px solid ${C_GOLD}` : "2px solid transparent",
        boxShadow: `inset 3px 0 0 ${selected ? C_GOLD : "transparent"}`,
        transition: "background 0.1s", flexShrink: 0, fontFamily: FONT,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dirColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C_WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.01em" }}>
          {def.monitoringSymbol}
        </div>
        <div style={{ fontSize: 7.5, color: C_TEXT3, whiteSpace: "nowrap" }}>{def.windowDisplay}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C_WHITE }}>
          {displayWr != null ? `${displayWr.toFixed(0)}%` : "—"}
        </div>
        <div style={{ fontSize: 7, color: C_TEXT3 }}>
          {sortino != null ? `S ${sortino.toFixed(1)}` : "—"}
        </div>
      </div>
      <TierBadge tier={def.multipleTestingTier} />
    </button>
  );
}

/* ─── Detail panel ───────────────────────────────────────────────────────── */
function DetailPanel({ item, onGoToChart }: { item: DisplayItem; onGoToChart: () => void }) {
  const { def, result } = item;
  const isLong   = def.direction === "LONG";
  const dirColor = isLong ? "rgba(232,234,239,0.80)" : C_GOLD;

  const hist = result?.historical ?? null;
  const wf   = result?.wf ?? null;
  const status = result?.status ?? "not_tested";

  const isWr   = hist?.isWinRatePct ?? hist?.winRatePct;
  const oosWr  = wf?.oosWinRatePct;
  const isAvg  = hist?.isAvgReturnMeanPct ?? hist?.avgReturnPct;
  const oosAvg = wf?.oosAvgReturnPct;
  const nObs   = hist?.nObs;
  const maxDd  = hist?.maxDrawdownPct;
  const sort   = hist?.sortinoRatio;
  const pf     = hist?.profitFactor;
  const robust = wf?.robustnessPct;
  const decade = hist?.decadeConsistent;
  const yearReturns = hist?.yearReturns ?? [];
  const profStatus = result?.statusDetail?.profitabilityStatus ?? "not_assessed";
  const negOos = profStatus === "negative_oos_expectancy";

  const fmt = (v: number | null | undefined, suf = "", pos = false): string => {
    if (v == null) return "—";
    return `${pos && v >= 0 ? "+" : ""}${v.toFixed(suf === "%" ? 0 : 2)}${suf}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", flex: 1, minHeight: 0, overflow: "hidden", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <SymbolIcon symbol={def.monitoringSymbol} dir={def.direction} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C_WHITE, letterSpacing: "0.01em" }}>
                {def.monitoringSymbol}
              </span>
              <TierBadge tier={def.multipleTestingTier} />
              <span style={{ fontSize: 8, fontWeight: 700, color: dirColor, background: `${dirColor}18`, padding: "1px 5px", borderRadius: 3 }}>
                {def.direction}
              </span>
              <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.40)" }}>
                {statusLabel(status)}
              </span>
            </div>
            <div style={{ fontSize: 10, color: C_TEXT2 }}>{def.displayName} · {def.windowDisplay}</div>
            <div style={{ fontSize: 8, color: C_TEXT3, marginTop: 2 }}>{def.category}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Sortino</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: sort != null ? C_GOLD : "rgba(255,255,255,0.20)", letterSpacing: "-0.5px", lineHeight: 1 }}>
              {sort != null ? sort.toFixed(2) : "—"}
            </div>
          </div>
          <button type="button" onClick={onGoToChart} style={{
            background: "rgba(216,188,103,0.08)", border: "1px solid rgba(216,188,103,0.25)",
            borderRadius: 6, padding: "5px 12px", color: C_GOLD, fontSize: 9,
            cursor: "pointer", fontWeight: 700, fontFamily: FONT, letterSpacing: "0.03em",
          }}>
            ↗ Chart öffnen
          </button>
        </div>
      </div>

      {/* Negative OOS expectancy warning banner */}
      {negOos && (
        <div style={{ background: "rgba(172,96,104,0.12)", border: "1px solid rgba(172,96,104,0.30)", borderRadius: 6, padding: "6px 10px", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(172,96,104,0.90)", letterSpacing: "0.04em" }}>
            ↓ OOS-Erwartung negativ — dieses Muster ist nicht für Signale oder Portfolios geeignet
          </span>
        </div>
      )}

      {/* KPI grids */}
      {[
        [
          { label: "IS Winrate",   value: isWr   != null ? `${isWr.toFixed(0)}%`                        : "—",  color: C_WHITE },
          { label: "OOS Winrate",  value: oosWr  != null ? `${oosWr.toFixed(0)}%`                        : "—",  color: oosWr != null && oosWr >= 70 ? C_WHITE : C_TEXT2 },
          { label: "IS Avg Return", value: isAvg != null ? `${isAvg >= 0 ? "+" : ""}${isAvg.toFixed(2)}%` : "—", color: isAvg != null && isAvg >= 0 ? C_WHITE : C_GOLD },
          { label: "OOS Avg Return", value: oosAvg != null ? `${oosAvg >= 0 ? "+" : ""}${oosAvg.toFixed(2)}%` : "—", color: oosAvg == null ? C_TEXT3 : oosAvg >= 0 ? C_WHITE : "rgba(172,96,104,0.90)" },
        ],
        [
          { label: "IS Beobacht.", value: nObs   != null ? String(nObs)                                  : "—",  color: C_TEXT2 },
          { label: "Robustheit",   value: robust != null ? `${robust.toFixed(0)}%`                       : "—",  color: C_TEXT2 },
          { label: "IS Profit Fkt", value: pf    != null ? pf.toFixed(1)                                 : "—",  color: C_WHITE },
          { label: "IS Max DD",    value: maxDd  != null ? `${maxDd.toFixed(0)}%`                        : "—",  color: C_TEXT2 },
        ],
        [
          { label: "Dekaden",      value: decade != null ? (decade ? "✓ stabil" : "—")                  : "—",  color: decade ? C_TEXT2 : C_TEXT3 },
          { label: "OOS Status",   value: profStatus === "not_assessed" ? "—" : profStatus === "positive_oos_expectancy" ? "Pos." : profStatus === "negative_oos_expectancy" ? "Neg." : "~Null", color: profStatus === "positive_oos_expectancy" ? C_WHITE : profStatus === "negative_oos_expectancy" ? "rgba(172,96,104,0.90)" : C_TEXT2 },
          { label: "Produktion",   value: "Nicht freigeg.", color: C_TEXT3 },
          { label: "Sortino (IS)", value: sort  != null ? sort.toFixed(2)                                 : "—",  color: C_TEXT2 },
        ],
      ].map((row, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C_BORDER}`, flexShrink: 0 }}>
          {row.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 7, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: FONT }}>{s.value}</div>
            </div>
          ))}
        </div>
      ))}

      {/* Charts row */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Jährl. Trade-Ergebnisse{nObs != null ? ` · ${nObs} Trades` : ""}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
            <ReturnBars
              returns={yearReturns.map(r => r.returnPct)}
              width={280} height={54}
            />
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Wirtschaftliche Begründung
          </div>
          <div style={{ fontSize: 10, color: C_TEXT2, lineHeight: 1.65, flex: 1, overflow: "hidden" }}>
            {def.rationale}
          </div>
          {def.csvPath == null && (
            <div style={{ fontSize: 8, color: C_GOLD, marginTop: 6 }}>
              ⚠ Keine lokale CSV-Datenquelle verfügbar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Portfolio KPI box ──────────────────────────────────────────────────── */
function KpiBox({ label, value, sub, valueColor = "#eef2f7" }: {
  label: string; value: string; sub: string; valueColor?: string;
}) {
  return (
    <div style={{
      background: "rgba(12,14,18,0.92)",
      border: "1px solid rgba(232,237,244,0.12)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      backdropFilter: "blur(8px)",
      borderRadius: 10, padding: "10px 14px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#7c8798", textTransform: "uppercase" as const, letterSpacing: "0.10em", marginBottom: 6 }}>{label}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ─── Portfolio view ─────────────────────────────────────────────────────── */
function PortfolioView({ items }: { items: DisplayItem[] }) {
  const computed    = items.filter(it => it.result?.historical);
  const nComputed   = computed.length;
  const nBon        = items.filter(it => it.def.multipleTestingTier === "bonferroni").length;

  const avgIsWr  = nComputed > 0 ? computed.reduce((s, it) => {
    const h = it.result!.historical!;
    const wr = h.isWinRatePct ?? h.winRatePct ?? 0;
    return s + wr;
  }, 0) / nComputed : null;
  const avgOosWr = computed.filter(it => it.result?.wf).length > 0
    ? computed.filter(it => it.result?.wf).reduce((s, it) => s + it.result!.wf!.oosWinRatePct, 0) / computed.filter(it => it.result?.wf).length
    : null;
  const avgSort  = nComputed > 0
    ? computed.filter(it => it.result!.historical!.sortinoRatio != null)
              .reduce((s, it) => s + it.result!.historical!.sortinoRatio!, 0)
      / Math.max(1, computed.filter(it => it.result!.historical!.sortinoRatio != null).length)
    : null;
  const totalN   = nComputed > 0 ? computed.reduce((s, it) => s + (it.result!.historical!.nObs), 0) : null;

  const fmt = (v: number | null, suf = "", decimals = 1): string =>
    v == null ? "—" : `${suf === "+" && v >= 0 ? "+" : ""}${v.toFixed(decimals)}${suf === "+" ? "%" : suf}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flexShrink: 0 }}>
        <KpiBox label="Muster"         value={`${items.length}`}                        sub={`${nBon} Bonferroni`} />
        <KpiBox label="Berechnet"      value={`${nComputed}/${items.length}`}            sub="Historisch" />
        <KpiBox label="Ø IS Win Rate"  value={fmt(avgIsWr, "%", 1)}                     sub="In-Sample" />
        <KpiBox label="Ø OOS Win Rate" value={fmt(avgOosWr, "%", 1)}                    sub="Walk Forward" />
        <KpiBox label="Ø Sortino"      value={fmt(avgSort, "", 2)}                      sub="Risikoadjustiert" />
        <KpiBox label="Gesamt n"       value={totalN != null ? String(totalN) : "—"}    sub="Hist. Trades" />
        <KpiBox label="Status"         value={`${nComputed}/${items.length}`}            sub="Muster bereit" />
      </div>

      {/* Charts + list */}
      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", flex: 3, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PortfolioEquityLine items={items} width={600} height={100} />
            </div>
          </div>
          <div style={{ background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "8px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <DrawdownLine items={items} width={600} height={44} />
            </div>
          </div>
        </div>

        {/* Muster list */}
        <div style={{ flex: 1, minWidth: 0, background: C_CARD, border: `1px solid ${C_BORDER}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ fontSize: 7.5, color: C_TEXT3, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 8, flexShrink: 0 }}>Muster-Übersicht</div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {items.map(it => {
              const dirC   = it.def.direction === "LONG" ? "rgba(232,234,239,0.55)" : C_GOLD;
              const hist   = it.result?.historical;
              const oosWr  = it.result?.wf?.oosWinRatePct ?? hist?.winRatePct ?? null;
              const yrRets = hist?.yearReturns?.map(r => r.returnPct) ?? [];
              return (
                <div key={it.def.patternId} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: dirC, flexShrink: 0 }} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: C_WHITE, width: 32, flexShrink: 0, letterSpacing: "0.01em" }}>
                    {it.def.monitoringSymbol.replace("1!", "")}
                  </span>
                  <ReturnBars returns={yrRets.slice(0, 12)} width={68} height={16} />
                  <span style={{ fontSize: 7.5, color: C_TEXT3, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.def.windowDisplay}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C_TEXT2, flexShrink: 0 }}>
                    {oosWr != null ? `${oosWr.toFixed(0)}%` : "—"}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 7, color: C_TEXT3, marginTop: 4 }}>
              {nComputed === 0 ? "Keine Muster berechnet — compute script ausführen" : `${nComputed} Muster mit echten Daten`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main panel ─────────────────────────────────────────────────────────── */
type Mode = "grid" | "detail" | "portfolio";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSelectPattern?: (assetId: string, startSlot: number, direction: "LONG" | "SHORT") => void;
}

export function SleevePortfolioPanel({ mode, onModeChange, onSelectPattern }: Props) {
  const rawResults = useAllPatternResults();
  const items      = useMemo(() => toDisplayItems(rawResults), [rawResults]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected   = useMemo(() => items.find(it => it.def.patternId === selectedId) ?? null, [items, selectedId]);

  function activatePattern(item: DisplayItem) {
    setSelectedId(item.def.patternId);
    onSelectPattern?.(item.def.assetId, item.def.anchorStartSlot, item.def.direction);
  }

  function openDetail(item: DisplayItem) {
    setSelectedId(item.def.patternId);
    onModeChange("detail");
    onSelectPattern?.(item.def.assetId, item.def.anchorStartSlot, item.def.direction);
  }

  if (rawResults === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: C_TEXT3, fontFamily: FONT, fontSize: 11 }}>
        Lade Muster-Ergebnisse…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: FONT }}>

      {mode === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, flex: 1, minHeight: 0, overflow: "hidden", padding: "12px 14px 14px" }}>
          {items.map(item => (
            <SleeveCard key={item.def.patternId} item={item}
              selected={selectedId === item.def.patternId}
              onActivate={() => activatePattern(item)}
              onDetail={() => openDetail(item)}
            />
          ))}
        </div>
      )}

      {mode === "detail" && (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, overflow: "hidden" }}>
          <div style={{ width: 185, flexShrink: 0, borderRight: `1px solid rgba(255,255,255,0.05)`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {items.map(item => (
              <PatternListRow key={item.def.patternId} item={item}
                selected={selectedId === item.def.patternId}
                onSelect={() => openDetail(item)}
              />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selected
              ? <DetailPanel item={selected} onGoToChart={() => onSelectPattern?.(selected.def.assetId, selected.def.anchorStartSlot, selected.def.direction)} />
              : <div style={{ padding: 20, fontSize: 10, color: C_TEXT3 }}>Muster auswählen</div>
            }
          </div>
        </div>
      )}

      {mode === "portfolio" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <PortfolioView items={items} />
        </div>
      )}
    </div>
  );
}

/** Export pattern list for external use (e.g. chart activation) */
export { TEN_PATTERNS };
