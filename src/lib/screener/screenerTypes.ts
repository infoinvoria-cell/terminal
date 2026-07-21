// Stub — screener types
export type PineSignalMarker = {
  id?: string;
  t: string;
  direction: "LONG" | "SHORT";
  type?: "ENTRY" | "EXIT" | string;
  price?: number;
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
  strength?: "strong" | "normal";
  tested?: boolean;
  active: boolean;
  historical?: boolean;
  broken?: boolean;
  breakIndex?: number;
  startIndex: number;
  endIndex: number;
  maturedAtIndex?: number | null;
  touchedAtIndex?: number | null;
  originIndex?: number;
  creationBarIndex: number;
  label?: string;
};
