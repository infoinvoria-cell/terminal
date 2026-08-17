# White Swan Physical Intelligence V1 — Production Status

Status: `SHADOW_ONLY — V2`

- Corn: `REAL`, USDA NASS free source, cached six hours, stale after 14 days.
- Soy: `REAL`, USDA NASS free source, cached six hours, stale after 14 days.
- Corn satellite: `REAL`, NOAA STAR Blended VHP/VHI, 8-state production-area aggregate, no account/key.
- Soy satellite: `REAL`, NOAA STAR Blended VHP/VHI, 8-state production-area aggregate, no account/key.
- Wheat satellite: `REAL`, NOAA STAR Blended VHP/VHI, 5-state Plains aggregate, attached to `zw_mzw`.
- Crude: `BLOCKED`, no authenticated AIS/maritime source configured.
- Canonical trading: unchanged; `positionMultiplier=1.0`.
- API: read-only `/api/white-swan/physical-intelligence`.
- No client API key and no filesystem path is exposed.
- No write route, live order route, portfolio mutation or deployment exists.
- Current V1 operating data cost: €0/month; infrastructure cost not separately metered.
- Optional premium upgrade: possible, not required.
- Satellite comparison is same crop, same NOAA week, current year versus prior year; it is an observation score only.
