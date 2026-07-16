"use client";

type KpiItem = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  sub?: string;
};

type DonutProps = {
  pct: number;
  color: string;
  bgColor?: string;
  size?: number;
  thickness?: number;
};

function MiniDonut({ pct, color, bgColor = "rgba(255,255,255,0.06)", size = 48, thickness = 5 }: DonutProps) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, pct / 100)) * circ;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={bgColor} strokeWidth={thickness} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

type DistributionProps = {
  longCount: number;
  shortCount: number;
  winCount: number;
  lossCount: number;
};

function DistributionSection({ longCount, shortCount, winCount, lossCount }: DistributionProps) {
  const totalDir = longCount + shortCount;
  const longPct = totalDir > 0 ? (longCount / totalDir) * 100 : 50;
  const totalWL = winCount + lossCount;
  const winPct = totalWL > 0 ? (winCount / totalWL) * 100 : 0;

  return (
    <div className="st-dist-row">
      <div className="st-dist-card">
        <MiniDonut pct={longPct} color="#22c55e" bgColor="rgba(239,68,68,0.25)" size={52} thickness={5} />
        <div className="st-dist-labels">
          <div className="st-dist-title">Long / Short</div>
          <div className="st-dist-stat" style={{ color: "#22c55e" }}>
            {Math.round(longPct)}% L
          </div>
          <div className="st-dist-stat" style={{ color: "#ef4444" }}>
            {Math.round(100 - longPct)}% S
          </div>
        </div>
      </div>
      <div className="st-dist-card">
        <MiniDonut pct={winPct} color="#22c55e" bgColor="rgba(239,68,68,0.25)" size={52} thickness={5} />
        <div className="st-dist-labels">
          <div className="st-dist-title">Win / Loss</div>
          <div className="st-dist-stat" style={{ color: "#22c55e" }}>
            {Math.round(winPct)}% W
          </div>
          <div className="st-dist-stat" style={{ color: "#ef4444" }}>
            {Math.round(100 - winPct)}% L
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  items: KpiItem[];
  longCount?: number;
  shortCount?: number;
  winCount?: number;
  lossCount?: number;
};

export default function StrategyTesterKpiGrid({
  items,
  longCount = 0,
  shortCount = 0,
  winCount = 0,
  lossCount = 0,
}: Props) {
  return (
    <>
      <div className="st-kpi-grid">
        {items.map((item) => (
          <div key={item.label} className="st-kpi-card">
            <div className="st-kpi-label">{item.label}</div>
            <div className={`st-kpi-value ${item.tone || "neutral"}`}>{item.value}</div>
            {item.sub ? <div className="st-kpi-sub">{item.sub}</div> : null}
          </div>
        ))}
      </div>
      {(longCount + shortCount > 0) && (
        <DistributionSection
          longCount={longCount}
          shortCount={shortCount}
          winCount={winCount}
          lossCount={lossCount}
        />
      )}
    </>
  );
}
