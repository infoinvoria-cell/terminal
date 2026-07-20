/**
 * Agrar component data — ordered as in Monitoring (ZW, ZC, ZS, CC, KC, SB, CT, OJ).
 * WS v1.1 reset: only CT1 / SB1 / ZC1 carry validated OOS stats (2019–2026).
 * Empty assets have modes: [] — no mode columns rendered.
 */

import type { AssetComponent, ComponentModeStats } from "@/lib/components/components-types";

function wsStats(
  count: number,
  overrides: Partial<ComponentModeStats>,
): ComponentModeStats {
  return {
    count,
    cagr: overrides.cagr ?? "—",
    maxDrawdown: overrides.maxDrawdown ?? "—",
    calmar: overrides.calmar ?? "—",
    sharpe: overrides.sharpe ?? "—",
    profitFactor: overrides.profitFactor ?? "—",
    trades: overrides.trades ?? "—",
    winrate: overrides.winrate ?? "—",
    wfOos: overrides.wfOos ?? "—",
    status: "paper_only",
    source: "WS v1.1 OOS 2019–2026",
    placeholder: false,
  };
}

export const AGRI_COMPONENTS: AssetComponent[] = [
  // ── ZW1 — kein WS v1.1 Pass ─────────────────────────────────────────────
  // WS-v1.1-archived modes: Valuation(JPY-Relative) · Seasonal(3) · Macro(Harvest)
  {
    symbol: "ZW1!", symbolDisplay: "ZW1!", label: "Wheat", assetId: "wheat",
    exchange: "CBOT", iconFile: "/asset-icons/wheat.webp",
    version: "offen", dataCoverage: "offen", anomaliesCount: 3,
    modes: [],
  },

  // ── ZC1 — WS v1.1: Seasonal ✓ ──────────────────────────────────────────
  // WS-v1.1-archived modes: Macro(Harvest Stage-Gated)
  {
    symbol: "ZC1!", symbolDisplay: "ZC1!", label: "Corn", assetId: "corn",
    exchange: "CBOT", iconFile: "/asset-icons/corn.png",
    version: "WS-1.1", dataCoverage: "ab 2019", anomaliesCount: 2,
    modes: [
      {
        id: "seasonal", label: "Seasonal",
        stats: wsStats(3, { sharpe: "0.167", cagr: "+0.3%", maxDrawdown: "-5.3%", calmar: "0.06", trades: "8", wfOos: "62%", profitFactor: "3.20", winrate: "62.5%" }),
        detailNames: ["08.Jun h14", "25.Feb h5", "10.Nov h14"],
      },
    ],
  },

  // ── ZS1 — kein WS v1.1 Pass ─────────────────────────────────────────────
  // WS-v1.1-archived modes: Seasonal(4 patterns)
  {
    symbol: "ZS1!", symbolDisplay: "ZS1!", label: "Soybeans", assetId: "soybeans",
    exchange: "CBOT", iconFile: "/asset-icons/soybeans.png",
    version: "offen", dataCoverage: "offen", anomaliesCount: 1,
    modes: [],
  },

  // ── CC1 — kein WS v1.1 Pass ─────────────────────────────────────────────
  // WS-v1.1-archived modes: Valuation(Gold-Relative) · Seasonal(3)
  {
    symbol: "CC1!", symbolDisplay: "CC1!", label: "Cocoa", assetId: "cocoa",
    exchange: "ICEUS", iconFile: "/asset-icons/cocoa.webp",
    version: "offen", dataCoverage: "offen", anomaliesCount: 2,
    modes: [],
  },

  // ── KC1 — kein WS v1.1 Pass ─────────────────────────────────────────────
  // WS-v1.1-archived modes: Valuation(Euro/Gold-Relative) · Seasonal(4)
  {
    symbol: "KC1!", symbolDisplay: "KC1!", label: "Coffee", assetId: "coffee",
    exchange: "ICEUS", iconFile: "/asset-icons/coffee.png",
    version: "offen", dataCoverage: "offen", anomaliesCount: 2,
    modes: [],
  },

  // ── SB1 — WS v1.1: Seasonal ✓ ──────────────────────────────────────────
  {
    symbol: "SB1!", symbolDisplay: "SB1!", label: "Sugar", assetId: "sugar",
    exchange: "ICEUS", iconFile: "/asset-icons/sugar.png",
    version: "WS-1.1", dataCoverage: "ab 2019", anomaliesCount: 1,
    modes: [
      {
        id: "seasonal", label: "Seasonal",
        stats: wsStats(2, { sharpe: "0.519", cagr: "+6.2%", maxDrawdown: "-6.7%", calmar: "0.93", trades: "7", wfOos: "100%", profitFactor: "3.85", winrate: "66.7%" }),
        detailNames: ["24.Feb h20", "23.Sep h22"],
      },
    ],
  },

  // ── CT1 — WS v1.1: Seasonal ✓ · Macro ✓ ────────────────────────────────
  // WS-v1.1-archived modes: Valuation(Global Energy · wfOos 5/6 · pf 1.45)
  {
    symbol: "CT1!", symbolDisplay: "CT1!", label: "Cotton", assetId: "cotton",
    exchange: "ICEUS", iconFile: "/asset-icons/cotton.png",
    version: "WS-1.1", dataCoverage: "ab 2019", anomaliesCount: 2,
    modes: [
      {
        id: "seasonal", label: "Seasonal",
        stats: wsStats(4, { sharpe: "0.663", cagr: "+2.4%", maxDrawdown: "-1.9%", calmar: "1.26", trades: "8", wfOos: "75%", profitFactor: "13.96", winrate: "75.0%" }),
        detailNames: ["11.Apr h5", "03.Jan h12", "19.Dez h20", "12.Sep h8"],
      },
      {
        id: "macro", label: "Macro",
        stats: wsStats(1, { sharpe: "0.628", cagr: "+9.5%", maxDrawdown: "-28.7%", calmar: "0.33", trades: "142", winrate: "58.5%", wfOos: "75%", profitFactor: "1.47" }),
        detailNames: ["MacroA Filter"],
      },
    ],
  },

  // ── OJ1 — kein WS v1.1 Pass ─────────────────────────────────────────────
  // WS-v1.1-archived modes: Seasonal(3 patterns)
  {
    symbol: "OJ1!", symbolDisplay: "OJ1!", label: "OJ", assetId: "orange_juice",
    exchange: "ICEUS", iconFile: "/asset-icons/orange_juice.jpg",
    version: "offen", dataCoverage: "offen", anomaliesCount: 1,
    modes: [],
  },
];
