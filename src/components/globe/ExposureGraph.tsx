"use client";

import { useMemo } from "react";
import { buildExposure } from "@/lib/globe/exposure";

type Props = {
  assetId: string;
  assetName: string;
  onSelectAsset: (assetId: string) => void;
  onClose: () => void;
};

type Node = { id: string; label: string; type: "region" | "scenario" | "peer"; assetId?: string | null; sub?: string };

const TYPE_COLOR: Record<Node["type"], string> = {
  region: "#9ca3af",
  scenario: "#D4AF37",
  peer: "#5eead4",
};

export default function ExposureGraph({ assetId, assetName, onSelectAsset, onClose }: Props) {
  const exposure = useMemo(() => buildExposure(assetId), [assetId]);

  const nodes: Node[] = useMemo(() => {
    if (!exposure) return [];
    return [
      ...exposure.regions.map((r) => ({ id: `region:${r.region}`, label: r.label, type: "region" as const, sub: r.direction })),
      ...exposure.scenarios.map((s) => ({ id: `scen:${s.id}`, label: s.label, type: "scenario" as const, sub: `${s.pct >= 0 ? "+" : ""}${s.pct}%` })),
      ...exposure.peers.map((p) => ({ id: `peer:${p.ticker}`, label: p.ticker, type: "peer" as const, assetId: p.assetId })),
    ];
  }, [exposure]);

  const W = 280;
  const H = 250;
  const cx = W / 2;
  const cy = H / 2;
  const R = 96;

  const placed = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  return (
    <div
      className="absolute left-3 top-12 z-40 flex flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{ width: W + 20, background: "rgba(9,10,14,0.96)", border: "1px solid rgba(94,234,212,0.4)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(94,234,212,0.2)" }}>
        <span className="text-[11px]">🕸</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#5eead4" }}>Exposure · {assetName}</span>
        <button type="button" onClick={onClose} className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80" aria-label="Close">×</button>
      </div>

      {!exposure ? (
        <div className="px-3 py-8 text-center text-[10px] text-white/35">Keine Exposure-Daten für dieses Asset.</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
            {placed.map((n) => (
              <line key={`l-${n.id}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={TYPE_COLOR[n.type]} strokeOpacity={0.28} strokeWidth={1} />
            ))}
            {/* center node */}
            <circle cx={cx} cy={cy} r={22} fill="rgba(94,234,212,0.14)" stroke="#5eead4" strokeWidth={1.4} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#e5fffb">{exposure.ticker}</text>
            {placed.map((n) => {
              const clickable = n.type === "peer" && n.assetId;
              return (
                <g
                  key={n.id}
                  style={{ cursor: clickable ? "pointer" : "default" }}
                  onClick={() => clickable && onSelectAsset(n.assetId as string)}
                >
                  <circle cx={n.x} cy={n.y} r={n.type === "peer" ? 15 : 13} fill="rgba(15,17,22,0.95)" stroke={TYPE_COLOR[n.type]} strokeWidth={1.2} />
                  <text x={n.x} y={n.y + 2.5} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={TYPE_COLOR[n.type]}>
                    {n.label.length > 8 ? `${n.label.slice(0, 7)}…` : n.label}
                  </text>
                  {n.sub && (
                    <text x={n.x} y={n.y + 24} textAnchor="middle" fontSize={6.5} fill="rgba(255,255,255,0.4)">{n.sub}</text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="flex items-center gap-3 px-3 py-1.5 text-[8px]" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR.region }} />Regionen</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR.scenario }} />Szenarien</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR.peer }} />Peers</span>
          </div>
        </>
      )}
    </div>
  );
}
