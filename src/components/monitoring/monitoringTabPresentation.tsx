"use client";

import { Layers3, Star, Zap } from "lucide-react";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import { getMonitoringTabIconUrl } from "@/lib/monitoring/monitoringAssetIcons";

type TabIconProps = {
  tabId: MonitoringPrimaryTabId;
  active: boolean;
  dataStatus?: "ok" | "partial" | "missing" | "loading";
};

const ICON_SIZE = 18;

const STATUS_DOT: Record<string, { color: string; title: string }> = {
  // ok deliberately omitted — "data loaded" is not a backend signal, no decorative green dot
  partial: { color: "#C9A84C", title: "Teilweise geladen" },
  missing: { color: "#EF4444", title: "Daten fehlen" },
};

export function MonitoringTabIcon({ tabId, active, dataStatus }: TabIconProps) {
  const className = `monitoring-tab-icon ${active ? "is-active" : ""}`;
  const dot = dataStatus ? STATUS_DOT[dataStatus] : null;

  const dotEl = dot ? (
    <span
      style={{
        position: "absolute", top: 1, right: 1, width: 6, height: 6,
        borderRadius: "50%", background: dot.color,
        boxShadow: `0 0 4px ${dot.color}88`,
      }}
      title={dot.title}
      aria-label={dot.title}
    />
  ) : null;

  if (tabId === "live") {
    return (
      <span className={className} aria-hidden style={{ position: "relative" }}>
        <Star
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          fill={active ? "currentColor" : "none"}
          className="monitoring-tab-icon-svg"
        />
        {dotEl}
      </span>
    );
  }

  if (tabId === "anomaly") {
    return (
      <span className={className} aria-hidden style={{ position: "relative" }}>
        <Zap
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          fill={active ? "currentColor" : "none"}
          className="monitoring-tab-icon-svg"
        />
        {dotEl}
      </span>
    );
  }

  if (tabId === "all") {
    return (
      <span className={className} aria-hidden style={{ position: "relative" }}>
        <Layers3
          size={ICON_SIZE}
          strokeWidth={active ? 2 : 1.6}
          className="monitoring-tab-icon-svg"
        />
        {dotEl}
      </span>
    );
  }

  if (tabId === "fx") {
    return (
      <span className={className} aria-hidden style={{ position: "relative" }}>
        <img
          src="/asset-icons/eurusd.png"
          alt=""
          className="monitoring-tab-icon-img"
          width={ICON_SIZE}
          height={ICON_SIZE}
          decoding="async"
          draggable={false}
        />
        {dotEl}
      </span>
    );
  }

  const iconUrl = getMonitoringTabIconUrl(tabId);

  if (!iconUrl) {
    return (
      <span className={className} aria-hidden style={{ position: "relative" }}>
        <span className="monitoring-tab-icon-fallback" />
        {dotEl}
      </span>
    );
  }

  return (
    <span className={className} aria-hidden style={{ position: "relative" }}>
      <img
        src={iconUrl}
        alt=""
        className="monitoring-tab-icon-img"
        width={ICON_SIZE}
        height={ICON_SIZE}
        decoding="async"
        draggable={false}
      />
      {dotEl}
    </span>
  );
}
