# Cache Refresh Runbook — GC1! and YM1! Daily Bars

**Applies to**: GC1! 1D (COMEX:GC1!) and YM1! 1D (CBOT_MINI:YM1!)  
**Last cache date**: 2026-07-21 (stale as of 2026-07-30)  
**Signal lock**: Active until cache is successfully refreshed and validated  

---

## Prerequisites

- TradingView account with access to COMEX:GC1! and CBOT_MINI:YM1!
- `tools/monitoring/refresh-tvc-cache.py` (requires TV authentication token)
- Python + yfinance as alternative for seeder fallback
- Write access to `public/generated/monitoring/tradingview_data_cache/D/`

---

## Refresh via TVC Cache (primary)

### 1. Authenticate

```bash
# Set TradingView session token in environment (never commit)
export TV_SESSION_TOKEN="..."
export TV_SIGNATURE="..."
```

### 2. Run refresh for target symbols

```bash
python tools/monitoring/refresh-tvc-cache.py \
  --symbols "COMEX:GC1!" "CBOT_MINI:YM1!" \
  --timeframe D \
  --bars 5000 \
  --output-dir public/generated/monitoring/tradingview_data_cache/D
```

### 3. Run post-refresh validation

```bash
node tools/market-data/validate_anomaly_sources.mjs
```

Expected output per symbol:
- `✅ TVC(GC1! 1D) recent 30 bars within price range [100, 20000]`
- `✅ TVC(YM1! 1D) recent 30 bars within price range [5000, 200000]`
- Last bar date = current trading session date
- `age=0d` (or `age=1d` if refreshed after market close on the same day)

**Fail if**:
- Any close < 100 for GC1! → scale error, do NOT commit cache
- Any close < 5000 for YM1! → scale error, do NOT commit cache
- Last bar date more than 2 trading days before today → refresh failed

### 4. Validate OHLC invariants per file

```bash
node -e "
const fs = require('fs');
for (const [sym, file, floor, ceil] of [
  ['GC1!', 'public/generated/monitoring/tradingview_data_cache/D/COMEX_GC1_D.json', 100, 20000],
  ['YM1!', 'public/generated/monitoring/tradingview_data_cache/D/CBOT_MINI_YM1_D.json', 5000, 200000],
]) {
  const bars = JSON.parse(fs.readFileSync(file, 'utf8')).bars.slice(-30);
  let errors = 0;
  for (const b of bars) {
    if (b.low > b.high) { console.error(sym, b.date, 'low > high'); errors++; }
    if (b.close < floor || b.close > ceil) { console.error(sym, b.date, 'price out of range', b.close); errors++; }
    if (!b.open || !b.high || !b.low || !b.close) { console.error(sym, b.date, 'missing OHLC field'); errors++; }
  }
  const last = bars.at(-1);
  const age = Math.floor((Date.now() - new Date(last.date + 'T12:00:00Z').getTime()) / 86400000);
  console.log(sym, errors ? '❌ ERRORS: ' + errors : '✅ OK', 'last=' + last.date, 'age=' + age + 'd', 'close=' + last.close);
}
"
```

### 5. Check for data gaps

```bash
node -e "
const fs = require('fs');
for (const [sym, file] of [
  ['GC1!', 'public/generated/monitoring/tradingview_data_cache/D/COMEX_GC1_D.json'],
  ['YM1!', 'public/generated/monitoring/tradingview_data_cache/D/CBOT_MINI_YM1_D.json'],
]) {
  const bars = JSON.parse(fs.readFileSync(file, 'utf8')).bars.slice(-60);
  let maxGap = 0;
  for (let i = 1; i < bars.length; i++) {
    const a = new Date(bars[i-1].date + 'T12:00:00Z');
    const b = new Date(bars[i].date + 'T12:00:00Z');
    const days = (b - a) / 86400000;
    if (days > maxGap) maxGap = days;
  }
  console.log(sym, 'max gap in last 60 bars:', maxGap + ' calendar days');
  // Warning if gap > 7 days (possible data hole)
  if (maxGap > 7) console.warn(sym, '⚠️ Suspicious gap — check for missing bars');
}
"
```

---

## Fallback: Refresh via Yahoo Finance (seeder)

Use only if TVC refresh fails. Yahoo Finance uses ratio-adjusted prices for futures
(auto_adjust=True), which can produce scale errors. The seeder now has price-floor
guards to reject bad data.

```bash
# Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
python tools/market-data/seed_anomaly_daily.py
```

Expected output:
```
✅  GC1!     1847 bars  [1975-01-02 → 2026-07-30]  src=yahoo/GC=F
✅  YM1!     6982 bars  [1997-10-06 → 2026-07-30]  src=yahoo/YM=F
✅  GLD       5203 bars  [2004-11-18 → 2026-07-30]  src=yahoo/GLD
```

**Fail if**:
- Any `⛔` lines appear (price floor rejection) — these indicate a new scale error
- Count for YM1! drops below 6000 bars

After seeder runs, seed Supabase cache to Next.js ohlc route:

```bash
node scripts/seed-monitoring-ohlc.mjs
```

---

## Update the manifest

After TVC refresh, regenerate the manifest:

```bash
python tools/monitoring/generate_cache_manifest.py
# or the equivalent npm script if present
npm run monitoring:generate-manifest
```

---

## Signal lock release

Signal lock for GC1! and YM1! anomaly charts is automatic:
- The `/api/monitoring/signal-gate` route reads `lastDate` from the manifest
- After a successful refresh, `lastDate` reflects the new bar date
- If `tradingDaysStale ≤ maxTradingDays`, `dataStatus` changes to `current`
- The `SignalGateStatusBand` UI will update on next page load

**Note**: Signal lock will NOT release until the Anomaly strategy engines are registered.
`engineStatus: "missing"` / `"placeholder"` blocks signals independently of data freshness.

---

## Verification checklist

- [ ] GC1! last bar ≥ today's trading session
- [ ] YM1! last bar ≥ today's trading session
- [ ] GC1! close range: 100–20 000
- [ ] YM1! close range: 5 000–200 000
- [ ] No low > high violations
- [ ] No gaps > 7 calendar days in last 60 bars
- [ ] Manifest updated with new lastDate
- [ ] `validate_anomaly_sources.mjs` reports no discrepancies
- [ ] Build passes (`npm run build`)
- [ ] Signal gate `/api/monitoring/signal-gate?asset=GC1!&timeframe=D` returns `dataStatus: "current"`
- [ ] Signal gate `/api/monitoring/signal-gate?asset=YM1!&timeframe=D` returns `dataStatus: "current"`

Until all items are checked, signal lock remains active.
