"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const m1 = label.match(/(\d{1,2})\.(\d{1,2})\./);
  if (m1) {
    const day = parseInt(m1[1]!, 10);
    const month = parseInt(m1[2]!, 10) - 1;
    const now = new Date();
    const t = new Date(now.getFullYear(), month, day, 18, 0, 0);
    if (t.getTime() < now.getTime() - 86_400_000) t.setFullYear(now.getFullYear() + 1);
    return t;
  }
  const m2 = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    return new Date(parseInt(m2[1]!, 10), parseInt(m2[2]!, 10) - 1, parseInt(m2[3]!, 10), 18, 0, 0);
  }
  return null;
}

function pendingChipLabel(label: string | undefined): string {
  if (!label) return "AUSSTEHEND";
  const l = label.toLowerCase();
  if (l.includes("täglich")) return "TÄGLICH";
  if (l.includes("tbd") || l.includes("datum")) return "AUSSTEHEND";
  const dm = label.match(/(\d{1,2}\.\d{1,2}\.)/);
  if (dm) return dm[1]!;
  return label.slice(0, 10);
}

function formatSignalDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const today = new Date();
  const dateStr = `${parseInt(m[3]!, 10)}.${parseInt(m[2]!, 10)}.`;
  return today.toISOString().startsWith(iso) ? `Heute ${dateStr}` : dateStr;
}

function formatTpSl(v: number | undefined): string | null {
  if (v == null) return null;
  const abs = Math.abs(v);
  if (abs >= 50) return null;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function useCountdown(target: Date | null): string {
  const [display, setDisplay] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!target) { setDisplay(""); return; }
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff > 24 * 3_600_000) { setDisplay(""); return; }
      if (diff <= 0) { setDisplay("0:00 min"); return; }
      const h = Math.floor(diff / 3_600_000);
      const min = Math.floor((diff % 3_600_000) / 60_000);
      const sec = Math.floor((diff % 60_000) / 1_000);
      setDisplay(h > 0 ? `${h}h ${min}min` : `${min}:${String(sec).padStart(2, "0")} min`);
    };
    tick();
    timerRef.current = setInterval(tick, 1_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [target]);
  return display;
}

// ── Asset icon ────────────────────────────────────────────────────────────────

function AssetIcon({ card }: { card: SignalCardModel }) {
  const url = getMonitoringAssetIconUrl({
    code: card.assetSymbol,
    assetId: card.iconKey,
    name: card.assetName,
    displaySymbol: card.displaySymbol,
  });
  const size = 40;
  if (!url) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 10,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontWeight: 800 }}>
          {card.displaySymbol.charAt(0)}
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={card.displaySymbol}
      width={size}
      height={size}
      style={{
        objectFit: "contain",
        borderRadius: 10,
        flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      }}
    />
  );
}

// ── Signal card ───────────────────────────────────────────────────────────────

export default function SignalCard({
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
  const isPending = state === "pending_valid" || state === "pending_invalid";
  const countdown = useCountdown(isPending ? target : null);

  const pct = card.changePct ?? 0;
  const isLong = card.direction === "LONG";
  const isShort = card.direction === "SHORT";

  const tpStr = formatTpSl(card.tp);
  const slStr = formatTpSl(card.sl);
  const dateDisplay = card.signalDate ? formatSignalDate(card.signalDate) : "";

  // Direction accent color
  const dirColor = isLong ? "#22c55e" : isShort ? "#ef4444" : "rgba(255,255,255,0.22)";

  // ── State chip ────────────────────────────────────────────────────────────
  let stateChip: React.ReactNode;
  if (state === "open") {
    const c = pct >= 0 ? "#22c55e" : "#ef4444";
    stateChip = (
      <span style={{
        fontSize: 13, fontWeight: 800, color: c,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1,
      }}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
      </span>
    );
  } else if (state === "closed") {
    const isProfit = pct >= 0;
    stateChip = (
      <span style={{
        fontSize: 12, fontWeight: 700, lineHeight: 1,
        color: isProfit ? "#22c55e" : "#ef4444",
      }}>
        {isProfit ? `TP +${Math.abs(pct).toFixed(1)}%` : `SL ${pct.toFixed(2)}%`}
      </span>
    );
  } else {
    const isValid = state === "pending_valid";
    const timerColor = isValid ? "#d8bc67" : "rgba(255,255,255,0.38)";
    stateChip = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: timerColor,
          fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>
          {countdown || pendingChipLabel(card.nextSignalLabel)}
        </span>
        {isValid && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 15, height: 15, borderRadius: "50%",
            border: `1.5px solid ${timerColor}`,
            color: timerColor, fontSize: 8, fontWeight: 900,
            lineHeight: 1,
          }}>✓</span>
        )}
      </span>
    );
  }

  // ── Card background ───────────────────────────────────────────────────────
  const cardBg = active
    ? "radial-gradient(ellipse 100% 80% at 110% 115%, rgba(216,188,103,0.12) 0%, transparent 60%), #111318"
    : "#111318";
  const cardBorder = active
    ? "1px solid rgba(216,188,103,0.32)"
    : "1px solid rgba(255,255,255,0.08)";

  return (
    <div
      onClick={() => onSelect(card)}
      style={{
        background: cardBg,
        border: cardBorder,
        borderRadius: 12,
        padding: "14px 14px 13px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 120ms",
        // Left accent bar keyed to direction
        boxShadow: isLong || isShort
          ? `inset 3px 0 0 ${dirColor}`
          : undefined,
      }}
    >
      {/* ── Row 1: [Icon]  [Symbol / AssetName]  [State chip] ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10,
      }}>
        <AssetIcon card={card} />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>
          <span style={{
            fontSize: 16, fontWeight: 900, color: "#ffffff",
            letterSpacing: "0.01em", lineHeight: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {card.displaySymbol}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.30)",
            lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {card.assetName}
          </span>
        </div>

        {/* State chip — pinned top-right */}
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          {stateChip}
        </div>
      </div>

      {/* ── Row 2: Strategy · Date ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 6, marginBottom: 10,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 400,
          color: "rgba(255,255,255,0.26)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {card.strategyName}
        </span>
        {dateDisplay && (
          <span style={{
            fontSize: 10, fontWeight: 400,
            color: "rgba(255,255,255,0.22)",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {dateDisplay}
          </span>
        )}
      </div>

      {/* ── Row 3: TP green · SL red ── */}
      {(tpStr || slStr) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
        }}>
          {tpStr && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#22c55e", lineHeight: 1,
            }}>
              TP: {tpStr}
            </span>
          )}
          {slStr && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#ef4444", lineHeight: 1,
            }}>
              SL: {slStr}
            </span>
          )}
        </div>
      )}

      {/* ── Row 4: Direction · Chart icon ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: "auto",
      }}>
        {(isLong || isShort) ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 13, fontWeight: 900, letterSpacing: "0.08em",
            color: dirColor, lineHeight: 1,
          }}>
            <span style={{ fontSize: 10 }}>{isLong ? "▲" : "▼"}</span>
            {card.direction}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", lineHeight: 1 }}>
            {card.direction ?? ""}
          </span>
        )}

        {/* Chart-icon button feel */}
        <span style={{
          fontSize: 15, lineHeight: 1,
          color: "rgba(255,255,255,0.16)",
        }}>↗</span>
      </div>
    </div>
  );
}
