# Data Privacy

## Data Classification
- Public: README, sanitized source code, docs without secrets
- Internal: strategy logic, UI logic, adapters, non-sensitive configs
- Confidential: Brain content, raw data, exports, statements, API keys
- Restricted: personal data, broker/account information, sensitive screenshots

## Excluded From Repo
- Capitalife Brain vault raw files
- `_ChatGPT_Handoff`
- Trading raw data
- Broker statements
- Screenshots with sensitive information
- API keys and tokens
- Graphify output with local path leakage

## Principles
- Minimum necessary data only
- Sanitized demo data only when explicitly created for sharing
- No live execution or order workflows in shared repo
- Brain remains Source of Truth outside the partner repo
