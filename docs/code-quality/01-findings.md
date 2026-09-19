# 01 — Findings

Grouped by workspace, then cross-cutting. Each finding names the evidence
and the recipe in `02-refactors.md` that addresses it (R1–R12).

## A. Frontend (`frontend/src`)

### A1 — God components
`TeamProfile` (530 lines in one function), `TeamRankingPage` (458),
`ResultsTable` (322), `AthleteProfile` (304), `EventDetail` (289),
`ParticipantsTab` (279), `AggregateRankingPage` (223), `EventList` (195).
Each one holds: data fetching, three or more `useMemo` derivations, filter
state, infinite-scroll state, and 150–400 lines of JSX with inline
conditionals. There is no boundary at which a reader can stop. → R1, R2.

### A2 — Data fetching is a copied triple
Twelve occurrences of
```ts
const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
useEffect(() => { api.x().then(setData).catch(e => setError(String(e))).finally(() => setLoading(false)); }, [id]);
```
No caching, no request de-duplication, no cancellation on unmount (a fast
back-navigation can set state on an unmounted component). → R2.

### A3 — Repeated UI patterns without components
- Filter bar with label + `<select>` (six copies; `FilterGroup` in
  `frontend/src/components/events/EventList.tsx` duplicates
  `frontend/src/components/shared/SegmentedControl.tsx`).
- Official Page / Official Results / Predictions link cluster: four copies,
  each with a desktop and a mobile variant.
- Empty state (SVG + title + hint): eight copies with different SVG paths.
- Table shell (`rounded-2xl border … overflow-x-auto`, header row classes,
  `ScrollSentinel`): six copies.
- `AggregateRankingPage` and `TeamRankingPage` share 84 duplicated lines
  (season/distance filter block); the two info pages share 36. → R3.

### A4 — Hard-coded design tokens
`#0c1628` and `#060d1a` appear in 30+ places; `bg-white/[0.07]`,
`border-white/[0.06]`, `text-[10px]`, `text-slate-600` hundreds of times.
`tailwind.config.js` defines a `brand` palette nothing uses; `index.css`
defines CSS variables that two utility classes use. Changing the look means
touching every file. → R4.

### A5 — Business logic inside render
`AthleteProfile` computes podium counts, best position, team resolution and
year grouping inline; `ResultsTable` computes category positions with a
`WeakMap` inside `useMemo`; `EventList` sorts and filters events in a
40-line memo. These belong in pure helpers next to the utils that already
exist (`posStyle.ts`, `distance.ts`). → R1.

### A6 — Two charts, one implementation
`PerformanceChart.tsx` and `HeadToHeadChart.tsx` share 44 duplicated lines
of Recharts setup, custom dot rendering and tooltip styling. → R3.

### A7 — Rules-of-hooks violation and index keys
`PerformanceChart` returns before hooks; `ResultsTab` and `ParticipantsTab`
use `key={i}`. Both are noted in the frontend issues; they are symptoms of
A1 (too much in one component to see the rule). → R1.

### A8 — `App.tsx` is 406 lines
Loading screen, error screen, header with two navigation variants, mobile
menu, banners, routes and footer in one file; the SVG logo is inlined
twice. → R1.

## B. Scraper (`scraper/src`)

### B1 — `index.ts` `main` is 442 lines
Discovery, per-event scraping, external events, manual events, alias-key
seeding logic with a 40-line comment, participant resolution, stats,
rankings, DB write, all in one function with shared local variables. The
seeding logic (`seedNameToId`, `nameToId`, alias keys) is the most
intricate code in the repository and is not unit-testable in place. → R5.

### B2 — Pipeline passes are long but well-bounded
`buildLicenceProfiles` 273 lines, `groupSoloIntraYear` 239,
`sweepCategoryEviction` 227, `applyManualResultAssignments` 194. Each is
one file, tested, and documented; the length comes from inline
sub-algorithms (name-variant voting, collision resolution, re-homing).
Extracting those into named helpers would make the pass bodies read like
the CLAUDE.md pass table. Lower priority than B1 because they are covered.
→ R6.

### B3 — Category logic in three places
`utils/src/category.ts` (`normalizeCategory`, gendered), `scraper/src/normalize.ts`
(`normalizeCategory`, " F" suffix; `categoryTier`; `athleteEffectiveTier`).
Same regex tables, different outputs, no test asserting agreement. → R7.

### B4 — Scrapers: six adapters, six shapes
Each source is a bespoke function with its own fetch, parse and
`makeResult` mapping; `apedalar.ts` alone is 610 lines with a 245-line
function. Duplicated: `decodeHtmlEntities`/`htmlAttrDecode`, title-casing,
distance-id fallback (`stopandgo.ts` has two copies of the same 8-line
`distLower.includes(...)` ladder). No shared adapter interface. → R8.

### B5 — Config maps by event id
Seven per-event maps in `config.ts` and an array in `external.ts` describe
the same events from different angles. → engine plan Phase 3 (registry),
`docs/specs/event-registry.md`.

### B6 — Scripts duplicate their boilerplate and escape lint
14 scripts, 4,800 lines, excluded from lint and coverage. Every script
re-implements: load `.env`, resolve `encPath`, decrypt, open
`better-sqlite3`, and several write plaintext to `/tmp`.
`find-split-candidates.ts` and `find-licence-splits.ts` share 120 lines;
`manage-db.ts` and `apply-team-aliases.ts` share 49. → R9.

### B7 — Logging by `console`
285 calls with emoji prefixes and `[pass-name]` tags. Readable in a
terminal, unparseable by anything else; the run-summary plan needs
structured events. → R10.

### B8 — Non-null assertions
235 across the repo, concentrated in the pipeline (`index.get(key)!`,
`sorted[0]!`, `map.get(k)!`). Most follow a `has` check, but
`noUncheckedIndexedAccess` is off so `arr[0]` is typed as present even when
it is not. → R11.

## C. Database (`database/src`)

### C1 — `db-writer.ts` mixes schema, ID allocation and integrity repair
`buildDatabase` orchestrates eleven insert functions plus
`pruneGhostAthletes`, which runs six corrective SQL statements after the
fact. The pruning exists because earlier steps can write dangling
references; the cleaner shape is to not write them. → R12.

### C2 — `teams.alias_keys` JSON column
Already an engine issue (E3); it forces JSON parsing in `manage-db.ts`,
`alias-utils.ts`, `db-loader.ts`, `api/src/lookups.ts`, `api/src/teams.ts`
and `api/src/admin.ts`, six places that must agree. → `docs/specs/data-artefacts.md` §3 (`team_aliases` table).

## D. API (`api/src`)

### D1 — `admin.ts` is 614 lines with internal duplication
Three near-identical "select overrides with joins and map" functions
(alias rules for one athlete, for all; assignments for one athlete, for
all) and two search functions with the same `LIKE` escaping. 64 lines
duplicated internally. → R9 (shared query helpers) and backoffice plan 1.2.

### D2 — Two country resolvers
`mostRecentCountry` and `buildCountryMap`/`buildMostFrequentCountryMap` in
`api/src/athlete.ts`, used inconsistently by callers (the frontend shows
different flags on different pages). → R7.

### D3 — Query functions return hand-mapped objects
Every function maps Drizzle rows to the `Stored*` types field by field
(`getResults` 20 fields, `getAthlete` 18). The types in
`database/src/types.ts` are derived from the schema with `Omit`, so most of
these mappings could be `{ ...row, dnf: Boolean(row.dnf) }`. → R9.

## E. Backoffice (`backoffice/`)

### E1 — Three copies of one page
`AssignmentsPage` and `BlocksPage` share 119 lines; `AliasesPage` is the
same shape with a different form; `RawAthletePage` and `RawEventPage`
share 62 lines of search-table. → R3 (same generic components as the frontend).

### E2 — `handleAdminRequest` is a 201-line if-chain
Eight routes, each repeating read-field / validate / build args / run /
respond. A route table with per-route field specs collapses it to ~40
lines. → R9.

## F. Cross-cutting

### F1 — Style guide compliance
Root `CLAUDE.md` asks for ≥3-character identifiers, no abbreviations, ≤50
line functions, comments only for the why. Measured: 12 `id-length`
warnings, 104 long functions, 104 `padding-line-between-statements`
warnings (a formatting rule Prettier does not enforce). Comments are
generally good and explain intent; a few are stale (pass numbering in
`scraper/src/pipeline/results/helpers.ts` refers to passes 5c/5e/5f).

### F2 — Tests are strong where the logic is pure and absent where it is not
Pipeline passes 84–98%, utils 85%, api 84%; adapters, events pipeline, DB
I/O, backoffice, App shell near zero. The untested code is precisely the
long, side-effectful code above. Refactoring it into pure cores plus thin
I/O shells is what makes it testable (`docs/test-plans.md`).

### F3 — Dependency drift
`drizzle-orm` resolves to 0.38.4 but `api` and `database` want 0.45.2;
major bumps available for `better-sqlite3`, `@vitejs/plugin-react`,
`@vitest/coverage-v8`, React types. No Renovate/Dependabot. → roadmap hygiene item.

### F4 — No shared logger, no shared error type, no shared result type
Errors are `String(err)` everywhere; the frontend shows raw messages. A
tiny `AppError { code, message, cause }` and a logger would make the
observability plan and the error screens consistent. → R10.
