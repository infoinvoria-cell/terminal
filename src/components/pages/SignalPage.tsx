"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Card state helpers ────────────────────────────────────────────────────────

type CardState = "open" | "closed" | "pending_valid" | "pending_invalid";

function getCardState(card: SignalCardModel): CardState {
  if (card.status === "OPEN") return "open";
  if (card.status === "CLOSED") return "closed";
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  if (days !== null && days >= 0 && days <= 1) return "pending_valid";
  return "pending_invalid";
}

function parseTargetDate(label: string | undefined): Date | null {
  if (!label) return null;
  // "Fr 25.07." or "25.07." format
  const m1 = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (m1) {
    const day = parseInt(m1[1]!, 10);
    const month = parseInt(m1[2]!, 10) - 1;
    const now = new Date();
    const t = new Date(now.getFullYear(), month, day, 18, 0, 0);
    if (t.getTime() < now.getTime() - 86_400_000) t.setFullYear(now.getFullYear() + 1);
    return t;
  }
  // ISO "YYYY-MM-DD" format
  const m2 = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    return new Date(parseInt(m2[1]!, 10), parseInt(m2[2]!, 10) - 1, parseInt(m2[3]!, 10), 18, 0, 0);
  }
  return null;
}

/** Human-readable fallback label when no live countdown is available */
function pendingChipLabel(label: string | undefined): string {
  if (!label) return "AUSSTEHEND";
  const l = label.toLowerCase();
  if (l.includes("täglich")) return "TÄGLICH";
  if (l.includes("tbd") || l.includes("datum")) return "AUSSTEHEND";
  // Extract "DD.MM." part from labels like "Fr 25.07."
  const dm = label.match(/(\d{1,2}\.\d{1,2}\.)/);
  if (dm) return dm[1]!;
  return label.slice(0, 10); // safe truncate for "Okt 2026" etc.
}

function formatSignalDate(iso: string | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const today = new Date();
  const dateStr = `${parseInt(m[3]!, 10)}.${parseInt(m[2]!, 10)}.`;
  const isToday = today.toISOString().startsWith(iso);
  return isToday ? `Heute ${dateStr}` : dateStr;
}

function formatTpSl(v: number | undefined): string | null {
  if (v == null) return null;
  const abs = Math.abs(v);
  // Small numbers treated as % (e.g. 0.5 → +0.5%)
  const pct = abs < 50 ? v : null;
  if (pct !== null) return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  return null; // absolute prices not shown as TP/SL %
}

// ── Live countdown ────────────────────────────────────────────────────────────

function useCountdown(target: Date | null): string {
  const [display, setDisplay] = useState("");
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Only show a live countdown when target is within 24 h
    if (!target) { setDisplay(""); return; }
    const tick = () => {
      const diff = target.getTime() - Date.now();
      // Only run the live timer when event is within 24 h
      if (diff > 24 * 3_600_000) { setDisplay(""); return; }
      if (diff <= 0) { setDisplay("0:00 min"); return; }
      const h = Math.floor(diff / 3_600_000);
      const min = Math.floor((diff % 3_600_000) / 60_000);
      const sec = Math.floor((diff % 60_000) / 1_000);
      setDisplay(h > 0 ? `${h}h ${min}min` : `${min}:${String(sec).padStart(2, "0")} min`);
    };
    tick();
    rafRef.current = setInterval(tick, 1_000);
    return () => { if (rafRef.current) clearInterval(rafRef.current); };
  }, [target]);
  return display;
}

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({
  card,
  active,
  onSelect,
}: {
  card: SignalCardModel;
  active: boolean;
  onSelect: (c: SignalCardModel) => void;
}) {
  const state = getCardState(card);
  const target = useMemo(() => parseTargetDate(card.nextSignalLabel), [card.nextSignalLabel]);
  const countdown = useCountdown(state === "pending_valid" || state === "pending_invalid" ? target : null);

  const pct = card.changePct ?? 0;
  const isLong = card.direction === "LONG";
  const isShort = card.direction === "SHORT";
  const dirColor = isLong ? "#22c55e" : isShort ? "#ef4444" : "rgba(255,255,255,0.35)";

  // ── Top-right state chip ──
  let topRight: React.ReactNode = null;
  if (state === "open") {
    const color = pct >= 0 ? "#22c55e" : "#ef4444";
    topRight = (
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
      </span>
    );
  } else if (state === "closed") {
    const isProfit = pct >= 0;
    const label = isProfit ? `TP +${Math.abs(pct).toFixed(1)}%` : `SL ${pct.toFixed(2)}%`;
    topRight = (
      <span style={{ fontSize: 12, fontWeight: 700, color: isProfit ? "#22c55e" : "#ef4444" }}>{label}</span>
    );
  } else {
    const isValid = state === "pending_valid";
    const timerColor = isValid ? "#d8bc67" : "rgba(255,255,255,0.38)";
    topRight = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: timerColor, fontVariantNumeric: "tabular-nums" }}>
          {countdown || pendingChipLabel(card.nextSignalLabel)}
        </span>
        {isValid && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 16, height: 16, borderRadius: "50%",
            border: "1.5px solid #d8bc67", color: "#d8bc67", fontSize: 9, fontWeight: 800,
          }}>✓</span>
        )}
      </span>
    );
  }

  // ── Date line ──
  // For pending states: top-right chip already shows the schedule label — don't duplicate in row 2
  let dateDisplay = "";
  if (card.signalDate) {
    dateDisplay = formatSignalDate(card.signalDate);
  }

  // ── TP/SL ──
  const tpStr = formatTpSl(card.tp);
  const slStr = formatTpSl(card.sl);

  // ── Active background ──
  const bg = active
    ? "radial-gradient(ellipse 80% 80% at 110% 120%, rgba(216,188,103,0.13) 0%, transparent 60%), linear-gradient(160deg,#181b22 0%,#13151b 100%)"
    : "#0f1014";
  const border = active ? "1px solid rgba(216,188,103,0.28)" : "1px solid rgba(255,255,255,0.07)";

  return (
    <div
      onClick={() => onSelect(card)}
      style={{
        background: bg,
        border,
        borderRadius: 12,
        padding: "11px 12px 10px",
        display: "flex", flexDirection: "column", gap: 6,
        cursor: "pointer",
        position: "relative",
        transition: "border-color 150ms, background 200ms",
      }}
    >
      {/* Row 1: icon · symbol · assetName · top-right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <AssetIcon card={card} size={28} />
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, overflow: "hidden" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
              {card.displaySymbol}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {card.assetName}
            </span>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>{topRight}</div>
      </div>

      {/* Row 2: strategy · date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {card.strategyName}
        </span>
        {dateDisplay && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {dateDisplay}
          </span>
        )}
      </div>

      {/* Row 3: TP / SL */}
      {(tpStr ?? slStr) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tpStr && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>TP: {tpStr}</span>
          )}
          {slStr && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>SL: {slStr}</span>
          )}
        </div>
      )}

      {/* Row 4: direction · chart icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {(isLong || isShort) ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
            color: dirColor,
          }}>
            <span style={{ fontSize: 8 }}>{isLong ? "▲" : "▼"}</span>
            {card.direction}
          </span>
        ) : (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{card.direction}</span>
        )}
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", lineHeight: 1 }}>↗</span>
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
  // positive → white, negative → gold, neutral → white
  const valueColor = tone === "negative" ? "#d8bc67" : "#fff";
  const isNegativeTone = tone === "negative";
  return (
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "center", gap: "clamp(2px,0.4vh,6px)",
      background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 8, padding: "clamp(4px,0.8vh,10px) clamp(6px,0.8vw,12px)",
      height: "100%", minHeight: 0, overflow: "hidden",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center",
        fontSize: "clamp(7px,0.6vw,9px)", textTransform: "uppercase", letterSpacing: "0.08em",
        lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden",
      }}>
        {isNegativeTone ? (
          <span style={{ background: "#ef444422", border: "1px solid #ef444455", borderRadius: 3, padding: "1px 4px", color: "#ef4444" }}>{label}</span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.32)" }}>{label}</span>
        )}
      </div>
      <div style={{ fontSize: "clamp(11px,1.2vw,18px)", fontWeight: 700, lineHeight: 1, color: valueColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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
          gridTemplateRows: "1fr",
          gap: 6,
          padding: "6px 8px",
          alignItems: "stretch",
        }}>
          {(selectedPreview?.kpis ?? []).slice(0, 5).map((kpi) => (
            <Metric key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
          ))}
        </div>
      </div>
    </div>
  );
}
