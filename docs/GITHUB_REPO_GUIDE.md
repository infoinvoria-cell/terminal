# GitHub Repo Guide

## Repository Mode
- Use a private repository
- Do not push until local audit and build pass
- Do not add a remote without explicit owner approval

## Branching
- `main` should be protected
- Work in feature branches
- Use pull requests for review
- Avoid direct commits to protected main

## Partner Setup
1. Clone private repo
2. Copy `.env.example` to `.env.local`
3. Set local `CAPITALIFE_BRAIN_PATH`
4. Add optional provider keys only locally
5. Run `npm install`
6. Run `npm run audit:github-safe`
7. Run `npm run build`

## Privacy Check Before Push
- No `.env.local`
- No Brain vault files
- No `_ChatGPT_Handoff`
- No raw CSV/XLSX/ZIP/DB exports
- No screenshots with sensitive information
- No graph indexes with local path leakage

## Must Not Enter Repo
- Capitalife Brain raw vault
- Broker statements
- Trading raw data
- Local caches
- Graphify indexes
- Handoff bundles
- API keys and tokens
