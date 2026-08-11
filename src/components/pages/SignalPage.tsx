"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { useInterval } from "@/hooks/use-interval";
import SignalCard from "@/components/signal/SignalCard";
import LiveWatchlistPanel from "@/components/signals/LiveWatchlistPanel";
import LivePipelineView from "@/components/signals/LivePipelineView";
import { SignalLiveOhlcChart } from "@/components/signal/SignalLiveOhlcChart";
import type { Phase } from "@/components/referenzen/ReferenzenPage";

const ReferenceEquityChart   = dynamic(() => import("@/components/referenzen/ReferenceEquityChart"),   { ssr: false });
const ReferenceDrawdownChart = dynamic(() => import("@/components/referenzen/ReferenceDrawdownChart"), { ssr: false });
import type {
  SignalCardFilter,
  SignalCardModel,
  SignalPageModel,
  SignalPageSection,
} from "@/lib/signals/signal-types";

// ── Design tokens — identical to Referenzen ───────────────────────────────────

/** Chart / section container — same as ReferenzenPage BOX */
const BOX: React.CSSProperties = {
  background: "linear-gradient(to bottom, #17171b, #0b0b0e)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.055)",
  overflow: "hidden",
  position: "relative",
  flexShrink: 0,
};

/** KPI card — same as ReferenzenPage KpiCard */
const KPI_CARD_BG = "linear-gradient(to bottom, #26262d, #111114)";

const MONTSERRAT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const NUNITO     = "var(--font-numbers, 'Nunito', sans-serif)";

// ── Drawdown fallback ─────────────────────────────────────────────────────────

function computeDrawdownFromEquity(
  equity: Array<{ time: string; value: number }>,
): Array<{ time: string; value: number }> {
  let peak = -Infinity;
  return equity.map((p) => {
    const v = p.value;
    if (v > peak) peak = v;
    const dd = peak > -Infinity && peak !== 0 ? ((v - peak) / Math.abs(peak)) * 100 : 0;
    return { time: p.time, value: Math.min(0, dd) };
  });
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function nextLabelDaysAhead(label?: string): number | null {
  if (!label) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(`${label}T00:00:00`);
    if (!isFinite(d.getTime())) return null;
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
  }
  const m = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (m) {
    const d = new Date(today.getFullYear(), parseInt(m[2]!, 10) - 1, parseInt(m[1]!, 10));
    if (d < today) d.setFullYear(today.getFullYear() + 1);
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
  }
  return null;
}

function hasVisibleStatus(card: SignalCardModel): boolean {
  if (card.status === "OPEN" || card.status === "CLOSED") return true;
  if (card.direction === "LONG" || card.direction === "SHORT") return true;
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  return days != null && days >= 0;
}

function signalDateDaysAhead(signalDate?: string | null): number | null {
  if (!signalDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${signalDate}T00:00:00`);
  if (!isFinite(d.getTime())) return null;
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function matchesFilter(card: SignalCardModel, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;

  if (filter === "open") {
    if (card.status === "CLOSED") return false;
    if (card.status === "OPEN") return true;
    const sdDays = signalDateDaysAhead(card.signalDate);
    if (sdDays != null && sdDays > 1) return false;
    const days = nextLabelDaysAhead(card.nextSignalLabel);
    if (days != null && days > 1) return false;
    const hasDir = card.direction === "LONG" || card.direction === "SHORT";
    const hasTpSl = card.tp != null && card.sl != null;
    return hasDir || hasTpSl || (days != null && days >= 0);
  }

  if (filter === "last7") {
    if (card.ageDays != null && card.ageDays <= 7) return true;
    if (card.signalDate) {
      const d = new Date(`${card.signalDate}T00:00:00`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return (today.getTime() - d.getTime()) / 86_400_000 <= 7;
    }
    return false;
  }

  if (filter === "pending") {
    if (card.direction === "PENDING") return true;
    const days = nextLabelDaysAhead(card.nextSignalLabel);
    if (days != null && days > 1) return true;
    const sdDays = signalDateDaysAhead(card.signalDate);
    if (sdDays != null && sdDays > 1) return true;
    if (card.status !== "OPEN" && card.status !== "CLOSED" && card.nextSignalLabel && days === null) return true;
    return false;
  }

  return true;
}

// ── Pill tab style ────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<string, string> = {
  open:   "AKTUELL",
  last7:  "LETZTE 7 TAGE",
  pending: "AUSSTEHEND",
};

// ── Section Panel (White Swan / Core Invest) ──────────────────────────────────

function SectionPanel({
  section,
  logo,
  selectedCardId,
  onSelect,
  livePositions,
}: {
  section: SignalPageSection;
  logo: string;
  selectedCardId: string | null;
  onSelect: (card: SignalCardModel) => void;
  livePositions?: Set<string>;
}) {
  const [filter, setFilter] = useState<SignalCardFilter>("open");

  const allCards = useMemo(
    () => section.groups.flatMap((g) => g.cards).filter(hasVisibleStatus),
    [section.groups],
  );
  const visible = useMemo(
    () => allCards.filter((c) => matchesFilter(c, filter)),
    [allCards, filter],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header: title + filter tabs */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.055)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={section.title} width={15} height={15} style={{ objectFit: "contain", flexShrink: 0 }} />
        <span style={{
          fontSize: 10.5, fontWeight: 800,
          color: "rgba(255,255,255,0.78)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontFamily: MONTSERRAT, whiteSpace: "nowrap",
        }}>
          {section.title}
        </span>
        <span style={{
          fontSize: 9, color: "rgba(255,255,255,0.2)",
          fontFamily: MONTSERRAT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {section.subtitle}
        </span>

        {/* Pill filter tabs */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3, flexShrink: 0 }}>
          {(["open", "last7", "pending"] as SignalCardFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 9px",
                background: filter === f ? KPI_CARD_BG : "transparent",
                border: filter === f ? "1.5px solid rgba(255,255,255,0.22)" : "1.5px solid transparent",
                borderRadius: 999,
                color: filter === f ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.28)",
                fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em",
                cursor: "pointer", fontFamily: MONTSERRAT,
                transition: "all 150ms ease", whiteSpace: "nowrap",
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Card list — scrollable */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        <div
          className="no-scrollbar"
          style={{ height: "100%", overflowY: "auto", overflowX: "hidden", padding: "10px 12px" }}
        >
          {visible.length === 0 ? (
            <div style={{
              padding: "18px 4px", textAlign: "center",
              fontSize: 11, color: "rgba(255,255,255,0.18)",
              fontFamily: MONTSERRAT,
            }}>
              Keine aktuellen Signale
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))",
              gap: 8, paddingBottom: 20,
            }}>
              {visible.map((card) => (
                <div key={card.id} style={{ position: "relative" }}>
                  <SignalCard
                    card={card}
                    active={selectedCardId === card.id}
                    onSelect={onSelect}
                  />
                  {livePositions?.has(card.assetSymbol) && (
                    <div
                      title="Live-bestätigt (forward_signals)"
                      style={{
                        position: "absolute", top: 6, right: 6,
                        display: "flex", alignItems: "center", gap: 3,
                        background: "rgba(0,200,100,0.12)",
                        border: "1px solid rgba(0,200,100,0.3)",
                        borderRadius: 4, padding: "1px 5px",
                        fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
                        color: "#00c864", pointerEvents: "none",
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00c864", display: "inline-block" }} />
                      LIVE
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Bottom fade — matches BOX card background */}
        <div style={{
          pointerEvents: "none", position: "absolute", bottom: 0, left: 0, right: 0, height: 28,
          background: "linear-gradient(to bottom, transparent, #0b0b0e)",
        }} />
      </div>
    </div>
  );
}

// ── KPI metric card — Referenzen style ───────────────────────────────────────

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueColor = tone === "negative" ? "#a1a1aa" : "#F0F2F6";
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: KPI_CARD_BG,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.055)",
      padding: "11px 14px 12px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      overflow: "hidden",
    }}>
      <span style={{
        fontSize: 12, fontWeight: 400, lineHeight: 1,
        color: "rgba(180,192,210,0.6)",
        fontFamily: MONTSERRAT,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {label}
      </span>
      <strong style={{
        fontSize: 20, fontWeight: 700, lineHeight: 1,
        color: valueColor,
        fontFamily: NUNITO,
        whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </strong>
    </div>
  );
}

// ── Empty KPI fallback labels (when no card is selected) ─────────────────────

const FALLBACK_KPI_LABELS = [
  "Profit Factor",
  "Win Rate",
  "Avg Return",
  "Expectancy",
  "Ø Holding",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export type SignalPageData = SignalPageModel;

export default function SignalPage({ data }: { data: SignalPageData }) {
  const mounted = useClientMounted();
  const router  = useRouter();

  const whiteSwan  = data.sections.find((s) => s.id === "white_swan");
  const coreInvest = data.sections.find((s) => s.id === "core_invest");

  // Prefer a non-intraday card for the initial chart selection (intraday cards have no equity curve)
  const firstCard = data.cards.find((c) => c.category !== "intraday_mt") ?? data.cards[0] ?? null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(firstCard?.id ?? null);
  const [showWatchlist, setShowWatchlist]   = useState(false);
  const [showPipeline,  setShowPipeline]    = useState(false);
  const [fullData,      setFullData]        = useState(false);
  const [livePositions, setLivePositions]   = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/signals/live");
        if (!r.ok) return;
        const d = await r.json() as { items?: Array<{ symbol: string; inPosition: boolean }> };
        const open = new Set<string>((d.items ?? []).filter((i) => i.inPosition).map((i) => i.symbol));
        setLivePositions(open);
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, []);

  const selectedCard = useMemo(
    () => data.cards.find((c) => c.id === selectedCardId) ?? firstCard,
    [data.cards, selectedCardId, firstCard],
  );
  const selectedPreview = selectedCard ? (data.previews[selectedCard.id] ?? null) : null;

  const refresh = useCallback(() => { router.refresh(); }, [router]);
  useInterval(refresh, 5000);

  // Auto-select first non-intraday card with chart/performance data
  useEffect(() => {
    if (!mounted) return;
    const first = data.cards
      .filter((c) => c.category !== "intraday_mt")
      .find((c) => {
        const p = data.previews[c.id];
        return Boolean(p?.chart ?? p?.performance);
      });
    if (first) setSelectedCardId(first.id);
  }, [mounted, data.cards, data.previews]);

  const [phase, setPhase] = useState<Phase>("All");

  const perf = selectedPreview?.performance ?? null;

  const equityData = useMemo(() => perf?.equityCurve ?? [], [perf]);

  const drawdownData = useMemo(() => {
    if (!perf) return [];
    const dd = perf.drawdownCurve ?? [];
    const hasRealDd = dd.some((p) => p.value < 0);
    return hasRealDd ? dd : computeDrawdownFromEquity(perf.equityCurve ?? []);
  }, [perf]);

  const totalReturnPercent = equityData[equityData.length - 1]?.value ?? 0;
  const yearsSpan = useMemo(() => {
    if (equityData.length < 2) return 1;
    const t0 = new Date(equityData[0].time).getTime();
    const t1 = new Date(equityData[equityData.length - 1].time).getTime();
    return Math.max((t1 - t0) / (365.25 * 86_400_000), 0.01);
  }, [equityData]);
  const cagr = Math.round(((Math.pow(1 + totalReturnPercent / 100, 1 / yearsSpan) - 1) * 100) * 10) / 10;

  const maxDD = useMemo(() => Math.min(0, ...drawdownData.map((p) => p.value)), [drawdownData]);
  const avgDD = useMemo(() => {
    const neg = drawdownData.filter((p) => p.value < 0);
    return neg.length ? neg.reduce((s, p) => s + p.value, 0) / neg.length : 0;
  }, [drawdownData]);

  return (
    <div style={{
      position: "relative",
      display: "flex",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#09090b",
      padding: "14px 20px",
      gap: 14,
      boxSizing: "border-box",
    }}>

      {/* ── Live Pipeline Fullscreen overlay ──────────────────────────────── */}
      {showPipeline && (
        <LivePipelineView onClose={() => setShowPipeline(false)} />
      )}

      {/* ── Live Feed pull tab (right edge) ──────────────────────────────── */}
      <button
        onClick={() => setShowWatchlist((v) => !v)}
        title={showWatchlist ? "Live Feed schließen" : "Live Feed öffnen"}
        style={{
          position: "fixed",
          right: showWatchlist ? "10%" : 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 50,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 6, width: 20, padding: "14px 0",
          background: "#161820",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          cursor: "pointer", transition: "right 150ms ease",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="10" height="10" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
          <line x1="7.5" y1="0.5" x2="7.5" y2="10.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
        </svg>
        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={showWatchlist ? "M1 1.5L4.5 5L1 8.5" : "M5 1.5L1.5 5L5 8.5"}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── LEFT COLUMN (50%): White Swan + Core Invest ───────────────────── */}
      <div style={{
        width: showWatchlist ? "45%" : "50%",
        flexShrink: 0,
        display: "flex", flexDirection: "column",
        gap: 10,
        height: "100%",
        minHeight: 0,
      }}>

        {/* White Swan — ~60% height */}
        <div style={{
          flex: "3 1 0",
          minHeight: 0,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}>
          {whiteSwan ? (
            <SectionPanel
              section={whiteSwan}
              logo="/branding/white-swan-icon.png"
              selectedCardId={selectedCardId}
              onSelect={(c) => setSelectedCardId(c.id)}
            />
          ) : (
            <div style={{ padding: 20, fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: MONTSERRAT }}>
              White Swan — keine Daten verfügbar
            </div>
          )}
        </div>

        {/* Core Invest — ~40% height */}
        <div style={{
          flex: "2 1 0",
          minHeight: 0,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}>
          {coreInvest ? (
            <SectionPanel
              section={coreInvest}
              logo="/branding/capitalife-favicon.png"
              selectedCardId={selectedCardId}
              onSelect={(c) => setSelectedCardId(c.id)}
              livePositions={livePositions}
            />
          ) : (
            <div style={{ padding: 20, fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: MONTSERRAT }}>
              Core Invest — keine Daten verfügbar
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT COLUMN (50%): charts + KPIs filling full height ──────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
        minHeight: 0,
      }}>
        <div style={{ ...BOX, flex: "4 1 0", minHeight: 0 }}>
          <SignalLiveOhlcChart
            symbol={selectedCard?.assetSymbol ?? "GC1!"}
            assetName={selectedCard?.assetName ?? "Gold Futures"}
          />
        </div>

        <div style={{ ...BOX, flex: "2.5 1 0", minHeight: 0 }}>
          {mounted && (
            <ReferenceEquityChart
              data={equityData}
              totalReturnPercent={totalReturnPercent}
              cagr={cagr}
              phase={phase}
              onPhaseChange={setPhase}
            />
          )}
        </div>

        <div style={{ ...BOX, flex: "2.5 1 0", minHeight: 0 }}>
          {mounted && (
            <ReferenceDrawdownChart
              data={drawdownData}
              maxDrawdownPercent={Math.abs(maxDD)}
              avgDrawdownPercent={Math.abs(avgDD)}
              phase={phase}
              onPhaseChange={setPhase}
            />
          )}
        </div>

        {/* KPI row — 5 metric cards */}
        <div style={{ flex: "0 0 84px", display: "flex", gap: 8 }}>
          <MetricCard label="Profit Factor" value={perf ? perf.summary.profitFactor.toFixed(2) : "—"} />
          <MetricCard label="Win Rate"      value={perf ? `${perf.summary.winRatePercent.toFixed(1)}%` : "—"} />
          <MetricCard label="Expectancy"    value={perf ? `${perf.summary.expectancyPercent > 0 ? "+" : ""}${perf.summary.expectancyPercent.toFixed(2)}%` : "—"} />
          <MetricCard label="Sharpe"        value={perf ? perf.summary.sharpeRatio.toFixed(2) : "—"} />
          <MetricCard label="Calmar"        value={perf ? perf.summary.calmarRatio.toFixed(2) : "—"} />
        </div>
      </div>

      {/* ── RIGHT: Live Watchlist (conditional) ─────────────────────────────── */}
      {showWatchlist && (
        <div style={{ width: "10%", flexShrink: 0, height: "100%", overflow: "hidden" }}>
          <LiveWatchlistPanel
            cards={data.cards}
            selectedCardId={selectedCardId}
            onSelectCard={(id) => setSelectedCardId(id)}
            fullData={fullData}
            onFullDataChange={setFullData}
          />
        </div>
      )}
    </div>
  );
}
