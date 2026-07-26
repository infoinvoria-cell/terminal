"use client";

import type { ImpactDirection } from "@/lib/globe/eventImpactMap";

export interface ImpactPanelData {
  event: string;
  region: string;
  regionLabel: string;
  assets: string[]; // display tickers
  direction: ImpactDirection;
  reason: string;
}

type Props = {
  data: ImpactPanelData;
  onClose: () => void;
  onOpenChart?: (ticker: string) => void;
  /** Live quote per display ticker (optional). */
  quotes?: Record<string, { price: number; change: number }>;
};

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function dirArrow(direction: ImpactDirection): string {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "↕";
}

function dirColor(direction: ImpactDirection): string {
  if (direction === "up") return "#4ade80";
  if (direction === "down") return "#f87171";
  return "#eab308";
}

export default function ImpactPanel({ data, onClose, onOpenChart, quotes }: Props) {
  const arrow = dirArrow(data.direction);
  const color = dirColor(data.direction);
  return (
    <div
      className="absolute bottom-2 right-2 z-40 w-[260px] overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{
        maxHeight: 200,
        background: "rgba(10,11,15,0.94)",
        border: "1px solid rgba(212,175,55,0.45)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}
      >
        <span className="text-[11px]">⚡</span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "#D4AF37" }}
        >
          {data.regionLabel} Event Detected
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[12px] leading-none text-white/40 transition hover:text-white/80"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="px-2.5 py-2">
        <div className="mb-1.5 truncate text-[10px] text-white/45" title={data.event}>
          {data.event}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {data.assets.map((t) => {
            const q = quotes?.[t];
            const chg = q?.change ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onOpenChart?.(t)}
                className="flex items-center gap-0.5 rounded-[5px] px-1.5 py-[2px] text-[10px] font-semibold transition hover:brightness-125"
                style={{ background: "rgba(255,255,255,0.06)", color: "#e5e5e5" }}
                title={`Open chart · ${t}`}
              >
                {t}
                <span style={{ color, fontWeight: 700 }}>{arrow}</span>
                {q && q.price > 0 && (
                  <span className="ml-0.5 text-[9px] font-normal" style={{ color: chg >= 0 ? "#4ade80" : "#f87171" }}>
                    {fmtPrice(q.price)}
                    {Number.isFinite(chg) && chg !== 0 ? ` ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-[9.5px] leading-snug text-white/50">
          <span className="text-white/35">Grund: </span>
          {data.reason}
        </div>
      </div>
    </div>
  );
}
