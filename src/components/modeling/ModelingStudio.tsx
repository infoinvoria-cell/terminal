"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AnalyticsSeriesPoint, AnalyticsDataset, AnalyticsTab } from "@/lib/analytics/portfolio-data";
import { runMonteCarlo } from "@/lib/modeling/monte-carlo";
import { computeDrawdownSeries, extractMonthlyReturns } from "@/lib/modeling/transforms";
import { computeDatasetHash } from "@/lib/modeling/content-hash";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";
import { MODEL_INFO } from "@/lib/modeling/model-info";
import { usePlaybackEngine, type PlaybackSpeed } from "./usePlaybackEngine";
import { useHeaderState } from "./useHeaderState";
import { MODELING_REGISTRY, type ModelingSubjectEntry } from "./ModelingRegistry";
import { API_BACKED_IDS } from "@/lib/modeling/datasource-map";
import { SelectionDropdown } from "./SelectionDropdown";
import { StableModelCard, MetaPill, ModelUnavailable } from "./StableModelCard";
import {
  VIEW_TEMPLATES, TEMPLATE_CATEGORY_ORDER, CATEGORY_LABELS, CUSTOM_TEMPLATE_ID,
  getDefaultTemplate, getTemplateById,
  type ViewTemplate, type ViewCategory,
} from "./ViewTemplates";
import { getCardHeight, MODEL_CARD_SIZES } from "./ModelingCardSizes";
import type { ViewDimension } from "./ViewTemplates";

// Model components
import { EquityCurveModel } from "./models/EquityCurveModel";
import { DrawdownModel } from "./models/DrawdownModel";
import { MCPathsModel } from "./models/MCPathsModel";
import { MCOutcomeDistribution, MCOutcomeStats } from "./models/MCOutcomeDistribution";
import { RollingMetricsModel } from "./models/RollingMetricsModel";
import { ReturnDistributionModel, ReturnDistStats } from "./models/ReturnDistributionModel";
import { RegressionModel, RegressionStats } from "./models/RegressionModel";
import { TailRiskModel, TailRiskStats } from "./models/TailRiskModel";
import { DrawdownRecoveryModel, DrawdownRecoveryStats } from "./models/DrawdownRecoveryModel";
import { DynamicCorrelationModel } from "./models/DynamicCorrelationModel";
import { MCDensitySurface } from "./models/MCDensitySurface";
import { DrawdownRecovery3D } from "./models/DrawdownRecovery3D";
import { MCQuantileSurface } from "./models/MCQuantileSurface";
import { CorrelationMatrixModel } from "./models/CorrelationMatrixModel";
import { EfficientFrontierModel } from "./models/EfficientFrontierModel";
import { PCAModel } from "./models/PCAModel";
import { VaRCVaRHeatmap, VaRCVaRSurface } from "./models/VaRCVaRSurface";
import { RollingRiskSurface3D } from "./models/RollingRiskSurface3D";
import { TradeExpectancyModel } from "./models/TradeExpectancyModel";
import { LLNConvergenceModel } from "./models/LLNConvergenceModel";
import { PathDependencyModel } from "./models/PathDependencyModel";
import type { TradeRecord } from "@/lib/modeling/types";

// ─── Anomaly JSON map ─────────────────────────────────────────────────────────

const ANOMALY_MAP: Record<string, string> = {
  "GC1 Friday Long": "/data/anomaly/gc1_friday_long.json",
  "YM1 TAT": "/data/anomaly/ym1_tat.json",
  "GLD Thursday Long": "/data/anomaly/gld_thursday_long.json",
};

// ─── Subject resolution ───────────────────────────────────────────────────────

type ResolvedData = {
  performanceSeries: AnalyticsSeriesPoint[];
  drawdownSeries: AnalyticsSeriesPoint[];
  benchmarkSeries: AnalyticsSeriesPoint[];
  hasData: boolean;
  hasBenchmark: boolean;
};

function resolveSubjectSeries(entry: ModelingSubjectEntry, dataset: AnalyticsDataset): ResolvedData {
  const benchmark = dataset.benchmarkSeries ?? [];
  const hasBenchmark = benchmark.length > 0;

  function makeResult(perf: AnalyticsSeriesPoint[]): ResolvedData {
    const hasData = perf.length > 0;
    return {
      performanceSeries: perf,
      drawdownSeries: hasData ? computeDrawdownSeries(perf) : [],
      benchmarkSeries: benchmark,
      hasData,
      hasBenchmark: hasData && hasBenchmark,
    };
  }

  if (!entry.groupSeriesId) return makeResult(dataset.performanceSeries);

  const sid = entry.groupSeriesId;
  const fromGroup = dataset.groupSeries?.[sid];
  if (fromGroup?.length) return makeResult(fromGroup);
  const fromStrategy = dataset.strategySeries?.[sid];
  if (fromStrategy?.length) return makeResult(fromStrategy);

  return { performanceSeries: [], drawdownSeries: [], benchmarkSeries: benchmark, hasData: false, hasBenchmark: false };
}

function resolveComponentSeriesMap(entry: ModelingSubjectEntry, dataset: AnalyticsDataset): Record<string, AnalyticsSeriesPoint[]> | null {
  const pickFiltered = (src: Record<string, AnalyticsSeriesPoint[]> | undefined) => {
    if (!src) return null;
    const filtered = Object.fromEntries(Object.entries(src).filter(([, v]) => v.length >= 12));
    return Object.keys(filtered).length >= 2 ? filtered : null;
  };
  if (entry.id === "portfolio-ws") return pickFiltered(dataset.groupSeries);
  if (entry.id === "portfolio-invest") return pickFiltered(dataset.strategySeries);
  if (entry.id === "portfolio-combined") {
    const merged = { ...(dataset.groupSeries ?? {}), ...(dataset.strategySeries ?? {}) };
    return pickFiltered(merged);
  }
  return null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  dataset: AnalyticsDataset;
  tab: AnalyticsTab;
  onTabChange: (tab: AnalyticsTab) => void;
  onClose: () => void;
};

// ─── Countdown overlay ────────────────────────────────────────────────────────

function CountdownOverlay({ count }: { count: number }) {
  return (
    <div key={count} style={{ position: "absolute", inset: 0, zIndex: 15, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <span style={{ fontFamily: FONT_NUM, fontSize: 180, fontWeight: 100, color: "rgba(238,238,238,0.07)", letterSpacing: "-0.05em", lineHeight: 1, animation: "cdFade 0.92s ease-out forwards" }}>
        {count}
      </span>
      <style>{`@keyframes cdFade { 0%{opacity:0;transform:scale(1.1)} 12%{opacity:1;transform:scale(1)} 80%{opacity:0.85} 100%{opacity:0;transform:scale(0.92)} }`}</style>
    </div>
  );
}

// ─── Playback controls ────────────────────────────────────────────────────────

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4, 8];

function PBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      background: active ? "rgba(255,255,255,0.08)" : "transparent",
      border: active ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
      borderRadius: 5, height: 30, padding: "0 8px",
      color: active ? "rgba(236,236,236,0.92)" : "rgba(141,141,141,0.65)",
      fontFamily: FONT_LABEL, fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: "pointer", letterSpacing: "0.03em", transition: "color 0.12s, background 0.12s", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

function PlaybackControls({ playback }: { playback: ReturnType<typeof usePlaybackEngine> }) {
  const canPlay = playback.state === "IDLE" || playback.state === "PAUSED" || playback.state === "COMPLETE";
  const active = playback.state === "PLAYING" || playback.state === "COUNTDOWN";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <PBtn active={false} onClick={() => (canPlay ? playback.play() : playback.pause())}>{active ? "‖" : "▶"}</PBtn>
      <PBtn active={false} onClick={playback.restart} title="Reset">↺</PBtn>
      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.09)", margin: "0 3px" }} />
      {SPEEDS.map((s) => <PBtn key={s} active={playback.speed === s} onClick={() => playback.setSpeed(s)}>{s}×</PBtn>)}
    </div>
  );
}

// ─── View menu ────────────────────────────────────────────────────────────────

function ViewMenu({
  current,
  customVisible,
  onChange,
  onCustomize,
  onClose,
}: {
  current: ViewTemplate;
  customVisible: string[];
  onChange: (t: ViewTemplate) => void;
  onCustomize: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const byCategory: Record<ViewCategory, ViewTemplate[]> = {} as Record<ViewCategory, ViewTemplate[]>;
  for (const cat of TEMPLATE_CATEGORY_ORDER) byCategory[cat] = [];
  for (const t of VIEW_TEMPLATES) byCategory[t.category].push(t);

  return (
    <div ref={menuRef} style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0,
      background: "#0a0a0c",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, zIndex: 220,
      boxShadow: "0 28px 70px rgba(0,0,0,0.75)",
      minWidth: 220, overflow: "hidden",
      maxHeight: "80vh", overflowY: "auto",
    }}>
      {TEMPLATE_CATEGORY_ORDER.map((cat) => {
        const items = byCategory[cat];
        if (!items.length && cat !== "CUSTOM") return null;
        return (
          <div key={cat}>
            <div style={{ padding: "8px 14px 4px", fontFamily: FONT_LABEL, fontSize: 7.5, letterSpacing: "0.14em", color: "rgba(100,100,100,0.65)", textTransform: "uppercase" }}>
              {CATEGORY_LABELS[cat]}
            </div>
            {cat === "CUSTOM" ? (
              <button type="button" onClick={onCustomize} style={{
                display: "flex", alignItems: "center", width: "100%",
                padding: "7px 14px", background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left",
              }}>
                <span style={{ fontFamily: FONT_LABEL, fontSize: 10, color: "rgba(160,160,160,0.80)" }}>Customize visible models…</span>
              </button>
            ) : (
              items.map((t) => {
                const isActive = t.id === current.id;
                return (
                  <button key={t.id} type="button" onClick={() => { onChange(t); onClose(); }} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "7px 14px",
                    background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,0.025)",
                  }}>
                    <span style={{ fontFamily: FONT_LABEL, fontSize: 10, color: isActive ? "rgba(232,232,232,0.95)" : "rgba(160,160,160,0.75)", fontWeight: isActive ? 600 : 400 }}>
                      {t.label}
                    </span>
                    {t.shortLabel && (
                      <span style={{ fontFamily: FONT_NUM, fontSize: 7.5, color: "rgba(90,90,90,0.70)", letterSpacing: "0.05em" }}>{t.shortLabel}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Independent lane layout ──────────────────────────────────────────────────

type CardDef = {
  id: string;
  title: string;
  topRight?: React.ReactNode;
  is3DAvailable?: boolean;
  has3D?: boolean;
  render2D: () => React.ReactNode;
  render3D?: () => React.ReactNode;
  infoId?: string;
  available: boolean;
};

function Lane({ cards, dimension, selectionId, infoRegistry }: {
  cards: CardDef[];
  dimension: ViewDimension;
  selectionId: string;
  infoRegistry: Record<string, import("@/lib/modeling/model-info").ModelInfoContent>;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
      {cards.map((card) => (
        <StableModelCard
          key={`${card.id}-${selectionId}`}
          modelId={card.id}
          title={card.title}
          topRight={card.topRight}
          height={getCardHeight(card.id)}
          is3DAvailable={card.is3DAvailable}
          has3D={card.has3D}
          render2D={card.render2D}
          render3D={card.render3D}
          infoContent={card.infoId ? infoRegistry[card.infoId] : undefined}
          dimension={dimension}
        />
      ))}
    </div>
  );
}

/** Split cards array into N lanes round-robin */
function splitIntoLanes<T>(items: T[], n: number): T[][] {
  const lanes: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => lanes[i % n]!.push(item));
  return lanes;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ModelingStudio({ dataset, tab, onTabChange, onClose }: Props) {
  const playback = usePlaybackEngine();

  const defaultEntry = MODELING_REGISTRY.find((e) => e.id === "portfolio-ws") ?? MODELING_REGISTRY[0]!;
  const [selectedEntry, setSelectedEntry] = useState<ModelingSubjectEntry>(defaultEntry);
  const [showSelector, setShowSelector] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ViewTemplate>(getDefaultTemplate());
  const [showViewMenu, setShowViewMenu] = useState(false);
  // Custom: user-selected visible model IDs (used when template = custom)
  const [customVisible, setCustomVisible] = useState<string[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);

  // API-backed async data
  const [fetchedData, setFetchedData] = useState<{
    performanceSeries: AnalyticsSeriesPoint[];
    benchmarkSeries: AnalyticsSeriesPoint[];
  } | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Anomaly trade data
  const [tradeData, setTradeData] = useState<TradeRecord[] | null>(null);

  useEffect(() => {
    if (!API_BACKED_IDS.has(selectedEntry.id)) { setFetchedData(null); setFetchLoading(false); return; }
    setFetchLoading(true); setFetchedData(null);
    const ctrl = new AbortController();
    fetch(`/api/modeling/dataset/${encodeURIComponent(selectedEntry.id)}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<{ performanceSeries: AnalyticsSeriesPoint[]; benchmarkSeries: AnalyticsSeriesPoint[] }>; })
      .then((d) => { setFetchedData(d); setFetchLoading(false); })
      .catch(() => { setFetchedData(null); setFetchLoading(false); });
    return () => ctrl.abort();
  }, [selectedEntry.id]);

  useEffect(() => {
    const path = ANOMALY_MAP[selectedEntry.id];
    if (!path) { setTradeData(null); return; }
    const ctrl = new AbortController();
    fetch(path, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTradeData(d?.trades ?? null))
      .catch(() => setTradeData(null));
    return () => ctrl.abort();
  }, [selectedEntry.id]);

  // On selection change: show full data immediately (READY_FULL), not animation start.
  const prevId = useRef(selectedEntry.id);
  useEffect(() => {
    if (prevId.current !== selectedEntry.id) { prevId.current = selectedEntry.id; playback.readyFull(); }
  }, [selectedEntry.id, playback]);

  const headerLocked = showSelector || showViewMenu || showCustomize || playback.state === "COUNTDOWN";
  const header = useHeaderState(headerLocked);

  function handleSelect(entry: ModelingSubjectEntry) {
    setSelectedEntry(entry);
    setShowSelector(false);
    if (entry.tab && entry.tab !== tab) onTabChange(entry.tab);
  }

  const resolved = useMemo(() => {
    if (fetchedData && API_BACKED_IDS.has(selectedEntry.id)) {
      const perf = fetchedData.performanceSeries ?? [];
      const bench = fetchedData.benchmarkSeries ?? [];
      const hasData = perf.length > 0;
      return {
        performanceSeries: perf, drawdownSeries: hasData ? computeDrawdownSeries(perf) : [],
        benchmarkSeries: bench, hasData, hasBenchmark: hasData && bench.length > 0,
      };
    }
    return resolveSubjectSeries(selectedEntry, dataset);
  }, [selectedEntry, dataset, fetchedData]);

  const componentSeriesMap = useMemo(() => resolveComponentSeriesMap(selectedEntry, dataset), [selectedEntry, dataset]);
  const hasComponents = componentSeriesMap !== null && Object.keys(componentSeriesMap).length >= 2;
  const monthlyReturns = useMemo(() => extractMonthlyReturns(resolved.performanceSeries), [resolved.performanceSeries]);
  const sourceHash = useMemo(() => computeDatasetHash({
    selectionId: selectedEntry.id, equity: resolved.performanceSeries,
    returns: monthlyReturns, trades: tradeData, components: componentSeriesMap,
  }), [selectedEntry.id, resolved.performanceSeries, monthlyReturns, tradeData, componentSeriesMap]);

  const mcResult = useMemo(() => {
    if (monthlyReturns.length < 6) return null;
    return runMonteCarlo({ returns: monthlyReturns, simulationCount: 10000, horizon: Math.min(monthlyReturns.length, 60), seed: 42, method: "stationary-bootstrap", sourceHash });
  }, [monthlyReturns, sourceHash]);

  const { performanceSeries, drawdownSeries, benchmarkSeries, hasData, hasBenchmark } = resolved;
  const horizon = mcResult?.params.horizon ?? "—";
  const heroH = getCardHeight("equity");
  const dimension: ViewDimension = activeTemplate.dimension;

  // ── All card definitions ──────────────────────────────────────────────────

  const ALL_CARD_DEFS: Record<string, CardDef> = {
    "equity": {
      id: "equity", title: "EQUITY CURVE", available: true,
      infoId: "equity",
      topRight: undefined,
      render2D: () => hasData
        ? <EquityCurveModel series={performanceSeries} benchmarkSeries={benchmarkSeries} showBenchmark={false} progress={playback.progress} />
        : <ModelUnavailable reason="No equity series for this selection" />,
    },
    "mc-paths": {
      id: "mc-paths", title: "MONTE CARLO", available: true,
      infoId: "mc-paths",
      topRight: mcResult ? <><MetaPill>10K SIM</MetaPill><MetaPill>H={horizon}M</MetaPill></> : undefined,
      is3DAvailable: !!mcResult, has3D: !!mcResult,
      render2D: () => <MCPathsModel result={mcResult} progress={playback.progress} />,
      render3D: () => mcResult ? <MCDensitySurface result={mcResult} progress={playback.progress} /> : null,
    },
    "drawdown": {
      id: "drawdown", title: "DRAWDOWN", available: true,
      infoId: "drawdown",
      topRight: undefined,
      render2D: () => hasData
        ? <DrawdownModel drawdownSeries={drawdownSeries} performanceSeries={performanceSeries} progress={playback.progress} />
        : <ModelUnavailable reason="No drawdown data" />,
    },
    "mc-outcome": {
      id: "mc-outcome", title: "MC OUTCOME", available: true,
      infoId: "mc-outcome",
      topRight: <MCOutcomeStats result={mcResult} />,
      render2D: () => <MCOutcomeDistribution result={mcResult} progress={playback.progress} />,
    },
    "return-dist": {
      id: "return-dist", title: "RETURN DISTRIBUTION",
      available: monthlyReturns.length >= 6,
      topRight: <ReturnDistStats returns={monthlyReturns} progress={playback.progress} />,
      infoId: "return-dist",
      render2D: () => <ReturnDistributionModel returns={monthlyReturns} progress={playback.progress} />,
    },
    "tail-risk": {
      id: "tail-risk", title: "TAIL RISK",
      available: monthlyReturns.length >= 12,
      topRight: <TailRiskStats returns={monthlyReturns} progress={playback.progress} />,
      infoId: "tail-risk",
      render2D: () => <TailRiskModel returns={monthlyReturns} progress={playback.progress} />,
    },
    "rolling": {
      id: "rolling", title: "ROLLING METRICS",
      available: performanceSeries.length >= 13,
      infoId: "rolling",
      render2D: () => <RollingMetricsModel series={performanceSeries} progress={playback.progress} />,
    },
    "dd-recovery": {
      id: "dd-recovery", title: "DRAWDOWN RECOVERY",
      available: hasData,
      topRight: <DrawdownRecoveryStats performanceSeries={performanceSeries} progress={playback.progress} />,
      is3DAvailable: hasData, has3D: hasData,
      infoId: "dd-recovery",
      render2D: () => <DrawdownRecoveryModel performanceSeries={performanceSeries} progress={playback.progress} />,
      render3D: () => <DrawdownRecovery3D performanceSeries={performanceSeries} />,
    },
    "regression": {
      id: "regression", title: "REGRESSION vs S&P 500",
      available: hasBenchmark && performanceSeries.length >= 6,
      topRight: <RegressionStats series={performanceSeries} benchmarkSeries={benchmarkSeries} progress={playback.progress} />,
      infoId: "regression",
      render2D: () => <RegressionModel series={performanceSeries} benchmarkSeries={benchmarkSeries} progress={playback.progress} />,
    },
    "dyn-correlation": {
      id: "dyn-correlation", title: "DYNAMIC CORRELATION",
      available: hasBenchmark && performanceSeries.length >= 13,
      infoId: "dyn-correlation",
      render2D: () => <DynamicCorrelationModel series={performanceSeries} benchmarkSeries={benchmarkSeries} progress={playback.progress} />,
    },
    "var-surface": {
      id: "var-surface", title: "VaR / CVaR SURFACE",
      available: monthlyReturns.length >= 12,
      is3DAvailable: monthlyReturns.length >= 12, has3D: monthlyReturns.length >= 12,
      infoId: "var-surface",
      render2D: () => <VaRCVaRHeatmap monthlyReturns={monthlyReturns} />,
      render3D: () => <VaRCVaRSurface monthlyReturns={monthlyReturns} />,
    },
    "rolling-risk-surface": {
      id: "rolling-risk-surface", title: "ROLLING RISK SURFACE",
      available: performanceSeries.length >= 37,
      is3DAvailable: performanceSeries.length >= 37, has3D: performanceSeries.length >= 37,
      infoId: "rolling-risk-surface",
      render2D: () => <RollingMetricsModel series={performanceSeries} progress={playback.progress} />,
      render3D: () => <RollingRiskSurface3D series={performanceSeries} />,
    },
    "mc-quantile-surface": {
      id: "mc-quantile-surface", title: "MC QUANTILE SURFACE",
      available: !!mcResult,
      is3DAvailable: !!mcResult, has3D: !!mcResult,
      infoId: "mc-quantile-surface",
      render2D: () => <MCPathsModel result={mcResult} progress={playback.progress} />,
      render3D: () => mcResult ? <MCQuantileSurface result={mcResult} /> : null,
    },
    "correlation-matrix": {
      id: "correlation-matrix", title: "CORRELATION MATRIX",
      available: hasComponents,
      topRight: hasComponents ? <MetaPill>k={Object.keys(componentSeriesMap ?? {}).length}</MetaPill> : undefined,
      infoId: "correlation-matrix",
      render2D: () => componentSeriesMap ? <CorrelationMatrixModel seriesMap={componentSeriesMap} /> : null,
    },
    "efficient-frontier": {
      id: "efficient-frontier", title: "EFFICIENT FRONTIER",
      available: hasComponents,
      infoId: "efficient-frontier",
      render2D: () => componentSeriesMap ? <EfficientFrontierModel seriesMap={componentSeriesMap} /> : null,
    },
    "pca": {
      id: "pca", title: "PCA / RISK FACTOR",
      available: hasComponents,
      infoId: "pca",
      render2D: () => componentSeriesMap ? <PCAModel seriesMap={componentSeriesMap} /> : null,
    },
    "trade-expectancy": {
      id: "trade-expectancy", title: "TRADE EXPECTANCY",
      available: !!(tradeData && tradeData.length >= 10),
      topRight: tradeData ? <MetaPill>n={tradeData.length}</MetaPill> : undefined,
      infoId: "trade-expectancy",
      render2D: () => tradeData ? <TradeExpectancyModel trades={tradeData} /> : null,
    },
    "lln-convergence": {
      id: "lln-convergence", title: "LLN CONVERGENCE",
      available: !!(tradeData && tradeData.length >= 10),
      infoId: "lln-convergence",
      render2D: () => tradeData ? <LLNConvergenceModel trades={tradeData} progress={playback.progress} /> : null,
    },
    "path-dependency": {
      id: "path-dependency", title: "PATH DEPENDENCY",
      available: !!(tradeData && tradeData.length >= 4),
      infoId: "path-dependency",
      render2D: () => tradeData ? <PathDependencyModel trades={tradeData} progress={playback.progress} /> : null,
    },
  };

  // ── Resolve visible model IDs from active template ─────────────────────────

  const visibleIds: string[] = useMemo(() => {
    const templateIds = activeTemplate.id === CUSTOM_TEMPLATE_ID
      ? customVisible
      : activeTemplate.visibleModels;
    return templateIds.filter((id) => {
      const card = ALL_CARD_DEFS[id];
      return card && card.available;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate, customVisible, hasData, hasBenchmark, hasComponents, monthlyReturns.length, performanceSeries.length, !!mcResult, !!tradeData]);

  // ── Separate hero vs lower cards ───────────────────────────────────────────

  const HERO_IDS = ["equity", "mc-paths", "drawdown", "mc-outcome"];
  const HERO_LEFT = ["equity", "drawdown"];
  const HERO_RIGHT = ["mc-paths", "mc-outcome"];

  const heroLeftCards = HERO_LEFT.filter((id) => visibleIds.includes(id)).map((id) => ALL_CARD_DEFS[id]!);
  const heroRightCards = HERO_RIGHT.filter((id) => visibleIds.includes(id)).map((id) => ALL_CARD_DEFS[id]!);
  const showHero = heroLeftCards.length > 0 || heroRightCards.length > 0;

  const lowerIds = visibleIds.filter((id) => !HERO_IDS.includes(id));
  const wideIds = lowerIds.filter((id) => MODEL_CARD_SIZES[id] === "WIDE");
  const compactIds = lowerIds.filter((id) => MODEL_CARD_SIZES[id] === "COMPACT");
  const standardIds = lowerIds.filter((id) => !wideIds.includes(id) && !compactIds.includes(id));

  const standardCards = standardIds.map((id) => ALL_CARD_DEFS[id]!);
  const compactCards = compactIds.map((id) => ALL_CARD_DEFS[id]!);
  const wideCards = wideIds.map((id) => ALL_CARD_DEFS[id]!);

  const standardLanes = splitIntoLanes(standardCards, 2);
  const compactLanes = splitIntoLanes(compactCards, 3);

  const hasLower = lowerIds.length > 0;

  // ── Core Six: 3×2 grid layout ─────────────────────────────────────────────
  const isCoreSix = activeTemplate.id === "core-six";
  // Core Six order: col1=[equity,drawdown], col2=[mc-paths,mc-outcome], col3=[return-dist,tail-risk]
  const CORE_SIX_COLS: [string[], string[], string[]] = [
    ["equity", "drawdown"],
    ["mc-paths", "mc-outcome"],
    ["return-dist", "tail-risk"],
  ];
  const CORE_SIX_H = 340; // equal-height cards for uniform visual rhythm

  return (
    <div style={{ position: "relative", height: "100%", background: MC_COLORS.bg, overflow: "hidden" }}>

      {/* ── Hot zone — 14px at top ─────────────────────────────────────── */}
      <div
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 14, zIndex: 31 }}
        onMouseEnter={header.onHotZoneEnter}
      />

      {/* ── Header overlay — immediate hide, no layout space ─────────── */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
          transform: `translateY(${header.translateY})`,
          transition: header.isVisible ? "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          willChange: "transform",
        }}
        onMouseEnter={header.onHeaderMouseEnter}
        onMouseLeave={header.onHeaderMouseLeave}
      >
        {/* Header bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "0 16px",
          background: "rgba(6,6,8,0.97)", height: 46,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          {/* ← */}
          <button type="button" onClick={onClose} style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", padding: 4, color: MC_COLORS.textMuted, cursor: "pointer", borderRadius: 4 }}>
            <ArrowLeft size={14} />
          </button>

          {/* MODELING STUDIO label */}
          <span style={{ fontFamily: FONT_LABEL, fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "rgba(190,190,190,0.60)", textTransform: "uppercase" }}>
            MODELING STUDIO
          </span>

          {/* Selection */}
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowSelector((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: showSelector ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.022)",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "4px 10px",
                color: showSelector ? "rgba(232,232,232,0.92)" : "rgba(188,188,188,0.72)",
                cursor: "pointer", fontFamily: FONT_LABEL, fontSize: 10, letterSpacing: "0.04em", transition: "all 0.14s",
              }}
            >
              {selectedEntry.label}
              <span style={{ fontSize: 7, opacity: 0.4 }}>▾</span>
            </button>
            {showSelector && (
              <SelectionDropdown selectedId={selectedEntry.id} dataset={dataset} onSelect={handleSelect} onClose={() => setShowSelector(false)} />
            )}
          </div>

          {/* Playback */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <PlaybackControls playback={playback} />

            {/* VIEW menu — right side */}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowViewMenu((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: showViewMenu ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.018)",
                  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "4px 10px",
                  color: showViewMenu ? "rgba(232,232,232,0.92)" : "rgba(145,145,145,0.60)",
                  cursor: "pointer", fontFamily: FONT_LABEL, fontSize: 9, letterSpacing: "0.10em", transition: "all 0.14s",
                }}
              >
                VIEW
                <span style={{ fontSize: 7, opacity: 0.4 }}>▾</span>
              </button>
              {showViewMenu && (
                <ViewMenu
                  current={activeTemplate}
                  customVisible={customVisible}
                  onChange={(t) => setActiveTemplate(t)}
                  onCustomize={() => { setShowViewMenu(false); setShowCustomize(true); }}
                  onClose={() => setShowViewMenu(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Gradient fade under header */}
        <div style={{ height: 24, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(6,6,8,0.55) 0%, transparent 100%)" }} />
      </div>

      {/* ── Countdown ─────────────────────────────────────────────────── */}
      {playback.state === "COUNTDOWN" && <CountdownOverlay count={playback.countdown} />}

      {/* ── Scrollable modeling canvas ─────────────────────────────────── */}
      <div style={{ height: "100%", overflowY: "auto", padding: "10px 11px 60px" }}>

        {fetchLoading && (
          <div style={{ padding: "9px 14px", background: "rgba(123,123,123,0.055)", border: "1px solid rgba(123,123,123,0.13)", borderRadius: 7, fontFamily: FONT_LABEL, fontSize: 9, letterSpacing: "0.08em", color: "rgba(163,163,163,0.65)", marginBottom: 11 }}>
            Loading {selectedEntry.label} …
          </div>
        )}

        {!hasData && !fetchLoading && !API_BACKED_IDS.has(selectedEntry.id) && selectedEntry.groupSeriesId && (
          <div style={{ padding: "9px 14px", background: "rgba(201,168,76,0.055)", border: "1px solid rgba(201,168,76,0.13)", borderRadius: 7, fontFamily: FONT_LABEL, fontSize: 9, letterSpacing: "0.08em", color: "rgba(201,168,76,0.55)", marginBottom: 11 }}>
            {selectedEntry.label} — no strategy backtest found
          </div>
        )}

        {/* ── CORE SIX: 3×2 equal-height grid ─────────────────────────── */}
        {isCoreSix && (
          <div style={{ display: "flex", gap: 11 }}>
            {CORE_SIX_COLS.map((colIds, ci) => (
              <div key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                {colIds.map((id) => {
                  const card = ALL_CARD_DEFS[id];
                  if (!card || !visibleIds.includes(id)) return null;
                  return (
                    <StableModelCard
                      key={`${id}-${selectedEntry.id}`}
                      modelId={id}
                      title={card.title}
                      topRight={card.topRight}
                      height={CORE_SIX_H}
                      is3DAvailable={card.is3DAvailable}
                      has3D={card.has3D}
                      render2D={card.render2D}
                      render3D={card.render3D}
                      infoContent={card.infoId ? MODEL_INFO[card.infoId] : undefined}
                      dimension={dimension}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── HERO: independent left/right columns ───────────────────── */}
        {!isCoreSix && showHero && (
          <div style={{ display: "flex", gap: 11, marginBottom: 11 }}>
            {/* Left lane: Equity + Drawdown */}
            {heroLeftCards.length > 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                {heroLeftCards.map((card) => (
                  <StableModelCard
                    key={`${card.id}-${selectedEntry.id}`}
                    modelId={card.id}
                    title={card.title}
                    topRight={card.topRight}
                    height={heroH}
                    is3DAvailable={card.is3DAvailable}
                    has3D={card.has3D}
                    render2D={card.render2D}
                    render3D={card.render3D}
                    infoContent={card.infoId ? MODEL_INFO[card.infoId] : undefined}
                    dimension={dimension}
                  />
                ))}
              </div>
            )}
            {/* Right lane: Monte Carlo + MC Outcome */}
            {heroRightCards.length > 0 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                {heroRightCards.map((card) => (
                  <StableModelCard
                    key={`${card.id}-${selectedEntry.id}`}
                    modelId={card.id}
                    title={card.title}
                    topRight={card.topRight}
                    height={heroH}
                    is3DAvailable={card.is3DAvailable}
                    has3D={card.has3D}
                    render2D={card.render2D}
                    render3D={card.render3D}
                    infoContent={card.infoId ? MODEL_INFO[card.infoId] : undefined}
                    dimension={dimension}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LOWER: wide, then standard 2-lane, then compact 3-lane ─── */}
        {!isCoreSix && hasLower && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {/* Wide cards — full width */}
            {wideCards.map((card) => (
              <StableModelCard
                key={`${card.id}-${selectedEntry.id}`}
                modelId={card.id}
                title={card.title}
                topRight={card.topRight}
                height={getCardHeight(card.id)}
                is3DAvailable={card.is3DAvailable}
                has3D={card.has3D}
                render2D={card.render2D}
                render3D={card.render3D}
                infoContent={card.infoId ? MODEL_INFO[card.infoId] : undefined}
                dimension={dimension}
              />
            ))}

            {/* Standard 2-lane */}
            {standardCards.length > 0 && (
              <div style={{ display: "flex", gap: 11 }}>
                {standardLanes.map((lane, li) => (
                  <Lane
                    key={li}
                    cards={lane}
                    dimension={dimension}
                    selectionId={selectedEntry.id}
                    infoRegistry={MODEL_INFO}
                  />
                ))}
              </div>
            )}

            {/* Compact 3-lane */}
            {compactCards.length > 0 && (
              <div style={{ display: "flex", gap: 11 }}>
                {compactLanes.map((lane, li) => (
                  <Lane
                    key={li}
                    cards={lane}
                    dimension={dimension}
                    selectionId={selectedEntry.id}
                    infoRegistry={MODEL_INFO}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
