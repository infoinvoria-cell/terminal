"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import MonitoringChart, { type MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import StrategyTesterPanel from "@/components/monitoring/StrategyTesterPanel";
import type { StrategyPerformanceResult } from "@/lib/monitoring/types";

type Props = {
  open: boolean;
  onClose: () => void;
  chartData: MonitoringChartData | null;
  symbol: string | null;
  assetName: string | null;
  strategyName: string | null;
  hasStrategy: boolean;
  showStrategyTester: boolean;
  testerLoading: boolean;
  performance: StrategyPerformanceResult | null;
};

export default function FullscreenChartModal({
  open,
  onClose,
  chartData,
  symbol,
  assetName,
  strategyName,
  hasStrategy,
  showStrategyTester,
  testerLoading,
  performance,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fullscreen-modal">
      <div className="fullscreen-topbar">
        <div className="fullscreen-title">{symbol ?? "-"} {assetName ?? ""}</div>
        <button type="button" className="fullscreen-close" onClick={onClose} aria-label="Close fullscreen">
          <X size={14} />
        </button>
      </div>

      <div className={`fullscreen-body ${showStrategyTester ? "with-tester" : ""}`}>
        <div className="fullscreen-chart-wrap">
          {chartData ? (
            <MonitoringChart
              data={chartData}
              maxBars={0}
              showFullscreenControl={true}
              isFullscreen={true}
              onFullscreenRequest={onClose}
            />
          ) : (
            <div className="fullscreen-empty">No chart data</div>
          )}
        </div>

        {showStrategyTester ? (
          <StrategyTesterPanel
            symbol={symbol}
            assetName={assetName}
            strategyName={strategyName}
            hasStrategy={hasStrategy}
            loading={testerLoading}
            performance={performance}
          />
        ) : null}
      </div>
    </div>
  );
}
