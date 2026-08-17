# White Swan Physical Intelligence — Phase 2 Shadow Rules

Status: `FROZEN`, `SHADOW_ONLY`

No canonical strategy, position, order, PNL, margin or multiplier is changed.

## Predeclared rule

For each active component, the physical observation score is evaluated at the
first available publication timestamp. If an available score is `<= -50`, the
hypothetical risk modifier is `0.95x`. Otherwise it is `1.00x`.

The optional `0.90x` strong veto is recorded only when two independent,
available observations for the same component are both `<= -50`. It is not
activated by a single source. No upside multiplier is permitted.

The current observations therefore produce: Corn `0.95x` from USDA `-55`, Soy
`1.00x`, Wheat `1.00x` (NOAA VHI `-48.28` is below zero but not below the
predeclared `-50` threshold). Crude has no modifier because it is unavailable.

## Point-in-time rule

An observation is eligible only after its provider publication/availability
timestamp. USDA uses its report release timestamp. NOAA uses the week present
in the public STAR time-series endpoint; no revised historical value may be
backfilled into an earlier decision. The repository does not currently contain
an auditable historical NOAA publication archive paired with the v7 daily trade
decisions, so historical Phase-2 performance is blocked.

## Frozen outcome labels

`BETTER`, `EQUAL`, and `WORSE` require a reproducible point-in-time comparison.
Without that evidence the result is `BLOCKED`, never a forced winner.
