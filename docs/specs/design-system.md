# Spec — design system

Status: proposed. Implements frontend plan Phase 3 and code-quality recipes
R3/R4. Codifies the look the site already has so it can be applied
consistently, themed, and extended without touching every file.

## 1. Principles

- **Editorial, not dashboard.** Big condensed headlines, generous whitespace,
  one accent at a time. Numbers are typeset like a results sheet.
- **Dark by default, light for sunlight.** Both themes share tokens; only
  the values change.
- **Mobile is the primary canvas.** Every component is designed at 390 px
  first; desktop adds density, never new components.
- **Nothing decorative carries information.** 10–11 px eyebrows may exist;
  any number or name is ≥ 13 px.

## 2. Tokens (`tailwind.config.js` → `theme.extend`)

### Colour

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `surface-0` | `#060d1a` | `#f7f5f0` | page background |
| `surface-1` | `#0c1628` | `#ffffff` | cards, tables |
| `surface-2` | `#0f1a2e` | `#f1eee7` | inputs, hover rows |
| `line-subtle` | `rgba(255,255,255,.09)` | `rgba(0,0,0,.08)` | dividers |
| `line-strong` | `rgba(255,255,255,.14)` | `rgba(0,0,0,.16)` | card borders on hover |
| `ink-primary` | `#f8fafc` | `#0b1220` | headings, names, times |
| `ink-secondary` | `#cbd5e1` | `#334155` | body |
| `ink-muted` | `#94a3b8` | `#64748b` | labels, meta (≥ 4.5:1 on its surface) |
| `gold` | `#d4af37` | `#b8901e` | podium 1, series accent |
| `silver` | `#cbd5e1` | `#8a94a6` | podium 2 |
| `bronze` | `#cd7f32` | `#b4652a` | podium 3 |
| `accent` | `#60a5fa` | `#1d4ed8` | links, active filters |
| `success` / `warning` / `danger` | `#34d399` / `#fbbf24` / `#f87171` | `#059669` / `#b45309` / `#dc2626` | status |
| `dist-gf` / `dist-mf` / `dist-mini` / `dist-tt` | blue / violet / emerald / amber (current values) | darker variants | distance chips |

Implement as CSS variables on `:root` and `[data-theme="light"]`, exposed to
Tailwind via `colors: { "surface-0": "rgb(var(--surface-0) / <alpha-value>)" … }`
so opacity modifiers keep working. Delete the unused `brand` palette.

### Type

| Token | Font | Size / line | Use |
|-------|------|-------------|-----|
| `display-xl` | Barlow Condensed 700, uppercase, tracking 0.02em | 56/56 mobile · 80/80 desktop | page titles |
| `display-lg` | same | 32/36 · 44/48 | hero names, event names |
| `display-md` | same | 22/26 · 26/30 | section titles, row titles |
| `body` | Barlow 500 | 15/22 · 16/24 | everything else |
| `body-sm` | Barlow 500 | 13/18 | table cells, meta |
| `eyebrow` | Barlow 800, uppercase, tracking 0.25em | 11/14 | section labels only |
| `mono` | JetBrains Mono or system mono, tabular | 13/18 | times, gaps, bibs |
| `num` | Barlow 800, `font-variant-numeric: tabular-nums` | inherits | points, ranks, stats |

### Space, radius, elevation, motion

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Page gutter 16 mobile, 24 desktop. Card padding 20/32.
- Radius: `card` 20 px, `control` 12 px, `chip` 999 px.
- Elevation: none by default; `glow-gold/silver/bronze/accent` for podium and hover (existing values).
- Motion: `enter` 240 ms cubic-bezier(.22,1,.36,1); stagger 40 ms, max 6 items; all disabled under `prefers-reduced-motion`.
- Touch: minimum 44 × 44 px hit area on anything tappable; 8 px between adjacent targets.

## 3. Components (`frontend/src/ui/`)

Each has: props table, states (default, hover, focus-visible, active, disabled, loading, empty, error), both themes, mobile and desktop. Stories or a `/styleguide` route render all of them.

| Component | Purpose | Notes |
|-----------|---------|-------|
| `PageHeader` | eyebrow + display title + optional actions | replaces the per-page copies |
| `Eyebrow` | 11 px label | never carries data |
| `StatStrip` | row of number + label | `num` type; wraps on mobile |
| `HeroCard` | event or athlete hero with ghost watermark slot and accent line | variants: event-upcoming, event-finished, athlete, team |
| `Chip` | distance, category, status | colour from token by kind |
| `RankBadge`, `MedalBadge`, `PosBadge` | existing, moved | |
| `FilterBar` | label + control slots, collapses to bottom sheet on mobile | |
| `Select`, `Segmented`, `Toggle`, `SearchInput` | form controls | native `<select>` on desktop, `BottomSheet` picker on mobile |
| `DataTable` | header, rows, sticky first column option, `ScrollSentinel`, empty slot | row variants: default, top-3 tint, expanded detail |
| `ResultRow` | mobile card layout for a result | replaces the 3-column mobile table |
| `EmptyState` | icon + title + hint + optional action | one SVG set |
| `Skeleton` | text, row, card | used by `useQuery` while loading |
| `ExternalLinks` | official / results / predictions chips | one place |
| `ChartFrame` | Recharts container with axes, grid, tooltip and podium dots | used by both charts |
| `ShareCard` | 1200×630 render of a result, podium or season | server and client renderer share the same component |
| `BottomTabBar` | mobile nav: Events, Rankings, Athletes, Search | replaces the header dropdown |
| `Toast` | success/error after actions | |

## 4. Page templates

- **List page** (events, rankings, athletes): `PageHeader` → optional hero → `StatStrip` → `FilterBar` → `DataTable` or card list → footer.
- **Detail page** (event, athlete, team): `HeroCard` → `StatStrip` → sections with `Eyebrow` titles → tables/charts.
- **Utility page** (info, support, privacy, 404): `PageHeader` → prose column max 68 ch.

Every page: one `h1`, a `<title>` of the form "<Thing> · Granfondo Portugal", OG tags pointing at a `ShareCard`.

## 5. Theming

`<html data-theme="dark|light">` set from `prefers-color-scheme` on first
load, overridable by a toggle stored in `localStorage`. All colours come
from tokens; a page that hard-codes a hex value fails a lint rule
(`no-restricted-syntax` on `#[0-9a-f]{6}` in `className`).

## 6. Accessibility

Contrast ≥ 4.5:1 for text, ≥ 3:1 for large display text and UI borders;
focus-visible ring on every interactive element; tables have `<caption>`;
icons have labels or are `aria-hidden`; motion respects the OS setting;
language attribute follows the active locale.

## 7. Acceptance

- Zero hex literals in `frontend/src/components/**`.
- Light theme screenshot set exists for every route; axe reports no serious violations in either theme.
- `jscpd` duplicated lines in `frontend/src` under 1%.
- The audit's tiny-text count for informational text is zero.
