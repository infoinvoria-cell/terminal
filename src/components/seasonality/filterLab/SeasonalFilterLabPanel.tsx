"use client";

import { useCallback, useState, useEffect } from "react";
import { Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";

// ── Constants (same dark theme as StrategyEnginePanel) ────────────────────────
const C_WHITE  = "#F0F3F7";
const C_GOLD   = "#DCC476";
const C_TEXT_2 = "#A8B4C4";
const C_TEXT_3 = "#6A7785";
const C_BG     = "rgba(255,255,255,0.025)";
const C_SOFT   = "rgba(255,255,255,0.07)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

type LabTab = "overview" | "trades" | "compare" | "audit";

// ── KPI card component ─────────────────────────────────────────────────────────
function K({ l, v, c, small }: { l: string; v: string; c?: string; small?: boolean }) {
  return (
    <div style={{ padding: small ? "5px 8px" : "7px 9px", background: C_BG,
      border: `1px solid ${C_SOFT}`, borderRadius: 7, minWidth: 0 }}>
      <div style={{ fontSize: 8, color: C_TEXT_3, marginBottom: 2 }}>{l}</div>
      <div style={{ fontSize: small ? 11 : 13, fontWeight: 700, color: c ?? C_WHITE, lineHeight: 1 }}>{v}</div>
    </div>
  );
}

function pct(v: number | null | undefined, d = 1) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function ratio(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PolicyResult = {
  policy: string;
  keptCount: number;
  filteredCount: number;
  winRate: number;
  avgReturnPct: number;
  profitFactor: number;
  compoundReturnPct: number;
  cagrPct: number;
  // Gate 8: renamed from maxDrawdownPct/calmar — closed-trade equity, NOT bar-level
  closedTradeEquityMaxDrawdownPct: number;
  closedTradeEquityCalmar: number | null;
  riskMethodNote?: string;
  tradingYears: number;
  bootstrap: { median: number; p5: number; p95: number; probPositive: number };
  losersAvoided: number;
  winnersRemoved: number;
};

type TradeDecision = {
  tradeNum: number;
  direction: string;
  entryDate: string;
  exitDate: string;
  netPnlPct: number;
  foldIdx: number | null;
  classification: string;
  matchedPatternLabel: string | null;
  keepBaseline: boolean;
  keepVeto: boolean;
  keepConfirm: boolean;
  keepTop3: boolean;
};

type FoldAudit = {
  foldIdx: number;
  isYears: [number, number];
  oosYears: number[];
  frozenPatternCount: number;
  frozenPatterns: Array<{ dir: string; slot: number; holding: number; label: string; isWR: number }>;
};

type StrategyInfo = {
  file: string;
  label: string;
  detectedAsset: string | null;
};

type AnalysisResult = {
  assetId: string;
  assetName: string;
  assetSymbol: string;
  strategyFile: string;
  strategyName: string;
  totalTrades: number;
  tradesInOosWindow: number;
  tradesOutOfWindow: number;
  foldCount: number;
  oosRange: { start: number; end: number };
  foldAudit: FoldAudit[];
  perPolicy: PolicyResult[];
  perTrade: TradeDecision[];
  runDurationMs: number;
  leakageFreeGuarantee: Record<string, unknown>;
  statisticalRobustness: { status: string; note: string };
};

// ── Policy label map ──────────────────────────────────────────────────────────
const POLICY_LABELS: Record<string, string> = {
  BASELINE:          "Baseline (no filter)",
  COUNTERTREND_VETO: "Countertrend Veto",
  SAME_DIR_CONFIRM:  "Same-Dir Confirmation",
  CONFIRM_AND_VETO:  "Confirm + Veto",
  TOP1_CONFIRM:      "Top 1 Confirmation",
  TOP3_CONFIRM:      "Top 3 Confirmation",
};

const CLASS_COLORS: Record<string, string> = {
  SUPPORT:        "rgba(240,243,247,0.7)",
  CONFLICT:       C_GOLD,
  NEUTRAL:        C_TEXT_3,
  OUT_OF_WINDOW:  "rgba(100,110,120,0.5)",
};

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ result }: { result: AnalysisResult }) {
  const baseline = result.perPolicy.find(p => p.policy === "BASELINE");
  const veto     = result.perPolicy.find(p => p.policy === "COUNTERTREND_VETO");
  const confirm  = result.perPolicy.find(p => p.policy === "SAME_DIR_CONFIRM");
  const top3     = result.perPolicy.find(p => p.policy === "TOP3_CONFIRM");

  const delta = (a: PolicyResult | undefined, b: PolicyResult | undefined, key: keyof PolicyResult): string => {
    if (!a || !b) return "—";
    const va = a[key] as number, vb = b[key] as number;
    if (typeof va !== "number" || typeof vb !== "number") return "—";
    const d = vb - va;
    return `${d >= 0 ? "+" : ""}${d.toFixed(1)}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Study info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
        <K l="Total Trades"       v={String(result.totalTrades)} />
        <K l="In OOS Window"      v={String(result.tradesInOosWindow)} />
        <K l="Out of Window"      v={String(result.tradesOutOfWindow)} small />
        <K l="OOS Folds"          v={String(result.foldCount)} small />
        <K l="OOS Range"          v={`${result.oosRange.start}–${result.oosRange.end}`} small />
      </div>

      {/* Baseline vs best filter comparison */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 8 }}>Baseline vs Seasonal Filters</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 1fr 1fr", gap: 2, fontSize: 9 }}>
          {/* Header */}
          {["Metric","Baseline","Veto Q60","Confirm Q60","Top 3 Q60"].map((h,i) => (
            <div key={i} style={{ padding: "4px 8px", color: C_TEXT_3, fontWeight: 600,
              borderBottom: `1px solid ${C_SOFT}` }}>{h}</div>
          ))}
          {/* Rows */}
          {[
            ["Trades Kept",     (p: PolicyResult) => String(p.keptCount), false],
            ["Win Rate",        (p: PolicyResult) => pct(p.winRate, 0), true],
            ["Compound Return", (p: PolicyResult) => pct(p.compoundReturnPct), true],
            ["CAGR",            (p: PolicyResult) => pct(p.cagrPct), true],
            ["Profit Factor",   (p: PolicyResult) => ratio(p.profitFactor), true],
            ["MaxDD (trade-eq)", (p: PolicyResult) => p.closedTradeEquityMaxDrawdownPct > 0 ? `-${p.closedTradeEquityMaxDrawdownPct.toFixed(1)}%` : "0%", false],
            ["Calmar (trade-eq)",(p: PolicyResult) => ratio(p.closedTradeEquityCalmar), true],
            ["Losers Avoided",  (p: PolicyResult) => String(p.losersAvoided), false],
            ["Winners Removed", (p: PolicyResult) => String(p.winnersRemoved), false],
          ].map(([label, fmt, isMetric]) => {
            const fmtFn = fmt as (p: PolicyResult) => string;
            const policies = [baseline, veto, confirm, top3];
            return (
              <>
                <div key={label as string} style={{ padding: "4px 8px", color: C_TEXT_3,
                  borderBottom: `1px solid rgba(255,255,255,0.03)` }}>{label as string}</div>
                {policies.map((pol, i) => {
                  const val = pol ? fmtFn(pol) : "—";
                  const isPos = val.startsWith("+");
                  const isNeg = val.startsWith("-");
                  const colr = isMetric ? (isPos ? C_WHITE : isNeg ? C_GOLD : C_TEXT_2) : C_TEXT_2;
                  return (
                    <div key={i} style={{ padding: "4px 8px", color: colr,
                      borderBottom: `1px solid rgba(255,255,255,0.03)`,
                      background: i === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      {val}
                    </div>
                  );
                })}
              </>
            );
          })}
        </div>
      </div>

      {/* Classification breakdown */}
      {baseline && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Seasonal Classification (OOS trades)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
            {["SUPPORT","CONFLICT","NEUTRAL","OUT_OF_WINDOW"].map(cls => {
              const count = result.perTrade.filter(t => t.classification === cls).length;
              const label = cls === "OUT_OF_WINDOW" ? "Out of Window" : cls.charAt(0) + cls.slice(1).toLowerCase();
              return <K key={cls} l={label} v={String(count)} c={CLASS_COLORS[cls]} small />;
            })}
          </div>
        </div>
      )}

      {/* Overall filter assessment */}
      <div style={{ padding: "8px 12px", background: "rgba(220,196,118,0.05)",
        border: "1px solid rgba(220,196,118,0.12)", borderRadius: 7, fontSize: 8.5, lineHeight: 1.5 }}>
        <div style={{ color: C_GOLD, fontWeight: 600, marginBottom: 3 }}>
          No universal seasonal filter improvement confirmed
        </div>
        <div style={{ color: C_TEXT_3 }}>
          Wheat SAME_DIR_CONFIRM: interesting hypothesis, but small sample only (13 trades).
          Pre-Move enhanced filters: no consistent benefit confirmed across 4 tested strategies.
          All policies: Research Only — not approved for trading.
        </div>
      </div>

      {/* Leakage guarantee badge */}
      <div style={{ padding: "8px 12px", background: C_BG, border: `1px solid ${C_SOFT}`,
        borderRadius: 7, fontSize: 8.5, color: C_TEXT_3, lineHeight: 1.5 }}>
        <span style={{ color: C_WHITE, fontWeight: 600 }}>Leakage-free: </span>
        Fold-level IS-only pattern discovery. Patterns frozen before each OOS period.
        No future seasonal information used for historical trade decisions.
        Research only — Statistics: {result.statisticalRobustness.status}.
      </div>
    </div>
  );
}

// ── Trade Overlay Tab ─────────────────────────────────────────────────────────
function TradeOverlayTab({ result }: { result: AnalysisResult }) {
  const [showAll, setShowAll] = useState(false);
  const inWindow = result.perTrade.filter(t => t.foldIdx !== null);
  const displayed = showAll ? inWindow : inWindow.slice(0, 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 9.5, color: C_TEXT_3, marginBottom: 2 }}>
        {inWindow.length} trades in OOS window — showing {displayed.length}
        {!showAll && inWindow.length > 50 && (
          <button onClick={() => setShowAll(true)} type="button" style={{
            marginLeft: 8, fontSize: 8.5, color: C_TEXT_2, background: "transparent",
            border: `1px solid ${C_SOFT}`, borderRadius: 4, padding: "1px 6px", cursor: "pointer",
          }}>Show all</button>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C_SOFT}` }}>
              {["#","Dir","Entry","Exit","P&L","Fold","Classification","Pattern","Veto","Confirm","Top3"].map(h => (
                <th key={h} style={{ padding: "4px 6px", color: C_TEXT_3, textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((t, i) => {
              const clsColor = CLASS_COLORS[t.classification] ?? C_TEXT_3;
              const retColor = t.netPnlPct > 0 ? C_WHITE : C_GOLD;
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <td style={{ padding: "3px 6px", color: C_TEXT_3 }}>{t.tradeNum}</td>
                  <td style={{ padding: "3px 6px", color: t.direction==="LONG"?C_WHITE:C_GOLD, fontWeight: 600 }}>{t.direction}</td>
                  <td style={{ padding: "3px 6px", color: C_TEXT_2, fontSize: 8.5 }}>{t.entryDate}</td>
                  <td style={{ padding: "3px 6px", color: C_TEXT_2, fontSize: 8.5 }}>{t.exitDate}</td>
                  <td style={{ padding: "3px 6px", color: retColor, fontWeight: 600 }}>{t.netPnlPct >= 0 ? "+" : ""}{t.netPnlPct.toFixed(2)}%</td>
                  <td style={{ padding: "3px 6px", color: C_TEXT_3 }}>{t.foldIdx ?? "—"}</td>
                  <td style={{ padding: "3px 6px", color: clsColor, fontSize: 8.5 }}>{t.classification}</td>
                  <td style={{ padding: "3px 6px", color: C_TEXT_3, fontSize: 8, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.matchedPatternLabel ?? "—"}
                  </td>
                  <td style={{ padding: "3px 6px", color: t.keepVeto ? C_WHITE : C_GOLD, fontSize: 8.5 }}>{t.keepVeto?"✓":"✗"}</td>
                  <td style={{ padding: "3px 6px", color: t.keepConfirm ? C_WHITE : C_GOLD, fontSize: 8.5 }}>{t.keepConfirm?"✓":"✗"}</td>
                  <td style={{ padding: "3px 6px", color: t.keepTop3 ? C_WHITE : C_GOLD, fontSize: 8.5 }}>{t.keepTop3?"✓":"✗"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filter Compare Tab ────────────────────────────────────────────────────────
function FilterCompareTab({ result }: { result: AnalysisResult }) {
  const yearlyData = result.perTrade
    .filter(t => t.keepBaseline && t.foldIdx !== null)
    .reduce((acc, t) => {
      const yr = parseInt(t.entryDate.slice(0,4));
      if (!acc[yr]) acc[yr] = { baseline: 0, veto: 0, confirm: 0, top3: 0 };
      acc[yr].baseline += t.netPnlPct;
      if (t.keepVeto)    acc[yr].veto    += t.netPnlPct;
      if (t.keepConfirm) acc[yr].confirm += t.netPnlPct;
      if (t.keepTop3)    acc[yr].top3    += t.netPnlPct;
      return acc;
    }, {} as Record<number, { baseline: number; veto: number; confirm: number; top3: number }>);

  const chartData = Object.entries(yearlyData).sort(([a],[b]) => +a - +b).map(([yr, v]) => ({
    year: +yr,
    baseline: parseFloat(v.baseline.toFixed(2)),
    veto: parseFloat(v.veto.toFixed(2)),
    confirm: parseFloat(v.confirm.toFixed(2)),
    top3: parseFloat(v.top3.toFixed(2)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Full comparison table */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Filter Policy Comparison Matrix</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C_SOFT}` }}>
                {["Policy","Kept","WR","Return","CAGR","PF","MaxDD¹","Calmar¹","Losers Avoided","Winners Removed","BStp P5","BStp P95","P(>0)","Status"].map(h => (
                  <th key={h} style={{ padding: "4px 6px", color: C_TEXT_3, textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.perPolicy.map((pol, i) => {
                const retColor = pol.compoundReturnPct >= 0 ? C_WHITE : C_GOLD;
                const ddColor = C_GOLD;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)`,
                    background: i === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                    <td style={{ padding: "4px 6px", color: C_TEXT_2, fontWeight: 600 }}>{POLICY_LABELS[pol.policy] ?? pol.policy}</td>
                    <td style={{ padding: "4px 6px", color: C_TEXT_2 }}>{pol.keptCount}</td>
                    <td style={{ padding: "4px 6px", color: pol.winRate>=50?C_WHITE:C_GOLD }}>{pol.winRate.toFixed(0)}%</td>
                    <td style={{ padding: "4px 6px", color: retColor }}>{pol.compoundReturnPct>=0?"+":""}{pol.compoundReturnPct.toFixed(1)}%</td>
                    <td style={{ padding: "4px 6px", color: pol.cagrPct>=0?C_WHITE:C_GOLD }}>{pol.cagrPct>=0?"+":""}{pol.cagrPct.toFixed(1)}%</td>
                    <td style={{ padding: "4px 6px", color: pol.profitFactor>=1?C_WHITE:C_GOLD }}>{pol.profitFactor.toFixed(2)}</td>
                    <td style={{ padding: "4px 6px", color: ddColor }}>{pol.closedTradeEquityMaxDrawdownPct>0?`-${pol.closedTradeEquityMaxDrawdownPct.toFixed(1)}%`:"0%"}</td>
                    <td style={{ padding: "4px 6px", color: (pol.closedTradeEquityCalmar??0)>=1?C_WHITE:C_TEXT_3 }}>{pol.closedTradeEquityCalmar!=null?pol.closedTradeEquityCalmar.toFixed(2):"—"}</td>
                    <td style={{ padding: "4px 6px", color: C_TEXT_2 }}>{pol.losersAvoided}</td>
                    <td style={{ padding: "4px 6px", color: C_TEXT_2 }}>{pol.winnersRemoved}</td>
                    <td style={{ padding: "4px 6px", color: pol.bootstrap.p5>=0?C_WHITE:C_GOLD, fontSize: 8 }}>{pol.bootstrap.p5>=0?"+":""}{pol.bootstrap.p5.toFixed(1)}%</td>
                    <td style={{ padding: "4px 6px", color: pol.bootstrap.p95>=0?C_WHITE:C_GOLD, fontSize: 8 }}>{pol.bootstrap.p95>=0?"+":""}{pol.bootstrap.p95.toFixed(1)}%</td>
                    <td style={{ padding: "4px 6px", color: C_TEXT_2, fontSize: 8 }}>{(pol.bootstrap.probPositive*100).toFixed(0)}%</td>
                    <td style={{ padding: "4px 6px", color: C_GOLD, fontSize: 8 }}>Research</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 6, fontSize: 8, color: C_TEXT_3 }}>
{"BStp = Bootstrap 500-sample CI. P(>0) = probability of positive compound return. ¹MaxDD/Calmar = closed-trade equity (TV import returns), NOT intrabar bar-level strategy risk."}
          All policies tested simultaneously → Multiple Testing pending. Research only — no policy is statistically approved.
        </div>
      </div>

      {/* Yearly return comparison chart */}
      {chartData.length > 0 && (
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Annual Sum Return by Policy (OOS window)</div>
          <div style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 14, left: 4 }}>
                <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${v>=0?"+":""}${v.toFixed(0)}%`} width={34} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="baseline" stroke="rgba(168,180,196,0.5)" strokeWidth={1} dot={false} name="Baseline" isAnimationActive={false} />
                <Line type="monotone" dataKey="veto"     stroke={C_GOLD} strokeWidth={1.5} dot={false} name="Veto" isAnimationActive={false} />
                <Line type="monotone" dataKey="confirm"  stroke={C_WHITE} strokeWidth={1.5} dot={false} name="Confirm" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────
function AuditTab({ result }: { result: AnalysisResult }) {
  const row = (l: string, v: string) => (
    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 9.5 }}>
      <span style={{ color: C_TEXT_3 }}>{l}</span>
      <span style={{ color: C_TEXT_2, fontFamily: "monospace", fontSize: 9, maxWidth: "60%", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Strategy Source</div>
        {[
          ["Strategy File", result.strategyFile],
          ["Strategy Name", result.strategyName],
          ["Asset", `${result.assetName} (${result.assetSymbol})`],
          ["Total Trades", String(result.totalTrades)],
          ["In OOS Window", String(result.tradesInOosWindow)],
          ["OOS Range", `${result.oosRange.start}–${result.oosRange.end}`],
          ["Run Duration", `${result.runDurationMs}ms`],
        ].map(([l,v]) => row(l,v))}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Leakage-Free Guarantee</div>
        {[
          ["Method", String(result.leakageFreeGuarantee.method ?? "—")],
          ["Outer Walk-Forward", String(result.leakageFreeGuarantee.outerWalkForward ?? "—")],
          ["Frozen Before OOS", "yes"],
          ["No Future Info", "yes"],
          ["Statistics Status", result.statisticalRobustness.status],
        ].map(([l,v]) => row(l,v))}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Fold Audit ({result.foldAudit.length} folds)</div>
        {result.foldAudit.map((f, i) => (
          <div key={i} style={{ marginBottom: 8, padding: "6px 8px", background: C_BG, borderRadius: 5, fontSize: 8.5 }}>
            <div style={{ color: C_TEXT_2, fontWeight: 600, marginBottom: 3 }}>
              Fold {f.foldIdx} · IS {f.isYears[0]}–{f.isYears[1]} · OOS {f.oosYears.join(",")} · {f.frozenPatternCount} patterns
            </div>
            {f.frozenPatterns.map((p, j) => (
              <div key={j} style={{ color: p.dir==="SHORT"?C_GOLD:C_WHITE, fontSize: 8, padding: "1px 4px" }}>
                {p.dir} {p.label} · IS WR {p.isWR}%
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: "7px 10px", background: "rgba(220,196,118,0.05)",
        border: "1px solid rgba(220,196,118,0.12)", borderRadius: 7, fontSize: 8.5, color: C_GOLD, lineHeight: 1.5 }}>
        {result.statisticalRobustness.note}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function SeasonalFilterLabPanel({ assetId }: { assetId: string }) {
  const [tab, setTab] = useState<LabTab>("overview");
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [jobState, setJobState] = useState<{
    status: "idle" | "running" | "complete" | "error";
    progress: string;
    result: AnalysisResult | null;
  }>({ status: "idle", progress: "", result: null });

  // Discover available strategies on mount (read-only, no analysis)
  useEffect(() => {
    fetch("/api/seasonality/filter-lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discoverStrategies" }),
    })
      .then(r => r.json())
      .then((d: { strategies?: StrategyInfo[] }) => {
        const strats = d.strategies ?? [];
        // Pre-filter to agriculture strategies
        const agriStrats = strats.filter(s => s.detectedAsset !== null);
        setStrategies(agriStrats);
        // Auto-select first strategy matching current asset
        const match = agriStrats.find(s => s.detectedAsset === assetId)
          ?? agriStrats[0];
        if (match) {
          setSelectedFile(match.file);
          setSelectedAsset(match.detectedAsset ?? assetId);
        }
      })
      .catch(() => {});
  }, [assetId]);

  const runAnalysis = useCallback(async () => {
    if (jobState.status === "running") return;
    if (!selectedFile) return;
    setJobState({ status: "running", progress: "Computing as-of seasonal signals…", result: null });

    try {
      const res = await fetch("/api/seasonality/filter-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runAnalysis", strategyFile: selectedFile, assetId: selectedAsset || assetId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as AnalysisResult;
      if ((result as Record<string,unknown>).error) throw new Error(String((result as Record<string,unknown>).error));
      setJobState({ status: "complete", progress: "Complete", result });
    } catch (err) {
      setJobState(prev => ({ ...prev, status: "error", progress: String(err) }));
    }
  }, [selectedFile, selectedAsset, assetId, jobState.status]);

  const TABS: { key: LabTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "trades",   label: "Trade Overlay" },
    { key: "compare",  label: "Filter Compare" },
    { key: "audit",    label: "Audit" },
  ];
  const TB = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    border: `1px solid ${active ? "rgba(255,255,255,0.12)" : "transparent"}`,
    borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontFamily: FONT,
    fontSize: 10, fontWeight: active ? 600 : 400, color: active ? C_WHITE : C_TEXT_3,
  });

  return (
    <div style={{ fontFamily: FONT, padding: "10px 14px 36px", color: C_WHITE }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, flexWrap: "wrap", gap: 8, paddingBottom: 7,
        borderBottom: `1px solid ${C_SOFT}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Strategy selector */}
          <select
            value={selectedFile}
            onChange={e => {
              const file = e.target.value;
              const strat = strategies.find(s => s.file === file);
              setSelectedFile(file);
              setSelectedAsset(strat?.detectedAsset ?? assetId);
            }}
            style={{ background: "rgba(10,10,10,0.9)", border: `1px solid ${C_SOFT}`,
              borderRadius: 5, padding: "3px 8px", color: C_WHITE, fontSize: 10,
              fontFamily: FONT, outline: "none", maxWidth: 380 }}
          >
            <option value="">Select strategy…</option>
            {strategies.map(s => (
              <option key={s.file} value={s.file}>{s.label}</option>
            ))}
          </select>
          {selectedFile && selectedAsset && (
            <span style={{ fontSize: 9, color: C_TEXT_3, padding: "2px 6px",
              background: C_BG, border: `1px solid ${C_SOFT}`, borderRadius: 4 }}>
              → {AGRI_REGISTRY_NAMES[selectedAsset] ?? selectedAsset}
            </span>
          )}
          {jobState.result && (
            <span style={{ fontSize: 9, padding: "1px 6px", background: C_BG,
              border: `1px solid ${C_SOFT}`, borderRadius: 4, color: C_TEXT_2 }}>
              {jobState.result.tradesInOosWindow} trades · {jobState.result.foldCount} folds
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {jobState.status === "running" && (
            <span style={{ fontSize: 9, color: C_TEXT_2 }}>{jobState.progress}</span>
          )}
          {jobState.status !== "running" && selectedFile && (
            <button type="button" onClick={runAnalysis} style={{
              background: "rgba(240,243,247,0.06)", border: "1px solid rgba(240,243,247,0.14)",
              borderRadius: 5, padding: "4px 12px", cursor: "pointer", color: C_WHITE,
              fontSize: 10, fontWeight: 600, fontFamily: FONT }}>
              {jobState.status === "idle" ? "Run Analysis" : "Re-Run Analysis"}
            </button>
          )}
        </div>
      </div>

      {/* ── Idle ───────────────────────────────────────────────────────────── */}
      {jobState.status === "idle" && (
        <div style={{ padding: "20px", textAlign: "center", border: `1px dashed ${C_SOFT}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C_TEXT_3, marginBottom: 4 }}>
            {selectedFile
              ? <>Select a strategy above and click <strong style={{ color: C_WHITE }}>Run Analysis</strong>.</>
              : strategies.length === 0
                ? <><strong style={{ color: C_TEXT_2 }}>No existing strategy trade source available.</strong><br/>Corn · Soybeans · Coffee · Cotton have no base strategy CSV. Only Wheat · Cocoa · OJ · Sugar have existing strategy CSVs.</>
                : "Select a strategy above to begin analysis."
            }
          </div>
          <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: 4 }}>
            Leakage-free: fold-level IS-only pattern discovery · No future seasonal info used
          </div>
        </div>
      )}

      {/* ── Running ────────────────────────────────────────────────────────── */}
      {jobState.status === "running" && (
        <div style={{ padding: "14px", textAlign: "center", border: `1px solid ${C_SOFT}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10.5, color: C_TEXT_2, marginBottom: 5 }}>{jobState.progress}</div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {jobState.status === "error" && (
        <div style={{ padding: "9px", background: "rgba(220,196,118,0.07)",
          border: "1px solid rgba(220,196,118,0.2)", borderRadius: 7, color: C_GOLD, fontSize: 9.5 }}>
          {jobState.progress || "Analysis failed. Re-run to retry."}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {jobState.result && (
        <>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} style={TB(tab === t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === "overview" && <OverviewTab result={jobState.result} />}
          {tab === "trades"   && <TradeOverlayTab result={jobState.result} />}
          {tab === "compare"  && <FilterCompareTab result={jobState.result} />}
          {tab === "audit"    && <AuditTab result={jobState.result} />}
        </>
      )}
    </div>
  );
}

// Small lookup for display
const AGRI_REGISTRY_NAMES: Record<string, string> = {
  soybeans: "Soybeans (ZS1!)", wheat: "Wheat (ZW1!)", corn: "Corn (ZC1!)",
  cocoa: "Cocoa (CC1!)", coffee: "Coffee (KC1!)", sugar: "Sugar (SB1!)",
  cotton: "Cotton (CT1!)", orangejuice: "Orange Juice (OJ1!)",
};
