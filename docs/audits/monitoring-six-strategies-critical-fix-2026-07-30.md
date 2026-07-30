# Monitoring Six Strategies — Critical Fix Audit
**Date**: 2026-07-30  
**Scope**: Intraday tab (FDAX1! 2H, FDAX1! 1H, 6E1! 30M) and Anomaly tab (GC1! 1D, GLD 1D, YM1! 1D)  
**Severity**: Critical — live trading signal source

---

## 1. Data Chain per Chart

| Chart | Internal Asset ID | Request Symbol | Provider Symbol | Product | Provider | Exchange | TZ | Session | TF | Adjustment | Roll | Precision | Last Raw | Last Validated | Cache Key |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FDAX1! 2H | FDAX1!_2H | FDAX1! | EUREX:FDAX1! | Futures Continuous | TradingView cache | EUREX | Europe/Berlin | Regular | 2H | Continuous adj | Front roll | 0 dp | 2026-07-30T14:00Z | 2026-07-30T14:00Z | EUREX:FDAX1!\|2H |
| FDAX1! 1H | FDAX1!_1H | FDAX1! | EUREX:FDAX1! | Futures Continuous | TradingView cache | EUREX | Europe/Berlin | Regular | 1H | Continuous adj | Front roll | 0 dp | 2026-07-30T14:00Z | 2026-07-30T14:00Z | EUREX:FDAX1!\|1H |
| 6E1! 30M | 6E1!_30M | 6E1! | CME:6E1! | Futures Continuous | TradingView cache | CME | America/Chicago | Regular | 30M | Continuous adj | Front roll | 5 dp | 2026-07-30T14:00Z | 2026-07-30T14:00Z | CME:6E1!\|30M |
| GC1! 1D | GC1! | GC1! | COMEX:GC1! | Futures Continuous | TradingView cache | COMEX | America/New_York | Regular | D | Continuous adj | Front roll | 1 dp | 2026-07-21 | 2026-07-21 | COMEX:GC1!\|D |
| GLD 1D | GLD | GLD | AMEX:GLD | ETF | Supabase invest_ohlc | NYSE Arca | America/New_York | Regular | D | No adj | N/A | 2 dp | — | — | AMEX:GLD\|D |
| YM1! 1D | YM1! | YM1! | **CBOT_MINI:YM1!** (fixed) | Futures Continuous | TradingView cache | CBOT | America/Chicago | Regular | D | Continuous adj | Front roll | 0 dp | 2026-07-21 | 2026-07-21 | CBOT_MINI:YM1!\|D |

---

## 2. Root Cause — YM1! 515.44 Bug

### Symptom
Anomaly tab YM1! 1D chart showed price dropping from ~52 000 to ~515.44, a >99% collapse with no market event explanation.

### Data chain investigation

```
ANOMALY_MT_ASSETS (MonitoringPage.tsx:671)
  source: "CBOT:YM1!"  ← BUG: wrong source key
  
loadMonitoringCandles() fallback chain:
  1. Memory cache              → empty
  2. Manifest lookup           → no entry for CBOT:YM1! (only CBOT_MINI:YM1!)
  3. TVC cache file            → CBOT_YM1_D.json does NOT exist
  4. Supabase monitoring_ohlc  → returns data at ~515 (CORRUPTED)
  5. STRATEGY_ALL_S_MAP        → no entry for CBOT:YM1!
  
Result: corrupted Supabase data displayed as authoritative
```

### Correct source key
`CBOT_MINI:YM1!` is the TradingView symbol for the E-mini Dow Jones Future. This key has:
- TVC cache: `public/generated/monitoring/tradingview_data_cache/D/CBOT_MINI_YM1_D.json`  
  — 6 122 bars, close range 6 528–53 372, last bar 2026-07-21 close 52 419 ✓
- Manifest entry: `tab=Indizes`, confirmed loaded
- STRATEGY_ALL_S_MAP entry: `/generated/monitoring/all_s-5-dow-macro-ym1.json`

`CBOT:YM1!` (the former Anomaly source) has none of the above and Supabase `monitoring_ohlc` holds corrupted ~515 data under that key.

### Fix applied
**File**: `src/components/pages/MonitoringPage.tsx` line ~671  
**Change**: `source: "CBOT:YM1!"` → `source: "CBOT_MINI:YM1!"`

**File**: `src/lib/monitoring/loadMonitoringCandles.ts` STRATEGY_ALL_S_MAP  
**Change**: Added `"CBOT:YM1!"` as defensive alias pointing to same file (belt-and-suspenders; prevents regression if source ever reverts)

---

## 3. Intraday Charts — Status

### FDAX1! 2H
- Cache file: `2H/EUREX_FDAX1_2H.json` — **EXISTS**, 5 000 bars, close 18 902–26 030
- Last bar: 2026-07-30T14:00Z, close 25 689 ✓
- Max wick: 7.96% — confirmed real events (2025-04-07 and 2025-04-09 global sell-off, 2026-03-23 gap)
- Manifest: `{"asset":"FDAX1!_2H","source":"EUREX:FDAX1!","tab":"Intraday MT","timeframe":"2H","cachePath":"public/generated/monitoring/tradingview_data_cache/2H/EUREX_FDAX1_2H.json"}`
- Strategy: `dax_2h` (status: WEAK per registry — OOS not robust; live_ready=false)
- **Status: DATA OK, strategy WEAK**

### FDAX1! 1H
- Cache file: `1H/EUREX_FDAX1_1H.json` — **EXISTS**, 5 000 bars, close 22 088–26 030
- Last bar: 2026-07-30T14:00Z, close 25 689 ✓
- Max wick: 6.96% — same events as 2H
- Strategy: `dax_1h` (status: READY per registry)
- **Status: DATA OK, strategy READY**

### 6E1! 30M
- Cache file: `30M/CME_6E1_30M.json` — **EXISTS**, 5 000 bars, close 1.14–1.19
- Last bar: 2026-07-30T14:00Z, close 1.1548 ✓
- Max wick: 1.17% — checked 3 largest wicks; all on known news dates (2026-03-23, 2026-04-07, 2026-07-02); no fabricated data
- Strategy: `eurusd_30m` (status: WEAK per registry — OOS not robust; live_ready=false)
- **Status: DATA OK, strategy WEAK**

---

## 4. Anomaly Charts — Status

### GC1! 1D
- Cache file: `D/COMEX_GC1_D.json` — **EXISTS**, 12 966 bars, close 102.80–5 354.80
- Reached via manifest non-tab-exact match (manifest has it under `tab=Metalle`)
- Last bar: 2026-07-21, close 4 065.80
- Extreme wicks verified: 2008 Lehman events, 2013 gold crash, Jan–Feb 2026 gold spike — all confirmed present in both TVC cache and all_s-10 pre-computed file identically → **real market data**
- Strategy: `GC1` (status: MISSING in registry — waiting for Codex output)
- **Status: DATA OK, strategy MISSING**

### GLD 1D
- No TVC cache file (AMEX_GLD_D.json does not exist)
- No STRATEGY_ALL_S_MAP entry
- Data path: Supabase `monitoring_ohlc` → fallback `invest_ohlc` (GLD is in INVEST_OHLC_SYMBOLS at OHLC route line 151)
- Data correctness depends on `invest_ohlc` table content — cannot be verified from static files
- Strategy: PLACEHOLDER in registry
- **Status: DATA PATH OK (Supabase-dependent), strategy MISSING**

### YM1! 1D (FIXED)
- Before fix: source `CBOT:YM1!` → Supabase corrupted data (~515) — **BROKEN**
- After fix: source `CBOT_MINI:YM1!` → TVC cache `D/CBOT_MINI_YM1_D.json`
  - 6 122 bars, close range 6 528–53 372, last close 52 419 (2026-07-21) ✓
  - No fabricated 515 price reachable; Supabase path bypassed
- Strategy: `ANOMALY_4` → mapped to Dow Jones TAT; strategy PLACEHOLDER in registry
- **Status: DATA FIXED ✓, strategy PLACEHOLDER**

---

## Phase 2 — Hardening (2026-07-30)

### Supabase Quarantine Migration
New file: `supabase/migrations/20260730_quarantine_ym1_corrupt_ohlc.sql`
- Creates `monitoring_ohlc_quarantine` archive table (idempotent)
- Copies YM1! 1D rows with `close < 5000` to quarantine before deleting
- Installs trigger `monitoring_ohlc_ym1_scale_guard` blocking future inserts with `close < 5000`
- **Status**: Migration file ready; must be run manually against live database by DBA

### API Route — Instrument Price Floor
`src/app/api/monitoring/ohlc/route.ts`: added `INSTRUMENT_PRICE_FLOOR` pre-filter before `validateAndRepairOhlc`.
Floors: YM1!→5 000, FDAX1!→1 000, GC1!→100, GLD→20, 6E1!→0.5
Floor-rejected bars are logged to `ohlc_quality_events` with flag `instrument_price_floor`.

### Seeder Hardening
`tools/market-data/seed_anomaly_daily.py`: added `PRICE_FLOOR` dict; any bar whose close is below the floor is rejected before upsert with a printed warning. Prevents Yahoo Finance `auto_adjust=True` ratio-splice artifacts from re-entering the database.

### Multi-Source Cross-Validation
New script: `tools/market-data/validate_anomaly_sources.mjs`
Run: `node tools/market-data/validate_anomaly_sources.mjs [--with-supabase]`

Validation results (2026-07-30, local sources only):

| Chart | TVC cache age | all_s age | TVC vs all_s | Assessment |
|---|---|---|---|---|
| FDAX1! 2H | 0d (current) | — | — | ✓ current |
| FDAX1! 1H | 0d (current) | — | — | ✓ current |
| 6E1! 30M | 0d (current) | — | — | ✓ current |
| GC1! 1D | 9d stale | 77d stale | 39 field mismatches | See note |
| GLD 1D | no local file | no local file | N/A | Supabase only |
| YM1! 1D | 9d stale | 77d stale | 35 field mismatches | See note |

**GC1!/YM1! inter-source discrepancies**: 39 and 35 mismatches respectively, concentrated in March 2026 (up to 6.75% on GC1! LOW for 2026-03-18). Root cause: continuous futures contract roll — TVC cache updated in July 2026 with revised historical data; all_s file generated in May 2026 captures an earlier front-month adjustment. Price scale is correct in both sources. Not a data corruption issue; normal behavior for continuous futures time series.

**GLD**: No local TVC cache file exists. Chart relies entirely on live-data fallback. Cannot perform independent local cross-validation. Signals locked until independent source is confirmed.

### Signal Marker Status
Anomaly tab renders with `payload: null` and `strategy: ""` for GC1!, GLD, YM1!. This causes `getBadge(null)` → `"DATA WARN"` and `hasStrategy(null, "DATA WARN")` → `false`. No signal markers are rendered. No markers needed to be removed.

### Engine Status — Anomaly Charts
All three Anomaly strategy registrations (`ANOMALY_1`–`ANOMALY_4`) are PLACEHOLDER ("not yet defined"). The `run-anomaly` API route is a 503 stub. No signals can be computed or displayed for GC1!, GLD, or YM1! until engines are defined and approved.

---

## 5. Engine Mapping Table

| Chart | Strategy | Engine ID | Engine Version | Asset | TF | Data Source |
|---|---|---|---|---|---|---|
| FDAX1! 2H | DAX_2H | dax_2h | v1.3-weak | EUREX:FDAX1! | 2H | TVC cache |
| FDAX1! 1H | DAX_1H | dax_1h | v1.3-ready | EUREX:FDAX1! | 1H | TVC cache |
| 6E1! 30M | EURUSD_30M | eurusd_30m | v1.3-weak | CME:6E1! | 30M | TVC cache |
| GC1! 1D | GC1 | gc1_macro | MISSING | COMEX:GC1! | D | TVC cache |
| GLD 1D | ANOMALY_3 | gld_anomaly | PLACEHOLDER | AMEX:GLD | D | Supabase invest_ohlc |
| YM1! 1D | ANOMALY_4 | ym1_anomaly | PLACEHOLDER | CBOT_MINI:YM1! | D | TVC cache (fixed) |

---

## 6. OHLC Validation — Audit Results

All accepted bars verified against invariants:
- `high >= open`, `high >= close`, `high >= low` ✓
- `low <= open`, `low <= close` ✓  
- No zero/negative/NaN/Infinity prices ✓
- No duplicate timestamps ✓
- No future timestamps ✓

Extreme wicks (>5% of close):
- GC1! 1D: 7 bars with >10% range, all cross-verified as real market events (2008 crisis, 2013 crash, Jan–Feb 2026 gold spike); consistent in both TVC cache and pre-computed all_s file
- FDAX1! 2H: 3 bars >5%, all confirmed real (2025 global sell-off, 2026 gap)
- 6E1! 30M: 3 bars >0.5%, all on known news dates

---

## 7. Tests

New test file: `src/lib/market-data/__tests__/ohlc-quality.test.ts`  
**Phase 1: 17 tests, all passing** — covers:

- Valid bar acceptance
- `non_positive` (price = 0, negative)
- `non_finite` (NaN, Infinity)
- `body_outside_range` repair (high < open, low > close)
- `duplicate_timestamp` deduplication
- YM1! scale error detection (515-bar quarantined by `close_outlier` when mixed with 45 000+ bars)
- `wick_outlier` (low < 20% close, high > 5× close)
- Tick bar `tick_session_extreme` repair (0.35% cap)
- `future_timestamp` rejection
- GC vs GLD series independence (no cross-contamination)
- OHLC invariants (high >= low, positive close) after repair
- Intraday 30M and 2H bar acceptance

**Phase 2**: `src/app/api/monitoring/ohlc/__tests__/ohlc-route-floor.test.ts` — 15 tests, all passing.

Covers: YM1! 515 rejected, YM1! 45 000 accepted, floor boundary cases, mixed-series filtering, GC1! historical range, GLD ETF range, 6E1! EUR/USD range, unknown symbol passes all, CBOT:YM1! alias routes to correct data, staleness check.

**Total: 32 tests, all passing. Build: clean.**

---

## 8. External Blockers

| Item | Status |
|---|---|
| Supabase monitoring_ohlc: corrupted YM1! data at ~515 | Not cleaned up — but no longer reachable after fix; should be purged from DB separately |
| Supabase migration (quarantine YM1!) | File ready; DBA must run manually |
| GLD TVC cache file (AMEX_GLD_D.json) | Does not exist; GLD depends on invest_ohlc table; cannot independently validate |
| Strategy engines for GC1!, GLD, YM1! Anomaly | All MISSING / PLACEHOLDER in registry — Codex output pending |
| DAX_2H and EURUSD_30M live_ready | false (OOS gate not passed per Codex Run 3) |
| GLD invest_ohlc content | Unverified from static files; requires DB inspection |
| GC1! / YM1! TVC cache | Stale by 9 days (2026-07-21); requires TradingView auth to refresh |
| GC1!/YM1! signals | Locked — no approved engine; DATA WARN badge shown |
| GLD signals | Locked — no validated independent source, no approved engine |

---

## 9. Signal Safety Status

Per the security lock from this audit:

- YM1!: **DATA FIXED** — signal computation unblocked once strategy engine is implemented
- GC1!: data OK, strategy MISSING → signals blocked (engine not yet defined)
- GLD: data path OK (Supabase-dependent), strategy PLACEHOLDER → signals blocked
- FDAX1! 2H: data OK, strategy WEAK → signals flagged as WATCH, not LIVE
- FDAX1! 1H: data OK, strategy READY → signals can be promoted after tester parity check
- 6E1! 30M: data OK, strategy WEAK → signals flagged as WATCH, not LIVE

No UI shows "Live" status for any strategy without a READY registry entry. The `MonitoringStrategyWorkspace` for Anomaly returns 503 in cloud preview, preventing signal display without a local engine.
