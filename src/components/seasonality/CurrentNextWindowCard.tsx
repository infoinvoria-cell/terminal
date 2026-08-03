"use client";

import type { WalkForwardResult } from "@/lib/seasonality/walkForward/types";
import styles from "./seasonal.module.css";

const C_WHITE = "#F0F3F7";
const C_GOLD = "#C9A84C";

interface Props {
  walkForwardResult: WalkForwardResult | null;
  loading: boolean;
  onRun: () => void;
}

function MiniSetupSparkline({ result }: { result: WalkForwardResult }) {
  const executed = result.foldResults
    .filter((f) => f.oosTradeStatus === "EXECUTED" && f.oosNetReturn != null)
    .slice(-12);

  if (executed.length < 2) {
    return <div className={styles.nextSetupSparkEmpty} />;
  }

  const w = 100;
  const h = 44;
  const rets = executed.map((f) => (f.oosNetReturn ?? 0) * 100);
  const max = Math.max(...rets.map(Math.abs), 4);
  const step = w / (rets.length - 1);

  const points = rets.map((r, i) => {
    const x = i * step;
    const y = h / 2 - (r / max) * (h / 2 - 4);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg className={styles.nextSetupSpark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <polyline points={points} fill="none" stroke="rgba(200,210,224,0.55)" strokeWidth={1.5} />
      {rets.map((r, i) => {
        const x = i * step;
        const bh = Math.max(2, (Math.abs(r) / max) * (h / 2 - 6));
        const y = r >= 0 ? h / 2 - bh : h / 2;
        return (
          <rect
            key={`ns-${i}`}
            x={x - 2}
            y={y}
            width={4}
            height={bh}
            fill={r >= 0 ? "rgba(240,243,247,0.65)" : "rgba(220,196,118,0.7)"}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

export function CurrentNextWindowCard({ walkForwardResult, loading, onRun }: Props) {
  const plan = walkForwardResult?.currentYearPlan;
  const oos = walkForwardResult?.oosSummary;

  const winrate = oos ? `${oos.oosWinRate.toFixed(0)}%` : "—";
  const avgPerf = oos
    ? `${oos.oosAverageReturn >= 0 ? "+" : ""}${(oos.oosAverageReturn * 100).toFixed(1)}%`
    : "—";
  const windowLabel = plan
    ? `${plan.plannedEntryDate ?? plan.selectedEntryMonthDay ?? "—"} → ${plan.plannedExitDate ?? "—"}`
    : "—";

  const winColor = oos ? (oos.oosWinRate >= 50 ? C_WHITE : C_GOLD) : "#8A9AA8";
  const perfColor = oos ? (oos.oosAverageReturn >= 0 ? C_WHITE : C_GOLD) : "#8A9AA8";

  if (loading) {
    return <div className={styles.nextSetupRoot}>Computing…</div>;
  }

  if (!walkForwardResult) {
    return (
      <div className={styles.nextSetupRoot}>
        <button type="button" className={styles.nextSetupRunBtn} onClick={onRun}>Run</button>
      </div>
    );
  }

  return (
    <div className={styles.nextSetupRoot}>
      <div className={styles.nextSetupMain}>
        <div className={styles.nextSetupMetric}>
          <span className={styles.nextSetupLabel}>Winrate</span>
          <span className={styles.nextSetupValue} style={{ color: winColor }}>{winrate}</span>
        </div>
        <div className={styles.nextSetupMetric}>
          <span className={styles.nextSetupLabel}>Avg Performance</span>
          <span className={styles.nextSetupValue} style={{ color: perfColor }}>{avgPerf}</span>
        </div>
        <div className={styles.nextSetupMetric}>
          <span className={styles.nextSetupLabel}>Window</span>
          <span className={styles.nextSetupValueSmall}>{windowLabel}</span>
        </div>
      </div>
      <div className={styles.nextSetupChart}>
        <MiniSetupSparkline result={walkForwardResult} />
      </div>
    </div>
  );
}
