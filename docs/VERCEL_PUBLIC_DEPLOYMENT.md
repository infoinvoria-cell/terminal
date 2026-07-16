# Vercel Public Deployment

## Goal
- public GitHub plus Vercel preview
- repo may become public only after audit and data scan remain clean
- preview stays research-only

## Vercel Import
1. Select the GitHub repository in Vercel
2. Framework: Next.js
3. Build Command: default Vercel setting or `npm run build`
4. Install Command: default Vercel setting or `npm install`
5. After env changes, trigger a fresh deployment

## Vercel Environment Variables
```env
NEXT_PUBLIC_APP_MODE=public-preview
NEXT_PUBLIC_RESEARCH_ONLY=true
SIMPLE_GATE_PASSWORD=inno
NEXT_PUBLIC_SIMPLE_GATE_PASSWORD=inno
CAPITALIFE_BRAIN_PATH=
INVORIA_BRIDGE_ENABLED=false
INVORIA_BRIDGE_MODE=readonly
SENTINEL_DEFAULT_PROVIDER=disabled
```

## Security
- do not set OpenAI or Anthropic keys for public preview
- do not upload Brain data
- do not upload broker data
- repo stays public-safe only if audit and sensitive-file scan remain clean
- simple gate is only a light internal barrier, not real security

## Domain
- custom domain later: `terminal.capitalife.de`

## Notes
- public repo means code is visible
- access word must not be presented as real security
- `.env.example` may contain placeholders or preview example values only
- `.env.local` remains local only
