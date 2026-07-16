# Public Vercel Preview

## Goal
- simple public Vercel preview path
- repo may become public later only if audit and data scan stay clean
- preview remains research-only

## Password Gate
- internal preview access word: `inno`
- maximum 3 failed attempts
- browser-local lockout after 3 failures
- this is not professional authentication
- prefer `SIMPLE_GATE_PASSWORD` in Vercel env over relying on fallback
- `.env.example` contains preview-safe placeholders only
- `.env.local` stays local and must never be committed
- Jeroen enters the final preview password in Vercel Environment Variables

## Vercel Setup
1. Make the GitHub repo public later only after audit is clean, or connect Vercel to the private repo
2. Import the project in Vercel
3. Framework: Next.js
4. Set env vars:

```env
NEXT_PUBLIC_APP_MODE=public-preview
NEXT_PUBLIC_RESEARCH_ONLY=true
SIMPLE_GATE_PASSWORD=inno
NEXT_PUBLIC_SIMPLE_GATE_PASSWORD=inno
INVORIA_BRIDGE_ENABLED=false
INVORIA_BRIDGE_MODE=readonly
SENTINEL_DEFAULT_PROVIDER=disabled
CAPITALIFE_BRAIN_PATH=
```

5. Deploy

## Custom Domain
- planned later: `terminal.capitalife.de`

## Limits
- no local Brain access in cloud
- no live execution
- no broker data
- preview and research only
