"use client";

import { useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import {
  getSeasonalitySelectorEmoji,
  shouldUseMonitoringPngInSelector,
} from "@/lib/seasonality/seasonalitySelectorIcons";
import { NEUTRAL_ASSET_FALLBACK } from "@/lib/assetIconStrict";

function parseIconSizePx(className: string): number {
  const h = className.match(/(?:^|\s)(?:!)?h-\[(\d+)px\]/);
  if (h) return Number(h[1]);
  const w = className.match(/(?:^|\s)(?:!)?w-\[(\d+)px\]/);
  if (w) return Number(w[1]);
  return 13;
}

function EmojiIcon({ emoji, className, size }: { emoji: string; className?: string; size: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className ?? ""}`}
      style={{ fontSize: Math.max(10, Math.round(size * 0.95)), width: size, height: size }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

export function SeasonalityMonitoringAssetIcon({
  assetId,
  assetName,
  assetSymbol,
  category,
  prefetchedIconUrl,
  className,
  /** Asset selector: emoji-first, single icon only — no dual PNG / forex pairs */
  selectorMode = false,
}: {
  assetId: string;
  iconKey?: string;
  category?: string;
  assetName?: string;
  assetSymbol?: string;
  prefetchedIconUrl?: string | null;
  className?: string;
  selectorMode?: boolean;
}) {
  const code = String(assetSymbol || "").trim();
  const size = parseIconSizePx(className ?? "");
  const [monitoringBroken, setMonitoringBroken] = useState(false);

  if (selectorMode) {
    const emoji = getSeasonalitySelectorEmoji(assetId, code);
    if (emoji) return <EmojiIcon emoji={emoji} className={className} size={size} />;

    if (shouldUseMonitoringPngInSelector(code, category)) {
      const monitoringUrl =
        prefetchedIconUrl ??
        getMonitoringAssetIconUrl({
          code,
          displaySymbol: code,
          assetId,
          name: assetName ?? "",
          source: code,
          tv: code,
        });
      if (monitoringUrl && !monitoringBroken) {
        return (
          <img
            src={monitoringUrl}
            alt=""
            className={className}
            draggable={false}
            width={size}
            height={size}
            style={{ width: size, height: size, objectFit: "contain" }}
            onError={() => setMonitoringBroken(true)}
          />
        );
      }
    }

    return <EmojiIcon emoji={NEUTRAL_ASSET_FALLBACK} className={className} size={size} />;
  }

  const monitoringUrl =
    prefetchedIconUrl ??
    getMonitoringAssetIconUrl({
      code,
      displaySymbol: code,
      assetId,
      name: assetName ?? "",
      source: code,
      tv: code,
    });

  if (monitoringUrl && !monitoringBroken) {
    return (
      <img
        src={monitoringUrl}
        alt=""
        className={className}
        draggable={false}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        onError={() => setMonitoringBroken(true)}
      />
    );
  }

  const emoji = getSeasonalitySelectorEmoji(assetId, code);
  if (emoji) return <EmojiIcon emoji={emoji} className={className} size={size} />;

  return <EmojiIcon emoji={NEUTRAL_ASSET_FALLBACK} className={className} size={size} />;
}
