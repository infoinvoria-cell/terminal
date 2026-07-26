/**
 * Strict file-based asset icons under /public/asset-icons/.
 * Primary: local png/jpg/webp; then domain emoji where configured; generic fallback is neutral (not 💰).
 */

function getScreenerAssetDefinition(_id: string): { baseCurrency?: string; quoteCurrency?: string } | null { return null; }

export const ICON_PATH = "/asset-icons/";

function p(file: string): string {
  return `${ICON_PATH}${file}`;
}

/** Exact file names under public/asset-icons/ */
export const assetIconMap: Record<string, string> = {
  EUR: p("eur.png"),
  USD: p("usd.png"),
  GBP: p("gbp.png"),
  JPY: p("jpy.png"),
  AUD: p("aud.png"),
  NZD: p("nzd.png"),
  CHF: p("chf.png"),
  CAD: p("cad.png"),

  XAU: p("Gold.png"),
  GOLD: p("Gold.png"),
  XAG: p("silver.png"),
  SILVER: p("silver.png"),

  OIL: p("oil.png"),
  /** Temporary: dedicated oil asset file not required for screener (see PROMPT). */
  BRENT: p("usd.png"),
  COPPER: p("Kupfer.webp"),

  DAX: p("DAX.png"),
  NASDAQ: p("NASDAQ.jpg"),
  SPX: p("SP.png"),
  SP500: p("SP.png"),

  DOLLAR: p("Dollar.png"),

  // Indices / futures with dedicated files
  DOWJONES: p("dow_jones.png"),
  DOW: p("dow_jones.png"),

  // Agricultural commodities
  COTTON: p("cotton.png"),
  CORN: p("corn.png"),
  WHEAT: p("wheat.webp"),
  COFFEE: p("coffee.png"),
  COCOA: p("cocoa.png"),
  SUGAR: p("sugar.png"),
  SOYBEANS: p("soybeans.png"),
  SOY: p("soybeans.png"),
  OJ: p("orange_juice.jpg"),

  // Precious metals
  PALLADIUM: p("palladium.png"),
  PLATINUM: p("platinum.png"),

  // Single stocks
  AAPL: p("apple.png"),
  APPLE: p("apple.png"),
  MSFT: p("microsoft.png"),
  MICROSOFT: p("microsoft.png"),
  NVDA: p("nvidia.png"),
  NVIDIA: p("nvidia.png"),
  META: p("meta.png"),
  AMZN: p("amazon.png"),
  AMAZON: p("amazon.png"),
  GOOGL: p("google.png"),
  GOOG: p("google.png"),
  GOOGLE: p("google.png"),
};

/** ISO FX legs only — excludes XAU/XAG etc. so "XAGUSD" is not treated as a currency cross. */
const FX_LEG_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"]);

function isFxLeg(code: string): boolean {
  return FX_LEG_CODES.has(code);
}

export type StrictResolvedAssetIcon =
  | { type: "forex"; baseIcon: string; quoteIcon: string; baseCode: string; quoteCode: string }
  | { type: "single"; icon: string; emojiFallback?: string }
  | { type: "glyph"; char: string }
  | { type: "fallback"; icon: string };

/** Generic unknown asset — avoid 💰 (commodities / indices). */
export const NEUTRAL_ASSET_FALLBACK = "🌐";

const OIL_EMOJI = "🛢";
const SILVER_EMOJI = "🥈";

const ASSET_ID_GLYPH: Record<string, string> = {
  sugar: "🍬",
  wheat: "🌾",
  corn: "🌽",
  soybeans: "🌱",
  coffee: "☕",
  cocoa: "🍫",
  cotton: "🧵",
  natgas: "🔥",
};

const ASSET_ID_SINGLE_EMOJI: Record<string, { icon: string; emoji: string }> = {
  brent_oil: { icon: p("usd.png"), emoji: OIL_EMOJI },
  wti_spot: { icon: p("usd.png"), emoji: OIL_EMOJI },
  silver: { icon: p("silver.png"), emoji: SILVER_EMOJI },
};

export function effectivePublicUrl(absolutePath: string): string {
  return absolutePath;
}

/**
 * Pull a 6-letter AABBCC segment from broker symbols (e.g. OANDA:GBPCAD → GBPCAD).
 * Only accepts segments where both triplets are FX legs (see FX_LEG_CODES).
 */
export function extractSixLetterForex(raw: string): string | null {
  const allLetters = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (allLetters.length < 6) return null;
  for (let i = allLetters.length - 6; i >= 0; i -= 1) {
    const seg = allLetters.slice(i, i + 6);
    const a = seg.slice(0, 3);
    const b = seg.slice(3, 6);
    if (!isFxLeg(a) || !isFxLeg(b)) continue;
    const baseIcon = assetIconMap[a];
    const quoteIcon = assetIconMap[b];
    if (baseIcon && quoteIcon) return seg;
  }
  return null;
}

export function getForexIcons(pair: string): StrictResolvedAssetIcon | null {
  const extracted = extractSixLetterForex(pair);
  const clean =
    extracted
    ?? (() => {
      const c = String(pair || "")
        .replace(/\//g, "")
        .replace(/\s+/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      return c.length === 6 ? c : null;
    })();
  if (!clean || clean.length !== 6) return null;
  const base = clean.slice(0, 3);
  const quote = clean.slice(3, 6);
  if (!isFxLeg(base) || !isFxLeg(quote)) return null;
  const baseIcon = assetIconMap[base];
  const quoteIcon = assetIconMap[quote];
  if (!baseIcon || !quoteIcon) return null;
  return { type: "forex", baseIcon, quoteIcon, baseCode: base, quoteCode: quote };
}

export function getSingleIcon(asset: string): StrictResolvedAssetIcon | null {
  const key = String(asset || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!key) return null;
  if (assetIconMap[key]) {
    return { type: "single", icon: assetIconMap[key] };
  }
  return null;
}

/** Known dashboard asset ids → ASSET_ICON_MAP key */
const ASSET_ID_TO_KEY: Record<string, string> = {
  usd_index: "DOLLAR",
  dxy: "DOLLAR",
  sp500: "SP500",
  nasdaq100: "NASDAQ",
  dax40: "DAX",
  euro_stoxx_50: "EUR",
  nikkei_225: "JPY",
  ftse_100: "GBP",
  gold: "GOLD",
  silver: "SILVER",
  brent_oil: "BRENT",
  wti_spot: "BRENT",
  copper: "COPPER",
  dowjones: "USD",
  russell2000: "USD",
};

/** Normalized token → strict map key (from iconKey / id fragments) */
const TOKEN_TO_KEY: Record<string, string> = {
  spx: "SP500",
  sp500: "SP500",
  nasdaq: "NASDAQ",
  ndx: "NASDAQ",
  nasdaq100: "NASDAQ",
  dax: "DAX",
  dax40: "DAX",
  stoxx: "EUR",
  eurostoxx: "EUR",
  nikkei: "JPY",
  ftse: "GBP",
  gold: "GOLD",
  xau: "GOLD",
  silver: "SILVER",
  xag: "SILVER",
  oil: "BRENT",
  brent: "BRENT",
  wti: "BRENT",
  copper: "COPPER",
  hg: "COPPER",
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  jpy: "JPY",
  aud: "AUD",
  nzd: "NZD",
  chf: "CHF",
  cad: "CAD",
  dxy: "DOLLAR",
  dollar: "DOLLAR",
  dow: "DOWJONES",
  dowjones: "DOWJONES",
  ym: "DOWJONES",
  nq: "NASDAQ",
  qqq: "NASDAQ",
  russell: "USD",
  djia: "DOWJONES",
  // Agricultural commodities
  cotton: "COTTON",
  ct: "COTTON",
  corn: "CORN",
  wheat: "WHEAT",
  coffee: "COFFEE",
  cocoa: "COCOA",
  sugar: "SUGAR",
  soy: "SOYBEANS",
  soybeans: "SOYBEANS",
  soybean: "SOYBEANS",
  oj: "OJ",
  orangejuice: "OJ",
  // Precious metals
  palladium: "PALLADIUM",
  xpd: "PALLADIUM",
  platinum: "PLATINUM",
  xpt: "PLATINUM",
  // Single stocks
  aapl: "AAPL",
  apple: "AAPL",
  msft: "MSFT",
  microsoft: "MSFT",
  nvda: "NVDA",
  nvidia: "NVDA",
  meta: "META",
  amzn: "AMZN",
  amazon: "AMZN",
  googl: "GOOGL",
  goog: "GOOGL",
  google: "GOOGL",
};

/** Country iconKey → key, used only as a last resort before the neutral fallback. */
const COUNTRY_ICONKEY_TO_KEY: Record<string, string> = {
  de: "DAX",
  us: "SP500",
  gb: "GBP",
  uk: "GBP",
};

/** Name/symbol keyword → strict map key. Wins over generic country iconKeys. */
const NAME_KEYWORD_TO_KEY: Array<[RegExp, string]> = [
  [/dow\s*jones|\bdjia\b|\bdow\b/i, "DOWJONES"],
  [/nasdaq|\bndx\b|\bqqq\b/i, "NASDAQ"],
  [/s&p\s*500|\bs&p\b|\bspx\b|\bspy\b|\bspmo\b/i, "SP500"],
  [/\bdax\b/i, "DAX"],
  [/\bcotton\b/i, "COTTON"],
  [/\bcorn\b/i, "CORN"],
  [/\bwheat\b/i, "WHEAT"],
  [/\bcoffee\b/i, "COFFEE"],
  [/\bcocoa\b/i, "COCOA"],
  [/\bsugar\b/i, "SUGAR"],
  [/\bsoy(bean)?s?\b/i, "SOYBEANS"],
  [/orange\s*juice/i, "OJ"],
  [/\bpalladium\b/i, "PALLADIUM"],
  [/\bplatinum\b/i, "PLATINUM"],
  [/\bapple\b|\baapl\b/i, "AAPL"],
  [/\bmicrosoft\b|\bmsft\b/i, "MSFT"],
  [/\bnvidia\b|\bnvda\b/i, "NVDA"],
  [/\bmeta\b|facebook/i, "META"],
  [/\bamazon\b|\bamzn\b/i, "AMZN"],
  [/\bgoogle\b|\bgoogl\b|alphabet/i, "GOOGL"],
  // FX / regional indices that reuse a currency icon
  [/swiss\s*franc|\bchf\b/i, "CHF"],
  [/\bnikkei\b/i, "JPY"],
  [/euro\s*stoxx|\bstoxx\b/i, "EUR"],
  [/\bcac\b/i, "EUR"],
  [/\bibex\b/i, "EUR"],
  [/ftse\s*mib/i, "EUR"],
  [/\basx\b|australia\s*200/i, "AUD"],
  [/japan\s*10y?|\bjgb\b/i, "JPY"],
];

/** Keyword → glyph (no local file for these). */
const CRYPTO_GLYPH: Array<[RegExp, string]> = [
  [/bitcoin|\bbtc\b|\bxbt\b/i, "₿"],
  [/ethereum|\beth\b/i, "Ξ"],
  [/natural\s*gas|\bnatgas\b|\bttf\b/i, "🔥"],
];

function normalizeToken(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tryForexFromString(s: string): StrictResolvedAssetIcon | null {
  const t = String(s || "").trim();
  if (t.includes("/")) {
    const fx = getForexIcons(t);
    if (fx) return fx;
  }
  return getForexIcons(t);
}

/**
 * Resolver from free-form string (symbol, "EUR/USD", "EURUSD", etc.)
 */
export function resolveAssetIcon(asset: string): StrictResolvedAssetIcon {
  const s = String(asset || "").trim();
  if (s.includes("/")) {
    const fx = getForexIcons(s);
    if (fx) return fx;
  }
  const fx2 = getForexIcons(s);
  if (fx2) return fx2;
  const compact = s.replace(/\s+/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  if (compact.length >= 6) {
    const fx3 = getForexIcons(compact);
    if (fx3) return fx3;
  }
  const single = getSingleIcon(compact || s.toUpperCase());
  if (single) return single;
  return { type: "fallback", icon: NEUTRAL_ASSET_FALLBACK };
}

export function resolveDashboardAssetIcon(input: {
  assetId?: string;
  iconKey?: string;
  category?: string;
  assetName?: string;
  assetSymbol?: string;
}): StrictResolvedAssetIcon {
  const rawAssetId = String(input.assetId ?? "").trim();
  const assetId = normalizeToken(rawAssetId);
  const category = String(input.category ?? "").toLowerCase();
  const iconKey = normalizeToken(input.iconKey ?? "");
  const assetName = String(input.assetName ?? "");
  const assetSymbol = String(input.assetSymbol ?? "");

  const def = rawAssetId ? getScreenerAssetDefinition(rawAssetId) : null;
  if (def?.baseCurrency && def?.quoteCurrency) {
    const fx = getForexIcons(`${def.baseCurrency}${def.quoteCurrency}`);
    if (fx) return fx;
  }

  const glyphId = ASSET_ID_GLYPH[assetId];
  if (glyphId) {
    return { type: "glyph", char: glyphId };
  }

  const singleEmoji = ASSET_ID_SINGLE_EMOJI[assetId];
  if (singleEmoji) {
    return { type: "single", icon: singleEmoji.icon, emojiFallback: singleEmoji.emoji };
  }

  const candidates: string[] = [];
  if (assetSymbol) candidates.push(assetSymbol);
  if (assetName) candidates.push(assetName);
  if (input.iconKey) candidates.push(input.iconKey);

  for (const c of candidates) {
    const fx = tryForexFromString(c);
    if (fx) return fx;
  }

  if (category.includes("fx") || category.includes("cross")) {
    for (const c of candidates) {
      const fx = tryForexFromString(c);
      if (fx) return fx;
    }
  }

  const idKey = ASSET_ID_TO_KEY[assetId];
  if (idKey) {
    const s = getSingleIcon(idKey);
    if (s) return s;
  }

  const tryTokens = [assetId, iconKey, normalizeToken(assetSymbol), normalizeToken(assetName)];
  for (const tok of tryTokens) {
    if (!tok) continue;
    const mapped = TOKEN_TO_KEY[tok];
    if (mapped) {
      const s = getSingleIcon(mapped);
      if (s) return s;
    }
  }

  for (const tok of tryTokens) {
    if (tok.length >= 3) {
      const s = getSingleIcon(tok.toUpperCase());
      if (s) return s;
    }
  }

  // Name/symbol keyword pass — resolves index futures & commodities whose
  // iconKey is only a generic country code (e.g. "Dow Jones Futures" tagged "us").
  const haystack = `${assetName} ${assetSymbol} ${input.iconKey ?? ""}`;
  for (const [re, key] of NAME_KEYWORD_TO_KEY) {
    if (re.test(haystack)) {
      const s = getSingleIcon(key);
      if (s) return s;
    }
  }
  for (const [re, glyph] of CRYPTO_GLYPH) {
    if (re.test(haystack)) {
      return { type: "glyph", char: glyph };
    }
  }

  const last = resolveAssetIcon(assetSymbol || assetName || input.iconKey || "");
  if (last.type !== "fallback") return last;

  // Last resort: generic country-code iconKey → representative index icon.
  const countryKey = COUNTRY_ICONKEY_TO_KEY[iconKey] ?? COUNTRY_ICONKEY_TO_KEY[normalizeToken(assetSymbol)];
  if (countryKey) {
    const s = getSingleIcon(countryKey);
    if (s) return s;
  }

  return { type: "fallback", icon: NEUTRAL_ASSET_FALLBACK };
}
