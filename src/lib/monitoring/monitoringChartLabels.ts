export type MonitoringChartLabel = {
  symbol: string;
  term: string;
};

const AGRAR_LABEL_BY_ID: Record<string, MonitoringChartLabel> = {
  wheat: { symbol: "ZW1!", term: "Wheat" },
  corn: { symbol: "ZC1!", term: "Corn" },
  cocoa: { symbol: "CC1!", term: "Cocoa" },
  orange_juice: { symbol: "OJ1!", term: "Orange Juice" },
};

const ASSET_TERM_BY_CODE: Record<string, string> = {
  "ZW1!": "Wheat",
  "ZC1!": "Corn",
  "CC1!": "Cocoa",
  "OJ1!": "Orange Juice",
  "GC1!": "Gold",
  "SI1!": "Silver",
  "PA1!": "Palladium",
  "PL1!": "Platinum",
  "CL1!": "Crude Oil",
  "ES1!": "S&P 500",
  "FDAX1!": "DAX",
  "YM1!": "Dow Jones",
  "NQ1!": "Nasdaq 100",
  "UKX!": "FTSE 100",
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
  GOOGL: "Google",
  META: "Meta",
  AMZN: "Amazon",
};

const INVEST_LABEL_BY_CODE: Record<string, MonitoringChartLabel> = {
  // CI v2.0 ETF Core
  SPY: { symbol: "SPY", term: "S&P 500 ETF" },
  QQQ_PASSIVE: { symbol: "QQQ", term: "Nasdaq ETF (passiv)" },
  SPMO: { symbol: "SPMO", term: "S&P Momentum" },
  GLD: { symbol: "GLD", term: "Gold ETF" },
  // CI v2.0 Sleeves
  QQQ_PINE_1: { symbol: "QQQ", term: "QQQ Pine 1" },
  QQQ_PINE_2_EMA: { symbol: "QQQ", term: "QQQ Pine 2 EMA" },
  COPPER_HG: { symbol: "HG1!", term: "Copper Sleeve" },
  CHF_6S: { symbol: "6S1!", term: "CHF Sleeve" },
  // Legacy
  NAS100USD_E_STEP_INVEST: { symbol: "NQ", term: "Nasdaq" },
  NAS100USD_ONLY_LONG_VALUATION_TREND_EMA: { symbol: "NQ", term: "Nasdaq" },
  USDCHF_CHF_INVEST: { symbol: "CHF", term: "USDCHF" },
};

const INTRADAY_LABEL_BY_KEY: Record<string, MonitoringChartLabel> = {
  "DE30EUR|2H": { symbol: "DAX40", term: "DAX40 2H" },
  "DE30EUR|1H": { symbol: "DAX40", term: "DAX40 1H" },
  "DAX40|2H": { symbol: "DAX40", term: "DAX40 2H" },
  "DAX40|1H": { symbol: "DAX40", term: "DAX40 1H" },
  "GBPUSD|30M": { symbol: "GBPUSD", term: "GBPUSD 30M" },
  "EURUSD|30M": { symbol: "EURUSD", term: "EURUSD 30M" },
};

function normalizeKey(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeTimeframe(value: string | null | undefined): string {
  const tf = String(value || "D").trim().toUpperCase();
  if (tf === "1H" || tf === "2H" || tf === "30M") return tf;
  return tf;
}

function futuresCodeWithBang(value: string): string {
  const key = normalizeKey(value);
  if (!key) return "";
  if (key.endsWith("!")) return key;
  const compact = key.replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{1,6}\d$/.test(compact)) return `${compact}!`;
  return key;
}

function intradayRequestSymbol(symbol: string): string {
  const raw = String(symbol || "").trim().toUpperCase();
  const withoutTf = raw.replace(/\s+(30M|1H|2H)$/i, "").trim();
  if (withoutTf.includes(":")) return withoutTf.split(":").pop()?.trim() || withoutTf;
  return withoutTf;
}

function resolveIntradayLabel(symbol: string, timeframe: string): MonitoringChartLabel | null {
  const tf = normalizeTimeframe(timeframe);
  const request = intradayRequestSymbol(symbol);
  const direct = INTRADAY_LABEL_BY_KEY[`${request}|${tf}`];
  if (direct) return direct;
  if (request === "DE30EUR") {
    return { symbol: "DAX40", term: tf === "D" ? "DAX40" : `DAX40 ${tf}` };
  }
  if (request === "GBPUSD" || request === "EURUSD") {
    return { symbol: request, term: tf === "D" ? request : `${request} ${tf}` };
  }
  return null;
}

function resolveInvestLabel(symbol: string): MonitoringChartLabel | null {
  const key = normalizeKey(symbol);
  return INVEST_LABEL_BY_CODE[key] ?? null;
}

function resolveFuturesOrStockLabel(symbol: string): MonitoringChartLabel {
  const futuresCode = futuresCodeWithBang(symbol);
  const term = ASSET_TERM_BY_CODE[futuresCode] ?? ASSET_TERM_BY_CODE[normalizeKey(symbol)];
  if (term) return { symbol: futuresCode, term };
  const plain = normalizeKey(symbol);
  return { symbol: plain, term: ASSET_TERM_BY_CODE[plain] ?? plain };
}

export function formatMonitoringChartCardLabel(input: {
  symbol: string;
  name?: string | null;
  timeframe?: string | null;
  universeGroup?: string | null;
  assetId?: string | null;
}): MonitoringChartLabel {
  const assetId = String(input.assetId || "").trim().toLowerCase();
  if (assetId && AGRAR_LABEL_BY_ID[assetId]) return AGRAR_LABEL_BY_ID[assetId];

  const group = String(input.universeGroup || "").trim();
  const tf = normalizeTimeframe(input.timeframe);
  const rawSymbol = String(input.symbol || "").trim();
  if (!rawSymbol) return { symbol: "-", term: "-" };

  if (group === "Intraday MT" || tf === "30M" || tf === "1H" || tf === "2H") {
    const intraday = resolveIntradayLabel(rawSymbol, tf);
    if (intraday) return intraday;
  }

  const invest = resolveInvestLabel(rawSymbol);
  if (invest) return invest;

  return resolveFuturesOrStockLabel(rawSymbol);
}

export function applyMonitoringChartLabel<T extends {
  code: string;
  name?: string;
  short?: string;
  timeframe?: string;
  universeGroup?: string;
  assetId?: string;
}>(item: T): T & { short: string; name: string } {
  const label = formatMonitoringChartCardLabel({
    symbol: item.code,
    name: item.name,
    timeframe: item.timeframe,
    universeGroup: item.universeGroup,
    assetId: item.assetId,
  });
  return { ...item, short: label.symbol, name: label.term };
}
