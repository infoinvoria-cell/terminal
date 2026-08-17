# Sentinel Connect — Free Capacity Audit
Date: 2026-08-17

## IMPORTANT

This document reports ACTUAL configured providers and their documented limits.
No fabricated "millions of tokens" claims. Numbers are provider-documented free tier limits
that may change and must be verified against current account limits at runtime.

---

## Provider Matrix

| Provider | Key Env Var | Free Tier? | Quota Unit | Documented Limit | Notes |
|---|---|---|---|---|---|
| Groq | `GROQ_API_KEY` | YES | Tokens/day (model-dependent) | ~14,400 tokens/day (conservative) | Fast inference, model-specific |
| Cerebras | `CEREBRAS_API_KEY` | YES | Tokens/day | ~100k tokens/day (documented) | Fast large models |
| Gemini | `GEMINI_API_KEY` | YES | Requests/minute + tokens | 15 RPM, 1M TPM (Gemini 1.5 Flash) | Project-level limits |
| OpenRouter | `OPENROUTER_API_KEY` | YES (free models) | Requests/day | ~50 req/day free models | Very low, use as fallback only |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | YES | Neurons/day | 10,000 neurons/day | Different unit — not tokens |
| Mistral | `MISTRAL_API_KEY` | YES (trial) | Tokens/month | Limited trial | May require paid after trial |
| Cohere | `COHERE_API_KEY` | YES (trial) | Requests | 1000 req/month trial | Low capacity |
| HuggingFace | `HF_TOKEN` | YES (minimal) | Compute credits | Tiny monthly credit | Not main capacity |
| GitHub Models | `GITHUB_TOKEN` | YES (beta) | Requests/day | ~15 req/min | Varies by model |
| Anthropic | `ANTHROPIC_API_KEY` | NO | — | Paid only | Disabled by default |
| Ollama | Local | YES | — | Hardware-limited | Local, no quota |
| Local | In-process | YES | — | Hardware-limited | Last resort |

---

## Practical Daily Capacity Estimate

This is a ROUGH estimate of usable free capacity for normal Sentinel use.
Actual limits depend on your account configuration and provider policy at runtime.

| Scenario | Estimated Daily Capacity |
|---|---|
| Simple queries (local/trivial) | Unlimited (hardware only) |
| Normal queries (single provider) | ~50-100 requests |
| Complex queries (ensemble x2-3 providers) | ~15-30 ensemble runs |
| Deep queries (ensemble x4) | ~10-15 runs |

**Conservative estimate: 50-100 meaningful Sentinel conversations per day before free quotas become binding.**

This is genuine capacity — not marketed capacity.

---

## Quota Reserve Policy

- `QUOTA_RESERVE_RATIO = 0.20` — 20% kept as emergency reserve
- In `auto` mode: reserve enforced via scarcity ratio in provider scoring
- In `deep` mode: reserve bypassed (user explicitly requested more compute)
- 429 responses trigger circuit breaker: 1-min block → 5-min after 3x hits
- Retry-After headers from providers are respected where returned

---

## What Runs Completely Locally

| Capability | Local? |
|---|---|
| Privacy classification | Always local |
| Intent/complexity routing | Always local |
| Brain retrieval | Always local |
| Graphify code-graph lookup | Always local |
| Tool-first detection | Always local |
| LOCAL_ONLY routing mode | Always local |
| LOCAL_ONLY queries (trivial, private, tool-first) | Always local |
| ConnectRun provenance | Always local |
| Usage ledger | Always local |
| Ollama inference (when running) | Always local |

---

## What May Leave the Machine

| Content | When | Notes |
|---|---|---|
| Sanitized user queries | REMOTE_REDACTED or REMOTE_SAFE queries | Sensitive content stripped |
| Generic questions | REMOTE_SAFE queries | No Capitalife private content |
| Brain context pack (summary only) | Never — Brain context is injected server-side | Raw Vault never sent |

---

## What Never Leaves the Machine

- Raw Brain Vault documents
- Absolute local paths, account IDs, broker credentials
- API keys (server environment only, never in browser bundle)
- ConnectRun provenance records
- Provider usage ledger
- Any content classified LOCAL_ONLY
- Entire Brain Vault (even when Brain context is injected, only the summary/excerpt is used)

---

## Runtime Verification

To see current provider status and quota state:

```
GET /api/sentinel/connect/providers
GET /api/sentinel/connect/health
```

Never print API keys. Never log key values. Provider state shows only: configured, healthy, blocked, requestsToday.
