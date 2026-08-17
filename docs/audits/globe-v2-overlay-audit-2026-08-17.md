# Globe V2 overlay audit — 2026-08-17

Scope: `/globe` only. The page remains local-only for this task; no Vercel or production deployment is part of the change.

## Control surface

The visible control registry is curated to active overlay keys. The obsolete `Locations` control is not exposed in the desktop registry. `Live Signale` is presented as `Signals` to avoid a mixed-language control label. `Physical Intel` is explicit and marked `REAL · SHADOW` only when the read-only API returns a snapshot; otherwise it shows `UNAVAILABLE`.

## Satellite policy

Satellite mode is a minimal operational view:

- base imagery and provider attribution remain visible;
- static ports, airports, and military bases are disabled;
- only the selected asset marker, critical/high events, active ships, active routes, and enabled Physical-Intel bounding regions are passed through;
- route and Physical-Intel GeoJSON sources are removed when their inputs become empty, preventing stale layers after mode/overlay changes;
- the physical layer is an observation region from the source bounding box, not a fabricated production point.

## Label and animation checks

Globe labels use priority ordering (selected asset, critical event, Physical Intel, other events, regions, clusters, endpoints, ships) and greedy geographic collision suppression. Satellite mode further restricts labels to the minimal policy above. Connection arcs retain a bounded dash animation; no live-order or quant authority is connected to the Globe UI.

## Data status

Provider, endpoint, freshness, auth, cost, fallback, and status are recorded in [globe-v2-data-source-registry-2026-08-17.json](./globe-v2-data-source-registry-2026-08-17.json). Optional provider failure is fail-closed and renders an unavailable/empty layer state.

## Boundary

No Core Invest, Sentinel, White Swan UI, or quant logic was changed as part of the Globe V2 implementation. The existing White Swan Physical Intelligence V2 dependency remains shadow-only with `positionMultiplier: 1`.
