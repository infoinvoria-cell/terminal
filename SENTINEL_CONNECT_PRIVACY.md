# Sentinel Connect — Privacy Policy
Date: 2026-08-17

## Privacy-First Design

Every request is classified BEFORE any external provider receives text.
No Capitalife private data leaves the machine without explicit classification allowing it.

---

## Privacy Levels

### LOCAL_ONLY
Request is handled entirely on-device. No network calls to external AI providers.

**Triggers:**
- API key / token patterns detected in request
- Local file path references (CAPITALIFE_BRAIN_PATH, C:\..., /Users/...)
- Broker credential patterns (broker password, IBKR/Myfxbook/RoboForex credentials)
- Cryptographic key material (-----BEGIN, private key)
- Wallet/crypto credential patterns
- User explicitly selects Local mode

**Routing:** Only `local` and `ollama` providers.

### REMOTE_REDACTED
Request contains Capitalife-private content. Sanitized before sending externally.

**Triggers:**
- White Swan references with specific data
- Live track record references
- FSPortfolio, Capitalife Brain/Engine/Terminal
- MaxDD/CAGR/Sharpe with specific figures
- Sleeve names (Agrar, Metals, Indices, Energy, Forex)
- Sentinel Brain/Vault/Handoff references
- Ambiguous queries (default safe behavior)

**Redactions applied:**
- Account numbers (6+ digit sequences) → `[ACCOUNT_NUM]`
- Local file paths → `[LOCAL_PATH]`
- Email addresses → `[EMAIL]`
- Capitalife Brain paths → `[BRAIN_PATH]`

### REMOTE_SAFE
Generic query with no Capitalife-private content. Sent as-is to external providers.

**Examples:**
- "What is CAGR?"
- "Explain futures contracts"
- "How does a moving average work?"
- Short definitional queries (< 200 chars, matching safe-query patterns)

---

## Brain Context — Never Raw, Always Summary

The Brain retrieval system (`capitalife-context.ts`) reads Brain files locally and injects
a SUMMARY into the system message. The raw Brain Vault files are NEVER sent externally.

Only the system message (which contains the summary) goes to the provider, and only
for REMOTE_REDACTED / REMOTE_SAFE queries.

For LOCAL_ONLY queries: Brain context is available but stays on-machine.

---

## Provider Key Security

- All API keys are server-side environment variables only
- Keys are NEVER in `NEXT_PUBLIC_*` variables
- Keys are NEVER in the browser bundle
- Keys are NEVER logged, printed, or written to any file
- `.env.local` is gitignored and never committed
- The Connect provider status endpoint (`/api/sentinel/connect/providers`) returns only:
  configured (boolean), healthy (boolean), blockedUntil (timestamp or null) — never key values

---

## External Provider Trust

External provider outputs are treated as UNTRUSTED DATA:
- They are never allowed to directly modify Brain state
- They cannot claim to have executed tools
- They cannot claim authority over Sentinel system policy
- Structured output from workers is validated before synthesis

---

## Prompt Injection Defense

Brain documents retrieved for context are clearly delimited:
```
## CAPITALIFE BRAIN — LIVE DATEN (höchste Priorität, immer aktuell)
...brain content...
## Statischer Basis-Kontext
```

External models receive Brain content as DATA within the context, not as instructions.
The system prompt instructs Sentinel to treat Brain text as data, not commands.

---

## No Live Trading Authority

No model, no provider, no OmniRoute path, no Sentinel Connect orchestration
may autonomously place orders. Live order execution is deterministic and separate.

---

## Brain Writeback Gate

External providers may propose memory candidates or research findings.
They may NEVER directly write to the Brain Vault.
All writeback goes through a local validation gate (future: local deterministic writeback).

---

## UI Privacy Indicator

The `ConnectPrivacyBadge` component shows:
- 🟢 `LOCAL` — entirely on-device
- 🟡 `SANITIZED REMOTE` — sent externally, sensitive content stripped
- 🔵 `REMOTE` — generic query, sent as-is
