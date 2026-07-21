"use client";

import { useRef, useState, useCallback, useEffect } from "react";

const TABS = [
  { id: "agrar",           label: "Agrar",    assets: ["ZW1!", "ZC1!", "ZS1!", "CC1!", "KC1!", "SB1!", "CT1!", "OJ1!"] },
  { id: "metalle_energie", label: "Metalle",  assets: ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!", "CL1!", "NG1!", "RB1!"] },
  { id: "indizes",         label: "Indizes",  assets: ["FDAX1!", "ES1!", "YM1!", "NQ1!", "UKX!"] },
  { id: "aktien",          label: "Aktien",   assets: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"] },
  { id: "invest",          label: "Invest",   assets: ["SPY", "QQQ", "SPMO", "GLD", "HG1!", "6S1!"] },
  { id: "fx",              label: "FX",       assets: ["EURGBP", "GBPJPY", "MXNUSD", "NOKUSD", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD"] },
  { id: "anomaly",         label: "Anomaly",  assets: ["GC1!", "GLD", "YM1!", "FDAX1!"] },
  { id: "intraday",        label: "Intraday", assets: ["DE30EUR_2H", "DE30EUR_1H", "EURUSD_30M", "GBPUSD_30M"] },
  { id: "live",            label: "Live",     assets: [] },
  { id: "all",             label: "All",      assets: [] },
];

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

function IconAutoformat() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  );
}

function IconLive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
      <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/>
    </svg>
  );
}

function IconTester() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function MobileChartCard({ code }: { code: string }) {
  return (
    <div style={{
      background: "#0b0c11",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 6,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      aspectRatio: "1 / 0.75",
    }}>
      {/* Card header */}
      <div style={{
        height: 26,
        display: "flex",
        alignItems: "center",
        padding: "0 7px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        gap: 5,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {code.replace("1!", "").replace("_", " ")}
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>D</span>
      </div>
      {/* Chart body — horizontal grid lines to suggest chart feel */}
      <div style={{
        flex: 1,
        position: "relative",
        background: "#080910",
        overflow: "hidden",
      }}>
        {/* Y-axis mock */}
        <div style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 28,
          borderLeft: "1px solid rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3px 3px",
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.06)" }} />
          ))}
        </div>
        {/* X-axis mock */}
        <div style={{
          position: "absolute",
          left: 0,
          right: 28,
          bottom: 14,
          height: 1,
          background: "rgba(255,255,255,0.06)",
        }} />
        {/* Horizontal grid lines */}
        <div style={{
          position: "absolute",
          inset: "0 28px 14px 0",
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent calc(25% - 1px), rgba(255,255,255,0.03) calc(25% - 1px), rgba(255,255,255,0.03) 25%)",
        }} />
        {/* Loading skeleton line */}
        <div style={{
          position: "absolute",
          left: 4,
          right: 32,
          top: "50%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
          animation: "mm-pulse 2s ease-in-out infinite",
        }} />
      </div>
      {/* X-axis label row */}
      <div style={{
        height: 14,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        padding: "0 7px",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.18)" }}>Lade...</span>
      </div>
    </div>
  );
}

export function MobileMonitoringView() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [liveOn, setLiveOn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  const goToTab = useCallback((idx: number) => {
    setActiveIdx(idx);
    programmatic.current = true;
    if (panelRef.current) {
      panelRef.current.scrollTo({ left: idx * panelRef.current.offsetWidth, behavior: "smooth" });
    }
    const btn = tabBarRef.current?.children[idx] as HTMLElement | undefined;
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  const onPanelScroll = useCallback(() => {
    if (programmatic.current) return;
    const el = panelRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    if (idx >= 0 && idx < TABS.length && idx !== activeIdx) {
      setActiveIdx(idx);
      const btn = tabBarRef.current?.children[idx] as HTMLElement | undefined;
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeIdx]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const clear = () => { programmatic.current = false; };
    el.addEventListener("scrollend", clear);
    // fallback for browsers without scrollend
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => { clearTimeout(t); t = setTimeout(clear, 300); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scrollend", clear); el.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, []);

  const toolbarButtons = [
    { label: "Refresh",    Icon: IconRefresh,    action: () => {} },
    { label: "Autoformat", Icon: IconAutoformat, action: () => {} },
    { label: "Live",       Icon: IconLive,       action: () => setLiveOn(v => !v), isLive: true },
    { label: "Tester",     Icon: IconTester,     action: () => {} },
  ];

  return (
    <>
      <style>{`
        @keyframes mm-pulse {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 0.9; }
        }
        .mm-tab-scroll::-webkit-scrollbar { display: none; }
        .mm-panel-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0c0d10" }}>

        {/* Tab bar */}
        <div
          ref={tabBarRef}
          className="mm-tab-scroll"
          style={{
            flexShrink: 0,
            display: "flex",
            overflowX: "auto",
            padding: "10px 10px 0",
            gap: 2,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => goToTab(i)}
              style={{
                flexShrink: 0,
                padding: "6px 13px 8px",
                background: "transparent",
                border: "none",
                borderBottom: activeIdx === i ? "2px solid rgba(255,255,255,0.75)" : "2px solid transparent",
                color: activeIdx === i ? "#ffffff" : "rgba(255,255,255,0.38)",
                fontSize: 12,
                fontWeight: activeIdx === i ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                letterSpacing: "0.01em",
                transition: "color 120ms, border-color 120ms",
                WebkitTapHighlightColor: "transparent",
              } as React.CSSProperties}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Swipeable panels */}
        <div
          ref={panelRef}
          className="mm-panel-scroll"
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
          {TABS.map((tab) => (
            <div
              key={tab.id}
              style={{
                width: "100%",
                flexShrink: 0,
                scrollSnapAlign: "start",
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              {tab.assets.length > 0 ? (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 5,
                  padding: "8px 8px 10px",
                }}>
                  {tab.assets.map(code => (
                    <MobileChartCard key={code} code={code} />
                  ))}
                </div>
              ) : (
                <div style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.25)",
                  fontSize: 13,
                  flexDirection: "column",
                  gap: 8,
                }}>
                  <span style={{ fontSize: 28, opacity: 0.4 }}>
                    {tab.id === "live" ? "●" : "⊞"}
                  </span>
                  <span>{tab.id === "live" ? "Live-Signale" : "Alle Strategien"}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          gap: 6,
          padding: "8px 10px 10px",
          background: "#0c0d10",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}>
          {toolbarButtons.map(({ label, Icon, action, isLive }) => {
            const active = isLive && liveOn;
            return (
              <button
                key={label}
                onClick={action}
                style={{
                  flex: 1,
                  padding: "7px 4px 6px",
                  background: active ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? "rgba(34,197,94,0.28)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 7,
                  color: active ? "#22c55e" : "rgba(255,255,255,0.6)",
                  fontSize: 10,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties}
              >
                <Icon />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
