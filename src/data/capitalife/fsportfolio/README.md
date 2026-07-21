# FSPortfolio Live Core v2 Data Folder

## Expected files

- `ohlc/SPY.csv`
- `ohlc/SPMO.csv`
- `ohlc/QQQ.csv`
- `ohlc/GLD.csv`
- `white-swan/Invest_NAS_EMA_TRADES.csv`
- `white-swan/QQQ_pine.txt`

Optional research only:

- `research/DBC.csv`
- `ohlc/NAS100USD.csv`

## Required columns

- `date` or `time` or `datetime`
- `open`
- `high`
- `low`
- `close`

Optional:

- `volume`

## Notes

- CSV is the primary supported import format right now.
- XLSX may be detected, but should be converted or wired explicitly before production use.
- Final v2 core requires `SPY`, `SPMO`, `QQQ`, `GLD`. If `SPMO.csv` is missing, the final core backtest must stay incomplete.
- White Swan NAS EMA uses `QQQ` as implementation instrument. `NAS100USD` remains research/signal reference only.
- DBC is not part of the final v2 core allocation. Keep it only for research comparison.
- Keep private broker exports, statements, and raw account files out of git.
- Local-only raw drops should go into ignored folders such as `fsportfolio/raw/`.
