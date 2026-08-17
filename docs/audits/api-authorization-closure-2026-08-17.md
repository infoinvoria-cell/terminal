# CAPITALIFE SECURITY CLOSURE — FINAL

Date: 2026-08-17
Scope: local repository and localhost only. No deployment, push, broker connection, or production mutation.

## Result

- Routes audited: **155** `src/app/api/**/route.ts` handlers
- `PUBLIC_READ_ONLY`: 48
- `LOCAL_ONLY`: 16
- `AUTHENTICATED_READ`: 57
- `AUTHENTICATED_WRITE`: 0 path-level handlers (write methods are covered by the private/broker boundary)
- `INTERNAL_SERVICE`: 5
- `BROKER_SENSITIVE`: 2
- `PRIVATE_DATA_SENSITIVE`: 23
- `DEV_ONLY`: 4
- Unprotected sensitive routes before: **15 route entries**
- Unprotected sensitive routes after: **0 for non-loopback requests without the internal token**
- `LIVE_ORDER_AUTHORITY_EXPOSED`: **NO**
- `BRAIN/Vault_REMOTE_EXPOSURE`: **NO** through non-loopback requests without the internal token
- `LOCAL_FIRST_WORKFLOW`: **PASS**
- `SECURITY_POSTURE`: **PASS for the enforced local-only model**

## Boundary implemented

`src/proxy.ts` now applies one server-side API boundary to all `/api/:path*` requests. The classifier in `src/lib/server/api-authorization.ts` leaves only explicitly public read endpoints open. Private, internal, broker-sensitive, Sentinel, Brain, filesystem, portfolio, and execution routes require either:

- a loopback URL (`localhost`, `127.0.0.1`, or `::1`) for local development; or
- `Authorization: Bearer <CAPITALIFE_LOCAL_API_TOKEN>` / `x-capitalife-internal-token` when an explicit internal token is configured.

Dev process routes (`/api/auto-start`, `/api/start-services`, `/api/debug-home`, `/api/dev/*`) return `404` in production, Vercel, or when `CAPITALIFE_API_PRODUCTION_DISABLED=true`.

This preserves normal localhost workflows without creating a new login UI. `.env.example` contains only the empty token placeholder; no secret was added.

## Deterministic security tests

`src/lib/server/__tests__/api-authorization.test.ts` verifies:

- public read-only endpoint remains available;
- remote-like Brain request is rejected with `403`;
- localhost Sentinel request is allowed;
- configured internal token authorizes a non-loopback request;
- dev-only process route is unavailable in production;
- broker-sensitive classification remains separate.

Security boundary tests: **6/6 PASS**.

## Sentinel and order authority

The proxy runs before Sentinel/Connect handlers. Non-loopback unauthenticated callers cannot reach provider fanout, raw Brain context, local tools, or TTS. Existing Connect outbound privacy stripping remains unchanged.

No Next API route was found to invoke the direct IBKR transmit chain. `/api/monitoring/trade-execution` remains an intent-log facade and is still blocked by the existing trading safety defaults. No live-order test was run.

## Quant and TTS invariants

- `QUANT_LOGIC_CHANGED: NO`
- `PRODUCTION_TIMEOUT_CHANGED: NO`
- `TEST_TIMEOUT_ONLY: YES`
- TTS cache fix: **PASS** — the new export only resets health-cache state; it does not alter the audio cache, cross-request storage, or cache pruning.

## Regression

- Full tests: **77/77 files, 1,315/1,315 tests PASS**
- Build: **PASS**
- Security scan: **PASS**
- `git diff --check`: **PASS**
- Commit: `NONE`
- Push: `NO`
- Deploy: `NO`
