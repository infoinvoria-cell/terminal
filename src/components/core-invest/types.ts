export type OhlcBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type SignalMarker = {
  date: string;
  type: "long" | "exit" | "stop" | "tp";
  price: number;
  label?: string;
};

export type CoreInvestComponentKind = "strategy" | "asset";

export type CoreInvestTvMetrics = {
  source: "tradingview";
  preset: string;
  status: "tv_reference" | "rejected";
  totalReturnPct: number | null;
  maxDrawdownPct: number | null;
  profitFactor: number | null;
  trades: number | null;
  winRatePct: number | null;
  note?: string;
};

export type SleeveConfig = {
  id: string;
  label: string;
  instrument: string;
  pineFile: string;
  weight: number;
  kind?: CoreInvestComponentKind;
  tvSymbol?: string;
  tvPreset?: string;
  tvMetrics?: CoreInvestTvMetrics;
  emaFast?: number;
  emaSlow?: number;
  sma1?: number;
  sma2?: number;
  stopPct?: number;
  tpPct?: number;
};

export type SleeveData = {
  config: SleeveConfig;
  bars: OhlcBar[];
  signals: SignalMarker[];
  status: "ok" | "missing_ohlc" | "partial" | "proxy_only" | "error" | "rejected";
  statusMessage: string;
  lastDate: string | null;
  validationStatus?: "validated" | "partial_validation" | "proxy_only" | "missing_data" | "not_run" | "rejected";
  equityCurve?: { date: string; value: number }[];
  currentSignal?: "long" | "cash";
};

export type CoreInvestPanelData = {
  loading: boolean;
  error: string | null;
  portfolioName: string;
  sleeves: SleeveData[];
  equityCurve: { date: string; value: number }[];
  benchmarkCurve: { date: string; value: number }[];
  qqqCurve: { date: string; value: number }[];
  dataStatus: Record<string, { found: boolean; file: string | null }>;
  missingSymbols: string[];
  pineFiles: Record<string, { found: boolean }>;
  validationLoaded: boolean;
};
