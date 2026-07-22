"use client";

import React, { useState } from "react";
import { useClientMounted } from "@/hooks/use-client-mounted";
import type { SignalPageModel, SignalCardModel, SignalCardFilter, SignalPageSection } from "@/lib/signals/signal-types";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import MonitoringChart from "@/components/monitoring/MonitoringChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";

// ── Filter helpers ────────────────────────────────────────────────────────────

function nextLabelDaysAhead(label?: string): number | null {
  if (!label) return null;
  const german = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (german) {
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(today.getFullYear(), parseInt(german[2], 10) - 1, parseInt(german[1], 10));
    if (d < today) d.setFullYear(today.getFullYear() + 1);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(`${label}T00:00:00`);
    const t = new Date(); t.setHours(0,0,0,0);
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }
  return null;
}

function matchesFilter(card: SignalCardModel, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    const hasDir  = (card.direction === "LONG" || card.direction === "SHORT") && card.signalDate != null;
    const hasTpSl = card.tp != null && card.sl != null;
    const days    = nextLabelDaysAhead(card.nextSignalLabel);
    return hasDir || hasTpSl || (days != null && days >= 0 && days <= 1);
  }
  if (filter === "last7") {
    if (card.ageDays != null && card.ageDays <= 7) return true;
    if (card.signalDate) {
      const d = new Date(`${card.signalDate}T00:00:00`);
      const today = new Date(); today.setHours(0,0,0,0);
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

function dirColor(dir: string) {
  if (dir === "LONG")  return "#22c55e";
  if (dir === "SHORT") return "#ef4444";
  return "rgba(255,255,255,0.3)";
}

// ── Asset icon ────────────────────────────────────────────────────────────────

function AssetIcon({ card, size }: { card: SignalCardModel; size: number }) {
  const url = getMonitoringAssetIconUrl({
    code:          card.assetSymbol,
    assetId:       card.iconKey,
    name:          card.assetName,
    displaySymbol: card.displaySymbol,
  });
  if (!url) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 4,
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={card.displaySymbol} width={size} height={size}
      style={{ objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />
  );
}

// ── Direction badge ───────────────────────────────────────────────────────────

function DirBadge({ dir }: { dir: string }) {
  const color = dirColor(dir);
  if (dir !== "LONG" && dir !== "SHORT") return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      color,
      background: `${color}18`,
      padding: "2px 6px", borderRadius: 3,
    }}>
      <span style={{ fontSize: 7 }}>{dir === "LONG" ? "▲" : "▼"}</span>
      {dir}
    </span>
  );
}

// ── Single signal card ────────────────────────────────────────────────────────

function SignalCard({ card, onTap }: { card: SignalCardModel; onTap: () => void }) {
  const days    = nextLabelDaysAhead(card.nextSignalLabel);
  const isOpen  = (card.direction === "LONG" || card.direction === "SHORT") && card.signalDate != null;
  const hasPct  = card.changePct != null && isOpen;
  const pct     = card.changePct ?? 0;
  const pctColor = pct >= 0 ? "#22c55e" : "#ef4444";

  let topRight: React.ReactNode = null;
  if (hasPct) {
    topRight = (
      <span style={{ fontSize: 10, fontWeight: 700, color: pctColor, letterSpacing: "0.02em" }}>
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
        {card.nextSignalLabel} {valid ? "✓" : "✗"}
      </span>
    );
  }

  return (
    <div
      onClick={onTap}
      style={{
        background: "#0f1014",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "10px 10px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minWidth: 0,
        overflow: "hidden",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        position: "relative",
      }}
    >
      {/* Row 1: icon + symbol + top-right */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <AssetIcon card={card} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {card.displaySymbol}
            </span>
            {topRight}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {card.assetName}
          </div>
        </div>
      </div>
      {/* Row 2: strategy + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {card.strategyName}
        </span>
        {dateNode}
      </div>
      {/* Row 3: direction */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <DirBadge dir={card.direction} />
      </div>
    </div>
  );
}

// ── Detail bottom sheet ───────────────────────────────────────────────────────

function DetailSheet({
  card,
  preview,
  onClose,
}: {
  card: SignalCardModel;
  preview: SignalPageModel["previews"][string] | undefined;
  onClose: () => void;
}) {
  const mounted = useClientMounted();
  const iconUrl = getMonitoringAssetIconUrl({
    code: card.assetSymbol, assetId: card.iconKey,
    name: card.assetName, displaySymbol: card.displaySymbol,
  });

  const perf = preview?.performance;
  const kpis = (preview?.kpis ?? []).slice(0, 5);

  // ── Swipe-to-close ────────────────────────────────────────────────────────
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const dragStartY = React.useRef<number | null>(null);
  const dragDelta = React.useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0]!.clientY;
    dragDelta.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = e.touches[0]!.clientY - dragStartY.current;
    if (dy < 0) return; // don't allow dragging up
    dragDelta.current = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  }
  function onTouchEnd() {
    if (dragDelta.current > 100) {
      onClose();
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 200ms ease";
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    dragStartY.current = null;
    dragDelta.current = 0;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(0,0,0,0.55)",
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9001,
          background: "#111214",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px 16px 0 0",
          display: "flex", flexDirection: "column",
          height: "75dvh",
          animation: "slideUp 280ms cubic-bezier(0.32,0.72,0,1) both",
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Swipe handle */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 6, touchAction: "none" }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto" }} />
        </div>

        {/* Card summary — ganz oben im Sheet */}
        <div style={{ flexShrink: 0, padding: "0 12px 10px" }}>
          {/* Zeile 1: icon + symbol + name + X */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt={card.displaySymbol} width={24} height={24}
                style={{ objectFit: "contain", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 5, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "0.02em", lineHeight: 1.1 }}>{card.displaySymbol}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {card.assetName} · {card.strategyName}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 7,
                color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1,
                width: 28, height: 28, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                WebkitTapHighlightColor: "transparent",
              }}
            >✕</button>
          </div>
          {/* Zeile 2: Signal-Werte */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <DirBadge dir={card.direction} />
            {card.changePct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: card.changePct >= 0 ? "#22c55e" : "#ef4444" }}>
                {card.changePct >= 0 ? "+" : ""}{card.changePct.toFixed(2)}%
              </span>
            )}
            {card.signalDate && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Signal: {card.signalDate}</span>
            )}
            {card.tp != null && (
              <span style={{ fontSize: 9, fontWeight: 600, color: "#22c55e" }}>TP: {card.tp}</span>
            )}
            {card.sl != null && (
              <span style={{ fontSize: 9, fontWeight: 600, color: "#ef4444" }}>SL: {card.sl}</span>
            )}
            {card.nextSignalLabel && !card.signalDate && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Nächste: {card.nextSignalLabel}</span>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

        {/* Charts zone — flex 1, NO scroll, explicit heights so fillContainer works */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

          {/* Candle chart — takes most space */}
          <div style={{ flex: "2 1 0", position: "relative", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {/* Symbol overlay */}
            <div style={{
              position: "absolute", left: 10, top: 8, zIndex: 10,
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(0,0,0,0.65)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "4px 8px",
              backdropFilter: "blur(6px)",
            }}>
              {iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt={card.displaySymbol} width={14} height={14}
                  style={{ objectFit: "contain", borderRadius: 3 }} />
              )}
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{card.displaySymbol}</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.38)" }}>{card.strategyName}</span>
            </div>
            {mounted && preview?.chart ? (
              <MonitoringChart data={preview.chart} maxBars={320} initialVisibleBars={56} />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>Keine OHLC-Daten</span>
              </div>
            )}
          </div>

          {/* Equity chart */}
          <div style={{ flex: "1 1 0", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "2px 4px" }}>
            {mounted && perf ? (
              <StrategyTesterEquityChart
                data={perf.equityCurve}
                totalReturnPercent={perf.summary?.totalReturnPercent}
                cagr={perf.summary?.cagr}
                fillContainer
              />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.1)" }}>Kein Backtest</span>
              </div>
            )}
          </div>

          {/* Drawdown chart */}
          <div style={{ flex: "0 0 18%", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "2px 4px" }}>
            {mounted && perf ? (
              <StrategyTesterDrawdownChart
                data={perf.drawdownCurve}
                maxDrawdownPercent={perf.summary?.maxDrawdownPercent}
                fillContainer
              />
            ) : null}
          </div>

          {/* KPI row — pinned at bottom, safe-area aware */}
          <div style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(kpis.length, 1)}, 1fr)`,
            gap: 4,
            padding: "6px 8px",
            paddingBottom: "max(10px, env(safe-area-inset-bottom, 10px))",
            alignItems: "stretch",
            minHeight: 64,
          }}>
            {kpis.length > 0 ? kpis.map(k => {
              const isNeg = k.tone === "negative" || (typeof k.value === "string" && k.value.startsWith("-"));
              return (
                <div key={k.label} style={{
                  background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 7, padding: "5px 4px",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.32)", lineHeight: 1 }}>
                    {k.label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, color: isNeg ? "#d8bc67" : "#fff" }}>
                    {k.value}
                  </div>
                </div>
              );
            }) : (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.1)" }}>Keine KPIs</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function SectionPanel({
  section, logo, previews, onCardTap,
}: {
  section: SignalPageSection;
  logo: string;
  previews: SignalPageModel["previews"];
  onCardTap: (card: SignalCardModel) => void;
}) {
  const [filter, setFilter] = useState<SignalCardFilter>("open");

  const allCards = section.groups.flatMap(g => g.cards);
  const visible  = allCards.filter(c => matchesFilter(c, filter));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px 8px",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={section.title} width={20} height={20}
          style={{ objectFit: "contain", flexShrink: 0 }} />
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: "rgba(255,255,255,0.82)",
          textTransform: "uppercase", letterSpacing: "0.06em",
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}>
          {section.title}
        </span>

        {/* Filters right-aligned */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {([["open","AKTUELL"],["last7","7 TAGE"],["pending","AUSSTEHEND"]] as [SignalCardFilter,string][]).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "4px 8px",
              background: filter === f ? "rgba(255,255,255,0.09)" : "transparent",
              border: filter === f ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
              borderRadius: 5,
              color: filter === f ? "#fff" : "rgba(255,255,255,0.35)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
              cursor: "pointer",
              fontFamily: "var(--font-montserrat,sans-serif)",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable card grid with bottom gradient */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0,
          overflowY: "auto", overflowX: "hidden",
          padding: "0 10px 8px",
        }}>
          {visible.length === 0 ? (
            <div style={{ padding: "20px 4px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Keine Signale
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7 }}>
              {visible.map(card => (
                <SignalCard key={card.id} card={card} onTap={() => onCardTap(card)} />
              ))}
            </div>
          )}
          <div style={{ height: 36 }} />
        </div>

        {/* Bottom fade */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 48,
          background: "linear-gradient(to bottom, transparent, #0c0d10)",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MobileSignaleView({ data }: { data: SignalPageModel }) {
  const whiteSwan  = data.sections.find(s => s.id === "white_swan");
  const coreInvest = data.sections.find(s => s.id === "core_invest");
  const [selectedCard, setSelectedCard] = useState<SignalCardModel | null>(null);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>
      {whiteSwan && (
        <SectionPanel
          section={whiteSwan}
          logo="/branding/white-swan-icon.png"
          previews={data.previews}
          onCardTap={setSelectedCard}
        />
      )}

      <div style={{ height: 1, flexShrink: 0, background: "rgba(255,255,255,0.07)" }} />

      {coreInvest && (
        <SectionPanel
          section={coreInvest}
          logo="/branding/capitalife-favicon.png"
          previews={data.previews}
          onCardTap={setSelectedCard}
        />
      )}

      {selectedCard && (
        <DetailSheet
          card={selectedCard}
          preview={data.previews[selectedCard.id]}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
