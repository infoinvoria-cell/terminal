"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DailySeasonalResult } from "@/lib/seasonality/dailySeasonalChart";
import type { PatternDataResult, PatternCandidate, OscillatorMode } from "@/lib/seasonality/patternSelection";
import { slotToApproxDate } from "@/lib/seasonality/patternSelection";
import { SeasonalCurveChart } from "./SeasonalMainChart";
import { SeasonalTenDayProbChart } from "./SeasonalTenDayProbChart";
import { PanelTitle } from "./PanelTitle";
import { SEASONAL_CHART_LOGO_SRC } from "@/lib/seasonality/useSeasonalitySettings";
import styles from "./seasonal.module.css";

interface Props {
  chartResult: DailySeasonalResult | null;
  chartLoading: boolean;
  patternData: PatternDataResult | null;
  patternDataLoading: boolean;
  hoverDoy: number | null;
  onHoverDoy: (doy: number | null) => void;
  selectedPattern: PatternCandidate | null;
  onSelectPattern: (c: PatternCandidate | null) => void;
  activePattern: PatternCandidate | null;
  todaySlot: number | null;
  assetControls: ReactNode;
  // Visual settings from gear menu
  showToday?: boolean;
  showPatternHighlight?: boolean;
  chartGradient?: boolean;
  chartLogoEnabled?: boolean;
  chartLogoOpacity?: number;
  chartLogoSize?: number;
  chartLogoPosX?: number;
  chartLogoPosY?: number;
  /** Active oscillator mode for the bottom bar chart strip. */
  oscillatorMode?: OscillatorMode;
  onOscillatorModeChange?: (mode: OscillatorMode) => void;
  /** Progressive QS bars from background computation (used when patternData.qsBars unavailable). */
  qsLiveBars?: Map<number, { slot: number; value: number; candidate: PatternCandidate | null }>;
}

export function SeasonalCombinedChartPanel({
  chartResult,
  chartLoading,
  patternData,
  patternDataLoading,
  hoverDoy,
  onHoverDoy,
  selectedPattern,
  onSelectPattern,
  activePattern,
  todaySlot,
  assetControls,
  showToday = true,
  showPatternHighlight = true,
  chartGradient = true,
  chartLogoEnabled = true,
  chartLogoOpacity = 70,
  chartLogoSize = 200,
  chartLogoPosX = 60,
  chartLogoPosY = 60,
  oscillatorMode = "WR",
  onOscillatorModeChange,
  qsLiveBars,
}: Props) {
  const MODES: OscillatorMode[] = ["WR", "SR", "QS"];
  const cycleMode = () => {
    const next = MODES[(MODES.indexOf(oscillatorMode) + 1) % MODES.length];
    onOscillatorModeChange?.(next);
  };
  const seasonalWrapRef = useRef<HTMLDivElement>(null);
  const [seasonalWrapW, setSeasonalWrapW] = useState(0);

  useEffect(() => {
    const el = seasonalWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const nextW = entries[0]?.contentRect?.width ?? 0;
      setSeasonalWrapW(nextW);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelSlot = useMemo(() => {
    if (hoverDoy != null) return Math.max(1, Math.min(252, Math.round(hoverDoy)));
    if (activePattern) return Math.max(1, Math.min(252, Math.round(activePattern.startSlot)));
    if (selectedPattern) return Math.max(1, Math.min(252, Math.round(selectedPattern.startSlot)));
    return null;
  }, [activePattern, hoverDoy, selectedPattern]);

  const labelText = useMemo(() => (labelSlot != null ? slotToApproxDate(labelSlot) : ""), [labelSlot]);

  const labelLeftPx = useMemo(() => {
    if (labelSlot == null || seasonalWrapW <= 1) return null;
    // Match SeasonalMainChart chart scale: margin left(4) + yAxis width(38) = 42; right margin = 8
    const LEFT_PAD = 42;
    const RIGHT_PAD = 8;
    const plotW = Math.max(1, seasonalWrapW - LEFT_PAD - RIGHT_PAD);
    const t = (labelSlot - 1) / (252 - 1);
    return LEFT_PAD + t * plotW;
  }, [labelSlot, seasonalWrapW]);

  const handleSeasonalClick = (doy: number | null) => {
    if (doy == null || !patternData) return;
    const slot = Math.max(1, Math.min(251, Math.round(doy)));
    const candidate = patternData.bestPatternBySlot[slot] ?? null;
    if (!candidate) return;
    if (selectedPattern?.startSlot === candidate.startSlot && selectedPattern.direction === candidate.direction && selectedPattern.holdingDays === candidate.holdingDays) {
      onSelectPattern(null);
      return;
    }
    onSelectPattern(candidate);
  };

  return (
    <div
      className={styles.combinedPanel}
      onMouseLeave={() => onHoverDoy(null)}
    >
      <PanelTitle right={assetControls}>Seasonal Chart</PanelTitle>
      <div className={styles.combinedBody}>
        {/* Seasonal curve — with Today+Hover lines and pattern overlay */}
        <div className={styles.seasonalSlot} ref={seasonalWrapRef} style={{ position: "relative" }}>
          {chartResult && !chartLoading ? (
            <SeasonalCurveChart
              result={chartResult}
              hoverDoy={hoverDoy}
              onHoverDoy={onHoverDoy}
              onClickDoy={handleSeasonalClick}
              embedded
              activePattern={activePattern}
              selectedPattern={selectedPattern}
              todaySlot={todaySlot ?? undefined}
              showToday={showToday}
              showPatternHighlight={showPatternHighlight}
              chartGradient={chartGradient}
            />
          ) : (
            <div className={styles.chartPlaceholder}>
              {chartLoading ? "Loading…" : "No data"}
            </div>
          )}

          {/* X-axis date label (hover/locked only). HTML overlay avoids SVG clipping. */}
          {chartLogoEnabled ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={SEASONAL_CHART_LOGO_SRC}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: chartLogoPosX,
                bottom: chartLogoPosY,
                width: chartLogoSize,
                height: "auto",
                maxWidth: "calc(100% - 16px)",
                opacity: Math.min(100, Math.max(0, chartLogoOpacity)) / 100,
                pointerEvents: "none",
                zIndex: 4,
                userSelect: "none",
              }}
            />
          ) : null}

          {labelSlot != null && labelLeftPx != null ? (
            <div
              style={{
                position: "absolute",
                left: labelLeftPx,
                bottom: 34, // sits above month tick labels (avoid overlap)
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 5,
                padding: "2px 7px",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1.1,
                borderRadius: 6,
                background: "rgba(10,10,10,0.94)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(168,178,188,0.92)",
                whiteSpace: "nowrap",
              }}
              aria-hidden="true"
            >
              {labelText}
            </div>
          ) : null}
        </div>

        {/* Scanner chart strip — WR / SR / QS modes */}
        <div className={styles.winrateSlot} style={{ position: "relative" }}>
          <SeasonalTenDayProbChart
            patternData={patternData}
            loading={patternDataLoading}
            hoverDoy={hoverDoy}
            onHoverDoy={onHoverDoy}
            onSelectPattern={onSelectPattern}
            selectedPattern={selectedPattern}
            embedded
            todaySlot={todaySlot ?? undefined}
            showToday={showToday}
            mode={oscillatorMode}
            qsLiveBars={qsLiveBars}
          />
          {/* Mini mode-cycle button — bottom-right, unobtrusive */}
          <button
            type="button"
            onClick={cycleMode}
            title={`Scanner mode: ${oscillatorMode} — click to cycle WR → SR → QS`}
            style={{
              position: "absolute",
              bottom: 6,
              right: 10,
              padding: "1px 5px",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "Montserrat, Segoe UI, sans-serif",
              letterSpacing: "0.06em",
              color: "rgba(180,195,210,0.80)",
              background: "rgba(10,10,10,0.72)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 4,
              cursor: "pointer",
              zIndex: 10,
              lineHeight: 1.4,
              userSelect: "none",
            }}
          >
            {oscillatorMode}
          </button>
        </div>
      </div>
    </div>
  );
}
