import { useCallback, useState } from "react";

import type { AssetItem } from "@/lib/globe/globe-types";
import {
  effectivePublicUrl,
  extractSixLetterForex,
  NEUTRAL_ASSET_FALLBACK,
  resolveDashboardAssetIcon,
  type StrictResolvedAssetIcon,
} from "./assetIconStrict";

type ForexLabelFields = Pick<AssetItem, "id" | "iconKey" | "category" | "name" | "symbol">;

/** Forex crosses, majors, and FX futures: use currency/pair icons instead of compact text badges (e.g. USJP, AUCA). */
export function preferIconOnlyForexLabels(asset: ForexLabelFields | null | undefined): boolean {
  if (!asset) return false;
  const cat = String(asset.category || "").toLowerCase();
  if (cat.includes("forex") || cat.includes("cross pair") || cat.includes("currency")) return true;
  if (cat.includes("fx") && cat.includes("future")) return true;
  const resolved = resolveDashboardAssetIcon({
    assetId: asset.id,
    iconKey: String(asset.iconKey || ""),
    category: asset.category,
    assetName: asset.name,
    assetSymbol: asset.symbol,
  });
  return resolved.type === "forex";
}

const currencyToFlag: Record<string, string> = {
  EUR: "🇪🇺",
  USD: "🇺🇸",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  NZD: "🇳🇿",
  CHF: "🇨🇭",
  CAD: "🇨🇦",
};

const FX_FLAG_CODES: Record<string, string> = {
  usd: "1f1fa-1f1f8",
  eur: "1f1ea-1f1fa",
  jpy: "1f1ef-1f1f5",
  gbp: "1f1ec-1f1e7",
  chf: "1f1e8-1f1ed",
  aud: "1f1e6-1f1fa",
  cad: "1f1e8-1f1e6",
  nzd: "1f1f3-1f1ff",
};

const FX_FLAG_KEYS = new Set(Object.keys(currencyToFlag).map((key) => key.toLowerCase()));

/** Tailwind `w-[Npx]` clips forex pairs; keep height, let pair row set width from minWidth + CSS. */
function iconClassNameForResolved(resolved: StrictResolvedAssetIcon, className: string): string {
  if (resolved.type !== "forex") return className;
  const stripped = className.replace(/\s*!?w-\[\d+px\]\s*/g, " ").replace(/\s+/g, " ").trim();
  return `${stripped} ivq-screener-asset-icon--pair`.trim();
}

const EQUITY_BADGES: Record<string, string> = {
  spx: "500",
  nasdaq: "100",
  dow: "30",
  russell: "2K",
  dax: "40",
  stoxx: "50",
  nikkei: "225",
  ftse: "100",
};

const EMOJI_ICON_CODES: Record<string, string> = {
  gold: "1f947",
  silver: "1f948",
  copper: "1f529",
  platinum: "1faa8",
  palladium: "2699-fe0f",
  aluminum: "1f529",
  oil: "1f6e2",
  gas: "1f525",
  gasoline: "26fd",
  wheat: "1f33e",
  corn: "1f33d",
  soy: "1fad8",
  soyoil: "1f9f4",
  coffee: "2615",
  sugar: "1f36c",
  cocoa: "1f36b",
  cotton: "1f9f5",
  orange: "1f34a",
  cattle: "1f404",
  hogs: "1f416",
  btc: "1fa99",
  ethereum: "1f48e",
};

const LOCAL_ICON_FILES: Record<string, string> = {
  usd: "Dollar.png",
  gold: "Gold.png",
  silver: "silver.png",
  copper: "Kupfer.webp",
  spx: "SP.png",
  nasdaq: "NASDAQ.jpg",
  dax: "DAX.png",
};

const INDEX_FLAG_CODES: Record<string, string> = {
  spx: FX_FLAG_CODES.usd,
  nasdaq: FX_FLAG_CODES.usd,
  dow: FX_FLAG_CODES.usd,
  russell: FX_FLAG_CODES.usd,
  dax: "1f1e9-1f1ea",
  stoxx: FX_FLAG_CODES.eur,
  nikkei: FX_FLAG_CODES.jpy,
  ftse: "1f1ec-1f1e7",
};

const VISUAL_KEY_ALIASES: Record<string, string> = {
  usd_index: "usd",
  dxy: "usd",
  dx1: "usd",
  "dx1!": "usd",
  gc1: "gold",
  "gc1!": "gold",
  xauusd: "gold",
  si1: "silver",
  "si1!": "silver",
  hg1: "copper",
  "hg1!": "copper",
  "pl1!": "platinum",
  "pa1!": "palladium",
  cl1: "oil",
  "cl1!": "oil",
  usoil: "oil",
  wti_spot: "oil",
  ng1: "gas",
  "ng1!": "gas",
  natgas: "gas",
  rb1: "gasoline",
  "rb1!": "gasoline",
  zw1: "wheat",
  "zw1!": "wheat",
  zc1: "corn",
  "zc1!": "corn",
  zs1: "soy",
  "zs1!": "soy",
  zl1: "soyoil",
  "zl1!": "soyoil",
  kc1: "coffee",
  "kc1!": "coffee",
  sb1: "sugar",
  "sb1!": "sugar",
  cc1: "cocoa",
  "cc1!": "cocoa",
  ct1: "cotton",
  "ct1!": "cotton",
  oj1: "orange",
  "oj1!": "orange",
  le1: "cattle",
  "le1!": "cattle",
  he1: "hogs",
  "he1!": "hogs",
  sp500: "spx",
  nasdaq100: "nasdaq",
  dowjones: "dow",
  russell2000: "russell",
  dax40: "dax",
  euro_stoxx_50: "stoxx",
  nikkei_225: "nikkei",
  ftse_100: "ftse",
  brent_oil: "oil",
  eur: "eur",
  eurusd: "eur",
  "6e1!": "eur",
  jpy: "jpy",
  usdjpy: "jpy",
  "6j1!": "jpy",
  gbp: "gbp",
  gbpusd: "gbp",
  "6b1!": "gbp",
  chf: "chf",
  usdchf: "chf",
  "6s1!": "chf",
  aud: "aud",
  audusd: "aud",
  "6a1!": "aud",
  cad: "cad",
  usdcad: "cad",
  "6c1!": "cad",
  nzd: "nzd",
  nzdusd: "nzd",
  "6n1!": "nzd",
  ethereum: "ethereum",
  ethusd: "ethereum",
};

function emojiGlyph(code: string): string {
  const glyph = String.fromCodePoint(
    ...String(code || "")
      .split("-")
      .map((part) => Number.parseInt(part, 16))
      .filter((value) => Number.isFinite(value)),
  );
  return glyph;
}

export function emojiIconUrl(code: string): string {
  const glyph = emojiGlyph(code);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">
      <text
        x="18"
        y="26"
        text-anchor="middle"
        font-size="26"
        font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"
      >${glyph}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function twemojiUrl(code: string): string {
  return emojiIconUrl(code);
}

function publicIconUrl(fileName: string): string {
  return `/asset-icons/${fileName}`;
}

function localIconUrlForKey(iconKey: string): string | undefined {
  const key = String(iconKey || "").toLowerCase();
  const file = LOCAL_ICON_FILES[key];
  return file ? publicIconUrl(file) : undefined;
}

function resolveVisualKey(iconKey: string, assetName = ""): string {
  const rawKeys = [
    String(iconKey || "").toLowerCase(),
    String(assetName || "").toLowerCase(),
  ]
    .map((value) => value.replace(/[^a-z0-9!]+/g, "_"))
    .filter(Boolean);

  for (const rawKey of rawKeys) {
    if (VISUAL_KEY_ALIASES[rawKey]) return VISUAL_KEY_ALIASES[rawKey];
    const partial = Object.entries(VISUAL_KEY_ALIASES).find(([alias]) => rawKey.includes(alias));
    if (partial) return partial[1];
  }

  const normalizedName = String(assetName || "").toLowerCase();
  if (normalizedName.includes("dollar index")) return "usd";
  if (normalizedName.includes("lean hog")) return "hogs";
  if (normalizedName.includes("live cattle")) return "cattle";
  if (normalizedName.includes("soybean")) return "soy";
  if (normalizedName.includes("orange juice")) return "orange";
  return String(iconKey || "").toLowerCase();
}

function commoditySymbol(iconKey: string): string {
  const key = String(iconKey || "").toLowerCase();
  if (key === "gold") return "Au";
  if (key === "silver") return "Ag";
  if (key === "copper") return "Cu";
  if (key === "platinum") return "Pt";
  if (key === "palladium") return "Pd";
  if (key === "aluminum") return "Al";
  if (key === "oil") return "Oil";
  if (key === "gas") return "Gas";
  if (key === "gasoline") return "RBOB";
  if (key === "wheat") return "Wht";
  if (key === "corn") return "Corn";
  if (key === "soy") return "Soy";
  if (key === "soyoil") return "Syo";
  if (key === "coffee") return "Cof";
  if (key === "sugar") return "Sug";
  if (key === "cocoa") return "Coc";
  if (key === "cotton") return "Cot";
  if (key === "orange") return "OJ";
  if (key === "cattle") return "Cat";
  if (key === "hogs") return "Hog";
  return key.slice(0, 3).toUpperCase();
}

function parseCrossPairCodes(assetName: string): [string, string] {
  const pair = String(assetName || "").toUpperCase().trim();
  if (pair.includes("/")) {
    const [baseRaw, quoteRaw] = pair.split("/");
    return [String(baseRaw || "").slice(0, 3), String(quoteRaw || "").slice(0, 3)];
  }
  return [pair.slice(0, 3), pair.slice(3, 6)];
}

function normalizePair(pair: string): string {
  return String(pair || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace("/", "")
    .replace(/[^A-Z]/g, "");
}

function splitPair(pair: string): [string, string] | null {
  const clean = normalizePair(pair);
  if (clean.length !== 6) return null;
  if (clean === "DXYUSD") return null;
  const base = clean.slice(0, 3);
  const quote = clean.slice(3, 6);
  if (!FX_FLAG_KEYS.has(base.toLowerCase()) || !FX_FLAG_KEYS.has(quote.toLowerCase())) return null;
  return [base, quote];
}

function getForexFlags(pair: string): [string, string] | null {
  const codes = splitPair(pair);
  if (!codes) return null;
  const [base, quote] = codes;
  const baseFlag = currencyToFlag[base];
  const quoteFlag = currencyToFlag[quote];
  if (!baseFlag || !quoteFlag) {
    console.error("[asset-visual] Missing flag for forex pair", pair, { base, quote });
    return null;
  }
  return [baseFlag, quoteFlag];
}

function resolveFxPairCodes(category: string, assetName: string, assetSymbol = "", iconKey = ""): [string, string] | null {
  const fromSymbol = splitPair(assetSymbol);
  if (fromSymbol) return fromSymbol;
  if (String(category || "").toLowerCase().includes("cross pair")) {
    return parseCrossPairCodes(assetSymbol || assetName);
  }
  const fromName = splitPair(assetName);
  if (fromName) return fromName;
  const fromIconKey = splitPair(iconKey);
  if (fromIconKey) return fromIconKey;
  return null;
}

export function shortName(value: string, max = 12): string {
  const clean = String(value || "").trim();
  if (!clean) return "-";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

export type AssetVisual = {
  kind: "flags" | "icon";
  flags?: string[];
  icon?: string;
  labelShort?: string;
};

export function getAssetVisual({
  iconKey,
  category,
  assetName = "",
  assetSymbol = "",
  assetId = "",
}: {
  iconKey: string;
  category: string;
  assetName?: string;
  assetSymbol?: string;
  assetId?: string;
}): AssetVisual {
  const resolved = resolveDashboardAssetIcon({
    assetId,
    iconKey,
    category,
    assetName,
    assetSymbol,
  });
  if (resolved.type === "forex") {
    return {
      kind: "flags",
      flags: [effectivePublicUrl(resolved.baseIcon), effectivePublicUrl(resolved.quoteIcon)],
      labelShort: normalizePair(assetSymbol || assetName || iconKey),
    };
  }
  if (resolved.type === "glyph") {
    return {
      kind: "icon",
      icon: "commodity",
      labelShort: resolved.char,
    };
  }
  if (resolved.type === "single") {
    const key = resolveVisualKey(iconKey, assetName);
    return {
      kind: "icon",
      icon: key,
      labelShort: commoditySymbol(key),
    };
  }
  const key = resolveVisualKey(iconKey, assetName);
  return {
    kind: "icon",
    icon: key,
    labelShort: commoditySymbol(key),
  };
}

export function iconUrlForAsset(asset: AssetItem): string | undefined {
  const resolved = resolveDashboardAssetIcon({
    assetId: asset.id,
    iconKey: String(asset.iconKey || ""),
    category: asset.category,
    assetName: asset.name,
    assetSymbol: asset.symbol,
  });
  if (resolved.type === "forex") return effectivePublicUrl(resolved.baseIcon);
  if (resolved.type === "single") return effectivePublicUrl(resolved.icon);
  if (resolved.type === "glyph") return undefined;
  return undefined;
}

export function iconTextForAsset(asset: AssetItem): string {
  const resolved = resolveDashboardAssetIcon({
    assetId: asset.id,
    iconKey: String(asset.iconKey || ""),
    category: asset.category,
    assetName: asset.name,
    assetSymbol: asset.symbol,
  });
  if (resolved.type === "fallback") return resolved.icon;
  if (resolved.type === "glyph") return resolved.char;
  return " ";
}

export function headlineGlyph(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("dollar") || t.includes("usd")) return localIconUrlForKey("usd") || twemojiUrl(FX_FLAG_CODES.usd);
  if (t.includes("euro") || t.includes("eur")) return twemojiUrl(FX_FLAG_CODES.eur);
  if (t.includes("yen") || t.includes("jpy")) return twemojiUrl(FX_FLAG_CODES.jpy);
  if (t.includes("oil")) return twemojiUrl(EMOJI_ICON_CODES.oil);
  if (t.includes("gold")) return localIconUrlForKey("gold") || twemojiUrl(EMOJI_ICON_CODES.gold);
  if (t.includes("silver")) return localIconUrlForKey("silver") || twemojiUrl(EMOJI_ICON_CODES.silver);
  if (t.includes("copper")) return localIconUrlForKey("copper") || twemojiUrl(EMOJI_ICON_CODES.copper);
  if (t.includes("nasdaq")) return localIconUrlForKey("nasdaq") || twemojiUrl("1f4c8");
  if (t.includes("s&p") || t.includes("sp500") || t.includes("s&p 500")) return localIconUrlForKey("spx") || twemojiUrl("1f4c9");
  if (t.includes("dax")) return localIconUrlForKey("dax") || twemojiUrl("1f1e9-1f1ea");
  if (t.includes("stoxx") || t.includes("euro stoxx")) return twemojiUrl(FX_FLAG_CODES.eur);
  if (t.includes("ftse")) return twemojiUrl("1f1ec-1f1e7");
  if (t.includes("nikkei")) return twemojiUrl(FX_FLAG_CODES.jpy);
  if (t.includes("coffee")) return twemojiUrl(EMOJI_ICON_CODES.coffee);
  return twemojiUrl("1f30d");
}

function parseForexCodesFromSymbol(symbol: string): [string, string] | null {
  const fromBroker = extractSixLetterForex(symbol);
  if (fromBroker) return [fromBroker.slice(0, 3), fromBroker.slice(3, 6)];
  const clean = String(symbol || "")
    .replace(/\//g, "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (clean.length !== 6) return null;
  return [clean.slice(0, 3), clean.slice(3, 6)];
}

function StrictAssetIconView({
  resolved,
  className = "",
  size = 18,
  gap = 4,
  assetSymbol = "",
}: {
  resolved: ReturnType<typeof resolveDashboardAssetIcon>;
  className?: string;
  size?: number;
  gap?: number;
  /** Used for forex emoji fallback when local icon files are missing */
  assetSymbol?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [brokenBase, setBrokenBase] = useState(false);
  const [brokenQuote, setBrokenQuote] = useState(false);
  const [singleDead, setSingleDead] = useState(false);
  const onFail = useCallback(() => setBroken(true), []);
  const onFailBase = useCallback(() => setBrokenBase(true), []);
  const onFailQuote = useCallback(() => setBrokenQuote(true), []);

  if (resolved.type === "glyph") {
    const fs = Math.max(13, Math.round(size * 0.95));
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
        style={{ fontSize: fs }}
        aria-hidden="true"
      >
        {resolved.char}
      </span>
    );
  }

  if (broken || resolved.type === "fallback") {
    return (
      <span
        className={`inline-flex items-center justify-center leading-none ${className}`}
        style={{ fontSize: Math.max(12, size - 2) }}
        aria-hidden="true"
      >
        {resolved.type === "fallback" ? resolved.icon : NEUTRAL_ASSET_FALLBACK}
      </span>
    );
  }

  if (resolved.type === "forex") {
    const b = effectivePublicUrl(resolved.baseIcon);
    const q = effectivePublicUrl(resolved.quoteIcon);
    const parsed = parseForexCodesFromSymbol(assetSymbol);
    const baseC = resolved.baseCode ?? parsed?.[0];
    const quoteC = resolved.quoteCode ?? parsed?.[1];
    const baseFlag = baseC ? currencyToFlag[baseC] : undefined;
    const quoteFlag = quoteC ? currencyToFlag[quoteC] : undefined;
    const fs = Math.max(11, Math.round(size * 0.92));
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
        style={{ gap, minWidth: size * 2 + gap + 6, paddingInline: 2 }}
      >
        {brokenBase ? (
          <span style={{ fontSize: fs }} aria-hidden="true">{baseFlag ?? NEUTRAL_ASSET_FALLBACK}</span>
        ) : (
          <img
            src={b}
            alt=""
            width={size}
            height={size}
            className="object-contain"
            style={{ width: size, height: size }}
            loading="lazy"
            onError={onFailBase}
          />
        )}
        {brokenQuote ? (
          <span style={{ fontSize: fs }} aria-hidden="true">{quoteFlag ?? NEUTRAL_ASSET_FALLBACK}</span>
        ) : (
          <img
            src={q}
            alt=""
            width={size}
            height={size}
            className="object-contain"
            style={{ width: size, height: size }}
            loading="lazy"
            onError={onFailQuote}
          />
        )}
      </span>
    );
  }

  if (resolved.type === "single") {
    const fs = Math.max(12, Math.round(size * 0.94));
    if (singleDead && resolved.emojiFallback) {
      return (
        <span
          className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
          style={{ fontSize: fs }}
          aria-hidden="true"
        >
          {resolved.emojiFallback}
        </span>
      );
    }
    const src = effectivePublicUrl(resolved.icon);
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        onError={() => {
          if (resolved.emojiFallback) setSingleDead(true);
          else onFail();
        }}
      />
    );
  }

  return null;
}

export function AssetIcon({
  iconKey,
  category,
  assetName = "",
  assetSymbol = "",
  assetId = "",
  className = "",
}: {
  iconKey: string;
  category: string;
  assetName?: string;
  assetSymbol?: string;
  /** When set (e.g. asset.id), improves icon resolution for indices / commodities */
  assetId?: string;
  className?: string;
}) {
  const resolved = resolveDashboardAssetIcon({
    assetId,
    iconKey,
    category,
    assetName,
    assetSymbol,
  });
  const hMatch = className.match(/(?:^|\s)(?:!)?h-\[(\d+)px\]/);
  const wMatch = className.match(/(?:^|\s)(?:!)?w-\[(\d+)px\]/);
  const parsed = Number(hMatch?.[1] ?? wMatch?.[1] ?? 18);
  const size = Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
  const gap = size >= 22 ? 7 : size >= 20 ? 6 : size >= 18 ? 5 : 2;
  const viewClass = iconClassNameForResolved(resolved, className);
  return (
    <StrictAssetIconView
      resolved={resolved}
      className={viewClass}
      size={size}
      gap={gap}
      assetSymbol={assetSymbol}
    />
  );
}
