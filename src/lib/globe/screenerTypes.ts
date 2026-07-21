// Stub for globe port
export type ScreenerAsset = {
  id: string;
  name: string;
  symbol: string;
};

export type PineZone = {
  id: string;
  type: "supply" | "demand";
  kind: "supply" | "demand";
  start: string;
  end: string;
  low: number;
  high: number;
  state?: "ACTIVE" | "TOUCHED" | "ARCHIVED" | string;
  strength?: "strong" | "normal" | string;
  startIndex: number;
  endIndex: number;
  active: boolean;
  historical?: boolean;
  broken?: boolean;
  breakIndex?: number;
  maturedAtIndex?: number | null;
  touchedAtIndex?: number | null;
  originIndex?: number;
  creationBarIndex: number;
  label?: string;
};

export type PineSignalMarker = {
  id?: string;
  t: string;
  direction: "LONG" | "SHORT";
  type?: "ENTRY" | "EXIT" | string;
  price?: number;
  x?: number;
  y?: number;
};
