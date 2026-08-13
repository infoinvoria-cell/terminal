/**
 * Central entity navigation resolver.
 * Maps canonical entity identifiers → deep-link URLs for each surface.
 *
 * Usage:
 *   getEntityHref("trend_momentum_dax_2h", "ENGINE")  → "/engine?strategy=DAX_2H"
 *   getEntityHref("intraday-dax-2h", "ENGINE")        → "/engine?strategy=DAX_2H"
 *   getEntityHref("DAX2H", "ENGINE")                  → "/engine?strategy=DAX_2H"
 *   getEntityHref("ws", "ANALYTICS")                  → "/analytics?portfolio=ws"
 */

export type Surface =
  | "ENGINE"
  | "SIGNALS"
  | "COMPONENTS"
  | "MONITORING"
  | "ANALYTICS"
  | "MODELING"
  | "BRAIN";

/** Canonical engine strategy key, used in ?strategy= URL param */
export type EngineStrategyKey = "DAX_2H" | "DAX_1H" | "EUR_30M" | "GC_FRI" | "GLD_THU" | "YM_TAT";

/** All recognized aliases for intraday strategies */
const INTRADAY_STRATEGY_MAP: Record<string, EngineStrategyKey> = {
  // canonical IDs
  "trend_momentum_dax_2h": "DAX_2H",
  "mt_dax_1h":             "DAX_1H",
  "eurusd_mt_30m":         "EUR_30M",

  // engine keys (already canonical)
  "DAX_2H":  "DAX_2H",
  "DAX_1H":  "DAX_1H",
  "EUR_30M": "EUR_30M",

  // ws-strategy-data intradayId values
  "DAX2H":  "DAX_2H",
  "DAX1H":  "DAX_1H",
  "EUR30m": "EUR_30M",
  "EUR30M": "EUR_30M",

  // signal card IDs
  "intraday-dax-2h":  "DAX_2H",
  "intraday-dax-1h":  "DAX_1H",
  "intraday-eur-30m": "EUR_30M",

  // display labels (case-exact as used in the app)
  "DAX 2H":     "DAX_2H",
  "DAX 1H":     "DAX_1H",
  "DAX 1H / MT":"DAX_1H",
  "EUR 30m":    "EUR_30M",
  "EUR 30M":    "EUR_30M",
  "EUR/USD 30M":"EUR_30M",

  // codexSymbol values
  "DAX_2H_CODEX": "DAX_2H",
  "DAX_1H_CODEX": "DAX_1H",
  "EURUSD_30M":   "EUR_30M",
};

/** Portfolio/analytics aliases */
const PORTFOLIO_MAP: Record<string, string> = {
  "ws":          "ws",
  "white_swan":  "ws",
  "White Swan":  "ws",
  "ci":          "ci",
  "core_invest": "ci",
  "Core Invest": "ci",
};

/**
 * Resolve a canonical engine strategy key from any recognized alias.
 * Returns null if not an intraday strategy.
 */
export function resolveEngineKey(id: string): EngineStrategyKey | null {
  return INTRADAY_STRATEGY_MAP[id] ?? null;
}

/**
 * Resolve a portfolio key from any recognized alias.
 * Returns null if not a portfolio entity.
 */
export function resolvePortfolioKey(id: string): string | null {
  return PORTFOLIO_MAP[id] ?? null;
}

/**
 * Get the deep-link URL for a given entity + target surface.
 * Returns null if the combination has no defined route.
 */
export function getEntityHref(entity: string, surface: Surface): string | null {
  const engineKey = resolveEngineKey(entity);
  const portfolioKey = resolvePortfolioKey(entity);

  switch (surface) {
    case "ENGINE":
      if (engineKey) return `/engine?strategy=${engineKey}`;
      return null;

    case "SIGNALS":
      if (engineKey) {
        const signalId: Record<EngineStrategyKey, string> = {
          DAX_2H:  "intraday-dax-2h",
          DAX_1H:  "intraday-dax-1h",
          EUR_30M: "intraday-eur-30m",
          GC_FRI:  "gc-fri",
          GLD_THU: "gld-thu",
          YM_TAT:  "ym-tat",
        };
        return `/signals?strategy=${signalId[engineKey]}`;
      }
      return null;

    case "COMPONENTS":
      if (engineKey) {
        const componentId: Record<EngineStrategyKey, string> = {
          DAX_2H:  "DAX_2H",
          DAX_1H:  "DAX_1H",
          EUR_30M: "EUR_30M",
          GC_FRI:  "GC_FRI",
          GLD_THU: "GLD_THU",
          YM_TAT:  "YM_TAT",
        };
        return `/komponenten?strategy=${componentId[engineKey]}`;
      }
      return null;

    case "MONITORING":
      if (engineKey) {
        const monitorSymbol: Record<EngineStrategyKey, string> = {
          DAX_2H:  "FDAX1!",
          DAX_1H:  "FDAX1!",
          EUR_30M: "6E1!",
          GC_FRI:  "GC1!",
          GLD_THU: "GC1!",
          YM_TAT:  "YM1!",
        };
        const monitorTf: Record<EngineStrategyKey, string> = {
          DAX_2H:  "2H",
          DAX_1H:  "1H",
          EUR_30M: "30M",
          GC_FRI:  "D",
          GLD_THU: "D",
          YM_TAT:  "D",
        };
        return `/monitoring?symbol=${monitorSymbol[engineKey]}&tf=${monitorTf[engineKey]}`;
      }
      return null;

    case "ANALYTICS":
      if (portfolioKey) return `/analytics?portfolio=${portfolioKey}`;
      if (engineKey) return `/analytics?strategy=${engineKey}`;
      return null;

    case "MODELING":
      if (portfolioKey) return `/modeling?selection=portfolio-${portfolioKey}`;
      if (engineKey) return `/modeling?selection=strategy-${engineKey.toLowerCase()}`;
      // asset fallback
      return `/modeling?selection=asset-${entity}`;

    case "BRAIN":
      if (engineKey) return `/brain?node=strategy:${INTRADAY_STRATEGY_MAP[entity] ?? engineKey}`;
      if (portfolioKey) return `/brain?node=portfolio:${portfolioKey}`;
      return `/brain`;
  }
}

/**
 * Check if an entity has an engine deep-link (is an intraday strategy).
 */
export function hasEngineLink(entity: string): boolean {
  return resolveEngineKey(entity) !== null;
}
