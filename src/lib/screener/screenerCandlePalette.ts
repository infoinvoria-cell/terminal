// Stub — screener candle palette
export type ScreenerCandlePaletteId = "default" | "gold" | "blue" | "green";

type CandlePalette = {
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
};

type ZonePalette = {
  supply: string;
  supplyStrong: string;
  demand: string;
  demandStrong: string;
};

const CANDLE_MAP: Record<ScreenerCandlePaletteId, CandlePalette> = {
  default: { upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderUpColor: "#26a69a", borderDownColor: "#ef5350" },
  gold:    { upColor: "#e2ca7a", downColor: "#ef5350", wickUpColor: "#e2ca7a", wickDownColor: "#ef5350", borderUpColor: "#e2ca7a", borderDownColor: "#ef5350" },
  blue:    { upColor: "#2962ff", downColor: "#ef5350", wickUpColor: "#2962ff", wickDownColor: "#ef5350", borderUpColor: "#2962ff", borderDownColor: "#ef5350" },
  green:   { upColor: "#00b050", downColor: "#ff2d2d", wickUpColor: "#00b050", wickDownColor: "#ff2d2d", borderUpColor: "#00b050", borderDownColor: "#ff2d2d" },
};

const ZONE_MAP: Record<ScreenerCandlePaletteId, ZonePalette> = {
  default: { supply: "rgba(239,83,80,0.12)", supplyStrong: "rgba(239,83,80,0.22)", demand: "rgba(38,166,154,0.12)", demandStrong: "rgba(38,166,154,0.22)" },
  gold: { supply: "rgba(239,83,80,0.12)", supplyStrong: "rgba(239,83,80,0.22)", demand: "rgba(226,202,122,0.12)", demandStrong: "rgba(226,202,122,0.22)" },
  blue: { supply: "rgba(239,83,80,0.12)", supplyStrong: "rgba(239,83,80,0.22)", demand: "rgba(41,98,255,0.12)", demandStrong: "rgba(41,98,255,0.22)" },
  green: { supply: "rgba(255,45,45,0.12)", supplyStrong: "rgba(255,45,45,0.22)", demand: "rgba(0,176,80,0.12)", demandStrong: "rgba(0,176,80,0.22)" },
};

export function candlestickColors(id: ScreenerCandlePaletteId): CandlePalette {
  return CANDLE_MAP[id] ?? CANDLE_MAP.default;
}

export function zoneFillColors(id: ScreenerCandlePaletteId): ZonePalette {
  return ZONE_MAP[id] ?? ZONE_MAP.default;
}
