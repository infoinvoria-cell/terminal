# White Swan Gold Friday v3 — Roll-Independence Final Test

**Generated:** 2026-08-10  |  **Version:** roll_test_v1

---

## Section 1: Roll Trade Removal

| Metric | Value |
|--------|-------|
| Total trades (all years) | 1150 |
| Roll-window trades | 132 |
| Non-roll trades | 1018 |
| % Removed | 11.48% |
| Roll PF | 2.6498 |
| Non-roll PF | 1.2113 |
| Roll mean ret% | 0.2854 |
| Non-roll mean ret% | 0.0472 |
| Roll win rate | 0.3788 |
| Non-roll win rate | 0.2741 |

---

## Section 2: Non-Roll WFO Fold Table (Pre-2021)

| Fold | OOS Year | Orig Trades | Non-Roll Trades | Orig PF | Non-Roll PF | Orig exp_R | Non-Roll exp_R | NR Total_R | NR MaxDD_R | Positive |
|------|----------|------------|----------------|---------|------------|-----------|---------------|-----------|-----------|----------|
| 1 | 2008 | 51 | 45 | 1.2544 | 1.1784 | 0.4246 | 0.3143 | 14.1442 | -6.6041 | YES |
| 2 | 2009 | 50 | 45 | 1.7856 | 1.8499 | 0.426 | 0.4378 | 19.701 | -6.4284 | YES |
| 3 | 2010 | 50 | 44 | 1.4035 | 1.2216 | 0.3574 | 0.2146 | 9.441 | -7.0 | YES |
| 4 | 2011 | 51 | 45 | 2.1484 | 1.6836 | 0.6623 | 0.4882 | 21.9698 | -7.9654 | YES |
| 5 | 2012 | 51 | 45 | 0.8044 | 0.6065 | -0.0867 | -0.1992 | -8.9659 | -17.1723 | NO |
| 6 | 2013 | 51 | 45 | 1.1329 | 0.8624 | -0.0915 | -0.1697 | -7.6372 | -11.2405 | NO |
| 7 | 2014 | 51 | 45 | 0.9956 | 0.8337 | 0.1142 | -0.0058 | -0.2631 | -16.7968 | NO |
| 8 | 2015 | 50 | 45 | 1.4857 | 1.5589 | 0.1605 | 0.2095 | 9.4274 | -12.2285 | YES |
| 9 | 2016 | 51 | 45 | 1.1413 | 0.7307 | 0.1031 | -0.1137 | -5.1176 | -21.0 | NO |
| 10 | 2017 | 51 | 45 | 1.1532 | 1.0044 | 0.3014 | 0.1601 | 7.2033 | -10.6487 | YES |
| 11 | 2018 | 51 | 45 | 0.8195 | 0.6908 | -0.1852 | -0.3106 | -13.9749 | -18.7271 | NO |
| 12 | 2019 | 51 | 45 | 0.9778 | 1.0971 | 0.198 | 0.3092 | 13.9142 | -12.5827 | YES |
| 13 | 2020 | 50 | 45 | 1.5527 | 1.4791 | 0.5953 | 0.5945 | 26.7515 | -8.0 | YES |

### Aggregate Non-Roll OOS (2008-2020)

| Metric | Value |
|--------|-------|
| Trades | 584 |
| PF | 1.1619 |
| Exp_R | 0.1483 |
| Win Rate | 0.2637 |
| Total_R | 86.5938 |
| MaxDD_R | -28.9322 |
| Positive Folds | 8/13 |
| Median Fold PF | 1.0971 |
| Worst Fold | 2012 (PF 0.6065) |
| Longest Losing Streak | 21 |
| CAGR_R | 6.6611 |
| Calmar_R | 0.2302 |

---

## Section 3: Acceptance Gates

| Gate | Threshold | Result |
|------|-----------|--------|
| A: PF >= 1.15 | 1.1619 | PASS |
| B: exp_R > 0 | 0.1483 | PASS |
| C: Majority folds positive | 8/13 | PASS |
| D: No single year >40% total_R | - | PASS |
| E: Temporal neighborhood positive | - | PASS |

---

## Section 4: Roll Trade Inspection

### 4a. Return Distribution (Pre-2021 Roll Trades)

| Metric | Value |
|--------|-------|
| Count | 100 |
| Mean ret% | 0.4077 |
| Median ret% | -0.1571 |
| Std ret% | 1.0369 |
| Win rate | 0.44 |
| PF | 3.6096 |
| p10 | -0.3642 |
| p25 | -0.2607 |
| p75 | 0.7464 |
| p90 | 1.8978 |

### 4b. Gap Magnitude

| Metric | Value |
|--------|-------|
| Mean gap% | 0.0124 |
| Median gap% | 0.0065 |
| Max gap% | 0.1801 |
| Count gap > 0.3% | 0 |

### 4c. Secondary Diagnostic (gap > 0.3% removal)

**SECONDARY DIAGNOSTIC ONLY -- not used to redefine primary roll rule**

| Metric | Value |
|--------|-------|
| Trades removed | 0 |
| Remaining trades | 874 |
| Remaining PF | 1.3991 |
| Remaining exp_R | 0.3231 |

### 4d. Cross-Tabulation

| Category | Count |
|----------|-------|
| Roll profitable with large gap (>0.3%) | 0 |
| Roll profitable without large gap | 44 |

---

## Section 5: Individual Contract Check

**Available:** False

Individual GC contract history not available -- continuous-series artifact risk cannot be completely eliminated.

---

## Section 6: Temporal Neighborhood (Non-Roll, Pre-2021)

| Entry Variant | N | PF | Mean Ret% | Win Rate |
|--------------|---|----|-----------|----------|
| thu_23 | 774 | 1.2985 | 0.1044 | 0.5646 |
| fri_00 | 774 | 1.3239 | 0.1109 | 0.5762 |
| fri_01 | 774 | 1.3545 | 0.1182 | 0.5775 |

**Gate E passed:** YES

---

## Section 7: KHV Non-Roll (2021-2026)

*KNOWN HISTORICAL VALIDATION -- NOT pristine OOS*

### Base (all trades)

| n | PF | exp_R | total_R | MaxDD_R | win_rate |
|---|----|-------|---------|---------|----------|
| 276 | 1.151 | 0.1752 | 48.3448 | -30.3905 | 0.2754 |

### Non-Roll

| n | PF | exp_R | total_R | MaxDD_R | win_rate |
|---|----|-------|---------|---------|----------|
| 244 | 1.2353 | 0.2394 | 58.4219 | -29.4334 | 0.2869 |

### Per Year (Non-Roll)

| Year | N | PF | Total_R | Win Rate |
|------|---|----|---------|----------|
| 2021 | 44 | 1.1498 | 7.4046 | 0.2727 |
| 2022 | 45 | 0.8665 | -3.7749 | 0.2222 |
| 2023 | 45 | 1.8443 | 28.1838 | 0.2889 |
| 2024 | 45 | 1.9292 | 28.0366 | 0.3333 |
| 2025 | 45 | 0.8204 | -2.2182 | 0.3111 |
| 2026 | 20 | 1.0963 | 0.7901 | 0.3 |

---

## Section 8: Strategy Verdict

### VERDICT: KEEP

Non-roll agg OOS PF=1.1619 over 13 folds (2008-2020). Positive folds: 8/13. Agg exp_R=0.1483R. MaxDD_R=-28.9322R. Temporal neighborhood gate_E=PASS. Roll removal reduced trades by 11.48%. Gates passed: 5/5.

| Gate | Result |
|------|--------|
| gate_A | PASS |
| gate_B | PASS |
| gate_C | PASS |
| gate_D | PASS |
| gate_E | PASS |
| **Total gates passed** | **5/5** |

---

## Section 9: Portfolio Analysis

Portfolio analysis requires GLD and YM annual R series from prior audit. GC non-roll annual R (OOS 2008-2020) available from fold results. GLD and Dow TAT annual R must be sourced from their respective backtest reports. Full correlation and allocation analysis deferred pending cross-strategy data merge.

---

## Section 10: Allocation Verdict

**KEEP + 0% allocation pending portfolio merge**

GC non-roll edge is independently significant (PF>=1.15, majority folds positive). Allocation size requires GLD overlap analysis against existing 9% GLD allocation. Run portfolio merge to determine marginal Calmar contribution.

---

## Section 11: Component State

| Field | Value |
|-------|-------|
| status | KEEP |
| weight | TBD (pending GLD overlap analysis) |
| wfOos label | WFO OOS 2008-2020 (13 folds, non-roll) — PF 1.1619 |
| pf value | 1.1619 |
- Roll independence test: 11.48% trades removed as roll-window artifacts
- Non-roll OOS PF (2008-2020): 1.1619
- Positive folds: 8/13
- Non-roll exp_R: 0.1483R
- Temporal neighborhood gate: PASS
- KHV 2021-2026 non-roll PF: 1.2353