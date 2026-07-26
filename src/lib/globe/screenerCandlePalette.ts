// Stub for globe port
export function getCandleColor(_open: number, _close: number): string {
  return "#c8c8c8";
}

export type ScreenerCandlePaletteId = string;

export function candlestickColors(_paletteId: ScreenerCandlePaletteId): { upColor: string; downColor: string; wickUpColor: string; wickDownColor: string; borderUpColor: string; borderDownColor: string } {
  return {
    upColor: "#c8c8c8",
    downColor: "#a1a1aa",
    wickUpColor: "#c8c8c8",
    wickDownColor: "#a1a1aa",
    borderUpColor: "#c8c8c8",
    borderDownColor: "#a1a1aa",
  };
}

export function zoneFillColors(_paletteId: ScreenerCandlePaletteId): { demand: string; demandStrong: string; supply: string; supplyStrong: string } {
  return {
    demand: "rgba(200,200,200,0.12)",
    demandStrong: "rgba(200,200,200,0.20)",
    supply: "rgba(161,161,170,0.12)",
    supplyStrong: "rgba(161,161,170,0.20)",
  };
}
