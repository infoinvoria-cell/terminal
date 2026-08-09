
# White Swan Gold Family Research — v1
Generated: 2026-08-09 13:12 UTC
**IS Period:** 2003-07-30 through 2020-12-31
**Known Historical Validation:** 2021-01-01 through 2026-06-05 (NOT pristine holdout)
**Entry semantics:** close-fill (Friday last 60m bar UTC>=18)
**Exit semantics:** SL / TP / Monday close

---

## Phase 1 — Data Manifest
| File | Rows | Expected | Check | SHA256 |
|------|------|----------|-------|--------|
| COMEX_DL_GC1!, 60_5747f(1).csv | 18791 | 18791 | PASS | cb74a5810581d414... |
| COMEX_DL_GC1!, 60_646ce(1).csv | 23696 | 23696 | PASS | 6aac127490417801... |
| COMEX_DL_GC1!, 60_8f931(1).csv | 23637 | 23637 | PASS | 94551cc42fa73e7a... |
| COMEX_DL_GC1!, 60_ff910(1).csv | 23597 | 23597 | PASS | 382a1056c790c497... |
| COMEX_DL_GC1!, 60_279f5(1).csv | 23652 | 23652 | PASS | 1c45dbabd5d8c3bd... |
| COMEX_DL_GC1!, 60_cd78a.csv | 20249 | 20249 | PASS | 6715d565470d4ebd... |

Total 60m bars: **133622**  |  Range: 2003-07-30 00:00:00 → 2026-06-05 11:00:00
Duplicate timestamps removed: 0  |  Gaps > 1 week: 1

---

## Phase 2 — IS Parameter Plateau (2003-2020)
**Locked Parameters:** ATR=10, SL_mult=0.75, RR=1.25
IS PF at plateau center: **1.224**  | Neighborhood avg PF: 1.212
IS avg R: 0.1128  | Win%: 49.4%  | IS trades: 852
IS combos with PF > 1.0: **80/80 (100.0%)**

### IS PF Heatmap (RR=None, no TP)
| ATR\SL | 0.75 | 1.00 | 1.25 | 1.50 |
|--------|------|------|------|------|
| ATR 7 | 1.150 | 1.064 | 1.009 | 1.043 |
| ATR 10 | 1.148 | 1.065 | 1.015 | 1.035 |
| ATR 14 | 1.138 | 1.070 | 1.029 | 1.053 |
| ATR 20 | 1.151 | 1.048 | 1.022 | 1.022 |

### IS PF Heatmap (RR=1.5)
| ATR\SL | 0.75 | 1.00 | 1.25 | 1.50 |
|--------|------|------|------|------|
| ATR 7 | 1.288 | 1.138 | 1.027 | 1.021 |
| ATR 10 | 1.293 | 1.149 | 1.043 | 1.009 |
| ATR 14 | 1.291 | 1.160 | 1.049 | 1.031 |
| ATR 20 | 1.303 | 1.156 | 1.040 | 1.006 |

---

## Phase 3 — 30-Trade Reconciliation
| # | Entry UTC | Entry$ | ATR | Stop$ | TP$ | Exit UTC | Exit$ | Reason | Gross R | Net R |
|---|-----------|--------|-----|-------|-----|----------|-------|--------|---------|-------|
| 1 | 2003-08-01 20:00:00 | 347.8 | 1.939 | 346.35 | 349.62 | 2003-08-04 00:00:00 | 349.62 | TP | 1.25 | 1.0741 |
| 2 | 2004-01-09 18:00:00 | 426.8 | 1.891 | 425.38 | 428.57 | 2004-01-12 00:00:00 | 425.38 | SL | -1.0 | -1.1759 |
| 3 | 2005-01-28 21:00:00 | 428.9 | 1.061 | 428.1 | 429.89 | 2005-01-31 00:00:00 | 428.1 | SL | -1.0 | -1.1759 |
| 4 | 2006-01-06 21:00:00 | 541.2 | 2.501 | 539.32 | 543.54 | 2006-01-09 00:00:00 | 543.54 | TP | 1.25 | 1.0741 |
| 5 | 2007-01-05 21:00:00 | 608.5 | 3.852 | 605.61 | 612.11 | 2007-01-08 16:00:00 | 605.61 | SL | -1.0 | -1.1759 |
| 6 | 2008-01-04 21:00:00 | 862.6 | 3.952 | 859.64 | 866.3 | 2008-01-07 02:00:00 | 859.64 | SL | -1.0 | -1.1759 |
| 7 | 2009-01-02 21:00:00 | 876.0 | 4.337 | 872.75 | 880.07 | 2009-01-05 00:00:00 | 880.07 | TP | 1.25 | 1.0741 |
| 8 | 2010-01-08 21:00:00 | 1138.2 | 5.16 | 1134.33 | 1143.04 | 2010-01-11 00:00:00 | 1143.04 | TP | 1.25 | 1.0741 |
| 9 | 2011-01-07 21:00:00 | 1369.2 | 5.602 | 1365.0 | 1374.45 | 2011-01-10 01:00:00 | 1374.45 | TP | 1.25 | 1.0741 |
| 10 | 2012-01-06 21:00:00 | 1618.3 | 5.945 | 1613.84 | 1623.87 | 2012-01-09 00:00:00 | 1613.84 | SL | -1.0 | -1.1759 |
| 11 | 2013-01-04 21:00:00 | 1655.7 | 6.879 | 1650.54 | 1662.15 | 2013-01-07 02:00:00 | 1662.15 | TP | 1.25 | 1.0741 |
| 12 | 2014-01-03 21:00:00 | 1236.2 | 4.062 | 1233.15 | 1240.01 | 2014-01-06 00:00:00 | 1233.15 | SL | -1.0 | -1.1759 |
| 13 | 2015-01-02 21:00:00 | 1188.6 | 6.043 | 1184.07 | 1194.27 | 2015-01-05 00:00:00 | 1184.07 | SL | -1.0 | -1.1759 |
| 14 | 2016-01-08 21:00:00 | 1104.1 | 3.717 | 1101.31 | 1107.58 | 2016-01-11 00:00:00 | 1107.58 | TP | 1.25 | 1.0741 |
| 15 | 2017-01-06 21:00:00 | 1172.9 | 3.555 | 1170.23 | 1176.23 | 2017-01-09 01:00:00 | 1176.23 | TP | 1.25 | 1.0741 |
| 16 | 2018-01-05 21:00:00 | 1320.3 | 2.699 | 1318.28 | 1322.83 | 2018-01-08 01:00:00 | 1322.83 | TP | 1.25 | 1.0741 |
| 17 | 2019-01-04 21:00:00 | 1286.2 | 3.2 | 1283.8 | 1289.2 | 2019-01-07 01:00:00 | 1289.2 | TP | 1.25 | 1.0741 |
| 18 | 2020-01-03 21:00:00 | 1555.2 | 3.802 | 1552.35 | 1558.76 | 2020-01-06 00:00:00 | 1558.76 | TP | 1.25 | 1.0741 |

---

## Phase 4 — Walk-Forward Optimization

### 5yr IS / 1yr OOS Fold Table
| Fold IS | OOS Year | Flag | Params | IS PF | OOS Trades | OOS PF | Win% | Avg R | CAGR | MaxDD | Positive |
|---------|----------|------|--------|-------|------------|--------|------|-------|------|-------|----------|
| 2003-2007 | 2008 | short-IS | ATR7/SL0.75/RR1.5 | 1.817 | 51 | 2.143 | 58.8% | 0.4706 | 26.59 | 3.94 | YES |
| 2004-2008 | 2009 |  | ATR7/SL0.75/RR1.5 | 1.913 | 49 | 0.797 | 34.7% | -0.1327 | -6.64 | 14.12 | NO |
| 2005-2009 | 2010 |  | ATR10/SL0.75/RR1.5 | 1.675 | 49 | 1.585 | 51.0% | 0.2826 | 14.45 | 3.94 | YES |
| 2006-2010 | 2011 |  | ATR10/SL0.75/RR1.5 | 1.741 | 50 | 1.5 | 50.0% | 0.25 | 12.9 | 3.51 | YES |
| 2007-2011 | 2012 |  | ATR10/SL0.75/RR1.5 | 1.469 | 51 | 0.968 | 39.2% | -0.0196 | -1.37 | 10.53 | NO |
| 2008-2012 | 2013 |  | ATR14/SL0.75/RR1.0 | 1.447 | 51 | 1.125 | 52.9% | 0.0588 | 2.79 | 7.73 | YES |
| 2009-2013 | 2014 |  | ATR7/SL0.75/RR1.25 | 1.25 | 50 | 0.663 | 34.0% | -0.2163 | -10.55 | 18.64 | NO |
| 2010-2014 | 2015 |  | ATR20/SL0.75/RR1.5 | 1.199 | 49 | 0.871 | 36.7% | -0.0816 | -4.28 | 12.8 | NO |
| 2011-2015 | 2016 |  | ATR20/SL0.75/RRNone | 1.08 | 50 | 1.445 | 34.0% | 0.2854 | 14.17 | 8.94 | YES |
| 2012-2016 | 2017 |  | ATR20/SL0.75/RR1.5 | 1.122 | 50 | 1.0 | 40.0% | 0.0 | -0.37 | 10.13 | NO |
| 2013-2017 | 2018 |  | ATR20/SL0.75/RRNone | 1.118 | 51 | 0.701 | 15.7% | -0.252 | -12.88 | 20.83 | NO |
| 2014-2018 | 2019 |  | ATR10/SL0.75/RR1.5 | 1.02 | 51 | 1.05 | 41.2% | 0.0294 | 1.13 | 6.86 | YES |
| 2015-2019 | 2020 |  | ATR20/SL0.75/RR1.5 | 1.14 | 49 | 1.327 | 46.9% | 0.1735 | 8.46 | 6.38 | YES |

**WFO Aggregate (5yr IS):** PF=1.111  Expectancy=0.0652R  Win%=41.2%  Trades=651  CAGR=2.12%  MaxDD=29.3%  Calmar=0.072  PosFolds=7/13  MaxLoseStreak=19

### Yearly OOS Returns (5yr IS)
| Year | R-sum | Direction |
|------|-------|----------|
| 2008 | +24.000 | POS |
| 2009 | -6.500 | NEG |
| 2010 | +13.847 | POS |
| 2011 | +12.500 | POS |
| 2012 | -1.000 | NEG |
| 2013 | +3.000 | POS |
| 2014 | -10.815 | NEG |
| 2015 | -4.000 | NEG |
| 2016 | +14.268 | POS |
| 2017 | +0.000 | NEG |
| 2018 | -12.853 | NEG |
| 2019 | +1.500 | POS |
| 2020 | +8.500 | POS |

---

## Phase 5 — Continuous Futures Roll Audit
| Metric | Version A (all signals) | Version B (roll window excluded) |
|--------|------------------------|----------------------------------|
| IS signals | 852 | 740 |
| IS PF | 1.224 | 1.24 |
| IS Expectancy | 0.1128R | 0.1201R |
| WFO OOS PF | 1.111 | 1.127 |
| Pos folds | 7/13 | 9/13 |

**Conclusion:** EDGE SURVIVES ROLL EXCLUSION — anomaly appears genuine

---

## Phase 6 — GLD Cross-Market Analysis
GLD daily data not found. Cross-market decomposition pending.
GC OOS yearly returns (Phase 4): {2008: 24.0, 2009: -6.5, 2010: np.float64(13.847), 2011: 12.5, 2012: -1.0, 2013: 3.0, 2014: np.float64(-10.815), 2015: -4.0, 2016: np.float64(14.268), 2017: 0.0, 2018: np.float64(-12.853), 2019: 1.5, 2020: 8.5}

---

## Phase 7 — Cost Model
| Instrument | RT Cost | Net PF@1x | Net PF@1.25x | Net PF@2x | Verdict |
|------------|---------|-----------|-------------|-----------|--------|
| Normalized R (research baseline) | $0 | 1.111 | 1.111 | 1.111 | N/A (baseline) |
| MGC Micro Gold Futures | $7.0 | 0.96 | 0.926 | 0.832 | MARGINAL |
| GC Standard Gold Futures | $30.0 | 1.062 | 1.05 | 1.016 | NET POSITIVE |
| GLD ETF | $23.04 | 1.073 | 1.064 | 1.037 | NET POSITIVE |

Gross avg R (WFO OOS): 0.0652R  | Risk: 1% of EUR 100,000

---

## Phase 8 — Known 2021-2026 Historical Validation
**LABEL: KNOWN HISTORICAL VALIDATION — this period was seen in prior audits. NOT a pristine holdout.**
Locked params: ATR=10, SL_mult=0.75, RR=1.25
Period: 2021-01-01 → 2026-06-05
Trades: 274  |  PF: 0.791  |  Win%: 39.1%  |  Avg R: -0.1274  |  CAGR: -6.52%  |  MaxDD: 37.13%  |  Calmar: -0.176

### Yearly Returns [KNOWN HISTORICAL VALIDATION]
| Year | R-sum | Note |
|------|-------|------|
| 2021 | +6.250 |  |
| 2022 | -17.250 |  |
| 2023 | -12.160 |  |
| 2024 | -6.000 |  |
| 2025 | -2.750 |  |
| 2026 | -3.000 | YTD |

---

## Phase 9 — Regime Research
| Metric | Base GC | DXY Declining | US10Y Declining | Combined |
|--------|---------|--------------|----------------|----------|
| pf | 1.224 | 1.332 | 1.053 | 1.31 |
| trades | 852 | 314 | 353 | 170 |
| cagr | 5.35 | 3.8 | 0.62 | 1.91 |
| calmar | 0.211 | 0.303 | 0.024 | 0.22 |
| pos_folds | 852 trades | 11/13 | 6/13 | 9/13 |

---

## Phase 10 — Portfolio Analysis
GLD data not available. Full portfolio correlation analysis pending.

---

## Phase 11 — Acceptance Verdict
| Gate | Description | Result |
|------|-------------|--------|
| G1_wfo_expectancy_pos | WFO expectancy > 0R | PASS |
| G2_wfo_pf_material | WFO aggregate PF > 1.10 | PASS |
| G3_majority_folds_pos | Majority OOS folds positive | PASS |
| G4_plateau_confirmed | >=70% IS combos PF>1.0 | PASS |
| G5_roll_audit | Edge survives roll exclusion | PASS |
| G6_independent_proxy | Independent gold proxy confirms | FAIL |
| G7_costs_pos | MGC net PF > 1.0 after costs | FAIL |
| G8_khv_not_catastrophic | 2021-2026 not catastrophic | FAIL |

**Gates passed: 5/8**

## FINAL VERDICT: GC Gold Friday Long -> **WATCH**

**Portfolio recommendation:** GLD remains sole implementation. Needed for upgrade: GC OOS data confirmation, roll audit pass, and cost model positive.
