// Ranking + tile-sizing for the All-tab Live-Radar mosaic.
// Pure, cheap, deterministic — no fetching, no engine runs.
//
// Priority (high → low): open trades/positions → fresh active entries (today/yesterday)
// → closed signals → no-signal charts. An OPEN signal is always more important than a
// CLOSED one, regardless of how recently the closed one fired — so a multi-day open
// Sugar/CT/ZC swing is never demoted below a just-closed intraday signal.

export type AllTileSize = "XL" | "L" | "M" | "S" | "XS";
export type AllTileSizeBucket = "large" | "medium" | "small";

export type AllTileState = {
  key: string;
  symbol: string;
  category: string; // universeGroup, e.g. "Agrar", "Intraday MT", "Metalle"
  hasData: boolean; // payload has candles
  hasOpenTrade: boolean; // a genuinely open position/trade exists
  activeSignal: boolean; // hero: open trade OR a fresh still-active entry (today/yesterday)
  isClosedSignal: boolean; // a closed signal exists and there is NO open trade
  lastSignalMs: number | null; // most recent signal/trade time, or null
};

export type RankedAllTile = AllTileState & {
  rank: number;
  signalAgeMinutes: number | null;
  signalAgeDays: number | null;
  score: number;
  sizeBucket: AllTileSizeBucket;
  tileSize: AllTileSize;
  reason: string;
};

const CATEGORY_PRIORITY: Record<string, number> = {
  Agrar: 0,
  "Intraday MT": 1,
  Metalle: 2,
  Energie: 2,
  "Metalle+Energie": 2,
  Indizes: 3,
  Aktien: 4,
  Invest: 5,
  FX: 6,
};

// Caps keep the mosaic balanced: only a few hero tiles, the rest compact.
const MAX_XL = 7;
const MAX_L = 10;

/** Signal score. Open trades dominate; closed signals are penalised. */
function scoreTile(s: AllTileState, ageDays: number | null): number {
  if (!s.hasData) return -1000;
  let score = 0;
  if (s.hasOpenTrade) score += 100;
  if (s.activeSignal) score += 80;
  if (!s.hasOpenTrade && s.isClosedSignal) score -= 30;
  // Recency bonus only rewards still-active (open/fresh) signals, never closed ones.
  if (s.activeSignal && ageDays != null) {
    if (ageDays <= 1) score += 40;
    else if (ageDays <= 5) score += 25;
    else if (ageDays <= 21) score += 10;
  }
  return score;
}

function reasonFor(s: AllTileState, ageDays: number | null): string {
  if (!s.hasData) return "no_data";
  if (s.hasOpenTrade) return ageDays != null && ageDays <= 1 ? "open_trade_fresh" : "open_trade";
  if (s.activeSignal) return "fresh_active_signal";
  if (s.isClosedSignal) return "closed_signal";
  return "no_signal";
}

/**
 * Rank tiles by signal importance, then assign a mosaic size.
 * Sort: score desc → open before non-open → recency (recent first) → category → symbol.
 */
export function rankAllMonitoringTiles(states: AllTileState[], nowMs = Date.now()): RankedAllTile[] {
  const withMeta = states.map((s) => {
    const signalAgeMinutes = s.lastSignalMs != null ? Math.max(0, Math.floor((nowMs - s.lastSignalMs) / 60_000)) : null;
    const signalAgeDays = signalAgeMinutes != null ? signalAgeMinutes / 1440 : null;
    return { s, signalAgeMinutes, signalAgeDays, score: scoreTile(s, signalAgeDays) };
  });

  withMeta.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score; // higher score first
    if (a.s.hasOpenTrade !== b.s.hasOpenTrade) return a.s.hasOpenTrade ? -1 : 1;
    const aAge = a.signalAgeMinutes;
    const bAge = b.signalAgeMinutes;
    if (aAge != null && bAge != null && aAge !== bAge) return aAge - bAge; // recent first
    if (aAge != null && bAge == null) return -1;
    if (aAge == null && bAge != null) return 1;
    const ds = (a.s.hasData ? 0 : 1) - (b.s.hasData ? 0 : 1);
    if (ds !== 0) return ds;
    const cp = (CATEGORY_PRIORITY[a.s.category] ?? 99) - (CATEGORY_PRIORITY[b.s.category] ?? 99);
    if (cp !== 0) return cp;
    return a.s.symbol.localeCompare(b.s.symbol);
  });

  let xl = 0;
  let l = 0;
  return withMeta.map(({ s, signalAgeMinutes, signalAgeDays, score }, i) => {
    let tileSize: AllTileSize;
    let sizeBucket: AllTileSizeBucket;
    if (!s.hasData) {
      tileSize = "XS";
      sizeBucket = "small";
    } else if (s.hasOpenTrade && xl < MAX_XL) {
      tileSize = "XL";
      sizeBucket = "large";
      xl += 1;
    } else if (s.activeSignal && l < MAX_L) {
      // fresh active (non-open) entries get the large/medium band
      tileSize = "L";
      sizeBucket = "large";
      l += 1;
    } else if (s.activeSignal) {
      tileSize = "M";
      sizeBucket = "medium";
    } else if (s.isClosedSignal && signalAgeDays != null && signalAgeDays <= 7) {
      tileSize = "M";
      sizeBucket = "medium";
    } else {
      tileSize = "S";
      sizeBucket = "small";
    }
    return {
      ...s,
      rank: i + 1,
      signalAgeMinutes,
      signalAgeDays,
      score,
      sizeBucket,
      tileSize,
      reason: reasonFor(s, signalAgeDays),
    };
  });
}

/** Square-ish cell spans (cells are square, so these aspect ratios hold). */
export function tileSpan(size: AllTileSize): { cols: number; rows: number } {
  switch (size) {
    case "XL": return { cols: 3, rows: 3 };
    case "L": return { cols: 2, rows: 2 };
    case "M": return { cols: 1, rows: 1 };
    case "S": return { cols: 1, rows: 1 };
    case "XS": return { cols: 1, rows: 1 };
  }
}
