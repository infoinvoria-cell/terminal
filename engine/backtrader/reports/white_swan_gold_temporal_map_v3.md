# White Swan Gold Friday Research v3
**Generated:** 2026-08-09 | **Data:** GC1! 60m 2003-2026 (133,622 bars) | **Engine:** pure pandas/numpy vectorized

## Classification
### Grade: **A** — KEEP — add to White Swan with full allocation

| Gate | Result |
|------|--------|
| signal_t_stat_gt_15 | PASS |
| era_3_of_4_positive | PASS |
| plateau_70pct_pf_gt_1 | PASS |
| wfo_pos_folds_majority | PASS |
| wfo_agg_pf_gt_1 | PASS |
| cost_gate_2x_stress_pass | PASS |

## Best Candidate
- **Entry:** entry_fri_00utc (UTC)
- **Exit:** fri_close
- **Signal mean return (2003-2020):** 0.1547%
- **Win rate:** 58.92%
- **t-stat:** 3.98
- **Positive eras:** 4/4

## Parameter Plateau (IS 2003-2018)
- Combos tested: 15
- PF>1: 100%
- Median PF: 1.512
- Min/Max PF: 1.430 / 1.623

## WFO Fold Table (pre-2021, 5yr IS / 1yr OOS)
| OOS Year | IS Period | IS n | IS PF | OOS n | OOS PF | OOS exp |
|----------|-----------|------|-------|-------|--------|---------|
| 2008 | 2003-2007 | 215 | 1.663 | 51 | 1.399 | 0.2151R |
| 2009 | 2004-2008 | 247 | 1.621 | 50 | 1.644 | 0.2258R |
| 2010 | 2005-2009 | 250 | 1.607 | 50 | 1.798 | 0.2147R |
| 2011 | 2006-2010 | 253 | 1.630 | 51 | 2.309 | 0.3673R |
| 2012 | 2007-2011 | 253 | 1.821 | 51 | 1.744 | 0.2072R |
| 2013 | 2008-2012 | 253 | 1.716 | 51 | 0.747 | -0.1338R |
| 2014 | 2009-2013 | 253 | 1.514 | 51 | 1.666 | 0.1696R |
| 2015 | 2010-2014 | 254 | 1.511 | 50 | 1.361 | 0.1116R |
| 2016 | 2011-2015 | 254 | 1.437 | 51 | 1.198 | 0.0694R |
| 2017 | 2012-2016 | 254 | 1.246 | 51 | 2.142 | 0.1856R |
| 2018 | 2013-2017 | 254 | 1.250 | 51 | 1.069 | 0.0153R |
| 2019 | 2014-2018 | 254 | 1.426 | 51 | 1.043 | 0.0114R |
| 2020 | 2015-2019 | 254 | 1.300 | 50 | 1.194 | 0.0736R |

**Aggregate OOS:** 12/13 positive | PF 1.413 | mean_ret 0.1332% | n=659
**KHV 2021-2025 (NOT PRISTINE OOS):** n=254 PF=1.123 mean_ret=0.0449%

## Cost Model
| Instrument | Avg ATR | Notional | RT Cost | Cost % | Net Exp % | 2x Stress % | Gate |
|-----------|---------|----------|---------|--------|-----------|-------------|------|
| GC (100oz) | 3.5pt | $112294 | $4.72 | 0.0042% | 0.1290% | 0.1248% | PASS |
| MGC (10oz)  | 3.5pt | $11229 | $1.10 | 0.0098% | 0.1234% | 0.1136% | PASS |

## Regime Research (SMA200 on 60m, exploratory — meta-selection bias applies)
| Regime | n | Mean ret | Win rate | PF |
|--------|---|----------|----------|----|
| Uptrend (close ≥ SMA200) | 472 | 0.1769% | 58.90% | 1.587 |
| Downtrend (close < SMA200) | 401 | 0.1350% | 59.10% | 1.389 |

## Multiple-Testing Control
- Cells tested in heatmap: 160
- Candidates after era screening: 20
- Bonferroni threshold: p < 0.0003
- Best candidate raw p=0.0001, Bonf-adj p=0.0120, survives=True

## Heatmap Summary (top cells by mean return, selection universe 2003-2020)
| Entry | Exit | n | Mean% | WR | t-stat | +Eras |
|-------|------|---|-------|----|--------|-------|
| entry_fri_00utc | fri_close | 874 | 0.1547% | 58.92% | 3.98 | 4/4 |
| entry_thu_20utc | mon_reopen | 843 | 0.2048% | 59.67% | 4.96 | 4/4 |
| entry_thu_18utc | mon_reopen | 830 | 0.2038% | 58.80% | 4.90 | 4/4 |
| entry_fri_00utc | mon_reopen | 860 | 0.2007% | 59.07% | 4.86 | 4/4 |
| entry_thu_16utc | mon_reopen | 858 | 0.1910% | 58.97% | 4.44 | 4/4 |
| entry_thu_12utc | mon_reopen | 858 | 0.1809% | 56.41% | 3.66 | 4/4 |
| entry_thu_18utc | fri_close | 842 | 0.1547% | 57.72% | 3.96 | 4/4 |
| entry_fri_14utc | +8h | 875 | 0.1530% | 59.09% | 6.23 | 4/4 |
| entry_thu_20utc | fri_close | 855 | 0.1521% | 57.66% | 3.90 | 4/4 |
| entry_thu_14utc | fri_close | 870 | 0.1504% | 57.36% | 3.46 | 4/4 |
| entry_fri_00utc | fri_settlement | 874 | 0.1487% | 58.01% | 3.83 | 4/4 |
| entry_thu_14utc | mon_reopen | 858 | 0.1963% | 57.93% | 4.34 | 4/4 |
| entry_fri_02utc | mon_reopen | 861 | 0.1838% | 59.47% | 4.62 | 3/4 |
| entry_fri_04utc | mon_reopen | 861 | 0.1780% | 60.51% | 4.55 | 3/4 |
| entry_fri_08utc | mon_reopen | 860 | 0.1689% | 58.14% | 4.46 | 3/4 |

---
*White Swan Protocol — Close-fill semantics — No look-ahead — Selection universe 2003-2020 — WFO OOS is pristine holdout — KHV 2021-2025 is NOT pristine OOS*