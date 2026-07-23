"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { LiveFeedItem } from "@/lib/monitoring/live-feed-types";
import type { SignalCardModel } from "@/lib/signals/signal-types";

type Row = LiveFeedItem & { signalStatus: SignalStatus };

type SignalStatus = "long" | "short" | "pending" | "none";

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
    !s.includes("BTC") && !s.includes("ETH");
  if (isForex) return v.toFixed(4);
  if (v < 1) return v.toFixed(4);
  if (v < 100) return v.toFixed(2);
  return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChange(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "—", color: "rgba(255,255,255,0.18)" };
  // TradingView stores as fraction (0.034 = +3.4%) vs percentage — detect by magnitude
  const asPercent = Math.abs(pct) < 1 ? pct * 100 : pct;
  const sign = asPercent >= 0 ? "+" : "";
  const color = asPercent > 0.01 ? "#22c55e" : asPercent < -0.01 ? "#ef4444" : "rgba(255,255,255,0.35)";
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

// ── Sub-components ────────────────────────────────────────────────────────────

function AssetIcon({ symbol }: { symbol: string }) {
  const url = getMonitoringAssetIconUrl({ code: symbol, name: symbol, displaySymbol: symbol });
  if (!url) {
    return (
      <span style={{
        display: "inline-flex", width: 14, height: 14, borderRadius: 3, flexShrink: 0,
        background: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center",
        fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.35)",
      }}>
        {symbol.charAt(0)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={symbol} width={14} height={14} style={{ borderRadius: 3, flexShrink: 0, objectFit: "contain", display: "block" }} />;
}

function StatusDot({ s }: { s: SignalStatus }) {
  if (s === "none") return <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />;
  const color = s === "long" ? "#22c55e" : s === "short" ? "#ef4444" : "#d8bc67";
  const label = s === "long" ? "L" : s === "short" ? "S" : "P";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 13, height: 13, borderRadius: "50%",
      background: `${color}18`, border: `1px solid ${color}55`,
      fontSize: 6, fontWeight: 900, color, flexShrink: 0,
    }}>{label}</span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const REFRESH_MS = 5_000;

export default function LiveWatchlistPanel({
  cards,
  selectedCardId,
  onSelectCard,
}: {
  cards: SignalCardModel[];
  selectedCardId: string | null;
  onSelectCard: (id: string) => void;
}) {
  const [items, setItems] = useState<LiveFeedItem[]>([]);
  const [fullData, setFullData] = useState(false);
  const [tick, setTick] = useState(0);
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

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const signalMap = buildSignalMap(cards);
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedSym = selectedCard?.displaySymbol.toUpperCase() ?? null;

  const rows: Row[] = items.map((item) => ({
    ...item,
    signalStatus: signalMap.get((item.symbol ?? "").toUpperCase()) ?? "none",
  })).sort((a, b) => {
    const o = (s: SignalStatus) => s === "long" ? 0 : s === "short" ? 1 : s === "pending" ? 2 : 3;
    const cmp = o(a.signalStatus) - o(b.signalStatus);
    return cmp !== 0 ? cmp : (a.tab ?? "").localeCompare(b.tab ?? "") || (a.symbol ?? "").localeCompare(b.symbol ?? "");
  });

  const COL = fullData
    ? "14px minmax(0,1fr) 54px 40px 14px 30px 48px 48px 36px"
    : "14px minmax(0,1fr) 54px 40px 14px 30px";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#0c0d10",
      borderLeft: "1px solid rgba(255,255,255,0.05)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: "7px 10px 5px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.65)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Live Feed
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)" }}>{rows.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", display: "inline-block", background: items.length > 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)" }} />
          <button onClick={() => setFullData((v) => !v)} style={{
            background: fullData ? "rgba(255,255,255,0.08)" : "transparent",
            border: "1px solid rgba(255,255,255,0.10)", borderRadius: 3,
            padding: "2px 6px", fontSize: 8, fontWeight: 700,
            color: fullData ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
            cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
          }}>Full Data</button>
        </div>
      </div>

      {/* Column header */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: COL, gap: 3, padding: "3px 10px 2px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {(["", "Symbol", "Preis", "%", "·", "Update", ...(fullData ? ["Von", "Bis", "Bars"] : [])]).map((h, i) => (
          <span key={i} style={{ fontSize: 7, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.20)", textAlign: i >= 2 ? "right" : "left" }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {rows.length === 0 && (
          <div style={{ padding: 12, fontSize: 9, color: "rgba(255,255,255,0.18)", textAlign: "center" }}>
            Lade…
          </div>
        )}
        {rows.map((row) => {
          if (!row.symbol) return null;
          const price = row.lastClose;
          const chg = fmtChange(row.changePct);
          const updatedAt = row.refreshedAt;
          const isSelected = row.symbol.toUpperCase() === selectedSym;
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
                background: isSelected ? "rgba(216,188,103,0.06)" : "transparent",
                cursor: matchCard ? "pointer" : "default",
                borderBottom: "1px solid rgba(255,255,255,0.025)",
              }}
            >
              <AssetIcon symbol={row.symbol} />

              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.symbol}
              </span>

              <span style={{ fontSize: 9, color: price != null ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.18)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {fmtPrice(price, row.symbol)}
              </span>

              <span style={{ fontSize: 8, color: chg.color, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {chg.text}
              </span>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <StatusDot s={row.signalStatus} />
              </div>

              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textAlign: "right", whiteSpace: "nowrap" }}>
                {elapsed(updatedAt)}
              </span>

              {fullData && (
                <>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.firstDate ? row.firstDate.slice(0, 7) : "—"}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.lastDate ? row.lastDate.slice(0, 7) : "—"}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.barCount != null ? row.barCount.toLocaleString("de-DE") : "—"}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
