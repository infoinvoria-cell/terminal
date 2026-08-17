# Sentinel Connect — Provider Matrix
Date: 2026-08-17

## Routing Capability Table

| Provider | Quality | Speed | Context | Tools | Struct Out | Streaming | Free | Privacy OK |
|---|---|---|---|---|---|---|---|---|
| Groq | 0.85 | ★★★★★ | 128k | YES | YES | YES | YES | REMOTE_REDACTED+ |
| Cerebras | 0.82 | ★★★★★ | 128k | NO | NO | YES | YES | REMOTE_REDACTED+ |
| Gemini | 0.90 | ★★★★ | 1M+ | YES | YES | YES | YES | REMOTE_REDACTED+ |
| Anthropic | 0.95 | ★★★ | 200k | YES | YES | YES | NO | REMOTE_REDACTED+ |
| Mistral | 0.75 | ★★★ | 32k | YES | YES | YES | LIMITED | REMOTE_REDACTED+ |
| Cohere | 0.78 | ★★★ | 128k | YES | YES | YES | LIMITED | REMOTE_REDACTED+ |
| OpenRouter | 0.70 | ★★★ | varies | YES | YES | YES | YES (low) | REMOTE_SAFE only |
| GitHub Models | 0.65 | ★★★ | 128k | YES | YES | YES | YES (beta) | REMOTE_REDACTED+ |
| Cloudflare | 0.50 | ★★★★ | 4k-32k | NO | NO | YES | YES | REMOTE_SAFE |
| HuggingFace | 0.45 | ★★ | varies | NO | NO | NO | YES (tiny) | REMOTE_SAFE |
| Ollama | 0.30 | ★★★ | model-dep | NO | NO | YES | ∞ local | LOCAL_ONLY |
| Local | 0.20 | ★★ | small | NO | NO | NO | ∞ local | LOCAL_ONLY |

## Role Assignment in Ensemble Mode

| Worker Count | Roles Assigned | Typical Providers |
|---|---|---|
| 2 (REASONER_PLUS_CRITIC) | analyst + critic | groq + cerebras |
| 3 (PARALLEL_ENSEMBLE auto) | analyst + skeptic + critic | groq + cerebras + gemini |
| 4 (PARALLEL_ENSEMBLE deep) | analyst + skeptic + critic + synthesizer | groq + cerebras + gemini + mistral |

Providers are selected from `ENSEMBLE_PROVIDERS` array in round-robin order.
Actual provider used depends on which are configured and healthy at runtime.

## Free Tier Priority Order (auto mode)

1. Groq — fast, good quality, daily token limit
2. Cerebras — very fast, larger daily limit
3. Gemini — long context, vision
4. Mistral — European-hosted, GDPR-friendly
5. Cohere — strong RAG
6. GitHub Models — good beta access
7. OpenRouter (free models) — low limit, last resort
8. Cloudflare — small context, limited capability
9. HuggingFace — tiny credit

## Ensemble Provider Selection Notes

- OpenRouter is NOT included in default ensemble workers (low request limits)
- HuggingFace is NOT included in ensemble workers (too slow, streaming not supported)
- Cloudflare is NOT included in ensemble workers (small context, limited capability)
- Anthropic is NOT included (paid only)

## Circuit Breaker States

| HTTP Code | Block Duration | Notes |
|---|---|---|
| 429 | 60s (→ 5min after 3x) | Rate limited — short backoff then retry |
| 402 | 24h | Payment required — likely quota exhausted |
| 401/403 | 1h | Auth error — check key |
| 5xx | 30s | Server error — brief backoff |
