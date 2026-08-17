# Capitalife Terminal — Canonical Design Skill

**Version:** 1.0 · **Authority:** This file + `src/lib/design-tokens.ts`  
**Use:** Machine-readable reference for all agents building Terminal UI.  
**Do not:** Invent new colors, add green defaults, add subtext under KPIs, or break the shell z-index contract.

---

## 1. Color Palette

### Backgrounds (darkest-first)
| Token | Hex | Use |
|---|---|---|
| `PAGE_BG` | `#0B0C0F` | Page / root background |
| `bg` | `#090909` | Deepest elements |
| `surface` | `#0D0D0D` | Card surfaces |
| `surface2` | `#111111` | Elevated surfaces |
| `KPI_BOTTOM` | `#111114` | KPI card gradient end |
| `CARD_BOTTOM` | `#0b0b0e` | Chart card gradient end |
| `KPI_TOP` | `#26262d` | KPI card gradient start |
| `CARD_TOP` | `#17171b` | Chart card gradient start |

### Borders
| Token | Value | Use |
|---|---|---|
| `BORDER` | `rgba(255,255,255,0.055)` | All cards, KPI tiles |
| `DIVIDER` | `rgba(255,255,255,0.032)` | Inner row dividers |
| `border` (DS) | `#1A1A1A` | Fallback opaque border |
| `border2` (DS) | `#2A2A2A` | Active border state |

### Text
| Token | Value | Use |
|---|---|---|
| `TEXT_PRIMARY` | `#F0F2F6` | Numeric values, main content |
| `TEXT_HEADER` | `#f5f7fa` | Chart/section titles |
| `TEXT_MUTED` | `rgba(180,192,210,0.6)` | KPI labels, row labels |
| `TEXT_INACTIVE` | `#6a6e7a` | Inactive icons/pills |
| `AXIS_TICK` | `#7f8a9d` | Chart axis ticks |

### Accent — Gold Only
| Token | Hex | Use |
|---|---|---|
| `gold` (DS primary) | `#C9A84C` | Active states, accents |
| `GOLD` (referenzen) | `#D6B24A` | Live-phase chart lines |
| `GOLD_BRIGHT` | `#E8C95A` | Live-phase drawdown line |
| `GOLD_DIM` | `rgba(186,148,62,0.55)` | Test-phase fill |

### Rules
- **No green default.** `DS.colors.green` (`#22C55E`) exists but must only appear as an explicit `color` override — never as a default KPI color.
- **Gold = risk / negative values / drawdown.** Not green. Not red.
- `DS.colors.red` (`#EF4444`) is reserved for hard errors only — not for negative P&L.
- Monochrome data charts by default. Color only when signal meaning requires it.

---

## 2. Typography

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| KPI label | Montserrat (`--font-text`) | 9px | 700 | UPPERCASE, letterSpacing 1px |
| Section header / chart title | Montserrat | 11px | 700 | letterSpacing 0.04em |
| Nav labels | Montserrat | — | — | Sidebar uses Montserrat |
| KPI value | Nunito (`--font-numbers`) | 20px | 600 | tabular-nums |
| Axis ticks | Nunito | 10–11px | 400 | tabular-nums |
| Body / row text | Montserrat | 12–13px | 400 | — |

Font variables:
- `var(--font-numbers)` → Nunito (numeric data)
- `var(--font-text)` → Montserrat (UI labels, headers)

---

## 3. Card Anatomy

### KPI Card — `KPI_CARD_STYLE` in `src/lib/design-tokens.ts`

```
height: 84px
padding: 11px 14px 12px
background: linear-gradient(to bottom, #26262d, #111114)
border-radius: 14px
border: 1px solid rgba(255,255,255,0.055)
display: flex / flex-direction: column / justify-content: space-between
```

**Slot 1 — Label** (top)
- 9px · 700 · Montserrat · UPPERCASE · letterSpacing 1px · `rgba(180,192,210,0.6)`

**Slot 2 — Value** (bottom)
- 20px · 600 · Nunito · tabular-nums · `#F0F2F6`

**NO sub-label under the value.** The `sub?` prop in `KpiCard` must not be used. Subtext robs the KPI of its vertical breathing room and visual weight.

### Chart Card — `CHART_CARD_STYLE` in `src/lib/design-tokens.ts`

```
background: linear-gradient(to bottom, #17171b, #0b0b0e)
border-radius: 10px
border: 1px solid rgba(255,255,255,0.055)
overflow: hidden
position: relative
```

Chart header title: 11px · 700 · Montserrat · `#f5f7fa` · letterSpacing 0.04em

### Radius Summary
| Context | Radius |
|---|---|
| KPI card | 14px |
| Chart card / data container | 10px |
| Button / pill | 6px (sm) or 999px (pill) |

---

## 4. Pill / Control Anatomy

Use `.rc-pill`, `.rc-active`, `.rc-inactive` from `PILL_CSS` in `src/lib/design-tokens.ts`.

**Active pill:** `background: linear-gradient(to bottom, #26262d, #111114)` + `border: 1.5px solid rgba(255,255,255,0.28)`  
**Inactive pill:** `background: transparent` + `border: 1.5px solid transparent`  
**Hover (inactive):** applies active background + `border: rgba(255,255,255,0.18)`  

Icon button variant: `.rc-icon-btn` — 36×36px, borderRadius 50%, same active/inactive system.

---

## 5. Shell Ownership Contract

```
Sidebar: position:fixed, z-index:9999, isolation:isolate — UNTOUCHABLE
Content shell: absolute inset-0 z-0, pl-72px — content starts at x=72
Canvas blanket: pointer-events:none !important (globals.css)
Globe exception: .globe-stage canvas → pointer-events:auto
Monitoring charts: .monitoring-chart-shell canvas → pointer-events:auto
Engine charts: .lwc-wrap canvas → pointer-events:auto
```

**Rules:**
- Never set `position:fixed` on anything in content shell without also setting `z-index < 9999` and `left: 72px` (or `pointer-events: none`).
- Never create a new `isolation:isolate` stacking context that can beat the sidebar without explicit approval.
- Mobile preview portal (`previewMode === "mobile"`) sits at `z-index: 900` — below sidebar at 9999.

---

## 6. Page Scroll Rule

Pages do **not** scroll the viewport. The content shell is `overflow-hidden`. Each page owns its own scroll container inside `dashboard-content-shell`.

```css
.dashboard-content-shell {
  height: calc(100dvh - var(--header-height, 0px));
  overflow: hidden;          /* shell rule — never change */
}
/* Page-level inner scroll: */
overflow-y: auto; /* inside the page component, not the shell */
```

---

## 7. Global Shell Performance Rules

These apply to all shell-level components (`layout.tsx`, `AppShell.tsx`, `sidebar.tsx`, `providers.tsx`):

1. **Prefetch stagger** — never call `router.prefetch()` in a tight loop on mount. Space calls by 150ms per route minimum.
2. **Background service probes delayed** — `EngineStatusProvider` and `FlaskAutoStart` must delay initial fetch ≥3s after mount so the shell renders first.
3. **Engine health timeout** — `AbortSignal.timeout(500)` max. If engine is down, fail fast.
4. **Auto-start is fire-and-forget** — never `await` `/api/auto-start` or `/api/start-services` in a way that blocks rendering.

---

## 8. Component Reference Map

| Component | File | Status |
|---|---|---|
| `KpiCard` | `src/components/ui/design-system.tsx` | Use — but avoid `sub` prop |
| `DS` | `src/components/ui/design-system.tsx` | Use for quick access |
| `COLORS`, `GRADIENTS`, `FONTS`, `KPI_CARD_STYLE`, `CHART_CARD_STYLE` | `src/lib/design-tokens.ts` | Canonical detailed tokens |
| `PILL_CSS`, `ACTIVE_PILL_STYLE`, `INACTIVE_PILL_STYLE` | `src/lib/design-tokens.ts` | Pill/control patterns |
| `AppShell` | `src/components/dashboard/AppShell.tsx` | Shell — do not modify without review |
| `Sidebar` | `src/components/dashboard/sidebar.tsx` | Shell — do not modify without review |
| `EngineStatusProvider` | `src/components/engine/EngineStatusProvider.tsx` | Shell — do not modify without review |

---

## 9. Do / Don't

| Do | Don't |
|---|---|
| Use gold for active states, risk, drawdown | Use green as a default accent |
| Use `#F0F2F6` for primary numeric values | Use pure white `#FFFFFF` for text |
| Use `rgba(255,255,255,0.055)` for borders | Use thick or opaque borders |
| KPI card: label top, value bottom, 84px height | Add subtext below the value |
| Chart data monochrome by default | Add color coding unless signal meaning requires it |
| Contain scrolling inside page components | Let pages overflow the viewport |
| Space prefetches ≥150ms apart | Simultaneously prefetch 20 routes on mount |
| Delay background service probes 3–4s | Block shell render with synchronous fetch |
| Set `pointer-events:none` on full-screen overlays | Place `position:fixed;inset:0` overlays without pointer-events guard |

---

## 10. Quick-Start Template

```tsx
import { DS, KpiCard } from "@/components/ui/design-system";
import { COLORS, GRADIENTS, KPI_CARD_STYLE, CHART_CARD_STYLE, HEADER_SPAN_STYLE, VALUE_STYLE, LABEL_STYLE } from "@/lib/design-tokens";

// Section header
<div style={HEADER_SPAN_STYLE}>SECTION TITLE</div>

// KPI row
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
  <KpiCard label="NET RETURN" value="+14.8%" color={COLORS.GOLD} />
  <KpiCard label="MAX DD" value="-8.5%" color={COLORS.GOLD} />
  <KpiCard label="SHARPE" value="1.42" />
  <KpiCard label="CAGR" value="12.3%" />
</div>
// NOTE: do not pass `sub` prop

// Chart card shell
<div style={CHART_CARD_STYLE}>
  <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${COLORS.DIVIDER}` }}>
    <span style={HEADER_SPAN_STYLE}>EQUITY CURVE</span>
  </div>
  {/* chart content */}
</div>
```
