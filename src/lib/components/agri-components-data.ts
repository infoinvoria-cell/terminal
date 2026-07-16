/**
 * Agrar component data — ordered as in Monitoring (ZW, ZC, ZS, CC, KC, SB, CT, OJ).
 * Aggregated Key Stats per strategy mode. No LONG/SHORT direction.
 * WF metrics from strategy_registry_v2.0.json. Missing values → "—".
 * Paper-only. Safety Stop ≠ guaranteed fill.
 */

import type { AssetComponent, AssetStrategyMode, ComponentModeStats } from "@/lib/components/components-types";

function stats(
  count: number,
  status: ComponentModeStats["status"],
  overrides?: Partial<ComponentModeStats>,
): ComponentModeStats {
  return {
    count,
    cagr: "—",
    maxDrawdown: "—",
    calmar: "—",
    sharpe: "—",
    profitFactor: overrides?.profitFactor ?? "—",
    trades: "—",
    winrate: "—",
    wfOos: overrides?.wfOos ?? "—",
    status,
    source: "strategy_registry_v2.0.json",
    placeholder: false,
  };
}

export const AGRI_COMPONENTS: AssetComponent[] = [
  {
    symbol: "ZW1!",
    symbolDisplay: "ZW1!",
    label: "Wheat",
    assetId: "wheat",
    exchange: "CBOT",
    iconFile: "/asset-icons/wheat.webp",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 3,
    modes: [
      {
        id: "valuation",
        label: "Valuation",
        stats: stats(1, "final_limited", { wfOos: "5/6", profitFactor: "1.22" }),
        detailNames: ["JPY-Relative"],
      },
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(3, "final_core", { wfOos: "6/6", profitFactor: "3.27" }),
        detailNames: ["15.Feb h23", "11.Apr h27", "21.Nov h17"],
      },
      {
        id: "macro",
        label: "Macro",
        stats: stats(1, "final_limited"),
        detailNames: ["Harvest Stage-Gated"],
      },
    ],
  },
  {
    symbol: "ZC1!",
    symbolDisplay: "ZC1!",
    label: "Corn",
    assetId: "corn",
    exchange: "CBOT",
    iconFile: "/asset-icons/corn.png",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 2,
    modes: [
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(3, "final_core", { wfOos: "5/6", profitFactor: "2.05" }),
        detailNames: ["08.Jun h14", "25.Feb h5", "10.Nov h14"],
      },
      {
        id: "macro",
        label: "Macro",
        stats: stats(1, "final_limited"),
        detailNames: ["Harvest Stage-Gated"],
      },
    ],
  },
  {
    symbol: "ZS1!",
    symbolDisplay: "ZS1!",
    label: "Soybeans",
    assetId: "soybeans",
    exchange: "CBOT",
    iconFile: "/asset-icons/soybeans.png",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 1,
    modes: [
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(4, "final_core", { wfOos: "6/6", profitFactor: "4.64" }),
        detailNames: ["09.Jun h12", "22.Jul h12", "05.Apr h22", "11.Okt h17"],
      },
    ],
  },
  {
    symbol: "CC1!",
    symbolDisplay: "CC1!",
    label: "Cocoa",
    assetId: "cocoa",
    exchange: "ICEUS",
    iconFile: "/asset-icons/cocoa.webp",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 2,
    modes: [
      {
        id: "valuation",
        label: "Valuation",
        stats: stats(1, "final_limited", { wfOos: "4/6", profitFactor: "1.14" }),
        detailNames: ["Gold-Relative"],
      },
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(3, "final_limited"),
        detailNames: ["03.Apr h16", "04.Jun h23", "15.Aug h7"],
      },
    ],
  },
  {
    symbol: "KC1!",
    symbolDisplay: "KC1!",
    label: "Coffee",
    assetId: "coffee",
    exchange: "ICEUS",
    iconFile: "/asset-icons/coffee.png",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 2,
    modes: [
      {
        id: "valuation",
        label: "Valuation",
        stats: stats(1, "final_limited", { wfOos: "3/6", profitFactor: "1.21" }),
        detailNames: ["Euro/Gold-Relative"],
      },
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(4, "final_core", { wfOos: "6/6", profitFactor: "3.55" }),
        detailNames: ["08.Jun h10", "10.Mär h3", "01.Aug h27", "25.Okt h22"],
      },
    ],
  },
  {
    symbol: "SB1!",
    symbolDisplay: "SB1!",
    label: "Sugar",
    assetId: "sugar",
    exchange: "ICEUS",
    iconFile: "/asset-icons/sugar.png",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 1,
    modes: [
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(2, "final_core", { wfOos: "5/6", profitFactor: "4.20" }),
        detailNames: ["24.Feb h20", "23.Sep h22"],
      },
    ],
  },
  {
    symbol: "CT1!",
    symbolDisplay: "CT1!",
    label: "Cotton",
    assetId: "cotton",
    exchange: "ICEUS",
    iconFile: "/asset-icons/cotton.png",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 2,
    modes: [
      {
        id: "valuation",
        label: "Valuation",
        stats: stats(1, "final_core", { wfOos: "5/6", profitFactor: "1.45" }),
        detailNames: ["Global Energy"],
      },
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(4, "final_core", { wfOos: "5/6", profitFactor: "3.11" }),
        detailNames: ["11.Apr h5", "03.Jan h12", "19.Dez h20", "12.Sep h8"],
      },
    ],
  },
  {
    symbol: "OJ1!",
    symbolDisplay: "OJ1!",
    label: "OJ",
    assetId: "orange_juice",
    exchange: "ICEUS",
    iconFile: "/asset-icons/orange_juice.jpg",
    version: "1.0",
    dataCoverage: "ab 2000",
    anomaliesCount: 1,
    modes: [
      {
        id: "seasonal",
        label: "Seasonal",
        stats: stats(3, "final_core", { wfOos: "5/6", profitFactor: "3.29" }),
        detailNames: ["29.Jun h10", "04.Mai h20", "01.Jan h10"],
      },
    ],
  },
];
