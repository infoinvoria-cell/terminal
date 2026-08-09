# White Swan Dow TAT — Final Verification Patch
**Run date:** 2026-08-09T18:00:40.454441
**Frozen params:** ATR=14, SL=1.0x, TP=2.0R, Filter=neg_monday

---

## Section 1 — Data Provenance

| Field | Value |
|-------|-------|
| File | CBOT_MINI_DL_YM1!, 1D_ff3f0.csv |
| Source | TradingView CBOT_MINI_DL continuous contract, daily bars |
| Rows | 6102 |
| First bar | 2002-04-05 |
| Last bar | 2026-06-22 |
| Timezone | Exchange (Chicago, CT) |
| Duplicate rows | 0 |
| OHLC violations | 0 |
| Weekend bars | 0 |
| Missing Mondays | 119 |
| Missing Tuesdays | 11 |

**Day-of-week distribution:** {'Mon': 1145, 'Tue': 1253, 'Wed': 1251, 'Thu': 1227, 'Fri': 1226}

**OOS fold coverage:** Data starts 2002-04-05. WFO uses 5yr IS → 1yr OOS rolling annually. First IS: 2002-2006 (years 2002-2006 inclusive). First OOS: 2007. Last OOS in pre-2021 block: 2020 (IS 2015-2019). Total pre-2021 OOS folds: 14 (2007-2020).

---

## Section 2A — Pre-2021 WFO OOS (Pristine)

| OOS Year | IS Period | IS PF | OOS Trades | OOS PF | OOS R | Result |
|----------|-----------|-------|------------|--------|-------|--------|
| 2007 | 2002-2006 | 1.408 | 23 | 2.130 | 5.429 | + POSITIVE |
| 2008 | 2003-2007 | 1.617 | 31 | 1.519 | 3.878 | + POSITIVE |
| 2009 | 2004-2008 | 1.523 | 19 | 0.678 | -1.900 | - NEGATIVE |
| 2010 | 2005-2009 | 1.251 | 19 | 0.695 | -1.804 | - NEGATIVE |
| 2011 | 2006-2010 | 1.160 | 24 | 0.792 | -1.765 | - NEGATIVE |
| 2012 | 2007-2011 | 1.099 | 24 | 0.745 | -1.542 | - NEGATIVE |
| 2013 | 2008-2012 | 0.935 | 18 | 1.270 | 1.253 | + POSITIVE |
| 2014 | 2009-2013 | 0.816 | 26 | 1.071 | 0.556 | + POSITIVE |
| 2015 | 2010-2014 | 0.900 | 23 | 1.339 | 1.664 | + POSITIVE |
| 2016 | 2011-2015 | 0.996 | 22 | 1.849 | 3.686 | + POSITIVE |
| 2017 | 2012-2016 | 1.202 | 19 | 1.041 | 0.200 | + POSITIVE |
| 2018 | 2013-2017 | 1.295 | 22 | 1.055 | 0.389 | + POSITIVE |
| 2019 | 2014-2018 | 1.176 | 19 | 2.256 | 3.500 | + POSITIVE |
| 2020 | 2015-2019 | 1.461 | 18 | 2.104 | 3.558 | + POSITIVE |

### Aggregate Pre-2021 WFO OOS
| Metric | Value |
|--------|-------|
| Folds | 14 |
| Trades | 307 |
| PF | 1.2181 |
| Expectancy R/trade | 0.0557 |
| Positive folds | 10/14 |
| Total R | 17.1011 |
| MaxDD R | -8.5283 |
| Calmar-R | 0.1432 |
| CAGR (1% risk, $100k) | 1.18% |
| MaxDD% | -8.32% |
| Calmar (equity) | 0.142 |

---

## Section 2B — Known Historical Validation 2021-2025

**LABEL: KNOWN HISTORICAL VALIDATION — NOT PRISTINE OOS**

| Year | Trades | PF | R Total |
|------|--------|----|---------|
| 2021 | 23 | 1.406 | 1.749 |
| 2022 | 25 | 1.646 | 2.402 |
| 2023 | 15 | 0.817 | -0.813 |
| 2024 | 26 | 1.673 | 3.050 |
| 2025 | 18 | 0.456 | -3.098 |
| 2026 | 4 | 17.267 | 1.062 |

| KHV Metric | Value |
|-----------|-------|
| Trades | 111 |
| PF | 1.1913 |
| Expectancy R | 0.0392 |
| Win rate | 50.5% |
| Total R | 4.3526 |
| CAGR | 0.70% |
| MaxDD% | -3.82% |
| Calmar | 0.183 |

---

## Section 3 — neg_monday Filter Audit

| Version | Trades | PF | Exp R | Pos Folds/14 | Total R | MaxDD R | Calmar-R |
|---------|--------|----|-------|--------------|---------|---------|---------|
| Unfiltered | 659 | 1.1128 | 0.0267 | 9 | 17.5783 | -13.3138 | 0.0943 |
| neg_monday | 307 | 1.2181 | 0.0557 | 10 | 17.1011 | -8.5283 | 0.1432 |

**neg_monday filter improves PRE-2021 WFO OOS PF by 9.5%**

**Provenance:** UNFILTERED strategy has 879 IS+OOS trades vs 411 with neg_monday. The 873 IS trades cited in ws-strategy-data.ts is consistent with the unfiltered version (all Monday entries 2002-2018). neg_monday appears to have been added after initial specification, raising meta-selection bias risk if 2021+ data was visible. FLAGGED: neg_monday provenance uncertain — filter should be validated on pre-2021 OOS only.

---

## Section 4 — Parameter Plateau (IS 2002-2018, 120 combos)

| Metric | With neg_monday | Without filter |
|--------|----------------|----------------|
| Min PF | 1.0468 | 0.9598 |
| P10 PF | 1.1116 | 0.9849 |
| Median PF | 1.1657 | 1.0231 |
| Max PF | 1.5064 | 1.3619 |
| Count PF>1.0 (%) | 120 (100.0%) | 84 (70.0%) |
| Count PF>1.10 (%) | 108 (90.0%) | 16 (13.3%) |
| Count PF>1.20 (%) | 33 (27.5%) | 12 (10.0%) |

---

## Section 5 — Roll Audit

| Set | Trades | PF | Expectancy R | Total R |
|-----|--------|----|-------------|---------|
| Base (all trades) | 522 | 1.2480 | 0.0588 | 30.7027 |
| Non-roll all | 441 | 1.2589 | 0.0607 | 26.7848 |
| Non-roll pre-2021 WFO | 260 | 1.2844 | 0.0708 | 18.3981 |

Roll PF=1.1925 vs Non-Roll PF=1.2589; diff=acceptable

---

## Section 6 — Cost Reconciliation

Average ATR (pre-2021 WFO OOS entry bars): **243.00 points**
Gross expectancy (pre-2021 WFO OOS): **0.0557 R/trade**

### YM (E-mini Dow, $5/pt)
| Item | Value |
|------|-------|
| 1R in USD | $1215 |
| RT cost | $14.10 |
| Cost in R | 0.0116R |
| Net expectancy | 0.0441R |
| Cost % of gross | 20.8% |
| Break-even max RT | $67.68 |

Stress test: {'1x': np.float64(0.0441), '1.25x': np.float64(0.0412), '1.5x': np.float64(0.0383), '2.0x': np.float64(0.0325)}

### MYM (Micro E-mini Dow, $0.50/pt)
| Item | Value |
|------|-------|
| 1R in USD | $121.50 |
| RT cost | $2.20 |
| Cost in R | 0.0181R |
| Net expectancy | 0.0376R |
| Cost % of gross | 32.5% |

---

## Section 7 — GLD + DOW Portfolio (Pre-2021 WFO OOS)

**Overlap period:** 2009-2020 (12 years)
**Return correlation (Pearson):** -0.1896
**Simultaneous losing years:** 0

| Year | YM R | YM Ret% | GLD Ret% |
|------|------|---------|---------|
| 2009 | -1.900 | -1.90% | 8.20% |
| 2010 | -1.804 | -1.80% | 8.47% |
| 2011 | -1.765 | -1.77% | 20.03% |
| 2012 | -1.542 | -1.54% | 10.30% |
| 2013 | 1.253 | 1.25% | -4.98% |
| 2014 | 0.556 | 0.56% | 8.23% |
| 2015 | 1.664 | 1.66% | 9.86% |
| 2016 | 3.686 | 3.69% | 3.25% |
| 2017 | 0.200 | 0.20% | 11.12% |
| 2018 | 0.389 | 0.39% | 10.07% |
| 2019 | 3.500 | 3.50% | 9.65% |
| 2020 | 3.558 | 3.56% | 16.84% |

### Standalone
| Strategy | CAGR | MaxDD | Calmar |
|----------|------|-------|--------|
| YM TAT | 0.63% | -6.83% | 0.092 |
| GLD Thu | 9.09% | -4.98% | 1.825 |

### Portfolio Splits (GLD weight / YM weight)
| Split | CAGR | MaxDD | Calmar | Sharpe |
|-------|------|-------|--------|--------|
| 70/30 | 6.59% | -3.11% | 2.119 | 1.568 |
| 60/40 | 5.75% | -2.49% | 2.309 | 1.593 |
| 50/50 | 4.91% | -1.86% | 2.640 | 1.610 |
| 40/60 | 4.06% | -1.24% | 3.274 | 1.596 |
| 30/70 | 3.21% | -0.62% | 5.177 | 1.500 |

**Assessment:** The 50/50 split falls within the robust allocation plateau (40/60 to 60/40 show similar Calmar). If current 9%+9% equal-weight allocation refers to portfolio risk fraction, 50/50 split is confirmed robust.

---

## Section 8 — Final Verdict

## KEEP — strategy confirmed, allocation pending provenance review

| Gate | Name | Value | Target | Status | Note |
|------|------|-------|--------|--------|------|
| 1 | Pre-2021 WFO expectancy > 0 | 0.0557 | >0 | **PASS** |  |
| 2 | Pre-2021 WFO PF > 1.05 | 1.2181 | >1.05 | **PASS** |  |
| 3 | Pre-2021 positive fold ratio >= 50% | 10/14 | >=7/14 | **PASS** |  |
| 4 | IS plateau >= 60% combos PF>1 (with filter) | 100.0 | >=60% | **PASS** |  |
| 5 | YM costs preserve positive expectancy | 0.0441 | >0 | **PASS** |  |
| 6 | Roll audit non-roll PF > 1.0 | 1.2844 | >1.0 | **PASS** |  |
| 7 | KHV 2021-2025 PF > 0.90 | 1.1913 | >0.90 | **PASS** | NOT PRISTINE OOS |
| 8 | neg_monday filter provenance | uncertain | clear pre-spec | **FAIL** | FLAGGED — filter may have been added after seeing results |

**Passes: 7/8**

**Allocation recommendation:** Maintain current allocation (YM TAT + GLD Thursday Long, ~equal weight). Monitor neg_monday filter — if provenance cannot be confirmed pre-spec, apply penalty factor or revert to unfiltered. Revisit if pre-2021 WFO OOS net expectancy degrades below 0.05R/trade after cost.
