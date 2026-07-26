"use client";

import { useState } from "react";
import { REGION_LABELS } from "@/lib/globe/eventImpactMap";

export type AlertRule = {
  id: string;
  assetId: string;
  ticker: string;
  threshold: number; // absolute % threshold
  direction: "any" | "up" | "down";
  region: string | null; // optional: require an event in this region too
};

type AssetOption = { id: string; label: string };

type Props = {
  rules: AlertRule[];
  assetOptions: AssetOption[];
  changes: Record<string, number>;
  triggeredIds: Set<string>;
  onAdd: (rule: AlertRule) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
};

const REGION_OPTIONS = Object.entries(REGION_LABELS);

export default function AlertsPanel({ rules, assetOptions, changes, triggeredIds, onAdd, onRemove, onClose }: Props) {
  const [assetId, setAssetId] = useState(assetOptions[0]?.id ?? "");
  const [direction, setDirection] = useState<AlertRule["direction"]>("any");
  const [threshold, setThreshold] = useState("2");
  const [region, setRegion] = useState<string>("");

  const add = () => {
    const opt = assetOptions.find((a) => a.id === assetId);
    if (!opt) return;
    const thr = Math.abs(Number(threshold)) || 2;
    onAdd({
      id: `${assetId}-${direction}-${thr}-${region || "any"}-${rules.length}`,
      assetId,
      ticker: opt.label,
      threshold: thr,
      direction,
      region: region || null,
    });
  };

  return (
    <div
      className="absolute left-3 top-12 z-40 flex w-[270px] flex-col overflow-hidden rounded-[10px] backdrop-blur-md"
      style={{ maxHeight: 380, background: "rgba(9,10,14,0.96)", border: "1px solid rgba(248,113,113,0.4)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(248,113,113,0.2)" }}>
        <span className="text-[11px]">🔔</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f87171" }}>Alerts</span>
        <button type="button" onClick={onClose} className="ml-auto text-[13px] leading-none text-white/40 transition hover:text-white/80" aria-label="Close">×</button>
      </div>

      {/* Builder */}
      <div className="flex flex-col gap-1.5 px-2.5 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex gap-1">
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="min-w-0 flex-1 rounded bg-white/[0.06] px-1.5 py-1 text-[10px] text-white/85 outline-none"
          >
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id} style={{ background: "#12141a" }}>{a.label}</option>
            ))}
          </select>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as AlertRule["direction"])}
            className="shrink-0 rounded bg-white/[0.06] px-1 py-1 text-[10px] text-white/85 outline-none"
          >
            <option value="any" style={{ background: "#12141a" }}>±</option>
            <option value="up" style={{ background: "#12141a" }}>↑</option>
            <option value="down" style={{ background: "#12141a" }}>↓</option>
          </select>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-10 shrink-0 rounded bg-white/[0.06] px-1 py-1 text-center text-[10px] text-white/85 outline-none"
            inputMode="decimal"
          />
          <span className="shrink-0 self-center text-[10px] text-white/40">%</span>
        </div>
        <div className="flex gap-1">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="min-w-0 flex-1 rounded bg-white/[0.06] px-1.5 py-1 text-[10px] text-white/75 outline-none"
          >
            <option value="" style={{ background: "#12141a" }}>Kein Event nötig</option>
            {REGION_OPTIONS.map(([key, label]) => (
              <option key={key} value={key} style={{ background: "#12141a" }}>+ Event: {label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            className="shrink-0 rounded px-2.5 py-1 text-[10px] font-semibold transition hover:brightness-110"
            style={{ background: "rgba(248,113,113,0.2)", color: "#f87171" }}
          >
            + Alert
          </button>
        </div>
      </div>

      {/* Rule list */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {rules.length === 0 && <div className="py-6 text-center text-[10px] text-white/30">Noch keine Alerts</div>}
        {rules.map((r) => {
          const chg = changes[r.assetId];
          const triggered = triggeredIds.has(r.id);
          const dirSym = r.direction === "up" ? "↑" : r.direction === "down" ? "↓" : "±";
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{ background: triggered ? "rgba(248,113,113,0.12)" : "transparent" }}
            >
              <span className="text-[11px]">{triggered ? "🔴" : "○"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-semibold text-white/85">
                  {r.ticker} {dirSym}{r.threshold}%
                </div>
                <div className="truncate text-[8.5px] text-white/40">
                  {r.region ? `+ Event ${REGION_LABELS[r.region] ?? r.region}` : "Preis-Only"}
                  {typeof chg === "number" ? ` · jetzt ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="shrink-0 text-[12px] leading-none text-white/30 transition hover:text-white/70"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
