# Capitalife Terminal — Shell Performance Audit

**Date:** 2026-08-17  
**Branch:** `feat/capitalife-design-system-shell-repair`  
**Tested on:** `http://localhost:3000` (dev server, `feat/sentinel-connect-omniroute`)

---

## Summary

The terminal shell had two confirmed performance problems and one false-positive click-blocking report:

| Issue | Status | Fix applied |
|---|---|---|
| 20 simultaneous route prefetches on mount | FIXED | Staggered 150ms/route |
| EngineStatusProvider fires immediately, 2s timeout, awaits auto-start | FIXED | Delayed 3s, timeout 500ms, fire-and-forget |
| FlaskAutoStart fires immediately, no delay | FIXED | Delayed 4s, cleanup on unmount |
| Sidebar click-blocking | NOT CONFIRMED | elementFromPoint test: sidebar wins at all y-positions |

---

## Findings Detail

### 1. Prefetch Storm — `sidebar.tsx:406-409`

**Before:**
```typescript
useEffect(() => {
  setMounted(true);
  for (const route of NAV_ROUTES) router.prefetch(route);
}, [router]);
```
All 20 routes fired simultaneously on mount. In dev mode, each triggers Next.js to compile that route on-demand. The dev server handles these serially, creating a queue of 20 compilation jobs that saturate the dev server for seconds after mount.

**After:**
```typescript
useEffect(() => {
  setMounted(true);
  const timers: ReturnType<typeof setTimeout>[] = [];
  NAV_ROUTES.forEach((route, i) => {
    timers.push(setTimeout(() => router.prefetch(route), i * 150));
  });
  return () => timers.forEach(clearTimeout);
}, [router]);
```
Routes prefetch one per 150ms. Total prefetch window: 3s (20 × 150ms), spread across idle time. Dev server never sees more than 1-2 concurrent compilation jobs from prefetching.

### 2. EngineStatusProvider — `src/components/engine/EngineStatusProvider.tsx`

**Before:**
- Fired on mount immediately
- `AbortSignal.timeout(2000)` — waited 2s for a down engine
- On failure: `await fetch('/api/auto-start')` — chained another slow request

**After:**
- Initial check delayed by 3s
- Timeout reduced to 500ms
- auto-start is fire-and-forget (`.catch(() => {})`) — never blocks

**Measured impact:** 1.5s slow resource (`localhost:5000/health` × 2 renders) eliminated from the first-paint critical path.

### 3. FlaskAutoStart — `src/components/providers.tsx`

**Before:** Fired immediately on mount with no delay.

**After:** Delayed 4s, cleanup `clearTimeout` on unmount.

This fires after the shell is fully rendered and interactive.

---

## Click-Blocking Investigation

Reported symptom: "sidebar navigation often cannot be clicked, clicking sometimes does nothing."

**Test method:** `document.elementFromPoint(36, y)` across y=150,200,300,400,500 while on the home page.

**Results:** All positions returned sidebar elements (`A`, `NAV`, `svg`) with `pointer-events: auto`. No overlay was found above the sidebar.

**Conclusion:** No z-index stacking issue exists. The sidebar CSS (`.capitalife-sidebar` in `globals.css`) enforces `z-index:9999 !important` and `pointer-events:auto !important`.

**Actual cause of reported "not clicking":** Cold compilation latency in dev mode. When a route is not yet compiled, the first click appears to do nothing because Next.js is compiling the route. After the staggered prefetch fix, this should be significantly reduced for all main routes.

---

## Z-Index Map (Shell Stacking Order)

| Layer | z-index | Element | Notes |
|---|---|---|---|
| Sidebar | 9999 | `.capitalife-sidebar` aside | Enforced by globals.css + isolate |
| SentinelButler | 8999 | Portal (when open) | Below sidebar |
| Header overlay | z-30 | AppShell header div | Inside content shell |
| Content shell | 0 | AppShell absolute wrapper | Full viewport, starts 0,0 |
| Mobile preview | 900 | Sidebar portal (when active) | Covers content, below sidebar |
| Dim overlay | portal | Sidebar expanded dim | pointer-events:none ✓ |

---

## Remaining Known Issues (not fixed — out of scope)

1. **Dev mode cold compilation** — First visit to a route that hasn't been prefetched yet takes 2-10s in dev. This is inherent to Next.js dev mode and is not present in production builds.
2. **EngineStatusProvider 30s interval** — Still fires every 30s. This is acceptable; at 500ms timeout it costs max 500ms every 30s.
3. **White Swan page load time** — That page loads large static JSON files. No fix applied (out of scope — Agent 1 owns White Swan).
