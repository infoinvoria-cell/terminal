"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { SignalCardModel } from "@/lib/signals/signal-types";

// ── External data types ───────────────────────────────────────────────────────

type UniverseAsset = {
  id: string;
  tab: string;
  name: string;
  symbol: string;
  short: string;
  source: string;
};

type ManifestEntry = {
  asset: string;
  firstDate: string | null;
  lastDate: string | null;
  barCount: number | null;
};

type Quote = {
  symbol: string;
  close: number | null;
  change_pct: number | null;
  fetched_at: string | null;
  status: "ok" | "stale" | "error" | "missing";
};

type SignalStatus = "long" | "short" | "pending" | "none";

type SortKey = "symbol" | "tab" | "status" | "change" | "updated";

// ── Signal status from card data ──────────────────────────────────────────────

function buildSignalMap(cards: SignalCardModel[]): Map<string, SignalStatus> {
  const map = new Map<string, SignalStatus>();
  for (const c of cards) {
    const key = c.displaySymbol.toUpperCase();
    if (c.status === "OPEN" && c.direction === "LONG") {
      map.set(key, "long");
    } else if (c.status === "OPEN" && c.direction === "SHORT") {
      map.set(key, "short");
    } else if (
      (c.status === "VALIDATION" || c.status === "PAPER_ONLY" || c.status === "PARITY_PENDING") &&
      (c.direction === "LONG" || c.direction === "SHORT")
    ) {
      if (!map.has(key)) map.set(key, "pending");
    }
  }
  return map;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtPrice(close: number | null, symbol: string): string {
  if (close == null || close <= 0) return "—";
  const s = symbol.toUpperCase();
  const isForex = (s.includes("USD") || s.includes("EUR") || s.includes("GBP") || s.includes("JPY")) && !s.includes("BTC") && !s.includes("ETH");
  if (isForex) return close.toFixed(4);
  if (close < 1) return close.toFixed(4);
  if (close < 100) return close.toFixed(2);
  return close.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function fmtChange(pct: number | null): { text: string; color: string } {
  if (pct == null || !isFinite(pct)) return { text: "—", color: "rgba(255,255,255,0.25)" };
  const sign = pct >= 0 ? "+" : "";
  const text = `${sign}${(pct * 100).toFixed(2)}%`;
  const color = pct > 0 ? "#22c55e" : pct < 0 ? "#ef4444" : "rgba(255,255,255,0.35)";
  return { text, color };
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (!isFinite(diff) || diff < 0) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "live";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function statusOrder(s: SignalStatus): number {
  return s === "long" ? 0 : s === "short" ? 1 : s === "pending" ? 2 : 3;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssetIcon({ asset }: { asset: UniverseAsset }) {
  const url = getMonitoringAssetIconUrl({
    code: asset.symbol,
    assetId: asset.id,
    name: asset.name,
    displaySymbol: asset.symbol,
  });
  if (!url) {
    return (
      <div style={{
        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
        background: "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>
          {asset.symbol.charAt(0)}
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={asset.symbol}
      width={16}
      height={16}
      style={{ objectFit: "contain", borderRadius: 3, flexShrink: 0 }}
    />
  );
}

function SignalBadge({ status }: { status: SignalStatus }) {
  if (status === "none") {
    return (
      <span style={{
        fontSize: 9, color: "rgba(255,255,255,0.18)",
        fontWeight: 600, letterSpacing: "0.04em",
      }}>—</span>
    );
  }
  const map: Record<string, { label: string; color: string; bg: string }> = {
    long:    { label: "LONG",  color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
    short:   { label: "SHORT", color: "#ef4444", bg: "rgba(239,68,68,0.10)" },
    pending: { label: "PEND",  color: "#d8bc67", bg: "rgba(216,188,103,0.10)" },
  };
  const s = map[status]!;
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 5px",
      borderRadius: 3,
      fontSize: 8,
      fontWeight: 800,
      letterSpacing: "0.06em",
      background: s.bg,
      color: s.color,
    }}>{s.label}</span>
  );
}

function SortHeader({
  label, col, current, dir, onSort, style,
}: {
  label: string; col: SortKey; current: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; style?: React.CSSProperties;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: "5px 6px",
        fontSize: 8, fontWeight: active ? 800 : 600,
        letterSpacing: "0.07em", textTransform: "uppercase",
        color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.28)",
        cursor: "pointer", userSelect: "none",
        whiteSpace: "nowrap", textAlign: "left",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "transparent",
        ...style,
      }}
    >
      {label}{active && <span style={{ marginLeft: 3 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
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
  const [assets, setAssets] = useState<UniverseAsset[]>([]);
  const [manifest, setManifest] = useState<Map<string, ManifestEntry>>(new Map());
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [fullData, setFullData] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Load asset universe (static file)
  useEffect(() => {
    fetch("/generated/monitoring/config/monitoring_asset_universe.json")
      .then((r) => r.json())
      .then((d: { assets?: UniverseAsset[] }) => {
        setAssets(d.assets ?? []);
      })
      .catch(() => {});
  }, []);

  // Load manifest (for Full Data coverage)
  useEffect(() => {
    if (!fullData) return;
    fetch("/generated/monitoring/tradingview_data_cache/cache_manifest_full.json")
      .then((r) => r.json())
      .then((d: { assets?: ManifestEntry[] }) => {
        const m = new Map<string, ManifestEntry>();
        for (const entry of d.assets ?? []) {
          if (entry.asset) m.set(entry.asset.toUpperCase(), entry);
        }
        setManifest(m);
      })
      .catch(() => {});
  }, [fullData]);

  // Poll live prices
  const fetchQuotes = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/market-data/latest", { signal: ctrl.signal });
      if (!res.ok) return;
      const json = await res.json() as { items?: Quote[] };
      const map = new Map<string, Quote>();
      for (const item of json.items ?? []) {
        if (item.symbol) map.set(item.symbol.toUpperCase(), item);
      }
      setQuotes(map);
    } catch { /* aborted */ }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, REFRESH_MS);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, [fetchQuotes]);

  // Relative time re-render tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // Signal status map
  const signalMap = buildSignalMap(cards);

  // Merge data
  type Row = UniverseAsset & {
    quote: Quote | null;
    signalStatus: SignalStatus;
    coverage: ManifestEntry | null;
  };

  const rows: Row[] = assets.map((a) => {
    const key = a.symbol.toUpperCase();
    const quote = quotes.get(key) ?? quotes.get(a.short?.toUpperCase()) ?? null;
    return {
      ...a,
      quote,
      signalStatus: signalMap.get(key) ?? "none",
      coverage: manifest.get(key) ?? null,
    };
  });

  // Sort
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
    else if (sortKey === "tab") {
      cmp = a.tab.localeCompare(b.tab);
      if (cmp === 0) cmp = a.symbol.localeCompare(b.symbol);
    } else if (sortKey === "status") {
      cmp = statusOrder(a.signalStatus) - statusOrder(b.signalStatus);
      if (cmp === 0) cmp = a.symbol.localeCompare(b.symbol);
    } else if (sortKey === "change") {
      const ca = a.quote?.change_pct ?? -Infinity;
      const cb = b.quote?.change_pct ?? -Infinity;
      cmp = ca - cb;
    } else if (sortKey === "updated") {
      const ta = a.quote?.fetched_at ? Date.parse(a.quote.fetched_at) : 0;
      const tb = b.quote?.fetched_at ? Date.parse(b.quote.fetched_at) : 0;
      cmp = tb - ta;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // Find selected card's symbol to highlight row
  const selectedCard = cards.find((c) => c.id === selectedCardId);
  const selectedSymbol = selectedCard?.displaySymbol.toUpperCase() ?? null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      background: "#0c0d10",
      borderLeft: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: "10px 12px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>Live Feed</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginLeft: 2 }}>
          {sorted.length} Assets
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {/* Freshness dot */}
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: quotes.size > 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
            display: "inline-block",
          }} />
          <button
            onClick={() => setFullData((v) => !v)}
            style={{
              background: fullData ? "rgba(255,255,255,0.08)" : "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 9, fontWeight: 700,
              color: fullData ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
              cursor: "pointer",
              letterSpacing: "0.05em", textTransform: "uppercase",
              transition: "background 120ms, color 120ms",
            }}
          >
            Full Data
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}>
        <table style={{
          width: "100%", borderCollapse: "collapse",
          fontSize: 10, tableLayout: "auto",
        }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#0c0d10" }}>
            <tr>
              <th style={{ width: 24, padding: "5px 6px", borderBottom: "1px solid rgba(255,255,255,0.07)" }} />
              <SortHeader label="Symbol" col="symbol" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Tab" col="tab" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th style={{ padding: "5px 6px", fontSize: 8, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>Preis</th>
              <SortHeader label="%" col="change" current={sortKey} dir={sortDir} onSort={handleSort} style={{ textAlign: "right" }} />
              <SortHeader label="Status" col="status" current={sortKey} dir={sortDir} onSort={handleSort} style={{ textAlign: "center" }} />
              <SortHeader label="Update" col="updated" current={sortKey} dir={sortDir} onSort={handleSort} style={{ textAlign: "right" }} />
              {fullData && (
                <>
                  <th style={{ padding: "5px 6px", fontSize: 8, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>Von</th>
                  <th style={{ padding: "5px 6px", fontSize: 8, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>Bis</th>
                  <th style={{ padding: "5px 6px", fontSize: 8, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>Bars</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.symbol.toUpperCase() === selectedSymbol;
              const chg = fmtChange(row.quote?.change_pct ?? null);
              const hasFreshPrice = row.quote?.close != null && row.quote.close > 0;
              const cov = row.coverage;

              // Find the card id for this asset to pass to onSelectCard
              const matchCard = cards.find((c) => c.displaySymbol.toUpperCase() === row.symbol.toUpperCase() || c.assetSymbol.toUpperCase() === row.symbol.toUpperCase());

              return (
                <tr
                  key={row.id}
                  onClick={() => matchCard && onSelectCard(matchCard.id)}
                  style={{
                    background: isSelected
                      ? "rgba(216,188,103,0.06)"
                      : "transparent",
                    cursor: matchCard ? "pointer" : "default",
                    transition: "background 80ms",
                    borderBottom: "1px solid rgba(255,255,255,0.025)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isSelected ? "rgba(216,188,103,0.06)" : "transparent";
                  }}
                >
                  {/* Icon */}
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>
                    <AssetIcon asset={row} />
                  </td>
                  {/* Symbol */}
                  <td style={{ padding: "5px 6px", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                    {row.symbol}
                  </td>
                  {/* Tab */}
                  <td style={{ padding: "5px 6px", color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap" }}>
                    {row.tab}
                  </td>
                  {/* Price */}
                  <td style={{ padding: "5px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: hasFreshPrice ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.18)", whiteSpace: "nowrap" }}>
                    {fmtPrice(row.quote?.close ?? null, row.symbol)}
                  </td>
                  {/* Change % */}
                  <td style={{ padding: "5px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: chg.color, fontWeight: hasFreshPrice ? 600 : 400, whiteSpace: "nowrap" }}>
                    {chg.text}
                  </td>
                  {/* Signal status */}
                  <td style={{ padding: "5px 6px", textAlign: "center" }}>
                    <SignalBadge status={row.signalStatus} />
                  </td>
                  {/* Update time */}
                  <td style={{ padding: "5px 6px", textAlign: "right", color: "rgba(255,255,255,0.20)", whiteSpace: "nowrap" }}>
                    {relativeTime(row.quote?.fetched_at ?? null)}
                  </td>
                  {/* Full Data columns */}
                  {fullData && (
                    <>
                      <td style={{ padding: "5px 6px", textAlign: "right", color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {cov?.firstDate ? cov.firstDate.slice(0, 10) : "—"}
                      </td>
                      <td style={{ padding: "5px 6px", textAlign: "right", color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {cov?.lastDate ? cov.lastDate.slice(0, 10) : "—"}
                      </td>
                      <td style={{ padding: "5px 6px", textAlign: "right", color: "rgba(255,255,255,0.20)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {cov?.barCount != null ? cov.barCount.toLocaleString("de-DE") : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
