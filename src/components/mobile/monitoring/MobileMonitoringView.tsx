"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ── OHLC cache (module-level, persists across re-renders) ─────────────────────
type OhlcBar = { time: string; open: number; high: number; low: number; close: number };
type CacheEntry = { bars: OhlcBar[]; ts: number };
const OHLC_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

// Display name map for chart headers
const DISPLAY_NAME: Record<string, string> = {
  "ZW1!": "Wheat",   "ZC1!": "Corn",    "ZS1!": "Soybeans", "CC1!": "Cocoa",
  "KC1!": "Coffee",  "SB1!": "Sugar",   "CT1!": "Cotton",   "OJ1!": "OJ",
  "GC1!": "Gold",    "SI1!": "Silver",  "HG1!": "Copper",   "PL1!": "Plat.",
  "PA1!": "Pallad.", "CL1!": "Oil",     "NG1!": "NatGas",   "RB1!": "RBOB",
  "FDAX1!": "DAX",   "ES1!": "S&P",     "YM1!": "Dow",      "NQ1!": "Nasdaq",
  "UKX!": "FTSE",    "AAPL": "Apple",   "MSFT": "Microsoft","NVDA": "Nvidia",
  "GOOGL": "Google", "META": "Meta",    "AMZN": "Amazon",
  "SPY": "SPY",      "QQQ": "QQQ",      "SPMO": "SPMO",     "GLD": "Gold ETF",
  "6S1!": "CHF",
  "EURGBP": "EUR/GBP","GBPJPY": "GBP/JPY","MXNUSD": "MXN/USD","NOKUSD": "NOK/USD",
  "CLPUSD": "CLP/USD","SEKUSD": "SEK/USD","BRLUSD": "BRL/USD","ZARUSD": "ZAR/USD",
  "DE30EUR_2H": "DAX 2H","DE30EUR_1H": "DAX 1H","EURUSD_30M": "EUR/USD 30M","GBPUSD_30M": "GBP/USD 30M",
};

// Prefetch a list of symbols in the background (fire-and-forget)
function prefetch(codes: string[]) {
  codes.forEach(code => {
    const ck = code + ":1D";
    const c = OHLC_CACHE.get(ck);
    if (c && Date.now() - c.ts < CACHE_TTL) return;
    fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(code)}&timeframe=1D`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const b: OhlcBar[] = Array.isArray(d?.bars) && d.bars.length ? d.bars : [];
        OHLC_CACHE.set(ck, { bars: b, ts: Date.now() });
      })
      .catch(() => {});
  });
}

// Live + All are fixed-left; the rest are scrollable
const FIXED_TABS = [
  { id: "live",  label: "Live",     assets: [] as string[] },
  { id: "all",   label: "All",      assets: [] as string[] },
];

const SCROLL_TABS = [
  { id: "agrar",           label: "Agrar",    assets: ["ZW1!", "ZC1!", "ZS1!", "CC1!", "KC1!", "SB1!", "CT1!", "OJ1!"] },
  { id: "metalle_energie", label: "Metalle",  assets: ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!", "CL1!", "NG1!", "RB1!"] },
  { id: "indizes",         label: "Indizes",  assets: ["FDAX1!", "ES1!", "YM1!", "NQ1!", "UKX!"] },
  { id: "aktien",          label: "Aktien",   assets: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"] },
  { id: "invest",          label: "Invest",   assets: ["SPY", "QQQ", "SPMO", "GLD", "HG1!", "6S1!"] },
  { id: "fx",              label: "FX",       assets: ["EURGBP", "GBPJPY", "MXNUSD", "NOKUSD", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD"] },
  { id: "anomaly",         label: "Anomaly",  assets: ["GC1!", "GLD", "YM1!", "FDAX1!"] },
  { id: "intraday",        label: "Intraday", assets: ["DE30EUR_2H", "DE30EUR_1H", "EURUSD_30M", "GBPUSD_30M"] },
];

// Panels in order: fixed tabs first so scroll index matches
const ALL_TABS = [...FIXED_TABS, ...SCROLL_TABS];

// Default to first real-data tab
const DEFAULT_IDX = FIXED_TABS.length; // = 2 (Agrar)

// ── Toolbar icons ────────────────────────────────────────────────────────────
function IcoRefresh() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
function IcoAutoformat() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
function IcoLive() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/></svg>;
}
function IcoTester() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}
function IcoSettings() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// ── Real OHLC chart cell ──────────────────────────────────────────────────────
function ChartCell({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ck = code + ":1D";
  const cached = OHLC_CACHE.get(ck);
  const [bars, setBars] = useState<OhlcBar[] | null>(cached ? cached.bars : null);

  // Fetch OHLC, use cache
  useEffect(() => {
    const c = OHLC_CACHE.get(ck);
    if (c && Date.now() - c.ts < CACHE_TTL) { setBars(c.bars); return; }
    fetch(`/api/monitoring/ohlc?symbol=${encodeURIComponent(code)}&timeframe=1D`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const b: OhlcBar[] = Array.isArray(d?.bars) && d.bars.length ? d.bars : [];
        OHLC_CACHE.set(ck, { bars: b, ts: Date.now() });
        setBars(b);
      })
      .catch(() => { if (!OHLC_CACHE.has(ck)) setBars([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Render lightweight-charts candles
  useEffect(() => {
    if (!containerRef.current || !bars?.length) return;
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;
    import("lightweight-charts").then(({ createChart, CandlestickSeries, CrosshairMode, ColorType }) => {
      if (destroyed || !containerRef.current) return;
      const el = containerRef.current;
      chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: { background: { type: ColorType.Solid, color: "#080910" }, textColor: "rgba(228,236,248,0.55)", fontSize: 8, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false, textColor: "rgba(228,236,248,0.45)", scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderVisible: false, timeVisible: false, rightOffset: 1 },
        handleScroll: false,
        handleScale: false,
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#FFFFFF", downColor: "#D6B44B", borderVisible: false,
        wickUpColor: "#FFFFFF", wickDownColor: "#D6B44B",
        priceLineVisible: false, lastValueVisible: false,
      });
      const pre = bars.filter(b => (b.high - b.low) / Math.max(b.close, 0.0001) > 0.0002);
      const filtered = pre.filter((b, i) =>
        i === 0 || Math.abs(b.open - pre[i-1].close) / Math.max(pre[i-1].close, 0.0001) < 0.40
      );
      series.setData(filtered);
      const total = filtered.length;
      if (total > 20) chart.timeScale().setVisibleLogicalRange({ from: total - 20, to: total + 2 });
      else chart.timeScale().fitContent();
    });
    return () => { destroyed = true; if (chart) { try { chart.remove(); } catch {} } };
  }, [bars]);

  const sym   = code.replace("1!", "").replace(/_/g, " ");
  const name  = DISPLAY_NAME[code] ?? sym;

  return (
    <div style={{ background: "#0c0d10", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Header */}
      <div style={{ height: 24, display: "flex", alignItems: "center", padding: "0 6px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.82)", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {name}
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", flexShrink: 0, letterSpacing: "0.04em" }}>{sym}</span>
      </div>
      {/* Chart */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, background: "#080910", position: "relative" }}
      >
        {!bars && (
          <div className="mm-pulse" style={{
            position: "absolute", left: 4, right: 24, top: "55%", height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
          }} />
        )}
        {bars?.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function MobileMonitoringView() {
  const [activeIdx, setActiveIdx] = useState(DEFAULT_IDX);
  const [liveOn, setLiveOn] = useState(false);
  const panelRef    = useRef<HTMLDivElement>(null);
  const scrollTabRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  // Prefetch first 3 tabs on mount so they load from cache instantly
  useEffect(() => {
    const first3 = SCROLL_TABS.slice(0, 3).flatMap(t => t.assets);
    prefetch(first3);
    // Then prefetch remaining tabs lazily
    const id = setTimeout(() => prefetch(SCROLL_TABS.slice(3).flatMap(t => t.assets)), 3000);
    return () => clearTimeout(id);
  }, []);

  // Scroll panel to a tab index
  const goToTab = useCallback((idx: number) => {
    setActiveIdx(idx);
    programmatic.current = true;
    if (panelRef.current) {
      panelRef.current.scrollTo({ left: idx * panelRef.current.offsetWidth, behavior: "smooth" });
    }
    // Scroll the scrollable tabs so the active one is visible
    const scrollableIdx = idx - FIXED_TABS.length;
    if (scrollableIdx >= 0 && scrollTabRef.current) {
      const btn = scrollTabRef.current.children[scrollableIdx] as HTMLElement | undefined;
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  // Sync active tab when user swipes
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

  // Clear programmatic flag after scroll settles
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

  // Jump to default on mount (Agrar)
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
        } as React.CSSProperties}
      >
        {tab.label}
      </button>
    );
  };

  const toolbar = [
    { label: "Refresh",    Ico: IcoRefresh,    onPress: () => {},               live: false },
    { label: "Autoformat", Ico: IcoAutoformat, onPress: () => {},               live: false },
    { label: "Live",       Ico: IcoLive,       onPress: () => setLiveOn(v=>!v), live: true  },
    { label: "Tester",     Ico: IcoTester,     onPress: () => {},               live: false },
    { label: "Settings",   Ico: IcoSettings,   onPress: () => {},               live: false },
  ];

  return (
    <>
      <style>{`
        @keyframes mm-pulse { 0%,100%{opacity:.25} 50%{opacity:.8} }
        .mm-pulse { animation: mm-pulse 2s ease-in-out infinite; }
        .mm-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "8px 0 6px",
          position: "relative",
        }}>
          {/* Fixed Live + All */}
          <div style={{
            display: "flex",
            gap: 2,
            padding: "0 4px 0 10px",
            flexShrink: 0,
            position: "relative",
            zIndex: 2,
            background: "#0c0d10",
          }}>
            {FIXED_TABS.map((tab, i) => tabBtn(tab, i))}
            {/* Right-edge fade so scrollable tabs vanish behind */}
            <div style={{
              position: "absolute",
              right: -20,
              top: 0,
              bottom: 0,
              width: 20,
              background: "linear-gradient(90deg, #0c0d10 30%, transparent)",
              pointerEvents: "none",
              zIndex: 1,
            }} />
          </div>

          {/* Scrollable remaining tabs */}
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
            {SCROLL_TABS.map((tab, i) => tabBtn(tab, i + FIXED_TABS.length, true))}
          </div>
        </div>

        {/* ── Swipeable chart panels ───────────────────────────────────────── */}
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
          {ALL_TABS.map((tab) => (
            <div
              key={tab.id}
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
              {tab.assets.length > 0 ? (
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gridTemplateRows: `repeat(${Math.ceil(tab.assets.length / 2)}, 1fr)`,
                  gap: "1px",
                  background: "rgba(255,255,255,0.06)",
                }}>
                  {tab.assets.map(code => (
                    <ChartCell key={code} code={code} />
                  ))}
                </div>
              ) : (
                <div style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.22)",
                  fontSize: 13,
                  flexDirection: "column",
                  gap: 10,
                }}>
                  <span style={{ fontSize: 32, opacity: 0.35 }}>
                    {tab.id === "live" ? "●" : "⊞"}
                  </span>
                  <span>{tab.id === "live" ? "Live-Signale" : "Alle Strategien"}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          padding: "6px 6px 8px",
          background: "#0c0d10",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          gap: 2,
        }}>
          {toolbar.map(({ label, Ico, onPress, live }) => {
            const on = live && liveOn;
            return (
              <button
                key={label}
                onClick={onPress}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "6px 2px",
                  background: "transparent",
                  border: "none",
                  color: on ? "#22c55e" : "rgba(255,255,255,0.45)",
                  fontSize: 9,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties}
              >
                <Ico />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
