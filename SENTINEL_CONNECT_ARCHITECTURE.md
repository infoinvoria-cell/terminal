# Sentinel Connect — Architecture
Date: 2026-08-17

## Overview

Sentinel Connect is an orchestration layer that sits above the existing multi-provider router,
adding privacy classification, Brain-first retrieval, parallel ensemble reasoning, and
ConnectRun provenance tracking to Sentinel chat.

The user still interacts with one Sentinel. Providers are infrastructure.

---

## Data Flow

```
USER PROMPT
     │
     ▼
SENTINEL CHAT (existing chat API / /api/sentinel/connect)
     │
     ▼
PRIVACY CLASSIFIER  (privacy-classifier.ts)
  LOCAL_ONLY | REMOTE_REDACTED | REMOTE_SAFE
     │
     ▼
LOCAL ROUTER  (local-router.ts)
  intent | complexity | requiresBrain | requiresGraphify | suggestedMode
     │
     ▼
BRAIN RETRIEVAL  (capitalife-context.ts — Brain files, 30s TTL)
  ALWAYS before external LLMs for Capitalife questions
     │
     ▼
GRAPHIFY RETRIEVAL  (graphify-retrieval.ts — code graph, optional)
     │
     ▼
ROUTING DECISION
  ├── LOCAL_ONLY        → privacy_local profile → local/ollama only
  ├── FASTEST_FREE      → auto_balanced → fastest configured free provider
  ├── SINGLE_BEST       → auto_balanced → highest-scored free provider
  ├── REASONER_PLUS_CRITIC → analyst + critic, local synthesis
  ├── PARALLEL_ENSEMBLE → 3-4 workers (analyst/skeptic/critic), local synthesis
  └── FALLBACK_CHAIN    → auto fallback to local on failure
     │
     ▼
PROVIDER WORKERS  (existing provider-router.ts — 13 providers)
  Privacy boundary: REMOTE_REDACTED text is sanitized before dispatch
     │
     ▼
CONSENSUS / LOCAL SYNTHESIS  (ensemble.ts)
  agreements | disagreements | critical points
     │
     ▼
SENTINEL ANSWER  (one voice — not "Model A says / Model B says")
     │
     ▼
CONNECTRUN PERSISTED  (.runtime/sentinel/connect-runs/*.ndjson)
```

---

## Key Modules

| Module | Path | Purpose |
|---|---|---|
| Privacy Classifier | `src/lib/sentinel/connect/privacy-classifier.ts` | LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE |
| Local Router | `src/lib/sentinel/connect/local-router.ts` | Intent, complexity, mode selection |
| Ensemble | `src/lib/sentinel/connect/ensemble.ts` | Parallel workers + consensus |
| Connect Router | `src/lib/sentinel/connect/connect-router.ts` | Main orchestration |
| Connect Run | `src/lib/sentinel/connect/connect-run.ts` | Provenance NDJSON ledger |
| Connect Types | `src/lib/sentinel/connect/connect-types.ts` | Shared types (no circular deps) |
| Connect API | `src/app/api/sentinel/connect/route.ts` | POST endpoint |
| Connect Providers | `src/app/api/sentinel/connect/providers/route.ts` | Provider status |
| Connect Health | `src/app/api/sentinel/connect/health/route.ts` | System health |
| Privacy Badge | `src/components/sentinel/connect/ConnectPrivacyBadge.tsx` | UI: LOCAL / SANITIZED REMOTE |
| Route Details | `src/components/sentinel/connect/ConnectRouteDetails.tsx` | UI: expandable route panel |

---

## Routing Modes

| Mode | When Used | Providers | Notes |
|---|---|---|---|
| `LOCAL_ONLY` | Private content, trivial queries, tool-first, force-local | local/ollama | Never leaves machine |
| `FASTEST_FREE` | Simple generic queries | Best available free | Single provider, low latency |
| `SINGLE_BEST` | Normal queries | Scored best free provider | Fallback chain built in |
| `REASONER_PLUS_CRITIC` | Complex queries | 2 workers: analyst + critic | Local synthesis |
| `PARALLEL_ENSEMBLE` | Deep/difficult queries | 3-4 workers | Local synthesis, deep mode uses 4 |
| `FALLBACK_CHAIN` | Any failure | Local/privacy_local | Graceful degradation |

---

## Privacy Boundary

```
LOCAL_ONLY         — text stays on machine, no network calls to external providers
REMOTE_REDACTED    — sensitive content stripped/replaced before dispatch:
                     local paths → [LOCAL_PATH]
                     email       → [EMAIL]
                     account IDs → [ACCOUNT_NUM]
                     brain paths → [BRAIN_PATH]
REMOTE_SAFE        — generic queries sent as-is
```

Raw Brain Vault content is NEVER sent to external providers.
External providers receive only sanitized context packs.

---

## Brain Integration

1. `requiresBrain` detected by Local Router (White Swan, track record, portfolio, strategy queries)
2. `getCapalifeContextBudgeted(3000 tokens)` called before any provider
3. Brain context injected into system message
4. Brain file sources tracked in ConnectRun
5. 30-second TTL cache prevents re-reading on every request

---

## Graphify Integration

- `requiresGraphify` detected for code-structure questions ("where is X in the codebase?")
- `getGraphContext(query, 1000 tokens)` injected into user message
- Non-blocking: Graphify unavailable → continues without it
- Graphify is code index only, not canonical data

---

## GraphQL Decision

**NOT implemented.** Graphify provides graph querying via `queryGraph()` (TypeScript function).
Adding GraphQL + GraphiQL would add complexity without benefit for the local-first use case.
Decision: use `queryGraph()` directly, expose no unauthenticated graph explorer.

---

## Consensus / Local Synthesis

Workers receive role suffixes (analyst / skeptic / critic / synthesizer).
Synthesis is local-heuristic:
1. Longest successful answer is the primary
2. Critic/skeptic sentences containing risk/error keywords are extracted
3. Critical points appended as a separate section
4. User sees ONE Sentinel answer, not raw worker outputs

Disagreements are extracted by comparing numeric figures and role tone patterns.

---

## Quota Reserve

`QUOTA_RESERVE_RATIO = 0.20` — 20% of free capacity kept as emergency reserve.
In `auto` mode this reserve is respected.
In `deep` mode the reserve is bypassed (explicit user intent for more compute).

---

## ConnectRun Provenance

Each orchestrated request creates a `ConnectRun` record:
- ID, timestamp, request preview (first 80 chars only)
- Privacy level, route, Brain sources, Graphify hit
- Worker records (provider, role, model, latency, success)
- Synthesis provider
- Token estimates
- Status (success / partial / failed / fallback)

Stored as NDJSON in `.runtime/sentinel/connect-runs/runs-YYYY-MM-DD.ndjson`.
Rotated at 5 MB. Kept 7 days. Never stored to git.

---

## Local Router

Heuristic-based (no LLM required for routing decisions):
- Complexity detection via regex patterns (trivial < 8 words, simple, normal, complex, deep)
- Brain requirement via Capitalife-specific term patterns
- Tool-first detection via existing `detectToolFirstOpportunity()`
- Task classification via existing `classifyTask()`
- Graphify requirement for code-structure questions

When Ollama is running with a Qwen model, the local router can be upgraded to
use it for borderline classification (future enhancement — infrastructure exists via ollama provider).

---

## What Never Leaves the Machine

- Raw Brain Vault documents
- Absolute local paths
- Account IDs / broker credentials
- API keys
- ConnectRun provenance records
- Provider usage ledger
