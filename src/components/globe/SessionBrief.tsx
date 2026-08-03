"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetItem, GeoEventItem } from "@/lib/globe/globe-types";
import { nextMacroEvent } from "@/lib/globe/macroEvents";

type Props = {
  geoEvents: GeoEventItem[];
  changes: Record<string, number>;
  assets: AssetItem[];
  patternCount: number;
  alertCount: number;
  onClose: () => void;
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "live";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SessionBrief({ geoEvents, changes, assets, patternCount, alertCount, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  const eventCounts = useMemo(() => {
    let conflicts = 0, quakes = 0, fires = 0;
    for (const e of geoEvents) {
      const t = String(e.type || e.event_type || "").toLowerCase();
      if (t.includes("conflict")) conflicts++;
      else if (t.includes("earthquake")) quakes++;
      else if (t.includes("wildfire")) fires++;
    }
    return { conflicts, quakes, fires };
  }, [geoEvents]);

  const movers = useMemo(() => {
    const nameById = new Map(assets.map((a) => [a.id, a.symbol || a.name]));
    const list = Object.entries(changes)
      .filter(([id, pct]) => nameById.has(id) && Number.isFinite(pct) && Math.abs(pct) >= 0.01)
      .map(([id, pct]) => ({ label: nameById.get(id) as string, pct }));
    const up = [...list].sort((a, b) => b.pct - a.pct).slice(0, 3).filter((m) => m.pct > 0);
    const down = [...list].sort((a, b) => a.pct - b.pct).slice(0, 3).filter((m) => m.pct < 0);
    return { up, down };
  }, [changes, assets]);

  const nextMacro = useMemo(() => nextMacroEvent(now), [now]);

  const Row = ({ label, pct }: { label: string; pct: number }) => (
    <div className="flex items-center justify-between text-[10px]">
      <span className="truncate text-white/70">{label}</span>
      <span className="tabular-nums font-semibold" style={{ color: pct >= 0 ? "#22C55E" : "#EF4444" }}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
    </div>
  );

  return (
    <div
      className="absolute left-3 top-12 z-40 flex w-[250px] flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{ maxHeight: 400, background: "rgba(9,10,14,0.96)", border: "1px solid rgba(212,175,55,0.4)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}>
        <span className="text-[11px]">📋</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#C9A84C" }}>Session Brief</span>
        <button type="button" onClick={onClose} className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80" aria-label="Close">×</button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2.5">
        {/* Events */}
        <div>
          <div className="mb-1 text-[8.5px] font-bold uppercase tracking-wide text-white/35">Aktive Events</div>
          <div className="flex gap-2 text-[10px] text-white/70">
            <span>⚔ {eventCounts.conflicts}</span>
            <span>🌋 {eventCounts.quakes}</span>
            <span>🔥 {eventCounts.fires}</span>
          </div>
        </div>

        {/* Next macro */}
        <div>
          <div className="mb-1 text-[8.5px] font-bold uppercase tracking-wide text-white/35">Nächstes Makro-Event</div>
          {nextMacro ? (
            <div className="flex items-center justify-between text-[10px]">
              <span className="truncate text-white/75">{nextMacro.label}</span>
              <span className="tabular-nums font-semibold text-[#C9A84C]">{fmtCountdown(nextMacro.ms)}</span>
            </div>
          ) : (
            <div className="text-[10px] text-white/30">—</div>
          )}
        </div>

        {/* Movers */}
        <div>
          <div className="mb-1 text-[8.5px] font-bold uppercase tracking-wide text-white/35">Top Mover</div>
          {movers.up.length === 0 && movers.down.length === 0 ? (
            <div className="text-[10px] text-white/30">Keine Bewegung</div>
          ) : (
            <div className="space-y-0.5">
              {movers.up.map((m, i) => <Row key={`u${i}`} label={m.label} pct={m.pct} />)}
              {movers.down.map((m, i) => <Row key={`d${i}`} label={m.label} pct={m.pct} />)}
            </div>
          )}
        </div>

        {/* Signals */}
        <div className="flex gap-2 border-t border-white/[0.06] pt-2 text-[10px]">
          <span className="flex-1 text-white/60">⚡ {patternCount} Pattern{patternCount === 1 ? "" : "s"}</span>
          <span className="flex-1 text-white/60">🔔 {alertCount} Alert{alertCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
