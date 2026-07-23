"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { LiveFeedItem } from "@/lib/monitoring/live-feed-types";
import type { SignalCardModel } from "@/lib/signals/signal-types";

type SignalStatus = "long" | "short" | "pending_valid" | "pending_invalid" | "none";
type SignalData = { status: SignalStatus; changePct: number | null };
type PriceFlash = "up" | "down";
type Row = LiveFeedItem & { signal: SignalData };

const TAB_ORDER = ["Indizes", "Energie", "Metalle", "Agrar", "Aktien", "FX", "Vergleich"];

const TAB_LABELS: Record<string, string> = {
  Indizes: "Indizes",
  Energie: "Energie",
  Metalle: "Metalle",
  Agrar: "Agrar",
  Aktien: "Aktien",
  FX: "FX — Forex",
  Vergleich: "Vergleich",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSignalMap(cards: SignalCardModel[]): Map<string, SignalData> {
  const map = new Map<string, SignalData>();
  for (const c of cards) {
    const key = c.displaySymbol.toUpperCase();
    if (c.status === "OPEN") {
      if (c.direction === "LONG")
        map.set(key, { status: "long", changePct: c.changePct ?? null });
      else if (c.direction === "SHORT")
        map.set(key, { status: "short", changePct: c.changePct ?? null });
    } else if (
      (c.status === "VALIDATION" || c.status === "PAPER_ONLY" || c.status === "PARITY_PENDING") &&
      (c.direction === "LONG" || c.direction === "SHORT")
    ) {
      if (!map.has(key)) {
        const probable = c.status === "VALIDATION" || c.status === "PARITY_PENDING";
        map.set(key, { status: probable ? "pending_valid" : "pending_invalid", changePct: null });
      }
    }
  }
  return map;
}

function fmtPrice(v: number | null, sym: string): string {
  if (v == null || v <= 0) return "—";
  const s = sym.toUpperCase();
  const isSmallFx =
    (s.includes("USD") || s.includes("EUR") || s.includes("GBP") || s.includes("JPY") ||
      s.includes("NOK") || s.includes("SEK") || s.includes("MXN") || s.includes("ZAR") ||
      s.includes("BRL") || s.includes("CLP")) &&
    !s.includes("BTC") && !s.includes("ETH") && !s.startsWith("6");
  if (isSmallFx && v < 100) return v.toFixed(4);
  if (v < 1) return v.toFixed(4);
  if (v < 100) return v.toFixed(2);
  return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChange(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "—", color: "rgba(255,255,255,0.18)" };
  const asPercent = Math.abs(pct) < 1 ? pct * 100 : pct;
  const sign = asPercent >= 0 ? "+" : "";
  const color = asPercent > 0.01 ? "#22c55e" : asPercent < -0.01 ? "#ef4444" : "rgba(255,255,255,0.28)";
  return { text: `${sign}${asPercent.toFixed(2)}%`, color };
}

function elapsedSec(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - Date.parse(iso);
  return isFinite(diff) && diff >= 0 ? Math.floor(diff / 1000) : null;
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

function StatusCell({ signal }: { signal: SignalData }) {
  if (signal.status === "none") {
    return <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, lineHeight: 1 }}>—</span>;
  }
  if (signal.status === "pending_valid") {
    return (
      <span title="Signal sehr wahrscheinlich" style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%",
        background: "rgba(216,188,103,0.15)", border: "1px solid rgba(216,188,103,0.45)",
      }}>
        <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
          <path d="M1 3.5L3 5.5L7 1" stroke="#d8bc67" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  if (signal.status === "pending_invalid") {
    return (
      <span title="Signal möglich" style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%",
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
      }}>
        <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
          <path d="M1 3.5L3 5.5L7 1" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  // long or short — show changePct
  const pct = signal.changePct;
  const isLong = signal.status === "long";
  const color = isLong ? "#22c55e" : "#ef4444";
  const text = pct != null
    ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
    : (isLong ? "L" : "S");
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      flexShrink: 0, height: 18,
      display: "flex", alignItems: "center", gap: 5,
      padding: "0 12px",
      borderTop: "1px solid rgba(255,255,255,0.055)",
    }}>
      <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
        {label}
      </span>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.14)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const REFRESH_MS = 25_000;

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
  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [priceFlash, setPriceFlash] = useState<Map<string, PriceFlash>>(new Map());
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
      setItems(d.items ?? []);
      setLastFetchAt(new Date().toISOString());
    } catch { /* aborted */ }
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const flash = new Map<string, PriceFlash>();
    for (const item of items) {
      if (item.lastClose == null || item.lastClose <= 0) continue;
      const prev = prevPricesRef.current.get(item.symbol);
      if (prev != null && prev !== item.lastClose) {
        flash.set(item.symbol, item.lastClose > prev ? "up" : "down");
      }
      prevPricesRef.current.set(item.symbol, item.lastClose);
    }
    if (flash.size > 0) {
      setPriceFlash(flash);
      const t = setTimeout(() => setPriceFlash(new Map()), 2500);
      return () => clearTimeout(t);
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

  // Group by tab
  const grouped: Array<{ tab: string; rows: Row[] }> = [];
  for (const tab of TAB_ORDER) {
    const rows = allRows
      .filter((r) => r.tab === tab)
      .sort((a, b) => {
        const o = (s: SignalStatus) => s === "long" || s === "short" ? 0 : s.startsWith("pending") ? 1 : 2;
        return o(a.signal.status) - o(b.signal.status) || a.symbol.localeCompare(b.symbol);
      });
    if (rows.length > 0) grouped.push({ tab, rows });
  }
  const knownTabs = new Set(TAB_ORDER);
  const extra = allRows.filter((r) => !knownTabs.has(r.tab));
  if (extra.length > 0) grouped.push({ tab: "Weitere", rows: extra });

  const totalRows = grouped.reduce((s, g) => s + g.rows.length, 0);

  const COL = fullData
    ? "15px minmax(0,1fr) 56px 42px 50px 36px 68px"
    : "15px minmax(0,1fr) 56px 42px 50px";

  const HEADERS = fullData
    ? ["", "Symbol", "Preis", "%", "Signal", "Von", "Bis"]
    : ["", "Symbol", "Preis", "%", "Signal"];

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#0c0d10",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: "8px 12px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Live Feed
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontVariantNumeric: "tabular-nums" }}>{totalRows}</span>
        {sinceUpdate != null && (
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", fontVariantNumeric: "tabular-nums" }}>
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
        gap: 4, padding: "4px 12px 3px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {HEADERS.map((h, i) => (
          <span key={i} style={{
            fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.50)",
            textAlign: i === 0 ? "left" : i === 1 ? "left" : "right",
          }}>{h}</span>
        ))}
      </div>

      {/* Rows — scrollable, hidden scrollbar */}
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {items.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
            Lade…
          </div>
        )}

        {grouped.map(({ tab, rows }) => (
          <div key={tab}>
            <SectionHeader label={TAB_LABELS[tab] ?? tab} count={rows.length} />
            {rows.map((row) => {
              const price = row.lastClose;
              const chg = fmtChange(row.changePct);
              const isSelected = row.symbol.toUpperCase() === selectedSym;
              const flash = priceFlash.get(row.symbol);
              const priceColor = flash === "up"
                ? "#ffffff"
                : flash === "down"
                  ? "#d8bc67"
                  : price != null && price > 0
                    ? "rgba(255,255,255,0.80)"
                    : "rgba(255,255,255,0.20)";
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
                    alignItems: "center", gap: 4,
                    padding: "3px 12px",
                    minHeight: 22,
                    background: isSelected ? "rgba(216,188,103,0.07)" : "transparent",
                    cursor: matchCard ? "pointer" : "default",
                    borderBottom: "1px solid rgba(255,255,255,0.025)",
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
                    transition: "color 400ms ease",
                  }}>
                    {fmtPrice(price, row.symbol)}
                  </span>

                  <span style={{ fontSize: 9, fontWeight: 600, color: chg.color, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {chg.text}
                  </span>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    <StatusCell signal={row.signal} />
                  </div>

                  {fullData && (
                    <>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtVon(row.firstDate ?? row.lastDate)}
                      </span>
                      <span suppressHydrationWarning style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
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
