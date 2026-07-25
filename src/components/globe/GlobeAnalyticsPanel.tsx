"use client";

import { useMemo } from "react";
import type { AssetItem, GeoEventItem, CommodityRegionItem, NewsItem } from "@/lib/globe/globe-types";

type GlobePriceData = {
  prices: Record<string, number>;
  changes: Record<string, number>;
};

type Props = {
  assets: AssetItem[];
  priceData: GlobePriceData;
  conflictEvents: GeoEventItem[];
  earthquakeEvents: GeoEventItem[];
  commodityStressRegions: CommodityRegionItem[];
  shippingDisruptionEvents: GeoEventItem[];
  globalNews: NewsItem[];
  onSelectAsset?: (id: string) => void;
};

const GOLD = "#e2ca7a";

function trafficLight(value: number, thresholds: { green: number; yellow: number; red: number; invert?: boolean }): { color: string; label: string } {
  const { green, yellow, red, invert } = thresholds;
  if (invert) {
    if (value <= green) return { color: "#22c55e", label: "Low" };
    if (value <= yellow) return { color: "#eab308", label: "Elevated" };
    return { color: "#ef4444", label: "High" };
  }
  if (value >= green) return { color: "#22c55e", label: "Strong" };
  if (value >= yellow) return { color: "#eab308", label: "Caution" };
  return { color: "#ef4444", label: "Weak" };
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  if (p >= 10000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "-";
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

function tileColor(changePct: number | undefined): string {
  if (changePct == null || !Number.isFinite(changePct)) return "rgba(255,255,255,0.06)";
  const clamped = Math.max(-5, Math.min(5, changePct));
  const intensity = Math.abs(clamped) / 5;
  if (clamped >= 0) {
    return `rgba(34,197,94,${(0.12 + intensity * 0.45).toFixed(3)})`;
  }
  return `rgba(239,68,68,${(0.12 + intensity * 0.45).toFixed(3)})`;
}

function tileBorder(changePct: number | undefined): string {
  if (changePct == null || !Number.isFinite(changePct)) return "rgba(255,255,255,0.08)";
  const clamped = Math.max(-5, Math.min(5, changePct));
  const intensity = Math.abs(clamped) / 5;
  if (clamped >= 0) {
    return `rgba(34,197,94,${(0.15 + intensity * 0.35).toFixed(3)})`;
  }
  return `rgba(239,68,68,${(0.15 + intensity * 0.35).toFixed(3)})`;
}

const BULLISH_WORDS = ["rally", "surge", "gain", "rise", "jump", "bull", "boom", "soar", "record high", "optimis", "recover", "strong", "upbeat", "positive"];
const BEARISH_WORDS = ["crash", "drop", "fall", "plunge", "sink", "bear", "slump", "tumble", "decline", "fear", "recession", "crisis", "warn", "negative", "sell-off", "selloff"];

function sentimentScore(title: string): number {
  const lower = title.toLowerCase();
  let score = 0;
  for (const w of BULLISH_WORDS) if (lower.includes(w)) score += 1;
  for (const w of BEARISH_WORDS) if (lower.includes(w)) score -= 1;
  return score;
}

export function GlobeAnalyticsPanel({
  assets,
  priceData,
  conflictEvents,
  earthquakeEvents,
  commodityStressRegions,
  shippingDisruptionEvents,
  globalNews,
  onSelectAsset,
}: Props) {
  const vix = priceData.prices["vix"] ?? null;
  const vixChg = priceData.changes["vix"] ?? null;
  const dxy = priceData.prices["dxy"] ?? null;
  const dxyChg = priceData.changes["dxy"] ?? null;
  const tnx = priceData.prices["tnx"] ?? null;
  const tnxChg = priceData.changes["tnx"] ?? null;

  const vixSignal = vix != null ? trafficLight(vix, { green: 15, yellow: 25, red: 30, invert: true }) : null;
  const dxySignal = dxy != null ? trafficLight(dxy, { green: 95, yellow: 105, red: 110, invert: true }) : null;

  const quakeCount = useMemo(
    () => earthquakeEvents.filter((e) => {
      const sev = String(e.severity ?? "").toLowerCase();
      return sev === "high" || sev === "critical" || (Number(e.label?.replace(/[^\d.]/g, "")) >= 5);
    }).length,
    [earthquakeEvents],
  );

  const sentiment = useMemo(() => {
    let bull = 0;
    let bear = 0;
    for (const item of globalNews) {
      const s = sentimentScore(item.title);
      if (s > 0) bull += 1;
      else if (s < 0) bear += 1;
    }
    const total = bull + bear;
    return { bull, bear, total, bullPct: total > 0 ? Math.round((bull / total) * 100) : 50 };
  }, [globalNews]);

  const SECTION = "rounded-lg border border-white/[0.06] bg-[rgba(12,13,18,0.55)] p-2.5";
  const SECTION_TITLE = "mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8d8f98]";

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-2.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
      {/* ── Macro Data ── */}
      <div className={SECTION}>
        <div className={SECTION_TITLE}>Macro Indicators</div>
        <div className="grid grid-cols-3 gap-2">
          {/* VIX */}
          <div className="rounded-md border border-white/[0.08] bg-[rgba(20,21,26,0.7)] p-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-white/50">VIX</span>
              {vixSignal && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: vixSignal.color }} title={vixSignal.label} />
              )}
            </div>
            <div className="mt-1 text-[16px] font-bold text-white">{vix != null ? fmtPrice(vix) : "-"}</div>
            <div className={`text-[10px] font-medium ${(vixChg ?? 0) >= 0 ? "text-red-400" : "text-green-400"}`}>
              {vixChg != null ? fmtPct(vixChg) : ""}
            </div>
          </div>
          {/* DXY */}
          <div className="rounded-md border border-white/[0.08] bg-[rgba(20,21,26,0.7)] p-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-white/50">DXY</span>
              {dxySignal && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dxySignal.color }} title={dxySignal.label} />
              )}
            </div>
            <div className="mt-1 text-[16px] font-bold text-white">{dxy != null ? fmtPrice(dxy) : "-"}</div>
            <div className={`text-[10px] font-medium ${(dxyChg ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {dxyChg != null ? fmtPct(dxyChg) : ""}
            </div>
          </div>
          {/* TNX */}
          <div className="rounded-md border border-white/[0.08] bg-[rgba(20,21,26,0.7)] p-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-white/50">TNX 10Y</span>
            </div>
            <div className="mt-1 text-[16px] font-bold text-white">{tnx != null ? `${fmtPrice(tnx)}%` : "-"}</div>
            <div className={`text-[10px] font-medium ${(tnxChg ?? 0) >= 0 ? "text-yellow-400" : "text-green-400"}`}>
              {tnxChg != null ? fmtPct(tnxChg) : ""}
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk Matrix ── */}
      <div className={SECTION}>
        <div className={SECTION_TITLE}>Risk Matrix</div>
        <div className="grid grid-cols-2 gap-2">
          <RiskTile label="Geopolitics" value={conflictEvents.length} suffix="hotspots" color={conflictEvents.length > 5 ? "#ef4444" : conflictEvents.length > 2 ? "#eab308" : "#22c55e"} />
          <RiskTile label="Earthquakes ≥5.0" value={quakeCount} suffix="24h" color={quakeCount > 5 ? "#ef4444" : quakeCount > 2 ? "#eab308" : "#22c55e"} />
          <RiskTile label="Commodity Stress" value={commodityStressRegions.length} suffix="regions" color={commodityStressRegions.length > 3 ? "#ef4444" : commodityStressRegions.length > 1 ? "#eab308" : "#22c55e"} />
          <RiskTile label="Ship Disruptions" value={shippingDisruptionEvents.length} suffix="active" color={shippingDisruptionEvents.length > 3 ? "#ef4444" : shippingDisruptionEvents.length > 1 ? "#eab308" : "#22c55e"} />
        </div>
      </div>

      {/* ── Asset Heatmap ── */}
      <div className={SECTION}>
        <div className={SECTION_TITLE}>Asset Performance</div>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-6 md:grid-cols-7">
          {assets.map((a) => {
            const chg = priceData.changes[a.id];
            const price = priceData.prices[a.id];
            const shortName = a.name.replace(/\s*\(.*\)/, "").split(" ")[0];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAsset?.(a.id)}
                className="group relative rounded border px-1 py-1.5 text-center transition hover:scale-105"
                style={{ backgroundColor: tileColor(chg), borderColor: tileBorder(chg) }}
                title={`${a.name}\n${price != null ? `$${fmtPrice(price)}` : ""}\n${chg != null ? fmtPct(chg) : ""}`}
              >
                <div className="truncate text-[8px] font-semibold text-white/80">{shortName}</div>
                <div className={`text-[9px] font-bold ${(chg ?? 0) >= 0 ? "text-green-300" : "text-red-300"}`}>
                  {chg != null ? fmtPct(chg) : "-"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── News Sentiment ── */}
      <div className={SECTION}>
        <div className={SECTION_TITLE}>News Sentiment</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-green-400">{sentiment.bullPct}% Bull</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-red-500/30">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${sentiment.bullPct}%`,
                background: `linear-gradient(90deg, rgba(34,197,94,0.7), rgba(34,197,94,0.4))`,
              }}
            />
          </div>
          <span className="text-[10px] font-semibold text-red-400">{100 - sentiment.bullPct}% Bear</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[9px] text-white/40">
          <span>{sentiment.bull} positive headlines</span>
          <span>{sentiment.bear} negative headlines</span>
        </div>
        <div className="mt-0.5 text-[8px] text-white/25">{globalNews.length} articles analyzed</div>
      </div>
    </div>
  );
}

function RiskTile({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[rgba(20,21,26,0.7)] px-2.5 py-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <div className="text-[9px] text-white/50">{label}</div>
        <div className="text-[13px] font-bold text-white">
          {value} <span className="text-[9px] font-normal text-white/40">{suffix}</span>
        </div>
      </div>
    </div>
  );
}
