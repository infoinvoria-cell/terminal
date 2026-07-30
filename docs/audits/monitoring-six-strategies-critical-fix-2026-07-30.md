# Monitoring Six Strategies — Critical Fix Audit
**Date**: 2026-07-30  
**Scope**: Intraday tab (FDAX1! 2H, FDAX1! 1H, 6E1! 30M) and Anomaly tab (GC1! 1D, GLD 1D, YM1! 1D)  
**Severity**: Critical — live trading signal source

---

## Root Cause — YM1! 515.44 Bug

### Symptom
Anomaly tab YM1! 1D chart showed price near ~515 instead of the correct ~52 000 range for the Dow Jones E-mini Future.

### Cause
`ANOMALY_MT_ASSETS` defined `source: "CBOT:YM1!"`. This key has no local TVC cache file and the static data fallback could not find it. The live-data fallback returned corrupted ~515 data for that key. Because the whole series was consistently wrong, the within-series outlier detection could not catch it.

The correct TradingView source symbol for YM1! is `CBOT_MINI:YM1!`, which has a valid multi-year daily cache (price range commensurate with a 40 000–53 000-point Dow index) and is already used by the Indizes tab.

### Fix
- `src/components/pages/MonitoringPage.tsx`: changed Anomaly YM1! `source` from `"CBOT:YM1!"` to `"CBOT_MINI:YM1!"`
- `src/lib/monitoring/loadMonitoringCandles.ts`: added `"CBOT:YM1!"` as a defensive alias in the strategy-payload fallback map, so a future revert to the old key still routes to the correct pre-computed file rather than the corrupted live-data response

---

## Data Verification — All Six Charts

| Chart | Data source | Last bar | Close range | Status |
|---|---|---|---|---|
| FDAX1! 2H | TVC cache | 2026-07-30T14:00Z | 18 902–26 030 | ✓ valid |
| FDAX1! 1H | TVC cache | 2026-07-30T14:00Z | 22 088–26 030 | ✓ valid |
| 6E1! 30M | TVC cache | 2026-07-30T14:00Z | 1.14–1.19 | ✓ valid |
| GC1! 1D | TVC cache | 2026-07-21 | 102.80–5 354.80 | ✓ valid (historical range since 1975) |
| GLD 1D | Live data fallback | — | — | depends on live data |
| YM1! 1D | TVC cache (after fix) | 2026-07-21 | 6 528–53 372 | ✓ valid after fix |

### Extreme wicks verified
- **FDAX1! 2H/1H**: 3 bars >5% range — confirmed real events (2025-04-07/09 sell-off, 2026-03-23 gap)
- **GC1! 1D**: 7 bars >10% range — confirmed real events (2008 crisis, 2013 gold crash, Jan–Feb 2026 gold spike); same values in both the TVC cache and the pre-computed strategy file
- **6E1! 30M**: 3 bars >0.5% — on known news dates, within normal FX range

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

## Tests Added

**Phase 1**: `src/lib/market-data/__tests__/ohlc-quality.test.ts` — 17 tests, all passing.

Covers: valid bar acceptance, zero/negative/NaN/Infinity price rejection, body-outside-range repair, duplicate timestamp deduplication, YM-style scale error detection (515 close quarantined when mixed with 45 000+ series), extreme wick detection, tick bar session-extreme repair, future timestamp rejection, GC vs GLD series independence, OHLC invariant verification, intraday (30M/2H) acceptance.

**Phase 2**: `src/app/api/monitoring/ohlc/__tests__/ohlc-route-floor.test.ts` — 15 tests, all passing.

Covers: YM1! 515 rejected, YM1! 45 000 accepted, floor boundary cases, mixed-series filtering, GC1! historical range, GLD ETF range, 6E1! EUR/USD range, unknown symbol passes all, CBOT:YM1! alias routes to correct data, staleness check.

**Total: 32 tests, all passing. Build: clean.**

---

## Remaining External Blockers

| Item | Status |
|---|---|
| Supabase migration | File ready; DBA must run manually |
| GC1! / YM1! TVC cache | Stale by 9 days (2026-07-21); requires TradingView auth to refresh |
| GLD local validation | No TVC cache file; Supabase-only; cannot independently validate |
| Strategy engines for GC1!, GLD, YM1! | All PLACEHOLDER — Codex output pending |
| DAX 2H and EUR 30M live_ready flag | false (OOS gate not passed) |
| GLD signals | Locked — no validated independent source, no approved engine |
| GC1!/YM1! signals | Locked — no approved engine; DATA WARN badge shown |
