"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useClientMounted } from "@/hooks/use-client-mounted";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import type { AgriFinalStatusResponse, AgriLiveReadinessStatus } from "@/lib/monitoring/agriFinalStatusTypes";
import { loadMonitoringTradeEvents } from "@/lib/monitoring/loadMonitoringTradeEvents";

const MonitoringChart = dynamic(
  () => import("@/components/monitoring/MonitoringChart").then((m) => m.default ?? m),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface UniverseAsset {
  id: string;
  tab: string;
  name: string;
  symbol: string;
  short: string;
  source: string;
  timeframe: string;
}

interface OpenTrade {
  symbol: string;
  direction: string;
  entryPrice: number;
  entryTime?: string;
  strategyId?: string;
  pnl?: number;
  status?: string;
}

interface LiveState {
  openTrades: OpenTrade[];
  status?: string;
  updatedAt?: string;
}

interface ForwardLoggerSignal {
  id?: string;
  time?: string;
  symbol?: string;
  strategyId?: string;
  direction?: string;
  signal?: string;
  price?: number;
  entryPrice?: number;
  sl?: number;
  tp?: number;
  status?: string;
  tab?: string;
}

interface StrategyRegistryEntry {
  id?: string;
  name?: string;
  displayName?: string;
  tab?: string;
  status?: string;
  enabled?: boolean;
}

type Bar = { time: string; open: number; high: number; low: number; close: number };

// ── Tab config ────────────────────────────────────────────────────────────────

const TAB_ORDER = [
  "live",
  "all",
  "Agrar",
  "Metalle",
  "Energie",
  "Indizes",
  "Aktien",
  "Invest",
  "FX",
  "Anomaly",
  "Intraday MT",
];

const TAB_LABELS: Record<string, string> = {
  live: "Live",
  all: "All",
  "Agrar": "Agrar",
  "Metalle": "Metalle",
  "Energie": "Energie",
  "Indizes": "Indizes",
  "Aktien": "Aktien",
  "Invest": "Invest",
  "FX": "FX",
  "Anomaly": "Anomaly",
  "Intraday MT": "Intraday",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchBars(source: string, timeframe: string): Promise<Bar[]> {
  try {
    const apiTf = timeframe === "D" ? "D" : "30m";
    const res = await fetch(
      `/api/monitoring/ohlc?symbol=${encodeURIComponent(source)}&timeframe=${apiTf}&maxBars=320`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { bars?: Bar[] };
    return Array.isArray(json.bars) ? json.bars : [];
  } catch {
    return [];
  }
}

function makeChartData(asset: UniverseAsset, bars: Bar[]): MonitoringChartData {
  return {
    displaySymbol: asset.short || asset.symbol,
    displayName: asset.name,
    tvSymbol: asset.source,
    bars: bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    signals: [],
    boxes: [],
    variant: "compact",
    timeframe: asset.timeframe,
  };
}

function formatPrice(v: number): string {
  if (v >= 10000) return v.toFixed(0);
  if (v >= 1000) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(4);
}

// ── ChartCard ─────────────────────────────────────────────────────────────────

function ChartCard({
  label,
  timeframe,
  chartData,
  loading,
}: {
  label: string;
  timeframe: string;
  chartData: MonitoringChartData | null;
  loading: boolean;
}) {
  const mounted = useClientMounted();
  const lastClose = chartData?.bars.at(-1)?.close;
  const prevClose = chartData?.bars.at(-2)?.close;
  const change =
    lastClose != null && prevClose != null ? ((lastClose - prevClose) / prevClose) * 100 : null;
  const changeColor =
    change == null ? "rgba(255,255,255,0.3)" : change >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        height: "100%",
        background: "#0c0d10",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 26,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          flexShrink: 0,
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "50%",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginLeft: 2, flexShrink: 0 }}>
          {timeframe}
        </span>
        {lastClose != null && (
          <span
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.5)",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {formatPrice(lastClose)}
          </span>
        )}
        {change != null && (
          <span style={{ fontSize: 8.5, fontWeight: 600, color: changeColor, flexShrink: 0 }}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Chart body */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#080910" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            <div
              className="mm-pulse"
              style={{
                width: 60,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
              }}
            />
          </div>
        )}
        {!loading && !chartData && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>Keine Daten</span>
          </div>
        )}
        {mounted && chartData && (
          <MonitoringChart data={chartData} maxBars={280} initialVisibleBars={56} />
        )}
      </div>
    </div>
  );
}

// ── TradeCard ─────────────────────────────────────────────────────────────────

function TradeCard({ trade }: { trade: OpenTrade }) {
  const isLong = trade.direction?.toUpperCase() === "LONG";
  const badgeColor = isLong ? "#22c55e" : "#ef4444";
  const pnlColor =
    trade.pnl == null ? "rgba(255,255,255,0.4)" : trade.pnl >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            letterSpacing: "0.04em",
          }}
        >
          {trade.symbol}
        </div>
        {trade.strategyId && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
            {trade.strategyId}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: badgeColor,
            background: `${badgeColor}22`,
            border: `1px solid ${badgeColor}44`,
            borderRadius: 4,
            padding: "2px 6px",
            letterSpacing: "0.06em",
          }}
        >
          {trade.direction?.toUpperCase() ?? "—"}
        </span>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          {trade.entryPrice != null ? formatPrice(trade.entryPrice) : "—"}
        </div>
        {trade.pnl != null && (
          <div style={{ fontSize: 10, fontWeight: 600, color: pnlColor }}>
            {trade.pnl >= 0 ? "+" : ""}
            {trade.pnl.toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chart grid ────────────────────────────────────────────────────────────────

function ChartGrid({
  assets,
  tabId,
  cols,
  cardH,
  tabCache,
  tabLoading,
}: {
  assets: UniverseAsset[];
  tabId: string;
  cols: number;
  cardH: number;
  tabCache: Record<string, MonitoringChartData | null> | undefined;
  tabLoading: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "1px",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {assets.map((asset) => {
        const chartData = tabCache != null && asset.id in tabCache ? tabCache[asset.id]! : null;
        const isLoading = tabLoading && !(tabCache != null && asset.id in tabCache);
        return (
          <div key={`${tabId}-${asset.id}`} style={{ height: cardH, background: "#0c0d10" }}>
            <ChartCard
              label={asset.short || asset.symbol}
              timeframe={asset.timeframe}
              chartData={chartData}
              loading={isLoading}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileMonitoringView({
  initialAgriFinalStatus = null,
}: {
  initialAgriFinalStatus?: AgriFinalStatusResponse | null;
}) {
  const router = useRouter();
  const mounted = useClientMounted();

  // Universe state
  const [universe, setUniverse] = useState<UniverseAsset[]>([]);
  const [universeLoaded, setUniverseLoaded] = useState(false);

  // Live state
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [liveLoaded, setLiveLoaded] = useState(false);

  // Agri final status
  const [agriFinalStatus, setAgriFinalStatus] = useState<AgriFinalStatusResponse | null>(initialAgriFinalStatus);

  // Strategy registry
  const [strategyRegistry, setStrategyRegistry] = useState<Record<string, StrategyRegistryEntry>>({});

  // Forward logger signals (for live tab)
  const [forwardSignals, setForwardSignals] = useState<ForwardLoggerSignal[]>([]);

  // Signal events cache per asset (lazy loaded for visible tab)
  const signalCache = useRef<Record<string, NonNullable<MonitoringChartData["signals"]>>>({});

  // UI state
  const [activeTabId, setActiveTabId] = useState<string>("Agrar");
  const [singleCol, setSingleCol] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [tick, setTick] = useState(0);

  // Refs
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollTabRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const cache = useRef<Record<string, Record<string, MonitoringChartData | null>>>({});
  const loadingRef = useRef<Record<string, boolean>>({});
  const doneRef = useRef<Record<string, boolean>>({});

  // Load universe on mount
  useEffect(() => {
    fetch("/generated/monitoring/config/monitoring_asset_universe.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        if (!Array.isArray(raw)) return;
        // Structure: [metaObject, assetsArray]
        const assetsArr = raw[1];
        if (Array.isArray(assetsArr)) {
          setUniverse(assetsArr as UniverseAsset[]);
        }
        setUniverseLoaded(true);
      })
      .catch(() => setUniverseLoaded(true));
  }, []);

  // Load live state on mount
  useEffect(() => {
    fetch("/api/monitoring/live-state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (d && typeof d === "object") {
          const ls = d as Record<string, unknown>;
          setLiveState({
            openTrades: Array.isArray(ls.openTrades) ? (ls.openTrades as OpenTrade[]) : [],
            status: typeof ls.status === "string" ? ls.status : undefined,
            updatedAt: typeof ls.updatedAt === "string" ? ls.updatedAt : undefined,
          });
        }
        setLiveLoaded(true);
      })
      .catch(() => setLiveLoaded(true));
  }, []);

  // Refresh agri final status from API (keeps it fresh after SSR seed)
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/monitoring/agri-final-status", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (d && typeof d === "object") setAgriFinalStatus(d as AgriFinalStatusResponse);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Fetch strategy registry once on mount
  useEffect(() => {
    fetch("/api/monitoring/strategy-registry", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (d && typeof d === "object" && !Array.isArray(d)) {
          setStrategyRegistry(d as Record<string, StrategyRegistryEntry>);
        } else if (Array.isArray(d)) {
          // Registry might be an array
          const map: Record<string, StrategyRegistryEntry> = {};
          (d as StrategyRegistryEntry[]).forEach((entry) => {
            if (entry.id) map[entry.id] = entry;
          });
          setStrategyRegistry(map);
        }
      })
      .catch(() => {});
  }, []);

  // Poll forward-logger every 5 seconds
  useEffect(() => {
    const fetchSignals = () => {
      fetch("/api/monitoring/forward-logger", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: unknown) => {
          if (d && typeof d === "object") {
            const payload = d as Record<string, unknown>;
            const signals = Array.isArray(payload.signals)
              ? (payload.signals as ForwardLoggerSignal[])
              : Array.isArray(payload.events)
                ? (payload.events as ForwardLoggerSignal[])
                : Array.isArray(d)
                  ? (d as ForwardLoggerSignal[])
                  : [];
            setForwardSignals(signals);
          }
        })
        .catch(() => {});
    };
    fetchSignals();
    const interval = setInterval(fetchSignals, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Derive tabs from universe + fixed
  const tabs = TAB_ORDER; // fixed order

  // Assets per tab
  const getTabAssets = useCallback(
    (tabId: string): UniverseAsset[] => {
      if (tabId === "live" || tabId === "all") return [];
      return universe.filter((a) => a.tab === tabId);
    },
    [universe]
  );

  const getAllAssets = useCallback((): UniverseAsset[] => universe, [universe]);

  // Live tab chart assets (open trade symbols matched to universe)
  const liveChartAssets = useCallback((): UniverseAsset[] => {
    if (!liveState?.openTrades?.length) return [];
    const openSymbols = new Set(liveState.openTrades.map((t) => t.symbol.toUpperCase()));
    const seen = new Set<string>();
    return universe.filter((a) => {
      const key = a.symbol.toUpperCase();
      if (openSymbols.has(key) && !seen.has(a.id)) {
        seen.add(a.id);
        return true;
      }
      return false;
    });
  }, [liveState, universe]);

  // Load assets for a tab (with signal markers for the active tab)
  const loadTab = useCallback(
    async (tabId: string, assets: UniverseAsset[]) => {
      if (loadingRef.current[tabId]) return;
      if (doneRef.current[tabId]) return;
      if (assets.length === 0) return;

      loadingRef.current[tabId] = true;
      cache.current[tabId] = {};
      setTick((v) => v + 1);

      await Promise.all(
        assets.map(async (asset) => {
          const bars = await fetchBars(asset.source, asset.timeframe);
          if (bars.length === 0) {
            cache.current[tabId]![asset.id] = null;
            setTick((v) => v + 1);
            return;
          }

          // Load signal events (lazy — only for current tab assets)
          let signals: MonitoringChartData["signals"] = [];
          if (!(asset.id in signalCache.current)) {
            try {
              const evResult = await loadMonitoringTradeEvents({ symbol: asset.symbol, source: asset.source });
              if (evResult.ok && evResult.signalEvents.length) {
                signals = evResult.signalEvents.map((ev) => ({
                  time: ev.time,
                  type: ev.type as string,
                  price: ev.price ?? null,
                  direction: ev.direction ?? null,
                }));
              } else if (evResult.ok && evResult.events.length) {
                signals = evResult.events.map((ev) => ({
                  time: ev.time,
                  type: ev.type as string,
                  price: ev.price ?? null,
                  direction: null,
                }));
              }
            } catch {
              // signals unavailable — silently skip
            }
            signalCache.current[asset.id] = signals;
          } else {
            signals = signalCache.current[asset.id]!;
          }

          const chartData = makeChartData(asset, bars);
          chartData.signals = signals;
          cache.current[tabId]![asset.id] = chartData;
          setTick((v) => v + 1);
        })
      );

      loadingRef.current[tabId] = false;
      doneRef.current[tabId] = true;
      setTick((v) => v + 1);
    },
    []
  );

  // Trigger load when active tab changes (and universe is ready)
  useEffect(() => {
    if (!universeLoaded) return;
    if (activeTabId === "live") {
      const assets = liveChartAssets();
      if (assets.length > 0) void loadTab("live", assets);
    } else if (activeTabId === "all") {
      const assets = getAllAssets();
      if (assets.length > 0) void loadTab("all", assets);
    } else {
      const assets = getTabAssets(activeTabId);
      if (assets.length > 0) void loadTab(activeTabId, assets);
    }
  }, [activeTabId, universeLoaded, loadTab, getTabAssets, getAllAssets, liveChartAssets]);

  // Re-trigger live chart load when live state arrives
  useEffect(() => {
    if (!universeLoaded || !liveLoaded) return;
    if (activeTabId === "live") {
      const assets = liveChartAssets();
      if (assets.length > 0 && !doneRef.current["live"] && !loadingRef.current["live"]) {
        void loadTab("live", assets);
      }
    }
  }, [liveLoaded, universeLoaded, activeTabId, liveChartAssets, loadTab]);

  // Tab index helpers
  const activeIdx = tabs.indexOf(activeTabId);

  const goToTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      programmatic.current = true;
      const idx = TAB_ORDER.indexOf(tabId);
      if (panelRef.current) {
        panelRef.current.scrollTo({ left: idx * panelRef.current.offsetWidth, behavior: "smooth" });
      }
      // Scroll tab button into view
      const fixedCount = 2; // Live + All
      const scrollableIdx = idx - fixedCount;
      if (scrollableIdx >= 0 && scrollTabRef.current) {
        const btn = scrollTabRef.current.children[scrollableIdx] as HTMLElement | undefined;
        btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    },
    []
  );

  const onPanelScroll = useCallback(() => {
    if (programmatic.current) return;
    const el = panelRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    if (idx >= 0 && idx < TAB_ORDER.length) {
      const tabId = TAB_ORDER[idx]!;
      if (tabId !== activeTabId) {
        setActiveTabId(tabId);
        const fixedCount = 2;
        const scrollableIdx = idx - fixedCount;
        if (scrollableIdx >= 0 && scrollTabRef.current) {
          const btn = scrollTabRef.current.children[scrollableIdx] as HTMLElement | undefined;
          btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    }
  }, [activeTabId]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const clear = () => { programmatic.current = false; };
    el.addEventListener("scrollend", clear);
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => { clearTimeout(t); t = setTimeout(clear, 350); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scrollend", clear);
      el.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, []);

  // Init scroll position to default tab (Agrar = index 2)
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const defaultIdx = TAB_ORDER.indexOf("Agrar");
    el.scrollLeft = defaultIdx * el.offsetWidth;
  }, []);

  void tick; // consumed by render

  const cols = singleCol ? 1 : 2;
  const cardH = singleCol ? 260 : 160;
  const openTradeCount = liveState?.openTrades?.length ?? 0;

  // ── Toolbar button style ──
  const tbBtn: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "6px 2px",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };

  // ── Tab button renderer ──
  const fixedTabIds = ["live", "all"];
  const scrollTabIds = TAB_ORDER.slice(2);

  function TabBtn({ tabId, small }: { tabId: string; small?: boolean }) {
    const isActive = activeTabId === tabId;
    return (
      <button
        key={tabId}
        onClick={() => goToTab(tabId)}
        style={{
          flexShrink: 0,
          padding: small ? "5px 10px" : "5px 14px",
          background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
          border: "none",
          borderRadius: 6,
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.38)",
          fontSize: small ? 11 : 12,
          fontWeight: isActive ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
          letterSpacing: "0.01em",
          WebkitTapHighlightColor: "transparent",
          position: "relative",
        } as React.CSSProperties}
      >
        {TAB_LABELS[tabId] ?? tabId}
        {tabId === "live" && openTradeCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "#22c55e",
              color: "#000",
              fontSize: 7,
              fontWeight: 700,
              borderRadius: 99,
              minWidth: 12,
              height: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            {openTradeCount}
          </span>
        )}
      </button>
    );
  }

  // ── Live tab content ──
  function LiveTabContent() {
    const trades = liveState?.openTrades ?? [];
    const updatedAt = liveState?.updatedAt
      ? new Date(liveState.updatedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : null;
    const liveAssets = liveChartAssets();
    const liveTabCache = cache.current["live"];
    const liveTabLoading = loadingRef.current["live"] ?? false;

    // Forward logger signals that are open/recent
    const activeForwardSignals = forwardSignals.filter(
      (s) => s.signal && s.signal !== "NONE" && s.signal !== "EXIT"
    );

    return (
      <div className="mm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {/* Status bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ color: "#22c55e", fontSize: 10 }}>●</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
            {trades.length} Offen
            {updatedAt ? ` · Aktualisiert ${updatedAt}` : ""}
          </span>
          {activeForwardSignals.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#e2ca7a", fontWeight: 600 }}>
              {activeForwardSignals.length} Signal{activeForwardSignals.length !== 1 ? "e" : ""}
            </span>
          )}
        </div>

        {/* Forward logger signals */}
        {activeForwardSignals.length > 0 && (
          <div style={{ padding: "8px 10px 4px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Live-Signale
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeForwardSignals.slice(0, 8).map((sig, i) => {
                const isLong = String(sig.signal ?? sig.direction ?? "").toUpperCase() === "LONG";
                const badgeColor = isLong ? "#22c55e" : "#ef4444";
                return (
                  <div
                    key={`sig-${i}`}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: badgeColor,
                        background: `${badgeColor}22`,
                        border: `1px solid ${badgeColor}44`,
                        borderRadius: 3,
                        padding: "1px 5px",
                      }}
                    >
                      {(sig.signal ?? sig.direction ?? "—").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                      {sig.symbol ?? "—"}
                    </span>
                    {sig.price != null && (
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
                        {formatPrice(sig.price)}
                      </span>
                    )}
                    {sig.strategyId && (
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>
                        {sig.strategyId}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trade cards */}
        {!liveLoaded ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
            }}
          >
            <div
              className="mm-pulse"
              style={{
                width: 80,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
              }}
            />
          </div>
        ) : trades.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "rgba(255,255,255,0.22)",
              fontSize: 12,
            }}
          >
            Keine offenen Positionen
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 10px 6px" }}>
            {trades.map((trade, i) => (
              <TradeCard key={`${trade.symbol}-${i}`} trade={trade} />
            ))}
          </div>
        )}

        {/* Chart grid for open trade symbols */}
        {liveAssets.length > 0 && (
          <>
            <div
              style={{
                padding: "8px 12px 4px",
                fontSize: 9,
                color: "rgba(255,255,255,0.25)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Charts
            </div>
            <ChartGrid
              assets={liveAssets}
              tabId="live"
              cols={cols}
              cardH={cardH}
              tabCache={liveTabCache}
              tabLoading={liveTabLoading}
            />
          </>
        )}
      </div>
    );
  }

  // ── Agri status mini-panel ──
  function AgriStatusSection() {
    if (!agriFinalStatus) return null;
    const assetEntries = Object.entries(agriFinalStatus.assets ?? {});
    if (!assetEntries.length) return null;

    const readinessColor = (status: AgriLiveReadinessStatus): string => {
      if (status === "READY") return "#22c55e";
      if (status === "PROVISIONAL_ONLY") return "#e2ca7a";
      return "#ef4444";
    };

    const dataStatusColor = (s: string): string => {
      if (s === "fresh") return "#22c55e";
      if (s === "provisional") return "#e2ca7a";
      return "#ef4444";
    };

    const readyCount = assetEntries.filter(([, a]) => a.liveReadiness.status === "READY").length;
    const provisionalCount = assetEntries.filter(([, a]) => a.liveReadiness.status === "PROVISIONAL_ONLY").length;
    const blockedCount = assetEntries.length - readyCount - provisionalCount;

    return (
      <div
        style={{
          margin: "8px 10px 4px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Agri Final Status
          </span>
          <span style={{ fontSize: 8, color: "#22c55e", marginLeft: 2 }}>{readyCount} Ready</span>
          {provisionalCount > 0 && <span style={{ fontSize: 8, color: "#e2ca7a" }}>{provisionalCount} Prov.</span>}
          {blockedCount > 0 && <span style={{ fontSize: 8, color: "#ef4444" }}>{blockedCount} Blocked</span>}
          {agriFinalStatus.autoUpdate?.refreshLoopActive && (
            <span style={{ marginLeft: "auto", fontSize: 8, color: "#22c55e" }}>● Auto-Refresh</span>
          )}
        </div>
        {/* Asset rows */}
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {assetEntries.map(([symbol, asset]) => {
            const rc = readinessColor(asset.liveReadiness.status);
            const dc = dataStatusColor(asset.dataHealth.overallStatus);
            const strategyName = strategyRegistry[symbol]?.displayName ?? strategyRegistry[symbol]?.name;
            return (
              <div
                key={symbol}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 10px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 9, color: rc, flexShrink: 0 }}>●</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.displayName}
                  </div>
                  {strategyName && (
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{strategyName}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 8, color: dc }}>{asset.dataHealth.overallStatus}</span>
                  {asset.dataHealth.lastBarDate && (
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{asset.dataHealth.lastBarDate.slice(0, 10)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Render a standard tab content ──
  function TabContent({ tabId }: { tabId: string }) {
    let assets: UniverseAsset[];
    if (tabId === "all") {
      assets = getAllAssets();
    } else {
      assets = getTabAssets(tabId);
    }

    const tabCache = cache.current[tabId];
    const tabLoading = loadingRef.current[tabId] ?? false;

    if (!universeLoaded) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <div
            className="mm-pulse"
            style={{
              width: 80,
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
            }}
          />
        </div>
      );
    }

    if (assets.length === 0 && tabId !== "Agrar") {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.22)",
            fontSize: 12,
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 22, opacity: 0.3 }}>⊞</span>
          <span>Keine Assets</span>
        </div>
      );
    }

    return (
      <div className="mm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {tabId === "Agrar" && <AgriStatusSection />}
        {assets.length > 0 && (
          <ChartGrid
            assets={assets}
            tabId={tabId}
            cols={cols}
            cardH={cardH}
            tabCache={tabCache}
            tabLoading={tabLoading}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes mm-pulse { 0%,100%{opacity:.2} 50%{opacity:.7} }
        .mm-pulse { animation: mm-pulse 2s ease-in-out infinite; }
        .mm-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#0c0d10",
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "8px 0 6px",
            position: "relative",
          }}
        >
          {/* Fixed tabs: Live + All */}
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: "0 4px 0 10px",
              flexShrink: 0,
              position: "relative",
              zIndex: 2,
              background: "#0c0d10",
            }}
          >
            {fixedTabIds.map((tabId) => (
              <TabBtn key={tabId} tabId={tabId} />
            ))}
            <div
              style={{
                position: "absolute",
                right: -20,
                top: 0,
                bottom: 0,
                width: 20,
                background: "linear-gradient(90deg, #0c0d10 30%, transparent)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          </div>
          {/* Scrollable tabs */}
          <div
            ref={scrollTabRef}
            className="mm-scroll"
            style={{
              flex: 1,
              display: "flex",
              overflowX: "auto",
              gap: 2,
              padding: "0 10px 0 8px",
              scrollbarWidth: "none",
            } as React.CSSProperties}
          >
            {scrollTabIds.map((tabId) => (
              <TabBtn key={tabId} tabId={tabId} small />
            ))}
          </div>
        </div>

        {/* Swipeable panels */}
        <div
          ref={panelRef}
          className="mm-scroll"
          onScroll={onPanelScroll}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
        >
          {TAB_ORDER.map((tabId) => (
            <div
              key={tabId}
              style={{
                width: "100%",
                height: "100%",
                flexShrink: 0,
                scrollSnapAlign: "start",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {tabId === "live" ? (
                mounted ? <LiveTabContent /> : null
              ) : (
                <TabContent tabId={tabId} />
              )}
            </div>
          ))}
        </div>

        {/* Toolbar: Refresh | Tester | Format | Live | Settings */}
        <div
          style={{
            flexShrink: 0,
            height: 48,
            display: "flex",
            padding: "0 2px",
            background: "#0c0d10",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            gap: 1,
            alignItems: "stretch",
          }}
        >
          {/* Refresh */}
          <button
            onClick={() => {
              setRefreshSpin(true);
              cache.current = {};
              loadingRef.current = {};
              doneRef.current = {};
              setTick((v) => v + 1);
              setTimeout(() => setRefreshSpin(false), 700);
            }}
            style={tbBtn}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                display: "block",
                transform: refreshSpin ? "rotate(360deg)" : "none",
                transition: refreshSpin ? "transform 0.7s linear" : "none",
              } as React.CSSProperties}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Refresh</span>
          </button>

          {/* Tester */}
          <button onClick={() => router.push("/monitoring")} style={tbBtn}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Tester</span>
          </button>

          {/* Format */}
          <button
            onClick={() => setSingleCol((v) => !v)}
            style={{ ...tbBtn, color: singleCol ? "#d8bc67" : "rgba(255,255,255,0.45)" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {singleCol ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                </>
              ) : (
                <>
                  <rect x="3" y="3" width="7" height="18" rx="1" />
                  <rect x="14" y="3" width="7" height="18" rx="1" />
                </>
              )}
            </svg>
            <span>Format</span>
          </button>

          {/* Live */}
          <button onClick={() => goToTab("live")} style={tbBtn}>
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
              </svg>
              {openTradeCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -7,
                    background: "#22c55e",
                    color: "#000",
                    fontSize: 7,
                    fontWeight: 700,
                    borderRadius: 99,
                    minWidth: 13,
                    height: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  {openTradeCount}
                </span>
              )}
            </span>
            <span>Live</span>
          </button>

          {/* Settings */}
          <button onClick={() => {}} style={tbBtn}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </>
  );
}
