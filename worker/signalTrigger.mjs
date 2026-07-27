// worker/signalTrigger.mjs
// Signal-triggered live fetch — ONLY the final portfolio assets that can trigger
// an active signal (White Swan 6 + Core Invest 8). Not all 46 assets.
//
// Runs every minute during market hours; for each asset, if its daily bar closes
// within <=15 min, does 1 API call -> live_quotes -> recompute forward_signals P&L.
// Total ~50 calls/day — far under every free-tier limit.
//
// Futures don't exist on the free tiers, so each maps to a liquid ETF/FX proxy.

import { PROVIDERS, providerReady, fetchBars } from "./providers.mjs";

const PMAP = { finnhub: PROVIDERS.FINNHUB, twelvedata: PROVIDERS.TWELVE_DATA };

// closeUtc = daily bar-close (UTC): US session ~21:00, London ~16:30.
export const PORTFOLIO_ASSETS = [
  // ── White Swan (6 strategies, live since Apr 2024) ──
  // Finnhub free tier has no forex, so gold uses TwelveData XAU/USD (tv_live_feed
  // still carries the GC1! future as the primary source).
  { symbol: "GC1!", strategy: "WS Friday Long",   provider: "twelvedata", apiSymbol: "XAU/USD", closeUtc: "21:00" },
  { symbol: "GLD",  strategy: "WS Thursday Long",  provider: "twelvedata", apiSymbol: "GLD",  closeUtc: "21:00" },
  { symbol: "YM1!", strategy: "WS TAT",            provider: "twelvedata", apiSymbol: "DIA",  closeUtc: "21:00" },
  { symbol: "UKX",  strategy: "WS Valuation",      provider: "twelvedata", apiSymbol: "EWU",  closeUtc: "20:00" },
  { symbol: "CT1!", strategy: "WS Macro A",        provider: "twelvedata", apiSymbol: "BAL",  closeUtc: "21:00" },
  { symbol: "NQ1!", strategy: "WS Trend LO",       provider: "twelvedata", apiSymbol: "QQQ",  closeUtc: "21:00" },
  // ── Core Invest (8 components; GLD shared with WS) ──
  { symbol: "QQQ",  strategy: "CI QQQ Pine",       provider: "twelvedata", apiSymbol: "QQQ",  closeUtc: "21:00" },
  { symbol: "SPY",  strategy: "CI SPY",            provider: "twelvedata", apiSymbol: "SPY",  closeUtc: "21:00" },
  { symbol: "SPMO", strategy: "CI SPMO",           provider: "twelvedata", apiSymbol: "SPMO", closeUtc: "21:00" },
  { symbol: "HG1!", strategy: "CI Copper/HG",      provider: "twelvedata", apiSymbol: "CPER", closeUtc: "21:00" },
  { symbol: "6S1!", strategy: "CI CHF/6S",         provider: "twelvedata", apiSymbol: "USD/CHF", invert: true, closeUtc: "21:00" },
  { symbol: "GLGG", strategy: "CI GLGG",           provider: "twelvedata", apiSymbol: "GLGG.L", closeUtc: "16:30" },
  { symbol: "FIW",  strategy: "CI FIW",            provider: "twelvedata", apiSymbol: "FIW",  closeUtc: "21:00" },
];

function minsUntilClose(closeUtc, now = new Date()) {
  const [h, m] = closeUtc.split(":").map(Number);
  const close = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  return (close.getTime() - now.getTime()) / 60000;
}

// One fetch per asset per close window — avoids hammering the free-tier rate limit
// when the per-minute cron fires repeatedly inside the 15-min window.
const lastFetched = new Map();
const DEDUP_MS = 25 * 60 * 1000;

// force=true ignores the timing window AND dedup (manual/first run).
export async function runSignalTrigger(supabase, { force = false } = {}) {
  const now = new Date();
  const fetched = [];
  const skipped = [];
  for (const a of PORTFOLIO_ASSETS) {
    const mins = minsUntilClose(a.closeUtc, now);
    if (!force && !(mins >= 0 && mins <= 15)) { skipped.push(`${a.symbol}(t−${Math.round(mins)}m)`); continue; }
    if (!force && now.getTime() - (lastFetched.get(a.symbol) ?? 0) < DEDUP_MS) { skipped.push(`${a.symbol}(done)`); continue; }
    const provider = PMAP[a.provider];
    if (!provider || !providerReady(provider)) { skipped.push(`${a.symbol}(no ${a.provider} key)`); continue; }

    const bars = await fetchBars(provider, a.apiSymbol, "1D", 2);
    await new Promise((r) => setTimeout(r, provider.delay));
    if (!bars.length) { skipped.push(`${a.symbol}(no data)`); continue; }

    const last = bars[bars.length - 1];
    const inv = (v) => (a.invert && v > 0 ? 1 / v : v);
    const price = inv(last.close);
    if (!(price > 0)) { skipped.push(`${a.symbol}(bad price)`); continue; }

    const nowIso = new Date().toISOString();
    await supabase.from("live_quotes").upsert({
      symbol: a.symbol,
      open: inv(last.open ?? last.close), high: inv(last.high ?? last.close), low: inv(last.low ?? last.close),
      close: price, volume: last.volume ?? 0, timestamp: nowIso, updated_at: nowIso,
    }, { onConflict: "symbol" });

    // Recompute live P&L on any open forward_signals for this asset (best-effort;
    // forward_signals may not have entry_price/current_price columns).
    try {
      const { data: sigs } = await supabase.from("forward_signals").select("*").eq("symbol", a.symbol).eq("in_position", true);
      for (const s of sigs ?? []) {
        const entry = Number(s.entry_price);
        if (!Number.isFinite(entry) || entry === 0) continue;
        const chg = ((price - entry) / entry) * 100;
        await supabase.from("forward_signals").update({
          current_price: price,
          live_pnl_pct: String(s.direction).toUpperCase() === "SHORT" ? -chg : chg,
        }).eq("id", s.id);
      }
    } catch { /* columns may not exist */ }

    lastFetched.set(a.symbol, Date.now());
    fetched.push(`${a.symbol}=${price.toFixed(4)}`);
  }
  return { fetched, skipped };
}
