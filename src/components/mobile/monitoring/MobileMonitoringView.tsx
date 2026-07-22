"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useClientMounted } from "@/hooks/use-client-mounted";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

const MonitoringChart = dynamic(
  () => import("@/components/monitoring/MonitoringChart").then((m) => m.default ?? m),
  { ssr: false }
);

// ── Tab definitions ──────────────────────────────────────────────────────────

const FIXED_TABS = [
  { id: "live",  label: "Live",    assets: [] as string[], timeframe: "D" },
  { id: "all",   label: "All",     assets: [] as string[], timeframe: "D" },
];

const SCROLL_TABS = [
  { id: "agrar",           label: "Agrar",    timeframe: "D",   assets: ["ZW1!", "ZC1!", "ZS1!", "CC1!", "KC1!", "SB1!", "CT1!", "OJ1!"] },
  { id: "metalle_energie", label: "Metalle",  timeframe: "D",   assets: ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!", "CL1!", "NG1!", "RB1!"] },
  { id: "indizes",         label: "Indizes",  timeframe: "D",   assets: ["FDAX1!", "ES1!", "YM1!", "NQ1!", "UKX!"] },
  { id: "aktien",          label: "Aktien",   timeframe: "D",   assets: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"] },
  { id: "invest",          label: "Invest",   timeframe: "D",   assets: ["SPY", "QQQ", "SPMO", "GLD", "HG1!", "6S1!"] },
  { id: "fx",              label: "FX",       timeframe: "D",   assets: ["EURGBP", "GBPJPY", "MXNUSD", "NOKUSD", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD"] },
  { id: "anomaly",         label: "Anomaly",  timeframe: "D",   assets: ["GC1!", "GLD", "YM1!", "FDAX1!"] },
  { id: "intraday",        label: "Intraday", timeframe: "30m", assets: ["DE30EUR_2H", "DE30EUR_1H", "EURUSD_30M", "GBPUSD_30M"] },
];

const ALL_TABS = [...FIXED_TABS, ...SCROLL_TABS];
const DEFAULT_IDX = FIXED_TABS.length; // Agrar

// ── Fetch one asset's OHLC bars ───────────────────────────────────────────────

type Bar = { time: string; open: number; high: number; low: number; close: number };

async function fetchBars(symbol: string, timeframe: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&maxBars=320`);
    if (!res.ok) return [];
    const json = await res.json() as { bars?: Bar[] };
    return Array.isArray(json.bars) ? json.bars : [];
  } catch {
    return [];
  }
}

function barsToCandleData(bars: Bar[]): MonitoringChartData["bars"] {
  return bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
}

function displayLabel(code: string): string {
  return code.replace("1!", "").replace(/_\d+[MH]$/, "").replace(/_2H$|_1H$|_30M$/i, "");
}

// ── Single chart card ─────────────────────────────────────────────────────────

function ChartCard({ symbol, timeframe, chartData, loading }: {
  symbol: string;
  timeframe: string;
  chartData: MonitoringChartData | null;
  loading: boolean;
}) {
  const mounted = useClientMounted();
  const lastClose = chartData?.bars.at(-1)?.close;
  const prevClose = chartData?.bars.at(-2)?.close;
  const change = lastClose != null && prevClose != null ? ((lastClose - prevClose) / prevClose) * 100 : null;
  const changeColor = change == null ? "rgba(255,255,255,0.3)" : change >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div style={{ background: "#0c0d10", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Header */}
      <div style={{ height: 26, display: "flex", alignItems: "center", padding: "0 8px", flexShrink: 0, gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {displayLabel(symbol)}
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginLeft: 2 }}>{timeframe}</span>
        {lastClose != null && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>
            {lastClose >= 1000 ? lastClose.toFixed(0) : lastClose >= 10 ? lastClose.toFixed(2) : lastClose.toFixed(4)}
          </span>
        )}
        {change != null && (
          <span style={{ fontSize: 8.5, fontWeight: 600, color: changeColor }}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Chart body */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#080910" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <div className="mm-pulse" style={{ width: 60, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />
          </div>
        )}
        {!loading && !chartData && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>Keine Daten</span>
          </div>
        )}
        {mounted && chartData && (
          <MonitoringChart
            data={chartData}
            maxBars={280}
            initialVisibleBars={56}
          />
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileMonitoringView() {
  const [activeIdx, setActiveIdx] = useState(DEFAULT_IDX);
  const panelRef     = useRef<HTMLDivElement>(null);
  const scrollTabRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  // chart data cache: tabId → { symbol → chartData | null }
  const cache = useRef<Record<string, Record<string, MonitoringChartData | null>>>({});
  const loadingRef = useRef<Record<string, boolean>>({});
  const [tabDataVersion, setTabDataVersion] = useState(0); // triggers re-render

  const activeTab = ALL_TABS[activeIdx]!;

  // Load all assets for a tab
  const loadTab = useCallback(async (tabId: string, assets: string[], timeframe: string) => {
    if (loadingRef.current[tabId]) return;
    if (cache.current[tabId]) return; // already loaded
    loadingRef.current[tabId] = true;
    cache.current[tabId] = {};
    setTabDataVersion(v => v + 1);

    await Promise.all(
      assets.map(async (symbol) => {
        const bars = await fetchBars(symbol, timeframe);
        const chartData: MonitoringChartData = {
          displaySymbol: displayLabel(symbol),
          displayName: symbol,
          tvSymbol: symbol,
          bars: barsToCandleData(bars),
          signals: [],
          boxes: [],
          variant: "compact",
          timeframe,
        };
        cache.current[tabId]![symbol] = bars.length > 0 ? chartData : null;
        setTabDataVersion(v => v + 1);
      })
    );
    loadingRef.current[tabId] = false;
  }, []);

  // Trigger load when active tab changes
  useEffect(() => {
    if (activeTab.assets.length > 0) {
      void loadTab(activeTab.id, activeTab.assets, activeTab.timeframe);
    }
  }, [activeTab.id, activeTab.assets, activeTab.timeframe, loadTab]);

  const goToTab = useCallback((idx: number) => {
    setActiveIdx(idx);
    programmatic.current = true;
    if (panelRef.current) {
      panelRef.current.scrollTo({ left: idx * panelRef.current.offsetWidth, behavior: "smooth" });
    }
    const scrollableIdx = idx - FIXED_TABS.length;
    if (scrollableIdx >= 0 && scrollTabRef.current) {
      const btn = scrollTabRef.current.children[scrollableIdx] as HTMLElement | undefined;
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  const onPanelScroll = useCallback(() => {
    if (programmatic.current) return;
    const el = panelRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    if (idx >= 0 && idx < ALL_TABS.length && idx !== activeIdx) {
      setActiveIdx(idx);
      const scrollableIdx = idx - FIXED_TABS.length;
      if (scrollableIdx >= 0 && scrollTabRef.current) {
        const btn = scrollTabRef.current.children[scrollableIdx] as HTMLElement | undefined;
        btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeIdx]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const clear = () => { programmatic.current = false; };
    el.addEventListener("scrollend", clear);
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => { clearTimeout(t); t = setTimeout(clear, 350); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scrollend", clear); el.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.scrollLeft = DEFAULT_IDX * el.offsetWidth;
  }, []);

  const tabBtn = (tab: { id: string; label: string }, idx: number, small?: boolean) => {
    const isActive = activeIdx === idx;
    return (
      <button
        key={tab.id}
        onClick={() => goToTab(idx)}
        style={{
          flexShrink: 0, padding: small ? "5px 10px" : "5px 14px",
          background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
          border: "none", borderRadius: 6,
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.38)",
          fontSize: small ? 11 : 12, fontWeight: isActive ? 600 : 400,
          cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "0.01em",
          WebkitTapHighlightColor: "transparent",
        } as React.CSSProperties}
      >
        {tab.label}
      </button>
    );
  };

  // void usage to suppress lint warning
  void tabDataVersion;

  return (
    <>
      <style>{`
        @keyframes mm-pulse { 0%,100%{opacity:.2} 50%{opacity:.7} }
        .mm-pulse { animation: mm-pulse 2s ease-in-out infinite; }
        .mm-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>

        {/* Tab bar */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "8px 0 6px", position: "relative" }}>
          <div style={{ display: "flex", gap: 2, padding: "0 4px 0 10px", flexShrink: 0, position: "relative", zIndex: 2, background: "#0c0d10" }}>
            {FIXED_TABS.map((tab, i) => tabBtn(tab, i))}
            <div style={{ position: "absolute", right: -20, top: 0, bottom: 0, width: 20, background: "linear-gradient(90deg, #0c0d10 30%, transparent)", pointerEvents: "none", zIndex: 1 }} />
          </div>
          <div ref={scrollTabRef} className="mm-scroll" style={{ flex: 1, display: "flex", overflowX: "auto", gap: 2, padding: "0 10px 0 8px", scrollbarWidth: "none" } as React.CSSProperties}>
            {SCROLL_TABS.map((tab, i) => tabBtn(tab, i + FIXED_TABS.length, true))}
          </div>
        </div>

        {/* Swipeable panels */}
        <div
          ref={panelRef}
          className="mm-scroll"
          onScroll={onPanelScroll}
          style={{ flex: 1, minHeight: 0, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {ALL_TABS.map((tab) => {
            const tabCache = cache.current[tab.id];
            const tabLoading = loadingRef.current[tab.id] ?? false;

            return (
              <div
                key={tab.id}
                style={{ width: "100%", height: "100%", flexShrink: 0, scrollSnapAlign: "start", overflow: "hidden", display: "flex", flexDirection: "column" }}
              >
                {tab.assets.length === 0 ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.22)", fontSize: 13, flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 28, opacity: 0.3 }}>{tab.id === "live" ? "●" : "⊞"}</span>
                    <span>{tab.id === "live" ? "Live-Signale" : "Alle Strategien"}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>In Entwicklung</span>
                  </div>
                ) : (
                  <div
                    className="mm-scroll"
                    style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
                  >
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "1px",
                      background: "rgba(255,255,255,0.05)",
                    }}>
                      {tab.assets.map(symbol => {
                        const chartData = tabCache?.[symbol] ?? null;
                        const isLoading = tabLoading && !tabCache?.[symbol];
                        return (
                          <div key={symbol} style={{ height: 180, background: "#0c0d10" }}>
                            <ChartCard
                              symbol={symbol}
                              timeframe={tab.timeframe}
                              chartData={chartData}
                              loading={isLoading}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={{ flexShrink: 0, display: "flex", padding: "6px 6px 8px", background: "#0c0d10", borderTop: "1px solid rgba(255,255,255,0.06)", gap: 2 }}>
          {[
            { label: "Refresh", icon: "↺", onPress: () => { cache.current = {}; loadingRef.current = {}; setTabDataVersion(v => v + 1); } },
            { label: "Live",    icon: "●", onPress: () => {} },
          ].map(({ label, icon, onPress }) => (
            <button key={label} onClick={onPress} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 2px", background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 9, cursor: "pointer", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
