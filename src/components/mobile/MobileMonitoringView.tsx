"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsMobile } from "./useIsMobile";
import {
  loadWave1Groups,
  clearWave1Cache,
  type Wave1GroupData,
  type Wave1GroupId,
  type Wave1StrategyRecord,
} from "@/lib/monitoring/wave1Data";
import MonitoringChartCard, { type MonitoringChartCardItem } from "@/components/monitoring/MonitoringChartCard";
import { loadReferenceBars, clearReferenceBarsCache, type ReferenceBar } from "@/lib/monitoring/referenceBarsFallback";

const UNIVERSE_GROUP_LABELS: Record<Wave1GroupId, string> = {
  agrar: "Agrar",
  intraday: "Intraday MT",
  indices: "Indizes",
};

type MobileWave1TabId = "agrar" | "intraday_mt" | "indizes";

type MobileWave1Tab = {
  tabId: MobileWave1TabId;
  groupId: Wave1GroupId;
  title: string;
};

const MOBILE_WAVE1_TABS: MobileWave1Tab[] = [
  { tabId: "agrar", groupId: "agrar", title: "Agrar" },
  { tabId: "intraday_mt", groupId: "intraday", title: "Intraday" },
  { tabId: "indizes", groupId: "indices", title: "Indices" },
];

function buildCardItem(
  record: Wave1StrategyRecord,
  groupId: Wave1GroupId,
  referenceBars?: ReferenceBar[] | null,
): MonitoringChartCardItem {
  const universeGroup = UNIVERSE_GROUP_LABELS[groupId];
  const timeframe = groupId === "intraday" ? "30M" : "D";
  const wave1HasBars = (record.chart?.bars?.length ?? 0) > 0;
  const usingReference = !wave1HasBars && (referenceBars?.length ?? 0) > 0;
  const badge = usingReference
    ? "REFERENZ"
    : record.card?.validation_status ??
      record.status?.validation_status ??
      record.card?.status ??
      record.manifestStatus ??
      "DATA";
  const hasBars = wave1HasBars || usingReference;

  return {
    key: record.strategyId,
    code: record.symbol,
    short: record.symbol,
    name: record.label,
    strategy: record.strategyId,
    tv: record.symbol,
    timeframe: usingReference ? "D" : timeframe,
    universeGroup,
    variant: "compact",
    payload: hasBars
      ? {
          metadata: {
            badge,
            hasStrategy: usingReference ? false : record.status?.trades_generated ?? false,
            strategyEventsFile: null,
            strategyEventsFallbackFile: null,
          },
          bars: (usingReference ? referenceBars : record.chart!.bars) as NonNullable<MonitoringChartCardItem["payload"]>["bars"],
          signals: [],
          boxes: [],
        }
      : null,
  };
}

export function MobileMonitoringView() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab =
    (MOBILE_WAVE1_TABS.find((t) => t.tabId === requestedTab)?.tabId as MobileWave1TabId | undefined) ??
    "agrar";
  const [activeTab, setActiveTab] = useState<MobileWave1TabId>(initialTab);
  const [groups, setGroups] = useState<Record<Wave1GroupId, Wave1GroupData | null>>({
    agrar: null,
    intraday: null,
    indices: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [referenceBarsBySymbol, setReferenceBarsBySymbol] = useState<Record<string, ReferenceBar[] | null>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const next = await loadWave1Groups(["agrar", "intraday", "indices"]);
      if (!cancelled) {
        setGroups(next);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Records whose wave1 export has 0 bars: load real cached reference OHLC instead of
  // rendering an empty card. Never fabricated — sourced from the same TradingView cache
  // the desktop app uses, marked with a "REFERENZ" badge so it's never confused with a
  // validated strategy signal.
  useEffect(() => {
    const emptyRecords = Object.values(groups)
      .flatMap((g) => g?.records ?? [])
      .filter((r) => (r.chart?.bars?.length ?? 0) === 0);
    if (emptyRecords.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        emptyRecords.map(async (r) => [r.symbol, await loadReferenceBars(r.symbol)] as const),
      );
      if (!cancelled) {
        setReferenceBarsBySymbol((prev) => {
          const next = { ...prev };
          for (const [symbol, bars] of entries) next[symbol] = bars;
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [groups]);

  const handleRefresh = React.useCallback(() => {
    clearWave1Cache();
    clearReferenceBarsCache();
    setReferenceBarsBySymbol({});
    setRefreshKey((k) => k + 1);
  }, []);

  const activeMeta =
    MOBILE_WAVE1_TABS.find((tab) => tab.tabId === activeTab) ?? MOBILE_WAVE1_TABS[0];
  const activeGroup = groups[activeMeta.groupId];
  const activeRecords = activeGroup?.records ?? [];
  const numRows = Math.max(1, Math.ceil(activeRecords.length / 2));

  if (!isMobile) return null;

  return (
    <>
    {/* Inject MonitoringPage styled-jsx rules that aren't loaded on mobile */}
    <style dangerouslySetInnerHTML={{ __html: `
      .chartCard {
        position: relative !important;
        min-width: 0;
        min-height: 0;
        width: 100% !important;
        height: 100% !important;
        background: #050505;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        overflow: hidden !important;
        box-sizing: border-box;
        cursor: default;
      }
      .monitoring-chart-shell {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 0;
        min-height: 0;
        z-index: 2;
        overflow: visible;
        cursor: crosshair;
      }
      .chartHost {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 0;
        min-height: 0;
        z-index: 1;
        cursor: crosshair;
        pointer-events: auto;
        touch-action: none;
      }
      .monitoring-card-label {
        position: absolute !important;
        top: 6px;
        left: 8px;
        z-index: 20;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: flex-start;
      }
      .monitoring-card-label-head {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 6px 3px 4px;
        border-radius: 6px;
        background: rgba(5,5,5,0.82);
        backdrop-filter: blur(8px);
      }
      .monitoring-card-symbol {
        font-size: 11px;
        font-weight: 700;
        color: #f5f7fa;
        line-height: 1.05;
      }
      .monitoring-card-desc { display: none; }
      .monitoring-card-badge { display: none !important; }
      .monitoring-card-chips { display: none !important; }
      .monitoring-card-asset-icon {
        width: 14px !important;
        height: 14px !important;
      }
      .indicatorButton { display: none !important; }
      .ivq-mobile-sidebar-toggle { display: none !important; }
    ` }} />
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#050505",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "var(--font-montserrat, system-ui, sans-serif)",
        overflow: "hidden",
        paddingBottom: "calc(54px + env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
      }}
    >
      {/* Header row: tabs left + 3 action icons right */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "calc(env(safe-area-inset-top, 10px) + 8px) 12px 0",
          gap: 8,
        }}
      >
        {/* Tab chips */}
        <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
          {MOBILE_WAVE1_TABS.map((tab) => {
            const isActive = tab.tabId === activeTab;
            return (
              <button
                key={tab.tabId}
                onClick={() => setActiveTab(tab.tabId)}
                style={{
                  flexShrink: 0,
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: "none",
                  background: isActive ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.05)",
                  color: isActive ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.36)",
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {tab.title}
              </button>
            );
          })}
        </div>

        {/* 2 action icons — Layout removed (no layout switching implemented) */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {/* Refresh — reloads wave1 data, no engine action */}
          <button style={{ background: "none", border: "none", padding: "4px 5px", color: loading ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.36)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }} onClick={handleRefresh} aria-label="Refresh" disabled={loading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          {/* Settings — opens real settings sheet */}
          <button style={{ background: "none", border: "none", padding: "4px 5px", color: settingsOpen ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.36)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }} onClick={() => setSettingsOpen(true)} aria-label="Einstellungen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "5px 6px 0", minHeight: 0, overflow: "hidden" }}>
        {loading ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.28)",
              fontSize: 12,
            }}
          >
            Lade Wave 1...
          </div>
        ) : !activeGroup?.available ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.28)",
              fontSize: 12,
            }}
          >
            Wave 1 nicht verfuegbar
          </div>
        ) : (
          <div
            style={{
              height: "100%",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))`,
              gap: 4,
            }}
          >
            {activeRecords.map((record) => {
              const wave1HasBars = (record.chart?.bars?.length ?? 0) > 0;
              const refBars = referenceBarsBySymbol[record.symbol];
              const usingReference = !wave1HasBars && (refBars?.length ?? 0) > 0;
              const item = buildCardItem(record, activeMeta.groupId, refBars);
              const hasBars = item.payload !== null;
              return (
                <div
                  key={record.strategyId}
                  style={{
                    position: "relative",
                    minWidth: 0,
                    minHeight: 0,
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "#0a0a0a",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {usingReference && (
                    <div style={{
                      position: "absolute", top: 6, right: 7, zIndex: 25,
                      fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
                      color: "rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.55)",
                      border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4,
                      padding: "1.5px 5px", pointerEvents: "none",
                    }}>
                      REF
                    </div>
                  )}
                  {hasBars ? (
                    <MonitoringChartCard
                      item={item}
                      isActive={false}
                      variant="compact"
                      missingBuild={false}
                      loadStatus="loaded"
                      strategyEventsByFile={{}}
                      tradingViewTradesBySource={{}}
                      onCardClick={() => {}}
                      onIndicatorClick={() => {}}
                    />
                  ) : (
                    /* Genuinely no data anywhere (wave1 export AND reference cache both empty) */
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em" }}>{record.symbol}</div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18M10.5 6.5h6a4 4 0 0 1 4 4v6M3.5 10.5v3a4 4 0 0 0 4 4h6" />
                      </svg>
                      <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.22)", letterSpacing: "0.03em" }}>
                        Keine Chartdaten verfuegbar
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings sheet — real actions only */}
      {settingsOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", flexDirection: "column" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div style={{ flex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#090a0c", borderTop: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "18px 18px 0 0", paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Einstellungen</span>
              <button onClick={() => setSettingsOpen(false)} aria-label="Schliessen" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.36)", cursor: "pointer", padding: "4px 8px", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <button
              onClick={() => { handleRefresh(); setSettingsOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 16px", color: "rgba(255,255,255,0.8)", fontSize: 13, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Daten aktualisieren (Cache leeren)
            </button>
            <div style={{ padding: "12px 16px 20px", fontSize: 10, color: "rgba(255,255,255,0.22)", lineHeight: 1.5 }}>
              Quelle: Wave1 Export (live_state). Research only — keine Trading-Freigabe, keine Approved-Freigabe.
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
