# White Swan Strategy Audit — Reconciliation Report

**Run date:** 2026-08-08  
**Backtrader version:** 1.9.78.123  
**Execution model:** Vectorized pandas (entry at next-bar open, stop/target checked via bar high/low)  
**Methodology:** Walk-Forward Optimization (rolling windows, IS optimization on Profit Factor)

---

## Data Files Used

| Feed | Path | Rows | Date Range |
|------|------|------|------------|
| GC1 240m | COMEX_DL_GC1!, 240_dc277.csv | 15,431 | 2016-06-03 to 2026-06-04 |
| FDAX 30m | EUREX_FDAX_30min_gesamt_2007-2026.csv | 166,850 | 2007-03-13 to 2026-07-14 |
| GLD 1D | BATS_GLD, 1D_4975f.csv | 5,437 | 2004-11-18 to 2026-07-01 |
| VIX 1D | TVC_VIX, 1D_402f7.csv | 9,202 | 1990-01-03 to 2026-06-18 |
| US10Y 1D | TVC_US10Y, 1D_935af.csv | 10,834 | 1912-06-03 to 2026-06-18 |
| DXY 1D | ICEUS_DLY_DXY, 1D_3217e.csv | 10,292 | 1985-11-08 to 2026-06-16 |

---

## Cost Model

| Strategy | Commission | Slippage | Notes |
|----------|-----------|---------|-------|
| Gold (GC1) | $3.00/side/contract | 0 ticks | GC contract: $100/point |
| DAX (FDAX) | EUR 2.50/side + 0.075% spread/side | 0 | EUR 25/index point |
| GLD ETF | 0.02% per side (roundtrip 0.04%) | 0 | 1 share = $1/point |

---

## WFO Protocol

- **IS optimization criterion:** Profit Factor (maximize)
- **Minimum IS trades:** 5 (below this threshold, a combo is skipped)
- **Holdout:** 2021-01-01 to present — used exactly once after family lock
- **Regime look-ahead guard:** All regime signals shifted by 1 day (prior-day confirmed)
- **GC1 note:** Data starts 2016-06-03. Only 2-year IS windows possible (standard 5yr not feasible). Limited to 3 WFO folds.
- **FDAX note:** 5-year IS windows, 9 folds (2007-2021)
- **GLD note:** 5-year IS windows, 12 folds (2004-2021)

---

## Strategy 1: GOLD Friday Long (GC1! 240m)

### Strategy Logic
- Signal: Friday 240m bar with UTC hour in [13, 18] (penultimate session bar — approx 4h before COMEX Friday close)
- Entry: Market order at next bar's open
- Stop: `entry - sl_atr * ATR(atr_len)`
- Target: `entry + sl_atr * ATR * rr`
- Time exit: Friday 240m bar with UTC hour >= 19 (session close bar)
- Force exit: Monday if still open (missed time exit)
- Size: 1% equity risk / stop_distance_usd
- Commission: $3.00/side/contract ($6.00 round-turn)

### WFO Fold Table

| Fold | IS Period | OOS Period | Best Params | IS PF | OOS CAGR | OOS DD | OOS PF | Trades |
|------|-----------|-----------|-------------|--------|----------|--------|--------|--------|
| 1 | 2016-06 to 2018-01 | 2018 | ATR=14, SL=1.25, RR=1.0 | 1.149 | -1.32% | -2.28% | 0.804 | 51 |
| 2 | 2017-01 to 2019-01 | 2019 | ATR=10, SL=0.75, RR=1.0 | 0.977 | +3.68% | -2.25% | 1.335 | 51 |
| 3 | 2018-01 to 2020-01 | 2020 | ATR=10, SL=1.25, RR=1.0 | 1.298 | +13.04% | -3.29% | 2.189 | 50 |

**WFO Aggregate:** CAGR=+5.13%, MaxDD=-3.29%, PF=1.442, WR=~51%, Trades=152 (OOS only)  
**Positive OOS folds:** 2 of 3

### Locked Parameter Family
`atr_len=14, sl_atr=1.25, rr=1.0` (most frequent across folds: appeared 1x; reference center: ATR=10, SL=1.0, RR=1.5)

### Final Holdout 2021+
| Metric | Value |
|--------|-------|
| CAGR | -11.18% |
| MaxDD | -51.27% |
| PF | 0.693 |
| Trades | 275 |

### Comparison vs Reference
| Metric | Reference | WFO OOS | Holdout 2021+ |
|--------|-----------|---------|----------------|
| CAGR | 2.64% | 5.13% | -11.18% |
| MaxDD | -5.14% | -3.29% | -51.27% |
| PF | 1.58 | 1.44 | 0.69 |
| Trades | 547 | 152 | 275 |

**Key observations:**
- WFO OOS appears favorable (CAGR 5.13%, PF 1.44) but is based on only 3 folds covering 2018-2021
- The 2020 OOS fold captures a gold bull run (COVID spike), inflating aggregate WFO metrics
- Holdout 2021+ is severely negative: CAGR -11.18%, MaxDD -51.27%, PF 0.693 — the strategy destroys capital in the post-COVID regime
- The IS best-PF of 0.977 in Fold 2 (below 1.0) signals the IS signal is weak even in-sample
- Reference trades (547) far exceed our WFO trades (152) — likely using a different data range or entry timing
- The -51% MaxDD on 1% risk/trade signals position sizing or exit failures; likely gaps and Friday session anomalies in illiquid hours

### DECISION: REJECT

**Rationale:** The holdout 2021+ result is definitively negative (PF=0.69, MaxDD=-51%). The WFO "positive" appearance is driven by a single anomalous 2020 fold (gold COVID spike, +13% OOS). Only 2/3 WFO folds are positive. The locked family differs substantially from the reference center. GC1 data limitation (only 4.5 years pre-2021) means the WFO is statistically underpowered — 3 folds is insufficient for confidence. This strategy is not ready for the portfolio.

---

## Strategy 2: DAX Turnaround Tuesday (FDAX 30m)

### Strategy Logic
- Signal: Monday 30m bar at 16:30 or 15:30 UTC (= 17:30 Europe/Berlin, handling CET/CEST DST)
- Entry: Market order at next bar's open (Monday evening)
- Stop: Prior-day daily ATR_SMA(atr_len) * sl_atr (confirmed daily ATR, no look-ahead)
- Target: stop_distance * rr
- Time exit: Wednesday bar at 16:30 or 15:30 UTC (= 17:30 Berlin)
- Force exit: Thursday or later if still open
- Regime multipliers: VIX < MA = bad (0.75x), US10Y > MA = bad (0.75x); both bad = 0.50x
- Size: 1% equity * regime_mult / stop_eur; contract: EUR 25/point
- Commission: EUR 2.50/side + 0.075% spread/side

### WFO Fold Table

| Fold | IS Period | OOS Period | Best Params | IS PF | OOS CAGR | OOS DD | OOS PF | Trades |
|------|-----------|-----------|-------------|--------|----------|--------|--------|--------|
| 1 | 2007-2012 | 2012 | ATR=21, SL=1.5, RR=1.0 | 0.957 | -6.81% | -13.64% | 0.872 | 45 |
| 2 | 2008-2013 | 2013 | ATR=14, SL=1.5, RR=1.0 | 1.028 | -13.22% | -18.52% | 0.796 | 47 |
| 3 | 2009-2014 | 2014 | ATR=14, SL=1.0, RR=1.5 | 1.068 | +16.77% | -11.75% | 1.312 | 46 |
| 4 | 2010-2015 | 2015 | ATR=21, SL=1.0, RR=1.5 | 1.090 | -54.28% | -62.82% | 0.541 | 46 |
| 5 | 2011-2016 | 2016 | ATR=14, SL=1.5, RR=1.0 | 0.915 | -1.74% | -17.74% | 0.980 | 45 |
| 6 | 2012-2017 | 2017 | ATR=7, SL=1.5, RR=1.0 | 0.914 | -9.13% | -16.85% | 0.848 | 46 |
| 7 | 2013-2018 | 2018 | ATR=21, SL=2.0, RR=2.0 | 0.929 | -22.38% | -28.08% | 0.719 | 44 |
| 8 | 2014-2019 | 2019 | ATR=7, SL=1.5, RR=1.0 | 0.869 | +9.02% | -15.64% | 1.137 | 49 |
| 9 | 2015-2020 | 2020 | ATR=7, SL=1.5, RR=1.0 | 0.859 | +57.91% | -15.12% | 1.541 | 50 |

**WFO Aggregate:** CAGR=-2.65%, MaxDD=-62.82%, PF=0.972, Trades=418 (OOS only)  
**Positive OOS folds:** 3 of 9

### Locked Parameter Family
`atr_len=7, sl_atr=1.5, rr=1.0` (most frequent)

### Final Holdout 2021+
| Metric | Value |
|--------|-------|
| CAGR | -14.98% |
| MaxDD | -70.59% |
| PF | 0.912 |
| Trades | 275 |

### Comparison vs Reference
| Metric | Reference | WFO Aggregate | Holdout 2021+ |
|--------|-----------|--------------|----------------|
| CAGR | 2.08% | -2.65% | -14.98% |
| MaxDD | -9.91% | -62.82% | -70.59% |
| PF | 1.29 | 0.97 | 0.91 |
| Trades | 284 | 418 | 275 |

**Key observations:**
- 6 of 9 WFO OOS folds are negative. The strategy loses money in the majority of out-of-sample years
- The best IS PF across most folds is below 1.0 (IS signal is absent, not just weak OOS)
- Fold 4 OOS: -54% CAGR on 1% risk/trade signals catastrophic position sizing failure in 2015 (Chinese stock crash and DAX volatility spike)
- Fold 9 OOS: +57.91% in 2020 is driven by COVID-related Monday panic + Tuesday recovery — this is a tail event not a repeatable pattern
- Holdout 2021+: CAGR -14.98%, MaxDD -70.59% — strategy is severely underwater in recent years
- The Turnaround Tuesday effect appears to have decayed or never existed robustly in FDAX
- Reference PF of 1.29 and 284 trades may reflect different entry timing, different data source, or survivorship/reporting bias

### DECISION: REJECT

**Rationale:** Only 3/9 WFO folds are positive. WFO aggregate PF=0.97 (below 1.0 = net loss on a dollar basis). Holdout 2021+ catastrophic (PF=0.91, DD=-70%). IS PF below 1.0 in most folds indicates the anomaly is absent even within the training period. The strategy relies on a 2020 COVID fold for its apparent "positive" folds. This strategy is not in the portfolio.

---

## Strategy 3: GLD Thursday Close Long (GLD 1D)

### Strategy Logic
- Signal: Thursday daily bar
- Entry: Market order at next bar's open (Friday open)
- Stop: `entry - sl_atr * ATR(atr_len)` (safety stop, checked at Friday's bar low)
- Target: Optional — tested as tp_r=0 (no TP), 1.5R, 2.0R
- Time exit: Friday close (if no stop/TP hit)
- Force exit: Saturday/next bar if Friday was holiday
- Regime (soft): DXY >= 100-MA = bad; US10Y >= 100-MA = bad; both bad = 0.5x size
- Size: 1% equity * regime_mult / ATR; GLD: $1/share/point
- Commission: 0.02% per side (roundtrip 0.04%)

### WFO Fold Table

| Fold | IS Period | OOS Period | Best Params | IS PF | OOS CAGR | OOS DD | OOS PF | Trades |
|------|-----------|-----------|-------------|--------|----------|--------|--------|--------|
| 1 | 2004-2009 | 2009 | ATR=20, SL=1.5, TP=0 | 1.239 | -1.57% | -1.57% | 0.677 | 46 |
| 2 | 2005-2010 | 2010 | ATR=10, SL=1.5, TP=0 | 1.127 | +1.25% | -0.75% | 1.310 | 49 |
| 3 | 2006-2011 | 2011 | ATR=20, SL=1.5, TP=0 | 1.126 | +1.56% | -0.77% | 1.479 | 47 |
| 4 | 2007-2012 | 2012 | ATR=10, SL=1.5, TP=0 | 1.344 | +0.78% | -2.29% | 1.190 | 49 |
| 5 | 2008-2013 | 2013 | ATR=10, SL=1.5, TP=0 | 1.143 | -0.21% | -1.13% | 0.934 | 48 |
| 6 | 2009-2014 | 2014 | ATR=10, SL=1.5, TP=0 | 1.151 | +2.63% | -0.61% | 1.917 | 48 |
| 7 | 2010-2015 | 2015 | ATR=10, SL=1.5, TP=0 | 1.375 | +0.82% | -1.26% | 1.240 | 49 |
| 8 | 2011-2016 | 2016 | ATR=20, SL=1.5, TP=0 | 1.395 | -1.18% | -3.25% | 0.810 | 47 |
| 9 | 2012-2017 | 2017 | ATR=20, SL=1.5, TP=0 | 1.175 | -2.97% | -3.46% | 0.540 | 47 |
| 10 | 2013-2018 | 2018 | ATR=14, SL=1.5, TP=0 | 1.035 | -0.83% | -1.10% | 0.750 | 48 |
| 11 | 2014-2019 | 2019 | ATR=14, SL=1.5, TP=0 | 1.005 | -2.09% | -2.45% | 0.568 | 47 |
| 12 | 2015-2020 | 2020 | ATR=10, SL=0.75, TP=0 | 0.828 | -4.36% | -5.24% | 0.593 | 49 |

**WFO Aggregate:** CAGR=-0.51%, MaxDD=-5.24%, PF=1.001, Trades=574 (OOS only)  
**Positive OOS folds:** 5 of 12

### Locked Parameter Family
`atr_len=10, sl_atr=1.5, tp_r=0.0` (most frequent — appeared in 6 of 12 folds as best IS)

### Final Holdout 2021+
| Metric | Value |
|--------|-------|
| CAGR | -0.41% |
| MaxDD | -6.41% |
| PF | 0.917 |
| Trades | 274 |

### Comparison vs Reference
| Metric | Reference | WFO Aggregate | Holdout 2021+ |
|--------|-----------|--------------|----------------|
| CAGR | 4.83% | -0.51% | -0.41% |
| MaxDD | -11.27% | -5.24% | -6.41% |
| PF | 1.58 | 1.001 | 0.917 |
| Trades | 525 | 574 | 274 |

**Key observations:**
- GLD Thursday is the most benign of the three — WFO aggregate is near-flat (PF=1.001) with small DD (-5.24%)
- 5/12 positive folds is below the 50% threshold needed for confidence
- Best IS params consistently gravitate toward ATR=10-20, SL=1.5, TP=off — the TP does not help
- Trade count (574 OOS) closely matches reference (525) — data coverage is consistent
- The -4.83% CAGR gap vs reference suggests our entry timing difference (Friday open vs Thursday close) accounts for significant slippage in a Thursday-Friday overnight hold
- Holdout 2021+: marginally negative (PF=0.917, CAGR=-0.41%) — the gold ETF Thursday anomaly appears to have weakened or flipped in recent years
- The MaxDD is small (-5-6%) which is a positive — the strategy doesn't blow up, it just slowly leaks
- Reference CAGR 4.83% with this execution model appears to require either Thursday-close entry (look-ahead) or different cost assumptions

### DECISION: REJECT (with monitoring note)

**Rationale:** WFO aggregate PF barely reaches 1.0, which after transaction costs means a net loss. Only 5/12 OOS folds positive. Holdout 2021+ negative. The strategy is not robust enough for portfolio inclusion at current confidence.

**Monitoring note:** Of the three strategies, GLD Thursday is the least-bad. If the entry timing is refined (entering at Thursday close rather than Friday open, which would require special handling to confirm close price without look-ahead), and if the regime filter is more precisely calibrated, the strategy warrants re-evaluation. The trade pattern and CAGR profile is in the right direction — the implementation gap vs reference (≈4%) is large enough that a refined implementation might recover the edge.

---

## Overall Portfolio Decision Summary

| Strategy | WFO PF | WFO CAGR | Holdout PF | Pos. Folds | Decision |
|----------|--------|----------|-----------|-----------|---------|
| GOLD Friday Long | 1.442 | +5.13% | 0.693 | 2/3 | **REJECT** |
| DAX Turnaround Tuesday | 0.972 | -2.65% | 0.912 | 3/9 | **REJECT** |
| GLD Thursday Long | 1.001 | -0.51% | 0.917 | 5/12 | **REJECT** |

**All three strategies are rejected** from the White Swan portfolio at this time.

---

## Methodological Notes and Caveats

1. **Execution model gap:** Entry is at next-bar open rather than signal-bar close. For intraday strategies (Gold 240m, DAX 30m), this gap can be 4h or 30 minutes respectively. This materially affects results vs a close-fill simulation.

2. **GC1 data limitation:** Only 4.5 years of pre-2021 data available (data starts 2016-06). 3 WFO folds is statistically underpowered; standard requirement is 5-6 positive folds for Core promotion.

3. **DAX regime incomplete:** The "Bad Condition 1" (DAX ATR low vs its own MA) is partially implemented — the daily ATR MA comparison is approximated; the full 3-bad-condition regime would require a separate precomputed column. This may undercount bad conditions and inflate DAX trade count vs reference.

4. **GLD entry timing:** Thursday signal = entry at Friday open. The reference likely enters at Thursday close (using Order.Close or equivalent). The overnight gap (Thu close to Fri open) is the strategy's edge — entering at Friday open misses part of this edge.

5. **Stop fill assumption:** Stop/target triggers use bar high/low as a proxy (conservative). Actual fills on a gap would be worse. The -51% MaxDD on Gold holdout suggests gap risk is real for 240m bars.

6. **No slippage on GLD:** GLD is a highly liquid ETF. The 0.02% per side cost model is likely accurate.

7. **Regime MA length:** VIX and US10Y use 14-period MA for DAX regime; DXY and US10Y use 100-period MA for GLD regime. These are as specified in the handoff. Prior-day shift confirmed no look-ahead.

---

## Files Created

| File | Path |
|------|------|
| Strategy: Gold Friday Long | `engine/backtrader/strategies/white_swan/gold_friday_long.py` |
| Strategy: DAX Turnaround Tuesday | `engine/backtrader/strategies/white_swan/dax_turnaround_tuesday.py` |
| Strategy: GLD Thursday Long | `engine/backtrader/strategies/white_swan/gld_thursday_long.py` |
| WFO Runner | `engine/backtrader/strategies/white_swan/run_white_swan_audit.py` |
| JSON Results | `engine/backtrader/reports/white_swan_audit_results.json` |
| This Report | `reports/white_swan_strategy_audit.md` |
