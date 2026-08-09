# White Swan Strategy Audit v3b

**Generated**: 2026-08-09 13:31  
**Script**: `engine/backtrader/strategies/white_swan/run_white_swan_audit_v3b.py`

## Prior Confirmed Results (unchanged)

- **GLD Thursday Long**: KEEP — 6/6 WFO folds positive, holdout PF 1.412
- **DAX TAT (unfiltered)**: WATCH — regime filter not properly validated
- **AUDUSD**: EXCLUDED

## Task 1 — Gold Data Search

## 60-Minute GC1! Files (TradingView hash names)

- `5747f` (2003-07-30 -> 2006-12-29, 18791 expected rows): **NOT FOUND**
- `646ce` (2007-01-01 -> 2010-12-31, 23696 expected rows): **NOT FOUND**
- `8f931` (2011-01-02 -> 2014-12-31, 23637 expected rows): **NOT FOUND**
- `ff910` (2015-01-01 -> 2018-12-31, 23597 expected rows): **NOT FOUND**
- `279f5` (2019-01-01 -> 2022-12-30, 23652 expected rows): **NOT FOUND**
- `cd78a` (2023-01-02 -> 2026-06-05, 20249 expected rows): **NOT FOUND**

**60-minute dataset complete: NO — MISSING ALL 6 FILES**

## 240-Minute GC1! File
- Path: `C:\Users\joris\Downloads\COMEX_DL_GC1!, 240_dc277.csv`
- Bars: 15,431
- Range: 2016-06-03 -> 2026-06-04
- Columns: ['time', 'open', 'high', 'low', 'close']
- **Coverage note**: Starts 2016-06-03 only — insufficient for 2003-2020 WFO.

## VIX Daily Data
- `CBOE_DLY_VIX, 1D_6c8f2.csv`: 704 bars, 2023-11-06 -> 2026-08-06
- `CBOE_DLY_VIX, 1D_6c8f2 (1).csv`: 704 bars, 2023-11-06 -> 2026-08-06
- **CRITICAL: VIX data starts 2023-11-06 — pre-2021 VIX data NOT available. DAX regime pre-2021 WFO BLOCKED.**

## Task 2 — Gold Friday Long Pipeline

Data available: 2016-06-03 -> 2026-06-04 (10.0 years)

### WFO Feasibility Note

The canonical WFO requires IS starting 2003. Available 240m data starts 2016-06-03.
Running partial WFO with 5 folds using 2016-2025 data only.
**This is a degraded analysis — pre-2016 history is absent.**
**The 6 target 60-minute files were not found; this is the best available dataset.**

### Walk-Forward Fold Table (partial — 2016 data only)

| Fold | IS Start | IS End | OOS Start | OOS End | Best Params | IS PF | OOS PF | OOS Trades | OOS Win% | OOS AvgR |
|------|----------|--------|-----------|---------|-------------|-------|--------|------------|----------|----------|
| 1 | 2016-06-01 | 2020-12-31 | 2021-01-01 | 2021-12-31 | ATR=21 SL=2.0 RR=1.25 | 1.415 | 0.967 | 61 | 49.2% | -0.011 |
| 2 | 2017-01-01 | 2021-12-31 | 2022-01-01 | 2022-12-31 | ATR=21 SL=1.5 RR=1.25 | 1.363 | 0.5 | 72 | 33.3% | -0.242 |
| 3 | 2018-01-01 | 2022-12-31 | 2023-01-01 | 2023-12-31 | ATR=21 SL=1.0 RR=1.0 | 1.117 | 1.341 | 85 | 55.3% | 0.124 |
| 4 | 2019-01-01 | 2023-12-31 | 2024-01-01 | 2024-12-31 | ATR=14 SL=1.0 RR=1.0 | 1.237 | 0.858 | 87 | 47.1% | -0.068 |
| 5 | 2020-01-01 | 2024-12-31 | 2025-01-01 | 2025-12-31 | ATR=10 SL=1.0 RR=1.0 | 1.205 | 1.033 | 81 | 50.6% | 0.015 |

### WFO Aggregate (OOS 2021–2025, partial)

- Trades: 386
- PF: 0.926
- Win%: 47.4%
- AvgR: -0.032
- CAGR (1% risk): -2.74%
- MaxDD: 20.4%
- Calmar: -0.134
- Positive folds: 2/5

### Holdout 2021–2026-06-05

- Params: ATR=21 SL=2.0 RR=1.25
- Trades: 330
- PF: 1.034
- Win%: 48.5%
- AvgR: 0.011
- CAGR: 0.51%
- MaxDD: 14.39%
- Calmar: 0.035

**Yearly Returns (holdout)**

- 2021: -0.167 R
- 2022: -9.838 R
- 2023: +6.226 R
- 2024: -5.081 R
- 2025: +9.119 R
- 2026: +3.491 R *(YTD through 2026-06-05)*

> **DATA INTEGRITY WARNING**: Holdout overlaps WFO OOS period because 240m data starts 2016-06-03. This is unavoidable given available data. Results are directionally informative only. Canonical validation requires the 6 missing 60m files.
## Task 3 — DAX VIX Regime WFO Validation

### Data Availability for DAX Regime WFO

- FDAX 30m data (`EUREX_FDAX_30min_gesamt_2007-2026.csv`): FOUND
- VIX daily data: FOUND — 2023-11-06 -> 2026-08-06
  **CRITICAL: VIX data starts 2023-11-06 — pre-2021 history required for IS regime selection. WFO BLOCKED.**

**BLOCKED**: VIX daily data available only from 2023-11-06. Pre-2021 VIX history is required to select regime thresholds inside IS windows (2007-2020). Running regime selection on the holdout period would constitute look-ahead bias and is prohibited by the audit protocol. DAX VIX regime WFO validation cannot proceed without pre-2021 VIX data.

### DAX Unfiltered Baseline (from v3 audit)

The v3 audit established the following DAX unfiltered WFO results (copied verbatim from v3 — no re-optimization):

Per v3 report: DAX TAT status = WATCH. VIX regime was tested ONLY on 2021+ holdout in v3, which constitutes look-ahead bias. That result cannot be used for strategy promotion.

**Required action**: Obtain TradingView VIX daily export covering at minimum 2007-01-01 to 2020-12-31 to enable proper IS regime selection.

**DAX VIX regime verdict**: CANNOT VALIDATE — data blocked.

### DAX Cost Break-Even (Layer A, FDAX micro EUR 1/point)

Cannot compute without valid trade data from pre-2021 WFO OOS folds.
Break-even formula: `break_even_cost = avg_R × initial_risk_EUR`
Where initial_risk_EUR = sl_atr × daily_ATR × 1 (EUR/point).

Baseline RT cost estimate (FDAX micro): EUR 5.00 + spread (0.15% × entry).
At FDAX entry ~18,000 pts: spread ≈ EUR 27 -> RT total ≈ EUR 32.
Required for KEEP: avg gross edge per trade > EUR 32.
## Task 4 — Portfolio Combinations

### Portfolio Combination Assessment

Portfolio combinations require validated, non-overlapping WFO OOS equity curves.

| Strategy | Status | WFO Folds | Pre-2021 OOS Available |
|----------|--------|-----------|------------------------|
| GLD Thursday Long | CONFIRMED KEEP (v2+v3) | 6/6 positive | YES |
| Gold Friday Long 240m | PARTIAL DATA — 2016 start only | 5 folds (2021-2025) | NO — 2016 data only |
| DAX VIX Regime | BLOCKED — VIX pre-2021 data missing | — | NO |

### Combination Verdicts

**Combination A** (GLD + Gold + DAX-regime):
- BLOCKED. Gold lacks pre-2016 history. DAX regime lacks pre-2021 VIX data.

**Combination B** (GLD + Gold):
- CONDITIONAL. Gold 240m data from 2016 only. Cannot compare pre-2021 OOS periods.
- Cannot construct joint equity curve: OOS periods differ (GLD OOS ends 2020, Gold OOS is 2021-2025).
- BLOCKED for proper portfolio correlation analysis.

**Combination C** (GLD + DAX-regime):
- BLOCKED. DAX regime not validated (VIX data gap).

**Combination D** (GLD only, 9% weight):
- VALID. GLD Thursday Long is confirmed. Single-strategy baseline.
- Holdout PF: 1.412 (from v3 audit).

**Final Portfolio Verdict: D — GLD Thursday Long only.**
## Final Verdict

**Portfolio: D — GLD Thursday Long (9% weight, confirmed KEEP)**

### Strategy Status Summary

| Strategy | Verdict | Blocker |
|----------|---------|---------|
| GLD Thursday Long | KEEP | None — fully validated |
| Gold Friday Long | BLOCKED/PARTIAL | 60m files not found; 240m starts 2016 only |
| DAX VIX Regime | CANNOT VALIDATE | VIX data only from 2023-11-06 |

### Data Requirements to Unblock

**Gold Friday Long** — requires any ONE of:
1. The 6 TradingView 60-minute GC1! export files (hashes: 5747f, 646ce, 8f931, ff910, 279f5, cd78a)
2. A single continuous 240-minute or 60-minute GC1! export covering at minimum 2003-01-01 to 2020-12-31

**DAX VIX Regime** — requires:
1. TradingView VIX daily export covering 2007-01-01 to at minimum 2020-12-31
   (Export from TradingView: CBOE:VIX, Daily, full history download)
