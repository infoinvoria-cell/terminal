import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import { effectivePublicUrl, ICON_PATH } from "@/lib/assetIconStrict";

/** Exact filenames under /public/asset-icons/ — do not invent new names. */
export const MONITORING_ASSET_ICON_FILES = {
  wheat: "wheat.webp",
  corn: "corn.png",
  cocoa: "cocoa.webp",
  soybeans: "soybeans.png",
  coffee: "coffee.png",
  sugar: "sugar.png",
  cotton: "cotton.png",
  orangeJuice: "orange_juice.jpg",
  gold: "gold.png",
  silver: "silver.png",
  copper: "Kupfer.webp",
  palladium: "palladium.png",
  platinum: "platinum.png",
  crudeOil: "crude_oil.png",
  esSp: "es_s&p.png",
  dax: "dax.png",
  nasdaq: "nasdaq.png",
  dowJones: "dow_jones.png",
  chf: "chf.png",
  eurusd: "eurusd.png",
  gbpusd: "gbpusd.png",
  aud: "aud.png",
  eur: "eur.png",
  gbp: "gbp.png",
  jpy: "jpy.png",
  nzd: "nzd.png",
  cad: "cad.png",
  usd: "usd.png",
  dollar: "Dollar.png",
  google: "google.png",
  apple: "apple.png",
  microsoft: "microsoft.png",
  amazon: "amazon.png",
  meta: "meta.png",
  nvidia: "nvidia.png",
} as const;

const MONITORING_ICON_FILE_BY_KEY: Record<string, string> = {
  // Agrar
  ZW1: MONITORING_ASSET_ICON_FILES.wheat,
  "ZW1!": MONITORING_ASSET_ICON_FILES.wheat,
  WHEAT: MONITORING_ASSET_ICON_FILES.wheat,
  WEIZEN: MONITORING_ASSET_ICON_FILES.wheat,
  wheat: MONITORING_ASSET_ICON_FILES.wheat,

  ZC1: MONITORING_ASSET_ICON_FILES.corn,
  "ZC1!": MONITORING_ASSET_ICON_FILES.corn,
  CORN: MONITORING_ASSET_ICON_FILES.corn,
  MAIS: MONITORING_ASSET_ICON_FILES.corn,
  corn: MONITORING_ASSET_ICON_FILES.corn,

  CC1: MONITORING_ASSET_ICON_FILES.cocoa,
  "CC1!": MONITORING_ASSET_ICON_FILES.cocoa,
  COCOA: MONITORING_ASSET_ICON_FILES.cocoa,
  KAKAO: MONITORING_ASSET_ICON_FILES.cocoa,
  cocoa: MONITORING_ASSET_ICON_FILES.cocoa,

  OJ1: MONITORING_ASSET_ICON_FILES.orangeJuice,
  "OJ1!": MONITORING_ASSET_ICON_FILES.orangeJuice,
  "ORANGE JUICE": MONITORING_ASSET_ICON_FILES.orangeJuice,
  ORANGENSAFT: MONITORING_ASSET_ICON_FILES.orangeJuice,
  orange_juice: MONITORING_ASSET_ICON_FILES.orangeJuice,
  orangejuice: MONITORING_ASSET_ICON_FILES.orangeJuice,

  ZS1: MONITORING_ASSET_ICON_FILES.soybeans,
  "ZS1!": MONITORING_ASSET_ICON_FILES.soybeans,
  SOYBEANS: MONITORING_ASSET_ICON_FILES.soybeans,
  soybeans: MONITORING_ASSET_ICON_FILES.soybeans,

  KC1: MONITORING_ASSET_ICON_FILES.coffee,
  "KC1!": MONITORING_ASSET_ICON_FILES.coffee,
  COFFEE: MONITORING_ASSET_ICON_FILES.coffee,
  coffee: MONITORING_ASSET_ICON_FILES.coffee,

  CT1: MONITORING_ASSET_ICON_FILES.cotton,
  "CT1!": MONITORING_ASSET_ICON_FILES.cotton,
  COTTON: MONITORING_ASSET_ICON_FILES.cotton,
  cotton: MONITORING_ASSET_ICON_FILES.cotton,

  SB1: MONITORING_ASSET_ICON_FILES.sugar,
  "SB1!": MONITORING_ASSET_ICON_FILES.sugar,
  SUGAR: MONITORING_ASSET_ICON_FILES.sugar,
  sugar: MONITORING_ASSET_ICON_FILES.sugar,

  // Metalle + Energie
  GC1: MONITORING_ASSET_ICON_FILES.gold,
  "GC1!": MONITORING_ASSET_ICON_FILES.gold,
  GOLD: MONITORING_ASSET_ICON_FILES.gold,
  XAU: MONITORING_ASSET_ICON_FILES.gold,

  SI1: MONITORING_ASSET_ICON_FILES.silver,
  "SI1!": MONITORING_ASSET_ICON_FILES.silver,
  SILVER: MONITORING_ASSET_ICON_FILES.silver,
  XAG: MONITORING_ASSET_ICON_FILES.silver,

  // Copper (Spot / generic)
  COPPER: MONITORING_ASSET_ICON_FILES.copper,
  HG: MONITORING_ASSET_ICON_FILES.copper,
  HG1: MONITORING_ASSET_ICON_FILES.copper,
  "HG1!": MONITORING_ASSET_ICON_FILES.copper,

  PA1: MONITORING_ASSET_ICON_FILES.palladium,
  "PA1!": MONITORING_ASSET_ICON_FILES.palladium,
  PALLADIUM: MONITORING_ASSET_ICON_FILES.palladium,

  PL1: MONITORING_ASSET_ICON_FILES.platinum,
  "PL1!": MONITORING_ASSET_ICON_FILES.platinum,
  PLATINUM: MONITORING_ASSET_ICON_FILES.platinum,

  CL1: MONITORING_ASSET_ICON_FILES.crudeOil,
  "CL1!": MONITORING_ASSET_ICON_FILES.crudeOil,
  "CRUDE OIL": MONITORING_ASSET_ICON_FILES.crudeOil,
  OIL: MONITORING_ASSET_ICON_FILES.crudeOil,
  WTI: MONITORING_ASSET_ICON_FILES.crudeOil,

  NG1: MONITORING_ASSET_ICON_FILES.crudeOil,
  "NG1!": MONITORING_ASSET_ICON_FILES.crudeOil,
  NGAS: MONITORING_ASSET_ICON_FILES.crudeOil,

  RB1: MONITORING_ASSET_ICON_FILES.crudeOil,
  "RB1!": MONITORING_ASSET_ICON_FILES.crudeOil,

  // Indizes
  ES1: MONITORING_ASSET_ICON_FILES.esSp,
  "ES1!": MONITORING_ASSET_ICON_FILES.esSp,
  "S&P 500": MONITORING_ASSET_ICON_FILES.esSp,
  SPX: MONITORING_ASSET_ICON_FILES.esSp,
  US500: MONITORING_ASSET_ICON_FILES.esSp,
  "ES_S&P": MONITORING_ASSET_ICON_FILES.esSp,

  NQ1: MONITORING_ASSET_ICON_FILES.nasdaq,
  "NQ1!": MONITORING_ASSET_ICON_FILES.nasdaq,

  UKX: MONITORING_ASSET_ICON_FILES.gbp,
  "UKX!": MONITORING_ASSET_ICON_FILES.gbp,
  "FTSE 100": MONITORING_ASSET_ICON_FILES.gbp,

  RTY1: MONITORING_ASSET_ICON_FILES.esSp,
  "RTY1!": MONITORING_ASSET_ICON_FILES.esSp,
  US2000: MONITORING_ASSET_ICON_FILES.esSp,

  US30USD: MONITORING_ASSET_ICON_FILES.dowJones,
  US30: MONITORING_ASSET_ICON_FILES.dowJones,
  DOW30: MONITORING_ASSET_ICON_FILES.dowJones,

  DXY: MONITORING_ASSET_ICON_FILES.dollar,

  FDAX1: MONITORING_ASSET_ICON_FILES.dax,
  "FDAX1!": MONITORING_ASSET_ICON_FILES.dax,
  DAX: MONITORING_ASSET_ICON_FILES.dax,
  DE30EUR: MONITORING_ASSET_ICON_FILES.dax,
  GER40: MONITORING_ASSET_ICON_FILES.dax,
  "GERMANY 40": MONITORING_ASSET_ICON_FILES.dax,
  "DE30EUR_2H": MONITORING_ASSET_ICON_FILES.dax,
  "DE30EUR_1H": MONITORING_ASSET_ICON_FILES.dax,
  "DE30EUR 2H": MONITORING_ASSET_ICON_FILES.dax,
  "DE30EUR 1H": MONITORING_ASSET_ICON_FILES.dax,
  DAX40: MONITORING_ASSET_ICON_FILES.dax,
  "DAX40 2H": MONITORING_ASSET_ICON_FILES.dax,
  "DAX40 1H": MONITORING_ASSET_ICON_FILES.dax,
  "DAX 2H": MONITORING_ASSET_ICON_FILES.dax,
  "DAX 1H": MONITORING_ASSET_ICON_FILES.dax,

  YM1: MONITORING_ASSET_ICON_FILES.dowJones,
  "YM1!": MONITORING_ASSET_ICON_FILES.dowJones,
  YM: MONITORING_ASSET_ICON_FILES.dowJones,
  "DOW JONES": MONITORING_ASSET_ICON_FILES.dowJones,
  DOW: MONITORING_ASSET_ICON_FILES.dowJones,

  // Aktien
  AAPL: MONITORING_ASSET_ICON_FILES.apple,
  APPLE: MONITORING_ASSET_ICON_FILES.apple,

  MSFT: MONITORING_ASSET_ICON_FILES.microsoft,
  MICROSOFT: MONITORING_ASSET_ICON_FILES.microsoft,

  NVDA: MONITORING_ASSET_ICON_FILES.nvidia,
  NVIDIA: MONITORING_ASSET_ICON_FILES.nvidia,

  GOOGL: MONITORING_ASSET_ICON_FILES.google,
  GOOGLE: MONITORING_ASSET_ICON_FILES.google,
  ALPHABET: MONITORING_ASSET_ICON_FILES.google,

  META: MONITORING_ASSET_ICON_FILES.meta,

  AMZN: MONITORING_ASSET_ICON_FILES.amazon,
  AMAZON: MONITORING_ASSET_ICON_FILES.amazon,

  // Invest — CI v2.0 ETF Core
  SPY: MONITORING_ASSET_ICON_FILES.esSp,
  QQQ: MONITORING_ASSET_ICON_FILES.nasdaq,
  QQQ_PASSIVE: MONITORING_ASSET_ICON_FILES.nasdaq,
  SPMO: MONITORING_ASSET_ICON_FILES.esSp,
  GLD: MONITORING_ASSET_ICON_FILES.gold,
  // CI v2.0 Sleeves
  QQQ_PINE_1: MONITORING_ASSET_ICON_FILES.nasdaq,
  QQQ_PINE_2_EMA: MONITORING_ASSET_ICON_FILES.nasdaq,
  COPPER_HG: MONITORING_ASSET_ICON_FILES.copper,
  CHF_6S: MONITORING_ASSET_ICON_FILES.chf,
  // Legacy Invest
  NAS100USD: MONITORING_ASSET_ICON_FILES.nasdaq,
  NAS100: MONITORING_ASSET_ICON_FILES.nasdaq,
  NASDAQ: MONITORING_ASSET_ICON_FILES.nasdaq,
  "NASDAQ INVEST": MONITORING_ASSET_ICON_FILES.nasdaq,
  NAS100USD_E_STEP_INVEST: MONITORING_ASSET_ICON_FILES.nasdaq,
  NAS100USD_ONLY_LONG_VALUATION_TREND: MONITORING_ASSET_ICON_FILES.nasdaq,

  USDCHF: MONITORING_ASSET_ICON_FILES.chf,
  "CHF INVEST": MONITORING_ASSET_ICON_FILES.chf,
  CHF: MONITORING_ASSET_ICON_FILES.chf,

  // Intraday MT FX legs
  GBPUSD: MONITORING_ASSET_ICON_FILES.gbpusd,
  "GBPUSD_30M": MONITORING_ASSET_ICON_FILES.gbpusd,
  "GBPUSD 30M": MONITORING_ASSET_ICON_FILES.gbpusd,

  EURUSD: MONITORING_ASSET_ICON_FILES.eurusd,
  "EURUSD_30M": MONITORING_ASSET_ICON_FILES.eurusd,
  "EURUSD 30M": MONITORING_ASSET_ICON_FILES.eurusd,

  "6E1!": MONITORING_ASSET_ICON_FILES.eur,
  "6B1!": MONITORING_ASSET_ICON_FILES.gbp,
  "6A1!": MONITORING_ASSET_ICON_FILES.aud,
  "6J1!": MONITORING_ASSET_ICON_FILES.jpy,
  "6S1!": MONITORING_ASSET_ICON_FILES.chf,
  "6C1!": MONITORING_ASSET_ICON_FILES.cad,
  "6N1!": MONITORING_ASSET_ICON_FILES.nzd,
  "6A": MONITORING_ASSET_ICON_FILES.aud,
  "6B": MONITORING_ASSET_ICON_FILES.gbp,
  "6C": MONITORING_ASSET_ICON_FILES.cad,
  "6E": MONITORING_ASSET_ICON_FILES.eur,
  "6J": MONITORING_ASSET_ICON_FILES.jpy,
  "6N": MONITORING_ASSET_ICON_FILES.nzd,
  "6S": MONITORING_ASSET_ICON_FILES.chf,
};

export const MONITORING_ACTIVE_AGRAR_SYMBOLS = ["ZW1!", "ZC1!", "ZS1!", "CC1!", "KC1!", "SB1!", "CT1!", "OJ1!"] as const;

const EXCLUDED_MONITORING_KEYS = new Set<string>();

function normalizeLookupKey(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function futuresCodeKey(value: string): string {
  const key = normalizeLookupKey(value);
  if (!key) return "";
  if (key.endsWith("!")) return key;
  const compact = key.replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{1,6}\d$/.test(compact)) return `${compact}!`;
  return key;
}

function collectLookupKeys(input: {
  code?: string | null;
  assetId?: string | null;
  name?: string | null;
  source?: string | null;
  tv?: string | null;
  displaySymbol?: string | null;
}): string[] {
  const keys: string[] = [];
  const push = (raw?: string | null) => {
    const text = String(raw || "").trim();
    if (!text) return;
    keys.push(normalizeLookupKey(text));
    keys.push(futuresCodeKey(text));
    const assetId = text.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (assetId) keys.push(normalizeLookupKey(assetId));
    const ticker = text.includes(":") ? text.split(":").pop() ?? text : text;
    keys.push(normalizeLookupKey(ticker));
    keys.push(futuresCodeKey(ticker));
  };

  push(input.code);
  push(input.displaySymbol);
  push(input.name);
  push(input.assetId);
  push(input.source);
  push(input.tv);

  return keys;
}

export function isExcludedMonitoringAsset(input: {
  code?: string | null;
  assetId?: string | null;
  name?: string | null;
  source?: string | null;
  requestSymbol?: string | null;
}): boolean {
  const keys = collectLookupKeys({
    code: input.code ?? input.requestSymbol,
    name: input.name,
    source: input.source,
    assetId: input.assetId,
  });
  for (const key of keys) {
    if (EXCLUDED_MONITORING_KEYS.has(key)) return true;
  }
  return false;
}

export function isActiveMonitoringAgrarSymbol(symbol: string): boolean {
  const code = futuresCodeKey(symbol);
  return (MONITORING_ACTIVE_AGRAR_SYMBOLS as readonly string[]).includes(code);
}

function lookupIconFile(input: {
  code?: string | null;
  assetId?: string | null;
  name?: string | null;
  source?: string | null;
  tv?: string | null;
  displaySymbol?: string | null;
}): string | null {
  for (const key of collectLookupKeys(input)) {
    const file = MONITORING_ICON_FILE_BY_KEY[key];
    if (file) return file;
  }
  return null;
}

type MonitoringAssetIconLookup = {
  code?: string | null;
  assetId?: string | null;
  name?: string | null;
  source?: string | null;
  tv?: string | null;
  displaySymbol?: string | null;
};

/** Top-left / first chart per tab — used for tab bar icons. */
const MONITORING_TAB_TOP_ASSET: Record<Exclude<MonitoringPrimaryTabId, "fx" | "all" | "live" | "anomaly">, MonitoringAssetIconLookup> = {
  agrar: { code: "ZW1!", assetId: "wheat", name: "Wheat", tv: "CBOT:ZW1!", source: "CBOT:ZW1!" },
  metalle_energie: { code: "GC1!", name: "Gold" },
  indizes: { code: "ES1!", name: "S&P 500" },
  aktien: { code: "AAPL", name: "Apple", assetId: "apple" },
  invest: { code: "SPY", name: "S&P 500 ETF" },
  intraday_mt: {
    code: "DE30EUR",
    displaySymbol: "DE30EUR 2H",
    name: "DE30EUR",
    source: "OANDA:DE30EUR",
    tv: "OANDA:DE30EUR",
  },
};

export function getMonitoringTabIconUrl(tabId: MonitoringPrimaryTabId): string | null {
  if (tabId === "fx" || tabId === "all" || tabId === "live" || tabId === "anomaly") return null;
  return getMonitoringAssetIconUrl(MONITORING_TAB_TOP_ASSET[tabId]);
}

/** Central monitoring icon resolver for chart headers (all tabs). */
export function getMonitoringAssetIconUrl(input: MonitoringAssetIconLookup): string | null {
  const file = lookupIconFile(input);
  if (!file) return null;
  return effectivePublicUrl(`${ICON_PATH}${file}`);
}
