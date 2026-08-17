# Capitalife Mobile Data Platform — Agent 3 Handoff

Branch: `feat/capitalife-mobile-data-platform`

## What Was Built

A typed, Vercel-safe backend layer for the Capitalife Mobile app.

### API Endpoints (`/api/mobile/`)

| Endpoint | Method | Returns |
|---|---|---|
| `/api/mobile/status` | GET | `MobileSystemHealth` — brain/supabase/mode |
| `/api/mobile/home` | GET | `MobileHomeSummary` — KPIs, track record |
| `/api/mobile/analytics` | GET | `MobileAnalyticsSummary` — WS + Invest metrics |
| `/api/mobile/brain/status` | GET | `MobileBrainStatus` — node/link count, graphify |
| `/api/mobile/brain/search` | GET / POST | `MobileBrainSearchResult` — full vault search |
| `/api/mobile/sentinel` | GET | `MobileSentinelStatus` — provider availability |
| `/api/mobile/execution` | GET | `MobileExecutionStatus` — always disabled |

### Type Contracts

All types are in `src/lib/mobile/types.ts`. Import directly:

```typescript
import type { MobileHomeSummary, MobileBrainSearchResult } from "@/lib/mobile/types";
```

### Client Helpers

`src/lib/mobile/client.ts` — safe for server and client components:

```typescript
import {
  getMobileHealth,
  getMobileHome,
  getMobileAnalytics,
  getMobileBrainStatus,
  searchMobileBrain,
  getMobileSentinelStatus,
} from "@/lib/mobile/client";
```

## Security Guarantees

- No Brain vault absolute paths exposed in any response
- No IBKR account IDs, broker credentials, or API keys in any response
- `/api/mobile/execution` always returns `{ available: false }` — no live orders
- Brain search returns only file paths relative to vault root (no absolute paths)
- All endpoints work on Vercel without `CAPITALIFE_BRAIN_PATH` set (graceful fallback)

## Mode Detection

- `isPublicPreview()` from `@/lib/server/app-mode` — true when `NEXT_PUBLIC_APP_MODE=public-preview`
- All endpoints include `mode: "public-preview" | "local-private"` so UI can adapt

## Brain Search (Updated)

`/api/brain-graph/search` (existing desktop route) and `/api/mobile/brain/search` both now use full recursive vault scan with 5-minute cache — replacing the old 5-file allowlist that caused search to return 0 results.

## What Mobile Pages Already Use

The existing mobile pages (`/m/home`, `/m/analytics`, `/m/sentinel`, etc.) already have correct data flows:
- **Home**: `getDashboardPageData()` from `dashboard-page-data-cloud.ts` — Vercel-safe
- **Analytics**: same + `getFSPortfolioSnapshot().catch(() => undefined)` — graceful fallback
- **Brain**: client-side fetch to `/api/brain-graph/status`
- **Sentinel**: `SentinelSessionProvider` — fully client-side

## Agent 3 Next Steps

1. Use `getMobileHome()` in `MobileHomeView` to refresh KPIs client-side (optional, server-rendered is fine)
2. Use `getMobileBrainStatus()` instead of `/api/brain-graph/status` in `MobileBrainView` for richer data
3. Use `searchMobileBrain(query)` in any mobile search UI
4. Use `getMobileHealth()` to show a "Brain unavailable" warning on Vercel
