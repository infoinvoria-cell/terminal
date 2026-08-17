# White Swan Physical Intelligence V1 — Data Sources

| Target | Provider / dataset | Variable | Access | Status |
|---|---|---|---|---|
| Corn | USDA NASS Crop Progress and Condition, `prog3226.txt` | selected-state good+excellent condition, current vs prior year | FREE | REAL observation collected 2026-08-17 from report released 2026-08-10 |
| Soy | USDA NASS Crop Progress and Condition, `prog3226.txt` | selected-state good+excellent condition, current vs prior year | FREE | REAL observation collected 2026-08-17 from report released 2026-08-10 |
| Crude | Global Fishing Watch / AIS candidate | maritime activity proxy | FREE_ACCOUNT | BLOCKED; no credentialed provider configured |

The USDA report covers 91% of 2025 corn acreage and 96% of 2025 soybean acreage in its selected-state tables. It was published after the stated USDA release time and is marked `INITIAL`; later revisions must be represented as new snapshots, never silently overwritten.

Source URLs:

- https://www.nass.usda.gov/Publications/Todays_Reports/reports/prog3226.txt
- https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Crop_Progress_and_Condition/
- https://globalfishingwatch.org/datasets-and-code/

Future optional providers are not required for V1. A commercial AIS or agriculture feed may later improve latency, coverage, historical depth, revision control and SLA, but no paid source was purchased or activated.

## NOAA STAR VHI provenance (V2)

- Product: NOAA STAR Blended Vegetation Health Product, current `GC_current` time-series product.
- Satellite variables: `VCI` (vegetation condition), `TCI` (thermal condition) and composite `VHI`; V2 uses `VHI`.
- Spatial resolution: 4 km operational VHP grid.
- Temporal frequency: weekly, 7-day composite.
- Availability delay: the public time series is used only for a completed week; the observed week and retrieval time are stored. No intraday value is inferred.
- Quality flags: unavailable/missing values (`-1`) are discarded; incomplete state coverage lowers confidence; failed or missing comparisons produce `UNAVAILABLE`.
- Aggregation: arithmetic mean of state-level weekly VHI rows for configured production states; no generic global/U.S. score is used.
- Regions: Corn and Soy use Illinois, Indiana, Iowa, Minnesota, Nebraska, Ohio, South Dakota and Wisconsin. Wheat uses Kansas, Nebraska, North Dakota, Oklahoma and South Dakota.
- Historical availability: NOAA documents VHP coverage from 1981 onward, with VIIRS-era blended products from the modern satellite period. V2 uses the current 2025–2026 comparison endpoint only.
- Forward availability: public weekly STAR endpoint, no account and no API key; each observation stores source, week, retrieval time and processing version.
