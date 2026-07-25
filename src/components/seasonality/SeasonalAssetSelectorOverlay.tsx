"use client";

import { useEffect, useRef } from "react";
import { SEASONAL_CSV_ASSETS, type SeasonalAssetDef } from "@/lib/seasonality/walkForward/assetManifest";
import { getSeasonalityRegistryDefinitions } from "@/lib/seasonality/seasonalityAssetRegistry";
import styles from "./seasonal.module.css";
import { SeasonalityMonitoringAssetIcon } from "./SeasonalityMonitoringAssetIcon";

interface Props {
  selectedAssetId: string;
  onSelect: (assetId: string) => void;
  onClose: () => void;
}

const CATEGORY_ORDER = ["Agrar", "Energie", "Metalle", "FX", "Indizes", "Aktien"] as const;

const registryByAssetId = new Map(
  getSeasonalityRegistryDefinitions()
    .filter((d) => d.enabled)
    .map((d) => [d.assetId, d] as const),
);

export function SeasonalAssetSelectorOverlay({ selectedAssetId, onSelect, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const availableAssets = SEASONAL_CSV_ASSETS;

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    assets: availableAssets.filter((a) => a.category === cat),
  })).filter((g) => g.assets.length > 0);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onBackdropClick}
    >
      <div className={`w-full max-w-[560px] rounded-[10px] border border-[#111] bg-[#080808] p-5 shadow-2xl ${styles.assetOverlayScroll}`} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[12px] font-medium text-[#F0F3F7]">Select Asset</span>
          <div className="flex items-center gap-3">
            <span className={styles.assetOverlayHint}>Historical CSV · Research only</span>
            <button type="button" onClick={onClose} className={styles.assetOverlayClose} aria-label="Close">×</button>
          </div>
        </div>

        {/* Asset groups */}
        <div className="space-y-4">
          {byCategory.map(({ cat, assets }) => (
            <div key={cat}>
              <div className={styles.assetOverlayGroupLabel}>{cat}</div>
              <div className={`grid gap-1.5 ${assets.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                {assets.map((asset) => {
                  const reg = registryByAssetId.get(asset.assetId);
                  return (
                  <AssetBtn
                    key={asset.assetId}
                    asset={asset}
                    monitoringSymbol={reg?.monitoringSymbol ?? asset.symbol}
                    selected={asset.assetId === selectedAssetId}
                    onSelect={() => { onSelect(asset.assetId); onClose(); }}
                  />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-[#0f0f0f] pt-3 text-[8px] text-[#1a1a1a]">
          TradingView continuous futures · Backadjustment unconfirmed · usedAsLiveSignal=false
        </div>
      </div>
    </div>
  );
}

function AssetBtn({
  asset,
  monitoringSymbol,
  selected,
  onSelect,
}: {
  asset: SeasonalAssetDef;
  monitoringSymbol: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${styles.assetOverlayAssetBtn}${selected ? ` ${styles.assetOverlayAssetBtnSelected}` : ""}`}
    >
      <span className={styles.assetOverlayIconSlot}>
        <SeasonalityMonitoringAssetIcon
          assetId={asset.assetId}
          category={asset.category}
          assetName={asset.displayNameShort}
          assetSymbol={monitoringSymbol}
          selectorMode
          className="h-[16px] w-[16px] shrink-0"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`truncate ${styles.assetOverlayAssetName}`}>
          {asset.displayNameShort}
        </div>
        <div className={`truncate ${styles.assetOverlayAssetSymbol}`}>{monitoringSymbol}</div>
      </div>
      {selected && <span className={styles.assetOverlayCheck}>✓</span>}
    </button>
  );
}
