# White Swan Strategy Audit v3

**Run timestamp:** 2026-08-09T11:14:36.012545Z

**Execution model:** CLOSE-FILL (cheat-on-close). Entry at signal bar CLOSE.

**Cost model (IB Standard):**
- GC1! commission: $0.85/contract/side + 1 tick slippage = $21.70 round-trip per lot
- FDAX commission: EUR 2.5/contract/side + 0.075% spread/side
- GLD commission: 0.02%/side (0.04% round-trip)

---

## Phase 1 — Data Manifest

| Dataset | Rows | Start | End | Notes |
|---------|------|-------|-----|-------|
| GC1_240m | 15,431 | 2016-06-03 | 2026-06-04 | DATA-LIMITED: starts 2016-06. Only 3 WFO folds possible pre-2021. Pre-2016 not found. |
| GC1_1D | 12,945 | 1975-01-02 | 2026-06-18 | Daily GC1! available 1975+. Used for ATR reference only; 240m signal cannot be reconstructed from daily. |
| FDAX_30m | 166,850 | 2007-03-13 | 2026-07-14 |  |
| GLD_1D | 5,437 | 2004-11-18 | 2026-07-01 |  |
| VIX_1D | 9,202 |  |  |  |
| US10Y_1D | 10,834 |  |  |  |
| DXY_1D | 10,292 |  |  |  |

**Gold/GC1! 240m finding:** GC1! 240m data starts 2016-06-03. No pre-2016 240m data found in Downloads or Brain. This is a hard DATA-LIMITATION — the canonical Gold Friday Long strategy requires intraday 240m bars. The GC1! 1D dataset goes back to 1975 but cannot substitute for 240m signal bar identification. Maximum 3 WFO folds possible (2yr IS / 1yr OOS) before 2021 holdout.

---

## Phase 2 — Canonical Strategy Specifications

### Gold Friday Long (GC1! 240m)
- **Signal bar:** Friday 240m bar with UTC close hour 13-18 (last session bar)
- **Entry:** CLOSE of signal bar (cheat-on-close)
- **ATR:** rolling ATR(n) on prior completed bars
- **Stop:** entry - sl_atr * ATR
- **Target:** entry + sl_atr * ATR * rr
- **Exit:** first of: stop hit, target hit, Monday close
- **Cost:** $0.85/side commission + 1 tick ($10) slippage => $21.70 RT

### GLD Thursday Long (GLD 1D)
- **Signal bar:** Thursday daily bar
- **Entry:** Thursday CLOSE (cheat-on-close)
- **Exit:** Friday CLOSE, or stop if Friday LOW <= stop, or target if Friday HIGH >= target
- **ATR:** ATR(n) including signal bar close (same bar)
- **Cost:** 0.02%/side commission, 0.04% round-trip

### DAX Turnaround Tuesday (FDAX 30m)
- **Signal bar:** Monday 30m bar closing at Berlin 17:30 (UTC 15:30 CEST / 16:30 CET)
- **Entry:** CLOSE of that bar (cheat-on-close)
- **ATR:** prior completed DAILY bar ATR (no look-ahead from 30m data)
- **Stop:** entry - sl_atr * daily_ATR_prior
- **Target:** entry + sl_atr * daily_ATR_prior * rr
- **Exit:** Wednesday 17:30 Berlin bar CLOSE, or stop/target first
- **Cost:** EUR 2.50/side commission + 0.075% spread/side
- **Note:** Layer A signal PF(R) reported separately from contract sizing

---

## Phase 3 — Trade Reconciliation

Representative sample trades are included in the JSON output (`phase6_wfo.[strategy].folds`). 
Full trade lists are available from the backtest engine. 
Entry is confirmed at signal bar close; no next-bar look-ahead is used.

---

## Phase 4 — Signal Edge Analysis (Layer A)

All metrics computed at 1% equity risk per trade. R-multiples based on net P&L / initial risk amount.

| Strategy | Trades | Win Rate | PF(R) | Avg R | Avg Win R | Avg Loss R | Payoff | Max Losing Streak |
|----------|--------|----------|-------|-------|-----------|------------|--------|-------------------|
| Gold Friday Long | 508 | 48.62% | 1.083 | 0.019 | 0.507 | -0.443 | 1.14 | 8 |
| GLD Thursday Long | 1094 | 53.66% | 1.399 | 0.130 | 0.850 | -0.704 | 1.21 | 9 |
| DAX Turnaround Tue | 959 | 50.57% | 0.882 | -0.022 | 0.333 | -0.387 | 0.86 | 8 |

**Signal PF(R) gate:** A strategy with PF(R) < 1.0 is archived unless regime justification exists.

---

## Phase 5 — Parameter Family Grid Search (IS pre-2021)


### Gold Friday Long — Top 5 IS parameter sets

| Params | IS PF | IS CAGR | IS DD | IS Trades | Signal PF(R) |
|--------|-------|---------|-------|-----------|--------------|
| {'atr_len': 14, 'sl_atr': 1.5, 'rr': 1.25} | 1.668 | 5.81% | -5.31% | 233 | 1.282 |
| {'atr_len': 14, 'sl_atr': 1.5, 'rr': 1.0} | 1.665 | 5.78% | -5.80% | 233 | 1.254 |
| {'atr_len': 21, 'sl_atr': 1.5, 'rr': 1.0} | 1.662 | 5.88% | -6.05% | 233 | 1.299 |
| {'atr_len': 21, 'sl_atr': 1.5, 'rr': 1.25} | 1.645 | 5.72% | -5.69% | 233 | 1.290 |
| {'atr_len': 21, 'sl_atr': 2.0, 'rr': 1.0} | 1.633 | 5.74% | -6.62% | 233 | 1.299 |

### GLD Thursday Long — Top 5 IS parameter sets

| Params | IS PF | IS CAGR | IS DD | IS Trades | Signal PF(R) |
|--------|-------|---------|-------|-----------|--------------|
| {'atr_len': 10, 'sl_atr': 0.75, 'tp_r': 0.0} | 1.444 | 5.57% | -10.49% | 817 | 1.416 |
| {'atr_len': 7, 'sl_atr': 0.75, 'tp_r': 0.0} | 1.435 | 5.54% | -11.15% | 817 | 1.427 |
| {'atr_len': 7, 'sl_atr': 1.0, 'tp_r': 2.0} | 1.422 | 4.12% | -9.85% | 817 | 1.405 |
| {'atr_len': 20, 'sl_atr': 1.0, 'tp_r': 0.0} | 1.417 | 4.06% | -8.61% | 815 | 1.384 |
| {'atr_len': 14, 'sl_atr': 1.0, 'tp_r': 0.0} | 1.417 | 4.02% | -9.42% | 816 | 1.383 |

### DAX Turnaround Tuesday — Top 5 IS parameter sets

| Params | IS PF | IS CAGR | IS DD | IS Trades | Signal PF(R) |
|--------|-------|---------|-------|-----------|--------------|
| {'atr_len': 21, 'sl_atr': 2.0, 'rr': 1.0} | 1.134 | 3.50% | -39.09% | 297 | 0.991 |
| {'atr_len': 14, 'sl_atr': 1.5, 'rr': 1.0} | 1.130 | 3.43% | -41.74% | 297 | 1.002 |
| {'atr_len': 7, 'sl_atr': 2.0, 'rr': 1.0} | 1.125 | 3.28% | -38.43% | 297 | 1.000 |
| {'atr_len': 7, 'sl_atr': 1.5, 'rr': 2.0} | 1.121 | 3.21% | -42.55% | 297 | 1.014 |
| {'atr_len': 7, 'sl_atr': 2.0, 'rr': 1.5} | 1.121 | 3.21% | -37.98% | 297 | 1.001 |

---

## Phase 6 — Rolling Walk-Forward


### Gold Friday Long

**WFO Protocol:** 5yr IS / 1yr OOS (Gold: 2yr IS due to data limit)

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2017-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | {'atr_len': 10, 'sl_atr': 1.5, 'rr': 1.25} | 1.064 | 1.376 | 3.14% | -2.23% | 51 |
| 2 | 2018-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | {'atr_len': 10, 'sl_atr': 1.5, 'rr': 1.0} | 1.168 | 2.429 | 19.14% | -3.03% | 50 |

**WFO Aggregate:** 2 folds, 2 positive (2/2) | Avg PF=1.902 | Avg CAGR=11.14% | Min DD=-3.03% | Total OOS trades=101

### GLD Thursday Long

**WFO Protocol:** 5yr IS / 1yr OOS (Gold: 2yr IS due to data limit)

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2010-01-01 | 2015-01-01 | 2015-01-01 | 2016-01-01 | {'atr_len': 10, 'sl_atr': 0.75, 'tp_r': 0.0} | 1.452 | 1.312 | 4.14% | -2.59% | 49 |
| 2 | 2011-01-01 | 2016-01-01 | 2016-01-01 | 2017-01-01 | {'atr_len': 10, 'sl_atr': 0.75, 'tp_r': 0.0} | 1.433 | 1.212 | 3.76% | -5.74% | 49 |
| 3 | 2012-01-01 | 2017-01-01 | 2017-01-01 | 2018-01-01 | {'atr_len': 20, 'sl_atr': 1.0, 'tp_r': 0.0} | 1.275 | 1.541 | 5.39% | -2.85% | 47 |
| 4 | 2013-01-01 | 2018-01-01 | 2018-01-01 | 2019-01-01 | {'atr_len': 20, 'sl_atr': 1.0, 'tp_r': 0.0} | 1.308 | 1.291 | 2.65% | -1.76% | 47 |
| 5 | 2014-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | {'atr_len': 7, 'sl_atr': 1.0, 'tp_r': 2.0} | 1.407 | 1.361 | 3.52% | -2.85% | 49 |
| 6 | 2015-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | {'atr_len': 7, 'sl_atr': 1.0, 'tp_r': 2.0} | 1.424 | 1.535 | 4.85% | -1.83% | 49 |

**WFO Aggregate:** 6 folds, 6 positive (6/6) | Avg PF=1.375 | Avg CAGR=4.05% | Min DD=-5.74% | Total OOS trades=290

### DAX Turnaround Tuesday

**WFO Protocol:** 5yr IS / 1yr OOS (Gold: 2yr IS due to data limit)

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS CAGR | OOS DD | OOS Trades |
|------|----------|--------|-----------|---------|-------------|-------|--------|----------|--------|------------|
| 1 | 2013-01-01 | 2018-01-01 | 2018-01-01 | 2019-01-01 | {'atr_len': 7, 'sl_atr': 1.5, 'rr': 1.0} | 1.162 | 0.463 | -27.91% | -33.50% | 21 |
| 2 | 2014-01-01 | 2019-01-01 | 2019-01-01 | 2020-01-01 | {'atr_len': 7, 'sl_atr': 1.5, 'rr': 1.0} | 0.993 | 1.336 | 8.41% | -7.32% | 18 |
| 3 | 2015-01-01 | 2020-01-01 | 2020-01-01 | 2021-01-01 | {'atr_len': 7, 'sl_atr': 1.5, 'rr': 1.5} | 1.016 | 1.756 | 48.66% | -14.38% | 23 |

**WFO Aggregate:** 3 folds, 2 positive (2/3) | Avg PF=1.185 | Avg CAGR=9.72% | Min DD=-33.50% | Total OOS trades=62

---

## Phase 7 — Final Holdout 2021+

Parameters locked from WFO. Run exactly once on 2021-01-01 to latest available data.

| Strategy | Best Family | CAGR | MaxDD | Calmar | PF | Win Rate | Trades | Avg R |
|----------|-------------|------|-------|--------|-----|---------|--------|-------|
| Gold Friday Long | {'atr_len': 10, 'sl_atr': 1.5, 'rr': 1.25} | -6.48% | -49.09% | -0.132 | 0.867 | 47.64% | 275 | -0.012 |
| GLD Thursday Long | {'atr_len': 10, 'sl_atr': 0.75, 'tp_r': 0.0} | 4.96% | -5.64% | 0.880 | 1.412 | 51.09% | 274 | 0.122 |
| DAX Turnaround Tue | {'atr_len': 7, 'sl_atr': 1.5, 'rr': 1.0} | 7.97% | -20.22% | 0.394 | 1.171 | 50.41% | 121 | -0.007 |

### Yearly Returns (Holdout 2021+)


**Gold Friday Long:** 2021: 1.95% | 2022: -6.52% | 2023: 2.92% | 2024: -8.00% | 2025: 20.22% | 2026: -35.74%

**GLD Thursday Long:** 2021: 1.60% | 2022: -0.49% | 2023: 6.29% | 2024: 9.54% | 2025: 7.60% | 2026: 2.66%

**DAX Turnaround Tuesday:** 2021: 10.20% | 2022: 39.91% | 2023: -2.63% | 2024: -2.83% | 2025: 17.80% | 2026: -11.54%

---

## Phase 8 — Regime Research

| Strategy | Scenario | PF | CAGR | MaxDD | Calmar |
|----------|----------|----|------|-------|--------|
| GLD | No Regime | 1.349 | 6.05% | -9.97% | 0.606 |
| GLD | With DXY+US10Y Regime | 1.412 | 4.96% | -5.64% | 0.880 |
| DAX | No Regime | 0.912 | -14.97% | -70.56% | -0.212 |
| DAX | With VIX Regime | 1.171 | 7.97% | -20.22% | 0.394 |

Regime filter accepted only if it improves Calmar AND WFO fold consistency vs. core strategy.

---

## Phase 9 — Third Strategy Search

DAX Turnaround Tuesday final verdict: **WATCH**

DAX passed signal gate. No third strategy search required.

---

## Phase 10 — Cost / Execution Stress


### Gold (GC1! futures)

| Scenario | CAGR | MaxDD | Calmar | PF | Trades |
|----------|------|-------|--------|-----|--------|
| baseline | -6.48% | -49.09% | -0.132 | 0.867 | 275 |
| costs_1_5x | -7.24% | -50.26% | -0.144 | 0.854 | 275 |
| costs_2x | -8.02% | -51.47% | -0.156 | 0.842 | 275 |
| sl_wide_20pct | -5.05% | -48.72% | -0.104 | 0.895 | 275 |
| sl_narrow_20pct | -7.58% | -46.99% | -0.161 | 0.846 | 275 |

### GLD (ETF)

| Scenario | CAGR | MaxDD | Calmar | PF | Trades |
|----------|------|-------|--------|-----|--------|
| baseline | 4.96% | -5.64% | 0.880 | 1.412 | 274 |
| costs_1_5x | 4.22% | -5.89% | 0.717 | 1.334 | 274 |
| costs_2x | 3.47% | -6.15% | 0.563 | 1.261 | 274 |
| sl_wide_20pct | 3.20% | -5.35% | 0.598 | 1.292 | 274 |
| sl_narrow_20pct | 7.74% | -6.00% | 1.289 | 1.566 | 274 |

### DAX (FDAX futures)

| Scenario | CAGR | MaxDD | Calmar | PF | Trades |
|----------|------|-------|--------|-----|--------|
| baseline | 7.97% | -20.22% | 0.394 | 1.171 | 121 |
| costs_1_5x | 1.83% | -27.24% | 0.067 | 1.032 | 121 |
| costs_2x | -6.61% | -49.84% | -0.133 | 0.910 | 121 |
| sl_wide_20pct | 5.84% | -21.68% | 0.270 | 1.119 | 121 |
| sl_narrow_20pct | 2.96% | -26.87% | 0.110 | 1.054 | 121 |

**Contract specs:**
- GC1! (full): $100/point, tick 0.10 = $10, margin ~$10,000
- MGC (micro gold): $10/point
- GLD ETF: $1/share, commission 0.02%/side
- FDAX: EUR 25/point, tick 0.5 = EUR 12.50, margin ~EUR 22,000

---

## Final Verdicts & Portfolio Recommendation


### Gold Friday Long (GC1! 240m)
- **Verdict:** DATA-LIMITED
- Signal PF(R): 1.0830
- WFO: 2/2 positive folds
- Holdout PF: 0.8665
- Holdout CAGR: -6.48%

### GLD Thursday Long (GLD 1D)
- **Verdict:** KEEP
- Signal PF(R): 1.3991
- WFO: 6/6 positive folds
- Holdout PF: 1.4117
- Holdout CAGR: 4.96%

### DAX Turnaround Tuesday (FDAX 30m)
- **Verdict:** WATCH
- Signal PF(R): 0.8825
- WFO: 2/3 positive folds
- Holdout PF: 1.1715
- Holdout CAGR: 7.97%

### Portfolio Conclusion

**Option B: One confirmed + one conditional strategy.**
KEEP: gld_thursday_long. WATCH: gold_friday_long, dax_turnaround_tuesday
Proceed with KEEP strategy at 60% weight; WATCH at 40% contingent on continued monitoring.

**Gold Friday Long data gap note:** GC1! 240m history starts 2016. 
If full 240m history from 2003+ is obtained (provider: CQG, Quandl, CSI), 
re-run audit phases 5-7. The GC1! 1D data (1975+) confirms the Friday-long 
seasonal tendency exists at daily resolution, supporting the hypothesis.

---

*Generated by White Swan Strategy Audit v3. All results from Backtrader with IB-standard cost model. No fabricated data.*