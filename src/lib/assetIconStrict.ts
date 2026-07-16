/**
 * Strict file-based asset icons under /public/asset-icons/.
 * Primary: local png/jpg/webp; then domain emoji where configured; generic fallback is neutral (not ðŸ’°).
 */

// Stub: screener asset definitions are not available in Capitalife Terminal.
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
};

/** ISO FX legs only â€” excludes XAU/XAG etc. so "XAGUSD" is not treated as a currency cross. */
const FX_LEG_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"]);

function isFxLeg(code: string): boolean {
  return FX_LEG_CODES.has(code);
}

export type StrictResolvedAssetIcon =
  | { type: "forex"; baseIcon: string; quoteIcon: string; baseCode: string; quoteCode: string }
  | { type: "single"; icon: string; emojiFallback?: string }
  | { type: "glyph"; char: string }
  | { type: "fallback"; icon: string };

/** Generic unknown asset â€” avoid ðŸ’° (commodities / indices). */
export const NEUTRAL_ASSET_FALLBACK = "\uD83C\uDF10";

const OIL_EMOJI = "\uD83D\uDEE2";
const SILVER_EMOJI = "\uD83E\uDD48";

const ASSET_ID_GLYPH: Record<string, string> = {
  sugar: "\uD83C\uDF6C",
  wheat: "\uD83C\uDF3E",
  corn: "\uD83C\uDF3D",
  soybeans: "\uD83C\uDF31",
  coffee: "\u2615",
  cocoa: "\uD83C\uDF6B",
  cotton: "\uD83E\uDDF5",
  natgas: "\uD83D\uDD25",
};

const ASSET_ID_SINGLE_EMOJI: Record<string, { icon: string; emoji: string }> = {
  brent_oil: { icon: p("usd.png"), emoji: OIL_EMOJI },
  wti_spot: { icon: p("usd.png"), emoji: OIL_EMOJI },
  silver: { icon: p("silver.png"), emoji: SILVER_EMOJI },
};

export function effectivePublicUrl(absolutePath: string): string {
  if (typeof window !== "undefined" && String(window.location.pathname || "").startsWith("/globe-app")) {
    return absolutePath.replace(/^\/asset-icons\//, "/globe-app/asset-icons/");
  }
  return absolutePath;
}

/**
 * Pull a 6-letter AABBCC segment from broker symbols (e.g. OANDA:GBPCAD â†’ GBPCAD).
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

/** Known dashboard asset ids â†’ ASSET_ICON_MAP key */
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

/** Normalized token â†’ strict map key (from iconKey / id fragments) */
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
  dow: "USD",
  dowjones: "USD",
  russell: "USD",
  djia: "USD",
};

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

  const last = resolveAssetIcon(assetSymbol || assetName || input.iconKey || "");
  if (last.type !== "fallback") return last;

  return { type: "fallback", icon: NEUTRAL_ASSET_FALLBACK };
}
