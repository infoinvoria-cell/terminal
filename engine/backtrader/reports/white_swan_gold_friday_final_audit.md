# White Swan Gold Friday v3 -- Final Lock Audit

**Generated:** 2026-08-09  
**Instrument:** GC1! 60-minute futures  
**Frozen Params:** ATR=14, SL_MULT=1.0  
**Entry:** Friday 00:00 UTC close  
**Exit:** Last Friday bar close (max hour_utc)

---
## Section 1: Data Provenance + Entry/Exit Definition

- Rows: 133,622
- Date range: 2003-07-30 00:00:00+00:00 to 2026-06-05 11:00:00+00:00
- OHLC violations: 0
- DoW distribution: {'Mon': 26395, 'Tue': 27096, 'Wed': 27128, 'Thu': 26907, 'Fri': 24312, 'Sun': 1784}
- Entry bars (Fri 00 UTC): 1150
- Friday weeks missing entry bar: 1

**Last-bar-hour distribution (exit hour UTC):**
| Hour UTC | Count |
|----------|-------|
| 11 | 1 |
| 16 | 5 |
| 17 | 19 |
| 18 | 37 |
| 19 | 21 |
| 20 | 697 |
| 21 | 371 |

**Entry definition:**
- Bar: weekday=4, hour_utc=0 (end-of-bar convention)
- Chicago CST: Thu 18:00-18:59 CT
- Chicago CDT: Thu 19:00-19:59 CT
- CET/CEST: 01:00-01:59 / 02:00-02:59

**Exit rule (production):** Last Friday bar (max hour_utc on same year_week Friday)

---
## Section 2: DST / Timezone Robustness

**Entry variant comparison (same canonical Friday-close exit):**
| Variant | n | Mean Ret% | Win% | T-stat | P-value | Signal PF |
|---------|---|-----------|------|--------|---------|-----------|
| A_thu_23 | 1150 | 0.117 | 56.61 | 3.3667 | 0.000786 | 1.3322 |
| B_fri_00_canonical | 1150 | 0.1278 | 57.83 | 3.6919 | 0.000233 | 1.3721 |
| C_fri_01 | 1150 | 0.1266 | 57.04 | 3.7861 | 0.000161 | 1.3769 |

**Canonical entry split by DST period:**
| Period | n | Mean Ret% | Win% | T-stat | P-value | PF |
|--------|---|-----------|------|--------|---------|-----|
| US_STANDARD | 377 | 0.1463 | 58.36 | 2.2006 | 0.02837 | 1.409 |
| US_DAYLIGHT | 727 | 0.127 | 58.05 | 3.0805 | 0.002145 | 1.3839 |
| TRANSITION | 46 | -0.0106 | 50.0 | -0.0626 | 0.950349 | 0.9752 |

---
## Section 3: Backtrader IS Plateau (2003-2018)

- Combos with PF > 1: **16/16**
- Plateau robust: True

| ATR | SL | n | PF | Win% | exp_R | median_R |
|-----|-----|---|-----|------|-------|----------|
| 7 | 0.75 | 773 | 1.3583 | 20.05 | 0.2853 | -1.0 |
| 7 | 1.0 | 773 | 1.3898 | 26.52 | 0.2832 | -1.0 |
| 7 | 1.25 | 773 | 1.4043 | 32.6 | 0.2655 | -1.0 |
| 7 | 1.5 | 773 | 1.3191 | 35.71 | 0.1958 | -1.0 |
| 10 | 0.75 | 773 | 1.3575 | 20.96 | 0.2814 | -1.0 |
| 10 | 1.0 | 773 | 1.45 | 28.2 | 0.3191 | -1.0 |
| 10 | 1.25 | 773 | 1.3854 | 33.25 | 0.2487 | -1.0 |
| 10 | 1.5 | 773 | 1.3123 | 36.61 | 0.1879 | -1.0 |
| 14 | 0.75 | 773 | 1.3626 | 21.09 | 0.2849 | -1.0 |
| 14 | 1.0 | 773 | 1.4459 | 28.72 | 0.3137 | -1.0 | (*)
| 14 | 1.25 | 773 | 1.3673 | 33.25 | 0.2365 | -1.0 |
| 14 | 1.5 | 773 | 1.313 | 37.0 | 0.1873 | -1.0 |
| 20 | 0.75 | 773 | 1.3489 | 21.09 | 0.2741 | -1.0 |
| 20 | 1.0 | 773 | 1.4111 | 28.46 | 0.2896 | -1.0 |
| 20 | 1.25 | 773 | 1.3375 | 32.99 | 0.2185 | -1.0 |
| 20 | 1.5 | 773 | 1.3116 | 37.26 | 0.1865 | -1.0 |

(*) = Canonical frozen params

---
## Section 4: Walk-Forward (5Y IS / 1Y OOS) -- 13 Folds

**Positive folds: 10/13**

| IS Period | OOS Year | OOS n | OOS PF | exp_R | Win% | total_R | Positive |
|-----------|----------|-------|--------|-------|------|---------|----------|
| 2003-2007 | 2008 | 51 | 1.5936 | 0.4246 | 27.45 | 21.6558 | YES |
| 2004-2008 | 2009 | 50 | 1.6596 | 0.426 | 30.0 | 21.3007 | YES |
| 2005-2009 | 2010 | 50 | 1.5255 | 0.3574 | 32.0 | 17.8681 | YES |
| 2006-2010 | 2011 | 51 | 2.0896 | 0.6623 | 39.22 | 33.7763 | YES |
| 2007-2011 | 2012 | 51 | 0.8894 | -0.0867 | 21.57 | -4.4234 | NO |
| 2008-2012 | 2013 | 51 | 0.8763 | -0.0915 | 25.49 | -4.6675 | NO |
| 2009-2013 | 2014 | 51 | 1.1524 | 0.1142 | 23.53 | 5.8263 | YES |
| 2010-2014 | 2015 | 50 | 1.2293 | 0.1605 | 30.0 | 8.0246 | YES |
| 2011-2015 | 2016 | 51 | 1.1282 | 0.1031 | 17.65 | 5.2586 | YES |
| 2012-2016 | 2017 | 51 | 1.4269 | 0.3014 | 29.41 | 15.3698 | YES |
| 2013-2017 | 2018 | 51 | 0.7579 | -0.1852 | 23.53 | -9.4435 | NO |
| 2014-2018 | 2019 | 51 | 1.2637 | 0.198 | 23.53 | 10.0994 | YES |
| 2015-2019 | 2020 | 50 | 1.9602 | 0.5953 | 38.0 | 29.7655 | YES |

**Aggregate OOS (2008-2020):**
- trades: 659
- pf: 1.32
- exp_R: 0.2282
- win_rate: 27.77
- payoff: 3.4189
- total_R: 150.4108
- MaxDD_R: -26.9862
- CAGR_R: 11.5701
- Calmar_R: 0.4287
- longest_losing_streak: 23

**7Y IS / 1Y OOS Sensitivity:** 8/11 positive, agg PF=1.2678, exp_R=0.1926

---
## Section 5: Known Historical Validation 2021-2026

**(KNOWN HISTORICAL VALIDATION -- NOT pristine OOS)**

- Trades: 276
- PF: 1.2478
- exp_R: 0.1752
- Win rate: 27.54%
- Total R: 48.3448
- CAGR_R: 8.0575
- MaxDD_R: -30.3905
- Calmar_R: 0.2651

| Year | n | PF | total_R | Win% |
|------|---|-----|---------|------|
| 2021 | 50 | 1.2858 | 9.7627 | 28.0 |
| 2022 | 51 | 0.8481 | -5.9567 | 21.57 |
| 2023 | 51 | 1.5956 | 22.1838 | 25.49 |
| 2024 | 51 | 1.7711 | 26.2176 | 33.33 |
| 2025 | 51 | 0.7683 | -8.2182 | 27.45 |
| 2026 | 22 | 1.2904 | 4.3556 | 31.82 |

---
## Section 6: Multiple Testing Audit

- Hypotheses tested: 160
- Bonferroni alpha: 0.0003125
- Canonical t-stat: 3.9015
- Canonical p-value: 0.000103
- Bonferroni-adjusted p: 0.016469 -> PASS

**Block Bootstrap (N=1000):**
- Actual signal PF: 1.4762
- Bootstrap mean PF: 1.4843
- Bootstrap p-value: 0.488 -> FAIL

---
## Section 7: Roll Audit

- Non-roll: n=584, PF=1.2039, exp_R=0.1483, Win%=26.37, total_R=86.5938
- Roll: n=75, PF=2.4031, exp_R=0.8509, Win%=38.67, total_R=63.8169
- **Artifact flag: True** (threshold: roll PF > non-roll PF x1.15)

**Top 4 price gaps:**
| Time | Gap% | Weekday | Hour UTC | Friday Session? |
|------|------|---------|---------|-----------------|
| 2026-01-29 15:00:00+00:00 | 5.654 | 3 | 15 | False |
| 2008-09-18 19:00:00+00:00 | 5.3344 | 3 | 19 | False |
| 2009-03-18 18:00:00+00:00 | 4.232 | 2 | 18 | False |
| 2008-09-17 14:00:00+00:00 | 3.7981 | 2 | 14 | False |

---
## Section 8: GLD Cross-Market Confirmation

- Overlap years: [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]
- Pearson r (GC vs GLD annual): 0.6458 (p=0.0233)
- Both positive: 9 years
- Both negative: 1 years
- Diverging: 2 years

| Year | GC total_R | GLD avg_r |
|------|------------|-----------|
| 2009 | 21.3007 | 0.1573 |
| 2010 | 17.8681 | 0.1602 |
| 2011 | 33.7763 | 0.355 |
| 2012 | -4.4234 | 0.1942 |
| 2013 | -4.6675 | -0.0968 |
| 2014 | 5.8263 | 0.1569 |
| 2015 | 8.0246 | 0.1876 |
| 2016 | 5.2586 | 0.069 |
| 2017 | 15.3698 | 0.2063 |
| 2018 | -9.4435 | 0.1892 |
| 2019 | 10.0994 | 0.1856 |
| 2020 | 29.7655 | 0.3067 |

*GLD exits Friday daily close. GC enters Friday 00:00 UTC and exits ~15:00 CT Friday. Different intraday windows despite common gold factor. Low correlation suggests GC adds diversification.*

---
## Section 9: Execution Economics

- Avg stop: 4.0398 pts
- Median stop: 3.5956 pts
- 25th/75th pctile: 2.7175 / 4.7742 pts
- Gross exp_R: 0.2282

**GC (100 oz contract):**
- multiplier: 100
- dollar_risk_per_contract: 403.98
- commission_rt: 4.0
- spread_cost: 10.0
- total_rt_cost: 14.0
- cost_in_R: 0.034655
- cost_pct_exp_R: 15.18
- break_even_cost_R: 0.228241
- pf_baseline_costs: 1.2622
- pf_1p5x_costs: 1.2347
- pf_2x_costs: 1.2081
- gate_pass: True

**MGC (10 oz mini contract):**
- multiplier: 10
- dollar_risk_per_contract: 40.4
- commission_rt: 1.5
- spread_cost: 1.0
- total_rt_cost: 2.5
- cost_in_R: 0.061884
- pf_baseline_costs: 1.2194
- pf_1p5x_costs: 1.1735
- pf_2x_costs: 1.1301
- gate_pass: True

---
## Section 10: Portfolio Allocation

- Common years: [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]
- GLD-GC correlation: r=0.6458
- GLD-YM correlation: r=-0.1358
- GC-YM correlation: r=-0.0883
- YM data source: patch_json

| Portfolio | GC Weight | CAGR_R | MaxDD_R | Calmar_R | Losing Years | Corr GLD |
|-----------|-----------|--------|---------|----------|--------------|----------|
| GLD_only | 0% | 0.1726 | -0.0968 | 1.7831 | 1 | 1.0 |
| GLD+YM | 0% | 0.1033 | -0.0136 | 7.5959 | 1 | 0.6749 |
| GLD+YM+GC_0pct | 0% | 0.1033 | -0.0136 | 7.5959 | 1 | 0.6749 |
| GLD+YM+GC_2pct | 2.0% | 0.3158 | -0.1314 | 2.4027 | 3 | 0.7222 |
| GLD+YM+GC_4pct | 4.0% | 0.5284 | -0.3143 | 1.6811 | 3 | 0.6894 |
| GLD+YM+GC_6pct | 6.0% | 0.7409 | -0.4971 | 1.4903 | 3 | 0.6757 |
| GLD+YM+GC_8pct | 8.0% | 0.9534 | -0.68 | 1.4021 | 3 | 0.6683 |

- Baseline Calmar (GLD+YM): 7.5959
- Marginal Calmar from GC: -5.1932
- Portfolio gate pass: **False**
- Approved GC weight: 2.0%

---
## Section 11: Forward Tracking Event File

- File written: `C:\Users\joris\Documents\Capitalife Terminal\public\generated\monitoring\strategies\COMEX_GC_friday_events.json`
- Schema mirrors ARCA_GLD_thursday_long_events.json
- liveStart: null (pending verdict)
- trackingType: PENDING_FINAL_AUDIT

---
## Section 12: Final Verdict

| Gate | Description | Result |
|------|-------------|--------|
| gate1_wfo_fold_count_valid | WFO fold count valid + majority positive (10/13) | PASS |
| gate2_dst_robust | DST robustness (edge in both standard and daylight) | PASS |
| gate3_backtrader_exp_R_positive | Backtrader exp_R positive (intrabar stops) | PASS |
| gate4_majority_wfo_folds_positive | Majority WFO folds positive | PASS |
| gate5_realistic_costs | Realistic costs preserve edge (GC) | PASS |
| gate6_roll_audit | Roll audit pass (no artifact) | FAIL |
| gate7_khv_plausible | KHV 2021-2026 plausible (PF>1) | PASS |
| gate8_multiple_testing | Multiple testing acceptable | PASS |
| gate9_portfolio_calmar | Portfolio Calmar improvement >= 5% | FAIL |

**Gates passed: 7/9**

## **VERDICT: WATCH**

- Approved GC allocation weight: 0%
- Frozen params: ATR=14, SL_MULT=1.0, entry=Fri 00:00 UTC, exit=last_friday_bar_close