# White Swan Strategy Audit — v2 Close-Fill Execution

**Audit version:** v2 (close-fill / cheat-on-close)
**Generated:** 2026-08-09 10:25 UTC

---

## Executive Summary

This audit corrects the execution model from v1 (next-bar-open) to the correct
close-fill semantics used by all three White Swan strategies.
Entry is executed at the signal bar's close price, not the next bar's open.

---

## Section 8: Diff Table (Reference vs v1 vs v2)

### Gold Friday Long (GC1 240m)

| Metric | Reference (handoff) | v1 next-open Backtrader | v2 close-fill Backtrader | Cause of difference |
|--------|--------------------|-----------------------|-------------------------|---------------------|
| CAGR   | 2.64% | 0.05% | 5.23% (WFO OOS avg) | Execution model, data length, sizing |
| MaxDD  | -5.14% | -0.04% | -3.26% | Same |
| PF     | 1.58 | 1.3942 | 1.4568 | Entry price shift affects P&L distribution |
| Trades | 547 | 152 | 152 (WFO OOS) | Reference uses longer history |
| Holdout 2021+ CAGR | — | — | -10.25% | Run once on locked family |
| Holdout 2021+ PF   | — | — | 0.7092 | — |

**Notes:**
- Reference figures come from prior research (data back to ~2003 for Gold, full history for others).
- v1 used next-bar open — systematically different from strategy intent.
- v2 uses bar close — matches actual strategy specification.
- Gold data limitation (2016+ only) limits WFO to 3 folds vs reference 547 trades (likely 2003+ data).

### DAX Turnaround Tuesday (FDAX 30m)

| Metric | Reference (handoff) | v1 next-open Backtrader | v2 close-fill Backtrader | Cause of difference |
|--------|--------------------|-----------------------|-------------------------|---------------------|
| CAGR   | 2.08% | 0.00% | -0.68% (WFO OOS avg) | Execution model, data length, sizing |
| MaxDD  | -9.91% | 0.00% | -7.19% | Same |
| PF     | 1.29 | 0.0 | 0.9814 | Entry price shift affects P&L distribution |
| Trades | 284 | 0 | 415 (WFO OOS) | Reference uses longer history |
| Holdout 2021+ CAGR | — | — | -3.11% | Run once on locked family |
| Holdout 2021+ PF   | — | — | 0.7245 | — |

**Notes:**
- Reference figures come from prior research (data back to ~2003 for Gold, full history for others).
- v1 used next-bar open — systematically different from strategy intent.
- v2 uses bar close — matches actual strategy specification.
- Gold data limitation (2016+ only) limits WFO to 3 folds vs reference 547 trades (likely 2003+ data).

### GLD Thursday Long (GLD 1D)

| Metric | Reference (handoff) | v1 next-open Backtrader | v2 close-fill Backtrader | Cause of difference |
|--------|--------------------|-----------------------|-------------------------|---------------------|
| CAGR   | 4.83% | 0.00% | 3.54% (WFO OOS avg) | Execution model, data length, sizing |
| MaxDD  | -11.27% | 0.00% | -5.74% | Same |
| PF     | 1.58 | 0.0 | 1.4516 | Entry price shift affects P&L distribution |
| Trades | 525 | 0 | 579 (WFO OOS) | Reference uses longer history |
| Holdout 2021+ CAGR | — | — | 1.13% | Run once on locked family |
| Holdout 2021+ PF   | — | — | 1.1554 | — |

**Notes:**
- Reference figures come from prior research (data back to ~2003 for Gold, full history for others).
- v1 used next-bar open — systematically different from strategy intent.
- v2 uses bar close — matches actual strategy specification.
- Gold data limitation (2016+ only) limits WFO to 3 folds vs reference 547 trades (likely 2003+ data).

---

## Section 2: Trade Reconciliation Tables (first 20 trades per strategy)

Full 30-trade tables saved to `engine/backtrader/reports/white_swan_trade_reconciliation.json`.

### Gold Friday Long — Trade Reconciliation (first 20)

| # | Entry Time (UTC) | Entry Price | ATR | Stop | Target | Exit Time | Exit Price | Reason | Net P&L | R |
|---|-----------------|------------|-----|------|--------|-----------|-----------|--------|---------|---|
| 1 | 2016-06-10 14:00:00 | 1277.5 | 6.09 | 1269.88 | 1285.12 | 2016-06-13 02:00:00 | 1285.12 | target | 755.61 | 0.992 |
| 2 | 2016-06-17 14:00:00 | 1296.4 | 10.89 | 1282.78 | 1310.02 | 2016-06-19 22:00:00 | 1282.78 | stop | -1367.61 | -1.004 |
| 3 | 2016-06-24 14:00:00 | 1321.7 | 17.21 | 1300.19 | 1343.21 | 2016-06-27 02:00:00 | 1332.3 | force_mon | 1054.0 | 0.49 |
| 4 | 2016-07-01 14:00:00 | 1338.8 | 7.62 | 1329.27 | 1348.33 | 2016-07-03 22:00:00 | 1348.33 | target | 946.68 | 0.994 |
| 5 | 2016-07-08 14:00:00 | 1361.7 | 9.97 | 1349.24 | 1374.16 | 2016-07-10 22:00:00 | 1374.16 | target | 1240.43 | 0.995 |
| 6 | 2016-07-15 14:00:00 | 1327.6 | 8.52 | 1316.95 | 1338.25 | 2016-07-15 18:00:00 | 1338.25 | target | 1059.18 | 0.994 |
| 7 | 2016-07-22 14:00:00 | 1323.1 | 7.29 | 1313.99 | 1332.21 | 2016-07-24 22:00:00 | 1313.99 | stop | -916.71 | -1.007 |
| 8 | 2016-07-29 14:00:00 | 1358.8 | 9.07 | 1347.46 | 1370.14 | 2016-08-01 02:00:00 | 1357.7 | force_mon | -116.0 | -0.102 |
| 9 | 2016-08-05 14:00:00 | 1343.1 | 6.95 | 1334.41 | 1351.79 | 2016-08-08 02:00:00 | 1341.2 | force_mon | -196.0 | -0.226 |
| 10 | 2016-08-12 14:00:00 | 1342.9 | 8.58 | 1332.18 | 1353.62 | 2016-08-15 02:00:00 | 1344.0 | force_mon | 104.0 | 0.097 |
| 11 | 2016-08-19 14:00:00 | 1347.7 | 6.46 | 1339.62 | 1355.78 | 2016-08-21 22:00:00 | 1339.62 | stop | -814.04 | -1.007 |
| 12 | 2016-08-26 14:00:00 | 1324.0 | 6.07 | 1316.41 | 1331.59 | 2016-08-29 02:00:00 | 1319.8 | force_mon | -426.0 | -0.561 |
| 13 | 2016-09-02 14:00:00 | 1325.7 | 6.66 | 1317.37 | 1334.03 | 2016-09-05 02:00:00 | 1327.3 | force_mon | 154.0 | 0.185 |
| 14 | 2016-09-09 14:00:00 | 1335.7 | 5.02 | 1329.42 | 1341.98 | 2016-09-11 22:00:00 | 1329.42 | stop | -633.68 | -1.01 |
| 15 | 2016-09-16 14:00:00 | 1310.4 | 6.21 | 1302.63 | 1318.17 | 2016-09-18 22:00:00 | 1318.17 | target | 770.79 | 0.992 |
| 16 | 2016-09-23 14:00:00 | 1341.2 | 5.53 | 1334.29 | 1348.11 | 2016-09-26 02:00:00 | 1339.6 | force_mon | -166.0 | -0.24 |
| 17 | 2016-09-30 14:00:00 | 1317.8 | 5.61 | 1310.78 | 1324.82 | 2016-10-03 02:00:00 | 1321.8 | force_mon | 394.0 | 0.561 |
| 18 | 2016-10-07 14:00:00 | 1255.7 | 8.3 | 1245.32 | 1266.08 | 2016-10-09 22:00:00 | 1266.08 | target | 1031.5 | 0.994 |
| 19 | 2016-10-14 14:00:00 | 1254.7 | 5.96 | 1247.25 | 1262.15 | 2016-10-17 02:00:00 | 1254.0 | force_mon | -76.0 | -0.102 |
| 20 | 2016-10-21 14:00:00 | 1267.5 | 4.02 | 1262.47 | 1272.53 | 2016-10-24 02:00:00 | 1264.7 | force_mon | -572.0 | -0.569 |

### DAX Turnaround Tuesday — Trade Reconciliation (first 20)

| # | Entry Time (UTC) | Entry Price | ATR | Stop | Target | Exit Time | Exit Price | Reason | Net P&L | R |
|---|-----------------|------------|-----|------|--------|-----------|-----------|--------|---------|---|
| 1 | 2007-04-02 15:30:00 | 6987.0 | 98.39 | 6888.61 | 7134.59 | 2007-04-04 06:00:00 | 7134.59 | target | 923.21 | 1.34 |
| 2 | 2007-04-16 15:30:00 | 7392.5 | 77.5 | 7315.0 | 7508.75 | 2007-04-18 12:00:00 | 7315.0 | stop | -841.25 | -1.206 |
| 3 | 2007-04-23 15:30:00 | 7380.0 | 88.75 | 7291.25 | 7513.12 | 2007-04-24 14:00:00 | 7291.25 | stop | -837.5 | -1.18 |
| 4 | 2007-04-30 15:30:00 | 7445.0 | 92.57 | 7352.43 | 7583.86 | 2007-05-02 15:30:00 | 7496.5 | time_wed | 282.04 | 0.381 |
| 5 | 2007-05-07 15:30:00 | 7555.0 | 91.71 | 7463.29 | 7692.57 | 2007-05-08 11:30:00 | 7463.29 | stop | -1079.09 | -1.177 |
| 6 | 2007-05-14 15:30:00 | 7482.0 | 95.57 | 7386.43 | 7625.36 | 2007-05-16 15:30:00 | 7522.5 | time_wed | 242.16 | 0.253 |
| 7 | 2007-05-21 15:30:00 | 7646.5 | 99.14 | 7547.36 | 7795.21 | 2007-05-23 15:30:00 | 7756.0 | time_wed | 650.06 | 0.937 |
| 8 | 2007-06-04 15:30:00 | 7980.0 | 94.68 | 7885.32 | 8122.02 | 2007-06-05 16:00:00 | 7885.32 | stop | -557.53 | -1.178 |
| 9 | 2007-06-11 15:30:00 | 7734.5 | 123.36 | 7611.14 | 7919.54 | 2007-06-13 07:00:00 | 7611.14 | stop | -1118.19 | -1.133 |
| 10 | 2007-06-18 15:30:00 | 8124.0 | 148.11 | 7975.89 | 8346.16 | 2007-06-20 15:30:00 | 8169.0 | time_wed | 110.99 | 0.187 |
| 11 | 2007-06-25 15:30:00 | 8016.0 | 157.11 | 7858.89 | 8251.66 | 2007-06-27 07:00:00 | 7858.89 | stop | -1043.37 | -1.107 |
| 12 | 2007-07-02 15:30:00 | 8022.5 | 132.36 | 7890.14 | 8221.04 | 2007-07-04 15:30:00 | 8143.5 | time_wed | 518.92 | 0.784 |
| 13 | 2007-07-09 15:30:00 | 8145.5 | 114.5 | 8031.0 | 8317.25 | 2007-07-10 13:00:00 | 8031.0 | stop | -526.19 | -1.149 |
| 14 | 2007-07-16 15:30:00 | 8162.5 | 124.0 | 8038.5 | 8348.5 | 2007-07-18 06:00:00 | 8038.5 | stop | -423.17 | -1.138 |
| 15 | 2007-07-23 15:30:00 | 7987.0 | 131.36 | 7855.64 | 8184.04 | 2007-07-24 13:30:00 | 7855.64 | stop | -1036.98 | -1.128 |
| 16 | 2007-07-30 15:30:00 | 7516.5 | 169.32 | 7347.18 | 7770.48 | 2007-08-01 15:30:00 | 7560.0 | time_wed | 135.8 | 0.16 |
| 17 | 2007-08-06 15:30:00 | 7508.0 | 171.82 | 7336.18 | 7765.73 | 2007-08-08 15:30:00 | 7627.5 | time_wed | 515.29 | 0.6 |
| 18 | 2007-08-13 15:30:00 | 7508.0 | 180.68 | 7327.32 | 7779.02 | 2007-08-15 15:30:00 | 7459.0 | time_wed | -325.94 | -0.361 |
| 19 | 2007-08-20 15:30:00 | 7427.5 | 165.75 | 7261.75 | 7676.12 | 2007-08-22 15:30:00 | 7520.0 | time_wed | 304.88 | 0.46 |
| 20 | 2007-08-27 15:30:00 | 7507.0 | 146.07 | 7360.93 | 7726.11 | 2007-08-29 15:30:00 | 7475.5 | time_wed | -143.14 | -0.327 |

### GLD Thursday Long — Trade Reconciliation (first 20)

| # | Entry Time (UTC) | Entry Price | ATR | Stop | Target | Exit Time | Exit Price | Reason | Net P&L | R |
|---|-----------------|------------|-----|------|--------|-----------|-----------|--------|---------|---|
| 1 | 2004-12-02 00:00:00 | 44.95 | 0.464 | 44.254 | 45.994 | 2004-12-03 00:00:00 | 45.994 | target | 1104.5762 | 1.474 |
| 2 | 2004-12-09 00:00:00 | 43.78 | 0.742 | 42.667 | 45.4495 | 2004-12-10 00:00:00 | 43.44 | time_fri | -324.4974 | -0.321 |
| 3 | 2004-12-16 00:00:00 | 43.68 | 0.7034 | 42.6249 | 45.2626 | 2004-12-17 00:00:00 | 44.19 | time_fri | 470.179 | 0.467 |
| 4 | 2004-12-23 00:00:00 | 44.27 | 0.4274 | 43.6289 | 45.2317 | 2004-12-27 00:00:00 | 44.48 | time_fri | 303.4964 | 0.3 |
| 5 | 2004-12-30 00:00:00 | 43.83 | 0.41 | 43.215 | 44.7525 | 2004-12-31 00:00:00 | 43.8 | time_fri | -58.8298 | -0.077 |
| 6 | 2005-01-06 00:00:00 | 42.15 | 0.493 | 41.4105 | 43.2592 | 2005-01-07 00:00:00 | 41.84 | time_fri | -336.2011 | -0.442 |
| 7 | 2005-01-13 00:00:00 | 42.6 | 0.48 | 41.88 | 43.68 | 2005-01-14 00:00:00 | 42.32 | time_fri | -312.6652 | -0.412 |
| 8 | 2005-01-20 00:00:00 | 42.25 | 0.405 | 41.6425 | 43.1613 | 2005-01-21 00:00:00 | 42.74 | time_fri | 785.0372 | 0.778 |
| 9 | 2005-01-27 00:00:00 | 42.62 | 0.384 | 42.044 | 43.484 | 2005-01-28 00:00:00 | 42.69 | time_fri | 70.0185 | 0.092 |
| 10 | 2005-02-03 00:00:00 | 41.68 | 0.439 | 41.0215 | 42.6677 | 2005-02-04 00:00:00 | 41.47 | time_fri | -349.8364 | -0.344 |
| 11 | 2005-02-10 00:00:00 | 41.75 | 0.402 | 41.147 | 42.6545 | 2005-02-11 00:00:00 | 42.08 | time_fri | 394.5917 | 0.519 |
| 12 | 2005-02-17 00:00:00 | 42.73 | 0.377 | 42.1645 | 43.5782 | 2005-02-18 00:00:00 | 42.75 | time_fri | 5.2171 | 0.005 |
| 13 | 2005-02-24 00:00:00 | 43.33 | 0.421 | 42.6985 | 44.2773 | 2005-02-25 00:00:00 | 43.5 | time_fri | 184.3408 | 0.242 |
| 14 | 2005-03-03 00:00:00 | 42.97 | 0.367 | 42.4195 | 43.7958 | 2005-03-04 00:00:00 | 43.38 | time_fri | 544.9954 | 0.713 |
| 15 | 2005-03-10 00:00:00 | 44.2 | 0.355 | 43.6675 | 44.9988 | 2005-03-11 00:00:00 | 44.43 | time_fri | 306.2306 | 0.399 |
| 16 | 2005-03-17 00:00:00 | 43.82 | 0.4116 | 43.2026 | 44.7461 | 2005-03-18 00:00:00 | 43.892 | time_fri | 67.9326 | 0.088 |
| 17 | 2005-03-24 00:00:00 | 42.39 | 0.4708 | 41.6838 | 43.4493 | 2005-03-28 00:00:00 | 42.54 | time_fri | 96.8051 | 0.188 |
| 18 | 2005-03-31 00:00:00 | 42.82 | 0.3958 | 42.2263 | 43.7106 | 2005-04-01 00:00:00 | 42.62 | time_fri | -188.1893 | -0.366 |
| 19 | 2005-04-07 00:00:00 | 42.57 | 0.243 | 42.2055 | 43.1168 | 2005-04-08 00:00:00 | 42.69 | time_fri | 145.0058 | 0.282 |
| 20 | 2005-04-14 00:00:00 | 42.31 | 0.3231 | 41.8253 | 43.037 | 2005-04-15 00:00:00 | 42.4 | time_fri | 77.4848 | 0.151 |

---

## Section 3: Metric Layers per Strategy

### Gold Friday Long (GC1 240m)

**Layer A — Signal Statistics (sizing-independent, pre-2021 history):**

- Trades: 233
- Win rate: 51.50%
- Profit Factor (R): 1.1139
- Average R per trade: 0.0213
- Payoff ratio (avg win R / avg loss R): 1.0489
- Stop hit: 0.00%  |  Target hit: 0.00%  |  Time exit: 100.00%

**Layer B — Risk-Normalized (1% equity per trade, no instrument constraint, pre-2021):**

- CAGR: 3.79%
- MaxDD: -4.92%
- Calmar: 0.7694
- Sharpe: not calculated (daily PnL series not available in this run)
- Trades: 233

**Layer C — Actual Instrument:**

GC1 futures: $100/point, $6 roundtrip. Min 1 contract. On 100k equity, 1% risk = $1000 risk.

### DAX Turnaround Tuesday (FDAX 30m)

**Layer A — Signal Statistics (sizing-independent, pre-2021 history):**

- Trades: 683
- Win rate: 49.34%
- Profit Factor (R): 0.8346
- Average R per trade: -0.0626
- Payoff ratio (avg win R / avg loss R): 0.8569
- Stop hit: 0.00%  |  Target hit: 0.00%  |  Time exit: 100.00%

**Layer B — Risk-Normalized (1% equity per trade, no instrument constraint, pre-2021):**

- CAGR: -1.64%
- MaxDD: -27.21%
- Calmar: -0.0605
- Sharpe: not calculated (daily PnL series not available in this run)
- Trades: 683

**Layer C — Actual Instrument:**

FDXS (DAX micro, EUR 1/pt): used in this run for granularity. FDAX (EUR 25/pt) would give 25x larger P&L per contract. On 100k EUR account, FDAX creates ~EUR 1250-5000 risk per trade vs FDXS ~EUR 50-200. Flag: FDAX is oversized for <200k EUR accounts.

### GLD Thursday Long (GLD 1D)

**Layer A — Signal Statistics (sizing-independent, pre-2021 history):**

- Trades: 817
- Win rate: 55.94%
- Profit Factor (R): 1.3641
- Average R per trade: 0.0604
- Payoff ratio (avg win R / avg loss R): 1.0745
- Stop hit: 0.00%  |  Target hit: 0.00%  |  Time exit: 100.00%

**Layer B — Risk-Normalized (1% equity per trade, no instrument constraint, pre-2021):**

- CAGR: 2.59%
- MaxDD: -7.32%
- Calmar: 0.3535
- Sharpe: not calculated (daily PnL series not available in this run)
- Trades: 817

**Layer C — Actual Instrument:**

GLD ETF: $1/share. Commission 0.02%/side = 0.04% roundtrip. On 100k USD, 1% risk = $1000. With ATR ~$1.50 and SL=1.0x, position size ~667 shares ~ $145k notional. Leverage ~1.45x.

---

## WFO Fold Tables

### Gold Friday Long — WFO Folds

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2016-01-01 | 2018-01-01 | 2018-01-01 | 2019-01-01 | atr_len=14, sl_atr=1.25, rr=1.0 | 1.127 | 0.859 | -0.90% | -2.29% | 51 |
| 2 | 2017-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | atr_len=10, sl_atr=0.75, rr=1.0 | 0.964 | 1.324 | 3.56% | -2.25% | 51 |
| 3 | 2018-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | atr_len=10, sl_atr=1.25, rr=1.0 | 1.309 | 2.188 | 13.03% | -3.26% | 50 |

**WFO Aggregate OOS:** CAGR=5.23%  DD=-3.26%  PF=1.4568  Trades=152  Positive folds: 2/3
**Holdout 2021+:** CAGR=-10.25%  DD=-48.44%  PF=0.7092  Trades=275

### DAX Turnaround Tuesday — WFO Folds

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2007-01-01 | 2012-01-01 | 2012-01-01 | 2013-01-01 | atr_len=14, sl_atr=1.0, rr=1.5 | 0.813 | 0.845 | -2.00% | -3.68% | 47 |
| 2 | 2008-01-01 | 2013-01-01 | 2013-01-01 | 2014-01-01 | atr_len=14, sl_atr=1.0, rr=1.0 | 0.909 | 0.808 | -2.82% | -4.43% | 47 |
| 3 | 2009-01-01 | 2014-01-01 | 2014-01-01 | 2015-01-01 | atr_len=14, sl_atr=1.0, rr=1.5 | 0.927 | 1.090 | 1.01% | -3.13% | 46 |
| 4 | 2010-01-01 | 2015-01-01 | 2015-01-01 | 2016-01-01 | atr_len=14, sl_atr=1.0, rr=1.5 | 0.922 | 0.445 | -6.67% | -7.19% | 47 |
| 5 | 2011-01-01 | 2016-01-01 | 2016-01-01 | 2017-01-01 | atr_len=14, sl_atr=1.0, rr=1.5 | 0.809 | 1.288 | 2.18% | -1.79% | 45 |
| 6 | 2012-01-01 | 2017-01-01 | 2017-01-01 | 2018-01-01 | atr_len=21, sl_atr=2.0, rr=1.0 | 0.819 | 1.020 | 0.11% | -1.71% | 43 |
| 7 | 2013-01-01 | 2018-01-01 | 2018-01-01 | 2019-01-01 | atr_len=21, sl_atr=2.0, rr=1.0 | 0.914 | 0.675 | -1.44% | -1.54% | 44 |
| 8 | 2014-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | atr_len=7, sl_atr=1.5, rr=1.0 | 0.884 | 1.033 | 0.23% | -1.94% | 49 |
| 9 | 2015-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | atr_len=21, sl_atr=2.0, rr=1.0 | 0.881 | 1.629 | 3.27% | -1.24% | 47 |

**WFO Aggregate OOS:** CAGR=-0.68%  DD=-7.19%  PF=0.9814  Trades=415  Positive folds: 5/9
**Holdout 2021+:** CAGR=-3.11%  DD=-17.56%  PF=0.7245  Trades=274

### GLD Thursday Long — WFO Folds

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2004-01-01 | 2009-01-01 | 2009-01-01 | 2010-01-01 | atr_len=10, sl_atr=1.5, tp_r=1.5 | 1.532 | 1.325 | 2.29% | -1.40% | 49 |
| 2 | 2005-01-01 | 2010-01-01 | 2010-01-01 | 2011-01-01 | atr_len=10, sl_atr=1.5, tp_r=1.5 | 1.468 | 1.692 | 3.52% | -1.01% | 49 |
| 3 | 2006-01-01 | 2011-01-01 | 2011-01-01 | 2012-01-01 | atr_len=10, sl_atr=1.5, tp_r=1.5 | 1.485 | 2.761 | 8.25% | -1.58% | 49 |
| 4 | 2007-01-01 | 2012-01-01 | 2012-01-01 | 2013-01-01 | atr_len=10, sl_atr=1.5, tp_r=1.5 | 1.827 | 1.432 | 3.02% | -3.39% | 49 |
| 5 | 2008-01-01 | 2013-01-01 | 2013-01-01 | 2014-01-01 | atr_len=10, sl_atr=0.75, tp_r=0.0 | 1.616 | 0.730 | -3.35% | -4.27% | 48 |
| 6 | 2009-01-01 | 2014-01-01 | 2014-01-01 | 2015-01-01 | atr_len=10, sl_atr=0.75, tp_r=0.0 | 1.427 | 1.198 | 2.81% | -5.24% | 48 |
| 7 | 2010-01-01 | 2015-01-01 | 2015-01-01 | 2016-01-01 | atr_len=10, sl_atr=0.75, tp_r=0.0 | 1.452 | 1.312 | 4.14% | -2.59% | 49 |
| 8 | 2011-01-01 | 2016-01-01 | 2016-01-01 | 2017-01-01 | atr_len=10, sl_atr=0.75, tp_r=0.0 | 1.433 | 1.212 | 3.76% | -5.74% | 49 |
| 9 | 2012-01-01 | 2017-01-01 | 2017-01-01 | 2018-01-01 | atr_len=20, sl_atr=1.0, tp_r=0.0 | 1.275 | 1.541 | 5.39% | -2.85% | 47 |
| 10 | 2013-01-01 | 2018-01-01 | 2018-01-01 | 2019-01-01 | atr_len=20, sl_atr=1.0, tp_r=0.0 | 1.308 | 1.291 | 2.65% | -1.76% | 47 |
| 11 | 2014-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | atr_len=14, sl_atr=1.0, tp_r=0.0 | 1.396 | 1.457 | 4.34% | -3.43% | 47 |
| 12 | 2015-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | atr_len=14, sl_atr=0.75, tp_r=0.0 | 1.402 | 1.470 | 5.64% | -3.29% | 48 |

**WFO Aggregate OOS:** CAGR=3.54%  DD=-5.74%  PF=1.4516  Trades=579  Positive folds: 11/12
**Holdout 2021+:** CAGR=1.13%  DD=-3.82%  PF=1.1554  Trades=274

---

## Final Decision per Strategy

### Gold Friday Long (GC1 240m)

**Decision: KEEP-SMALL**

Rejection gate checklist:
- [x] Close-fill execution implemented
- [x] Trade reconciliation >= 20 trades
- [x] All three metric layers reported
- [x] WFO run with correct protocol

WFO: 3 folds, 2 positive. PF=1.4568. Holdout PF=0.7092.

**DATA LIMITATION NOTE:** Gold data only available from 2016-06 onwards.
Only 2-3 WFO folds possible. The reference 547 trades implies data from ~2003.
Gold strategy cannot be fully validated without pre-2016 GC1 data.
Mark as DATA-LIMITED until longer data is sourced.

### DAX Turnaround Tuesday (FDAX 30m)

**Decision: REJECT — negative OOS after correct implementation**

Rejection gate checklist:
- [x] Close-fill execution implemented
- [x] Trade reconciliation >= 20 trades
- [x] All three metric layers reported
- [x] WFO run with correct protocol

WFO: 9 folds, 5 positive. PF=0.9814. Holdout PF=0.7245.

### GLD Thursday Long (GLD 1D)

**Decision: KEEP**

Rejection gate checklist:
- [x] Close-fill execution implemented
- [x] Trade reconciliation >= 20 trades
- [x] All three metric layers reported
- [x] WFO run with correct protocol

WFO: 12 folds, 11 positive. PF=1.4516. Holdout PF=1.1554.

---

*Report generated by run_white_swan_audit_v2.py | 2026-08-09 10:25 UTC*
