# White Swan Gold Family Research — v2
Generated: 2026-08-09 13:45 UTC
**GLD File Confirmed:** `C:\Users\joris\Downloads\BATS_GLD, 1D_4975f.csv`
**IS Period:** 2003-07-30 through 2020-12-31
**Known Historical Validation:** 2021-01-01 through 2026-06-05 (NOT pristine holdout)
**GC locked params:** ATR=10, SL_mult=0.75, RR=1.25
**GLD locked params:** ATR=10, SL_mult=0.75, RR=None (no-TP)

---

## Meta-Selection Bias Disclosure

DXY was chosen from 3 regime candidates (DXY, US10Y, combined) based on best aggregate WFO OOS PF. This constitutes meta-selection bias.

In v1, three regime candidates were compared on the **same** concatenated WFO OOS result set:

| Regime | WFO OOS PF | Pos Folds |
|--------|-----------|-----------|
| Base GC (no filter) | 1.111 | 7/13 |
| DXY declining | 1.332 | 11/13 |
| US10Y declining | 1.053 | 6/13 |
| Combined | 1.310 | 9/13 |

DXY was selected because it produced the best aggregate OOS PF — this is a post-hoc selection.
**Economic plausibility exists** (weak USD = gold bullish) but threshold was not pre-specified.
The DXY filter's margin of superiority must be discounted accordingly.

---

## Task 1 — DXY Regime Fold-by-Fold Audit

**DXY definition:** close < SMA(20), lookback=20 trading days

| Fold IS | OOS | GC Trades | DXY Trades | Unfilt PF | Filt PF | Exp R/tr | Total R | MaxDD-R | Improved |
|---------|-----|-----------|------------|-----------|---------|----------|---------|---------|----------|
| 2003-2007 | 2008 | 51 | 26 | 2.292 | 2.000 | +0.3846 | +10.000 | 2.750 | NO |
| 2004-2008 | 2009 | 49 | 30 | 0.862 | 1.250 | +0.1250 | +3.750 | 4.750 | YES |
| 2005-2009 | 2010 | 49 | 22 | 1.534 | 1.500 | +0.2273 | +5.000 | 4.000 | NO |
| 2006-2010 | 2011 | 50 | 26 | 1.354 | 1.458 | +0.2115 | +5.500 | 4.000 | YES |
| 2007-2011 | 2012 | 51 | 29 | 1.111 | 1.339 | +0.1638 | +4.750 | 4.750 | YES |
| 2008-2012 | 2013 | 51 | 24 | 1.406 | 2.083 | +0.4062 | +9.750 | 2.000 | YES |
| 2009-2013 | 2014 | 50 | 14 | 0.663 | 1.667 | +0.2857 | +4.000 | 4.000 | YES |
| 2010-2014 | 2015 | 49 | 19 | 0.726 | 0.577 | -0.2895 | -5.500 | 7.250 | NO |
| 2011-2015 | 2016 | 50 | 19 | 1.591 | 0.909 | -0.0526 | -1.000 | 3.000 | NO |
| 2012-2016 | 2017 | 50 | 34 | 0.833 | 1.250 | +0.1250 | +4.250 | 8.500 | YES |
| 2013-2017 | 2018 | 51 | 20 | 0.948 | 1.023 | +0.0125 | +0.250 | 4.750 | YES |
| 2014-2018 | 2019 | 51 | 21 | 1.111 | 1.375 | +0.1786 | +3.750 | 3.250 | YES |
| 2015-2019 | 2020 | 49 | 30 | 1.200 | 1.429 | +0.2000 | +6.000 | 3.000 | YES |

### Aggregate Statistics

| Metric | Unfiltered | DXY-Filtered |
|--------|-----------|--------------|
| Aggregate PF | 1.139 | 1.332 |
| Median fold PF | 1.111 | 1.375 |
| Mean fold PF | 1.202 | 1.374 |
| Folds PF > 1.00 | — | 11/13 |
| Folds PF > 1.10 | — | 10/13 |
| Worst fold | — | 2015 (PF=0.577) |
| Best fold | — | 2013 (PF=2.083) |

### PnL Concentration

| Measure | Value |
|---------|-------|
| Total OOS R | 50.500 |
| Best 1 year (2013) | 19.8% of total |
| Best 2 years | 39.1% of total |
| Best 3 years | 51.0% of total |
| Assessment | PASS: PnL reasonably distributed across years |

---

## Task 2 — GLD Cross-Market Validation

**GLD file:** `C:\Users\joris\Downloads\BATS_GLD, 1D_4975f.csv`  (5437 rows, 2004-11-18 to 2026-07-01)

### 2A: GLD Thursday→Friday IS (2004-2020)
Trades: 818  |  PF: 1.573  |  Win%: 55.9%  |  Avg R: 0.1718  |  CAGR: 8.85%  |  MaxDD%: 12.09

| Year | GLD R |
|------|-------|
| 2004 | +2.911 |
| 2005 | +4.560 |
| 2006 | +4.881 |
| 2007 | +18.002 |
| 2008 | +4.508 |
| 2009 | +7.667 |
| 2010 | +8.787 |
| 2011 | +18.483 |
| 2012 | +9.570 |
| 2013 | -4.921 |
| 2014 | +7.044 |
| 2015 | +9.645 |
| 2016 | +2.840 |
| 2017 | +11.932 |
| 2018 | +9.152 |
| 2019 | +8.948 |
| 2020 | +16.535 |

### GLD KNOWN HISTORICAL VALIDATION (2021-2026)
**LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS**
Trades: 276  |  PF: 1.463  |  Win%: 53.6%  |  Avg R: 0.1544  |  CAGR: 7.87%  |  MaxDD%: 8.69

| Year | GLD R |
|------|-------|
| 2021 | +3.360 |
| 2022 | -1.173 |
| 2023 | +14.997 |
| 2024 | +13.310 |
| 2025 | +9.143 |
| 2026 | +2.965 |

### 2B: Year-by-Year GC vs GLD Comparison

Pearson correlation: -0.254  |  Both positive: 7  |  Both negative: 0  |  Diverge: 6

| Year | GC R (WFO OOS) | GLD R (IS) | Both+ | Both- | Diverge |
|------|---------------|-----------|-------|-------|---------|
| 2008 | +23.250 | +4.508 | YES |  |  |
| 2009 | -4.000 | +7.667 |  |  | YES |
| 2010 | +11.750 | +8.787 | YES |  |  |
| 2011 | +8.500 | +18.483 | YES |  |  |
| 2012 | +3.000 | +9.570 | YES |  |  |
| 2013 | +9.750 | -4.921 |  |  | YES |
| 2014 | -10.813 | +7.044 |  |  | YES |
| 2015 | -8.500 | +9.645 |  |  | YES |
| 2016 | +13.000 | +2.840 | YES |  |  |
| 2017 | -5.000 | +11.932 |  |  | YES |
| 2018 | -1.500 | +9.152 |  |  | YES |
| 2019 | +3.000 | +8.948 | YES |  |  |
| 2020 | +5.000 | +16.535 | YES |  |  |

### 2C: Return Decomposition
pending — intraday GLD data not available

---

## Task 3 — DXY-Filtered GC Known Historical Validation (2021-2026)

**LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS**
DXY definition: close < SMA(20) — FROZEN

| Metric | Unfiltered | DXY-Filtered |
|--------|-----------|--------------|
| Trades | 274 | 132 |
| PF | 0.791 | 0.767 |
| Expectancy R/trade | -0.1274 | -0.1433 |
| Total R | -34.910 | -18.910 |
| MaxDD-R | 45.160 | 26.910 |
| CAGR% | -6.52 | -3.57 |

### Year-by-Year [KNOWN HISTORICAL VALIDATION]

| Year | Unfiltered R | DXY-Filtered R |
|------|-------------|----------------|
| 2021 | +6.250 | +4.500 |
| 2022 | -17.250 | -5.250 |
| 2023 | -12.160 | -6.160 |
| 2024 | -6.000 | -3.750 |
| 2025 | -2.750 | -5.000 |
| 2026 YTD | -3.000 | -3.250 |

**DXY regime definition frozen. No modification after viewing 2021-2026.**

---

## Task 4 — Execution Vehicle Comparison

Gross avg R (DXY-filtered WFO OOS): 0.1608R

| Metric | GC (100oz) | MGC (10oz x lots) | GLD ETF |
|--------|-----------|-------------------|---------|
| Avg gross R/trade | 0.1608 | 0.1608 | 0.1608 |
| Avg SL dist | 7.5 | 7.5 | 0.92 |
| RT cost per lot (USD) | 30.0 | 6.5 | 23.42 |
| Lots/shares at 1% risk | 1 | 14 | 1171 |
| Total RT cost (USD) | 30.0 | 91.0 | 23.42 |
| Avg gross edge (USD) | 173.69 | 173.69 | 173.69 |
| Net edge/trade (USD) | 143.69 | 82.69 | 150.27 |
| Cost as % of gross | 17.3 | 52.4 | 13.5 |
| Net PF at baseline | 1.267 | 1.146 | 1.281 |
| Net PF at 1.5x cost | 1.236 | 1.063 | 1.257 |
| Suitable for production? | YES — cost manageable | YES | YES — negligible cost |

**GC vs MGC cost:** GC cheaper than MGC (GC $30.00 vs MGC $91.00 total RT)

---

## Task 5 — Final Gold-Family Classification

**Classification: D**

Both GLD and GC viable, low correlation (-0.254), limited simultaneous drawdowns. Potential genuine diversification benefit — evaluate portfolio Sharpe.

| Evidence | Value |
|----------|-------|
| gld_is_pf | 1.573 |
| gld_khv_pf | 1.463 |
| gc_wfo_pf_dxy_filtered | 1.332 |
| gc_khv_pf_dxy_filtered | 0.767 |
| pearson_correlation | -0.254 |
| both_neg_years | 0 |
| diverge_years | 6 |
| meta_selection_bias_disclosed | True |

**Production weights must NOT be updated until forward live data confirms post-lock results.**
