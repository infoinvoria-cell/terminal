"use client";

import { useMemo, useState } from "react";
import { SCENARIOS } from "@/lib/globe/scenarios";
import { IMPACT_SYMBOL_TO_ID } from "@/lib/globe/eventImpactMap";

type Props = {
  prices: Record<string, number>;
  onHighlight: (assetIds: string[]) => void;
  onOpenChart: (ticker: string) => void;
  onClose: () => void;
};

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function ScenarioStress({ prices, onHighlight, onOpenChart, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string>(SCENARIOS[0].id);
  const scenario = useMemo(() => SCENARIOS.find((s) => s.id === selectedId) ?? SCENARIOS[0], [selectedId]);

  const rows = useMemo(
    () =>
      scenario.effects.map((e) => {
        const id = IMPACT_SYMBOL_TO_ID[e.ticker];
        const price = id ? prices[id] ?? 0 : 0;
        const projected = price > 0 ? price * (1 + e.pct / 100) : 0;
        return { ...e, id, price, projected };
      }),
    [scenario, prices],
  );

  const selectScenario = (id: string) => {
    setSelectedId(id);
    const s = SCENARIOS.find((x) => x.id === id);
    if (s) onHighlight(s.effects.map((e) => IMPACT_SYMBOL_TO_ID[e.ticker]).filter(Boolean) as string[]);
  };

  return (
    <div
      className="absolute left-3 top-12 z-40 flex w-[270px] flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{ maxHeight: 380, background: "rgba(9,10,14,0.96)", border: "1px solid rgba(212,175,55,0.4)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}>
        <span className="text-[11px]">⚗️</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#D4AF37" }}>Scenario Stress</span>
        <button type="button" onClick={onClose} className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80" aria-label="Close">×</button>
      </div>

      {/* Scenario chips */}
      <div className="flex flex-wrap gap-1 px-2 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectScenario(s.id)}
            className="rounded-[6px] px-1.5 py-[3px] text-[8.5px] font-semibold transition"
            style={{
              background: s.id === selectedId ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.05)",
              color: s.id === selectedId ? "#D4AF37" : "rgba(255,255,255,0.5)",
            }}
            title={s.description}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-2.5 py-1.5 text-[9px] text-white/40">{scenario.description}</div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-1">
        {rows.map((r) => {
          const up = r.pct >= 0;
          return (
            <button
              key={r.ticker}
              type="button"
              onClick={() => onOpenChart(r.ticker)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-white/[0.04]"
              title={`Open chart · ${r.ticker}`}
            >
              <span className="w-12 shrink-0 text-[10px] font-semibold text-white/85">{r.ticker}</span>
              <span className="shrink-0 text-[10px] font-bold tabular-nums" style={{ color: up ? "#4ade80" : "#f87171" }}>
                {up ? "+" : ""}{r.pct}%
              </span>
              <span className="ml-auto shrink-0 text-[9px] tabular-nums text-white/45">
                {r.price > 0 ? (
                  <>
                    {fmtPrice(r.price)} <span className="text-white/25">→</span>{" "}
                    <span style={{ color: up ? "#4ade80" : "#f87171" }}>{fmtPrice(r.projected)}</span>
                  </>
                ) : "—"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-2.5 py-1 text-[7.5px] leading-tight text-white/25" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        Directional estimates for planning — not forecasts.
      </div>
    </div>
  );
}
