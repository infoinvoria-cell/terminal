# Capitalife Fund Manager Dashboard

Private/internal research dashboard for Capitalife strategy monitoring, analytics and local AI tooling.

## Scope
- Research and monitoring only
- No live execution
- No broker connection
- No order routing
- No financial portfolio management by Capitalife GbR

## Setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment
- Set `CAPITALIFE_BRAIN_PATH` per machine in `.env.local`
- Do not commit `.env.local`
- App must also run without OpenAI/Anthropic keys
- Ollama is optional and local

## Providers
- Local/Ollama optional
- OpenAI optional with own key
- Claude/Anthropic optional with own key
- Missing keys must not crash the app

## Brain Integration
- Capitalife Brain remains Source of Truth
- Graphify is index, not truth
- Local Brain connection is configured via `CAPITALIFE_BRAIN_PATH`
- Partners must use their own local Brain/data paths

## Data Policy
- No raw Brain vault contents in this repo
- No broker statements
- No raw trading exports
- No private screenshots
- No API keys or tokens

## Security
- `.env.local` must never be committed
- Run `npm run audit:github-safe` before commit or push
- Review `.gitignore`, `SECURITY.md`, `docs/GITHUB_REPO_GUIDE.md` and `docs/DATA_PRIVACY.md`
