"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Quote = {
  symbol: string;
  close: number | null;
  changePct: number | null;
  fetchedAt: string | null;
  status: "ok" | "stale" | "error" | "missing";
};

type WatchlistRow = {
  card: SignalCardModel;
  quote: Quote | null;
};

type SortKey = "symbol" | "status" | "updated";

// ── Status badge logic ────────────────────────────────────────────────────────

type SignalStatus = "long" | "short" | "pending" | "none";

function getSignalStatus(card: SignalCardModel): SignalStatus {
  if (card.status === "OPEN" && card.direction === "LONG") return "long";
  if (card.status === "OPEN" && card.direction === "SHORT") return "short";
  if (
    card.status === "PAPER_ONLY" ||
    card.status === "VALIDATION" ||
    card.status === "PARITY_PENDING"
  ) {
    if (card.direction === "LONG" || card.direction === "SHORT") return "pending";
  }
  return "none";
}

function statusOrder(s: SignalStatus): number {
  if (s === "long") return 0;
  if (s === "short") return 1;
  if (s === "pending") return 2;
  return 3;
}

function StatusBadge({ status }: { status: SignalStatus }) {
  if (status === "long") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: "50%",
        background: "rgba(34,197,94,0.15)",
        border: "1.5px solid #22c55e",
        color: "#22c55e", fontSize: 10, fontWeight: 900, lineHeight: 1,
        flexShrink: 0,
      }}>✓</span>
    );
  }
  if (status === "short") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: "50%",
        background: "rgba(239,68,68,0.15)",
        border: "1.5px solid #ef4444",
        color: "#ef4444", fontSize: 11, fontWeight: 900, lineHeight: 1,
        flexShrink: 0,
      }}>✕</span>
    );
  }
  if (status === "pending") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: "50%",
        background: "rgba(216,188,103,0.12)",
        border: "1.5px solid #d8bc67",
        color: "#d8bc67", fontSize: 10, fontWeight: 900, lineHeight: 1,
        flexShrink: 0,
      }}>✓</span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, borderRadius: "50%",
      border: "1.5px solid rgba(255,255,255,0.14)",
      color: "rgba(255,255,255,0.25)", fontSize: 13, fontWeight: 700, lineHeight: 1,
      flexShrink: 0,
    }}>−</span>
  );
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - Date.parse(iso);
  if (!isFinite(diffMs) || diffMs < 0) return "—";
  const s = Math.floor(diffMs / 1000);
  if (s < 10) return "gerade";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

// ── Price formatting ──────────────────────────────────────────────────────────

function fmtPrice(close: number | null, symbol: string): string {
  if (close == null || close <= 0) return "—";
  const s = symbol.toUpperCase();
  const isForex = s.includes("USD") || s.includes("EUR") || s.includes("GBP") || s.includes("JPY");
  const isCrypto = s.includes("BTC") || s.includes("ETH");
  if (isForex && !isCrypto) return close.toFixed(4);
  if (close < 1) return close.toFixed(4);
  if (close < 100) return close.toFixed(2);
  return close.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChangePct(pct: number | null): string {
  if (pct == null || !isFinite(pct)) return "";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

function sortRows(rows: WatchlistRow[], key: SortKey, dir: "asc" | "desc"): WatchlistRow[] {
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "symbol") {
      cmp = a.card.displaySymbol.localeCompare(b.card.displaySymbol);
    } else if (key === "status") {
      cmp = statusOrder(getSignalStatus(a.card)) - statusOrder(getSignalStatus(b.card));
      if (cmp === 0) cmp = a.card.displaySymbol.localeCompare(b.card.displaySymbol);
    } else {
      // updated: most recent first by default
      const ta = a.quote?.fetchedAt ? Date.parse(a.quote.fetchedAt) : 0;
      const tb = b.quote?.fetchedAt ? Date.parse(b.quote.fetchedAt) : 0;
      cmp = tb - ta;
    }
    return dir === "desc" ? -cmp : cmp;
  });
  return sorted;
}

// ── Asset icon (small, 20px) ──────────────────────────────────────────────────

function SmallIcon({ card }: { card: SignalCardModel }) {
  const url = getMonitoringAssetIconUrl({
    code: card.assetSymbol,
    assetId: card.iconKey,
    name: card.assetName,
    displaySymbol: card.displaySymbol,
  });
  if (!url) {
    return (
      <div style={{
        width: 20, height: 20, borderRadius: 4,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>
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
      width={20}
      height={20}
      style={{
        objectFit: "contain", borderRadius: 4, flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
      }}
    />
  );
}

// ── Sort header button ────────────────────────────────────────────────────────

function SortBtn({
  label, colKey, current, dir, onClick,
}: {
  label: string; colKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = current === colKey;
  return (
    <button
      onClick={() => onClick(colKey)}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
        color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.32)",
        fontSize: 9, fontWeight: active ? 800 : 600,
        letterSpacing: "0.06em", textTransform: "uppercase",
        display: "inline-flex", alignItems: "center", gap: 2,
      }}
    >
      {label}
      {active && <span style={{ fontSize: 8 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
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
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tick, setTick] = useState(0); // force relative-time re-render
  const abortRef = useRef<AbortController | null>(null);

  // Fetch live prices
  const fetchQuotes = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/market-data/latest", { signal: ctrl.signal });
      if (!res.ok) return;
      const json = (await res.json()) as { items?: Array<{
        symbol: string; close: number | null; change_pct: number | null;
        fetched_at: string | null; status: "ok" | "stale" | "error" | "missing";
      }> };
      const map = new Map<string, Quote>();
      for (const item of json.items ?? []) {
        if (!item.symbol) continue;
        map.set(item.symbol.toUpperCase(), {
          symbol: item.symbol,
          close: item.close,
          changePct: item.change_pct,
          fetchedAt: item.fetched_at,
          status: item.status,
        });
      }
      setQuotes(map);
    } catch {
      // aborted or network error — ignore
    }
  }, []);

  // Poll every 5s
  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, REFRESH_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchQuotes]);

  // Update relative time every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Dedupe cards by displaySymbol (show each asset once)
  const deduped = (() => {
    const seen = new Set<string>();
    return cards.filter((c) => {
      if (seen.has(c.displaySymbol)) return false;
      seen.add(c.displaySymbol);
      return true;
    });
  })();

  const rows: WatchlistRow[] = deduped.map((card) => ({
    card,
    quote: quotes.get(card.displaySymbol.toUpperCase()) ??
           quotes.get(card.assetSymbol.toUpperCase()) ?? null,
  }));

  const sorted = sortRows(rows, sortKey, sortDir);

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updated" ? "asc" : "asc");
    }
  }

  // suppress lint for tick (it's used only to trigger re-render)
  void tick;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", minHeight: 0,
      background: "#0d0e11",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: "10px 12px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Pulse dot */}
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 6px #22c55e88",
            animation: "pulse 2s infinite",
          }} />
          <span style={{
            fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.80)",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>Live Feed</span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            {sorted.length} Assets
          </span>
        </div>
        {/* Sort buttons */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <SortBtn label="Status" colKey="status" current={sortKey} dir={sortDir} onClick={handleSortClick} />
          <SortBtn label="Symbol" colKey="symbol" current={sortKey} dir={sortDir} onClick={handleSortClick} />
          <SortBtn label="Update" colKey="updated" current={sortKey} dir={sortDir} onClick={handleSortClick} />
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .wl-row { transition: background 100ms; }
          .wl-row:hover { background: rgba(255,255,255,0.04) !important; }
        `}</style>

        {sorted.map(({ card, quote }) => {
          const sig = getSignalStatus(card);
          const isSelected = card.id === selectedCardId;
          const close = quote?.close ?? null;
          const changePct = quote?.changePct ?? null;
          const changeColor = changePct == null ? "rgba(255,255,255,0.28)"
            : changePct > 0 ? "#22c55e" : changePct < 0 ? "#ef4444" : "rgba(255,255,255,0.28)";
          const rowBg = isSelected
            ? "rgba(216,188,103,0.07)"
            : "transparent";

          return (
            <div
              key={card.id}
              className="wl-row"
              onClick={() => onSelectCard(card.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr auto 22px",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                cursor: "pointer",
                background: rowBg,
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              {/* Icon */}
              <SmallIcon card={card} />

              {/* Symbol + Price */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#fff",
                  whiteSpace: "nowrap", letterSpacing: "0.01em",
                }}>
                  {card.displaySymbol}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.75)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {fmtPrice(close, card.displaySymbol)}
                  </span>
                  {changePct != null && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: changeColor,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {fmtChangePct(changePct)}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.20)", whiteSpace: "nowrap" }}>
                  {relativeTime(quote?.fetchedAt ?? null)}
                </span>
              </div>

              {/* Status badge */}
              <StatusBadge status={sig} />

              {/* Stale dot */}
              <div style={{
                width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                background: quote?.status === "ok"
                  ? "#22c55e44"
                  : quote?.status === "stale"
                    ? "#d8bc6744"
                    : "rgba(255,255,255,0.1)",
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
