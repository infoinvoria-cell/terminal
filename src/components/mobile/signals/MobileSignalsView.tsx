"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWave1Groups, type Wave1GroupId } from "@/lib/monitoring/wave1Data";

// Live signals for mobile. Reuses the exact same static data the desktop/mobile
// live views read — the wave1 group loader + the manual-verified snapshot — and
// renders them as a horizontally swipeable card carousel plus a compact list.

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const GROUPS: Wave1GroupId[] = ["agrar", "intraday", "indices"];
const MANUAL_URL = "/generated/monitoring/live_state/manual_verified_live_signals.json";

type Side = "long" | "short" | null;

type ManualSignal = {
  symbol?: string;
  direction?: Side;
  status?: string;
  currentPrice?: number | null;
  entryPrice?: number | null;
  name?: string;
};

export type SignalCard = {
  key: string;
  symbol: string;
  label: string;
  side: Side;
  status: string;
  price: number | null;
  spark: number[];
  open: boolean;
  source: "manual" | "wave1";
};

function normSide(v: string | null | undefined): Side {
  const s = String(v || "").toLowerCase();
  if (s.includes("short")) return "short";
  if (s.includes("long")) return "long";
  return null;
}

async function loadSignals(): Promise<SignalCard[]> {
  const [groups, manualRes] = await Promise.all([
    loadWave1Groups(GROUPS),
    fetch(MANUAL_URL, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const seen = new Set<string>();
  const out: SignalCard[] = [];

  // 1) Manual verified signals first (highest priority)
  const manualSignals: ManualSignal[] = Array.isArray(manualRes?.signals) ? manualRes.signals : [];
  for (const m of manualSignals) {
    const symbol = String(m.symbol || "").toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const status = String(m.status || "").toUpperCase();
    out.push({
      key: `m-${symbol}`,
      symbol,
      label: m.name || symbol,
      side: normSide(m.direction),
      status: status || "OPEN",
      price: m.currentPrice ?? m.entryPrice ?? null,
      spark: [],
      open: status.includes("OPEN") || status.includes("EXIT"),
      source: "manual",
    });
  }

  // 2) Wave1 records: open positions first, then watch states
  const openCards: SignalCard[] = [];
  const watchCards: SignalCard[] = [];
  for (const groupId of GROUPS) {
    const g = groups[groupId];
    if (!g) continue;
    for (const rec of g.records) {
      const sig = rec.signal;
      if (!sig) continue;
      const symbol = rec.symbol.toUpperCase();
      if (seen.has(symbol)) continue;
      const sStatus = String(sig.signal_status || "").toLowerCase();
      const isWatch = sStatus.includes("watch") || sStatus.includes("le") || sStatus.includes("lx");
      if (!sig.open_position && !isWatch) continue;
      seen.add(symbol);
      const spark = (rec.chart?.bars || [])
        .map((b) => b.close)
        .filter((c): c is number => typeof c === "number")
        .slice(-28);
      const card: SignalCard = {
        key: `w-${symbol}`,
        symbol,
        label: rec.label || symbol,
        side: normSide(sig.position_side ?? sig.signal_status),
        status: (sig.signal_status || (sig.open_position ? "OPEN" : "WATCH")).toUpperCase(),
        price: sig.last_price,
        spark,
        open: sig.open_position,
        source: "wave1",
      };
      (sig.open_position ? openCards : watchCards).push(card);
    }
  }

  return [...out, ...openCards, ...watchCards];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 28 }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 90;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SideBadge({ side }: { side: Side }) {
  if (!side) return null;
  const isLong = side === "long";
  const color = isLong ? "#5fbf8f" : "#e06c6c";
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color,
        background: `${color}1f`,
        border: `1px solid ${color}44`,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {isLong ? "LONG" : "SHORT"}
    </span>
  );
}

function BigCard({ c }: { c: SignalCard }) {
  const sideColor = c.side === "long" ? "#5fbf8f" : c.side === "short" ? "#e06c6c" : GOLD;
  return (
    <div
      style={{
        flex: "0 0 78%",
        scrollSnapAlign: "start",
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 16,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#fafafa",
              fontFamily: "var(--font-montserrat), sans-serif",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.symbol}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.42)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 170,
            }}
          >
            {c.label}
          </div>
        </div>
        <SideBadge side={c.side} />
      </div>

      <Sparkline data={c.spark} color={sideColor} />

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.38)", fontWeight: 600, letterSpacing: "0.04em" }}>
            PREIS
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>
            {c.price != null ? c.price.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: c.open ? GOLD : "rgba(255,255,255,0.5)",
            background: c.open ? `${GOLD}1a` : "rgba(255,255,255,0.05)",
            border: `1px solid ${c.open ? `${GOLD}44` : CARD_BORDER}`,
            borderRadius: 999,
            padding: "3px 9px",
          }}
        >
          {c.status}
        </span>
      </div>
    </div>
  );
}

function ListRow({ c }: { c: SignalCard }) {
  const sideColor = c.side === "long" ? "#5fbf8f" : c.side === "short" ? "#e06c6c" : "rgba(255,255,255,0.4)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px",
        borderBottom: `1px solid ${CARD_BORDER}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: sideColor, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{c.symbol}</div>
        <div
          style={{
            fontSize: 10.5,
            color: "rgba(255,255,255,0.4)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.label}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>
          {c.price != null ? c.price.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "—"}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: c.open ? GOLD : "rgba(255,255,255,0.42)" }}>
          {c.status}
        </div>
      </div>
    </div>
  );
}

export function MobileSignalsView() {
  const [cards, setCards] = useState<SignalCard[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSignals()
      .then((c) => alive && setCards(c))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const openCards = useMemo(() => (cards || []).filter((c) => c.open), [cards]);

  if (error) {
    return <div style={{ marginTop: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Signale konnten nicht geladen werden.</div>;
  }
  if (!cards) {
    return <div style={{ marginTop: 40, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Lade Signale…</div>;
  }
  if (cards.length === 0) {
    return <div style={{ marginTop: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Aktuell keine aktiven Signale.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Swipeable carousel of open/active signals */}
      {openCards.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            Offene Positionen · {openCards.length}
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              margin: "0 -16px",
              padding: "0 16px 4px",
              scrollbarWidth: "none",
            }}
          >
            {openCards.map((c) => (
              <BigCard key={c.key} c={c} />
            ))}
          </div>
        </div>
      )}

      {/* Full list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
          Alle Signale · {cards.length}
        </div>
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, overflow: "hidden" }}>
          {cards.map((c) => (
            <ListRow key={c.key} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
