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
src/db/decrypt.ts                  Web Crypto AES-256-GCM decrypt
src/db/db-client.ts                Lazy sql.js singleton (getDb())
src/api.ts                         All data-access functions (SQL queries)
src/utils/lookups.ts               In-memory caches: team aliases, athlete name→ID
src/utils/athlete.ts               mostRecentCountry(), buildCountryMap() helpers
src/utils/date.ts                  formatAge() — formats a birth date as an age string
src/utils/distance.ts              distBadgeClass(), distance colour constants
src/hooks/useInfiniteScroll.ts     Infinite scroll hook used by AggregateRankingPage
```

`api.ts` exposes typed async functions (`getEvents`, `getResults`, `getTeamByKey`, `getAggregateRanking`, etc.). Components import only from `api.ts` and never touch sql.js directly.

`initLookups()` must be called once at startup (done in `App.tsx`) to populate the in-memory team alias and athlete lookup caches used by `resolveTeamKey` and `lookupAthleteId`.

## Key rules for team links

Always check `SOLO_TEAM_KEYS.has(normalizeTeam(team))` before rendering a team as a clickable link. Solo keys (`individual`, `independente`, `no team`, `n team`, `sem equipa`, `""`) must never link to a team page. (`"n team"` covers the Scandinavian placeholder "Nøteam" — ø normalises to a space.) This check is required in every component that renders a team name — currently `ResultsTab`, `AthleteProfile`, and `AggregateRankingPage`.

### Two alias resolvers — intentionally different

`resolveTeamKey(name)` in `src/utils/lookups.ts` uses the flat in-memory cache populated by `initLookups()`. It is **one hop only** — alias → canonical. This is used when building navigation URLs from displayed team names (e.g. the team link on an athlete profile).

`getTeamByKey(teamKey)` in `api.ts` resolves the **full alias chain** by looping SQL lookups (up to 10 hops). This handles auto-generated alias chains where A→B→C→canonical. The URL a user arrives at may be any key in the chain; `getTeamByKey` always resolves to the canonical and finds all members.

The discrepancy is intentional: `resolveTeamKey` is synchronous and used for navigation, while `getTeamByKey` is async and does the authoritative lookup.

### TeamProfile loading

`TeamProfile` fires `getTeamRanking()`, `initLookups()`, and `getTeamByKey()` all in parallel in a single `Promise.all`. Do not split these into sequential effects — it causes a visible flicker where results render before members.

`effectiveSeason` is a derived value (`selectedSeason || allSeasons[0] || ""`), not state. This avoids an extra render pass that previously caused the member list to re-sort after initial load. Do not convert it back to a `useEffect`-driven state update.

## Component map

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
| `TeamProfile` | `/team/:teamId` | Team season view — members, ranking entries, non-ranked events |
| `AggregateRankingPage` | `/ranking` | Season athlete ranking with infinite scroll |
| `TeamRankingPage` | `/team-ranking` | Season team ranking |
| `AthletesPage` | `/athletes` | Athlete search |
| `ComparisonPage` | `/compare` | Side-by-side athlete comparison |
| `RankingInfoPage` | `/ranking-info` | Rules explanation |

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
