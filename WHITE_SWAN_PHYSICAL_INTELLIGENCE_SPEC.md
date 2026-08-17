# WHITE SWAN PHYSICAL INTELLIGENCE V1

Status: `SHADOW_OBSERVATION_ONLY`

Physical Intelligence is a read-only information layer attached to existing White Swan components. It is not a strategy, sleeve, portfolio component, execution signal, risk multiplier, or sizing input.

## Baseline resolution

The current canonical implementation is `src/lib/components/ws-strategy-data.ts` with 17 active registry rows. The current performance artifact is `public/data/white-swan/final/portfolio-summary.json`, version `v6.3.5`, generated `2026-08-16`; its release manifest lists 14 active sleeves and three blocked sleeves. `WhiteSwanFinal.tsx` still contains a frozen v7.0 display block, so the UI label and current canonical artifact are inconsistent. This V1 does not reconcile or alter that conflict.

Target IDs resolved from current canonical data:

- Corn: `zc_seasonal` / `ZC1!` / `MZC`
- Soy: `zs_seasonal` / `ZS1!` / `MZS`
- Crude: `cl1_seasonal` / `CL1!` / `MCL`

## Score

For Corn and Soy V1 uses one transparent USDA condition variable:

`score = clamp((current good + excellent) - (prior-year good + excellent)) × 5, -100, +100)`

This is a physical condition deviation, not a price-direction claim. Confidence is acreage coverage divided by 100. No CAGR optimization or threshold search is used.

Crude remains `UNAVAILABLE` until an authenticated, legitimate maritime activity source is configured. No tanker route, vessel class, barrel flow, or synthetic score is asserted.

## Trading invariants

- `positionMultiplier = 1.0` always
- entries, exits, contracts, portfolio weights, margin and orders are untouched
- provider failure, stale data and future publication timestamps use original strategy behavior
- hypothetical 0.95x shadow filters are logged only and never applied
