# White Swan Audit — Dow Jones TAT (YM1!)

**Run date:** 2026-08-09 17:43
**Data:** C:/Users/joris/Downloads/CBOT_MINI_DL_YM1!, 1D_ff3f0.csv | Rows: 6102 | 2002-04-05 — 2026-06-22

## Executive Summary

**Verdict: KEEP**

- WFO OOS (2007-2025): 414 trades, PF 1.2017, Expectancy 0.0493R/trade
- Positive folds: 13/19 (68%)
- IS plateau: 100.0% of 120 combos PF>1
- YM cost-adjusted expectancy: 0.0418R
- KHV 2021+: PF 1.1450

## Canonical Specification

| Field | Claimed | Audited |
|---|---|---|
| IS PF | 1.171 | 1.4920 |
| IS Trades | 409 | 107 |
| OOS PF | 1.206 | 1.2017 (WFO) |
| OOS Trades | 164 | 414 (WFO) |
| OOS Sharpe | 0.348 | N/A (R-based only) |
| Walk-Forward | 'approved' (no folds) | **THIS AUDIT** |

## Data Audit

- Rows: 6102, Range: 2002-04-05 — 2026-06-22
- Duplicates: 0
- OHLC violations: 0
- Roll artifacts (>5% near expiry): 4

## IS Parameter Plateau (2002–2018)

120 combinations tested (ATR × SL × RR).
**PF > 1.0: 120 / 120 = 100.0%** (threshold: 60%)

### Top 10 IS Combinations

| ATR | SL | RR | Trades | PF | AvgR |
|---|---|---|---|---|---|
| 10 | 2.0 | 1.0 | 375 | 1.2816 | 0.0342 |
| 10 | 2.0 | 2.0 | 375 | 1.2799 | 0.0339 |
| 10 | 2.0 | 1.5 | 375 | 1.2799 | 0.0339 |
| 10 | 2.0 | 1.25 | 375 | 1.2799 | 0.0339 |
| 10 | 2.0 | none | 375 | 1.2799 | 0.0339 |
| 7 | 2.0 | 1.0 | 376 | 1.2779 | 0.0340 |
| 7 | 2.0 | 1.25 | 376 | 1.2774 | 0.0339 |
| 7 | 2.0 | 1.5 | 376 | 1.2774 | 0.0339 |
| 7 | 2.0 | 2.0 | 376 | 1.2774 | 0.0339 |
| 7 | 2.0 | none | 376 | 1.2774 | 0.0339 |

## WFO Fold Table (5yr IS / 1yr OOS)

| OOS Year | IS Period | IS PF | OOS Trades | OOS PF | OOS R | + / - |
|---|---|---|---|---|---|---|
| 2007 | 2002–2006 | 1.408 | 23 | 2.130 | 5.43 | + |
| 2008 | 2003–2007 | 1.617 | 31 | 1.519 | 3.88 | + |
| 2009 | 2004–2008 | 1.523 | 19 | 0.678 | -1.90 | - |
| 2010 | 2005–2009 | 1.213 | 19 | 0.695 | -1.80 | - |
| 2011 | 2006–2010 | 1.160 | 24 | 0.792 | -1.77 | - |
| 2012 | 2007–2011 | 1.118 | 24 | 0.745 | -1.54 | - |
| 2013 | 2008–2012 | 0.907 | 18 | 1.270 | 1.25 | + |
| 2014 | 2009–2013 | 0.814 | 26 | 1.071 | 0.56 | + |
| 2015 | 2010–2014 | 0.900 | 23 | 1.339 | 1.66 | + |
| 2016 | 2011–2015 | 1.005 | 22 | 1.849 | 3.69 | + |
| 2017 | 2012–2016 | 1.202 | 19 | 1.041 | 0.20 | + |
| 2018 | 2013–2017 | 1.276 | 22 | 1.055 | 0.39 | + |
| 2019 | 2014–2018 | 1.223 | 19 | 2.256 | 3.50 | + |
| 2020 | 2015–2019 | 1.392 | 18 | 2.104 | 3.56 | + |
| 2021 | 2016–2020 | 1.507 | 23 | 1.406 | 1.75 | + |
| 2022 | 2017–2021 | 1.421 | 25 | 1.646 | 2.40 | + |
| 2023 | 2018–2022 | 1.548 | 15 | 0.817 | -0.81 | - |
| 2024 | 2019–2023 | 1.563 | 26 | 1.673 | 3.05 | + |
| 2025 | 2020–2024 | 1.492 | 18 | 0.456 | -3.10 | - |

### WFO Aggregate

| Metric | Value |
|---|---|
| trades | 414 |
| win_rate | 0.5266 |
| pf | 1.2017 |
| avg_r | 0.0493 |
| median_r | 0.0365 |
| payoff_ratio | 1.0805 |
| worst_streak | 6 |
| maxdd_r | -8.5283 |
| expectancy | 0.0493 |
| gross_win_r | 121.475 |
| gross_loss_r | 101.0835 |
| total_oos_r | 20.3915 |
| avg_r_per_year | 1.0732 |
| calmar_r | 0.1258 |
| positive_folds | 13 |
| total_folds | 19 |
| positive_fold_ratio | 0.6842 |
| best_year | 2007 (5.43R) |
| worst_year | 2025 (-3.10R) |

## Cost Model

Average OOS ATR: 309.6 points

| Instrument | Mult | RT Cost | 1R ($) | Cost (R) | Adj Expectancy |
|---|---|---|---|---|---|
| YM | $5/pt | $11.6 | $1548 | 0.0075R | 0.0418R |
| MYM | $0.50/pt | $1.95 | $155 | 0.0126R | 0.0367R |

### YM Cost Stress Test

| Stress | Cost (R) | Adj Exp | Status |
|---|---|---|---|
| ×1.0 | 0.0075R | 0.0418R | POSITIVE |
| ×1.25 | 0.0094R | 0.0399R | POSITIVE |
| ×1.5 | 0.0112R | 0.0381R | POSITIVE |
| ×2.0 | 0.0150R | 0.0343R | POSITIVE |

## Roll Audit

| Subset | Trades | PF |
|---|---|---|
| Near roll (±5 days) | 81 | 1.1925 |
| Away from roll | 437 | 1.2488 |

## KHV (2021–2025) — KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS

| Metric | Value |
|---|---|
| trades | 107 |
| win_rate | 0.4953 |
| pf | 1.145 |
| avg_r | 0.0308 |
| median_r | -0.0049 |
| payoff_ratio | 1.1667 |
| worst_streak | 4 |
| maxdd_r | -3.8667 |
| expectancy | 0.0308 |
| gross_win_r | 25.9752 |
| gross_loss_r | 22.6848 |

## GLD Correlation

Overlap years: [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]
Pearson R: nan
Simultaneous losing years: 0

## Gate-by-Gate Verdict

| Gate | Value | Result |
|---|---|---|
| WFO expectancy > 0 | 0.0493 | PASS |
| WFO PF > 1.1 | 1.2017 | PASS |
| Positive fold ratio >= 50% | 0.6842 | PASS |
| IS plateau >= 60% combos PF>1 | 100.0 | PASS |
| Costs (YM 1x) preserve positive expectancy | 0.0418 | PASS |
| Roll artifact: no catastrophic jumps | 4 | PASS |
| KHV 2021+ PF > 0.90 | 1.145 | PASS |

## Final Classification: KEEP

All gates pass. Strategy edge is validated.

### ws-strategy-data.ts Assessment

- Current: `status: active, weight: 9`
- Verdict: KEEP
- **Assessment: weight 9 / active status is JUSTIFIED** based on audited WFO results.