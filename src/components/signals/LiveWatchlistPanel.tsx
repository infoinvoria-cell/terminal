"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { LiveFeedItem } from "@/lib/monitoring/live-feed-types";
import type { SignalCardModel } from "@/lib/signals/signal-types";

type Row = LiveFeedItem & { signalStatus: SignalStatus };
type SignalStatus = "long" | "short" | "pending" | "none";
type PriceFlash = "up" | "down";

const TAB_ORDER = ["Indizes", "Energie", "Metalle", "Agrar", "Aktien", "FX"];

const TAB_LABELS: Record<string, string> = {
  Indizes: "Indizes",
  Energie: "Energie",
  Metalle: "Metalle",
  Agrar: "Agrar",
  Aktien: "Aktien",
  FX: "FX / Forex",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSignalMap(cards: SignalCardModel[]): Map<string, SignalStatus> {
  const map = new Map<string, SignalStatus>();
  for (const c of cards) {
    const key = c.displaySymbol.toUpperCase();
    if (c.status === "OPEN" && c.direction === "LONG") map.set(key, "long");
    else if (c.status === "OPEN" && c.direction === "SHORT") map.set(key, "short");
    else if (
      (c.status === "VALIDATION" || c.status === "PAPER_ONLY" || c.status === "PARITY_PENDING") &&
      (c.direction === "LONG" || c.direction === "SHORT")
    ) {
      if (!map.has(key)) map.set(key, "pending");
    }
  }
  return map;
}

function fmtPrice(v: number | null, sym: string): string {
  if (v == null || v <= 0) return "—";
  const s = sym.toUpperCase();
  const isForex =
    (s.includes("USD") || s.includes("EUR") || s.includes("GBP") || s.includes("JPY")) &&
    !s.includes("BTC") && !s.includes("ETH") && !s.includes("6E");
  if (isForex && v < 100) return v.toFixed(4);
  if (v < 1) return v.toFixed(4);
  if (v < 100) return v.toFixed(2);
  return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChange(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "—", color: "rgba(255,255,255,0.20)" };
  const asPercent = Math.abs(pct) < 1 ? pct * 100 : pct;
  const sign = asPercent >= 0 ? "+" : "";
  const color = asPercent > 0.01 ? "#22c55e" : asPercent < -0.01 ? "#ef4444" : "rgba(255,255,255,0.28)";
  return { text: `${sign}${asPercent.toFixed(2)}%`, color };
}

function elapsed(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (!isFinite(diff) || diff < 0) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtVon(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${mm}/${yy}`;
}

function fmtBisNow(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}. ${hh}:${min}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssetIcon({ symbol }: { symbol: string }) {
  const url = getMonitoringAssetIconUrl({ code: symbol, name: symbol, displaySymbol: symbol });
  if (!url) {
    return (
      <span style={{
        display: "inline-flex", width: 15, height: 15, borderRadius: 3, flexShrink: 0,
        background: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center",
        fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.40)",
      }}>
        {symbol.charAt(0)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={symbol} width={15} height={15} style={{ borderRadius: 3, flexShrink: 0, objectFit: "contain", display: "block" }} />;
}

function StatusDot({ s }: { s: SignalStatus }) {
  if (s === "none") return (
    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.09)" }} />
  );
  const color = s === "long" ? "#22c55e" : s === "short" ? "#ef4444" : "#d8bc67";
  const label = s === "long" ? "L" : s === "short" ? "S" : "P";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 15, height: 15, borderRadius: "50%",
      background: `${color}20`, border: `1px solid ${color}60`,
      fontSize: 7, fontWeight: 900, color, flexShrink: 0,
    }}>{label}</span>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      flexShrink: 0,
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 12px",
      height: 20,
      background: "rgba(255,255,255,0.025)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{
        fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.45)",
      }}>{label}</span>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.20)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
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
    } catch { /* aborted */ }
  }, []);

  // Detect price changes → flash coloring
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

  const signalMap = buildSignalMap(cards);
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedSym = selectedCard?.displaySymbol.toUpperCase() ?? null;

  // Group rows by tab, using TAB_ORDER
  const allRows: Row[] = items.map((item) => ({
    ...item,
    signalStatus: signalMap.get((item.symbol ?? "").toUpperCase()) ?? "none",
  }));

  const grouped: Array<{ tab: string; rows: Row[] }> = [];
  for (const tab of TAB_ORDER) {
    const rows = allRows
      .filter((r) => r.tab === tab && r.symbol)
      .sort((a, b) => {
        const o = (s: SignalStatus) => s === "long" ? 0 : s === "short" ? 1 : s === "pending" ? 2 : 3;
        const cmp = o(a.signalStatus) - o(b.signalStatus);
        return cmp !== 0 ? cmp : (a.symbol ?? "").localeCompare(b.symbol ?? "");
      });
    if (rows.length > 0) grouped.push({ tab, rows });
  }
  // Any tabs not in TAB_ORDER
  const knownTabs = new Set(TAB_ORDER);
  const extraRows = allRows.filter((r) => r.symbol && !knownTabs.has(r.tab));
  if (extraRows.length > 0) grouped.push({ tab: "Weitere", rows: extraRows });

  const totalDataRows = grouped.reduce((s, g) => s + g.rows.length, 0);

  const COL = fullData
    ? "15px minmax(0,1fr) 60px 44px 16px 32px 40px 72px"
    : "15px minmax(0,1fr) 60px 44px 16px 32px";

  const HEADERS = fullData
    ? ["", "Symbol", "Preis", "%", "·", "Upd.", "Von", "Bis (live)"]
    : ["", "Symbol", "Preis", "%", "·", "Upd."];

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
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Live Feed
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", fontVariantNumeric: "tabular-nums" }}>{totalDataRows}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", display: "inline-block",
            background: items.length > 0 ? "#22c55e66" : "rgba(255,255,255,0.10)",
            border: items.length > 0 ? "1px solid #22c55e99" : "1px solid rgba(255,255,255,0.12)",
          }} />
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
            fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            textAlign: i >= 2 && i !== 4 ? "right" : i === 4 ? "center" : "left",
          }}>{h}</span>
        ))}
      </div>

      {/* Rows — flex-fill, no scroll */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {items.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>Lade…</span>
          </div>
        )}

        {grouped.map(({ tab, rows }) => (
          <div key={tab} style={{ display: "flex", flexDirection: "column", flex: rows.length }}>
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
                    ? "rgba(255,255,255,0.82)"
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
                    flex: 1, minHeight: 0,
                    display: "grid", gridTemplateColumns: COL,
                    alignItems: "center", gap: 4,
                    padding: "0 12px",
                    background: isSelected ? "rgba(216,188,103,0.07)" : "transparent",
                    cursor: matchCard ? "pointer" : "default",
                    borderBottom: "1px solid rgba(255,255,255,0.025)",
                    transition: "background 200ms ease",
                  }}
                >
                  <AssetIcon symbol={row.symbol} />

                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.symbol}
                  </span>

                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: priceColor,
                    textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    transition: "color 400ms ease",
                  }}>
                    {fmtPrice(price, row.symbol)}
                  </span>

                  <span style={{ fontSize: 10, fontWeight: 600, color: chg.color, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {chg.text}
                  </span>

                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <StatusDot s={row.signalStatus} />
                  </div>

                  <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.40)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {elapsed(row.refreshedAt)}
                  </span>

                  {fullData && (
                    <>
                      <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.50)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtVon(row.firstDate ?? row.lastDate)}
                      </span>
                      <span suppressHydrationWarning style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.50)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
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
