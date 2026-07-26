// What-if stress scenarios. Each maps to affected assets (display tickers) with
// a rough expected % move. These are directional estimates for scenario
// planning, NOT forecasts — clearly the source of truth here, tune as needed.

export type ScenarioEffect = { ticker: string; pct: number };
export type Scenario = {
  id: string;
  label: string;
  description: string;
  effects: ScenarioEffect[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: "hormuz",
    label: "Strait of Hormuz Closure",
    description: "~20% of global oil transit halted",
    effects: [
      { ticker: "CL1!", pct: 8 },
      { ticker: "BZ1!", pct: 9 },
      { ticker: "GC1!", pct: 4 },
      { ticker: "6E1!", pct: -1 },
      { ticker: "ES1!", pct: -2.5 },
    ],
  },
  {
    id: "fed_hike",
    label: "Fed +50bp Surprise Hike",
    description: "Hawkish shock, real yields up",
    effects: [
      { ticker: "ES1!", pct: -3 },
      { ticker: "NQ1!", pct: -4 },
      { ticker: "GC1!", pct: -2 },
      { ticker: "6E1!", pct: -1.5 },
    ],
  },
  {
    id: "fed_cut",
    label: "Fed -50bp Surprise Cut",
    description: "Dovish shock, liquidity up",
    effects: [
      { ticker: "ES1!", pct: 2.5 },
      { ticker: "NQ1!", pct: 3.5 },
      { ticker: "GC1!", pct: 3 },
      { ticker: "6E1!", pct: 1.5 },
    ],
  },
  {
    id: "taiwan",
    label: "Taiwan Strait Conflict",
    description: "Semiconductor supply-chain shock",
    effects: [
      { ticker: "NQ1!", pct: -6 },
      { ticker: "NVDA", pct: -10 },
      { ticker: "AAPL", pct: -7 },
      { ticker: "ES1!", pct: -4 },
      { ticker: "GC1!", pct: 3 },
    ],
  },
  {
    id: "ukraine_esc",
    label: "Russia/Ukraine Escalation",
    description: "Energy + grain supply risk",
    effects: [
      { ticker: "NG1!", pct: 12 },
      { ticker: "ZW1!", pct: 8 },
      { ticker: "GC1!", pct: 4 },
      { ticker: "PA1!", pct: 6 },
      { ticker: "FDAX1!", pct: -3 },
    ],
  },
  {
    id: "recession",
    label: "Global Recession Signal",
    description: "Broad risk-off, demand collapse",
    effects: [
      { ticker: "ES1!", pct: -5 },
      { ticker: "GC1!", pct: 3 },
      { ticker: "CL1!", pct: -8 },
      { ticker: "HG1!", pct: -6 },
      { ticker: "6E1!", pct: -2 },
    ],
  },
];
