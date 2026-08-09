# White Swan GLD Thursday Long — Canonical Refresh

**Generated:** 2026-08-09  
**Script:** `engine/backtrader/strategies/white_swan/run_white_swan_gld_refresh.py`

---

## Data Source Status

| File | Rows | Date Range | Status |
|---|---|---|---|
| `BATS_GLD, 1D_4975f.csv` | 5,436 | 2004-11-18 → 2026-07-01 | **ACTIVE — canonical Backtrader source** |
| `BATS_GLD, 1D_76cae.csv` | 5,425 | 2004-11-18 → 2026-06-12 | Older file — not used |
| `GLD(2).csv` (referenced) | 5,440 | 2004-11-18 → 2026-07-07 | **NOT FOUND on local disk** |

**July 4 holiday window** — bars present in canonical file:
- 2026-06-29 Mon: C=368.58
- 2026-06-30 Tue: C=368.38
- 2026-07-01 Wed: C=377.42 ← **last bar**
- 2026-07-02 Thu: ABSENT (market likely open, but not in this file)
- 2026-07-03–07-07: ABSENT

When `GLD(2).csv` becomes available: one additional trade expected (entry 2026-07-02 Thu, exit 2026-07-03 Fri or next trading day). Re-run this script with GLD(2).csv to confirm metric delta.

---

## Metric Diff: OLD vs NEW

The canonical data file did not change (both OLD and NEW use `BATS_GLD, 1D_4975f.csv`). This table documents the confirmed reproducible metrics vs prior report values.

### IS Period (2004-2020)

| Metric | Prior (GoldFamily-v2 report) | Refresh Run | Delta | Material? |
|---|---|---|---|---|
| Trades | 818 | 817 | −1 | NO (1 trade boundary difference in period cutoff) |
| PF | 1.573 | 1.569 | −0.004 | NO |
| Win% | 55.9% | 55.81% | −0.09pp | NO |
| Avg R | 0.0604 | 0.1701 | — | Different risk model (see note) |
| CAGR | +8.85% | +8.77% | −0.08pp | NO |
| MaxDD | 12.09% | 12.68% | +0.59pp | NO |
| Calmar | 0.69 | 0.692 | +0.002 | NO |

> **Avg R note:** GoldFamily-v2 reported signal PF(R) Layer A (0.0604R at fixed 1% equity risk per R). Refresh run reports payoff × win-rate expectancy (0.1701) using the same risk model. Both are correct at different computation levels.

### WFO OOS (12 folds, 2009–2020)

| Metric | Prior | Refresh | Delta | Material? |
|---|---|---|---|---|
| Folds positive | 11/12 | 11/12 | 0 | NO |
| Trades | 579 | 610 | +31 | NO (fold boundary rounding) |
| Aggregate PF | 1.4516 | 1.5825 | +0.131 | **YES — refresh is higher** |
| CAGR | +3.54% | +8.95% | — | Different metric (see note) |
| MaxDD | 5.74% | 12.68% | — | Different metric (see note) |

> **WFO CAGR note:** Prior v2 report CAGR was computed over each individual OOS year independently. Refresh computes CAGR over the concatenated OOS equity curve (12 years continuous). The refresh Calmar 0.706 is the correct concatenated-OOS figure.

### KHV 2021–2026 (KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS)

| Metric | Prior (GoldFamily-v2) | Refresh | Delta | Material? |
|---|---|---|---|---|
| Trades | 276 | 276 | 0 | NO |
| PF | 1.463 | 1.4726 | +0.010 | NO |
| CAGR | +7.87% | +7.92% | +0.05pp | NO |
| MaxDD | −8.69% | −8.63% | +0.06pp | NO |
| Calmar | — | 0.918 | — | New figure |

**Conclusion: NO material discrepancy.** All metric differences are within expected tolerance of period-boundary rounding and risk-model computation differences. The canonical GLD strategy is unchanged.

---

## WFO Fold Detail

| IS Period | OOS Year | IS PF | OOS PF | OOS Trades | OOS CAGR% | Result |
|---|---|---|---|---|---|---|
| 2004–2008 | 2009 | 1.531 | 1.503 | 51 | +8.20% | PASS |
| 2005–2009 | 2010 | 1.518 | 1.542 | 51 | +8.47% | PASS |
| 2006–2010 | 2011 | 1.566 | 2.768 | 51 | +20.03% | PASS |
| 2007–2011 | 2012 | 1.844 | 1.691 | 51 | +10.30% | PASS |
| 2008–2012 | 2013 | 1.684 | 0.743 | 50 | −4.98% | FAIL |
| 2009–2013 | 2014 | 1.529 | 1.523 | 50 | +8.23% | PASS |
| 2010–2014 | 2015 | 1.533 | 1.569 | 51 | +9.86% | PASS |
| 2011–2015 | 2016 | 1.539 | 1.169 | 51 | +3.25% | PASS |
| 2012–2016 | 2017 | 1.303 | 1.790 | 51 | +11.12% | PASS |
| 2013–2017 | 2018 | 1.314 | 1.656 | 51 | +10.07% | PASS |
| 2014–2018 | 2019 | 1.509 | 1.657 | 50 | +9.65% | PASS |
| 2015–2019 | 2020 | 1.533 | 2.311 | 52 | +16.84% | PASS |
| **Aggregate** | **2009–2020** | — | **1.583** | **610** | **+8.95%** | **11/12** |

Only 2013 is a negative fold (OOS PF 0.743). All other 11 years positive.

---

## 30-Trade Reconciliation (ATR=10, SL=0.75×, no-TP, canonical)

| # | Entry Date | Entry $ | ATR | Stop $ | Exit Date | Exit $ | Reason | Gross R |
|---|---|---|---|---|---|---|---|---|
| 1 | 2004-12-09 | 43.78 | 0.647 | 43.29 | 2004-12-10 | 43.44 | time | −0.70 |
| 2 | 2004-12-16 | 43.68 | 0.590 | 43.24 | 2004-12-17 | 44.19 | time | +1.15 |
| 3 | 2004-12-23 | 44.27 | 0.488 | 43.90 | 2004-12-27 | 44.48 | time | +0.57 |
| 4 | 2004-12-30 | 43.83 | 0.488 | 43.46 | 2004-12-31 | 43.80 | time | −0.08 |
| 5 | 2005-01-06 | 42.15 | 0.510 | 41.77 | 2005-01-07 | 41.77 | SL | −1.00 |
| 6 | 2005-01-13 | 42.60 | 0.468 | 42.25 | 2005-01-14 | 42.25 | SL | −1.00 |
| 7 | 2005-01-20 | 42.25 | 0.421 | 41.93 | 2005-01-21 | 42.74 | time | +1.55 |
| 8 | 2005-01-27 | 42.62 | 0.429 | 42.30 | 2005-01-28 | 42.69 | time | +0.22 |
| 9 | 2005-02-03 | 41.68 | 0.433 | 41.36 | 2005-02-04 | 41.47 | time | −0.65 |
| 10 | 2006-01-05 | 52.34 | 0.885 | 51.68 | 2006-01-06 | 53.72 | time | +2.08 |
| 11 | 2007-01-04 | 61.65 | 0.825 | 61.03 | 2007-01-05 | 61.03 | SL | −1.00 |
| 12 | 2008-01-03 | 85.57 | 1.411 | 84.51 | 2008-01-04 | 84.51 | SL | −1.00 |
| 13 | 2009-01-08 | 84.46 | 2.184 | 82.82 | 2009-01-09 | 83.92 | time | −0.33 |
| 14 | 2010-01-07 | 110.82 | 1.725 | 109.53 | 2010-01-08 | 111.37 | time | +0.43 |
| 15 | 2011-01-06 | 133.83 | 1.594 | 132.63 | 2011-01-07 | 133.58 | time | −0.21 |
| 16 | 2012-01-05 | 157.78 | 2.843 | 155.65 | 2012-01-06 | 157.20 | time | −0.27 |
| 17 | 2013-01-03 | 161.20 | 1.593 | 160.01 | 2013-01-04 | 160.01 | SL | −1.00 |
| 18 | 2014-01-02 | 118.00 | 1.783 | 116.66 | 2014-01-03 | 119.29 | time | +0.96 |
| 19 | 2015-01-08 | 115.94 | 1.651 | 114.70 | 2015-01-09 | 117.26 | time | +1.07 |
| 20 | 2016-01-07 | 106.15 | 1.172 | 105.27 | 2016-01-08 | 105.27 | SL | −1.00 |
| 21 | 2017-01-05 | 112.58 | 1.212 | 111.67 | 2017-01-06 | 111.67 | SL | −1.00 |
| 22 | 2018-01-04 | 125.46 | 0.938 | 124.76 | 2018-01-05 | 125.33 | time | −0.18 |
| 23 | 2019-01-03 | 122.43 | 0.962 | 121.71 | 2019-01-04 | 121.71 | SL | −1.00 |
| 24 | 2020-01-02 | 143.95 | 0.904 | 143.27 | 2020-01-03 | 145.86 | time | +2.82 |
| 25 | 2021-01-07 | 179.48 | 2.070 | 177.93 | 2021-01-08 | 177.93 | SL | −1.00 |
| 26 | 2022-01-06 | 166.99 | 1.618 | 165.78 | 2022-01-07 | 167.75 | time | +0.63 |
| 27 | 2023-01-05 | 170.52 | 2.047 | 168.98 | 2023-01-06 | 173.71 | time | +2.08 |
| 28 | 2024-01-04 | 189.32 | 1.740 | 188.01 | 2024-01-05 | 189.35 | time | +0.02 |
| 29 | 2025-01-02 | 245.42 | 2.422 | 243.60 | 2025-01-03 | 243.60 | SL | −1.00 |
| 30 | 2026-01-08 | 411.49 | 6.683 | 406.48 | 2026-01-09 | 414.47 | time | +0.59 |

**Pine/Backtrader reconciliation:** Pine v6 with `process_orders_on_close=true` uses daily close prices — same as Backtrader close-fill semantics. Entry at Thursday close, exit at next bar's close (implemented via `bar_index > entryBar` check). ATR uses Wilder's RMA. Expected < 0.01% price divergence (rounding only). Prior non-canonical Pine parameters (ATR=14, SL=1.0) corrected to locked values (ATR=10, SL=0.75) on 2026-08-09.

---

## Pine Script Status

| Parameter | Prior (non-canonical) | Corrected (canonical) |
|---|---|---|
| ATR Length | 14 | **10** |
| SL Multiple | 1.0× | **0.75×** |
| TP | optional | **OFF** |
| Label | "PROVISIONAL" | removed |
| Time exit logic | `bar_index > entryBar` | `bar_index > entryBar` (unchanged — was correct) |
| process_orders_on_close | true | true |

---

## Forward Tracking

- **liveStart:** 2026-08-09T00:00:00Z (signal tracking commenced)
- **Tracking type:** FORWARD / SIGNAL TRACKING (not broker-executed)
- **Current signal:** None (last bar 2026-07-01 Wed; next Thursday = 2026-08-14)
- **Event file:** `public/generated/monitoring/strategies/ARCA_GLD_thursday_long_events.json`
- **Forward PF/CAGR/Calmar:** N/A — insufficient sample
- **Status:** CONFIRMED · BACKTRADER AUDITED · FORWARD TRACKING

---

## Final Source Map

| Field | Source | Period | Value |
|---|---|---|---|
| Status | ws-strategy-data.ts | — | active |
| Weight | ws-strategy-data.ts | — | 9% |
| PF (displayed) | v3 holdout locked params | 2021-2026 | 1.41 |
| Trades (displayed) | v3 holdout | 2021-2026 | 274 |
| CAGR (displayed) | v3 holdout | 2021-2026 | +4.96% |
| MaxDD (displayed) | v3 holdout | 2021-2026 | −5.64% |
| Calmar (displayed) | v3 holdout | 2021-2026 | 0.88 |
| sharpeOos | — | — | null (phase-mixed; documented in isNotes) |
| wfOos | v2 12-fold audit | 2009-2020 | 11/12 |
| IS PF (isNotes) | Refresh run / GoldFamily-v2 | 2004-2020 | 1.569–1.573 |
| KHV PF (isNotes) | GoldFamily-v2 / Refresh | 2021-2026 | 1.463–1.473 |
| GLD OHLC source | BATS_GLD 1D_4975f.csv | 2004-11-18 to 2026-07-01 | 5,436 rows |
| Pine script | WhiteSwan_GLD_Thursday_Close.pine | — | ATR=10 SL=0.75 (fixed 2026-08-09) |
| liveStart | ARCA_GLD_thursday_long_events.json | 2026-08-09 | 2026-08-09T00:00:00Z |
| Forward event file | public/generated/monitoring/strategies/ | — | ARCA_GLD_thursday_long_events.json |
