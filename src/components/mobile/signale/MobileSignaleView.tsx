"use client";

import { useState } from "react";
import Image from "next/image";
import type { SignalPageModel, SignalCardModel, SignalCardFilter, SignalPageSection } from "@/lib/signals/signal-types";

// ── Filter helpers (same logic as desktop SignalPage) ────────────────────────

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
    const hasDir   = card.direction !== "CASH" && card.direction !== "PENDING";
    const hasTpSl  = card.tp != null && card.sl != null;
    const days     = nextLabelDaysAhead(card.nextSignalLabel);
    return hasDir || hasTpSl || (days != null && days <= 1);
  }
  return true;
}

function cardBadge(card: SignalCardModel): { label: string; color: string } | null {
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  if (days === 0) return { label: "HEUTE",  color: "#22c55e" };
  if (days === 1) return { label: "MORGEN", color: "#f59e0b" };
  if (card.direction !== "CASH" && card.direction !== "PENDING" && card.tp == null)
    return { label: "WARTEN", color: "rgba(255,255,255,0.3)" };
  return null;
}

function dirColor(dir: string) {
  if (dir === "LONG")  return "#22c55e";
  if (dir === "SHORT") return "#ef4444";
  return "rgba(255,255,255,0.28)";
}

function DirIcon({ dir }: { dir: string }) {
  const color = dirColor(dir);
  if (dir === "LONG")
    return <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,1 9,9 1,9" fill={color}/></svg>;
  if (dir === "SHORT")
    return <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,9 9,1 1,1" fill={color}/></svg>;
  return <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="4" width="8" height="2" rx="1" fill={color}/></svg>;
}

// ── Signal card ──────────────────────────────────────────────────────────────

function SignalCard({ card, active, onPress }: { card: SignalCardModel; active: boolean; onPress: () => void }) {
  const badge   = cardBadge(card);
  const hasPos  = card.direction !== "CASH" && card.direction !== "PENDING";

  return (
    <div
      onClick={onPress}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        background: active ? "rgba(255,255,255,0.055)" : "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.045)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
    >
      {/* Direction triangle */}
      <div style={{ flexShrink: 0, width: 12, display: "flex", justifyContent: "center" }}>
        <DirIcon dir={card.direction} />
      </div>

      {/* Asset + strategy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "0.03em" }}>
            {card.displaySymbol}
          </span>
          {badge && (
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.07em",
              color: badge.color,
              background: `${badge.color}1a`,
              padding: "1px 5px", borderRadius: 3,
            }}>
              {badge.label}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {card.strategyName}
        </div>
      </div>

      {/* Direction + TP/SL */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: dirColor(card.direction), letterSpacing: "0.07em" }}>
          {card.direction}
        </div>
        {hasPos && (card.tp != null || card.sl != null) && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 2, lineHeight: 1.4 }}>
            {card.tp  != null && <div><span style={{ color: "rgba(34,197,94,0.5)"  }}>TP </span>{card.tp.toFixed(1)}</div>}
            {card.sl  != null && <div><span style={{ color: "rgba(239,68,68,0.5)"  }}>SL </span>{card.sl.toFixed(1)}</div>}
          </div>
        )}
        {card.nextSignalLabel && !hasPos && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", marginTop: 2 }}>
            {card.nextSignalLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section (White Swan or Core Invest) ──────────────────────────────────────

const FILTER_LABELS: Record<SignalCardFilter, string> = {
  open: "AKTUELL", all: "ALLE",
  long: "LONG", short: "SHORT", cash: "CASH", validation: "VALIDIERUNG",
  last7: "7 TAGE", pending: "AUSSTEHEND",
};

function SectionPanel({
  section,
  logo,
}: {
  section: SignalPageSection;
  logo: string;
}) {
  const [filter, setFilter]     = useState<SignalCardFilter>("open");
  const [activeId, setActiveId] = useState<string | null>(null);

  const allCards = section.groups.flatMap(g => g.cards);
  const visible  = allCards.filter(c => matchesFilter(c, filter));

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header row */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 12px 6px",
      }}>
        <div style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
          <Image src={logo} alt={section.title} fill sizes="16px" style={{ objectFit: "contain" }} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.75)",
          textTransform: "uppercase", letterSpacing: "0.07em",
          fontFamily: "var(--font-montserrat,sans-serif)",
        }}>
          {section.title}
        </span>

        {/* Filter buttons — right-aligned */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {(["open", "all"] as SignalCardFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "3px 8px",
              background: filter === f ? "rgba(255,255,255,0.09)" : "transparent",
              border: "none",
              borderRadius: 4,
              color: filter === f ? "#fff" : "rgba(255,255,255,0.32)",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              cursor: "pointer",
              fontFamily: "var(--font-montserrat,sans-serif)",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {visible.length === 0 ? (
          <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
            Keine Signale
          </div>
        ) : (
          visible.map(card => (
            <SignalCard
              key={card.id}
              card={card}
              active={activeId === card.id}
              onPress={() => setActiveId(id => id === card.id ? null : card.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

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
