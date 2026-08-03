"use client";

import { useCallback, useEffect, useState } from "react";

import type { SavedSeasonalPattern, WFResearchGateStatus } from "@/lib/seasonality/walkForward/types";

const C_WHITE = "#ffffff";
const C_GOLD = "#C9A84C";
const C_MUTED = "#5a5a5a";

interface Props {
  assetId: string;
  activePatternId: string | null;
  onSelect: (p: SavedSeasonalPattern) => void;
  refreshKey?: number;
}

function GateBadge({ status }: { status: WFResearchGateStatus }) {
  if (status === "PASSED_RESEARCH_GATE") {
    return (
      <span className="rounded-[3px] border border-[rgba(255,255,255,0.2)] px-1.5 py-0.5 text-[8px] text-white">
        Research
      </span>
    );
  }
  if (status === "FAILED_RESEARCH_GATE") {
    return (
      <span
        className="rounded-[3px] border border-[rgba(220,196,118,0.3)] px-1.5 py-0.5 text-[8px]"
        style={{ color: C_GOLD }}
      >
        Failed
      </span>
    );
  }
  return <span className="rounded-[3px] border border-[#1a1a1a] px-1.5 py-0.5 text-[8px] text-[#4a4a4a]">--</span>;
}

function pctStr(value: number | null): string {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

export function SavedSeasonalPatternsPanel({ assetId, activePatternId, onSelect, refreshKey }: Props) {
  const [patterns, setPatterns] = useState<SavedSeasonalPattern[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPatterns = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listSavedPatterns", assetId }),
      });
      const data = await res.json() as { patterns?: SavedSeasonalPattern[] };
      setPatterns(data.patterns ?? []);
    } catch {
      setPatterns([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns, refreshKey]);

  if (loading) {
    return <div className="py-4 text-center text-[10px] text-[#3a3a3a]">Loading patterns...</div>;
  }

  if (patterns.length === 0) {
    return (
      <div className="py-4 text-center">
        <div className="text-[10px] text-[#3a3a3a]">No saved patterns for this asset.</div>
        <div className="mt-1 text-[9px] text-[#2a2a2a]">
          Run walk-forward and save a validated research pattern to populate this list.
        </div>
        <div className="mt-1 text-[8px] text-[#1f1f1f]">Research-only patterns appear here after validation.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1">
        {patterns.map((pattern) => {
          const isActive = pattern.patternId === activePatternId;
          return (
            <button
              key={pattern.patternId}
              type="button"
              onClick={() => onSelect(pattern)}
              className="w-full rounded-[5px] border px-3 py-2 text-left transition-colors"
              style={{
                borderColor: isActive ? "rgba(255,255,255,0.15)" : "#111",
                backgroundColor: isActive ? "rgba(255,255,255,0.04)" : "#060606",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-white">{pattern.name}</span>
                <GateBadge status={pattern.gateStatus} />
              </div>
              <div className="mt-1 flex items-center gap-3 text-[9px]">
                <span style={{ color: pattern.direction === "LONG" ? C_WHITE : C_GOLD }}>{pattern.direction}</span>
                <span className="text-[#3a3a3a]">Entry {pattern.entryMonthDay}</span>
                <span className="text-[#3a3a3a]">{pattern.holdingTradingDays}d hold</span>
                {pattern.researchRating ? (
                  <span className="rounded-[3px] border border-[rgba(255,255,255,0.08)] px-1 py-[1px] text-[8px] text-[#cfcfc7]">
                    {pattern.researchRating}
                  </span>
                ) : null}
                <span
                  className="ml-auto"
                  style={{ color: pattern.oosReturn != null ? (pattern.oosReturn >= 0 ? C_WHITE : C_GOLD) : C_MUTED }}
                >
                  {pctStr(pattern.oosReturn)}
                </span>
                {pattern.oosWinRate != null ? (
                  <span style={{ color: pattern.oosWinRate >= 0.5 ? C_WHITE : C_GOLD }}>
                    WR {(pattern.oosWinRate * 100).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[8px] text-[#1f1f1f]">
        Saved patterns are research-only and remain excluded from live promotion.
      </div>
    </div>
  );
}
