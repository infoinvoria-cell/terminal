"use client";

import { useMemo, useState } from "react";

import { AssetIcon, shortName } from "@/lib/globe/icons";
import type { AssetItem, OverlayToggleState } from "@/lib/globe/globe-types";

type Props = {
  assets: AssetItem[];
  enabledSet: Set<string>;
  categoryEnabled: Record<string, boolean>;
  selectedAssetId: string;
  performanceMode?: boolean;
  goldThemeEnabled?: boolean;
  compactAssetLabels?: boolean;
  hideOverlayControls?: boolean;
  onSelectAsset: (assetId: string) => void;
  onToggleAsset: (assetId: string) => void;
  onToggleCategory: (category: string) => void;
  onAllOn: () => void;
  onAllOff: () => void;
  onRefreshData?: () => void;
  overlayState: OverlayToggleState;
  overlayLoadingState?: Partial<Record<keyof OverlayToggleState, boolean>>;
  onToggleOverlay: (key: keyof OverlayToggleState) => void;
};

type OverlayOption = {
  key: keyof OverlayToggleState;
  label: string;
  description: string;
};

const CATEGORY_ORDER = ["Cross Pairs", "FX", "Major FX", "Metals", "Equities", "Crypto", "Energy", "Agriculture", "Softs", "Livestock", "Commodities", "Bonds", "Stocks"];

function formatFxSymbol(symbol: string): string {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(raw)) return raw;
  return `${raw.slice(0, 3)}/${raw.slice(3, 6)}`;
}

function compactLabel(asset: AssetItem): string {
  const isFxCategory = asset.category === "FX" || asset.category === "Cross Pairs" || asset.category === "Major FX";
  if (isFxCategory) {
    const fx = formatFxSymbol(asset.symbol);
    if (fx) return fx;
  }
  return shortName(asset.name, 11);
}

function TinyToggle({
  checked,
  goldThemeEnabled = false,
  onClick,
}: {
  checked: boolean;
  goldThemeEnabled?: boolean;
  onClick: () => void;
}) {
  const accentBg = goldThemeEnabled ? "bg-[#e2ca7a]/28" : "bg-white/15";
  const accentBorder = goldThemeEnabled ? "border-[#e2ca7a]/70" : "border-white/40";
  const knobColor = goldThemeEnabled ? "bg-[#e2ca7a] shadow-[0_0_8px_rgba(226,202,122,.72)]" : "bg-white shadow-none";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-[14px] w-[24px] rounded-full border transition ${
        checked ? `${accentBorder} ${accentBg}` : "border-slate-600/70 bg-slate-800/70"
      }`}
      title={checked ? "On" : "Off"}
      aria-label={checked ? "On" : "Off"}
    >
      <span
        className={`absolute top-[1px] h-[10px] w-[10px] rounded-full transition ${
          checked ? `left-[11px] ${knobColor}` : "left-[1px] bg-slate-400"
        }`}
      />
    </button>
  );
}

const OVERLAY_OPTIONS_CORE: OverlayOption[] = [
  {
    key: "earthquakes",
    label: "Earthquakes",
    description: "Shows global earthquake events with magnitude and severity levels.",
  },
  {
    key: "conflicts",
    label: "Conflicts",
    description: "Displays active conflict zones and conflict-related geopolitical events.",
  },
  {
    key: "wildfires",
    label: "Wildfires",
    description: "Highlights major wildfire events and affected regions.",
  },
  {
    key: "shipTracking",
    label: "Ship Tracking",
    description: "Shows global tanker and container ship positions and routes.",
  },
  {
    key: "oilRoutes",
    label: "Oil Routes",
    description: "Visualizes major oil tanker corridors and flow directions.",
  },
  {
    key: "containerTraffic",
    label: "Container Traffic",
    description: "Maps container shipping traffic between major global ports.",
  },
  {
    key: "commodityRegions",
    label: "Commodity Regions",
    description: "Highlights major production regions for key global commodities.",
  },
  {
    key: "globalLiquidityMap",
    label: "Global Liquidity",
    description: "Displays regional liquidity conditions from central banks, USD funding stress and capital flows.",
  },
];

const OVERLAY_OPTIONS_ADVANCED: OverlayOption[] = [
  {
    key: "globalRiskLayer",
    label: "Global Risk Layer",
    description: "Shows macro risk-on and risk-off conditions by region.",
  },
  {
    key: "shippingDisruptions",
    label: "Shipping Disruptions",
    description: "Marks congestion and disruption hotspots across key maritime chokepoints.",
  },
  {
    key: "commodityStressMap",
    label: "Commodity Stress",
    description: "Highlights commodity regions with elevated supply-side stress.",
  },
  {
    key: "regionalAssetHighlight",
    label: "Regional Highlight",
    description: "Highlights mapped regions when an asset is selected.",
  },
];

export function SettingsPanel({
  assets,
  enabledSet,
  categoryEnabled,
  selectedAssetId,
  performanceMode = false,
  goldThemeEnabled = false,
  compactAssetLabels = false,
  hideOverlayControls = false,
  onSelectAsset,
  onToggleAsset,
  onToggleCategory,
  onAllOn,
  onAllOff,
  onRefreshData,
  overlayState,
  overlayLoadingState,
  onToggleOverlay,
}: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openTooltipKey, setOpenTooltipKey] = useState<keyof OverlayToggleState | null>(null);
  const [coreDropdownOpen, setCoreDropdownOpen] = useState(false);
  const [advancedDropdownOpen, setAdvancedDropdownOpen] = useState(false);

  const groupedFull = useMemo(() => {
    const map = new Map<string, AssetItem[]>();
    CATEGORY_ORDER.forEach((cat) => map.set(cat, []));
    for (const asset of assets) {
      const bucket = map.get(asset.category) ?? [];
      bucket.push(asset);
      map.set(asset.category, bucket);
    }
    return map;
  }, [assets]);

  const orderedCategories = useMemo(() => {
    const known = CATEGORY_ORDER.filter((category) => (groupedFull.get(category) ?? []).length > 0);
    const unknown = Array.from(groupedFull.keys())
      .filter((category) => !CATEGORY_ORDER.includes(category) && (groupedFull.get(category) ?? []).length > 0)
      .sort((left, right) => left.localeCompare(right));
    return [...known, ...unknown];
  }, [groupedFull]);

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, AssetItem[]>();
    orderedCategories.forEach((cat) => {
      const base = groupedFull.get(cat) ?? [];
      if (!term) {
        map.set(cat, base);
        return;
      }
      map.set(cat, base.filter((asset) => {
        const haystack = [
          asset.name,
          asset.symbol,
          asset.tvSource,
          asset.country,
          asset.id,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      }));
    });
    return map;
  }, [groupedFull, orderedCategories, search]);

  const accentBorder = goldThemeEnabled ? "border-[#e2ca7a]/72" : "border-white/25";
  const accentHoverBorder = goldThemeEnabled ? "hover:border-[#e2ca7a]/50" : "hover:border-white/30";
  const accentText = goldThemeEnabled ? "text-[#fff3d1]" : "text-white";
  const activeCoreCount = OVERLAY_OPTIONS_CORE.filter((opt) => Boolean(overlayState[opt.key])).length;
  const activeAdvancedCount = OVERLAY_OPTIONS_ADVANCED.filter((opt) => Boolean(overlayState[opt.key])).length;
  const anyOverlayLoading = useMemo(
    () => Object.values(overlayLoadingState ?? {}).some((v) => Boolean(v)),
    [overlayLoadingState],
  );

  const overlayStateText = (key: keyof OverlayToggleState, active: boolean): string => {
    const loading = Boolean(overlayLoadingState?.[key]);
    if (loading) return "Loading";
    return active ? "On" : "Off";
  };

  const renderOverlayChoiceRow = (opt: OverlayOption) => {
    const active = Boolean(overlayState[opt.key]);
    const loading = Boolean(overlayLoadingState?.[opt.key]);
    const tooltipOpen = openTooltipKey === opt.key;
    return (
      <div
        key={opt.key}
        className="relative"
        onMouseLeave={() => {
          setOpenTooltipKey((prev) => (prev === opt.key ? null : prev));
        }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleOverlay(opt.key)}
            className={`flex h-7 min-w-0 flex-1 items-center justify-between rounded-md border px-2 text-left text-[10px] font-semibold transition ${
              active
                ? `${accentBorder} ${accentText} bg-transparent`
                : "border-slate-700/60 bg-transparent text-slate-200 hover:border-slate-500/70"
            }`}
            aria-pressed={active}
            title={`${opt.label} ${active ? "deaktivieren" : "aktivieren"}`}
          >
            <span className="min-w-0 truncate leading-tight">{opt.label}</span>
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span
                className={`text-[8px] font-semibold uppercase tracking-[0.08em] ${
                  loading ? (goldThemeEnabled ? "text-[#f7e7be]" : "text-[rgba(255,255,255,0.6)]") : (active ? accentText : "text-slate-400")
                }`}
              >
                {overlayStateText(opt.key, active)}
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Info"
                aria-label={`${opt.label} info`}
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] leading-none transition ${
                  goldThemeEnabled
                    ? "border-[#e2ca7a]/50 text-[#f7e7be] hover:border-[#e2ca7a]/75"
                    : "border-slate-500/70 text-slate-300 hover:border-white/50 hover:text-white"
                }`}
                onMouseEnter={(event) => {
                  event.stopPropagation();
                  setOpenTooltipKey(opt.key);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenTooltipKey((prev) => (prev === opt.key ? null : opt.key));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenTooltipKey((prev) => (prev === opt.key ? null : opt.key));
                  }
                }}
              >
                i
              </span>
            </span>
          </button>
        </div>
        <div
          className={`pointer-events-none absolute left-0 top-[calc(100%+5px)] z-30 max-w-[260px] rounded-md border border-slate-600/70 bg-[rgba(6,12,22,0.96)] px-2 py-1.5 text-[10px] leading-snug text-slate-200 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition ${
            tooltipOpen ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
          {opt.description}
        </div>
      </div>
    );
  };

  const renderDropdownHeader = (title: string, open: boolean, onToggle: () => void, activeCount: number, totalCount: number) => {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-7 w-full items-center justify-between rounded-md border px-2 text-[10px] font-semibold transition ${accentHoverBorder} border-slate-700/60 bg-transparent text-slate-200`}
      >
        <span className="text-left">{title}</span>
        <span className="ml-2 inline-flex items-center gap-1">
          <span className={`text-[9px] ${activeCount > 0 ? accentText : "text-slate-400"}`}>{`${activeCount}/${totalCount}`}</span>
          <span className="text-[10px] text-slate-300">{open ? "v" : ">"}</span>
        </span>
      </button>
    );
  };

  const renderAssetsRow = () => {
    const active = Boolean(overlayState.assets);
    const loading = Boolean(overlayLoadingState?.assets);
    const tooltipOpen = openTooltipKey === "assets";
    return (
      <div
        className="relative"
        onMouseLeave={() => {
          setOpenTooltipKey((prev) => (prev === "assets" ? null : prev));
        }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleOverlay("assets")}
            className={`flex h-8 min-w-0 flex-1 items-center justify-between rounded-md border px-2 text-left text-[11px] font-semibold transition ${
              active
                ? `${accentBorder} ${accentText} bg-transparent`
                : "border-slate-700/65 bg-transparent text-slate-200 hover:border-slate-500/70"
            }`}
            aria-pressed={active}
            title={`Assets ${active ? "deaktivieren" : "aktivieren"}`}
          >
            <span className="min-w-0 truncate leading-tight">Assets</span>
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span
                className={`text-[8px] font-semibold uppercase tracking-[0.08em] ${
                  loading ? (goldThemeEnabled ? "text-[#f7e7be]" : "text-[rgba(255,255,255,0.6)]") : (active ? accentText : "text-slate-400")
                }`}
              >
                {overlayStateText("assets", active)}
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Info"
                aria-label="Assets info"
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] leading-none transition ${
                  goldThemeEnabled
                    ? "border-[#e2ca7a]/50 text-[#f7e7be] hover:border-[#e2ca7a]/75"
                    : "border-slate-500/70 text-slate-300 hover:border-white/50 hover:text-white"
                }`}
                onMouseEnter={(event) => {
                  event.stopPropagation();
                  setOpenTooltipKey("assets");
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenTooltipKey((prev) => (prev === "assets" ? null : "assets"));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenTooltipKey((prev) => (prev === "assets" ? null : "assets"));
                  }
                }}
              >
                i
              </span>
            </span>
          </button>
        </div>
        <div
          className={`pointer-events-none absolute left-0 top-[calc(100%+5px)] z-30 max-w-[260px] rounded-md border border-slate-600/70 bg-[rgba(6,12,22,0.96)] px-2 py-1.5 text-[10px] leading-snug text-slate-200 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition ${
            tooltipOpen ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
        >
          Shows or hides the global asset marker universe on both maps.
        </div>
      </div>
    );
  };

  return (
    <div className={`ivq-settings-panel glass-panel flex h-full flex-col overflow-hidden rounded-xl ${performanceMode ? "ivq-settings-panel--perf" : ""}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className={`ivq-settings-search h-7 min-w-0 flex-1 rounded-md border border-slate-700/65 bg-transparent px-2 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 ${goldThemeEnabled ? "focus:border-[#e2ca7a]/60" : "focus:border-white/40"}`}
        />
        <button
          type="button"
          onClick={onAllOn}
          className={`ivq-settings-action h-7 rounded-md border bg-transparent px-2 text-[10px] font-semibold ${performanceMode ? "" : "transition"} ${accentBorder} ${accentText} ${goldThemeEnabled ? "hover:border-[#e2ca7a]/85" : "hover:border-white/50"}`}
        >
          All On
        </button>
        <button
          type="button"
          onClick={onAllOff}
          className={`ivq-settings-action h-7 rounded-md border border-slate-700/65 bg-transparent px-2 text-[10px] font-semibold text-slate-200 ${performanceMode ? "" : "transition"} hover:border-slate-500/70`}
        >
          All Off
        </button>
        {onRefreshData ? (
          <button
            type="button"
            onClick={onRefreshData}
            className={`ivq-settings-action h-7 rounded-md border bg-transparent px-2 text-[10px] font-semibold ${performanceMode ? "" : "transition"} ${
              goldThemeEnabled
                ? "border-[#e2ca7a]/58 text-[#fff3d1] hover:border-[#e2ca7a]/85"
                : "border-white/25 text-white hover:border-white/50"
            }`}
          >
            Refresh
          </button>
        ) : null}
      </div>

      <div className="ivq-settings-scroll scroll-thin min-h-0 flex-1 overflow-y-auto pr-0.5">
        {orderedCategories.map((category) => {
          const list = grouped.get(category) ?? [];
          if (!list.length) return null;
          const totalCount = (groupedFull.get(category) ?? []).length;
          const visibleCount = list.length;
          const isOn = categoryEnabled[category] !== false;
          const isCollapsed = Boolean(collapsed[category]);
          return (
            <section
              key={category}
              className="ivq-settings-category mb-1.5 rounded-lg border border-slate-700/40 bg-transparent last:mb-0"
              style={performanceMode ? { contentVisibility: "auto", containIntrinsicSize: "200px" } : undefined}
            >
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <div className="flex items-center gap-1.5">
                  <TinyToggle checked={isOn} goldThemeEnabled={goldThemeEnabled} onClick={() => onToggleCategory(category)} />
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))}
                    className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-300"
                  >
                    {category} ({visibleCount === totalCount ? `${totalCount}` : `${visibleCount}/${totalCount}`})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))}
                  className="rounded border border-slate-700/60 px-1 text-[10px] text-slate-400"
                >
                  {isCollapsed ? "+" : "-"}
                </button>
              </div>

              {!isCollapsed && (
                <div className={`ivq-settings-category-grid grid grid-cols-3 gap-1 px-1.5 pb-1.5 ${isOn ? "" : "opacity-55"}`}>
                  {list.map((asset) => {
                    const markerSelectable = asset.category !== "Cross Pairs" && asset.showOnGlobe !== false;
                    const checked = markerSelectable && enabledSet.has(asset.id);
                    const selected = selectedAssetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className={`ivq-settings-asset flex h-6 items-center gap-1 rounded-md px-1 text-[10px] ${performanceMode ? "" : "transition"} ${
                          selected
                            ? `${goldThemeEnabled ? "bg-[#e2ca7a]/16 text-[#fff3d1]" : "bg-white/10 text-white"}`
                            : markerSelectable && checked
                              ? `${goldThemeEnabled ? "bg-[#e2ca7a]/08 text-[#e8d5a7]" : "bg-white/[0.04] text-white/70"}`
                              : "text-slate-400"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectAsset(asset.id)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                          title={`${asset.name} auswaehlen`}
                          aria-label={`${asset.name} auswaehlen`}
                        >
                          <AssetIcon assetId={asset.id} iconKey={asset.iconKey} category={asset.category} assetName={asset.name} assetSymbol={asset.symbol} />
                          <span className="min-w-0 flex-1 truncate">{compactAssetLabels ? compactLabel(asset) : shortName(asset.name, 11)}</span>
                        </button>
                        {markerSelectable && (
                          <button
                            type="button"
                            onClick={() => onToggleAsset(asset.id)}
                            className={`grid h-[12px] w-[12px] place-items-center rounded-[3px] border text-[8px] transition ${
                              checked
                                ? `${goldThemeEnabled ? "border-[#e2ca7a]/90 text-[#fff3d1]" : "border-white/50 text-white"} bg-transparent`
                                : "border-slate-500/70 bg-transparent text-transparent"
                            }`}
                            title={checked ? "Marker ausblenden" : "Marker einblenden"}
                            aria-label={checked ? "Marker ausblenden" : "Marker einblenden"}
                          >
                            {"✓"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {hideOverlayControls ? null : (
      <div className="mt-2 rounded-lg border border-slate-700/45 bg-transparent p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="ivq-section-label mb-0">Overlay Control</div>
          <div className="inline-flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] uppercase">
            <span className={anyOverlayLoading ? (goldThemeEnabled ? "text-[#f7e7be]" : "text-[rgba(255,255,255,0.6)]") : "text-[#b2c5de]"}>
              {anyOverlayLoading ? "Loading" : "Ready"}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {renderAssetsRow()}

          <div>
            {renderDropdownHeader("Overlays", coreDropdownOpen, () => setCoreDropdownOpen((v) => !v), activeCoreCount, OVERLAY_OPTIONS_CORE.length)}
            {coreDropdownOpen ? (
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
                {OVERLAY_OPTIONS_CORE.map((opt) => renderOverlayChoiceRow(opt))}
              </div>
            ) : null}
          </div>

          <div>
            {renderDropdownHeader("Advanced", advancedDropdownOpen, () => setAdvancedDropdownOpen((v) => !v), activeAdvancedCount, OVERLAY_OPTIONS_ADVANCED.length)}
            {advancedDropdownOpen ? (
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
                {OVERLAY_OPTIONS_ADVANCED.map((opt) => renderOverlayChoiceRow(opt))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
