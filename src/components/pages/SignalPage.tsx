"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MonitoringChart from "@/components/monitoring/MonitoringChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { useInterval } from "@/hooks/use-interval";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
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

// ── Asset icon ─────────────────────────────────────────────────────────────────

function AssetIcon({ card, size }: { card: SignalCardModel; size: number }) {
  const url = getMonitoringAssetIconUrl({
    code: card.assetSymbol,
    assetId: card.iconKey,
    name: card.assetName,
    displaySymbol: card.displaySymbol,
  });
  if (!url) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 5,
        background: "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: size * 0.45, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>
          {card.displaySymbol.charAt(0)}
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={card.displaySymbol} width={size} height={size}
    style={{ objectFit: "contain", borderRadius: 4, flexShrink: 0, border: "1px solid rgba(255,255,255,0.08)" }} />;
}

// ── Direction badge ────────────────────────────────────────────────────────────

function DirBadge({ dir }: { dir: string }) {
  if (dir !== "LONG" && dir !== "SHORT") return null;
  const color = dir === "LONG" ? "#22c55e" : "#ef4444";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      color, background: `${color}18`,
      padding: "2px 6px", borderRadius: 3,
    }}>
      <span style={{ fontSize: 7 }}>{dir === "LONG" ? "▲" : "▼"}</span>
      {dir}
    </span>
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({
  card,
  active,
  onSelect,
}: {
  card: SignalCardModel;
  active: boolean;
  onSelect: (c: SignalCardModel) => void;
}) {
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  const isOpen = (card.direction === "LONG" || card.direction === "SHORT") && card.signalDate != null;
  const pct = card.changePct ?? 0;
  const pctColor = pct >= 0 ? "#22c55e" : "#ef4444";

  let topRight: React.ReactNode = null;
  if (isOpen && card.changePct != null) {
    topRight = (
      <span style={{ fontSize: 10, fontWeight: 700, color: pctColor }}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
      </span>
    );
  } else if (days === 0) {
    topRight = <span style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", letterSpacing: "0.04em" }}>HEUTE ✓</span>;
  } else if (days === 1) {
    topRight = <span style={{ fontSize: 9, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.04em" }}>MORGEN ✓</span>;
  }

  let dateNode: React.ReactNode = null;
  if (isOpen && card.signalDate) {
    dateNode = <span style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>{card.signalDate} ✓</span>;
  } else if (card.nextSignalLabel) {
    const valid = days != null && days >= 0 && days <= 1;
    dateNode = (
      <span style={{ fontSize: 8, flexShrink: 0, color: valid ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)" }}>
        {card.nextSignalLabel} {valid ? "✓" : "·"}
      </span>
    );
  }

  return (
    <div
      onClick={() => onSelect(card)}
      style={{
        background: active ? "#16181d" : "#0f1014",
        border: `1px solid ${active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 10,
        padding: "10px 10px 9px",
        display: "flex", flexDirection: "column", gap: 7,
        cursor: "pointer",
        position: "relative",
        transition: "border-color 150ms, background 150ms",
        boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.06)" : "none",
      }}
    >
      {/* Row 1: icon + symbol + top-right */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <AssetIcon card={card} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {card.displaySymbol}
            </span>
            {topRight}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.assetName}
          </div>
        </div>
      </div>

      {/* Row 2: strategy + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {card.strategyName}
        </span>
        {dateNode}
      </div>

      {/* Row 3: direction + entry */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <DirBadge dir={card.direction} />
        {card.price != null && (
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
            @ {card.price >= 100 ? card.price.toFixed(2) : card.price.toFixed(4)}
          </span>
        )}
        {card.tp != null && <span style={{ fontSize: 8, color: "#22c55e90" }}>TP {card.tp.toFixed(2)}</span>}
        {card.sl != null && <span style={{ fontSize: 8, color: "#ef444490" }}>SL {card.sl.toFixed(2)}</span>}
      </div>
    </div>
  );
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

      {/* Card grid — scrollable */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {visible.length === 0 ? (
          <div style={{ padding: "16px 4px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
            Keine Signale
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
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
    </div>
  );
}

// ── KPI metric ─────────────────────────────────────────────────────────────────

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  const color = tone === "negative" ? "#ef4444" : "#fff";
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 8, padding: "6px 8px",
    }}>
      <div style={{ fontSize: 7.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.32)", lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, color }}>{value}</div>
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

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      background: "#09090b",
      gap: 0,
    }}>

      {/* ── LEFT: signal list ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 16px 10px 18px",
        gap: 12,
      }}>
        {whiteSwan && (
          <SectionPanel
            section={whiteSwan}
            logo="/branding/white-swan-icon.png"
            selectedCardId={selectedCardId}
            onSelect={(c) => setSelectedCardId(c.id)}
          />
        )}

        <div style={{ height: 1, flexShrink: 0, background: "rgba(255,255,255,0.07)" }} />

        {coreInvest && (
          <SectionPanel
            section={coreInvest}
            logo="/branding/capitalife-favicon.png"
            selectedCardId={selectedCardId}
            onSelect={(c) => setSelectedCardId(c.id)}
          />
        )}
      </div>

      {/* ── RIGHT: detail panel ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>

        {/* Header overlay chip */}
        <div style={{
          position: "relative",
          flex: "0 0 50%",
          minHeight: 0,
          overflow: "hidden",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "#09090a",
        }}>
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
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                  Keine OHLC-Daten für {selectedCard?.displaySymbol ?? "dieses Asset"}
                </div>
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
                <StrategyTesterEquityChart
                  data={perf.equityCurve}
                  fillContainer
                />
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
          flex: 1, minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 6,
          padding: "6px 8px",
          alignContent: "center",
        }}>
          {(selectedPreview?.kpis ?? []).slice(0, 5).map((kpi) => (
            <Metric key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
          ))}
        </div>
      </div>
    </div>
  );
}
