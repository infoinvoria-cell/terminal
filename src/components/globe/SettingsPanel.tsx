"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import type { MonitoringLiveFeedRow, MonitoringLiveFeedResponse, MonitoringLiveFeedStatus } from "@/lib/monitoring/live-feed-types";
import type { AssetItem, OverlayToggleState } from "@/lib/globe/globe-types";

type PriceDirection = "up" | "down" | "flat" | "unknown";

type Props = {
  assets: AssetItem[];
  enabledSet?: Set<string>;
  categoryEnabled?: Record<string, boolean>;
  selectedAssetId: string;
  performanceMode?: boolean;
  goldThemeEnabled?: boolean;
  compactAssetLabels?: boolean;
  hideOverlayControls?: boolean;
  highlightedAssetIds?: string[];
  onSelectAsset: (assetId: string) => void;
  onToggleAsset?: (assetId: string) => void;
  onToggleCategory?: (category: string) => void;
  onAllOn?: () => void;
  onAllOff?: () => void;
  onRefreshData?: () => void;
  onAddSymbol?: (symbol: string) => void;
  overlayState?: OverlayToggleState;
  overlayLoadingState?: Partial<Record<keyof OverlayToggleState, boolean>>;
  onToggleOverlay?: (key: keyof OverlayToggleState) => void;
  prices?: Record<string, number>;
  changes?: Record<string, number>;
};

const FEED_TAB_ORDER = ["Agrar", "Metalle", "Energie", "Indizes", "FX", "Aktien", "Invest", "Anleihen"];
const SKIP_TABS = new Set(["White Swan Portfolio", "Core Invest", "Intraday MT"]);

function formatPrice(value: number | null, precision: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (precision != null && Number.isFinite(precision)) {
    return value.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
  }
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatChange(change: number | undefined): string {
  if (change == null || !Number.isFinite(change)) return "";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

function formatDelay(delaySeconds: number | null): string {
  if (delaySeconds == null || delaySeconds <= 0) return "LIVE";
  const minutes = Math.round(delaySeconds / 60);
  return `${minutes}m`;
}

function getPriceColor(status: MonitoringLiveFeedStatus, direction: PriceDirection): string {
  if (direction === "up") return "#f3f4f6";
  if (direction === "down") return "#c9a84c";
  if (status === "unavailable") return "rgba(255,255,255,0.3)";
  return "rgba(241,245,249,0.76)";
}

function FeedStatusBadge({ status, delaySeconds }: { status: MonitoringLiveFeedStatus; delaySeconds: number | null }) {
  if (status === "realtime") {
    return (
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: "rgba(255,255,255,0.28)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
        display: "inline-block",
      }} />
    );
  }
  if (status === "delayed") {
    return (
      <span
        title={`Delayed | ${formatDelay(delaySeconds)}`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 26, height: 14, padding: "0 5px", borderRadius: 999,
          background: "rgba(201,168,76,0.16)", color: "#c9a84c",
          fontSize: 7, fontWeight: 700, letterSpacing: "0.03em", fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDelay(delaySeconds)}
      </span>
    );
  }
  return (
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: status === "stale" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)",
      display: "inline-block",
    }} />
  );
}

function AssetIcon({ row }: { row: MonitoringLiveFeedRow }) {
  const url = getMonitoringAssetIconUrl({ code: row.ticker, name: row.name, source: row.source, displaySymbol: row.ticker });
  if (!url) {
    return (
      <span style={{
        width: 15, height: 15, borderRadius: 4, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.58)",
        fontSize: 8, fontWeight: 700, flexShrink: 0,
      }}>
        {row.ticker.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={15} height={15}
      style={{ width: 15, height: 15, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
    />
  );
}

export function SettingsPanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  changes,
}: Props) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [rows, setRows] = useState<MonitoringLiveFeedRow[]>([]);
  const [priceDirection, setPriceDirection] = useState<Record<string, PriceDirection>>({});
  const [canScrollMore, setCanScrollMore] = useState(false);
  const prevPricesRef = useRef<Record<string, number | null>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Polling live-feed every 30s
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/monitoring/live-feed", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const payload = (await res.json()) as MonitoringLiveFeedResponse;
        if (!mounted) return;

        const nextDirections: Record<string, PriceDirection> = {};
        for (const row of payload.items) {
          const prev = prevPricesRef.current[row.ticker];
          const next = row.price;
          if (prev == null || next == null) nextDirections[row.ticker] = "unknown";
          else if (next > prev) nextDirections[row.ticker] = "up";
          else if (next < prev) nextDirections[row.ticker] = "down";
          else nextDirections[row.ticker] = "flat";
          prevPricesRef.current[row.ticker] = next;
        }
        setRows(payload.items);
        setPriceDirection(nextDirections);
      } catch {
        // ignore
      }
      if (mounted) timer = setTimeout(load, 30_000);
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Scroll fade
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const syncFade = () => setCanScrollMore(node.scrollTop + node.clientHeight < node.scrollHeight - 2);
    syncFade();
    node.addEventListener("scroll", syncFade);
    const ro = new ResizeObserver(syncFade);
    ro.observe(node);
    return () => { node.removeEventListener("scroll", syncFade); ro.disconnect(); };
  }, [rows]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // symbol → asset map (for selection + changes lookup)
  const symbolToAsset = useMemo(() => {
    const map = new Map<string, AssetItem>();
    for (const a of assets) map.set(a.symbol.toUpperCase(), a);
    return map;
  }, [assets]);

  // id → change% map
  const changeBySymbol = useMemo(() => {
    if (!changes) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const asset of assets) {
      const pct = changes[asset.id];
      if (pct != null) map.set(asset.symbol.toUpperCase(), pct);
    }
    return map;
  }, [changes, assets]);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId), [assets, selectedAssetId]);

  // Grouped rows by tab, filtered by search
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, MonitoringLiveFeedRow[]>();

    for (const row of rows) {
      if (SKIP_TABS.has(row.tab)) continue;
      if (term) {
        const haystack = `${row.ticker} ${row.name}`.toLowerCase();
        if (!haystack.includes(term)) continue;
      }
      const bucket = map.get(row.tab) ?? [];
      bucket.push(row);
      map.set(row.tab, bucket);
    }

    const ordered: [string, MonitoringLiveFeedRow[]][] = [];
    for (const tab of FEED_TAB_ORDER) {
      const list = map.get(tab);
      if (list && list.length > 0) ordered.push([tab, list]);
    }
    for (const [tab, list] of map.entries()) {
      if (!FEED_TAB_ORDER.includes(tab) && list.length > 0) ordered.push([tab, list]);
    }
    return ordered;
  }, [rows, search]);

  const isEmpty = grouped.length === 0;

  // Grid: status | symbol+name | % | price
  const COL = "28px minmax(0,1fr) 42px 58px";

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      background: "linear-gradient(to bottom, #191a1f, #0d0e12)",
    }}>
      {/* ── Header row: Watchliste title + search toggle ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 12px 6px",
        flexShrink: 0,
        borderBottom: searchOpen ? "none" : "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#f5f7fa", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Watchliste
        </span>
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch(""); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 8,
            border: searchOpen ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)",
            background: searchOpen ? "rgba(255,255,255,0.08)" : "transparent",
            color: searchOpen ? "#f3f4f6" : "rgba(255,255,255,0.45)",
            cursor: "pointer", transition: "all 140ms ease",
          }}
        >
          <Search size={12} strokeWidth={2} />
        </button>
      </div>

      {/* ── Search input (shown when searchOpen) ── */}
      {searchOpen && (
        <div style={{ padding: "0 8px 6px", flexShrink: 0 }}>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            style={{
              width: "100%", height: 26,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "0 12px",
              fontSize: 11, color: "#f1f5f9",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* ── Column headers ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: COL,
        alignItems: "center",
        padding: "0 10px",
        height: 22,
        flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.3)",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
      }}>
        <span />
        <span>Symbol</span>
        <span style={{ textAlign: "right" }}>%</span>
        <span style={{ textAlign: "right" }}>Price</span>
      </div>

      {/* ── Scrollable list ── */}
      <div style={{ position: "relative", flex: "1 1 0", minHeight: 0 }}>
        <div
          ref={scrollRef}
          style={{
            position: "absolute", inset: 0,
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties}
        >
          {grouped.map(([tab, list]) => (
            <div key={tab}>
              {/* Section header */}
              <div style={{
                padding: "5px 10px 3px",
                fontSize: 9, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.02)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                userSelect: "none",
              }}>
                {tab}
              </div>

              {list.map((row) => {
                const direction = priceDirection[row.ticker] ?? "unknown";
                const asset = symbolToAsset.get(row.ticker.toUpperCase());
                const isSelected = selectedAsset?.symbol.toUpperCase() === row.ticker.toUpperCase();
                const changePct = changeBySymbol.get(row.ticker.toUpperCase());
                const changeStr = formatChange(changePct);
                const changePositive = changePct != null && changePct >= 0;

                return (
                  <button
                    key={row.instrumentId}
                    type="button"
                    onClick={() => { if (asset) onSelectAsset(asset.id); }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: COL,
                      gap: 6,
                      alignItems: "center",
                      width: "100%", height: 34,
                      padding: "0 10px",
                      background: isSelected ? "rgba(255,255,255,0.08)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.035)",
                      cursor: "pointer", textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                    title={row.name}
                  >
                    {/* Status badge */}
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FeedStatusBadge status={row.feedStatus} delaySeconds={row.delaySeconds} />
                    </span>

                    {/* Icon + ticker + name */}
                    <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <AssetIcon row={row} />
                      <span style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0, overflow: "hidden" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#f8fafc",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {row.ticker}
                        </span>
                        <span style={{
                          fontSize: 9, color: "rgba(255,255,255,0.38)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {row.name}
                        </span>
                      </span>
                    </span>

                    {/* % change */}
                    <span style={{
                      fontSize: 9, fontWeight: 600,
                      color: changeStr
                        ? changePositive ? "#6ee7b7" : "#c9a84c"
                        : "rgba(255,255,255,0.2)",
                      textAlign: "right", whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {changeStr || "—"}
                    </span>

                    {/* Price */}
                    <span style={{
                      fontSize: 11, fontVariantNumeric: "tabular-nums",
                      color: getPriceColor(row.feedStatus, direction),
                      textAlign: "right", whiteSpace: "nowrap",
                      transition: "color 180ms ease",
                    }}>
                      {formatPrice(row.price, row.pricePrecision)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {isEmpty && (
            <div style={{ padding: "16px 10px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
              {search.trim() ? `No results for "${search}"` : "Loading…"}
            </div>
          )}
        </div>

        {/* Bottom gradient fade */}
        {canScrollMore && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 34,
            background: "linear-gradient(180deg, rgba(13,14,18,0) 0%, rgba(13,14,18,0.96) 100%)",
            pointerEvents: "none",
          }} />
        )}
      </div>
    </div>
  );
}
