"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { LiveFeedItem } from "@/app/api/monitoring/live-feed/route";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Types ─────────────────────────────────────────────────────────────────────

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

function fmtPrice(close: number | null, symbol: string): string {
  if (close == null || close <= 0) return "—";
  const s = symbol.toUpperCase();
  const isForex =
    (s.includes("USD") || s.includes("EUR") || s.includes("GBP") || s.includes("JPY")) &&
    !s.includes("BTC") && !s.includes("ETH");
  if (isForex) return close.toFixed(4);
  if (close < 1) return close.toFixed(4);
  if (close < 100) return close.toFixed(2);
  return close.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChange(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "", color: "" };
  const sign = pct >= 0 ? "+" : "";
  const color = pct > 0.0001 ? "#22c55e" : pct < -0.0001 ? "#ef4444" : "rgba(255,255,255,0.35)";
  // change_pct from TradingView is a decimal fraction (e.g. 0.034 = +3.4%)
  const val = Math.abs(pct) > 1 ? pct.toFixed(2) : (pct * 100).toFixed(2);
  return { text: `${sign}${val}%`, color };
}

function elapsed(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (!isFinite(diff) || diff < 0) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "live";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function refreshLabel(seconds: number | null): string {
  if (!seconds) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}min`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssetIcon({ symbol, id }: { symbol: string; id?: string }) {
  const url = getMonitoringAssetIconUrl({
    code: symbol,
    assetId: id,
    name: symbol,
    displaySymbol: symbol,
  });
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
  return <img src={url} alt={symbol} width={14} height={14} style={{ borderRadius: 3, flexShrink: 0, objectFit: "contain" }} />;
}

function StatusDot({ status }: { status: SignalStatus }) {
  if (status === "none") return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.10)", flexShrink: 0 }} />;
  const color = status === "long" ? "#22c55e" : status === "short" ? "#ef4444" : "#d8bc67";
  const label = status === "long" ? "L" : status === "short" ? "S" : "P";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 14, height: 14, borderRadius: "50%",
      background: `${color}18`, border: `1px solid ${color}60`,
      fontSize: 7, fontWeight: 900, color, flexShrink: 0,
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
      const res = await fetch("/api/monitoring/live-feed", { signal: ctrl.signal });
      if (!res.ok) return;
      const json = await res.json() as { items: LiveFeedItem[] };
      setItems(json.items ?? []);
    } catch { /* aborted or network */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, [fetchData]);

  // Re-render for elapsed time every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const signalMap = buildSignalMap(cards);
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedSymbol = selectedCard?.displaySymbol.toUpperCase() ?? null;

  // Sort: signals first (long/short/pending), then alphabetical within tab
  const sorted = [...items].sort((a, b) => {
    const sa = signalMap.get(a.symbol?.toUpperCase() ?? "") ?? "none";
    const sb = signalMap.get(b.symbol?.toUpperCase() ?? "") ?? "none";
    const order = (s: SignalStatus) => s === "long" ? 0 : s === "short" ? 1 : s === "pending" ? 2 : 3;
    const cmp = order(sa) - order(sb);
    if (cmp !== 0) return cmp;
    return (a.tab ?? "").localeCompare(b.tab ?? "") || (a.symbol ?? "").localeCompare(b.symbol ?? "");
  });

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      background: "#0c0d10",
      borderLeft: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: "8px 10px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.70)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>Live Feed</span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)" }}>
          {sorted.length}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", display: "inline-block",
            background: items.length > 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
          }} />
          <button
            onClick={() => setFullData((v) => !v)}
            style={{
              background: fullData ? "rgba(255,255,255,0.08)" : "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 8, fontWeight: 700,
              color: fullData ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.30)",
              cursor: "pointer",
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}
          >
            Full Data
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: fullData
          ? "14px 1fr 52px 36px 18px 36px 36px 32px"
          : "14px 1fr 52px 36px 18px 36px",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        {["", "Symbol", "Preis", "%", "Sig", "Update",
          ...(fullData ? ["Von", "Bis", "Bars"] : [])
        ].map((h, i) => (
          <span key={i} style={{
            fontSize: 7, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            textAlign: i >= 2 ? "right" : "left",
            overflow: "hidden",
          }}>{h}</span>
        ))}
      </div>

      {/* Rows — no scroll */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {sorted.map((item) => {
          if (!item.symbol) return null;
          const key = item.symbol.toUpperCase();
          const sig = signalMap.get(key) ?? "none";
          const isSelected = key === selectedSymbol;
          const chg = fmtChange(item.changePct);
          const matchCard = cards.find(
            (c) => c.displaySymbol.toUpperCase() === key || c.assetSymbol.toUpperCase() === key,
          );

          return (
            <div
              key={item.symbol}
              onClick={() => matchCard && onSelectCard(matchCard.id)}
              style={{
                display: "grid",
                gridTemplateColumns: fullData
                  ? "14px 1fr 52px 36px 18px 36px 36px 32px"
                  : "14px 1fr 52px 36px 18px 36px",
                alignItems: "center",
                gap: 4,
                padding: "2px 10px",
                background: isSelected ? "rgba(216,188,103,0.06)" : "transparent",
                cursor: matchCard ? "pointer" : "default",
                borderBottom: "1px solid rgba(255,255,255,0.02)",
              }}
            >
              {/* Icon */}
              <AssetIcon symbol={item.symbol} />

              {/* Symbol */}
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#fff",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {item.symbol}
              </span>

              {/* Price */}
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: item.lastClose != null ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.18)",
                textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              }}>
                {fmtPrice(item.lastClose, item.symbol)}
              </span>

              {/* Change % */}
              <span style={{
                fontSize: 8, fontWeight: 600,
                color: chg.color || "rgba(255,255,255,0.18)",
                textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              }}>
                {chg.text || "—"}
              </span>

              {/* Signal status */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <StatusDot status={sig} />
              </div>

              {/* Last update + refresh interval */}
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", whiteSpace: "nowrap" }}>
                  {elapsed(item.refreshedAt)}
                </span>
                {item.liveRefreshSeconds && (
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.14)", marginLeft: 2 }}>
                    /{refreshLabel(item.liveRefreshSeconds)}
                  </span>
                )}
              </div>

              {/* Full Data columns */}
              {fullData && (
                <>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {item.firstDate ? item.firstDate.slice(0, 7) : "—"}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {item.lastDate ? item.lastDate.slice(0, 7) : "—"}
                  </span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {item.barCount != null ? item.barCount.toLocaleString("de-DE") : "—"}
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
