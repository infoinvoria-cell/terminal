"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { LiveFeedItem } from "@/lib/monitoring/live-feed-types";
import type { SignalCardModel } from "@/lib/signals/signal-types";

type SignalStatus = "long" | "short" | "closed_win" | "closed_loss" | "none";
type SignalData = { status: SignalStatus; changePct: number | null };
type PriceFlash = "up" | "down";
type Row = LiveFeedItem & { signal: SignalData };

const TAB_ORDER = ["Indizes", "Energie", "Metalle", "Anleihen", "Agrar", "Aktien", "FX", "Vergleich"];

const TAB_LABELS: Record<string, string> = {
  Indizes: "Indizes",
  Energie: "Energie",
  Metalle: "Metalle",
  Anleihen: "Anleihen",
  Agrar: "Agrar",
  Aktien: "Aktien",
  FX: "FX — Forex",
  Vergleich: "Vergleich",
};

// Emoji overrides for assets without a proper icon
const EMOJI_ICON: Record<string, string> = {
  "ZT1!": "2Y", "ZF1!": "5Y", "ZN1!": "10Y", "ZB1!": "30Y",
  "VIX": "~", "IEF": "~", "TLT": "~",
  "LH1!": "🐷", "LE1!": "🐄",
};

const CACHE_KEY = "lf-cache-v1";
const FLASH_MS = 30_000; // price flash stays 30s

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTodayStr(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) === today;
}

function buildSignalMap(cards: SignalCardModel[]): Map<string, SignalData> {
  const map = new Map<string, SignalData>();
  for (const c of cards) {
    const key = c.displaySymbol.toUpperCase();
    if (c.status === "OPEN") {
      if (c.direction === "LONG") map.set(key, { status: "long", changePct: c.changePct ?? null });
      else if (c.direction === "SHORT") map.set(key, { status: "short", changePct: c.changePct ?? null });
    } else if (c.status === "CLOSED" && isTodayStr(c.signalDate)) {
      if (!map.has(key)) {
        const win = (c.changePct ?? 0) >= 0;
        map.set(key, { status: win ? "closed_win" : "closed_loss", changePct: c.changePct ?? null });
      }
    }
  }
  return map;
}

function fmtPrice(v: number | null, sym: string): string {
  if (v == null || v <= 0) return "—";
  const s = sym.toUpperCase();
  const isSmallFx =
    !s.startsWith("6") &&
    (s.includes("USD") || s.includes("EUR") || s.includes("GBP") ||
      s.includes("JPY") || s.includes("NOK") || s.includes("SEK") ||
      s.includes("MXN") || s.includes("ZAR") || s.includes("BRL") || s.includes("CLP"));
  if (isSmallFx && v < 100) return v.toFixed(4);
  if (v < 1) return v.toFixed(4);
  if (v < 10) return v.toFixed(3);
  if (v < 100) return v.toFixed(2);
  return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtPct(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "—", color: "rgba(255,255,255,0.18)" };
  const v = Math.abs(pct) < 1 ? pct * 100 : pct;
  const sign = v >= 0 ? "+" : "";
  const color = v > 0.01 ? "#22c55e" : v < -0.01 ? "#ef4444" : "rgba(255,255,255,0.25)";
  return { text: `${sign}${v.toFixed(2)}%`, color };
}

function elapsedSec(iso: string | null): number | null {
  if (!iso) return null;
  const d = Date.now() - Date.parse(iso);
  return isFinite(d) && d >= 0 ? Math.floor(d / 1000) : null;
}

function fmtElapsed(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function fmtVon(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function fmtBisNow(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssetIcon({ symbol }: { symbol: string }) {
  const emoji = EMOJI_ICON[symbol];
  if (emoji) {
    return (
      <span style={{
        display: "inline-flex", width: 15, height: 15, borderRadius: 3, flexShrink: 0,
        background: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
        fontSize: emoji.length > 2 ? 5 : 9, fontWeight: 700, color: "rgba(255,255,255,0.55)",
      }}>
        {emoji}
      </span>
    );
  }
  const url = getMonitoringAssetIconUrl({ code: symbol, name: symbol, displaySymbol: symbol });
  if (!url) {
    return (
      <span style={{
        display: "inline-flex", width: 15, height: 15, borderRadius: 3, flexShrink: 0,
        background: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
        fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.38)",
      }}>
        {symbol.replace(/[^A-Z0-9]/gi, "").charAt(0).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={symbol} width={15} height={15} style={{ borderRadius: 3, flexShrink: 0, objectFit: "contain", display: "block" }} />;
}

// Combined Signal + % column — only open/closed-today, else gray —
function SignalCell({ signal }: { signal: SignalData }) {
  if (signal.status === "long" || signal.status === "short") {
    const pct = signal.changePct;
    const isLong = signal.status === "long";
    const color = isLong ? "#22c55e" : "#ef4444";
    const text = pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : isLong ? "L" : "S";
    return <span style={{ fontSize: 9, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text}</span>;
  }
  if (signal.status === "closed_win") {
    const pct = signal.changePct;
    const text = pct != null ? `+${Math.abs(pct).toFixed(1)}%` : "TP";
    return <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text}</span>;
  }
  if (signal.status === "closed_loss") {
    const pct = signal.changePct;
    const text = pct != null ? `-${Math.abs(pct).toFixed(1)}%` : "SL";
    return <span style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text}</span>;
  }
  return <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }}>—</span>;
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      flexShrink: 0, height: 17,
      display: "flex", alignItems: "center", gap: 5,
      padding: "0 10px",
      borderTop: "1px solid rgba(255,255,255,0.055)",
    }}>
      <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
        {label}
      </span>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.14)" }}>{count}</span>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const REFRESH_MS = 5_000; // 5s for intraday/live freshness

export default function LiveWatchlistPanel({
  cards,
  selectedCardId,
  onSelectCard,
  fullData,
  onFullDataChange,
}: {
  cards: SignalCardModel[];
  selectedCardId: string | null;
  onSelectCard: (id: string) => void;
  fullData: boolean;
  onFullDataChange: (v: boolean) => void;
}) {
  const [items, setItems] = useState<LiveFeedItem[]>(() => {
    // Load from localStorage cache immediately for instant display
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
      if (raw) {
        const { items: cached } = JSON.parse(raw) as { items: LiveFeedItem[]; fetchedAt: string };
        return cached ?? [];
      }
    } catch { /* ignore */ }
    return [];
  });
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
      if (raw) return (JSON.parse(raw) as { fetchedAt: string }).fetchedAt ?? null;
    } catch { /* ignore */ }
    return null;
  });
  const [tick, setTick] = useState(0);
  const [priceFlash, setPriceFlash] = useState<Map<string, PriceFlash>>(new Map());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/monitoring/live-feed", { signal: ctrl.signal });
      if (!r.ok) return;
      const d = await r.json() as { items?: LiveFeedItem[] };
      const newItems = d.items ?? [];
      const now = new Date().toISOString();
      setItems(newItems);
      setLastFetchAt(now);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: newItems, fetchedAt: now })); }
      catch { /* storage full */ }
    } catch { /* aborted */ }
  }, []);

  // Price flash: per-asset timer, each resets independently after FLASH_MS
  useEffect(() => {
    if (items.length === 0) return;
    for (const item of items) {
      if (item.lastClose == null || item.lastClose <= 0) continue;
      const prev = prevPricesRef.current.get(item.symbol);
      if (prev != null && prev !== item.lastClose) {
        const dir: PriceFlash = item.lastClose > prev ? "up" : "down";
        setPriceFlash((m) => new Map(m).set(item.symbol, dir));
        // Clear existing timer for this symbol
        const existing = flashTimers.current.get(item.symbol);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          setPriceFlash((m) => { const n = new Map(m); n.delete(item.symbol); return n; });
          flashTimers.current.delete(item.symbol);
        }, FLASH_MS);
        flashTimers.current.set(item.symbol, t);
      }
      prevPricesRef.current.set(item.symbol, item.lastClose);
    }
  }, [items]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const sinceUpdate = elapsedSec(lastFetchAt);
  const signalMap = buildSignalMap(cards);
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedSym = selectedCard?.displaySymbol.toUpperCase() ?? null;

  const allRows: Row[] = items
    .filter((item) => item.symbol)
    .map((item) => ({
      ...item,
      signal: signalMap.get(item.symbol.toUpperCase()) ?? { status: "none", changePct: null },
    }));

  const grouped: Array<{ tab: string; rows: Row[] }> = [];
  for (const tab of TAB_ORDER) {
    const rows = allRows
      .filter((r) => r.tab === tab)
      .sort((a, b) => {
        const o = (s: SignalStatus) => (s === "long" || s === "short" ? 0 : s.startsWith("pending") ? 1 : 2);
        return o(a.signal.status) - o(b.signal.status) || a.symbol.localeCompare(b.symbol);
      });
    if (rows.length > 0) grouped.push({ tab, rows });
  }
  const knownTabs = new Set(TAB_ORDER);
  const extra = allRows.filter((r) => !knownTabs.has(r.tab));
  if (extra.length > 0) grouped.push({ tab: "Weitere", rows: extra });

  const totalRows = grouped.reduce((s, g) => s + g.rows.length, 0);

  // icon | symbol | price | signal — all fixed so symbol+price sit adjacent
  const COL = fullData
    ? "15px 52px 72px 44px 28px 58px"
    : "15px 52px 72px 44px";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#0c0d10",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: "7px 10px 5px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Live Feed
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{totalRows}</span>
        {sinceUpdate != null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", fontVariantNumeric: "tabular-nums", opacity: 0.65 }}>
            · {fmtElapsed(sinceUpdate)}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => onFullDataChange(!fullData)} style={{
            background: fullData ? "rgba(255,255,255,0.10)" : "transparent",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4,
            padding: "3px 8px", fontSize: 9, fontWeight: 700,
            color: fullData ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)",
            cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
          }}>Full Data</button>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        flexShrink: 0, display: "grid", gridTemplateColumns: COL,
        gap: 3, padding: "3px 10px 2px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {(fullData
          ? ["", "Symbol", "Preis", "Signal", "Von", "Bis"]
          : ["", "Symbol", "Preis", "Signal"]
        ).map((h, i) => (
          <span key={i} style={{
            fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.48)",
            textAlign: i === 0 || i === 1 || i === 2 ? "left" : "right",
          }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {items.length === 0 && (
          <div style={{ padding: 14, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
            Lade…
          </div>
        )}

        {grouped.map(({ tab, rows }) => (
          <div key={tab}>
            <SectionHeader label={TAB_LABELS[tab] ?? tab} count={rows.length} />
            {rows.map((row) => {
              const price = row.lastClose;
              const isSelected = row.symbol.toUpperCase() === selectedSym;
              const flash = priceFlash.get(row.symbol);
              // Daily direction color based on changePct (always visible, not just on update)
              const mktPct = row.changePct;
              const dailyColor = mktPct != null && mktPct > 0.01
                ? "rgba(255,255,255,0.92)"   // positive day → bright white
                : mktPct != null && mktPct < -0.01
                  ? "#d8bc67"                // negative day → gold
                  : price != null && price > 0
                    ? "rgba(255,255,255,0.78)"
                    : "rgba(255,255,255,0.18)";
              const priceColor = flash === "up"
                ? "#ffffff"
                : flash === "down"
                  ? "#d8bc67"
                  : dailyColor;
              const matchCard = cards.find((c) =>
                c.displaySymbol.toUpperCase() === row.symbol.toUpperCase() ||
                c.assetSymbol.toUpperCase() === row.symbol.toUpperCase()
              );

              return (
                <div
                  key={row.symbol}
                  onClick={() => matchCard && onSelectCard(matchCard.id)}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    alignItems: "center", gap: 3,
                    padding: "2px 10px",
                    minHeight: 21,
                    background: isSelected ? "rgba(216,188,103,0.07)" : "transparent",
                    cursor: matchCard ? "pointer" : "default",
                    borderBottom: "1px solid rgba(255,255,255,0.022)",
                    transition: "background 200ms ease",
                  }}
                >
                  <AssetIcon symbol={row.symbol} />

                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.symbol}
                  </span>

                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: priceColor,
                    textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    transition: "color 500ms ease",
                  }}>
                    {fmtPrice(price, row.symbol)}
                  </span>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    <SignalCell signal={row.signal} />
                  </div>

                  {fullData && (
                    <>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.40)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtVon(row.firstDate ?? row.lastDate)}
                      </span>
                      <span suppressHydrationWarning style={{ fontSize: 8, color: "rgba(255,255,255,0.40)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {fmtBisNow()}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
