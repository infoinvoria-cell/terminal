"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <div style={{ height: "100%", background: "#0c0d10", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
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
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(DEFAULT_IDX);
  const [openTrades, setOpenTrades] = useState<number | null>(null);
  const [singleCol, setSingleCol] = useState(false); // Format toggle: 2-col ↔ 1-col
  const [refreshSpin, setRefreshSpin] = useState(false);
  const panelRef     = useRef<HTMLDivElement>(null);
  const scrollTabRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  // Fetch live state once on mount
  useEffect(() => {
    fetch("/api/monitoring/live-state")
      .then(r => r.ok ? r.json() : null)
      .then((d: { openTrades?: number } | null) => { if (d?.openTrades != null) setOpenTrades(d.openTrades); })
      .catch(() => {});
  }, []);

  // chart data cache: tabId → { symbol → chartData | null }
  const cache   = useRef<Record<string, Record<string, MonitoringChartData | null>>>({});
  const loadingRef = useRef<Record<string, boolean>>({});
  const doneRef    = useRef<Record<string, boolean>>({});
  const [tick, setTick] = useState(0); // force re-render

  const activeTab = ALL_TABS[activeIdx]!;

  // Load all assets for a tab
  const loadTab = useCallback(async (tabId: string, assets: string[], timeframe: string) => {
    if (loadingRef.current[tabId]) return;
    if (doneRef.current[tabId]) return;
    loadingRef.current[tabId] = true;
    cache.current[tabId] = {};
    setTick(v => v + 1); // show loading state

    await Promise.all(
      assets.map(async (symbol) => {
        const bars = await fetchBars(symbol, timeframe);
        const cd: MonitoringChartData = {
          displaySymbol: displayLabel(symbol),
          displayName:   symbol,
          tvSymbol:      symbol,
          bars:          barsToCandleData(bars),
          signals: [], boxes: [],
          variant: "compact",
          timeframe,
        };
        cache.current[tabId]![symbol] = bars.length > 0 ? cd : null;
        setTick(v => v + 1); // progressive reveal
      })
    );

    loadingRef.current[tabId] = false;
    doneRef.current[tabId]    = true;
    setTick(v => v + 1); // final render: loading=false
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

  void tick; // consumed by render

  const tbBtn: React.CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 2px", background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 9, cursor: "pointer", WebkitTapHighlightColor: "transparent" };

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
            const tabCache  = cache.current[tab.id];
            const tabLoading = loadingRef.current[tab.id] ?? false;
            const cols = singleCol ? 1 : 2;
            const cardH = singleCol ? 260 : 180;

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
                  <div className="mm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
                      gap: "1px",
                      background: "rgba(255,255,255,0.05)",
                    }}>
                      {tab.assets.map(symbol => {
                        const chartData = tabCache?.[symbol] ?? null;
                        // isLoading: only while tab is still fetching AND this symbol result not yet received
                        const isLoading = tabLoading && !(tabCache != null && symbol in tabCache);
                        return (
                          <div key={symbol} style={{ height: cardH, background: "#0c0d10" }}>
                            <ChartCard symbol={symbol} timeframe={tab.timeframe} chartData={chartData} loading={isLoading} />
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

        {/* Toolbar: Refresh | Tester | Format | Live | Settings */}
        <div style={{ flexShrink: 0, display: "flex", padding: "6px 2px 8px", background: "#0c0d10", borderTop: "1px solid rgba(255,255,255,0.07)", gap: 1 }}>

          {/* Refresh */}
          <button onClick={() => {
            setRefreshSpin(true);
            cache.current = {}; loadingRef.current = {}; doneRef.current = {};
            setTick(v => v + 1);
            setTimeout(() => setRefreshSpin(false), 700);
          }} style={tbBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: "block", transform: refreshSpin ? "rotate(360deg)" : "none", transition: refreshSpin ? "transform 0.7s linear" : "none" } as React.CSSProperties}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            <span>Refresh</span>
          </button>

          {/* Tester — opens desktop monitoring page */}
          <button onClick={() => router.push("/monitoring")} style={tbBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span>Tester</span>
          </button>

          {/* Format — toggle 1-col / 2-col */}
          <button onClick={() => setSingleCol(v => !v)} style={{ ...tbBtn, color: singleCol ? "#d8bc67" : "rgba(255,255,255,0.45)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {singleCol
                ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></>
                : <><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></>
              }
            </svg>
            <span>Format</span>
          </button>

          {/* Live — show open-trades badge */}
          <button onClick={() => goToTab(0)} style={tbBtn}>
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
                <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
              </svg>
              {openTrades != null && openTrades > 0 && (
                <span style={{ position: "absolute", top: -5, right: -7, background: "#22c55e", color: "#000", fontSize: 7, fontWeight: 700, borderRadius: 99, minWidth: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", lineHeight: 1 }}>{openTrades}</span>
              )}
            </span>
            <span>Live</span>
          </button>

          {/* Settings */}
          <button onClick={() => {}} style={tbBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>Settings</span>
          </button>

        </div>
      </div>
    </>
  );
}
