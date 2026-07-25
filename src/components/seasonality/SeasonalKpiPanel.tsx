"use client";

import { useMemo } from "react";
import type { DailySeasonalResult, DailySeasonalPoint } from "@/lib/seasonality/dailySeasonalChart";
import { todayTradingDaySlot } from "@/lib/seasonality/tenDayProbability";
import type { WinrateProbResult, WinrateBar } from "@/lib/seasonality/tenDayProbability";
import type { WalkForwardResult } from "@/lib/seasonality/walkForward/types";
import type styles from "./seasonal.module.css";

const C_BULL = "#F0F3F7";
const C_BEAR = "#DCC476";

interface DonutProps {
  pct: number;
  title: string;
  empty?: boolean;
  bearDominant?: boolean;
  s: typeof styles;
}

function Donut({ pct, title, empty, bearDominant, s }: DonutProps) {
  const R = 28, CIRC = 2 * Math.PI * R, sw = 6;
  const wDash = empty ? 0 : Math.max(0, Math.min(1, pct / 100)) * CIRC;
  const gDash = CIRC - wDash;
  const cText = bearDominant ? C_BEAR : C_BULL;

  return (
    <div className={s.donut}>
      <svg width="76" height="76" viewBox="0 0 64 64">
        <g transform="rotate(-90 32 32)">
          <circle cx="32" cy="32" r={R} fill="none"
            stroke={empty ? "rgba(255,255,255,0.05)" : "rgba(220,196,118,0.55)"}
            strokeWidth={sw} strokeDasharray={empty ? "3 4" : undefined} />
          {!empty && wDash > 0 && (
            <circle cx="32" cy="32" r={R} fill="none"
              stroke="rgba(237,240,244,0.85)" strokeWidth={sw}
              strokeDasharray={`${wDash} ${gDash}`} />
          )}
        </g>
        <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
          fill={cText} fontFamily="Montserrat, Segoe UI, sans-serif"
          fontSize={empty ? "13" : "17"} fontWeight="700">
          {empty ? "—" : `${pct.toFixed(0)}%`}
        </text>
      </svg>
      <div className={s.donutTitle}>{title}</div>
    </div>
  );
}

function findWinrateBar(bars: WinrateBar[], doy: number): WinrateBar | null {
  if (!bars.length) return null;
  const inWindow = bars.find((b) => doy >= b.startSlot && doy <= b.endSlot);
  if (inWindow) return inWindow;
  return bars.reduce((best, b) =>
    (Math.abs(b.startSlot - doy) < Math.abs(best.startSlot - doy) ? b : best));
}

function findSeasonalPoint(points: DailySeasonalPoint[], doy: number): DailySeasonalPoint | null {
  if (!points.length) return null;
  return points.reduce((best, p) =>
    (Math.abs(p.dayOfYear - doy) < Math.abs(best.dayOfYear - doy) ? p : best));
}

interface Props {
  chart: DailySeasonalResult | null;
  hoverDoy: number | null;
  wfResult: WalkForwardResult | null;
  winrateProb: WinrateProbResult | null;
  styles: typeof styles;
}

export function SeasonalKpiPanel({ chart, hoverDoy, wfResult, winrateProb, styles: s }: Props) {
  const activeDoy = hoverDoy ?? todayTradingDaySlot();

  const probBar = useMemo(
    () => (winrateProb ? findWinrateBar(winrateProb.bars, activeDoy) : null),
    [winrateProb, activeDoy],
  );

  const seasonalPoint = useMemo(
    () => (chart ? findSeasonalPoint(chart.points, activeDoy) : null),
    [chart, activeDoy],
  );

  const bullPct = probBar?.bullProbability ?? 50;
  const signedP = probBar?.signedProbability ?? 0;

  const oos = wfResult?.oosSummary;
  const gate = wfResult?.researchGate;
  const gateFailed = gate?.status === "FAILED_RESEARCH_GATE";
  const qualityPct = gate
    ? gateFailed ? ((5 - (gate.failures?.length ?? 0)) / 5) * 100 : 100
    : 50;
  const winPct = oos ? oos.oosWinRate : 50;

  const windowLabel = probBar
    ? `${probBar.approxMonthLabel} · S${probBar.startSlot}–${probBar.endSlot}`
    : "—";

  const seasonalVal = seasonalPoint
    ? `${seasonalPoint.seasonal >= 0 ? "+" : ""}${seasonalPoint.seasonal.toFixed(1)}`
    : "—";

  const directionLabel = probBar
    ? `${probBar.direction} ${probBar.bestHoldingDays}D`
    : "—";

  return (
    <>
      <div className={s.donuts}>
        <Donut pct={bullPct} title="Bull / Bear" empty={!winrateProb} bearDominant={signedP < 0} s={s} />
        <Donut pct={oos ? winPct : 50} title="Win / Loss" empty={!oos} bearDominant={oos ? winPct < 50 : false} s={s} />
        <Donut pct={qualityPct} title="Quality" empty={!gate} bearDominant={gateFailed} s={s} />
      </div>

      <div className={s.kpiBigGrid}>
        <div className={s.kpiBigCard}>
          <div className={s.kpiBigLabel}>Winrate</div>
          <div className={s.kpiBigValue} style={{ color: bullPct >= 50 ? C_BULL : C_BEAR }}>
            {winrateProb ? `${bullPct.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className={s.kpiBigCard}>
          <div className={s.kpiBigLabel}>Seasonal</div>
          <div className={s.kpiBigValue} style={{ color: seasonalPoint && seasonalPoint.seasonal >= 0 ? C_BULL : C_BEAR }}>
            {seasonalVal}
          </div>
        </div>
        <div className={s.kpiBigCard}>
          <div className={s.kpiBigLabel}>Window</div>
          <div className={s.kpiBigValue}>{windowLabel}</div>
        </div>
        <div className={s.kpiBigCard}>
          <div className={s.kpiBigLabel}>Bias</div>
          <div className={s.kpiBigValue} style={{ color: signedP >= 0 ? C_BULL : C_BEAR }}>
            {probBar ? `${signedP >= 0 ? "+" : ""}${signedP.toFixed(0)}%` : "—"}
          </div>
          <div className={s.kpiBigSub}>{directionLabel}</div>
        </div>
      </div>
    </>
  );
}
