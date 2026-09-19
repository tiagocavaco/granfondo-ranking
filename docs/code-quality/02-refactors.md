# 02 — Refactor recipes

Ordered by payoff per hour. Each recipe: why, target shape, files, steps,
safety net, effort (**S** ≤ 1 day, **M** 2–4 days, **L** 1–2 weeks). None
changes behaviour; each should land as its own PR with the named tests
green before and after. Do not combine a refactor with a feature or a bug
fix in one PR.

---

## R1 — Split god components into page / hooks / view (frontend) · M

**Why:** A1, A5, A7, A8. The eight largest components hold 2,500 lines.

**Target shape per route:**
```
components/team-ranking/
  TeamRankingPage.tsx        ≤ 80 lines: reads URL state, calls hooks, composes views
  useTeamRanking.ts          data + derived values (memoised), no JSX
  teamRankingSelectors.ts    pure functions: filter, rank, maxPoints, topThree (unit-tested)
  TeamRankingFilters.tsx     view
  TeamRankingTable.tsx       view (exists for athlete ranking already)
```
Rule: a component file contains one exported component plus at most two
private sub-components under 40 lines. Anything computed from data goes in
`*Selectors.ts` and gets a test.

**Steps:** start with `TeamProfile` (largest, has tests), then
`TeamRankingPage`, `ResultsTab`, `AthleteProfile`, `EventDetail`,
`ParticipantsTab`, `EventList`, `App.tsx` (extract `Header`, `MobileMenu`,
`Footer`, `LoadingScreen`, `ErrorScreen`, `Logo`).

**Safety net:** existing component tests (`TeamProfile.test.tsx`,
`PredictionsPage.test.tsx`), the Playwright suite, and a snapshot of each
page's rendered text before/after via the audit script.

---

## R2 — One data-fetching hook (frontend) · S

**Why:** A2. Twelve copies of the loading triple with no cache or cancellation.

**Target:**
```ts
// hooks/useQuery.ts
export function useQuery<T>(key: string, fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; loading: boolean; refetch(): void }
```
Module-level `Map<string, Promise>` cache keyed by `key`; abort flag in the
effect cleanup; `refetch` clears the key. Keep it 40 lines; do not add a
library for this.

**Steps:** introduce the hook; replace the triple page by page (each is a
mechanical edit); delete the `Spinner`-only loading in favour of a
`Skeleton` when R3 lands.

**Safety net:** Playwright suite; `useQuery.test.ts` covering cache hit,
error, unmount before resolve.

---

## R3 — Shared UI primitives (frontend + backoffice) · M

**Why:** A3, A6, E1. Six table shells, eight empty states, four link
clusters, two chart setups, three backoffice page copies.

**Target (`frontend/src/ui/`, consumed by backoffice via a workspace or copied once):**
`PageHeader`, `FilterBar` (label + control slots), `Select`, `DataTable`
(header, rows, `ScrollSentinel`, empty slot), `EmptyState({icon,title,hint})`,
`ExternalLinks({official, results, predictions})`, `StatStrip`,
`Skeleton`, `ChartFrame` (Recharts container, axes, tooltip style, podium
dot renderer). Backoffice: `OverrideTable<T>` and `OverrideForm` replacing
the three override pages; `SearchTable<T>` replacing the three raw-search
pages.

**Steps:** extract from the two most duplicated pairs first
(`AggregateRankingPage`/`TeamRankingPage`; `AssignmentsPage`/`BlocksPage`),
then sweep.

**Safety net:** `jscpd` duplicated lines for `frontend/src` and
`backoffice/src` must go down, not up; visual-regression screenshots
(`docs/test-plans.md` §8).

---

## R4 — Design tokens (frontend) · S

**Why:** A4. Prerequisite for the frontend plan's light theme and any restyle.

**Target:** `tailwind.config.js` `theme.extend.colors`: `surface.{0,1,2}`,
`line.{subtle,strong}`, `ink.{primary,secondary,muted}`, `accent.{gold,blue,green,red}`;
`fontSize.eyebrow`, `fontSize.micro`; `borderRadius.card`. Delete the unused
`brand` palette and the CSS variables in `index.css` that duplicate it, or
make Tailwind read the CSS variables (one or the other).

**Steps:** add tokens; codemod `#0c1628`→`bg-surface-1`, `#060d1a`→`bg-surface-0`,
`bg-white/[0.07]`→`border-line-subtle` etc. with `sed`, then review the
diff visually.

**Safety net:** visual-regression screenshots; the audit's tiny-text count
should not change until the type-size pass is intentionally done.

---

## R5 — Decompose the scraper `main` (scraper) · M

**Why:** B1. 442 lines, 35 commits of churn, the ID-seeding logic is untestable in place.

**Target (`scraper/src/run/`):**
```
loadState.ts        openSourceDb + all load* → ScraperState
collectEvents.ts    discovery + per-event scrape + external + manual → { events, results, participants }
normalizeEvents.ts  names, gaps, schedule file
buildIdentity.ts    buildAthletesIndex + flags → { index, updatedIdStore, keyToCanonical }
buildLookups.ts     nameToId / seedNameToId / alias keys / athleteAllTeamIds / athleteCategories  ← pure, unit-tested
linkParticipants.ts
buildRankings.ts
writeOutput.ts
index.ts            main = the eight calls in order, ~40 lines
```
`buildLookups.ts` is the one that matters: it takes `(athletesIndex,
updatedIdStore, aliasRules, teamIdStore)` and returns the four maps. Its
40-line comment becomes a test with three cases (team change, alias rule,
stale key exclusion).

**Safety net:** golden-output pipeline test (`docs/test-plans.md` §4) run
before and after; `scraped-events.json` and DB row counts identical on the
same cached inputs.

---

## R6 — Name the sub-algorithms inside the long passes (scraper) · M

**Why:** B2. Passes are correct and tested but read as walls.

**Target:** each pass file keeps its exported entry function under 60 lines
that reads like its CLAUDE.md description, calling named helpers in the
same file:
- `build-licence-profiles.ts`: `indexLicences`, `chooseCanonicalName`, `resolveSoloKeyCollisions`, `createLicenceProfiles`, `mergeSameNameCooccurringLicences`.
- `solo-intra-year.ts`: `groupCandidates`, `resolveByDistance`, `resolveByPercentile`, `routeToBibKey` (exists), `flagManual`.
- `category-sweep-eviction.ts`: `computeYearCategories`, `enforceForwardProgression`, `findOutliers`, `rehomeResults`.
- `manual-result-assignments.ts`: `locateBibResult`, `evictConflictingSlot`, `moveResult`, `addUnprofiledResult`.

**Safety net:** the per-pass tests and the golden test. Pure extraction; no
logic change; diff should be moves plus signatures.

---

## R7 — One category normaliser, one country resolver (utils/api) · S

**Why:** B3, D2.

**Target:** `utils/src/category.ts` is the only implementation:
`canonicalizeCategory(raw)`, `categoryTier(raw)` (derived from the canonical
name), `isFemaleCategory`. Delete `normalizeCategory`, `categoryTier` and
`athleteEffectiveTier` from `scraper/src/normalize.ts`; `athleteKey` in the
pipeline uses the canonical form slugified. `api/src/athlete.ts` keeps one
function `athleteCountry(results)` (most frequent, ties to most recent) used
by every caller.

**Safety net:** property test: for every distinct raw category string in the
current DB (182), old and new agree on tier and on female/male; snapshot the
list in a fixture. Golden pipeline test.

---

## R8 — Adapter interface for scrapers (scraper) · M

**Why:** B4. Prerequisite for the event registry.

**Target:** `scraper/src/scrapers/adapter.ts` with `ResultsAdapter` /
`ParticipantsAdapter` (`docs/specs/event-registry.md` §2); one module per
source exporting an adapter object; shared `html.ts` (entity decoding,
tag stripping, row/cell iteration), `text.ts` (title-case, time parsing)
and `distance.ts` (`distanceIdFor(name)` replacing the two `includes`
ladders). `apedalar.ts` split into `livewire.ts` (session, snapshot, single
property update) and `apedalar.ts` (parsing).

**Safety net:** fixture tests per adapter (`docs/test-plans.md` §1) written
before the refactor, asserting parsed output; they must pass unchanged after.

---

## R9 — Shared boilerplate for scripts, CLI and admin (scraper/api/backoffice) · S

**Why:** B6, D1, E2.

**Target:**
- `scraper/src/db/open.ts`: `loadEnv()`, `openEncryptedDb(): { sqlite, db, save() }` opening from a buffer (never `/tmp`), used by `manage-db.ts`, `decrypt-db.ts`, every script, and the backoffice middleware.
- `scraper/src/db/overrides.ts`: `addAlias`, `removeAliasById`, `addAssignment`, … as functions of `(sqlite, args)`; `manage-db.ts` becomes argument parsing plus dispatch; `admin-middleware.ts` becomes a route table `{ method, route, fields: FieldSpec[], handler }`.
- `api/src/admin.ts`: `selectOverrides(kind, where?)` and `likePattern(term)` helpers; row-to-type mapping via spread plus the two boolean coercions.
- Add `scraper/src/scripts/**` back into lint and coverage.

**Safety net:** backoffice middleware tests (`docs/test-plans.md` §7);
`npm run db:manage -- list` output identical before/after on the same DB.

---

## R10 — Logger and error type (all) · S

**Why:** B7, F4; prerequisite for the run-summary artefact.

**Target:** `utils/src/log.ts`: `log.info/warn/error(event: string, fields?: object)`
printing the current human format by default and JSON lines when
`LOG_FORMAT=json`; counters collected by event name for the summary.
`utils/src/errors.ts`: `AppError(code, message, cause?)`; the frontend
error screens map `code` to copy. Replace `console.*` in `scraper/src` and
`api/src` mechanically; leave the frontend's `console.warn` for dev only
behind `import.meta.env.DEV`.

**Safety net:** log output snapshot for one cached scrape run compared
line-by-line ignoring timestamps.

---

## R11 — Tighten the compiler (all) · S then ongoing

**Why:** B8. 235 `!` and unchecked indexing.

**Target:** enable `noUncheckedIndexedAccess` in `tsconfig.base.json`; fix
the resulting errors by (a) narrowing with a local `const x = arr[0]; if (!x) …`,
or (b) using small helpers `first(arr)`, `mustGet(map, key)` that throw an
`AppError` with context instead of a bare `!`. Ban new `!` via
`@typescript-eslint/no-non-null-assertion` as a warning.

**Safety net:** the compiler; no runtime change if done as narrowing.

---

## R12 — Write no dangling references (database) · S

**Why:** C1. `pruneGhostAthletes` repairs what earlier inserts wrote.

**Target:** in `buildDatabase`, compute the set of live athlete ids (those
with results) once, and filter `athletes`, `athlete_teams`,
`athlete_categories`, `athlete_lookup`, `aggregate_athletes`,
`team_race_athletes.athlete_id` and `participants.athlete_id` against it
before insert. Keep `pruneGhostAthletes` for one release as an assertion
that deletes zero rows, then remove it.

**Safety net:** `db-writer.test.ts` cases for each table; `db:check` zero orphans.

---

## Suggested order and grouping

| PR | Recipes | Prerequisite tests |
|----|---------|--------------------|
| 1 | R10 logger, R11 compiler flag | none |
| 2 | R7 category/country | property test on 182 strings |
| 3 | R9 boilerplate + scripts under lint | middleware tests |
| 4 | R8 adapters | fixture tests |
| 5 | R5 scraper main, R12 writer | golden test |
| 6 | R6 pass helpers | per-pass tests |
| 7 | R2 useQuery, R4 tokens | Playwright |
| 8 | R1 page splits (one page per PR) | component tests + screenshots |
| 9 | R3 primitives (frontend then backoffice) | jscpd trend, screenshots |

Each PR should reduce at least one number in `metrics.json` and none should
increase. Re-run `node docs/code-quality/tools/measure.mjs` and `jscpd` in
the PR description.
