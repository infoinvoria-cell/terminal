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

## Tests Added

New file: `src/lib/market-data/__tests__/ohlc-quality.test.ts` — 17 tests, all passing.

Covers: valid bar acceptance, zero/negative/NaN/Infinity price rejection, body-outside-range repair, duplicate timestamp deduplication, YM-style scale error detection (515 close quarantined when mixed with 45 000+ series), extreme wick detection, tick bar session-extreme repair, future timestamp rejection, GC vs GLD series independence, OHLC invariant verification, intraday (30M/2H) acceptance.

---

## Remaining External Blockers

| Item | Status |
|---|---|
| Corrupted YM1! data in live-data store | Not cleaned up — no longer reachable after fix; should be purged separately |
| GLD has no local TVC cache | By design; relies on live-data fallback |
| Strategy engines for GC1!, GLD, YM1! Anomaly | Not yet defined (pending) |
| DAX 2H and EUR 30M live_ready flag | false (OOS gate not passed) |
| GC1! and YM1! cache staleness | Last date 2026-07-21; normal refresh cycle pending |
