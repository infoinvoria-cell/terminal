// Stub for globe port
export function getCandleColor(_open: number, _close: number): string {
  return "#e2ca7a";
}

export type ScreenerCandlePaletteId = string;

export function candlestickColors(_paletteId: ScreenerCandlePaletteId): { upColor: string; downColor: string; wickUpColor: string; wickDownColor: string; borderUpColor: string; borderDownColor: string } {
  return {
    upColor: "#e2ca7a",
    downColor: "#a1a1aa",
    wickUpColor: "#e2ca7a",
    wickDownColor: "#a1a1aa",
    borderUpColor: "#e2ca7a",
    borderDownColor: "#a1a1aa",
  };
}

export function zoneFillColors(_paletteId: ScreenerCandlePaletteId): { demand: string; demandStrong: string; supply: string; supplyStrong: string } {
  return {
    demand: "rgba(226,202,122,0.12)",
    demandStrong: "rgba(226,202,122,0.20)",
    supply: "rgba(161,161,170,0.12)",
    supplyStrong: "rgba(161,161,170,0.20)",
  };
}
