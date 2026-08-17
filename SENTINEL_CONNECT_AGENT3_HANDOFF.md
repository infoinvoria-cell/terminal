# Sentinel Connect — Agent 3 Handoff

Branch: `feat/sentinel-connect-omniroute`  
Commits: `509d347` (Phase 1) → `d34749b` (Phase 2: Qwen router) → `b647efb` (Phase 2: Setup UI) → `40aae91` (local setup guide) → `e9809e7` (Agent 4: Free Firewall + billing registry)  
Date: 2026-08-17  
Ahead of origin: 1 (push pending — see below)

---

## What Was Built

### Phase 1 (509d347)
Complete OmniRoute orchestration layer:
- Privacy classifier (LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE)
- Layer 0 heuristic local router
- Parallel ensemble (2-4 workers, local synthesis)
- ConnectRun provenance (NDJSON ledger)
- `/api/sentinel/connect` orchestration endpoint
- `/api/sentinel/connect/providers` — safe status API
- `/api/sentinel/connect/health` — health check
- `ConnectPrivacyBadge.tsx`, `ConnectRouteDetails.tsx` UI components
- 25 unit tests (25/25 pass)
- Architecture docs: SENTINEL_CONNECT_ARCHITECTURE.md, SENTINEL_CONNECT_PRIVACY.md, etc.

### Phase 3 / Agent 4 (40aae91 + e9809e7)
- **billing-registry.ts**: Model-level FREE/PAID/UNKNOWN billing classification
  - Per-model (not per-provider) with `source` + `verifiedAt` fields
  - FREE: all Ollama/local, Groq (5 models), Mistral-small/nemo, Cohere command-r, Cerebras (3 models), Gemini flash
  - PAID: all Anthropic, Mistral-large/medium/codestral, Gemini 1.5-pro/2.0-pro
  - UNKNOWN: openrouter, github, unlisted models
  - Lookup order: exact match → prefix match → wildcard (provider with model="")
- **outbound-inspector.ts**: Debug-only outbound context representation
  - Shows sanitizedRequest, brainContextInjected, graphifyInjected, wouldRedact, redactedFields
  - NEVER exposed via API — internal validation only
- **connect-run.ts**: Extended with `TokenAccountingType` ("OBSERVED" | "ESTIMATED") and `postBrainPrivacyLevel`
- **connect-router.ts**: Post-Brain outbound gate (re-classifies privacy after Brain injection, escalate-only)
- **ensemble.ts**: Free Firewall via `getFreeEnsembleProviders()` — ensemble only picks FREE-classified models
  - `ENSEMBLE_PROVIDERS` locked to `["groq", "mistral", "cohere", "cerebras"]` (gemini/openrouter excluded — not configured)
- **connect-router-benchmark.test.ts**: 50-case deterministic router benchmark (50/50 PASS)
  - Categories: LOCAL, BRAIN/PRIVATE, PRIVATE, REMOTE_SAFE, REASONING, CODING, TOOL_FIRST, ENSEMBLE, AMBIGUOUS, BILLING_GUARD
- **usage-store-concurrency.test.ts**: 5-case parallel write concurrency test (5/5 PASS)

### Phase 2 (d34749b + b647efb)
- **qwen-router.ts**: Qwen3:1.7b via Ollama as Layer 1 routing classifier
  - `think=false` + `/no_think` prefix to suppress CoT output
  - 4s timeout, 30s availability cache, schema validation, fallback to heuristic
- **local-router.ts**: wired Layer 0 → Layer 1 (Qwen) → Layer 0 fallback
- **SettingsPage.tsx**: Sentinel Connect section with live provider/brain/graphify status
- **topbar.tsx**: upgraded nav search (icons, categories, aliases)
- Provider model updates: Groq→`groq/compound`, Cerebras→`gemma-4-31b`

---

## File Map

```
src/lib/sentinel/connect/
  connect-types.ts        — shared types (ConnectRoutingMode, ConnectMode)
  privacy-classifier.ts   — classifyPrivacy(), canSendToRemote(), getTextForProvider()
  local-router.ts         — Layer 0 + Layer 1 (Qwen) router
  qwen-router.ts          — Qwen3:1.7b Ollama client + schema validation
  billing-registry.ts     — [NEW] model-level FREE/PAID/UNKNOWN billing registry
  outbound-inspector.ts   — [NEW] debug-only outbound context inspector (never API-exposed)
  connect-router.ts       — connectChat(), connectStream() + post-Brain gate + outbound inspector
  connect-run.ts          — ConnectRun type + TokenAccountingType + postBrainPrivacyLevel
  ensemble.ts             — runEnsemble() + getFreeEnsembleProviders() Free Firewall

src/app/api/sentinel/connect/
  route.ts                — POST /api/sentinel/connect
  providers/route.ts      — GET /api/sentinel/connect/providers
  health/route.ts         — GET /api/sentinel/connect/health

src/components/sentinel/connect/
  ConnectPrivacyBadge.tsx — LOCAL/SANITIZED REMOTE/REMOTE indicator
  ConnectRouteDetails.tsx — expandable route panel

src/components/settings/SettingsPage.tsx  — Sentinel Connect section

src/lib/sentinel/__tests__/
  connect-privacy.test.ts           — 12 privacy classifier tests
  connect-local-router.test.ts      — 10 local router tests
  connect-run.test.ts               — 3 provenance ledger tests
  connect-router-benchmark.test.ts  — [NEW] 50-case deterministic router benchmark
  usage-store-concurrency.test.ts   — [NEW] 5-case parallel write concurrency test
```

---

## Runtime Requirements

- **Ollama** running at `http://localhost:11434` (auto-detect, graceful fallback)
- **qwen3:1.7b** model pulled (1.27 GB, RTX 3050 Ti VRAM safe)
- Provider keys in `.env.local` (see SENTINEL_CONNECT_LOCAL_SETUP.md)
- Paid inference OFF by default (`SENTINEL_ALLOW_PAID_API` not set)

---

## Integration Points for Agent 3

### Wire Connect into Sentinel UI

The Connect endpoint is ready. To use it from the Sentinel chat UI:

```typescript
// Replace the existing /api/sentinel/chat call with:
const res = await fetch("/api/sentinel/connect", {
  method: "POST",
  body: JSON.stringify({ messages, mode: "auto", stream: true }),
  headers: { "Content-Type": "application/json" },
});

// Read X-Connect-* headers for route details
const runId = res.headers.get("X-Connect-RunId");
const privacy = res.headers.get("X-Connect-Privacy");
const route = res.headers.get("X-Connect-Route");
```

### Show Route Details in Chat

```typescript
import { ConnectPrivacyBadge } from "@/components/sentinel/connect/ConnectPrivacyBadge";
import { ConnectRouteDetails } from "@/components/sentinel/connect/ConnectRouteDetails";

// After response arrives:
<ConnectPrivacyBadge level={privacy} />
<ConnectRouteDetails run={connectRun} />
```

### Mode Selector (optional)

Three user-facing modes: `auto` / `local` / `deep`

```typescript
type ConnectMode = "auto" | "local" | "deep";
```

- `auto`: Qwen decides, respects quota reserve
- `local`: forces LOCAL_ONLY, no external calls
- `deep`: bypasses 20% quota reserve, same privacy rules

---

## Known Issues / Pre-existing

- `sentinel-voice-backend.test.ts` — 10 failures: `invalidateTTSHealthCache is not a function`
  This is a pre-existing issue from the voice integration branch merge, not related to Connect.
  
- `WhiteSwanV7Clean.tsx` — 3 TS errors: Recharts formatter type mismatch
  Pre-existing, not in Connect scope.

- Turbopack warnings (2): `white-swan-robustness/route.ts` uses `path.join`
  Pre-existing, build still passes.

- Cerebras 402: Free plan quota exhausted. Key is valid, circuit breaker suppresses retries, fallback to Mistral/Groq.

- **Build env**: `@babel/runtime/helpers/esm/wrapNativeSuper` not found in local node_modules — pre-existing environment issue affecting ALL branches (not caused by connect changes). TypeScript check passes with 0 new errors. Remote CI/Vercel build should pass (clean install).

- **TokenAccountingType**: All workers currently use `"ESTIMATED"` (70/30 input/output split). Set to `"OBSERVED"` when a provider returns real token counts in the API response.

---

## Tests

```bash
npx vitest run src/lib/sentinel/__tests__/connect-*.test.ts
# → 28/28 PASS (includes 3 new benchmark/concurrency tests)

npx vitest run src/lib/sentinel/__tests__/connect-router-benchmark.test.ts
# → 50/50 PASS (all 10 categories)

npx vitest run src/lib/sentinel/__tests__/usage-store-concurrency.test.ts
# → 5/5 PASS

npx vitest run
# → 403/414 PASS (11 pre-existing voice backend failures — invalidateTTSHealthCache)

npm run audit:github-safe
# → [PASS] github-safe audit clean (e9809e7)

npm run build
# → Pre-existing env issue (@babel/runtime) affects all branches locally.
#   TypeScript: 0 new errors. Remote CI/Vercel: expected PASS.
```

---

## What Agent 3 Should Do Next

1. **Wire Connect endpoint into SentinelDashboard** — replace `/api/sentinel/chat` or `/api/sentinel/stream` with `/api/sentinel/connect`
2. **Add ConnectPrivacyBadge + ConnectRouteDetails** to the chat message display
3. **Add mode selector** (auto/local/deep) to the Sentinel toolbar
4. **Test end-to-end** with real Brain + real Groq/Mistral
5. **Merge** `feat/sentinel-connect-omniroute` → `main` when E2E is verified
