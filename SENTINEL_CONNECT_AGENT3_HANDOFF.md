# Sentinel Connect — Agent 3 Handoff

Branch: `feat/sentinel-connect-omniroute`  
Commits: `509d347` → `d34749b` → `b647efb` → `40aae91` → `e9809e7` → `a3ce79e` → `abea54a` → `7e8c0f0`  
Date: 2026-08-17  
Ahead of origin: 4 commits (push blocked by env policy — see sentinel-connect-final.bundle)

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

### Phase 2 (d34749b + b647efb)
- **qwen-router.ts**: Qwen3:1.7b via Ollama as Layer 1 routing classifier
  - `think=false` + `/no_think` prefix to suppress CoT output
  - 4s timeout, 30s availability cache, schema validation, fallback to heuristic
- **local-router.ts**: wired Layer 0 → Layer 1 (Qwen) → Layer 0 fallback
- **SettingsPage.tsx**: Sentinel Connect section with live provider/brain/graphify status
- Provider model updates: Groq→`groq/compound`, Cerebras→`gemma-4-31b`

### Phase 3 / Agent 4 (e9809e7 + a3ce79e)
- **billing-registry.ts**: Model-level FREE/PAID/UNKNOWN billing classification
  - Per-model with `source` + `verifiedAt` fields
  - FREE: all Ollama/local, Groq (5 models), Mistral-small/nemo, Cohere command-r, Cerebras (3 models)
  - PAID: all Anthropic, Mistral-large/medium/codestral
  - UNKNOWN: openrouter, github, unlisted models
- **outbound-inspector.ts**: Debug-only outbound context — NEVER exposed via API
- **connect-run.ts**: Extended with `TokenAccountingType` ("OBSERVED" | "ESTIMATED") and `postBrainPrivacyLevel`
- **connect-router.ts**: Post-Brain outbound gate (re-classifies privacy after Brain injection, escalate-only)
- **ensemble.ts**: Free Firewall via `getFreeEnsembleProviders()` — only FREE-classified models
  - `ENSEMBLE_PROVIDERS` locked to `["groq", "mistral", "cohere", "cerebras"]`
- **usage-store-concurrency.test.ts**: 5-case parallel write concurrency test (5/5 PASS)

### Agent 4 Final Closure (7e8c0f0)
**Privacy Path Defect Fix** — the critical correctness issue:
- `privacy-classifier.ts`: Added 4 LOCAL_ONLY_PATTERNS for filesystem paths:
  - Windows absolute: `/[A-Za-z]:[/\\][\w/\\. -]{4,}/`
  - Unix absolute: `/\/(?:home|Users|root|var|etc|private|opt)\/[\w/\\. -]{3,}/`
  - UNC network: `/\\\\[\w.-]{2,}\\[\w/\\. -]{3,}/`
  - Relative private: `/\.\/(?:private|accounts?|credentials?|secrets?|vault|data)[/\\][\w/\\. -]*/i`
  - No `g` flag — `.test()` in a loop must not share `lastIndex` state across calls
- **connect-router-benchmark.test.ts**: Extended 50→55 cases
  - New describe block: "PATH ACCEPTANCE — local filesystem paths always LOCAL_ONLY (5 cases)"
  - Cases 51-55: Windows, Windows private, Unix, relative private, UNC
  - Case 50: upgraded from conditional check to strict `LOCAL_ONLY` assertion
  - **55/55 PASS**

---

## Real E2E Results (Agent 4 Closure)

### E2E via HTTP (previous session)
| Test | HTTP | Route | Privacy | Provider | Latency |
|------|------|-------|---------|----------|---------|
| Single-remote CAGR | 200 | FASTEST_FREE | REMOTE_REDACTED | cohere/command-r7b-12-2024 | 13871ms |
| Ensemble (Sharpe vs Sortino) | 200 | PARALLEL_ENSEMBLE | REMOTE_REDACTED | groq+mistral+cohere+cerebras | ~16000ms |
| Offline/local (CAGR) | 200 | LOCAL_ONLY | LOCAL_ONLY | local/qwen3:1.7b | 15295ms |
| Brain route (White Swan) | 200 | LOCAL_ONLY | REMOTE_REDACTED | local/qwen3:1.7b | 17833ms |

### E2E via direct function call (final session)
| Test | Route | Provider | Workers | Latency |
|------|-------|----------|---------|---------|
| REASONER+CRITIC (risk analysis) | REASONER_PLUS_CRITIC | groq/gpt-oss-120b + mistral/mistral-small-latest | analyst(SUCCESS,3187ms) + critic(SUCCESS,12215ms) | 12277ms |
| Brain route (White Swan arch) | REASONER_PLUS_CRITIC | groq+mistral | ensemble | 4331ms |
| Graphify route ("Which modules...") | REASONER_PLUS_CRITIC | groq+mistral | ensemble | 3329ms |
| Ensemble fallback (correlation) | FASTEST_FREE | cohere | 1 (cerebras/groq failed) | 11158ms |

### Graphify status
`GraphifyUsed: false` — the query "Which modules connect Sentinel to Brain?" was not classified as requiring Graphify by the Layer 1 Qwen router. The Graphify code path is wired (`getGraphContext()` in connect-router.ts line 104) and works when `decision.requiresGraphify = true`. This requires tuning the Qwen router prompt to recognize code-topology questions.

---

## Free Firewall — Confirmed
| Provider | Model | Billing | isFree |
|----------|-------|---------|--------|
| groq | groq/compound | FREE | true |
| mistral | mistral-small-latest | FREE | true |
| cohere | command-r-plus-08-2024 | FREE | true |
| cerebras | gemma-4-31b | FREE | true |
| anthropic | claude-3-5-sonnet-20241022 | PAID | false |
| mistral | mistral-large-latest | PAID | false |

0 PAID / 0 UNKNOWN in AUTO mode. Cerebras fast-fails with 402 (quota exhausted, ~414ms), circuit breaker suppresses retries.

---

## Outbound Privacy — Confirmed
Brain route outbound inspection:
- `privacyLevel: REMOTE_REDACTED`
- `wouldBlock: false`
- `wouldRedact: false`
- `redactedFields: []`
- `localPathAbsent: true` — no raw CAPITALIFE_BRAIN_PATH in sanitized output

---

## Token Accounting
All workers currently: `tokenAccounting: "ESTIMATED"` (70/30 input/output split).
Set to `"OBSERVED"` when provider returns real token counts in the API response (Cohere already returns `inputTokens`/`outputTokens` in the worker record).

---

## Live Order Authority Audit
Grep of ALL connect source files for `submit|buy|sell|cancel|modify|order|broker|execution`:
**ZERO matches.** Connect authority = read-only analysis only.

---

## Build Status
- **TypeScript**: 0 new errors in connect scope
- **Vitest**: 55/55 benchmark, 5/5 concurrency — connect tests pass
- **Audit**: `[PASS] github-safe audit clean`
- **Full build**: ENVIRONMENT_BLOCKED — pre-existing `@babel/runtime` Turbopack junction issue affects all branches locally. TypeScript passes. Remote CI/Vercel expected PASS.

---

## File Map

```
src/lib/sentinel/connect/
  connect-types.ts        — shared types (ConnectRoutingMode, ConnectMode)
  privacy-classifier.ts   — classifyPrivacy(), canSendToRemote(), getTextForProvider()
                            [4 LOCAL_ONLY filesystem path patterns added in 7e8c0f0]
  local-router.ts         — Layer 0 + Layer 1 (Qwen) router
  qwen-router.ts          — Qwen3:1.7b Ollama client + schema validation
  billing-registry.ts     — model-level FREE/PAID/UNKNOWN billing registry
  outbound-inspector.ts   — debug-only outbound context inspector (never API-exposed)
  connect-router.ts       — connectChat(), connectStream() + post-Brain gate
  connect-run.ts          — ConnectRun type + TokenAccountingType + postBrainPrivacyLevel
  ensemble.ts             — runEnsemble() + getFreeEnsembleProviders() Free Firewall

src/app/api/sentinel/connect/
  route.ts                — POST /api/sentinel/connect
  providers/route.ts      — GET /api/sentinel/connect/providers
  health/route.ts         — GET /api/sentinel/connect/health

src/components/sentinel/connect/
  ConnectPrivacyBadge.tsx — LOCAL/SANITIZED REMOTE/REMOTE indicator
  ConnectRouteDetails.tsx — expandable route panel

src/lib/sentinel/__tests__/
  connect-privacy.test.ts           — 12 privacy classifier tests
  connect-local-router.test.ts      — 10 local router tests
  connect-run.test.ts               — 3 provenance ledger tests
  connect-router-benchmark.test.ts  — 55-case deterministic router benchmark [55/55 PASS]
  usage-store-concurrency.test.ts   — 5-case parallel write concurrency test [5/5 PASS]
```

---

## Runtime Requirements

- **Ollama** running at `http://localhost:11434` (auto-detect, graceful fallback)
- **qwen3:1.7b** model pulled (1.27 GB, RTX 3050 Ti VRAM safe)
- Provider keys in `.env.local`
- Paid inference OFF by default (`SENTINEL_ALLOW_PAID_API` not set)

---

## Known Issues / Pre-existing

- `sentinel-voice-backend.test.ts` — 10 failures: `invalidateTTSHealthCache is not a function`
  Pre-existing from voice integration merge, not Connect-related.
  
- Build env: `@babel/runtime` Turbopack junction issue — affects all branches locally.

- Cerebras 402: Free plan quota exhausted. Circuit breaker active, fallback works.

- **Graphify trigger**: Qwen router does not currently return `requiresGraphify: true` for code-topology questions. Wiring is correct — needs Qwen prompt tuning.

---

## Tests

```bash
npx vitest run src/lib/sentinel/__tests__/connect-router-benchmark.test.ts
# → 55/55 PASS (10 categories + PATH ACCEPTANCE block)

npx vitest run src/lib/sentinel/__tests__/usage-store-concurrency.test.ts
# → 5/5 PASS

npm run audit:github-safe
# → [PASS] github-safe audit clean

npm run build
# → ENVIRONMENT_BLOCKED (pre-existing @babel/runtime Turbopack issue)
# → TypeScript: 0 new errors in connect scope
```

---

## What Agent 3 Should Do Next

1. **Wire Connect endpoint into SentinelDashboard** — replace `/api/sentinel/chat` or `/api/sentinel/stream` with `/api/sentinel/connect`
2. **Add ConnectPrivacyBadge + ConnectRouteDetails** to the chat message display
3. **Add mode selector** (auto/local/deep) to the Sentinel toolbar
4. **Push the branch**: `git push -u origin feat/sentinel-connect-omniroute` (4 commits ahead, or use sentinel-connect-final.bundle)
5. **Tune Qwen router** for Graphify trigger: code-topology questions should set `requiresGraphify: true`
6. **Merge** `feat/sentinel-connect-omniroute` → `main` when E2E verified
