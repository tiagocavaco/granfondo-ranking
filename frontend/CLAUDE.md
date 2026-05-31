# Frontend

React + Vite SPA. Fetches an AES-256-GCM encrypted SQLite database, decrypts it in the browser via Web Crypto, and queries it with sql.js (WASM). Deployed to GitHub Pages at `/granfondo-ranking/`.

## Scripts

```bash
npm run dev       # dev server (requires frontend/.env.local with VITE_DATA_KEY)
npm run build     # production build (requires VITE_DATA_KEY env var)
npm run preview   # preview the production build locally
npm run test
```

## Data layer

```
frontend/public/data/data.db.enc   Encrypted SQLite (committed to git)
src/db/db-client.ts                Vite-specific wiring: WASM URL + fetchEncryptedDb + getDb()
src/utils/date.ts                  formatAge() — formats a scraped-at timestamp as a human age
src/utils/distance.ts              distBadgeClass(), distance colour constants
src/utils/posStyle.ts              Tailwind class string for position badge colours
src/utils/rankLabel.ts             Pure string: 🥇 / 🥈 / 🥉 / #N
src/hooks/useInfiniteScroll.ts     Infinite scroll hook used by ranking pages
```

All query logic lives in `@granfondo/api`. Components import directly from there. `App.tsx` wires the DB once at module scope:

```typescript
import { api, setGetDb } from "@granfondo/api";
import { getDb } from "./db/db-client";
setGetDb(getDb);
```

`src/db/db-client.ts` is the Vite-specific wiring file. It uses `import.meta.env` (to read `VITE_DATA_KEY`) and the `?url` asset import transform (for WASM). The AES-GCM decrypt logic itself lives in `@granfondo/database/decrypt` and is shared with the backoffice.

`initLookups()` must be called once at startup (done in `App.tsx`) to populate the in-memory team alias and athlete lookup caches used by `resolveTeamKey` and `lookupAthleteId`.

## Key rules for team links

Use `<TeamLink team={r.team} />` (`src/components/shared/TeamLink.tsx`) wherever a team name should conditionally link to its profile page. It handles the `SOLO_TEAM_KEYS` check internally — solo placeholders (`individual`, `independente`, `no team`, `sem equipa`, `""`, etc.) render as plain text, real teams render as `<Link>`.

Do not inline the `SOLO_TEAM_KEYS.has(normalizeTeam(team))` check in individual components — use `TeamLink` instead.

For the alias resolver details see `api/CLAUDE.md`.

### TeamProfile loading

`TeamProfile` fires `getTeamRanking()`, `initLookups()`, and `getTeamByKey()` all in parallel in a single `Promise.all`. Do not split these into sequential effects — it causes a visible flicker where results render before members.

`effectiveSeason` is a derived value (`selectedSeason || allSeasons[0] || ""`), not state. This avoids an extra render pass that previously caused the member list to re-sort after initial load. Do not convert it back to a `useEffect`-driven state update.

## Component map

Components live under `src/components/` grouped by route:

```
events/           EventList, EventCard, EventDetail, ResultsTab, ParticipantsTab
athletes/         AthletesPage, AthleteProfile, CareerHighlights, PerformanceChart
athlete-ranking/  AggregateRankingPage, AggregateRankingPodium, AggregateRankingTable, AthleteRankingInfoPage
team-ranking/     TeamRankingPage, TeamProfile, TeamMemberList, TeamRankingInfoPage
comparison/       ComparisonPage, ComparisonHeroCard, HeadToHeadChart, SharedEventsTable
predictions/      PredictionsPage, PredictionsInfoPage
shared/           Spinner, ErrorBanner, TeamLink, RankBadge, SegmentedControl,
                  GenderToggle, Stat
```

| Component | Route | Purpose |
|-----------|-------|---------|
| `EventList` | `/` | List of all events with cards |
| `EventCard` | — | Single event card used by EventList |
| `EventDetail` | `/event/:id` | Event detail with Results / Participants tabs |
| `ResultsTab` | — | Race results table with search and filters |
| `ParticipantsTab` | — | Upcoming event participant list |
| `AthleteProfile` | `/athlete/:id` | Athlete career page with chart and highlights |
| `CareerHighlights` | — | Highlights bar inside AthleteProfile |
| `PerformanceChart` | — | Points-over-time chart inside AthleteProfile |
| `AthletesPage` | `/athletes` | Athlete search |
| `AggregateRankingPage` | `/ranking` | Season athlete ranking with infinite scroll |
| `AggregateRankingPodium` | — | Top-3 podium cards inside AggregateRankingPage |
| `AggregateRankingTable` | — | Infinite-scroll table inside AggregateRankingPage |
| `TeamRankingPage` | `/teams` | Season team ranking |
| `TeamProfile` | `/team/:teamId` | Team season view — members, ranking entries, non-ranked events |
| `ComparisonPage` | `/compare` | Side-by-side athlete comparison |
| `ComparisonHeroCard` | — | Athlete hero card inside ComparisonPage |
| `HeadToHeadChart` | — | Recharts scatter plot inside ComparisonPage |
| `SharedEventsTable` | — | Shared events table inside ComparisonPage |
| `PredictionsPage` | `/event/:id/predictions` | Start-list predictions for upcoming event |
| `AthleteRankingInfoPage` | `/ranking-info` | Athlete ranking rules — points table, coefficient, scoring rules |
| `TeamRankingInfoPage` | `/teams-info` | Team ranking rules — points table, coefficient, scoring rules |

## TeamProfile member list

Members are built from `teamDetail.events` (all events the team participated in), not from the ranking entries. This is the single source of truth — do not reintroduce a separate ranking-based member list.

- **Category displayed** — most-frequent category across the athlete's 3 most recent races for this team. This handles athletes who change category over time without being thrown off by a single anomalous entry.
- **Podiums counted** — only team ranking podiums (`teamRank ≤ 3` AND athlete `scoring = true`). Individual race top-3 finishes do not count as team podiums.

## Distance colours (`src/utils/distance.ts`)

- Granfondo → blue
- Mediofondo → violet
- Minifondo → emerald

Always use `distBadgeClass(distance)` for pill colours so they stay consistent.

## Styling

Tailwind CSS. No custom CSS except `index.css` (base reset + font). Use `sm:` breakpoint for mobile/desktop layout switches. Use `break-words` on hero headings that may contain long team names.
