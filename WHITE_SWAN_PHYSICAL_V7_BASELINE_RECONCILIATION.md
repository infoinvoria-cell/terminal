# White Swan Physical Intelligence V2 — Baseline Reconciliation

## Resolved current baseline

Product version: `v7.0` (current product/UI contract).

Canonical active component count: `14`.

Canonical active component IDs: `eurusd_m6e`, `gld_mgc`, `zw_mzw`, `dax_1h`,
`dax_2h`, `sb_seasonal`, `gc1_seasonal`, `zc_seasonal`, `cl1_seasonal`,
`cc_seasonal`, `zs_seasonal`, `spy_mes`, `hg1_seasonal`, `ym1_tat`.

Current performance artifact: `public/data/white-swan/final/portfolio-summary.json`.
Current v7 daily PNL/NAV source: `public/data/white-swan/final/equity-series.json`,
with the daily MTM provenance documented in the portfolio summary.

## Repository metadata note

The machine-readable release manifest is generated 2026-08-16 and internally
labels the artifact `v6.3.5`, while the current product contract is v7.0. This
is resolved as stale release metadata, not as a second active portfolio. The
current source remains the public final artifact pair above; old
`workspace/output` files are not used as current truth.

The UI displays `v7.0`; the release manifest's v6.3.5 string is treated as
legacy metadata. V2 attaches only to the 14 active release IDs and records the
source-registry mapping separately.

## Registry classification — all 17 active registry rows

| registry ID | status |
|---|---|
| `spy_sea` | ACTIVE_V7 |
| `zm1_sea` | BLOCKED |
| `sb1_sea_l` | ACTIVE_V7 |
| `eem_sea` | BLOCKED |
| `hg1_sea` | ACTIVE_V7 |
| `gc1_sea` | ACTIVE_V7 |
| `cl1_sea` | ACTIVE_V7 |
| `zc1_sea` | ACTIVE_V7 |
| `zw1_sea` | ACTIVE_V7 |
| `zs1_sea` | ACTIVE_V7 |
| `cc1_sea` | ACTIVE_V7 |
| `iwm_sea` | BLOCKED |
| `gld_thursday` | ACTIVE_V7 |
| `ym1_tat` | ACTIVE_V7 |
| `eurusd_30m` | ACTIVE_V7 |
| `dax_1h` | ACTIVE_V7 |
| `dax_2h` | ACTIVE_V7 |

17 versus 14 is therefore resolved: 14 registry rows map to current active
release sleeves; 3 are explicitly blocked by the release manifest.

Corn (`zc1_sea` → `zc_seasonal`), Soy (`zs1_sea` → `zs_seasonal`) and Wheat
(`zw1_sea` → `zw_mzw`) are all `ACTIVE_V7` and are valid attachments.

## Exact V2 attachments

| commodity | release component | source registry component | instrument | source |
|---|---|---|---|---|
| Corn | `zc_seasonal` | `zc1_sea` | `MZC` | USDA NASS + NOAA STAR VHI |
| Soy | `zs_seasonal` | `zs1_sea` | `MZS` | USDA NASS + NOAA STAR VHI |
| Wheat | `zw_mzw` | `zw1_sea` | `MZW` | NOAA STAR VHI |
| Crude | `cl1_seasonal` | `cl1_sea` | `MCL` | blocked / forward-only AIS candidate |

All attachments are read-only and shadow-only. No strategy, position, order, PNL, margin, or canonical multiplier is changed.
