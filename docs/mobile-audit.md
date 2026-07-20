# Mobile Readiness Audit — Capitalife Terminal
_Generated: 2026-07-20_

## Viewport Meta
| Status | Detail |
|---|---|
| ✅ Fixed | `export const viewport: Viewport` added to `src/app/layout.tsx` — `width=device-width, initialScale=1` |

---

## Responsive Breakpoints (Tailwind `sm:` / `md:` / `lg:`)

### ✅ Has breakpoints (13 files)
| File |
|---|
| `components/manager/manager-overview-dashboard.tsx` |
| `components/manager/sub-ib-system-dashboard.tsx` |
| `components/manager/investor-analytics-dashboard.tsx` |
| `components/analytics/analytics-dashboard.tsx` |
| `components/analytics/fsportfolio-live-core-panel.tsx` |
| `components/core-invest/CoreInvestVisualGrid.tsx` |
| `components/pages/SignalPage.tsx` |
| `components/dashboard/universal-kpi-strip.tsx` |
| `components/dashboard/chart-card.tsx` |
| `components/trades/trades-dashboard.tsx` |
| `components/risk/risk-dashboard.tsx` |
| `components/quant/quant-dashboard.tsx` |
| `components/ui/button.tsx` |

### ❌ No breakpoints (major files)
| File |
|---|
| All `src/app/*/page.tsx` route files |
| `components/pages/MonitoringPage.tsx` |
| `components/monitoring/*` (~20 components) |
| `components/dashboard/sidebar.tsx` |
| `components/dashboard/topbar.tsx` |
| `components/dashboard/fund-manager-home.tsx` |
| `components/dashboard/performance-year-table.tsx` |
| `components/sentinel/*` |
| `components/settings/SettingsPage.tsx` |
| `components/brain-graph/BrainGraphShell.tsx` |

---

## Fixed Pixel Widths (overflow risk on mobile)

| File | Issue | Overflow wrapper |
|---|---|---|
| `components/manager/investor-analytics-dashboard.tsx` | `min-w-[1360px]` table | ❌ None |
| `components/trades/trades-dashboard.tsx` | `min-w-[1040px]` table | ❌ None |
| `components/manager/sub-ib-system-dashboard.tsx` | `min-w-[980px]` + `min-w-[660px]` | ❌ None |
| `components/dashboard/performance-year-table.tsx` | `min-w-[720px]` table | ❌ None |
| `components/quant/quant-dashboard.tsx` | `min-w-[720px]` table | ✅ `overflow-x-auto` |
| `components/risk/risk-dashboard.tsx` | `min-w-[520px]` div | ✅ `overflow-x-auto` |
| `components/dashboard/topbar.tsx` | `min-w-[220px]` search, `w-[300px]` dropdown | ❌ None |

---

## Touch Event Support

| Event | Found |
|---|---|
| `onTouchStart` | ❌ Not found |
| `onTouchEnd` | ❌ Not found |
| `onTouchMove` | ❌ Not found |

**Mouse-only drag/resize components** (will silently fail on touch):
- `components/sentinel/SentinelFloatingWindow.tsx` — drag + resize
- `components/pages/MonitoringPage.tsx` — resizable panel
- `components/dashboard/sidebar.tsx` — hover expand

---

## Top 5 Worst Offenders

| Rank | File | Reason |
|---|---|---|
| 1 | `investor-analytics-dashboard.tsx` | `min-w-[1360px]` table, no scroll wrapper → forces 1360px body width |
| 2 | `trades-dashboard.tsx` | `min-w-[1040px]` table, no scroll wrapper |
| 3 | `sub-ib-system-dashboard.tsx` | `min-w-[980px]` + nested `min-w-[660px]`, no containment |
| 4 | `performance-year-table.tsx` | `min-w-[720px]`, zero responsive classes |
| 5 | `MonitoringPage.tsx` | No breakpoints, mouse-only resize panel, `@media` only in injected style string |

---

## Foundation Added (this session)

| Item | Status |
|---|---|
| Viewport meta | ✅ `src/app/layout.tsx` |
| Mobile route folder | ✅ `src/app/(mobile)/` |
| Mobile components folder | ✅ `src/components/mobile/` |
| Device detection hook | ✅ `src/hooks/useDevice.ts` — `isMobile`, `isTablet`, `isDesktop` |

---

## Recommended Next Steps (not yet done)

1. Wrap the 4 overflow tables in `overflow-x-auto` containers
2. Add `pointer-events: touch` / touch event handlers to `SentinelFloatingWindow` and sidebar
3. Create a `MobileLayout` in `src/app/(mobile)/layout.tsx`
4. Use `useDevice()` in `fund-manager-home.tsx` to switch between desktop and mobile shell
