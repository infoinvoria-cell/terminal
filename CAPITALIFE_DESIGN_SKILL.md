# CAPITALIFE DESIGN SKILL
## CANONICAL UI SOURCE OF TRUTH — v2.0

> **Use this skill BEFORE modifying or creating any Capitalife UI.**
> Shared shell modifications require explicit ownership.
> Product pages must reuse shared primitives and tokens.
> When this file conflicts with older docs: **this file wins.**

---

## QUICK CONTRACT (machine-readable)

```
DEFAULT_PALETTE:        MONOCHROME_GOLD
KPI_SUBTEXT:            OFF
CARD_RADIUS:            14px (KPI) / 10px (chart/data)
BUTTON_RADIUS:          6px
PILL_RADIUS:            999px
DASHBOARD_SCROLL:       NORMAL_VERTICAL
NEGATIVE_TONE:          GOLD (#D6B24A)
POSITIVE_TONE:          PRIMARY_TEXT (#F0F2F6)
GREEN_DEFAULT:          OFF
CHART_DEFAULT_PALETTE:  WHITE_LINE / GREY_LINE / GOLD_DRAWDOWN
GLOBAL_SHELL_EDIT:      FORBIDDEN_WITHOUT_OWNERSHIP
CONTENT_SHELL_PL:       8px (beyond sidebar 72px)
KPI_GRID_GAP:           8px–16px (context-dependent)
```

---

## NEW AGENT STARTER CHECKLIST

Before building any UI:

- [ ] Read this skill
- [ ] Inspect the reference page atlas (Section 9)
- [ ] Identify shared components to reuse (Section 10)
- [ ] Identify your current worktree and branch
- [ ] Confirm you do NOT need to edit shell (Sidebar/Topbar/Root layout)
- [ ] Import from `src/lib/design-tokens.ts` — do not hardcode colors
- [ ] Implement using canonical primitives
- [ ] Browser QA at 1440px minimum
- [ ] Compare to reference screenshots
- [ ] Verify page scrolls normally (no overflow trap)
- [ ] Check browser console for errors

---

## REFERENCE PRECEDENCE

When sources conflict, apply this order (highest wins):

1. Explicit user-supplied reference screenshot from this session
2. This canonical Design Skill (CAPITALIFE_DESIGN_SKILL.md)
3. `src/lib/design-tokens.ts` — code-level token source
4. Current best Capitalife reference pages (Referenzen, Analytics, Home)
5. Older legacy pages

**Do not copy old Capitalife pages blindly.** Some legacy pages contain outdated:
- tiny terminal-style monospace typography
- research document styling
- obsolete card backgrounds
- incorrect gold values
- misaligned radii

Use current reference pages. If unsure, use Referenzen page (`/referenzen`) as the visual benchmark.

---

## DESIGN DOCUMENT INVENTORY

| File | Purpose | Status |
|---|---|---|
| `CAPITALIFE_DESIGN_SKILL.md` (this file) | **Canonical** agent/human design rulebook | ✅ Active |
| `src/lib/design-tokens.ts` | Code-level canonical tokens (TypeScript) | ✅ Active |
| `src/components/ui/primitives.tsx` | Canonical shared primitives: MetricCard, SectionHeader, DataTable | ✅ Active |
| `src/components/ui/design-system.tsx` | DS object + legacy KpiCard — use primitives.tsx instead | ⚠️ Partial — DS object valid, KpiCard use dashboard/kpi-card.tsx |
| `src/lib/ds.ts` | Old DS object with divergent values (wrong radius, wrong gold) | ❌ Deprecated |
| `src/styles/dashboard.css` | CSS vars with wrong gold (#e2ca7a) — no confirmed consumers | ❌ Deprecated/vestigial |
| `src/app/globals.css` | Shell CSS, z-index contract, animation keyframes | ✅ Active (do not modify without shell ownership) |

**There is ONE canonical design skill.** Do not create competing design docs.

---

## 1. COLOR PALETTE

### The Law

**Default palette: monochrome + muted gold.**

```
BLACK / NEAR-BLACK — backgrounds
WHITE / OFF-WHITE — text, data
GREY — labels, muted, secondary
MUTED GOLD — accents, risk, negative values, active states
```

No green by default. No blue. No purple. No neon.

### Exact Tokens — extracted from live components

| Role | Value | Source |
|---|---|---|
| Page background | `#0B0C0F` | `COLORS.PAGE_BG` |
| Root bg (deepest) | `#090909` | `DS.colors.bg` |
| Card surface flat | `#0D0D0D` | `DS.colors.surface` |
| Elevated surface | `#111111` | `DS.colors.surface2` |
| KPI card gradient start | `#26262D` | `COLORS.KPI_TOP` |
| KPI card gradient end | `#111114` | `COLORS.KPI_BOTTOM` |
| Chart card gradient start | `#17171B` | `COLORS.CARD_TOP` |
| Chart card gradient end | `#0B0B0E` | `COLORS.CARD_BOTTOM` |
| Border (standard) | `rgba(255,255,255,0.055)` | `COLORS.BORDER` |
| Border (divider) | `rgba(255,255,255,0.032)` | `COLORS.DIVIDER` |
| Text primary | `#F0F2F6` | `COLORS.TEXT_PRIMARY` |
| Text header/title | `#f5f7fa` | `COLORS.TEXT_HEADER` |
| Text muted (labels) | `rgba(180,192,210,0.6)` | `COLORS.TEXT_MUTED` |
| Text muted dim | `rgba(180,192,210,0.45)` | `COLORS.TEXT_MUTED_DIM` |
| Text inactive | `#6a6e7a` | `COLORS.TEXT_INACTIVE` |
| Axis ticks | `#7f8a9d` | `COLORS.AXIS_TICK` |
| **Gold (primary)** | `#C9A84C` | `DS.colors.gold` — use for active states, accents |
| **Gold (live-phase)** | `#D6B24A` | `COLORS.GOLD` — use for drawdown lines, negative values |
| Gold bright | `#E8C95A` | `COLORS.GOLD_BRIGHT` |
| Gold dim (fill) | `rgba(186,148,62,0.55)` | `COLORS.GOLD_DIM` |
| Red (system errors only) | `#EF4444` | `DS.colors.red` |
| Green (signal only) | `#22C55E` | `DS.colors.green` |

### Gold Law

Gold is appropriate for:
- Drawdown / max drawdown values
- Negative portfolio values / risk metrics
- Selected / active navigation state
- Live phase chart lines
- Current recommended tier

Gold is NOT:
- A background color for sections
- Every heading
- Every icon
- Positive P&L values (those are white)

### Color Law — Positive vs Negative

| Scenario | Color |
|---|---|
| Positive return | `#F0F2F6` (white) — no color needed |
| Negative return / drawdown | `#D6B24A` gold |
| System failure | `#EF4444` red |
| Trading signal LONG | `#22C55E` green — signals only |
| Trading signal SHORT | `#EF4444` red — signals only |
| Active state accent | `#C9A84C` gold |

Red and green are **signals/errors only** — not general positive/negative styling.

---

## 2. TYPOGRAPHY

| Role | Family | Size | Weight | Extra |
|---|---|---|---|---|
| KPI label (Home large) | Montserrat | 14px | 500 | — |
| KPI label (compact) | Montserrat | 9px | 700 | UPPERCASE, letterSpacing 1px |
| Section/chart title | Montserrat | 11px | 700 | letterSpacing 0.04em |
| Sidebar nav labels | Montserrat | — | — | — |
| KPI value (Home large) | Nunito | 30px | 700 | tabular-nums |
| KPI value (compact) | Nunito | 20px | 600 | tabular-nums |
| Table data | Nunito | 12–13px | 400–600 | tabular-nums for numbers |
| Axis ticks | Nunito | 10–11px | 400 | tabular-nums |
| Body / row labels | Montserrat | 12–13px | 400 | — |

Font variables (always use CSS vars, never hardcode font-family strings):
- `var(--font-numbers)` → Nunito — **all numeric data**
- `var(--font-text)` → Montserrat — **labels, headers, navigation**

---

## 3. CARD ANATOMY

### KPI Card (Large — Home / primary dashboards)

**Source of truth:** `src/components/dashboard/kpi-card.tsx`

```
min-height: 132px
padding: 20px (all sides)
background: linear-gradient(to bottom, #26262D, #111114)
border-radius: 14px
border: 1px solid rgba(255,255,255,0.055)
```

**Slot 1 — Label** (top-left)
- 14px · 500 · Montserrat · `rgba(180,192,210,0.6)`

**Slot 2 — Value** (bottom-left)
- 30px · 700 · Nunito · tabular-nums
- Default color: `#F0F2F6`
- Negative/risk: `#D6B24A` (gold) — use `valueVariant="negative"`

**NO subtitle under the value by default.** The `subtitle` prop exists for exceptional cases (benchmark deltas) only.

### KPI Card (Compact — Analytics / secondary rows)

```
height: 72px (min-height override)
Same gradient, radius, border as above
padding: 11px 14px 12px
```

Label: 9px UPPERCASE · 700 · Montserrat · letterSpacing 1px  
Value: 20px · 600 · Nunito · tabular-nums

**Import:** `KPI_CARD_STYLE` from `src/lib/design-tokens.ts`, then override `minHeight` as needed.

### Chart Card

**Source of truth:** `CHART_CARD_STYLE` in `src/lib/design-tokens.ts`

```
background: linear-gradient(to bottom, #17171B, #0B0B0E)
border-radius: 10px
border: 1px solid rgba(255,255,255,0.055)
overflow: hidden
position: relative
```

Chart header: 11px · 700 · Montserrat · `#f5f7fa` · letterSpacing 0.04em  
No paragraph text. No description. Chart directly beneath header.

### Radius Summary

| Context | Radius |
|---|---|
| KPI card | **14px** |
| Chart card / data container | **10px** |
| Button / control | **6px** |
| Pill segment | **999px** |
| Icon button | **50%** |

---

## 4. NO-SUBTEXT LAW (Non-Negotiable)

**Default KPI shows exactly:**

```
LABEL
VALUE
```

**Nothing else.**

Do not add:
- Description text
- Helper copy
- Status badge
- Explanation
- Subtitle

If context is needed, encode it in the **label**:

✅ `BEST SHARPE · €100K` / `1.379`  
❌ `BEST SHARPE` / `1.379` / `Highest Sharpe ratio at a capital level of €100,000.`

The `subtitle` prop on `KpiCard` exists only for benchmark delta mini-rows. Never use it for explanatory prose.

---

## 5. LAYOUT LAW

Capitalife Desktop uses the full available screen — no 900px centered column on a 1920px display.

### Shell measurements (live, extracted)

```
Sidebar width:        72px (fixed, z-9999)
Content shell pl:     8px (beyond sidebar)
Usable content @800:  ~728px
KPI card gap:         16px (2-col large) / 8px (3-col compact) / 12px (6-col row)
Chart card gap:       12–16px
Section gap:          16–24px
```

### Page padding rules

Pages should use the full content-shell width minus `8px` built-in padding.  
Do not add `max-width: 900px` containers. Do not center-align dashboard content.

---

## 6. SCROLL LAW

Normal vertical page scroll is the default.

- Do NOT set `overflow: hidden` on product page wrappers
- Do NOT create nested scroll containers unless absolutely required
- Do NOT use `height: 100vh` traps on product pages
- Content that doesn't fit on screen should scroll with the page, not be clipped

The exception: the global shell itself (`AppShell`) is `overflow-hidden` — this is correct and must not be changed. Each page owns its internal scroll container inside `dashboard-content-shell`.

---

## 7. DENSITY LAW

Capitalife is **dense but readable.** Not Bloomberg terminal micro-text. Not landing-page whitespace.

Reference density:
- KPI cards: 14px labels / 30px values (large), 9px / 20px (compact)
- Table rows: ~36–44px height
- Chart heights: 180–500px depending on context
- Section gaps: 16–24px
- Card gaps: 8–16px

---

## 8. CONTROL LAW

Before adding any control (tab, toggle, dropdown, filter, accordion, button):

**Ask: does the user actually need to change this state?**

For final overview pages: prefer visible scrollable data.  
Avoid button forests and tab matrices.

---

## 9. REFERENCE PAGE ATLAS

Inspect these pages as visual references. Each demonstrates specific patterns.

### HOME (`/`)

**Demonstrates:** Large KPI card grid · AuM hero · performance chart · secondary KPI row

| Element | Value |
|---|---|
| KPI card | `min-h-132px`, `radius 14px`, gradient `#26262D→#111114`, gap `16px` |
| Performance chart | `radius 10px`, gradient `#17171b→#0b0b0e`, height ~500px |
| Secondary KPI row | 6 cols, gap `12px`, height ~118px |
| Grid | 2-column large KPI grid |

**Anti-patterns present (do not copy):** Long tooltip descriptions on KPI hover (acceptable here, not a pattern).

### ANALYTICS (`/analytics`)

**Demonstrates:** Compact KPI grid · equity chart · drawdown chart · performance table · controls pill row

| Element | Value |
|---|---|
| Compact KPI | `h: 72px`, `radius 14px`, 3-column grid, gap `8px` |
| Chart card | `radius 10px` |
| Grid | 3-col compact KPI, 2-col charts |
| Controls | Pill segments, ACTIVE_PILL_STYLE gradient |

**Reuse here:** `KPI_CARD_STYLE` with `minHeight: 72` override, `CHART_CARD_STYLE`, `PILL_CSS`.

### BRAIN (`/brain`)

**Demonstrates:** Dense information layout · graph visualization · search interface

**Pattern:** Compact non-card layout, full-height content area, dark surface, search-first.

### SENTINEL (`/sentinel`)

**Demonstrates:** Premium surfaces · provider status cards · gold accents · chat interface

| Element | Value |
|---|---|
| Card radius | ~28px (chat input bar — premium feel) |
| Surface | `rgb(14, 15, 17)` |
| Border | `rgba(200,210,230,0.22)` — slightly lighter for premium surface |

**Note:** Sentinel uses slightly different card shapes (28px pill for input). This is intentional for that specific component — do not generalize to all cards.

### MONITORING (`/monitoring`)

**Demonstrates:** Multi-chart grid · candlestick charts · strategy performance tiles

**Pattern:** Chart-grid heavy, very dense. Candle charts use `DS.candle.*` palette from `ds.ts` (despite ds.ts being deprecated, candle config remains valid).

### REFERENZEN (`/referenzen`)

**Demonstrates:** The design system's canonical visual reference — typography, chart cards, KPI grid, drawdown chart, equity chart, data table, controls.

**This is the primary visual benchmark for new work.** When in doubt, compare to Referenzen.

---

## 10. SHARED COMPONENTS

Import these — do not recreate:

| Component | Import | Notes |
|---|---|---|
| `MetricCard` | `src/components/ui/primitives.tsx` | Canonical KPI tile, no subtext |
| `SectionHeader` | `src/components/ui/primitives.tsx` | Section title row |
| `DataTable` | `src/components/ui/primitives.tsx` | Canonical table styles |
| `KpiCard` (Home) | `src/components/dashboard/kpi-card.tsx` | Large Home KPI, has subtitle for benchmark |
| `DS` | `src/components/ui/design-system.tsx` | Quick-access token object |
| `COLORS`, `GRADIENTS`, `FONTS` | `src/lib/design-tokens.ts` | Detailed tokens |
| `KPI_CARD_STYLE`, `CHART_CARD_STYLE` | `src/lib/design-tokens.ts` | Inline style objects |
| `PILL_CSS`, `ACTIVE_PILL_STYLE` | `src/lib/design-tokens.ts` | Control/pill system |

**Deprecated — do not use:**
- `src/lib/ds.ts` — wrong gold, wrong radii, divergent values
- CSS vars from `src/styles/dashboard.css` — wrong gold (#e2ca7a)

---

## 11. PILL / CONTROL ANATOMY

Use `.rc-pill`, `.rc-active`, `.rc-inactive` from `PILL_CSS` in `src/lib/design-tokens.ts`.

**Active pill:** `background: linear-gradient(#26262d, #111114)` + `border: 1.5px solid rgba(255,255,255,0.28)`  
**Inactive pill:** `background: transparent` + `border: 1.5px solid transparent`  
**Hover inactive:** active background + `border: rgba(255,255,255,0.18)`  
**Transition:** `160ms ease`

Badges are exceptional. Do not create badge forests under titles.

---

## 12. TABLE PRIMITIVE

Tables are a primary Capitalife data primitive. Rules:

- Header: 9px UPPERCASE · 700 · Montserrat · `rgba(180,192,210,0.6)` · letterSpacing 1px
- Row height: 36–44px
- Font: Nunito for numbers, Montserrat for labels
- Numeric columns: **right-aligned**
- Separators: `rgba(255,255,255,0.032)` (subtle)
- Outer container: `border-radius 10px`, `border rgba(255,255,255,0.055)`
- Negative/risk values: gold (`#D6B24A`)
- No randomly colored cells
- Optional subtle hover: `rgba(255,255,255,0.02)` background

Import `tableStyles` from `src/components/ui/primitives.tsx`.

---

## 13. CHART LAW

Prefer 3 simple focused charts over 1 complex multi-series chart.

**Default chart palette:**
- Primary line: `#F3F4F6` (white/light grey)
- Secondary/benchmark: `#D8C071` (warm grey-gold)
- Drawdown/risk: `#C9A84C` or `#D6B24A` (gold)

No rainbow palettes. No color coding unless signal meaning requires it.

Chart anatomy:
1. Small chart title (11px, Montserrat, upper-left)
2. Chart directly beneath — no paragraph, no description
3. Compact legend if absolutely required

---

## 14. NUMBER FORMATTING

Apply consistent formatting across all pages:

| Type | Format | Example |
|---|---|---|
| Percentage | 2 decimal places | `14.85%` |
| Sharpe / ratios | 3 decimal places | `1.030` |
| Profit Factor | 2 decimal places | `1.16` |
| Currency (EUR) | `€` prefix, comma thousands | `€10,000` |
| Capital levels | `€100K`, `€500K`, `€1M` | abbreviated |
| Negative % | minus sign, no parens | `-8.5%` |
| Annualized | `p.a.` suffix if label is ambiguous | `12.3% p.a.` |

One locale per page. No mixing `€10k` and `€10,000` on the same surface.

---

## 15. ALIGNMENT RULES

- KPI values: bottom-left aligned (flex column, `justify-content: space-between`)
- Numeric table cells: right-aligned (`text-align: right`)
- Chart cards in a row: same height
- Section edges: aligned to the same horizontal grid

---

## 16. SHELL OWNERSHIP CONTRACT

```
OWNER        COMPONENT                          FILE
─────────────────────────────────────────────────────────────────────
Shell team   Sidebar                            src/components/dashboard/sidebar.tsx
Shell team   Topbar                             src/components/dashboard/topbar.tsx
Shell team   AppShell                           src/components/dashboard/AppShell.tsx
Shell team   Root layout                        src/app/layout.tsx
Shell team   Global providers                   src/components/providers.tsx
Shell team   Global CSS / z-index contract      src/app/globals.css
```

**Product-page agents MUST NOT edit these files without explicit shell ownership.**

### Z-Index Map

| Layer | z-index | Element |
|---|---|---|
| Sidebar | 9999 | `.capitalife-sidebar` — enforced by globals.css |
| SentinelButler | 8999 | Portal (when open) |
| Header overlay | z-30 | AppShell hover header |
| Content shell | 0 | AppShell absolute wrapper |
| Mobile preview | 900 | Sidebar portal (when active) |

Never set `position:fixed` in content shell without `z-index < 9999` AND `left: 72px` (or `pointer-events: none`).

### Shell Performance Rules

- Prefetch: space calls 150ms apart minimum — never simultaneous loop
- EngineStatusProvider: `AbortSignal.timeout(500)`, initial delay ≥3s
- FlaskAutoStart: delay ≥4s, fire-and-forget, unmount cleanup
- Never await background service probes before rendering

---

## 17. RESPONSIVE RULES

Desktop primary: 1440px · 1920px  
Basic sanity check: 390px mobile  

Do not build elaborate mobile layouts for desktop pages — Agent 3 owns mobile UX.

---

## 18. PROSE LAW

Dashboards are: **numbers · charts · tables · labels**

Long prose belongs in: Brain · Research · Documentation

Not on data dashboards.

---

## 19. AGENT OWNERSHIP PRE-FLIGHT

Before any UI work, determine:

1. Current branch and worktree
2. Product ownership for the page being edited
3. List of shared files you plan to touch
4. Whether another agent owns those shared surfaces

If another agent owns the surface — **do not edit it.**

---

## 20. VISUAL REJECTION CONDITIONS

A page fails design review if it has:

- Tiny unreadable type (< 9px label text)
- Huge dead whitespace
- Green-accented styling by default
- Badge forests (> 2 badges under a single title)
- Button forests (> 3 controls without clear task purpose)
- Subtext under every KPI
- Harsh square cards (`border-radius: 0`)
- Random mismatched radii across cards on same page
- Rainbow chart palette
- Misaligned KPI numbers (not bottom-aligned)
- Nested scroll traps
- Visual language inconsistent with Referenzen reference

---

## 21. ANTI-PATTERNS (from White Swan redesign failures)

Do not repeat these patterns observed in the White Swan saga:

| Anti-pattern | Instead |
|---|---|
| Tiny 10px terminal text for primary values | Use 20–30px value, 9–14px label |
| Research banners and document-style copy | Label + value, no prose |
| 8 filter controls above every chart | 0–2 controls unless state change is necessary |
| Stale legacy card styling copied from old pages | Use current Referenzen as benchmark |
| Horizontal width wasted — narrow column in 1920px | Use the full content area |
| Subtext paragraph beneath every KPI | Label encodes context |

These are recorded as lessons, not as reasons to edit White Swan (which is owned by Agent 1).

---

## 22. USER REFERENCE IMAGE WORKFLOW

When a user supplies a visual reference:

1. **Analyze first:**
   - Layout (column grid, gaps)
   - Density (compact vs spacious)
   - Color distribution (background, surface, accent)
   - Radius (sharp, rounded, pill)
   - Spacing (card gaps, section gaps, padding)
   - Hierarchy (what is most visible at a glance)
   - Tables (alignment, header style, row height)
   - Charts (number of series, palette)
   - Shell (sidebar, topbar present?)

2. **Map to existing tokens:**
   - Does the reference use a gradient background? → `GRADIENTS.KPI_BG` or `GRADIENTS.CARD_BG`
   - Does it have gold accents? → `COLORS.GOLD` / `DS.colors.gold`
   - What radius do the cards use? → `RADIUS.kpi` (14px) or `RADIUS.card` (10px)

3. **Only after mapping:** write the component using tokens.  
   Do not immediately invent custom CSS.

---

## 23. SCREENSHOT QA CHECKLIST

For any meaningful UI change:

At 1440px viewport:
- [ ] Spacing matches reference density
- [ ] No overflow / horizontal scroll
- [ ] Font scale correct (no tiny or giant text)
- [ ] Colors within palette (no unexpected greens/blues)
- [ ] Tables readable, numbers right-aligned
- [ ] Charts have titles, no excess legend
- [ ] No empty whitespace tracts
- [ ] KPI cards: label top, value bottom, no subtext

Also check at 1920px — content should scale/fill, not stay narrow.

---

## 24. QUICK-START TEMPLATE

```tsx
import { COLORS, GRADIENTS, KPI_CARD_STYLE, CHART_CARD_STYLE, HEADER_SPAN_STYLE, VALUE_STYLE, LABEL_STYLE } from "@/lib/design-tokens";
import { MetricCard, SectionHeader, DataTable } from "@/components/ui/primitives";

// Page structure
<div style={{ padding: "16px 16px 32px 8px", display: "flex", flexDirection: "column", gap: 24 }}>

  {/* Section header */}
  <SectionHeader>PERFORMANCE</SectionHeader>

  {/* KPI grid — compact 3-col */}
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
    <MetricCard label="TOTAL RETURN" value="+14.8%" />
    <MetricCard label="MAX DD" value="-8.5%" tone="risk" />
    <MetricCard label="SHARPE" value="1.030" />
  </div>

  {/* Chart card */}
  <div style={CHART_CARD_STYLE}>
    <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${COLORS.DIVIDER}` }}>
      <span style={HEADER_SPAN_STYLE}>EQUITY CURVE</span>
    </div>
    {/* chart content */}
  </div>

</div>
```

---

*This file is the single canonical Design Skill. Do not create competing documents. Update this file when the design system evolves.*
