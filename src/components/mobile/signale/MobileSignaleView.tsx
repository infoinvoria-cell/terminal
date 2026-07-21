"use client";

import { useState } from "react";
import type { SignalPageModel, SignalCardModel, SignalCardFilter, SignalPageSection } from "@/lib/signals/signal-types";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";

// ── Filter helpers ────────────────────────────────────────────────────────────

function nextLabelDaysAhead(label?: string): number | null {
  if (!label) return null;
  const german = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (german) {
    const today = new Date();
    const d = new Date(today.getFullYear(), parseInt(german[2], 10) - 1, parseInt(german[1], 10));
    if (d < today) d.setFullYear(today.getFullYear() + 1);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(label);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }
  return null;
}

function matchesFilter(card: SignalCardModel, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    const hasDir  = card.direction !== "CASH" && card.direction !== "PENDING";
    const hasTpSl = card.tp != null && card.sl != null;
    const days    = nextLabelDaysAhead(card.nextSignalLabel);
    return hasDir || hasTpSl || (days != null && days <= 1);
  }
  return true;
}

function cardBadge(card: SignalCardModel): { label: string; color: string } | null {
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  if (days === 0) return { label: "HEUTE",  color: "#22c55e" };
  if (days === 1) return { label: "MORGEN", color: "#f59e0b" };
  return null;
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
  const arrow = dir === "LONG" ? "▲" : dir === "SHORT" ? "▼" : "▬";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      color,
      background: `${color}18`,
      padding: "2px 6px", borderRadius: 3,
    }}>
      <span style={{ fontSize: 7 }}>{arrow}</span>
      {dir}
    </span>
  );
}

// ── Single signal card ────────────────────────────────────────────────────────

function SignalCard({ card }: { card: SignalCardModel }) {
  const badge    = cardBadge(card);
  const hasPct   = card.changePct != null;
  const pct      = card.changePct ?? 0;
  const pctColor = pct >= 0 ? "#22c55e" : "#ef4444";
  const pctStr   = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const dateStr  = card.signalDate ?? card.nextSignalLabel ?? "";

  return (
    <div style={{
      background: "#080910",
      borderRadius: 8,
      padding: "10px 10px 9px",
      display: "flex",
      flexDirection: "column",
      gap: 7,
      minWidth: 0,
      overflow: "hidden",
    }}>
      {/* Row 1: icon + symbol + pct */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <AssetIcon card={card} size={28} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{
              fontSize: 12, fontWeight: 800,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "0.03em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {card.displaySymbol}
            </span>
            {hasPct && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: pctColor,
                flexShrink: 0,
                letterSpacing: "0.02em",
              }}>
                {pctStr}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 9, color: "rgba(255,255,255,0.35)",
            marginTop: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {card.assetName}
          </div>
        </div>
      </div>

      {/* Row 2: strategy + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{
          fontSize: 9, color: "rgba(255,255,255,0.38)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {card.strategyName}
        </span>
        {dateStr && (
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", flexShrink: 0 }}>
            {dateStr}
          </span>
        )}
      </div>

      {/* Row 3: direction + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <DirBadge dir={card.direction} />
        {badge && (
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: "0.07em",
            color: badge.color,
            background: `${badge.color}1a`,
            padding: "2px 5px", borderRadius: 3,
          }}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function SectionPanel({ section, logo }: { section: SignalPageSection; logo: string }) {
  const [filter, setFilter] = useState<SignalCardFilter>("open");

  const allCards = section.groups.flatMap(g => g.cards);
  const visible  = allCards.filter(c => matchesFilter(c, filter));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 7,
        padding: "9px 12px 7px",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={section.title} width={16} height={16}
          style={{ objectFit: "contain", flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: "rgba(255,255,255,0.72)",
          textTransform: "uppercase", letterSpacing: "0.07em",
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}>
          {section.title}
        </span>

        {/* Filters right-aligned */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {(["open", "all"] as SignalCardFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "3px 8px",
              background: filter === f ? "rgba(255,255,255,0.09)" : "transparent",
              border: "none", borderRadius: 4,
              color: filter === f ? "#fff" : "rgba(255,255,255,0.3)",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              cursor: "pointer",
              fontFamily: "var(--font-montserrat,sans-serif)",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}>
              {f === "open" ? "AKTUELL" : "ALLE"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable card grid with bottom gradient */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0,
          overflowY: "auto", overflowX: "hidden",
          padding: "0 8px 8px",
        }}>
          {visible.length === 0 ? (
            <div style={{ padding: "20px 4px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Keine Signale
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 6,
            }}>
              {visible.map(card => (
                <SignalCard key={card.id} card={card} />
              ))}
            </div>
          )}
          {/* Bottom spacer so last row isn't hidden behind gradient */}
          <div style={{ height: 36 }} />
        </div>

        {/* Bottom fade gradient — signals more content */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 48,
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

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>
      {whiteSwan && (
        <SectionPanel section={whiteSwan} logo="/branding/white-swan-icon.png" />
      )}

      <div style={{ height: 1, flexShrink: 0, background: "rgba(255,255,255,0.08)" }} />

      {coreInvest && (
        <SectionPanel section={coreInvest} logo="/branding/capitalife-favicon.png" />
      )}
    </div>
  );
}
