# Existing OmniRoute Audit — Sentinel Connect Mission
Date: 2026-08-17

## Summary

**TWO relevant implementations found.** Neither is a duplicate; they serve different roles.

---

## 1. OmniRoute (Standalone Gateway)

**STATUS: FOUND**

| Property | Value |
|---|---|
| Path | `C:\Users\joris\Documents\Capitalife Engine\OmniRoute\` |
| Project | `diegosouzapw/OmniRoute` (open source, cloned locally) |
| Type | Full Next.js app + local proxy server |
| Scale | 100+ source files, Docker, Electron, CI |

### Architecture
- 290+ providers, 90+ free tiers, aggregated ~1.53B free tokens/month (marketing claim)
- 19 routing strategies
- RTK + "Caveman" stacked context compression
- Designed as an OpenAI-compatible proxy for Claude Code, Codex, Cursor, Copilot, etc.
- Runs as a standalone localhost service

### Reusability for Sentinel Connect
**NOT directly reusable as a library.** It is a deployable service, not an importable module.

**Can be used as:**
- Architecture reference (19 routing strategies is good research)
- Potential future proxy endpoint if Sentinel Connect needs to offload to a separate process

**Not used for:**
- The Sentinel Connect implementation uses the existing Capitalife-native router (see below)

---

## 2. Capitalife Sentinel Router (Native — IN THIS PROJECT)

**STATUS: FOUND — PRIMARY REUSE TARGET**

| Property | Value |
|---|---|
| Path | `src/lib/sentinel/` (this repo) |
| Type | TypeScript library, integrated in Next.js app |
| Scale | 50+ files, 13 provider adapters |

### Architecture

```
sentinel-router.ts (facade)
  └── providers/provider-router.ts (core engine)
       ├── 13 provider adapters (groq, cerebras, gemini, anthropic, ...)
       ├── routing/task-classifier.ts (task classification)
       ├── routing/tool-first-detector.ts (tool-first detection)
       ├── store/usage-store.ts (file-based usage + circuit breakers)
       ├── policy/free-policy.ts (free firewall enforcement)
       ├── catalog/model-catalog.ts (model capability metadata)
       ├── capitalife-context.ts (Brain context injection, 30s TTL)
       ├── graphify-retrieval.ts (Graphify code-graph queries)
       └── context/conversation-compactor.ts (conversation compaction)
```

### Providers Configured
| Provider | Quality Weight | Free Tier | Notes |
|---|---|---|---|
| Anthropic | 0.95 | NO | Paid only, gated behind `allowPaidApi` |
| Gemini | 0.90 | YES | Free tier, vision, long context |
| Groq | 0.85 | YES | Fast inference, daily token limit |
| Cerebras | 0.82 | YES | Fast large models |
| Cohere | 0.78 | YES | Good RAG/tool use |
| Mistral | 0.75 | YES | REST API |
| OpenRouter | 0.70 | YES | Low free request limit |
| GitHub Models | 0.65 | YES | OpenAI-compatible |
| Custom | 0.60 | Configurable | Custom endpoint |
| Cloudflare | 0.50 | YES | Neuron budget |
| HuggingFace | 0.45 | Minimal | Small credit |
| Ollama | 0.30 | YES (local) | Local HTTP, privacy |
| Local | 0.20 | YES (local) | In-process fallback |

### Key Routing Logic
- Scored provider ordering (quality × quota × task-fit × profile bonus)
- 6 routing profiles: `auto_balanced`, `maximum_quality`, `maximum_context`, `maximum_output`, `aggressive_free_usage`, `privacy_local`
- Free Firewall: no paid model unless explicitly allowed
- Quota scarcity ratio: maps daily token/request usage to routing score penalty
- Circuit breakers via `recordHttpError`: 429 → 1-min block (→ 5-min after 3x), 5xx → 30s block, 402 → 24h block, 401/403 → 1h block
- Task classifier routes coding/reasoning/vision to capable models

### Brain Integration (existing)
- `capitalife-context.ts`: reads Brain files, injects as system context (30s TTL)
- Brain files: AI_PROJECT_BRAIN_CURRENT.md, dashboard_snapshot.json, Open Issues, Next Actions, Changelog, Live Track Record
- Fallback: static hardcoded context when Brain unavailable
- `graphify-retrieval.ts`: queries local code-graph (graphify-out/graph.json)

### What Already Exists
- ✅ 13 provider adapters
- ✅ Provider scoring and fallback chains
- ✅ Free Firewall enforcement
- ✅ Circuit breakers (429 / 5xx / 402 / auth errors)
- ✅ Quota ledger (file-based JSON in `.runtime/sentinel/provider-usage.json`)
- ✅ Brain context injection
- ✅ Graphify retrieval
- ✅ Task classifier
- ✅ Tool-first detection
- ✅ Conversation compaction

### What Is Missing for Sentinel Connect Spec
- ❌ Privacy classifier (LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE)
- ❌ Parallel ensemble mode (PARALLEL_ENSEMBLE)
- ❌ Critic/consensus stage (REASONER_PLUS_CRITIC)
- ❌ Local synthesis stage
- ❌ ConnectRun provenance object
- ❌ `/api/sentinel/connect` orchestration endpoint
- ❌ Route details UI panel
- ❌ Privacy indicator in UI
- ❌ Quota reserve (20% hold-back concept)
- ❌ Documentation: SENTINEL_CONNECT_*.md

---

## Decision

**REUSE the native Capitalife Sentinel Router as the foundation.**

Sentinel Connect is built **on top of** the existing `src/lib/sentinel/` layer, not replacing it.

The OmniRoute gateway is kept as a reference and potential future proxy option.

**GraphQL**: Not needed. Graphify already provides graph querying via `queryGraph()`. Adding GraphQL would add complexity without value. GraphiQL is therefore NOT implemented — decision documented per spec point 10.
