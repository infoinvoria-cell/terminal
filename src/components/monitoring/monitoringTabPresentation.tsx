"use client";

import { Layers3, Star, Zap } from "lucide-react";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import { getMonitoringTabIconUrl } from "@/lib/monitoring/monitoringAssetIcons";

type TabIconProps = {
  tabId: MonitoringPrimaryTabId;
  active: boolean;
};

const ICON_SIZE = 18;

export function MonitoringTabIcon({ tabId, active }: TabIconProps) {
  const className = `monitoring-tab-icon ${active ? "is-active" : ""}`;

  if (tabId === "live") {
    return (
      <span className={className} aria-hidden>
        <Star
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          fill={active ? "currentColor" : "none"}
          className="monitoring-tab-icon-svg"
        />
      </span>
    );
  }

  if (tabId === "anomaly") {
    return (
      <span className={className} aria-hidden>
        <Zap
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          fill={active ? "currentColor" : "none"}
          className="monitoring-tab-icon-svg"
        />
      </span>
    );
  }

  if (tabId === "all") {
    return (
      <span className={className} aria-hidden>
        <Layers3
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          className="monitoring-tab-icon-svg"
        />
      </span>
    );
  }

  const iconUrl = getMonitoringTabIconUrl(tabId);

  if (!iconUrl) {
    return (
      <span className={className} aria-hidden>
        <span className="monitoring-tab-icon-fallback" />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden>
      <img
        src={iconUrl}
        alt=""
        className="monitoring-tab-icon-img"
        width={ICON_SIZE}
        height={ICON_SIZE}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
