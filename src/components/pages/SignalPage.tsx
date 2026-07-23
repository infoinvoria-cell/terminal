"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MonitoringChart from "@/components/monitoring/MonitoringChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { useInterval } from "@/hooks/use-interval";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import SignalCard from "@/components/signal/SignalCard";
import LiveWatchlistPanel from "@/components/signals/LiveWatchlistPanel";
import type {
  SignalCardFilter,
  SignalCardModel,
  SignalPageModel,
  SignalPageSection,
} from "@/lib/signals/signal-types";

// ── Drawdown fallback ──────────────────────────────────────────────────────────

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

// ── Filter helpers ─────────────────────────────────────────────────────────────

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

function matchesFilter(card: SignalCardModel, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    const hasDir = card.direction === "LONG" || card.direction === "SHORT";
    const hasTpSl = card.tp != null && card.sl != null;
    const days = nextLabelDaysAhead(card.nextSignalLabel);
    return hasDir || hasTpSl || (days != null && days >= 0 && days <= 1);
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
    return days != null && days >= 0 && days <= 2;
  }
  return true;
}


// ── Section panel ──────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<string, string> = {
  open: "AKTUELL",
  last7: "LETZTE 7 TAGE",
  pending: "AUSSTEHEND",
};

function SectionPanel({
  section,
  logo,
  selectedCardId,
  onSelect,
}: {
  section: SignalPageSection;
  logo: string;
  selectedCardId: string | null;
  onSelect: (card: SignalCardModel) => void;
}) {
  const [filter, setFilter] = useState<SignalCardFilter>("open");

  const allCards = useMemo(() => section.groups.flatMap((g) => g.cards), [section.groups]);
  const visible = useMemo(() => allCards.filter((c) => matchesFilter(c, filter)), [allCards, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, overflow: "hidden" }}>
      {/* Section header */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 0 6px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        marginBottom: 8,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={section.title} width={18} height={18} style={{ objectFit: "contain", flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: "rgba(255,255,255,0.75)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {section.title}
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>Live Signals</span>
        {/* Filter tabs */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          {(["open", "last7", "pending"] as SignalCardFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 8px",
                background: filter === f ? "rgba(255,255,255,0.08)" : "transparent",
                border: filter === f ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                borderRadius: 4,
                color: filter === f ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid — scrollable, invisible scrollbar + bottom fade */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
          {visible.length === 0 ? (
            <div style={{ padding: "16px 4px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
              Keine Signale
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, paddingBottom: 24 }}>
              {visible.map((card) => (
                <SignalCard
                  key={card.id}
                  card={card}
                  active={selectedCardId === card.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
        {/* Bottom fade hint */}
        <div style={{
          pointerEvents: "none", position: "absolute", bottom: 0, left: 0, right: 0, height: 32,
          background: "linear-gradient(to bottom, transparent, #09090b)",
        }} />
      </div>
    </div>
  );
}

// ── KPI metric ─────────────────────────────────────────────────────────────────

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  const valueColor = tone === "negative" ? "#d8bc67" : "#ffffff";
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: "flex", flexDirection: "column", justifyContent: "center", gap: 6,
      background: "#111214",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: "10px 12px",
      overflow: "hidden",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.10em", lineHeight: 1, whiteSpace: "nowrap",
        color: "rgba(255,255,255,0.32)",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 17, fontWeight: 700, lineHeight: 1,
        color: valueColor,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export type SignalPageData = SignalPageModel;

export default function SignalPage({ data }: { data: SignalPageData }) {
  const mounted = useClientMounted();
  const router = useRouter();

  const whiteSwan = data.sections.find((s) => s.id === "white_swan");
  const coreInvest = data.sections.find((s) => s.id === "core_invest");

  const firstCard = data.cards[0] ?? null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(firstCard?.id ?? null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [fullData, setFullData] = useState(false);

  const selectedCard = useMemo(
    () => data.cards.find((c) => c.id === selectedCardId) ?? firstCard,
    [data.cards, selectedCardId, firstCard],
  );
  const selectedPreview = selectedCard ? (data.previews[selectedCard.id] ?? null) : null;
  const selectedIconUrl = selectedCard
    ? getMonitoringAssetIconUrl({
        code: selectedCard.assetSymbol,
        assetId: selectedCard.iconKey,
        name: selectedCard.assetName,
        displaySymbol: selectedCard.displaySymbol,
      })
    : null;

  // Auto-refresh: router.refresh() every 5s, pause when tab not visible
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);
  useInterval(refresh, 5000);

  // Select card with chart data on mount
  useEffect(() => {
    if (!mounted) return;
    const first = data.cards.find((c) => {
      const p = data.previews[c.id];
      return Boolean(p?.chart ?? p?.performance);
    });
    if (first) setSelectedCardId(first.id);
  }, [mounted, data.cards, data.previews]);

  const perf = selectedPreview?.performance ?? null;
  const drawdownData = useMemo(() => {
    if (!perf) return [];
    const dd = perf.drawdownCurve ?? [];
    const hasRealDd = dd.some((p) => p.value < 0);
    return hasRealDd ? dd : computeDrawdownFromEquity(perf.equityCurve ?? []);
  }, [perf]);

  const watchlistWidth = showWatchlist ? (fullData ? 460 : 310) : 0;
  const cols = showWatchlist
    ? `50% minmax(0,1fr) ${watchlistWidth}px`
    : "50% minmax(0,1fr)";

  return (
    <div style={{
      position: "relative",
      display: "grid",
      gridTemplateColumns: cols,
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      background: "#09090b",
      gap: "0 12px",
      transition: "grid-template-columns 200ms ease",
    }}>
      {/* ── Pull tab: right edge, vertically centered ─────────────────────── */}
      <button
        onClick={() => setShowWatchlist((v) => !v)}
        title={showWatchlist ? "Live Feed schließen" : "Live Feed öffnen"}
        style={{
          position: "fixed",
          right: watchlistWidth,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: 20,
          padding: "14px 0",
          background: "#161820",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRight: showWatchlist ? "none" : "1px solid rgba(255,255,255,0.10)",
          borderRadius: showWatchlist ? "6px 0 0 6px" : "6px 0 0 6px",
          cursor: "pointer",
          transition: "right 200ms ease",
        }}
      >
        {/* Panel icon */}
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="10" height="10" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
          <line x1="7.5" y1="0.5" x2="7.5" y2="10.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
        </svg>
        {/* Chevron */}
        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={showWatchlist ? "M1 1.5L4.5 5L1 8.5" : "M5 1.5L1.5 5L5 8.5"}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── LEFT: signal list ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        padding: "14px 20px 10px 20px",
        gap: 0,
      }}>
        {whiteSwan && (
          <SectionPanel
            section={whiteSwan}
            logo="/branding/white-swan-icon.png"
            selectedCardId={selectedCardId}
            onSelect={(c) => setSelectedCardId(c.id)}
          />
        )}

        {/* Gradient fade — replaces hard divider */}
        <div style={{ flexShrink: 0, height: 24, position: "relative", pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: 0, left: -20, right: -20, height: "100%",
            background: "linear-gradient(to bottom, rgba(9,9,11,0) 0%, rgba(9,9,11,0.85) 50%, rgba(9,9,11,0) 100%)",
          }} />
        </div>

        {coreInvest && (
          <SectionPanel
            section={coreInvest}
            logo="/branding/capitalife-favicon.png"
            selectedCardId={selectedCardId}
            onSelect={(c) => setSelectedCardId(c.id)}
          />
        )}
      </div>

      {/* ── MIDDLE: detail panel ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

        {/* OHLC chart */}
        <div style={{
          position: "relative",
          flex: "0 0 50%",
          minHeight: 0,
          overflow: "hidden",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "#09090a",
        }}>
          {/* Asset chip — top left */}
          <div style={{
            pointerEvents: "none",
            position: "absolute", left: 10, top: 10, zIndex: 10,
            display: "flex", alignItems: "center", gap: 8,
            borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.6)",
            padding: "6px 10px", backdropFilter: "blur(6px)",
          }}>
            {selectedIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedIconUrl} alt="" width={20} height={20}
                style={{ objectFit: "contain", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)" }} />
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.05)" }} />
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {selectedCard?.displaySymbol ?? "—"}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1, lineHeight: 1 }}>
                {selectedCard?.strategyName ?? ""}
              </div>
            </div>
          </div>

          {mounted && selectedPreview?.chart ? (
            <MonitoringChart data={selectedPreview.chart} maxBars={320} initialVisibleBars={56} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                Keine OHLC-Daten für {selectedCard?.displaySymbol ?? "dieses Asset"}
              </div>
            </div>
          )}
        </div>

        {/* Equity + Drawdown */}
        <div style={{
          flex: "0 0 45%", minHeight: 0, overflow: "hidden",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", flexDirection: "column",
        }}>
          {mounted && perf ? (
            <>
              <div style={{ flex: "0 0 55%", minHeight: 0, overflow: "hidden", padding: "4px 6px 2px" }}>
                <StrategyTesterEquityChart data={perf.equityCurve} fillContainer />
              </div>
              <div style={{ flex: "0 0 45%", minHeight: 0, overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "2px 6px 4px" }}>
                <StrategyTesterDrawdownChart
                  data={drawdownData}
                  maxDrawdownPercent={perf.summary?.maxDrawdownPercent}
                  fillContainer
                />
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>Kein Backtest verfügbar</span>
            </div>
          )}
        </div>

        {/* KPI row */}
        <div style={{
          flex: "0 0 72px", minHeight: 0,
          display: "flex", flexDirection: "row",
          gap: 6, padding: "6px 8px 8px",
          alignItems: "stretch",
        }}>
          {(selectedPreview?.kpis ?? []).slice(0, 5).map((kpi) => (
            <Metric key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Live Watchlist (conditional) ─────────────────────────────── */}
      {showWatchlist && (
        <LiveWatchlistPanel
          cards={data.cards}
          selectedCardId={selectedCardId}
          onSelectCard={(id) => setSelectedCardId(id)}
          fullData={fullData}
          onFullDataChange={setFullData}
        />
      )}
    </div>
  );
}
